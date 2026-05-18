import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "@orahai/db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { aiRateLimiter } from "../middleware/rateLimit";
import { AIService } from "../services/ai";

const router = Router();
const aiService = new AIService();

// ── POST /api/ai/chat ─────────────────────────────────────────────────────────
// Streaming chat endpoint

router.post(
  "/chat",
  requireAuth,
  aiRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        message: z.string().min(1).max(32000),
        conversationId: z.string().optional(),
        projectId: z.string().optional(),
        model: z.string().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError("Validation error", 400, parsed.error.errors));
      }

      const { message, conversationId, projectId, model } = parsed.data;

      // Validate project access
      if (projectId) {
        const project = await prisma.project.findFirst({
          where: {
            id: projectId,
            deletedAt: null,
            OR: [
              { ownerId: req.user!.id },
              { organization: { members: { some: { userId: req.user!.id } } } },
            ],
          },
        });
        if (!project) return next(createError("Project not found", 404));
      }

      // Get or create conversation
      let conversation = conversationId
        ? await prisma.aIConversation.findFirst({
            where: { id: conversationId, userId: req.user!.id },
            include: {
              messages: {
                orderBy: { createdAt: "asc" },
                take: 50,
              },
            },
          })
        : null;

      if (conversationId && !conversation) {
        return next(createError("Conversation not found", 404));
      }

      if (!conversation) {
        conversation = await prisma.aIConversation.create({
          data: {
            userId: req.user!.id,
            projectId: projectId ?? null,
            model: model ?? "gpt-4o",
          },
          include: { messages: true },
        });
      }

      // Set up SSE streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const sendEvent = (event: object) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      // Save user message
      await prisma.aIMessage.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          content: message,
        },
      });

      // Get project context if available
      let projectContext = "";
      if (projectId) {
        const files = await prisma.projectFile.findMany({
          where: { projectId, deletedAt: null, isDir: false },
          select: { path: true, content: true, mimeType: true },
          take: 20,
          orderBy: { updatedAt: "desc" },
        });
        projectContext = buildProjectContext(files);
      }

      const history = (conversation.messages ?? []).map((m) => ({
        role: m.role.toLowerCase() as "user" | "assistant" | "system",
        content: m.content,
      }));

      let fullResponse = "";
      let tokenCount = 0;

      try {
        await aiService.streamChat({
          messages: [
            ...history,
            { role: "user", content: message },
          ],
          model: model ?? conversation.model,
          systemPrompt: buildSystemPrompt(projectContext),
          onDelta: (delta: string) => {
            fullResponse += delta;
            sendEvent({ type: "delta", content: delta });
          },
          onDone: (usage: { totalTokens: number }) => {
            tokenCount = usage.totalTokens;
          },
        });
      } catch (aiErr) {
        sendEvent({ type: "error", error: "AI service error" });
        res.end();
        return;
      }

      // Save assistant message
      const savedMsg = await prisma.aIMessage.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: fullResponse,
          tokenCount,
        },
      });

      // Update token count on conversation
      await prisma.aIConversation.update({
        where: { id: conversation.id },
        data: { tokenCount: { increment: tokenCount } },
      });

      sendEvent({
        type: "done",
        conversationId: conversation.id,
        messageId: savedMsg.id,
      });

      res.end();
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/ai/conversations ─────────────────────────────────────────────────

router.get(
  "/conversations",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const conversations = await prisma.aIConversation.findMany({
        where: { userId: req.user!.id },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          model: true,
          projectId: true,
          tokenCount: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
      });
      res.json({ data: conversations });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/ai/conversations/:id ─────────────────────────────────────────────

router.get(
  "/conversations/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const conversation = await prisma.aIConversation.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          tasks: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      });
      if (!conversation) return next(createError("Conversation not found", 404));
      res.json({ data: conversation });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/ai/conversations/:id ─────────────────────────────────────────

router.delete(
  "/conversations/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const conv = await prisma.aIConversation.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
      });
      if (!conv) return next(createError("Conversation not found", 404));

      await prisma.aIConversation.delete({ where: { id: conv.id } });
      res.json({ data: null, message: "Conversation deleted" });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/ai/agent ────────────────────────────────────────────────────────
// Start an agentic task (plan → edit files → run → fix loop)

router.post(
  "/agent",
  requireAuth,
  aiRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        task: z.string().min(1).max(10000),
        projectId: z.string(),
        conversationId: z.string().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError("Validation error", 400, parsed.error.errors));
      }

      const { task, projectId, conversationId } = parsed.data;

      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          deletedAt: null,
          OR: [
            { ownerId: req.user!.id },
            { organization: { members: { some: { userId: req.user!.id } } } },
          ],
        },
      });
      if (!project) return next(createError("Project not found", 404));

      // Create a conversation if needed
      let convId = conversationId;
      if (!convId) {
        const conv = await prisma.aIConversation.create({
          data: {
            userId: req.user!.id,
            projectId,
            title: task.slice(0, 80),
          },
        });
        convId = conv.id;
      }

      // Create agent task record
      const agentTask = await prisma.agentTask.create({
        data: {
          conversationId: convId,
          title: task.slice(0, 200),
          status: "PENDING",
          steps: [],
        },
      });

      // Dispatch to AI service (fire and forget)
      aiService
        .runAgentTask({
          taskId: agentTask.id,
          task,
          projectId,
          userId: req.user!.id,
          conversationId: convId,
        })
        .catch(() => {
          prisma.agentTask
            .update({
              where: { id: agentTask.id },
              data: { status: "FAILED", error: "Agent task failed to start" },
            })
            .catch(() => undefined);
        });

      res.status(202).json({
        data: { taskId: agentTask.id, conversationId: convId },
        message: "Agent task started",
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/ai/agent/:taskId ─────────────────────────────────────────────────

router.get(
  "/agent/:taskId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const agentTask = await prisma.agentTask.findFirst({
        where: {
          id: req.params.taskId,
          conversation: { userId: req.user!.id },
        },
      });
      if (!agentTask) return next(createError("Task not found", 404));
      res.json({ data: agentTask });
    } catch (err) {
      next(err);
    }
  }
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSystemPrompt(projectContext: string): string {
  const base = `You are OrahAI, an expert AI software engineer assistant.
You help developers write, debug, and improve code.
When given code files as context, use them to give precise, accurate answers.
When editing code, output the full modified file content.
Always explain your reasoning briefly before providing code.`;

  if (!projectContext) return base;

  return `${base}\n\n## Project Files\n${projectContext}`;
}

function buildProjectContext(
  files: { path: string; content: string; mimeType: string }[]
): string {
  return files
    .filter((f) => f.content.length < 8000) // Skip very large files
    .map(
      (f) =>
        `### ${f.path}\n\`\`\`${langFromMime(f.mimeType)}\n${f.content}\n\`\`\``
    )
    .join("\n\n");
}

function langFromMime(mime: string): string {
  const map: Record<string, string> = {
    "text/x-python": "python",
    "application/javascript": "javascript",
    "text/typescript": "typescript",
    "text/html": "html",
    "text/css": "css",
    "application/json": "json",
    "text/markdown": "markdown",
    "text/x-go": "go",
    "text/x-rust": "rust",
  };
  return map[mime] ?? "";
}

export default router;

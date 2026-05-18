import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "@orahai/db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { aiRateLimiter } from "../middleware/rateLimit";
import { AIService } from "../services/ai";

const router = Router();

/** Maximum characters of file content sent as AI context (prevents huge prompts) */
const MAX_FILE_CONTEXT_CHARS = 6000;
const aiService = new AIService();

// ── POST /api/ai/chat/:projectId ──────────────────────────────────────────────
// Streaming chat. Context = selected file + last 20 messages.

router.post("/chat/:projectId", requireAuth, aiRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        message: z.string().min(1).max(32000),
        fileContext: z.string().optional(), // selected file content
        filePath: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const { message, fileContext, filePath } = parsed.data;

      // Verify project access
      const project = await prisma.project.findFirst({
        where: {
          id: req.params.projectId, deletedAt: null,
          OR: [
            { ownerId: req.user!.id },
            { workspace: { memberships: { some: { userId: req.user!.id } } } },
          ],
        },
      });
      if (!project) return next(createError("Project not found", 404));

      // Fetch last 20 messages for context
      const history = await prisma.chatMessage.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { role: true, content: true },
      });
      history.reverse();

      // Save user message
      await prisma.chatMessage.create({
        data: {
          projectId: project.id,
          userId: req.user!.id,
          role: "user",
          content: message,
        },
      });

      // Build system prompt
      const systemPrompt = buildSystemPrompt(project.name, project.language, filePath, fileContext);

      // SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);

      let fullContent = "";

      try {
        await aiService.streamChat({
          messages: [
            ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
            { role: "user", content: message },
          ],
          systemPrompt,
          onDelta: (delta) => {
            fullContent += delta;
            send({ type: "delta", content: delta });
          },
          onDone: () => undefined,
        });
      } catch {
        send({ type: "error", error: "AI service unavailable" });
        res.end();
        return;
      }

      // Save assistant message
      const saved = await prisma.chatMessage.create({
        data: { projectId: project.id, role: "assistant", content: fullContent },
      });

      send({ type: "done", messageId: saved.id });
      res.end();
    } catch (err) { next(err); }
  });

// ── GET /api/ai/chat/:projectId ───────────────────────────────────────────────
// Fetch full chat history for a project

router.get("/chat/:projectId", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const project = await prisma.project.findFirst({
        where: {
          id: req.params.projectId, deletedAt: null,
          OR: [
            { ownerId: req.user!.id },
            { workspace: { memberships: { some: { userId: req.user!.id } } } },
          ],
        },
      });
      if (!project) return next(createError("Project not found", 404));

      const messages = await prisma.chatMessage.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: "asc" },
        take: 200,
      });
      res.json({ data: messages });
    } catch (err) { next(err); }
  });

// ── DELETE /api/ai/chat/:projectId ────────────────────────────────────────────
// Clear chat history

router.delete("/chat/:projectId", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const project = await prisma.project.findFirst({
        where: { id: req.params.projectId, ownerId: req.user!.id, deletedAt: null },
      });
      if (!project) return next(createError("Project not found", 404));

      await prisma.chatMessage.deleteMany({ where: { projectId: project.id } });
      res.json({ data: null, message: "Chat history cleared" });
    } catch (err) { next(err); }
  });

// ── helpers ───────────────────────────────────────────────────────────────────

function buildSystemPrompt(
  projectName: string,
  language: string,
  filePath?: string,
  fileContext?: string,
): string {
  let prompt = `You are OrahAI, an expert ${language} developer assistant embedded in a cloud IDE.
The user is working on a project called "${projectName}".
Give concise, correct answers. When writing code, use ${language} idioms.
Format code blocks with the language name.`;

  if (filePath && fileContext) {
    prompt += `\n\nThe user currently has this file open:\n\`\`\`${filePath}\n${fileContext.slice(0, 6000)}\n\`\`\``;
  }
  return prompt;
}

export default router;

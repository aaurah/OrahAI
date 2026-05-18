import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import OpenAI from "openai";
import { db, chatMessages, projects, memberships, files } from "@workspace/db";
import { eq, and, or, isNull, asc, desc, sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { aiRateLimiter } from "../middlewares/rateLimit";
import { cuid } from "../lib/cuid";
import { logger } from "../lib/logger";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

async function assertProjectAccess(projectId: string, userId: string) {
  const memberSubquery = db.select({ workspaceId: memberships.workspaceId })
    .from(memberships).where(eq(memberships.userId, userId));
  const [p] = await db.select().from(projects).where(and(
    eq(projects.id, projectId),
    isNull(projects.deletedAt),
    or(eq(projects.ownerId, userId), sql`${projects.workspaceId} IN (${memberSubquery})`),
  )).limit(1);
  if (!p) throw createError("Project not found", 404);
  return p;
}

router.post("/chat/:projectId", requireAuth, aiRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        message: z.string().min(1).max(32000),
        fileContext: z.string().optional(),
        filePath: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const project = await assertProjectAccess(String(req.params.projectId), req.user!.id);
      const { message, fileContext, filePath } = parsed.data;

      // Load all project files for context
      const projectFiles = await db.select({ path: files.path, content: files.content, mimeType: files.mimeType })
        .from(files)
        .where(and(eq(files.projectId, project.id), isNull(files.deletedAt), eq(files.isDir, false)))
        .orderBy(asc(files.path))
        .limit(60);

      // Load recent chat history
      const history = await db.select({ role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages).where(eq(chatMessages.projectId, project.id))
        .orderBy(desc(chatMessages.createdAt)).limit(20);
      history.reverse();

      await db.insert(chatMessages).values({
        id: cuid(), projectId: project.id, userId: req.user!.id, role: "user", content: message,
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);

      const systemPrompt = buildSystemPrompt(project.name, project.language, projectFiles, filePath, fileContext);

      const chatHistory: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: message },
      ];

      let fullContent = "";

      try {
        const stream = await openai.chat.completions.create({
          model: "gpt-5.1",
          max_completion_tokens: 8192,
          messages: chatHistory,
          stream: true,
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            fullContent += content;
            send({ type: "delta", content });
          }
        }
      } catch (e) {
        logger.warn({ err: e }, "OpenAI error");
        fullContent = "AI service is temporarily unavailable. Please try again.";
        send({ type: "delta", content: fullContent });
      }

      const [saved] = await db.insert(chatMessages).values({
        id: cuid(), projectId: project.id, role: "assistant", content: fullContent,
      }).returning();

      send({ type: "done", messageId: saved.id });
      res.end();
    } catch (err) { next(err); }
  });

router.get("/chat/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await assertProjectAccess(String(req.params.projectId), req.user!.id);
    const messages = await db.select().from(chatMessages)
      .where(eq(chatMessages.projectId, project.id))
      .orderBy(asc(chatMessages.createdAt)).limit(200);
    res.json({ data: messages });
  } catch (err) { next(err); }
});

router.delete("/chat/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, String(req.params.projectId)), eq(projects.ownerId, req.user!.id), isNull(projects.deletedAt))).limit(1);
    if (!project) return next(createError("Project not found", 404));
    await db.delete(chatMessages).where(eq(chatMessages.projectId, project.id));
    res.json({ data: null, message: "Chat history cleared" });
  } catch (err) { next(err); }
});

// ── System prompt builder ──────────────────────────────────────────────────────

function buildSystemPrompt(
  projectName: string,
  language: string,
  projectFiles: { path: string; content: string; mimeType: string }[],
  activeFilePath?: string,
  activeFileContent?: string,
): string {
  const lines: string[] = [
    `You are OrahAI, an expert ${language} developer assistant embedded in a cloud IDE.`,
    `The user is working on a project called "${projectName}" (language: ${language}).`,
    `Give concise, correct answers. When writing code, use ${language} idioms and best practices.`,
    `Format all code with fenced code blocks including the language name.`,
    `When asked to fix or edit code, show only the changed parts with brief explanation.`,
    ``,
  ];

  // Include active file first with full priority
  if (activeFilePath && activeFileContent) {
    lines.push(`## Currently open file: \`${activeFilePath}\``);
    lines.push(`\`\`\`${langFromPath(activeFilePath)}`);
    lines.push(activeFileContent.slice(0, 8000));
    lines.push("```");
    lines.push("");
  }

  // Include all other project files as context
  const otherFiles = projectFiles.filter(f => f.path !== activeFilePath);
  if (otherFiles.length > 0) {
    lines.push("## Project files (full codebase context):");
    let totalChars = 0;
    const MAX_TOTAL = 40000;

    for (const f of otherFiles) {
      if (totalChars >= MAX_TOTAL) {
        lines.push(`\n_(${projectFiles.length - otherFiles.indexOf(f)} more files omitted due to length)_`);
        break;
      }
      const excerpt = f.content.slice(0, 4000);
      const truncated = f.content.length > 4000 ? "… (truncated)" : "";
      lines.push(`\n### \`${f.path}\``);
      lines.push(`\`\`\`${langFromPath(f.path)}`);
      lines.push(excerpt + truncated);
      lines.push("```");
      totalChars += excerpt.length;
    }
  }

  return lines.join("\n");
}

function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    c: "c", cpp: "cpp", cs: "csharp", html: "html", css: "css",
    scss: "scss", json: "json", yaml: "yaml", yml: "yaml",
    md: "markdown", sh: "bash", sql: "sql", toml: "toml",
  };
  return map[ext] ?? ext;
}

export default router;

import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, chatMessages, projects, memberships } from "@workspace/db";
import { eq, and, or, isNull, asc, desc, sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { aiRateLimiter } from "../middlewares/rateLimit";
import { cuid } from "../lib/cuid";
import { logger } from "../lib/logger";

const router = Router();

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

      const aiServiceUrl = process.env.AI_SERVICE_URL;
      let fullContent = "";

      if (aiServiceUrl) {
        try {
          const systemPrompt = buildSystemPrompt(project.name, project.language, filePath, fileContext);
          const aiRes = await fetch(`${aiServiceUrl}/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-key": process.env.AI_SERVICE_INTERNAL_KEY ?? "",
            },
            body: JSON.stringify({
              messages: [
                ...history.map((m) => ({ role: m.role, content: m.content })),
                { role: "user", content: message },
              ],
              system_prompt: systemPrompt,
            }),
          });

          if (!aiRes.ok || !aiRes.body) throw new Error(`AI service error: ${aiRes.status}`);

          const reader = aiRes.body.getReader();
          const dec = new TextDecoder();
          let buf = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n"); buf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              try {
                const evt = JSON.parse(line.slice(6)) as { type: string; content?: string };
                if (evt.type === "delta" && evt.content) { fullContent += evt.content; send(evt); }
                else if (evt.type === "done") break;
              } catch { /* skip */ }
            }
          }
        } catch (e) {
          logger.warn({ err: e }, "AI service error");
          fullContent = "AI service is currently unavailable. Please try again later.";
          send({ type: "delta", content: fullContent });
        }
      } else {
        fullContent = "AI integration is not configured on this server. Set the `AI_SERVICE_URL` environment variable to enable AI chat.";
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
      .where(and(eq(projects.id, req.params.projectId), eq(projects.ownerId, req.user!.id), isNull(projects.deletedAt))).limit(1);
    if (!project) return next(createError("Project not found", 404));
    await db.delete(chatMessages).where(eq(chatMessages.projectId, project.id));
    res.json({ data: null, message: "Chat history cleared" });
  } catch (err) { next(err); }
});

function buildSystemPrompt(projectName: string, language: string, filePath?: string, fileContext?: string): string {
  let prompt = `You are OrahAI, an expert ${language} developer assistant embedded in a cloud IDE.\nThe user is working on a project called "${projectName}".\nGive concise, correct answers. When writing code, use ${language} idioms.\nFormat code blocks with the language name.`;
  if (filePath && fileContext) {
    prompt += `\n\nThe user currently has this file open:\n\`\`\`${filePath}\n${fileContext.slice(0, 6000)}\n\`\`\``;
  }
  return prompt;
}

export default router;

import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, runs, projects, memberships } from "@workspace/db";
import { eq, and, or, isNull, desc, sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { cuid } from "../lib/cuid";
import { logger } from "../lib/logger";

const router = Router();

const ENTRY_POINT: Record<string, string> = {
  nodejs:     "node index.js",
  typescript: "npx ts-node src/index.ts",
  python:     "python main.py",
  html:       "echo 'Open index.html in a browser'",
};

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

router.post("/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await assertProjectAccess(projectId, req.user!.id);
    const schema = z.object({ command: z.string().max(500).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

    const command = parsed.data.command ?? ENTRY_POINT[project.language] ?? "node index.js";
    const runId = cuid();
    const [run] = await db.insert(runs).values({
      id: runId, projectId: project.id, command, status: "queued",
    }).returning();

    const sandboxUrl = process.env.SANDBOX_URL;
    if (sandboxUrl) {
      fetch(`${sandboxUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id, projectId: project.id, command, language: project.language }),
      }).catch(() => {
        db.update(runs).set({ status: "error", output: "Sandbox service unavailable", completedAt: new Date() })
          .where(eq(runs.id, run.id)).catch((e: unknown) => logger.warn({ err: e }, "Failed to update run status"));
      });
    } else {
      await db.update(runs).set({ status: "error", output: "No sandbox service configured.", completedAt: new Date() }).where(eq(runs.id, run.id));
    }

    res.status(202).json({ data: run });
  } catch (err) { next(err); }
});

router.get("/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    await assertProjectAccess(projectId, req.user!.id);
    const rows = await db.select().from(runs).where(eq(runs.projectId, projectId)).orderBy(desc(runs.createdAt)).limit(50);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.get("/:projectId/:runId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    const runId = String(req.params.runId);
    await assertProjectAccess(projectId, req.user!.id);
    const [run] = await db.select().from(runs)
      .where(and(eq(runs.id, runId), eq(runs.projectId, projectId))).limit(1);
    if (!run) return next(createError("Run not found", 404));
    res.json({ data: run });
  } catch (err) { next(err); }
});

router.post("/callback/result", async (req, res, next) => {
  try {
    const schema = z.object({
      runId: z.string(), status: z.enum(["success", "error"]),
      output: z.string(), exitCode: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));
    const [run] = await db.update(runs).set({
      status: parsed.data.status, output: parsed.data.output,
      exitCode: parsed.data.exitCode ?? null, completedAt: new Date(),
    }).where(eq(runs.id, parsed.data.runId)).returning();
    res.json({ data: run });
  } catch (err) { next(err); }
});

export default router;

import { logger } from "../utils/logger";
import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "@orahai/db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";

const router = Router();

const ENTRY_POINT: Record<string, string> = {
  nodejs:     "node index.js",
  typescript: "npx ts-node src/index.ts",
  python:     "python main.py",
  html:       "echo 'Open index.html in a browser'",
};

async function assertProjectAccess(projectId: string, userId: string) {
  const p = await prisma.project.findFirst({
    where: {
      id: projectId, deletedAt: null,
      OR: [{ ownerId: userId }, { workspace: { memberships: { some: { userId } } } }],
    },
  });
  if (!p) throw createError("Project not found", 404);
  return p;
}

// ── POST /api/runs/:projectId ─────────────────────────────────────────────────
// Creates a Run record; actual execution delegated to sandbox service via HTTP

router.post("/:projectId", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const project = await assertProjectAccess(req.params.projectId, req.user!.id);

      const schema = z.object({ command: z.string().max(500).optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const command = parsed.data.command ?? ENTRY_POINT[project.language] ?? "node index.js";

      const run = await prisma.run.create({
        data: { projectId: project.id, command, status: "queued" },
      });

      // Forward to sandbox service (fire-and-forget; sandbox POSTs status back)
      const sandboxUrl = process.env.SANDBOX_URL ?? "http://localhost:5000";
      fetch(`${sandboxUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id, projectId: project.id, command, language: project.language }),
      }).catch(() => {
        // Mark failed if sandbox unreachable
        prisma.run.update({ where: { id: run.id }, data: { status: "error", output: "Sandbox service unavailable" } }).catch((e: unknown) => logger.warn("Failed to update run status:", e));
      });

      res.status(202).json({ data: run });
    } catch (err) { next(err); }
  });

// ── GET /api/runs/:projectId ──────────────────────────────────────────────────
router.get("/:projectId", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await assertProjectAccess(req.params.projectId, req.user!.id);
      const runs = await prisma.run.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      res.json({ data: runs });
    } catch (err) { next(err); }
  });

// ── GET /api/runs/:projectId/:runId ──────────────────────────────────────────
router.get("/:projectId/:runId", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await assertProjectAccess(req.params.projectId, req.user!.id);
      const run = await prisma.run.findFirst({
        where: { id: req.params.runId, projectId: req.params.projectId },
      });
      if (!run) return next(createError("Run not found", 404));
      res.json({ data: run });
    } catch (err) { next(err); }
  });

// ── POST /api/runs/callback ────────────────────────────────────────────────────
// Called BY the sandbox service to post results back
router.post("/callback/result", async (req, res, next) => {
  try {
    const schema = z.object({
      runId: z.string(),
      status: z.enum(["success", "error"]),
      output: z.string(),
      exitCode: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

    const run = await prisma.run.update({
      where: { id: parsed.data.runId },
      data: {
        status: parsed.data.status,
        output: parsed.data.output,
        exitCode: parsed.data.exitCode ?? null,
        completedAt: new Date(),
      },
    });
    res.json({ data: run });
  } catch (err) { next(err); }
});

export default router;

import { Router, Response, NextFunction } from "express";
import { prisma } from "@orahai/db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { auditLog } from "../middleware/audit";
import { WorkspaceService } from "../services/workspace";

const router = Router();
const workspaceService = new WorkspaceService();

// ── GET /api/workspaces/:projectId ────────────────────────────────────────────

router.get(
  "/:projectId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const workspaces = await prisma.workspace.findMany({
        where: {
          projectId: req.params.projectId,
          userId: req.user!.id,
        },
        orderBy: { createdAt: "desc" },
      });
      res.json({ data: workspaces });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/workspaces/:projectId/start ─────────────────────────────────────

router.post(
  "/:projectId/start",
  requireAuth,
  auditLog("workspace.start", "workspace"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const project = await prisma.project.findFirst({
        where: {
          id: req.params.projectId,
          deletedAt: null,
          OR: [
            { ownerId: req.user!.id },
            { organization: { members: { some: { userId: req.user!.id } } } },
          ],
        },
      });

      if (!project) return next(createError("Project not found", 404));

      // Check for existing running workspace
      const existing = await prisma.workspace.findFirst({
        where: {
          projectId: project.id,
          userId: req.user!.id,
          status: { in: ["RUNNING", "STARTING"] },
        },
      });

      if (existing) {
        return res.json({
          data: existing,
          message: "Workspace already running",
        });
      }

      const workspace = await workspaceService.createAndStart(
        project,
        req.user!.id
      );

      res.status(201).json({ data: workspace, message: "Workspace starting" });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/workspaces/:id/stop ─────────────────────────────────────────────

router.post(
  "/:id/stop",
  requireAuth,
  auditLog("workspace.stop", "workspace"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const workspace = await prisma.workspace.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
      });

      if (!workspace) return next(createError("Workspace not found", 404));

      await workspaceService.stop(workspace.id);

      res.json({ data: null, message: "Workspace stopping" });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/workspaces/:id/run ──────────────────────────────────────────────

router.post(
  "/:id/run",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const workspace = await prisma.workspace.findFirst({
        where: { id: req.params.id, userId: req.user!.id, status: "RUNNING" },
      });

      if (!workspace) return next(createError("Workspace not running", 404));

      const { command } = req.body as { command?: string };
      if (!command) return next(createError("`command` is required", 400));

      const result = await workspaceService.exec(workspace, command);

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/workspaces/:id/logs ──────────────────────────────────────────────

router.get(
  "/:id/logs",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const workspace = await prisma.workspace.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
      });
      if (!workspace) return next(createError("Workspace not found", 404));

      const limit = Math.min(
        500,
        parseInt((req.query.limit as string) ?? "100", 10)
      );

      const logs = await prisma.workspaceLog.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      res.json({ data: logs.reverse() });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/workspaces/:id/status ────────────────────────────────────────────

router.get(
  "/:id/status",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const workspace = await prisma.workspace.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
        select: {
          id: true,
          status: true,
          cpuUsage: true,
          memoryUsage: true,
          previewUrl: true,
          startedAt: true,
        },
      });
      if (!workspace) return next(createError("Workspace not found", 404));
      res.json({ data: workspace });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

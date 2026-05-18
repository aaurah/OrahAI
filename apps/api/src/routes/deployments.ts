import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "@orahai/db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { auditLog } from "../middleware/audit";
import { DeploymentService } from "../services/deployment";

const router = Router();
const deploymentService = new DeploymentService();

const deploySchema = z.object({
  projectId: z.string(),
  environment: z.enum(["PREVIEW", "STAGING", "PRODUCTION"]).default("PRODUCTION"),
  commitSha: z.string().optional(),
  commitMsg: z.string().optional(),
});

// ── GET /api/deployments ──────────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
      const perPage = Math.min(50, parseInt((req.query.perPage as string) ?? "20", 10));

      const where = {
        userId: req.user!.id,
        ...(projectId ? { projectId } : {}),
      };

      const [total, deployments] = await Promise.all([
        prisma.deployment.count({ where }),
        prisma.deployment.findMany({
          where,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { createdAt: "desc" },
          include: {
            project: { select: { id: true, name: true, slug: true } },
          },
        }),
      ]);

      res.json({
        data: deployments,
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/deployments ─────────────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  auditLog("deployment.create", "deployment"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = deploySchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError("Validation error", 400, parsed.error.errors));
      }

      const { projectId, environment, commitSha, commitMsg } = parsed.data;

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

      const deployment = await deploymentService.deploy({
        project,
        userId: req.user!.id,
        environment,
        commitSha,
        commitMsg,
      });

      res.status(202).json({ data: deployment, message: "Deployment started" });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/deployments/:id ──────────────────────────────────────────────────

router.get(
  "/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const deployment = await prisma.deployment.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
        include: {
          project: { select: { id: true, name: true, slug: true } },
        },
      });
      if (!deployment) return next(createError("Deployment not found", 404));
      res.json({ data: deployment });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/deployments/:id/cancel ─────────────────────────────────────────

router.post(
  "/:id/cancel",
  requireAuth,
  auditLog("deployment.cancel", "deployment"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const deployment = await prisma.deployment.findFirst({
        where: {
          id: req.params.id,
          userId: req.user!.id,
          status: { in: ["PENDING", "BUILDING", "DEPLOYING"] },
        },
      });
      if (!deployment) return next(createError("Active deployment not found", 404));

      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: "CANCELLED", finishedAt: new Date() },
      });

      res.json({ data: null, message: "Deployment cancelled" });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/deployments/:id/rollback ────────────────────────────────────────

router.post(
  "/:id/rollback",
  requireAuth,
  auditLog("deployment.rollback", "deployment"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const deployment = await prisma.deployment.findFirst({
        where: {
          id: req.params.id,
          userId: req.user!.id,
          status: "SUCCEEDED",
        },
        include: {
          project: true,
        },
      });
      if (!deployment) return next(createError("Succeeded deployment not found", 404));

      const rollback = await deploymentService.deploy({
        project: deployment.project,
        userId: req.user!.id,
        environment: deployment.environment as "PREVIEW" | "STAGING" | "PRODUCTION",
        commitSha: deployment.commitSha ?? undefined,
        commitMsg: `Rollback to ${deployment.version}`,
      });

      // Mark original as rolled back
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: "ROLLED_BACK" },
      });

      res.status(202).json({ data: rollback, message: "Rollback started" });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

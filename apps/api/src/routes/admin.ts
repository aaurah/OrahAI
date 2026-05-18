import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "@orahai/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { auditLog } from "../middleware/audit";

const router = Router();

// All admin routes require auth + ADMIN role
router.use(requireAuth, requireRole("ADMIN", "SUPER_ADMIN"));

// ── GET /api/admin/users ──────────────────────────────────────────────────────

router.get(
  "/users",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
      const perPage = Math.min(100, parseInt((req.query.perPage as string) ?? "20", 10));
      const search = req.query.search as string | undefined;

      const where = {
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" as const } },
                { username: { contains: search, mode: "insensitive" as const } },
                { name: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            avatarUrl: true,
            role: true,
            plan: true,
            createdAt: true,
            _count: { select: { projects: true, workspaces: true } },
          },
        }),
      ]);

      res.json({ data: users, total, page, perPage, totalPages: Math.ceil(total / perPage) });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /api/admin/users/:id ────────────────────────────────────────────────

router.patch(
  "/users/:id",
  auditLog("admin.user.update", "user"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        role: z.enum(["FREE", "PRO", "TEAM", "ADMIN"]).optional(),
        plan: z.enum(["FREE", "PRO", "TEAM", "ENTERPRISE"]).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError("Validation error", 400, parsed.error.errors));
      }

      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: parsed.data,
        select: { id: true, email: true, username: true, role: true, plan: true },
      });

      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────

router.delete(
  "/users/:id",
  auditLog("admin.user.delete", "user"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Cannot delete self
      if (req.params.id === req.user!.id) {
        return next(createError("Cannot delete your own account via admin", 400));
      }

      await prisma.user.update({
        where: { id: req.params.id },
        data: { deletedAt: new Date() },
      });

      res.json({ data: null, message: "User deactivated" });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/admin/stats ──────────────────────────────────────────────────────

router.get(
  "/stats",
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const [
        totalUsers,
        activeUsers,
        totalProjects,
        totalDeployments,
        runningWorkspaces,
      ] = await Promise.all([
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.user.count({
          where: {
            deletedAt: null,
            sessions: { some: { expires: { gte: new Date() } } },
          },
        }),
        prisma.project.count({ where: { deletedAt: null } }),
        prisma.deployment.count(),
        prisma.workspace.count({ where: { status: "RUNNING" } }),
      ]);

      res.json({
        data: {
          totalUsers,
          activeUsers,
          totalProjects,
          totalDeployments,
          runningWorkspaces,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/admin/audit-logs ─────────────────────────────────────────────────

router.get(
  "/audit-logs",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
      const perPage = Math.min(100, parseInt((req.query.perPage as string) ?? "50", 10));

      const [total, logs] = await Promise.all([
        prisma.auditLog.count(),
        prisma.auditLog.findMany({
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, username: true, email: true } },
          },
        }),
      ]);

      res.json({ data: logs, total, page, perPage, totalPages: Math.ceil(total / perPage) });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/admin/organizations ──────────────────────────────────────────────

router.get(
  "/organizations",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orgs = await prisma.organization.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { members: true, projects: true } },
        },
      });
      res.json({ data: orgs });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

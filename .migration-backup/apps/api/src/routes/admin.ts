import { Router, Response, NextFunction } from "express";
import { prisma } from "@orahai/db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";

const router = Router();

// Very basic admin route — for MVP just returns aggregate counts
// A proper RBAC system is Phase 3

router.get("/stats", requireAuth,
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const [users, workspaces, projects, runs] = await Promise.all([
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.workspace.count({ where: { deletedAt: null } }),
        prisma.project.count({ where: { deletedAt: null } }),
        prisma.run.count(),
      ]);
      res.json({ data: { users, workspaces, projects, runs } });
    } catch (err) { next(err); }
  });

router.get("/users", requireAuth,
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const users = await prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true, email: true, name: true, username: true, createdAt: true,
          memberships: { select: { role: true, workspace: { select: { id: true, name: true } } } },
          _count: { select: { projects: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      res.json({ data: users });
    } catch (err) { next(err); }
  });

export default router;

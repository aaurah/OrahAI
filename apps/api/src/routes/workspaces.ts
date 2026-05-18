import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "@orahai/db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";

const router = Router();

// ── GET /api/workspaces ───────────────────────────────────────────────────────
// List workspaces the current user belongs to

router.get("/", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const memberships = await prisma.membership.findMany({
        where: { userId: req.user!.id },
        include: {
          workspace: { select: { id: true, name: true, slug: true, description: true, avatarUrl: true, createdAt: true, updatedAt: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      const workspaces = memberships.map((m) => ({
        ...m.workspace,
        role: m.role,
      }));

      res.json({ data: workspaces });
    } catch (err) { next(err); }
  });

// ── POST /api/workspaces ──────────────────────────────────────────────────────
// Create a workspace; creator becomes owner

router.post("/", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(80),
        description: z.string().max(300).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const slug = await uniqueSlug(parsed.data.name);

      const workspace = await prisma.workspace.create({
        data: {
          name: parsed.data.name,
          slug,
          description: parsed.data.description ?? null,
          memberships: {
            create: { userId: req.user!.id, role: "owner" },
          },
        },
      });

      res.status(201).json({ data: { ...workspace, role: "owner" }, message: "Workspace created" });
    } catch (err) { next(err); }
  });

// ── GET /api/workspaces/:id ───────────────────────────────────────────────────

router.get("/:id", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const membership = await prisma.membership.findFirst({
        where: { workspaceId: req.params.id, userId: req.user!.id },
        include: { workspace: true },
      });
      if (!membership) return next(createError("Workspace not found", 404));
      res.json({ data: { ...membership.workspace, role: membership.role } });
    } catch (err) { next(err); }
  });

// ── PATCH /api/workspaces/:id ─────────────────────────────────────────────────

router.patch("/:id", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await assertWorkspaceRole(req.params.id, req.user!.id, ["owner", "admin"]);

      const schema = z.object({
        name: z.string().min(1).max(80).optional(),
        description: z.string().max(300).optional().nullable(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const workspace = await prisma.workspace.update({
        where: { id: req.params.id },
        data: parsed.data,
      });
      res.json({ data: workspace });
    } catch (err) { next(err); }
  });

// ── DELETE /api/workspaces/:id ────────────────────────────────────────────────

router.delete("/:id", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await assertWorkspaceRole(req.params.id, req.user!.id, ["owner"]);
      await prisma.workspace.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
      res.json({ data: null, message: "Workspace deleted" });
    } catch (err) { next(err); }
  });

// ── GET /api/workspaces/:id/members ──────────────────────────────────────────

router.get("/:id/members", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await assertWorkspaceRole(req.params.id, req.user!.id, ["owner", "admin", "member"]);
      const members = await prisma.membership.findMany({
        where: { workspaceId: req.params.id },
        include: { user: { select: { id: true, email: true, name: true, username: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      });
      res.json({ data: members });
    } catch (err) { next(err); }
  });

// ── POST /api/workspaces/:id/members ─────────────────────────────────────────
// Invite (add) a member by email

router.post("/:id/members", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await assertWorkspaceRole(req.params.id, req.user!.id, ["owner", "admin"]);

      const schema = z.object({
        email: z.string().email(),
        role: z.enum(["admin", "member"]).default("member"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      if (!user) return next(createError("User not found", 404));

      const existing = await prisma.membership.findUnique({
        where: { userId_workspaceId: { userId: user.id, workspaceId: req.params.id } },
      });
      if (existing) return next(createError("User is already a member", 409));

      const member = await prisma.membership.create({
        data: { userId: user.id, workspaceId: req.params.id, role: parsed.data.role },
        include: { user: { select: { id: true, email: true, name: true, username: true, avatarUrl: true } } },
      });
      res.status(201).json({ data: member });
    } catch (err) { next(err); }
  });

// ── DELETE /api/workspaces/:id/members/:userId ────────────────────────────────

router.delete("/:id/members/:userId", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Can remove self, or owner/admin can remove others
      const isSelf = req.params.userId === req.user!.id;
      if (!isSelf) await assertWorkspaceRole(req.params.id, req.user!.id, ["owner", "admin"]);

      await prisma.membership.deleteMany({
        where: { userId: req.params.userId, workspaceId: req.params.id },
      });
      res.json({ data: null, message: "Member removed" });
    } catch (err) { next(err); }
  });

// ── helpers ───────────────────────────────────────────────────────────────────

async function assertWorkspaceRole(workspaceId: string, userId: string, allowed: string[]) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!m) throw createError("Workspace not found", 404);
  if (!allowed.includes(m.role)) throw createError("Insufficient permissions", 403);
  return m;
}

async function uniqueSlug(name: string): Promise<string> {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
  if (!base) base = "workspace";
  let slug = base;
  let i = 1;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

export default router;

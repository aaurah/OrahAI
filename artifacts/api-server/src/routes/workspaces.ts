import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, workspaces, memberships, users } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { cuid } from "../lib/cuid";

const router = Router();

async function assertWorkspaceRole(workspaceId: string, userId: string, allowed: string[]) {
  const [m] = await db.select().from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.workspaceId, workspaceId)))
    .limit(1);
  if (!m) throw createError("Workspace not found", 404);
  if (!allowed.includes(m.role)) throw createError("Insufficient permissions", 403);
  return m;
}

async function uniqueSlug(name: string): Promise<string> {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
  if (!base) base = "workspace";
  let slug = base;
  let i = 1;
  while ((await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, slug)).limit(1)).length > 0) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await db
      .select({
        id: workspaces.id, name: workspaces.name, slug: workspaces.slug,
        description: workspaces.description, avatarUrl: workspaces.avatarUrl,
        createdAt: workspaces.createdAt, updatedAt: workspaces.updatedAt,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(workspaces, and(eq(memberships.workspaceId, workspaces.id), isNull(workspaces.deletedAt)))
      .where(eq(memberships.userId, req.user!.id));
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ name: z.string().min(1).max(80), description: z.string().max(300).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

    const slug = await uniqueSlug(parsed.data.name);
    const wsId = cuid();
    const [workspace] = await db.insert(workspaces).values({
      id: wsId, name: parsed.data.name, slug, description: parsed.data.description ?? null,
    }).returning();
    await db.insert(memberships).values({ id: cuid(), userId: req.user!.id, workspaceId: wsId, role: "owner" });
    res.status(201).json({ data: { ...workspace, role: "owner" }, message: "Workspace created" });
  } catch (err) { next(err); }
});

router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const rows = await db
      .select({ workspace: workspaces, role: memberships.role })
      .from(memberships)
      .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
      .where(and(eq(memberships.workspaceId, id), eq(memberships.userId, req.user!.id)))
      .limit(1);
    if (!rows[0]) return next(createError("Workspace not found", 404));
    res.json({ data: { ...rows[0].workspace, role: rows[0].role } });
  } catch (err) { next(err); }
});

router.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    await assertWorkspaceRole(id, req.user!.id, ["owner", "admin"]);
    const schema = z.object({ name: z.string().min(1).max(80).optional(), description: z.string().max(300).optional().nullable() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));
    const [ws] = await db.update(workspaces).set({ ...parsed.data, updatedAt: new Date() }).where(eq(workspaces.id, id)).returning();
    res.json({ data: ws });
  } catch (err) { next(err); }
});

router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    await assertWorkspaceRole(id, req.user!.id, ["owner"]);
    await db.update(workspaces).set({ deletedAt: new Date() }).where(eq(workspaces.id, id));
    res.json({ data: null, message: "Workspace deleted" });
  } catch (err) { next(err); }
});

router.get("/:id/members", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    await assertWorkspaceRole(id, req.user!.id, ["owner", "admin", "member"]);
    const rows = await db
      .select({ id: memberships.id, role: memberships.role, createdAt: memberships.createdAt,
        user: { id: users.id, email: users.email, name: users.name, username: users.username, avatarUrl: users.avatarUrl } })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.workspaceId, id));
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.post("/:id/members", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    await assertWorkspaceRole(id, req.user!.id, ["owner", "admin"]);
    const schema = z.object({ email: z.string().email(), role: z.enum(["admin", "member"]).default("member") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));
    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (!user) return next(createError("User not found", 404));
    const [existing] = await db.select().from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.workspaceId, id))).limit(1);
    if (existing) return next(createError("User is already a member", 409));
    const [member] = await db.insert(memberships).values({ id: cuid(), userId: user.id, workspaceId: id, role: parsed.data.role }).returning();
    res.status(201).json({ data: { ...member, user: { id: user.id, email: user.email, name: user.name, username: user.username, avatarUrl: user.avatarUrl } } });
  } catch (err) { next(err); }
});

router.delete("/:id/members/:userId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const userId = String(req.params.userId);
    const isSelf = userId === req.user!.id;
    if (!isSelf) await assertWorkspaceRole(id, req.user!.id, ["owner", "admin"]);
    await db.delete(memberships).where(and(eq(memberships.userId, userId), eq(memberships.workspaceId, id)));
    res.json({ data: null, message: "Member removed" });
  } catch (err) { next(err); }
});

export default router;

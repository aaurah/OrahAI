import { Router, type Response, type NextFunction } from "express";
import { db, users, projects, files, runs, chatMessages, memberships } from "@workspace/db";
import { eq, isNull, ilike, desc, sql, and, count } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { z } from "zod";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/stats", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [userCount] = await db.select({ total: count() }).from(users).where(isNull(users.deletedAt));
    const [projectCount] = await db.select({ total: count() }).from(projects).where(isNull(projects.deletedAt));
    const [fileCount] = await db.select({ total: count() }).from(files).where(isNull(files.deletedAt));
    const [runCount] = await db.select({ total: count() }).from(runs);
    const [chatCount] = await db.select({ total: count() }).from(chatMessages);
    const [successRuns] = await db.select({ total: count() }).from(runs).where(eq(runs.status, "success"));
    const [errorRuns] = await db.select({ total: count() }).from(runs).where(eq(runs.status, "error"));

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [newUsers30] = await db.select({ total: count() }).from(users)
      .where(and(isNull(users.deletedAt), sql`${users.createdAt} > ${thirtyDaysAgo}`));
    const [newProjects30] = await db.select({ total: count() }).from(projects)
      .where(and(isNull(projects.deletedAt), sql`${projects.createdAt} > ${thirtyDaysAgo}`));

    res.json({
      data: {
        users: { total: userCount.total, new30Days: newUsers30.total },
        projects: { total: projectCount.total, new30Days: newProjects30.total },
        files: { total: fileCount.total },
        runs: { total: runCount.total, success: successRuns.total, error: errorRuns.total },
        chats: { total: chatCount.total },
      },
    });
  } catch (err) { next(err); }
});

router.get("/users", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string ?? "20", 10)));
    const offset = (page - 1) * limit;

    const conditions = [isNull(users.deletedAt)];
    if (search) {
      conditions.push(sql`(${ilike(users.email, `%${search}%`)} OR ${ilike(users.username, `%${search}%`)} OR ${ilike(users.name ?? users.username, `%${search}%`)})`  as ReturnType<typeof eq>);
    }

    const [{ total }] = await db.select({ total: count() }).from(users).where(and(...conditions));
    const rows = await db.select({
      id: users.id, email: users.email, name: users.name, username: users.username,
      avatarUrl: users.avatarUrl, isAdmin: users.isAdmin, isFreeAccess: users.isFreeAccess,
      createdAt: users.createdAt,
    }).from(users).where(and(...conditions)).orderBy(desc(users.createdAt)).limit(limit).offset(offset);

    const withCounts = await Promise.all(rows.map(async (u) => {
      const [pc] = await db.select({ count: count() }).from(projects)
        .where(and(eq(projects.ownerId, u.id), isNull(projects.deletedAt)));
      return { ...u, projectCount: pc.count };
    }));

    res.json({ data: { users: withCounts, total, page, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

router.delete("/users/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    if (id === req.user!.id) return next(createError("Cannot delete your own account from admin panel", 400));
    const [user] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1);
    if (!user) return next(createError("User not found", 404));
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
    res.json({ data: null, message: "User deleted" });
  } catch (err) { next(err); }
});

router.patch("/users/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const schema = z.object({ name: z.string().optional(), bio: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400));
    const [updated] = await db.update(users).set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(users.id, id)).returning({ id: users.id, email: users.email, name: users.name, username: users.username });
    if (!updated) return next(createError("User not found", 404));
    res.json({ data: updated });
  } catch (err) { next(err); }
});

router.post("/users/:id/grant-admin", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const [user] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1);
    if (!user) return next(createError("User not found", 404));
    await db.update(users).set({ isAdmin: true, updatedAt: new Date() }).where(eq(users.id, id));
    res.json({ data: null, message: "Admin granted" });
  } catch (err) { next(err); }
});

router.post("/users/:id/revoke-admin", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    if (id === req.user!.id) return next(createError("Cannot revoke your own admin access", 400));
    const [user] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1);
    if (!user) return next(createError("User not found", 404));
    await db.update(users).set({ isAdmin: false, updatedAt: new Date() }).where(eq(users.id, id));
    res.json({ data: null, message: "Admin revoked" });
  } catch (err) { next(err); }
});

router.post("/users/:id/grant-free", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const [user] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1);
    if (!user) return next(createError("User not found", 404));
    await db.update(users).set({ isFreeAccess: true, updatedAt: new Date() }).where(eq(users.id, id));
    res.json({ data: null, message: "Free access granted" });
  } catch (err) { next(err); }
});

router.post("/users/:id/revoke-free", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const [user] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1);
    if (!user) return next(createError("User not found", 404));
    await db.update(users).set({ isFreeAccess: false, updatedAt: new Date() }).where(eq(users.id, id));
    res.json({ data: null, message: "Free access revoked" });
  } catch (err) { next(err); }
});

router.get("/projects", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const language = req.query.language as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string ?? "20", 10)));
    const offset = (page - 1) * limit;

    const conditions = [isNull(projects.deletedAt) as ReturnType<typeof eq>];
    if (search) conditions.push(ilike(projects.name, `%${search}%`) as ReturnType<typeof eq>);
    if (language) conditions.push(eq(projects.language, language) as ReturnType<typeof eq>);

    const [{ total }] = await db.select({ total: count() }).from(projects).where(and(...conditions));
    const rows = await db.select({
      id: projects.id, name: projects.name, description: projects.description,
      language: projects.language, isPublic: projects.isPublic,
      ownerId: projects.ownerId, createdAt: projects.createdAt, updatedAt: projects.updatedAt,
    }).from(projects).where(and(...conditions)).orderBy(desc(projects.createdAt)).limit(limit).offset(offset);

    const withInfo = await Promise.all(rows.map(async (p) => {
      const [owner] = await db.select({ email: users.email, username: users.username })
        .from(users).where(eq(users.id, p.ownerId)).limit(1);
      const [fc] = await db.select({ count: count() }).from(files)
        .where(and(eq(files.projectId, p.id), isNull(files.deletedAt)));
      const [rc] = await db.select({ count: count() }).from(runs).where(eq(runs.projectId, p.id));
      return { ...p, owner: owner ?? null, fileCount: fc.count, runCount: rc.count };
    }));

    res.json({ data: { projects: withInfo, total, page, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

router.delete("/projects/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const [p] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, id), isNull(projects.deletedAt))).limit(1);
    if (!p) return next(createError("Project not found", 404));
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, id));
    res.json({ data: null, message: "Project deleted" });
  } catch (err) { next(err); }
});

router.get("/runs", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit as string ?? "30", 10));
    const rows = await db.select({
      id: runs.id, projectId: runs.projectId, command: runs.command,
      status: runs.status, exitCode: runs.exitCode,
      startedAt: runs.startedAt, completedAt: runs.completedAt, createdAt: runs.createdAt,
    }).from(runs).orderBy(desc(runs.createdAt)).limit(limit);

    const withProject = await Promise.all(rows.map(async (r) => {
      const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, r.projectId)).limit(1);
      return { ...r, projectName: p?.name ?? "Unknown" };
    }));

    res.json({ data: withProject });
  } catch (err) { next(err); }
});

// ── Data Reset ────────────────────────────────────────────────────────────────

router.post("/reset", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      clearRuns:  z.boolean().default(true),
      clearChats: z.boolean().default(true),
      clearFiles: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400));

    const { clearRuns: doRuns, clearChats: doChats, clearFiles: doFiles } = parsed.data;

    const deleted: Record<string, number> = {};

    if (doRuns) {
      const result = await db.delete(runs).returning({ id: runs.id });
      deleted.runs = result.length;
    }

    if (doChats) {
      const result = await db.delete(chatMessages).returning({ id: chatMessages.id });
      deleted.chatMessages = result.length;
    }

    if (doFiles) {
      const result = await db.update(files)
        .set({ deletedAt: new Date() })
        .where(isNull(files.deletedAt))
        .returning({ id: files.id });
      deleted.files = result.length;
    }

    res.json({ data: deleted, message: "Reset complete" });
  } catch (err) { next(err); }
});

export default router;

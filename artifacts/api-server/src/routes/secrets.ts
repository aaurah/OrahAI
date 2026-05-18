import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, projects, projectSecrets, memberships } from "@workspace/db";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { cuid } from "../lib/cuid";

const router = Router();
router.use(requireAuth);

async function assertProjectAccess(projectId: string, userId: string) {
  const memberSubquery = db.select({ workspaceId: memberships.workspaceId })
    .from(memberships).where(eq(memberships.userId, userId));
  const [p] = await db.select().from(projects)
    .where(and(
      eq(projects.id, projectId),
      isNull(projects.deletedAt),
      or(eq(projects.ownerId, userId), sql`${projects.workspaceId} IN (${memberSubquery})`),
    )).limit(1);
  if (!p) throw createError("Project not found", 404);
  return p;
}

router.get("/:projectId/secrets", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await assertProjectAccess(req.params.projectId, req.user!.id);
    const rows = await db.select().from(projectSecrets)
      .where(eq(projectSecrets.projectId, req.params.projectId));
    res.json({ data: rows.map(r => ({ ...r, value: r.value ? "••••••••" : "" })) });
  } catch (err) { next(err); }
});

router.get("/:projectId/secrets/:id/reveal", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await assertProjectAccess(req.params.projectId, req.user!.id);
    const [row] = await db.select().from(projectSecrets)
      .where(and(eq(projectSecrets.id, req.params.id), eq(projectSecrets.projectId, req.params.projectId)))
      .limit(1);
    if (!row) return next(createError("Secret not found", 404));
    res.json({ data: { value: row.value } });
  } catch (err) { next(err); }
});

router.post("/:projectId/secrets", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await assertProjectAccess(req.params.projectId, req.user!.id);
    const schema = z.object({ key: z.string().min(1).max(256).regex(/^[A-Z_][A-Z0-9_]*$/i, "Key must be alphanumeric with underscores"), value: z.string().max(8192) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.errors[0]?.message ?? "Validation error", 400));
    const existing = await db.select({ id: projectSecrets.id }).from(projectSecrets)
      .where(and(eq(projectSecrets.projectId, req.params.projectId), eq(projectSecrets.key, parsed.data.key))).limit(1);
    if (existing.length) return next(createError("A secret with this key already exists", 409));
    const [row] = await db.insert(projectSecrets).values({
      id: cuid(), projectId: req.params.projectId, key: parsed.data.key, value: parsed.data.value,
    }).returning();
    res.status(201).json({ data: { ...row, value: row.value ? "••••••••" : "" } });
  } catch (err) { next(err); }
});

router.patch("/:projectId/secrets/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await assertProjectAccess(req.params.projectId, req.user!.id);
    const schema = z.object({ value: z.string().max(8192) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400));
    const [row] = await db.update(projectSecrets)
      .set({ value: parsed.data.value, updatedAt: new Date() })
      .where(and(eq(projectSecrets.id, req.params.id), eq(projectSecrets.projectId, req.params.projectId)))
      .returning();
    if (!row) return next(createError("Secret not found", 404));
    res.json({ data: { ...row, value: row.value ? "••••••••" : "" } });
  } catch (err) { next(err); }
});

router.delete("/:projectId/secrets/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await assertProjectAccess(req.params.projectId, req.user!.id);
    await db.delete(projectSecrets)
      .where(and(eq(projectSecrets.id, req.params.id), eq(projectSecrets.projectId, req.params.projectId)));
    res.json({ data: null, message: "Secret deleted" });
  } catch (err) { next(err); }
});

export default router;

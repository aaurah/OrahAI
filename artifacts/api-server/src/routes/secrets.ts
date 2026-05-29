import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, projects, projectSecrets } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { cuid } from "../lib/cuid";

const router = Router();
router.use(requireAuth);

async function assertProjectOwner(projectId: string, userId: string) {
  const [p] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt), eq(projects.ownerId, userId)))
    .limit(1);
  if (!p) throw createError("Project not found or insufficient permissions", 403);
  return p;
}

router.get("/:projectId/secrets", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    await assertProjectOwner(projectId, req.user!.id);
    const rows = await db.select().from(projectSecrets)
      .where(eq(projectSecrets.projectId, projectId));
    res.json({ data: rows.map(r => ({ ...r, value: r.value ? "••••••••" : "" })) });
  } catch (err) { next(err); }
});

router.get("/:projectId/secrets/:id/reveal", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    const id = String(req.params["id"]);
    await assertProjectOwner(projectId, req.user!.id);
    const [row] = await db.select().from(projectSecrets)
      .where(and(eq(projectSecrets.id, id), eq(projectSecrets.projectId, projectId)))
      .limit(1);
    if (!row) return next(createError("Secret not found", 404));
    res.json({ data: { value: row.value } });
  } catch (err) { next(err); }
});

router.post("/:projectId/secrets", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    await assertProjectOwner(projectId, req.user!.id);
    const schema = z.object({
      key: z.string().min(1).max(256).regex(/^[A-Z_][A-Z0-9_]*$/i, "Key must be alphanumeric with underscores"),
      value: z.string().max(8192),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.errors[0]?.message ?? "Validation error", 400));
    const existing = await db.select({ id: projectSecrets.id }).from(projectSecrets)
      .where(and(eq(projectSecrets.projectId, projectId), eq(projectSecrets.key, parsed.data.key))).limit(1);
    if (existing.length) return next(createError("A secret with this key already exists", 409));
    const [row] = await db.insert(projectSecrets).values({
      id: cuid(), projectId, key: parsed.data.key, value: parsed.data.value,
    }).returning();
    res.status(201).json({ data: { ...row, value: row?.value ? "••••••••" : "" } });
  } catch (err) { next(err); }
});

router.patch("/:projectId/secrets/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    const id = String(req.params["id"]);
    await assertProjectOwner(projectId, req.user!.id);
    const schema = z.object({ value: z.string().max(8192) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400));
    const [row] = await db.update(projectSecrets)
      .set({ value: parsed.data.value, updatedAt: new Date() })
      .where(and(eq(projectSecrets.id, id), eq(projectSecrets.projectId, projectId)))
      .returning();
    if (!row) return next(createError("Secret not found", 404));
    res.json({ data: { ...row, value: row.value ? "••••••••" : "" } });
  } catch (err) { next(err); }
});

// POST /:projectId/secrets/import-env — bulk-import from .env file text
router.post("/:projectId/secrets/import-env", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    await assertProjectOwner(projectId, req.user!.id);
    const { content } = z.object({ content: z.string().max(500_000) }).parse(req.body);

    // Parse .env content
    const pairs: { key: string; value: string }[] = [];
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      // Strip leading "export "
      const stripped = line.replace(/^export\s+/, "");
      const eqIdx = stripped.indexOf("=");
      if (eqIdx === -1) continue;
      const key = stripped.slice(0, eqIdx).trim().toUpperCase();
      if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
      let value = stripped.slice(eqIdx + 1);
      // Strip inline comments (only if value isn't quoted)
      if (!/^["']/.test(value)) {
        const commentIdx = value.indexOf(" #");
        if (commentIdx !== -1) value = value.slice(0, commentIdx);
      }
      // Strip surrounding quotes
      value = value.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      pairs.push({ key, value });
    }

    if (pairs.length === 0) return next(createError("No valid key=value pairs found in file", 400));

    // Load existing secrets for this project
    const existing = await db.select({ id: projectSecrets.id, key: projectSecrets.key })
      .from(projectSecrets).where(eq(projectSecrets.projectId, projectId));
    const existingMap = new Map(existing.map(e => [e.key, e.id]));

    let created = 0, updated = 0;
    for (const { key, value } of pairs) {
      const existingId = existingMap.get(key);
      if (existingId) {
        await db.update(projectSecrets)
          .set({ value, updatedAt: new Date() })
          .where(eq(projectSecrets.id, existingId));
        updated++;
      } else {
        await db.insert(projectSecrets).values({ id: cuid(), projectId, key, value });
        created++;
      }
    }

    res.json({ data: { created, updated, total: pairs.length } });
  } catch (err) { next(err); }
});

router.delete("/:projectId/secrets/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    const id = String(req.params["id"]);
    await assertProjectOwner(projectId, req.user!.id);
    await db.delete(projectSecrets)
      .where(and(eq(projectSecrets.id, id), eq(projectSecrets.projectId, projectId)));
    res.json({ data: null, message: "Secret deleted" });
  } catch (err) { next(err); }
});

export default router;

import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import dns from "dns/promises";
import { db, projects, projectDomains } from "@workspace/db";
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

function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function isValidDomain(domain: string): boolean {
  if (domain.length > 253) return false;
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain);
}

// GET /api/projects/:projectId/domains
router.get("/:projectId/domains", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    await assertProjectOwner(projectId, req.user!.id);
    const rows = await db.select().from(projectDomains)
      .where(eq(projectDomains.projectId, projectId))
      .orderBy(projectDomains.createdAt);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/projects/:projectId/domains
router.post("/:projectId/domains", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    await assertProjectOwner(projectId, req.user!.id);

    const schema = z.object({ domain: z.string().min(4).max(253) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.errors[0]?.message ?? "Validation error", 400));

    const domain = normalizeDomain(parsed.data.domain);
    if (!isValidDomain(domain)) return next(createError("Invalid domain name", 400));

    const existing = await db.select({ id: projectDomains.id }).from(projectDomains)
      .where(and(eq(projectDomains.projectId, projectId), eq(projectDomains.domain, domain)))
      .limit(1);
    if (existing.length) return next(createError("Domain already added to this project", 409));

    const token = `orahai-${cuid()}`;
    const [row] = await db.insert(projectDomains).values({
      id: cuid(),
      projectId,
      domain,
      status: "pending",
      verificationToken: token,
    }).returning();

    res.status(201).json({ data: row });
  } catch (err) { next(err); }
});

// POST /api/projects/:projectId/domains/:domainId/verify
router.post("/:projectId/domains/:domainId/verify", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    const domainId  = String(req.params.domainId);
    await assertProjectOwner(projectId, req.user!.id);

    const [row] = await db.select().from(projectDomains)
      .where(and(
        eq(projectDomains.id, domainId),
        eq(projectDomains.projectId, projectId),
      )).limit(1);
    if (!row) return next(createError("Domain not found", 404));

    let verified = false;
    try {
      const records = await dns.resolveTxt(row.domain);
      const flat = records.flat();
      verified = flat.some(r => r === row.verificationToken);
    } catch {
      verified = false;
    }

    const status = verified ? "active" : "pending";
    const [updated] = await db.update(projectDomains)
      .set({ status, verifiedAt: verified ? new Date() : null, updatedAt: new Date() })
      .where(eq(projectDomains.id, row.id))
      .returning();

    res.json({ data: updated, verified });
  } catch (err) { next(err); }
});

// DELETE /api/projects/:projectId/domains/:domainId
router.delete("/:projectId/domains/:domainId", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    const domainId  = String(req.params.domainId);
    await assertProjectOwner(projectId, req.user!.id);

    const [row] = await db.select({ id: projectDomains.id }).from(projectDomains)
      .where(and(
        eq(projectDomains.id, domainId),
        eq(projectDomains.projectId, projectId),
      )).limit(1);
    if (!row) return next(createError("Domain not found", 404));

    await db.delete(projectDomains).where(eq(projectDomains.id, row.id));
    res.json({ data: { deleted: true } });
  } catch (err) { next(err); }
});

export default router;

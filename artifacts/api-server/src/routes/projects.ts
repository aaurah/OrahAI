import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, projects, files, memberships, runs, chatMessages } from "@workspace/db";
import { eq, and, or, isNull, ilike, sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { cuid } from "../lib/cuid";

const router = Router();

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "project";
}

async function uniqueProjectSlug(workspaceId: string, base: string): Promise<string> {
  let slug = base; let i = 1;
  while ((await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.slug, slug), isNull(projects.deletedAt))).limit(1)).length > 0)
    slug = `${base}-${i++}`;
  return slug;
}

async function assertWorkspaceMember(workspaceId: string, userId: string) {
  const [m] = await db.select().from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.workspaceId, workspaceId))).limit(1);
  if (!m) throw createError("Workspace not found or access denied", 404);
  return m;
}

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

router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.query.workspaceId as string | undefined;
    const search = req.query.search as string | undefined;

    const memberSubquery = db.select({ workspaceId: memberships.workspaceId })
      .from(memberships).where(eq(memberships.userId, req.user!.id));

    const conditions: ReturnType<typeof eq>[] = [
      isNull(projects.deletedAt) as ReturnType<typeof eq>,
      (workspaceId
        ? and(eq(projects.workspaceId, workspaceId), sql`${projects.workspaceId} IN (${memberSubquery})`)
        : or(eq(projects.ownerId, req.user!.id), sql`${projects.workspaceId} IN (${memberSubquery})`)) as ReturnType<typeof eq>,
      ...(search ? [ilike(projects.name, `%${search}%`) as ReturnType<typeof eq>] : []),
    ];

    const rows = await db.select({
      id: projects.id, name: projects.name, slug: projects.slug,
      description: projects.description, language: projects.language,
      isPublic: projects.isPublic, workspaceId: projects.workspaceId,
      ownerId: projects.ownerId, createdAt: projects.createdAt, updatedAt: projects.updatedAt,
    }).from(projects).where(and(...conditions));

    const withCounts = await Promise.all(rows.map(async (p) => {
      const [fc] = await db.select({ count: sql<number>`count(*)::int` }).from(files).where(and(eq(files.projectId, p.id), isNull(files.deletedAt)));
      const [rc] = await db.select({ count: sql<number>`count(*)::int` }).from(runs).where(eq(runs.projectId, p.id));
      const [cc] = await db.select({ count: sql<number>`count(*)::int` }).from(chatMessages).where(eq(chatMessages.projectId, p.id));
      return { ...p, _count: { files: fc?.count ?? 0, runs: rc?.count ?? 0, chats: cc?.count ?? 0 } };
    }));

    res.json({ data: withCounts });
  } catch (err) { next(err); }
});

router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      workspaceId: z.string(),
      description: z.string().max(500).optional(),
      language: z.enum(["nodejs", "python", "typescript", "html"]).default("nodejs"),
      isPublic: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

    await assertWorkspaceMember(parsed.data.workspaceId, req.user!.id);
    const slug = await uniqueProjectSlug(parsed.data.workspaceId, slugify(parsed.data.name));

    const projectId = cuid();
    const [project] = await db.insert(projects).values({
      id: projectId,
      name: parsed.data.name,
      slug,
      description: parsed.data.description ?? null,
      language: parsed.data.language,
      isPublic: parsed.data.isPublic,
      workspaceId: parsed.data.workspaceId,
      ownerId: req.user!.id,
    }).returning();

    const starterFileValues = starterFiles(parsed.data.language, parsed.data.name)
      .map((f) => ({ id: cuid(), projectId, ...f }));
    if (starterFileValues.length) await db.insert(files).values(starterFileValues);

    res.status(201).json({ data: { ...project, _count: { files: starterFileValues.length, runs: 0, chats: 0 } }, message: "Project created" });
  } catch (err) { next(err); }
});

router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const memberSubquery = db.select({ workspaceId: memberships.workspaceId })
      .from(memberships).where(eq(memberships.userId, req.user!.id));
    const [p] = await db.select().from(projects).where(and(
      eq(projects.id, id),
      isNull(projects.deletedAt),
      or(eq(projects.ownerId, req.user!.id), eq(projects.isPublic, true), sql`${projects.workspaceId} IN (${memberSubquery})`),
    )).limit(1);
    if (!p) return next(createError("Project not found", 404));
    res.json({ data: p });
  } catch (err) { next(err); }
});

router.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    await assertProjectAccess(id, req.user!.id);
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional().nullable(),
      isPublic: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));
    const [updated] = await db.update(projects).set({ ...parsed.data, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    res.json({ data: updated });
  } catch (err) { next(err); }
});

router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const [p] = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, req.user!.id), isNull(projects.deletedAt))).limit(1);
    if (!p) return next(createError("Project not found", 404));
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, p.id));
    res.json({ data: null, message: "Project deleted" });
  } catch (err) { next(err); }
});

function starterFiles(language: string, projectName: string) {
  const starters: Record<string, { path: string; name: string; content: string; mimeType: string; isDir: boolean; size: number }[]> = {
    nodejs: [
      { path: "index.js", name: "index.js", mimeType: "application/javascript", isDir: false,
        content: `// ${projectName}\nconsole.log("Hello from ${projectName}!");\n`, size: 0 },
      { path: "package.json", name: "package.json", mimeType: "application/json", isDir: false,
        content: JSON.stringify({ name: projectName.toLowerCase().replace(/\s/g, "-"), version: "1.0.0", main: "index.js" }, null, 2) + "\n", size: 0 },
    ],
    python: [
      { path: "main.py", name: "main.py", mimeType: "text/x-python", isDir: false,
        content: `# ${projectName}\n\ndef main():\n    print("Hello from ${projectName}!")\n\nif __name__ == "__main__":\n    main()\n`, size: 0 },
    ],
    typescript: [
      { path: "src/index.ts", name: "index.ts", mimeType: "text/typescript", isDir: false,
        content: `// ${projectName}\nconst main = (): void => {\n  console.log("Hello from ${projectName}!");\n};\nmain();\n`, size: 0 },
    ],
    html: [
      { path: "index.html", name: "index.html", mimeType: "text/html", isDir: false,
        content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>${projectName}</title>\n</head>\n<body>\n  <h1>${projectName}</h1>\n</body>\n</html>\n`, size: 0 },
    ],
  };
  return (starters[language] ?? starters.nodejs).map((f) => ({
    ...f, size: Buffer.byteLength(f.content, "utf8"),
  }));
}

export default router;

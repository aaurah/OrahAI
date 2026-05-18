import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, files, projects, memberships } from "@workspace/db";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { cuid } from "../lib/cuid";

const router = Router();

async function assertProjectAccess(projectId: string, userId: string) {
  const memberSubquery = db.select({ workspaceId: memberships.workspaceId })
    .from(memberships).where(eq(memberships.userId, userId));
  const [p] = await db.select().from(projects).where(and(
    eq(projects.id, projectId),
    isNull(projects.deletedAt),
    or(eq(projects.ownerId, userId), sql`${projects.workspaceId} IN (${memberSubquery})`),
  )).limit(1);
  if (!p) throw createError("Project not found", 404);
  return p;
}

function safePath(p: string) {
  if (!p || p.includes("..") || p.startsWith("/")) throw createError("Invalid file path", 400);
}

function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    js: "application/javascript", ts: "text/typescript", tsx: "text/typescript",
    jsx: "text/javascript", py: "text/x-python", html: "text/html", css: "text/css",
    json: "application/json", md: "text/markdown", sh: "text/x-shellscript",
    yaml: "text/yaml", yml: "text/yaml", go: "text/x-go", rs: "text/x-rust",
    java: "text/x-java", sql: "text/x-sql",
  };
  return map[ext] ?? "text/plain";
}

type FlatFile = { id: string; path: string; name: string; mimeType: string; size: number; isDir: boolean };
function buildTree(fileList: FlatFile[]) {
  type Node = FlatFile & { children?: Node[] };
  const map = new Map<string, Node>();
  for (const f of fileList) map.set(f.path, { ...f, children: f.isDir ? [] : undefined });
  const roots: Node[] = [];
  for (const [path, node] of map) {
    const parts = path.split("/");
    if (parts.length === 1) { roots.push(node); continue; }
    const parentPath = parts.slice(0, -1).join("/");
    const parent = map.get(parentPath);
    if (parent?.children) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

router.get("/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    await assertProjectAccess(projectId, req.user!.id);
    const rows = await db
      .select({ id: files.id, path: files.path, name: files.name, mimeType: files.mimeType, size: files.size, isDir: files.isDir })
      .from(files)
      .where(and(eq(files.projectId, projectId), isNull(files.deletedAt)));
    res.json({ data: { flat: rows, tree: buildTree(rows) } });
  } catch (err) { next(err); }
});

router.get("/:projectId/read", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    const filePath = req.query.path as string;
    if (!filePath) return next(createError("`path` query param required", 400));
    await assertProjectAccess(projectId, req.user!.id);
    const [file] = await db.select().from(files)
      .where(and(eq(files.projectId, projectId), eq(files.path, filePath), isNull(files.deletedAt))).limit(1);
    if (!file) return next(createError("File not found", 404));
    res.json({ data: file });
  } catch (err) { next(err); }
});

router.put("/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ path: z.string().min(1).max(1000), content: z.string(), mimeType: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

    const projectId = String(req.params.projectId);
    const { path: filePath, content, mimeType } = parsed.data;
    safePath(filePath);
    await assertProjectAccess(projectId, req.user!.id);

    const name = filePath.split("/").pop() ?? filePath;
    const size = Buffer.byteLength(content, "utf8");
    const mime = mimeType ?? mimeFromName(name);

    const [existing] = await db.select({ id: files.id }).from(files)
      .where(and(eq(files.projectId, projectId), eq(files.path, filePath))).limit(1);

    let file;
    if (existing) {
      [file] = await db.update(files).set({ content, size, mimeType: mime, deletedAt: null, updatedAt: new Date() })
        .where(eq(files.id, existing.id)).returning();
    } else {
      [file] = await db.insert(files).values({
        id: cuid(), projectId, path: filePath, name, content, mimeType: mime, size, isDir: false,
      }).returning();
    }

    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
    res.json({ data: file });
  } catch (err) { next(err); }
});

router.delete("/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    const filePath = req.query.path as string;
    if (!filePath) return next(createError("`path` query param required", 400));
    await assertProjectAccess(projectId, req.user!.id);
    const [file] = await db.select().from(files)
      .where(and(eq(files.projectId, projectId), eq(files.path, filePath), isNull(files.deletedAt))).limit(1);
    if (!file) return next(createError("File not found", 404));
    await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, file.id));
    res.json({ data: null, message: "File deleted" });
  } catch (err) { next(err); }
});

router.post("/:projectId/rename", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ oldPath: z.string(), newPath: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));
    const projectId = String(req.params.projectId);
    safePath(parsed.data.newPath);
    await assertProjectAccess(projectId, req.user!.id);
    const [file] = await db.select().from(files)
      .where(and(eq(files.projectId, projectId), eq(files.path, parsed.data.oldPath), isNull(files.deletedAt))).limit(1);
    if (!file) return next(createError("File not found", 404));
    const [updated] = await db.update(files).set({
      path: parsed.data.newPath, name: parsed.data.newPath.split("/").pop() ?? parsed.data.newPath, updatedAt: new Date(),
    }).where(eq(files.id, file.id)).returning();
    res.json({ data: updated });
  } catch (err) { next(err); }
});

export default router;

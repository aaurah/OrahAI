import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "@orahai/db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";

const router = Router();

// ── helpers ───────────────────────────────────────────────────────────────────

async function assertProjectAccess(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      deletedAt: null,
      OR: [
        { ownerId: userId },
        { workspace: { memberships: { some: { userId } } } },
      ],
    },
  });
  if (!project) throw createError("Project not found", 404);
  return project;
}

function safePath(p: string) {
  if (!p || p.includes("..") || p.startsWith("/"))
    throw createError("Invalid file path", 400);
}

function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    js: "application/javascript", ts: "text/typescript",
    tsx: "text/typescript", jsx: "text/javascript",
    py: "text/x-python", html: "text/html", css: "text/css",
    json: "application/json", md: "text/markdown", sh: "text/x-shellscript",
    yaml: "text/yaml", yml: "text/yaml", go: "text/x-go",
    rs: "text/x-rust", java: "text/x-java", sql: "text/x-sql",
  };
  return map[ext] ?? "text/plain";
}

interface FlatFile {
  id: string; path: string; name: string;
  mimeType: string; size: number; isDir: boolean;
}

function buildTree(files: FlatFile[]) {
  type Node = FlatFile & { children?: Node[] };
  const map = new Map<string, Node>();
  for (const f of files) map.set(f.path, { ...f, children: f.isDir ? [] : undefined });

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

// ── GET /api/files/:projectId ─────────────────────────────────────────────────

router.get("/:projectId", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await assertProjectAccess(req.params.projectId, req.user!.id);
      const files = await prisma.file.findMany({
        where: { projectId: req.params.projectId, deletedAt: null },
        select: { id: true, path: true, name: true, mimeType: true, size: true, isDir: true },
        orderBy: [{ isDir: "desc" }, { path: "asc" }],
      });
      res.json({ data: { flat: files, tree: buildTree(files) } });
    } catch (err) { next(err); }
  });

// ── GET /api/files/:projectId/read?path=… ─────────────────────────────────────

router.get("/:projectId/read", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return next(createError("`path` query param required", 400));
      await assertProjectAccess(req.params.projectId, req.user!.id);
      const file = await prisma.file.findFirst({
        where: { projectId: req.params.projectId, path: filePath, deletedAt: null },
      });
      if (!file) return next(createError("File not found", 404));
      res.json({ data: file });
    } catch (err) { next(err); }
  });

// ── PUT /api/files/:projectId ─── create or update ───────────────────────────

router.put("/:projectId", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        path: z.string().min(1).max(1000),
        content: z.string(),
        mimeType: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const { path: filePath, content, mimeType } = parsed.data;
      safePath(filePath);
      await assertProjectAccess(req.params.projectId, req.user!.id);

      const name = filePath.split("/").pop() ?? filePath;
      const size = Buffer.byteLength(content, "utf8");
      const mime = mimeType ?? mimeFromName(name);

      const file = await prisma.file.upsert({
        where: { projectId_path: { projectId: req.params.projectId, path: filePath } },
        create: { projectId: req.params.projectId, path: filePath, name, content, mimeType: mime, size, isDir: false },
        update: { content, size, mimeType: mime, deletedAt: null },
      });

      await prisma.project.update({
        where: { id: req.params.projectId },
        data: { updatedAt: new Date() },
      });

      res.json({ data: file });
    } catch (err) { next(err); }
  });

// ── DELETE /api/files/:projectId?path=… ──────────────────────────────────────

router.delete("/:projectId", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return next(createError("`path` query param required", 400));
      await assertProjectAccess(req.params.projectId, req.user!.id);
      const file = await prisma.file.findFirst({
        where: { projectId: req.params.projectId, path: filePath, deletedAt: null },
      });
      if (!file) return next(createError("File not found", 404));
      await prisma.file.update({ where: { id: file.id }, data: { deletedAt: new Date() } });
      res.json({ data: null, message: "File deleted" });
    } catch (err) { next(err); }
  });

// ── POST /api/files/:projectId/rename ─────────────────────────────────────────

router.post("/:projectId/rename", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ oldPath: z.string(), newPath: z.string() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const { oldPath, newPath } = parsed.data;
      safePath(newPath);
      await assertProjectAccess(req.params.projectId, req.user!.id);

      const file = await prisma.file.findFirst({
        where: { projectId: req.params.projectId, path: oldPath, deletedAt: null },
      });
      if (!file) return next(createError("File not found", 404));

      const updated = await prisma.file.update({
        where: { id: file.id },
        data: { path: newPath, name: newPath.split("/").pop() ?? newPath },
      });
      res.json({ data: updated });
    } catch (err) { next(err); }
  });

export default router;

import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "@orahai/db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { auditLog } from "../middleware/audit";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertProjectAccess(
  projectId: string,
  userId: string
): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      deletedAt: null,
      OR: [
        { ownerId: userId },
        {
          organization: {
            members: { some: { userId } },
          },
        },
      ],
    },
  });
  return !!project;
}

// ── GET /api/files/:projectId ─────────────────────────────────────────────────
// Returns the file tree (no content)

router.get(
  "/:projectId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;

      if (!(await assertProjectAccess(projectId, req.user!.id))) {
        return next(createError("Project not found", 404));
      }

      const files = await prisma.projectFile.findMany({
        where: { projectId, deletedAt: null },
        select: {
          id: true,
          path: true,
          name: true,
          mimeType: true,
          size: true,
          isDir: true,
          updatedAt: true,
        },
        orderBy: [{ isDir: "desc" }, { path: "asc" }],
      });

      // Build tree structure
      const tree = buildFileTree(files);

      res.json({ data: { flat: files, tree } });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/files/:projectId/content ─────────────────────────────────────────
// Returns content of a specific file by path

router.get(
  "/:projectId/content",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;
      const filePath = req.query.path as string;

      if (!filePath) {
        return next(createError("Query param `path` is required", 400));
      }

      if (!(await assertProjectAccess(projectId, req.user!.id))) {
        return next(createError("Project not found", 404));
      }

      const file = await prisma.projectFile.findFirst({
        where: { projectId, path: filePath, deletedAt: null },
      });

      if (!file) return next(createError("File not found", 404));

      res.json({ data: file });
    } catch (err) {
      next(err);
    }
  }
);

// ── PUT /api/files/:projectId ─────────────────────────────────────────────────
// Create or update a file

router.put(
  "/:projectId",
  requireAuth,
  auditLog("file.write", "project_file"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;

      const schema = z.object({
        path: z.string().min(1).max(1000),
        content: z.string(),
        mimeType: z.string().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError("Validation error", 400, parsed.error.errors));
      }

      if (!(await assertProjectAccess(projectId, req.user!.id))) {
        return next(createError("Project not found", 404));
      }

      const { path: filePath, content, mimeType } = parsed.data;

      // Validate path is safe (no path traversal)
      if (filePath.includes("..") || filePath.startsWith("/")) {
        return next(createError("Invalid file path", 400));
      }

      const name = filePath.split("/").pop() ?? filePath;
      const size = Buffer.byteLength(content, "utf8");
      const resolvedMime = mimeType ?? inferMimeType(name);

      const file = await prisma.projectFile.upsert({
        where: { projectId_path: { projectId, path: filePath } },
        create: {
          projectId,
          path: filePath,
          name,
          content,
          mimeType: resolvedMime,
          size,
          isDir: false,
        },
        update: {
          content,
          size,
          mimeType: resolvedMime,
          deletedAt: null,
        },
      });

      // Update project updatedAt
      await prisma.project.update({
        where: { id: projectId },
        data: { updatedAt: new Date() },
      });

      res.json({ data: file });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/files/:projectId ──────────────────────────────────────────────

router.delete(
  "/:projectId",
  requireAuth,
  auditLog("file.delete", "project_file"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;
      const filePath = req.query.path as string;

      if (!filePath) {
        return next(createError("Query param `path` is required", 400));
      }

      if (!(await assertProjectAccess(projectId, req.user!.id))) {
        return next(createError("Project not found", 404));
      }

      const file = await prisma.projectFile.findFirst({
        where: { projectId, path: filePath, deletedAt: null },
      });

      if (!file) return next(createError("File not found", 404));

      await prisma.projectFile.update({
        where: { id: file.id },
        data: { deletedAt: new Date() },
      });

      res.json({ data: null, message: "File deleted" });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/files/:projectId/rename ─────────────────────────────────────────

router.post(
  "/:projectId/rename",
  requireAuth,
  auditLog("file.rename", "project_file"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;

      const schema = z.object({
        oldPath: z.string(),
        newPath: z.string(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError("Validation error", 400, parsed.error.errors));
      }

      if (!(await assertProjectAccess(projectId, req.user!.id))) {
        return next(createError("Project not found", 404));
      }

      const { oldPath, newPath } = parsed.data;

      if (newPath.includes("..") || newPath.startsWith("/")) {
        return next(createError("Invalid destination path", 400));
      }

      const file = await prisma.projectFile.findFirst({
        where: { projectId, path: oldPath, deletedAt: null },
      });
      if (!file) return next(createError("File not found", 404));

      const newName = newPath.split("/").pop() ?? newPath;

      const updated = await prisma.projectFile.update({
        where: { id: file.id },
        data: { path: newPath, name: newName },
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ── Helpers ───────────────────────────────────────────────────────────────────

interface FlatFile {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
  isDir: boolean;
  updatedAt: Date;
}

interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  mimeType?: string;
  size?: number;
  children?: FileNode[];
}

function buildFileTree(files: FlatFile[]): FileNode[] {
  const root: FileNode[] = [];
  const map = new Map<string, FileNode>();

  for (const f of files) {
    const node: FileNode = {
      name: f.name,
      path: f.path,
      isDir: f.isDir,
      mimeType: f.mimeType,
      size: f.size,
      children: f.isDir ? [] : undefined,
    };
    map.set(f.path, node);
  }

  for (const [path, node] of map) {
    const parts = path.split("/");
    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = map.get(parentPath);
      if (parent && parent.children) {
        parent.children.push(node);
      } else {
        root.push(node);
      }
    }
  }

  return root;
}

function inferMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    py: "text/x-python",
    js: "application/javascript",
    ts: "text/typescript",
    tsx: "text/typescript",
    jsx: "text/javascript",
    html: "text/html",
    css: "text/css",
    json: "application/json",
    md: "text/markdown",
    txt: "text/plain",
    sh: "text/x-shellscript",
    yaml: "text/yaml",
    yml: "text/yaml",
    toml: "text/x-toml",
    go: "text/x-go",
    rs: "text/x-rust",
    java: "text/x-java",
    cpp: "text/x-c++src",
    c: "text/x-csrc",
    rb: "text/x-ruby",
    php: "text/x-php",
    sql: "text/x-sql",
    dockerfile: "text/x-dockerfile",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    pdf: "application/pdf",
  };
  return map[ext] ?? "text/plain";
}

export default router;

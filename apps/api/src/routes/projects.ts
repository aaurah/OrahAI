import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "@orahai/db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";

const router = Router();

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "project";
}

async function uniqueProjectSlug(workspaceId: string, base: string) {
  let slug = base; let i = 1;
  while (await prisma.project.findFirst({ where: { workspaceId, slug, deletedAt: null } }))
    slug = `${base}-${i++}`;
  return slug;
}

async function assertWorkspaceMember(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!m) throw createError("Workspace not found or access denied", 404);
  return m;
}

async function assertProjectAccess(projectId: string, userId: string) {
  const p = await prisma.project.findFirst({
    where: {
      id: projectId, deletedAt: null,
      OR: [
        { ownerId: userId },
        { workspace: { memberships: { some: { userId } } } },
      ],
    },
  });
  if (!p) throw createError("Project not found", 404);
  return p;
}

// ── GET /api/projects?workspaceId= ────────────────────────────────────────────

router.get("/", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.query.workspaceId as string | undefined;
      const search = req.query.search as string | undefined;

      const where = {
        deletedAt: null,
        ...(workspaceId
          ? { workspaceId, workspace: { memberships: { some: { userId: req.user!.id } } } }
          : { OR: [{ ownerId: req.user!.id }, { workspace: { memberships: { some: { userId: req.user!.id } } } }] }),
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      };

      const projects = await prisma.project.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { files: true, runs: true, chats: true } } },
      });

      res.json({ data: projects });
    } catch (err) { next(err); }
  });

// ── POST /api/projects ────────────────────────────────────────────────────────

router.post("/", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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

      const project = await prisma.project.create({
        data: {
          name: parsed.data.name,
          slug,
          description: parsed.data.description ?? null,
          language: parsed.data.language,
          isPublic: parsed.data.isPublic,
          workspaceId: parsed.data.workspaceId,
          ownerId: req.user!.id,
          files: { create: starterFiles(parsed.data.language, parsed.data.name) },
        },
        include: { _count: { select: { files: true, runs: true, chats: true } } },
      });

      res.status(201).json({ data: project, message: "Project created" });
    } catch (err) { next(err); }
  });

// ── GET /api/projects/:id ─────────────────────────────────────────────────────

router.get("/:id", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const project = await prisma.project.findFirst({
        where: {
          id: req.params.id, deletedAt: null,
          OR: [
            { ownerId: req.user!.id },
            { isPublic: true },
            { workspace: { memberships: { some: { userId: req.user!.id } } } },
          ],
        },
        include: {
          owner: { select: { id: true, username: true, avatarUrl: true } },
          _count: { select: { files: true, runs: true, chats: true } },
        },
      });
      if (!project) return next(createError("Project not found", 404));
      res.json({ data: project });
    } catch (err) { next(err); }
  });

// ── PATCH /api/projects/:id ───────────────────────────────────────────────────

router.patch("/:id", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await assertProjectAccess(req.params.id, req.user!.id);
      const schema = z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional().nullable(),
        isPublic: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const updated = await prisma.project.update({
        where: { id: req.params.id },
        data: parsed.data,
      });
      res.json({ data: updated });
    } catch (err) { next(err); }
  });

// ── DELETE /api/projects/:id ──────────────────────────────────────────────────

router.delete("/:id", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const p = await prisma.project.findFirst({
        where: { id: req.params.id, ownerId: req.user!.id, deletedAt: null },
      });
      if (!p) return next(createError("Project not found", 404));
      await prisma.project.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
      res.json({ data: null, message: "Project deleted" });
    } catch (err) { next(err); }
  });

// ── helpers ───────────────────────────────────────────────────────────────────

function starterFiles(language: string, projectName: string) {
  const starters: Record<string, { path: string; name: string; content: string; mimeType: string }[]> = {
    nodejs: [
      { path: "index.js", name: "index.js", mimeType: "application/javascript",
        content: `// ${projectName}\nconsole.log("Hello from ${projectName}!");\n` },
      { path: "package.json", name: "package.json", mimeType: "application/json",
        content: JSON.stringify({ name: projectName.toLowerCase().replace(/\s/g, "-"), version: "1.0.0", main: "index.js" }, null, 2) + "\n" },
      { path: "README.md", name: "README.md", mimeType: "text/markdown",
        content: `# ${projectName}\n\nA Node.js project.\n` },
    ],
    python: [
      { path: "main.py", name: "main.py", mimeType: "text/x-python",
        content: `# ${projectName}\n\ndef main():\n    print("Hello from ${projectName}!")\n\nif __name__ == "__main__":\n    main()\n` },
      { path: "requirements.txt", name: "requirements.txt", mimeType: "text/plain",
        content: "# Add dependencies here\n" },
      { path: "README.md", name: "README.md", mimeType: "text/markdown",
        content: `# ${projectName}\n\nA Python project.\n` },
    ],
    typescript: [
      { path: "src/index.ts", name: "index.ts", mimeType: "text/typescript",
        content: `// ${projectName}\nconst main = (): void => {\n  console.log("Hello from ${projectName}!");\n};\nmain();\n` },
      { path: "tsconfig.json", name: "tsconfig.json", mimeType: "application/json",
        content: JSON.stringify({ compilerOptions: { target: "ES2022", module: "commonjs", strict: true, outDir: "dist" }, include: ["src"] }, null, 2) + "\n" },
      { path: "README.md", name: "README.md", mimeType: "text/markdown",
        content: `# ${projectName}\n\nA TypeScript project.\n` },
    ],
    html: [
      { path: "index.html", name: "index.html", mimeType: "text/html",
        content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>${projectName}</title>\n</head>\n<body>\n  <h1>${projectName}</h1>\n  <p>Built with OrahAI.</p>\n</body>\n</html>\n` },
      { path: "style.css", name: "style.css", mimeType: "text/css",
        content: `body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }\n` },
    ],
  };
  return (starters[language] ?? starters.nodejs).map((f) => ({
    ...f, size: Buffer.byteLength(f.content, "utf8"), isDir: false,
  }));
}

export default router;

import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "@orahai/db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { auditLog } from "../middleware/audit";

const router = Router();

const projectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  language: z.string().default("python"),
  template: z.string().optional(),
  isPublic: z.boolean().default(false),
  organizationId: z.string().optional(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

// ── GET /api/projects ─────────────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
      const perPage = Math.min(
        100,
        Math.max(1, parseInt((req.query.perPage as string) ?? "20", 10))
      );
      const skip = (page - 1) * perPage;
      const lang = req.query.language as string | undefined;
      const search = req.query.search as string | undefined;

      const where = {
        ownerId: req.user!.id,
        deletedAt: null,
        isArchived: false,
        ...(lang ? { language: lang } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                {
                  description: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              ],
            }
          : {}),
      };

      const [total, projects] = await Promise.all([
        prisma.project.count({ where }),
        prisma.project.findMany({
          where,
          skip,
          take: perPage,
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            language: true,
            template: true,
            isPublic: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { files: true, deployments: true } },
          },
        }),
      ]);

      res.json({
        data: projects,
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/projects ────────────────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  auditLog("project.create", "project"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = projectSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError("Validation error", 400, parsed.error.errors));
      }

      const { name, description, language, template, isPublic, organizationId } =
        parsed.data;

      // Validate org membership
      if (organizationId) {
        const member = await prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId,
              userId: req.user!.id,
            },
          },
        });
        if (!member) {
          return next(createError("Not a member of this organization", 403));
        }
      }

      // Unique slug per owner
      let slug = slugify(name);
      const existing = await prisma.project.findFirst({
        where: { ownerId: req.user!.id, slug, deletedAt: null },
      });
      if (existing) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }

      const project = await prisma.project.create({
        data: {
          name,
          slug,
          description: description ?? null,
          language,
          template: template ?? null,
          isPublic,
          ownerId: req.user!.id,
          organizationId: organizationId ?? null,
        },
      });

      // Create default starter files based on language
      const starterFiles = getStarterFiles(language, name);
      if (starterFiles.length > 0) {
        await prisma.projectFile.createMany({
          data: starterFiles.map((f) => ({
            projectId: project.id,
            ...f,
          })),
        });
      }

      res.status(201).json({
        data: project,
        message: "Project created",
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/projects/:id ─────────────────────────────────────────────────────

router.get(
  "/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const project = await prisma.project.findFirst({
        where: {
          id: req.params.id,
          deletedAt: null,
          OR: [
            { ownerId: req.user!.id },
            { isPublic: true },
            {
              organization: {
                members: { some: { userId: req.user!.id } },
              },
            },
          ],
        },
        include: {
          owner: {
            select: { id: true, username: true, avatarUrl: true },
          },
          _count: {
            select: { files: true, deployments: true, workspaces: true },
          },
        },
      });

      if (!project) return next(createError("Project not found", 404));

      res.json({ data: project });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /api/projects/:id ───────────────────────────────────────────────────

router.patch(
  "/:id",
  requireAuth,
  auditLog("project.update", "project"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const project = await prisma.project.findFirst({
        where: { id: req.params.id, ownerId: req.user!.id, deletedAt: null },
      });
      if (!project) return next(createError("Project not found", 404));

      const updateSchema = z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        isPublic: z.boolean().optional(),
        isArchived: z.boolean().optional(),
        gitRepoUrl: z.string().url().optional().nullable(),
        gitBranch: z.string().optional(),
      });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError("Validation error", 400, parsed.error.errors));
      }

      const updated = await prisma.project.update({
        where: { id: project.id },
        data: parsed.data,
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/projects/:id ──────────────────────────────────────────────────

router.delete(
  "/:id",
  requireAuth,
  auditLog("project.delete", "project"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const project = await prisma.project.findFirst({
        where: { id: req.params.id, ownerId: req.user!.id, deletedAt: null },
      });
      if (!project) return next(createError("Project not found", 404));

      // Soft delete
      await prisma.project.update({
        where: { id: project.id },
        data: { deletedAt: new Date() },
      });

      res.json({ data: null, message: "Project deleted" });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/projects/templates ───────────────────────────────────────────────

router.get(
  "/templates/list",
  async (_req, res: Response, next: NextFunction) => {
    try {
      res.json({ data: PROJECT_TEMPLATES });
    } catch (err) {
      next(err);
    }
  }
);

// ── Helpers ───────────────────────────────────────────────────────────────────

interface StarterFile {
  path: string;
  name: string;
  content: string;
  mimeType: string;
  size: number;
}

function getStarterFiles(language: string, projectName: string): StarterFile[] {
  const files: Record<string, StarterFile[]> = {
    python: [
      {
        path: "main.py",
        name: "main.py",
        content: `# ${projectName}\n\ndef main():\n    print("Hello from ${projectName}!")\n\nif __name__ == "__main__":\n    main()\n`,
        mimeType: "text/x-python",
        size: 0,
      },
      {
        path: "requirements.txt",
        name: "requirements.txt",
        content: "# Add your dependencies here\n",
        mimeType: "text/plain",
        size: 0,
      },
      {
        path: "README.md",
        name: "README.md",
        content: `# ${projectName}\n\nA Python project built with OrahAI.\n`,
        mimeType: "text/markdown",
        size: 0,
      },
    ],
    nodejs: [
      {
        path: "index.js",
        name: "index.js",
        content: `// ${projectName}\n\nconsole.log("Hello from ${projectName}!");\n`,
        mimeType: "application/javascript",
        size: 0,
      },
      {
        path: "package.json",
        name: "package.json",
        content: JSON.stringify(
          { name: projectName.toLowerCase().replace(/\s/g, "-"), version: "1.0.0", main: "index.js" },
          null,
          2
        ) + "\n",
        mimeType: "application/json",
        size: 0,
      },
    ],
    typescript: [
      {
        path: "src/index.ts",
        name: "index.ts",
        content: `// ${projectName}\n\nconst main = (): void => {\n  console.log("Hello from ${projectName}!");\n};\n\nmain();\n`,
        mimeType: "text/typescript",
        size: 0,
      },
      {
        path: "tsconfig.json",
        name: "tsconfig.json",
        content: JSON.stringify(
          { compilerOptions: { target: "ES2022", module: "commonjs", strict: true, outDir: "./dist" }, include: ["src"] },
          null,
          2
        ) + "\n",
        mimeType: "application/json",
        size: 0,
      },
    ],
    html: [
      {
        path: "index.html",
        name: "index.html",
        content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>${projectName}</title>\n</head>\n<body>\n  <h1>${projectName}</h1>\n  <p>Built with OrahAI.</p>\n</body>\n</html>\n`,
        mimeType: "text/html",
        size: 0,
      },
    ],
  };

  return (files[language] ?? files["python"]).map((f) => ({
    ...f,
    size: Buffer.byteLength(f.content, "utf8"),
  }));
}

const PROJECT_TEMPLATES = [
  { id: "python-blank", name: "Python", description: "Blank Python project", language: "python", icon: "🐍", tags: ["python"], isOfficial: true },
  { id: "node-blank", name: "Node.js", description: "Blank Node.js project", language: "nodejs", icon: "🟩", tags: ["javascript", "nodejs"], isOfficial: true },
  { id: "typescript-blank", name: "TypeScript", description: "TypeScript project", language: "typescript", icon: "🔷", tags: ["typescript"], isOfficial: true },
  { id: "html-blank", name: "HTML/CSS/JS", description: "Static web page", language: "html", icon: "🌐", tags: ["html", "css", "javascript"], isOfficial: true },
  { id: "fastapi", name: "FastAPI", description: "Python REST API with FastAPI", language: "python", icon: "⚡", tags: ["python", "api", "fastapi"], isOfficial: true },
  { id: "express", name: "Express", description: "Node.js REST API with Express", language: "nodejs", icon: "🚀", tags: ["nodejs", "api", "express"], isOfficial: true },
  { id: "nextjs", name: "Next.js", description: "React framework for production", language: "typescript", icon: "▲", tags: ["react", "nextjs", "typescript"], isOfficial: true },
];

export default router;

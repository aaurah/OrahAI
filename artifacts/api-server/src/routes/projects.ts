import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, projects, files, memberships, runs, chatMessages } from "@workspace/db";
import { eq, and, or, isNull, ilike, sql, asc } from "drizzle-orm";
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
      githubRepo: projects.githubRepo, githubBranch: projects.githubBranch,
      githubSha: projects.githubSha, githubSyncedAt: projects.githubSyncedAt,
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
      language: z.string().min(1).max(30).default("nodejs"),
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

router.post("/import/files", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      workspaceId: z.string(),
      name: z.string().min(1).max(100),
      language: z.string().optional().default("nodejs"),
      files: z.array(z.object({ path: z.string(), content: z.string() })).max(200),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

    await assertWorkspaceMember(parsed.data.workspaceId, req.user!.id);
    const slug = await uniqueProjectSlug(parsed.data.workspaceId, slugify(parsed.data.name));
    const projectId = cuid();

    const [project] = await db.insert(projects).values({
      id: projectId, name: parsed.data.name, slug,
      language: parsed.data.language, isPublic: false,
      workspaceId: parsed.data.workspaceId, ownerId: req.user!.id,
    }).returning();

    const mimeForPath = (path: string) => {
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      const map: Record<string, string> = {
        js: "application/javascript", jsx: "application/javascript",
        ts: "text/typescript", tsx: "text/typescript",
        py: "text/x-python", html: "text/html", css: "text/css",
        json: "application/json", md: "text/markdown",
      };
      return map[ext] ?? "text/plain";
    };

    const fileValues = parsed.data.files.map((f) => ({
      id: cuid(), projectId, path: f.path,
      name: f.path.split("/").pop() ?? f.path,
      content: f.content, mimeType: mimeForPath(f.path),
      isDir: false, size: Buffer.byteLength(f.content, "utf-8"),
    }));
    if (fileValues.length) await db.insert(files).values(fileValues);

    res.status(201).json({
      data: { ...project, _count: { files: fileValues.length, runs: 0, chats: 0 } },
      message: `Imported ${fileValues.length} files`,
    });
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

// ── Project setup detection ────────────────────────────────────────────────

interface SetupInfo {
  framework: string;
  language: string;
  installCmd: string | null;
  devCmd: string | null;
  runCmd: string | null;
  buildCmd: string | null;
  scripts: Record<string, string>;
  envVarsNeeded: string[];
  packageManager: "npm" | "pnpm" | "yarn" | "pip" | "cargo" | "go" | null;
  hasLockFile: boolean;
  entryPoints: string[];
}

function detectSetup(projectFiles: { path: string; content: string | null }[], language: string): SetupInfo {
  const paths = projectFiles.map(f => f.path.toLowerCase());
  const getContent = (p: string) => projectFiles.find(f => f.path.toLowerCase() === p.toLowerCase())?.content ?? null;

  const hasPnpmLock  = paths.some(p => p.includes("pnpm-lock"));
  const hasYarnLock  = paths.some(p => p.includes("yarn.lock"));
  const hasCargoToml = paths.some(p => p.endsWith("cargo.toml"));
  const hasGoMod     = paths.some(p => p.endsWith("go.mod"));
  const hasReqTxt    = paths.some(p => p.includes("requirements.txt"));
  const hasPyproject = paths.some(p => p.endsWith("pyproject.toml"));
  const hasPkgJson   = paths.some(p => p.endsWith("package.json") && !p.includes("node_modules"));

  const packageManager =
    hasPnpmLock  ? "pnpm" :
    hasYarnLock  ? "yarn" :
    hasCargoToml ? "cargo" :
    hasGoMod     ? "go" :
    (hasReqTxt || hasPyproject) ? "pip" :
    hasPkgJson   ? "npm" : null;

  let scripts: Record<string, string> = {};
  let framework = language === "python" ? "Python" : language === "typescript" ? "TypeScript" : "Node.js";
  let devCmd: string | null = null;
  let buildCmd: string | null = null;
  let runCmd: string | null = null;

  const pkgContent = getContent("package.json");
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      scripts = pkg.scripts ?? {};
      devCmd   = scripts.dev ?? scripts.develop ?? scripts.start ?? null;
      buildCmd = scripts.build ?? null;
      runCmd   = scripts.start ?? scripts.serve ?? null;

      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if (deps["next"])         framework = "Next.js";
      else if (deps["nuxt"])    framework = "Nuxt.js";
      else if (deps["vite"])    framework = "Vite";
      else if (deps["react"])   framework = "React";
      else if (deps["vue"])     framework = "Vue.js";
      else if (deps["svelte"])  framework = "Svelte";
      else if (deps["express"]) framework = "Express.js";
      else if (deps["fastify"]) framework = "Fastify";
      else if (deps["hono"])    framework = "Hono";
      else if (deps["@angular/core"]) framework = "Angular";
      else if (deps["solid-js"]) framework = "SolidJS";
      else if (deps["astro"])   framework = "Astro";
    } catch { /* ignore parse errors */ }
  }

  if (hasCargoToml) { framework = "Rust / Cargo"; devCmd = "cargo run"; buildCmd = "cargo build"; }
  if (hasGoMod)     { framework = "Go"; devCmd = "go run ."; buildCmd = "go build ."; }
  if (hasReqTxt || hasPyproject) { framework = hasPyproject ? "Python (pyproject)" : "Python"; devCmd = "python main.py"; runCmd = "python main.py"; }

  const installCmd =
    packageManager === "pnpm"  ? "pnpm install" :
    packageManager === "yarn"  ? "yarn install" :
    packageManager === "cargo" ? "cargo build" :
    packageManager === "go"    ? "go mod download" :
    packageManager === "pip"   ? (hasReqTxt ? "pip install -r requirements.txt" : "pip install .") :
    packageManager === "npm"   ? "npm install" : null;

  // Extract needed env vars from .env.example or README
  const envExample = getContent(".env.example") ?? getContent(".env.sample") ?? getContent(".env.template") ?? "";
  const envVarsNeeded = envExample
    ? envExample.split("\n")
        .filter(l => l.trim() && !l.trim().startsWith("#") && l.includes("="))
        .map(l => l.split("=")[0].trim())
        .filter(Boolean)
    : [];

  const entryPoints = projectFiles
    .map(f => f.path)
    .filter(p => ["index.js","index.ts","main.py","app.py","main.ts","main.go","src/index.ts","src/main.ts","src/index.js"].includes(p))
    .slice(0, 5);

  return {
    framework,
    language,
    installCmd,
    devCmd,
    runCmd,
    buildCmd,
    scripts,
    envVarsNeeded,
    packageManager,
    hasLockFile: hasPnpmLock || hasYarnLock,
    entryPoints,
  };
}

router.get("/:id/setup", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const memberSubquery = db.select({ workspaceId: memberships.workspaceId })
      .from(memberships).where(eq(memberships.userId, req.user!.id));
    const [p] = await db.select().from(projects).where(and(
      eq(projects.id, id), isNull(projects.deletedAt),
      or(eq(projects.ownerId, req.user!.id), sql`${projects.workspaceId} IN (${memberSubquery})`),
    )).limit(1);
    if (!p) return next(createError("Project not found", 404));

    const projectFiles = await db.select({ path: files.path, content: files.content })
      .from(files).where(and(eq(files.projectId, id), isNull(files.deletedAt)))
      .orderBy(asc(files.path)).limit(300);

    const setup = detectSetup(projectFiles, p.language ?? "nodejs");
    res.json({ data: setup });
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
  const slug = projectName.toLowerCase().replace(/\s+/g, "-");
  const starters: Record<string, { path: string; name: string; content: string; mimeType: string; isDir: boolean; size: number }[]> = {
    nodejs: [
      { path: "index.js", name: "index.js", mimeType: "application/javascript", isDir: false,
        content: `// ${projectName}\nconsole.log("Hello from ${projectName}!");\n`, size: 0 },
      { path: "package.json", name: "package.json", mimeType: "application/json", isDir: false,
        content: JSON.stringify({ name: slug, version: "1.0.0", main: "index.js" }, null, 2) + "\n", size: 0 },
    ],
    python: [
      { path: "main.py", name: "main.py", mimeType: "text/x-python", isDir: false,
        content: `# ${projectName}\n\ndef main():\n    print("Hello from ${projectName}!")\n\nif __name__ == "__main__":\n    main()\n`, size: 0 },
    ],
    typescript: [
      { path: "src/index.ts", name: "index.ts", mimeType: "text/typescript", isDir: false,
        content: `// ${projectName}\nconst main = (): void => {\n  console.log("Hello from ${projectName}!");\n};\nmain();\n`, size: 0 },
      { path: "package.json", name: "package.json", mimeType: "application/json", isDir: false,
        content: JSON.stringify({ name: slug, version: "1.0.0", scripts: { start: "ts-node src/index.ts", build: "tsc" }, devDependencies: { typescript: "^5.0.0", "ts-node": "^10.0.0" } }, null, 2) + "\n", size: 0 },
    ],
    html: [
      { path: "index.html", name: "index.html", mimeType: "text/html", isDir: false,
        content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>${projectName}</title>\n</head>\n<body>\n  <h1>${projectName}</h1>\n</body>\n</html>\n`, size: 0 },
    ],
    go: [
      { path: "main.go", name: "main.go", mimeType: "text/x-go", isDir: false,
        content: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from ${projectName}!")\n}\n`, size: 0 },
      { path: "go.mod", name: "go.mod", mimeType: "text/plain", isDir: false,
        content: `module ${slug}\n\ngo 1.21\n`, size: 0 },
    ],
    rust: [
      { path: "src/main.rs", name: "main.rs", mimeType: "text/x-rust", isDir: false,
        content: `fn main() {\n    println!("Hello from ${projectName}!");\n}\n`, size: 0 },
      { path: "Cargo.toml", name: "Cargo.toml", mimeType: "text/plain", isDir: false,
        content: `[package]\nname = "${slug}"\nversion = "0.1.0"\nedition = "2021"\n`, size: 0 },
    ],
    java: [
      { path: "Main.java", name: "Main.java", mimeType: "text/x-java", isDir: false,
        content: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from ${projectName}!");\n    }\n}\n`, size: 0 },
    ],
    kotlin: [
      { path: "main.kt", name: "main.kt", mimeType: "text/x-kotlin", isDir: false,
        content: `fun main() {\n    println("Hello from ${projectName}!")\n}\n`, size: 0 },
    ],
    swift: [
      { path: "main.swift", name: "main.swift", mimeType: "text/x-swift", isDir: false,
        content: `import Foundation\n\nprint("Hello from ${projectName}!")\n`, size: 0 },
    ],
    ruby: [
      { path: "main.rb", name: "main.rb", mimeType: "text/x-ruby", isDir: false,
        content: `# ${projectName}\nputs "Hello from ${projectName}!"\n`, size: 0 },
      { path: "Gemfile", name: "Gemfile", mimeType: "text/plain", isDir: false,
        content: `source "https://rubygems.org"\n\nruby "3.2.0"\n`, size: 0 },
    ],
    php: [
      { path: "index.php", name: "index.php", mimeType: "application/x-php", isDir: false,
        content: `<?php\n// ${projectName}\n\necho "Hello from ${projectName}!";\n`, size: 0 },
    ],
    cpp: [
      { path: "main.cpp", name: "main.cpp", mimeType: "text/x-c++src", isDir: false,
        content: `#include <iostream>\n\nint main() {\n    std::cout << "Hello from ${projectName}!" << std::endl;\n    return 0;\n}\n`, size: 0 },
    ],
    c: [
      { path: "main.c", name: "main.c", mimeType: "text/x-csrc", isDir: false,
        content: `#include <stdio.h>\n\nint main() {\n    printf("Hello from ${projectName}!\\n");\n    return 0;\n}\n`, size: 0 },
    ],
    csharp: [
      { path: "Program.cs", name: "Program.cs", mimeType: "text/x-csharp", isDir: false,
        content: `// ${projectName}\nConsole.WriteLine("Hello from ${projectName}!");\n`, size: 0 },
      { path: `${slug}.csproj`, name: `${slug}.csproj`, mimeType: "text/xml", isDir: false,
        content: `<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <OutputType>Exe</OutputType>\n    <TargetFramework>net8.0</TargetFramework>\n  </PropertyGroup>\n</Project>\n`, size: 0 },
    ],
    scala: [
      { path: "main.scala", name: "main.scala", mimeType: "text/x-scala", isDir: false,
        content: `@main def run(): Unit =\n  println("Hello from ${projectName}!")\n`, size: 0 },
    ],
    r: [
      { path: "main.R", name: "main.R", mimeType: "text/x-r", isDir: false,
        content: `# ${projectName}\ncat("Hello from ${projectName}!\\n")\n`, size: 0 },
    ],
    dart: [
      { path: "main.dart", name: "main.dart", mimeType: "text/x-dart", isDir: false,
        content: `void main() {\n  print('Hello from ${projectName}!');\n}\n`, size: 0 },
    ],
    elixir: [
      { path: "main.exs", name: "main.exs", mimeType: "text/x-elixir", isDir: false,
        content: `# ${projectName}\nIO.puts("Hello from ${projectName}!")\n`, size: 0 },
    ],
    haskell: [
      { path: "Main.hs", name: "Main.hs", mimeType: "text/x-haskell", isDir: false,
        content: `module Main where\n\nmain :: IO ()\nmain = putStrLn "Hello from ${projectName}!"\n`, size: 0 },
    ],
    bash: [
      { path: "main.sh", name: "main.sh", mimeType: "text/x-shellscript", isDir: false,
        content: `#!/bin/bash\n# ${projectName}\necho "Hello from ${projectName}!"\n`, size: 0 },
    ],
    lua: [
      { path: "main.lua", name: "main.lua", mimeType: "text/x-lua", isDir: false,
        content: `-- ${projectName}\nprint("Hello from ${projectName}!")\n`, size: 0 },
    ],
    perl: [
      { path: "main.pl", name: "main.pl", mimeType: "text/x-perl", isDir: false,
        content: `#!/usr/bin/perl\nuse strict;\nuse warnings;\n# ${projectName}\nprint "Hello from ${projectName}!\\n";\n`, size: 0 },
    ],
  };
  return (starters[language] ?? starters.nodejs).map((f) => ({
    ...f, size: Buffer.byteLength(f.content, "utf8"),
  }));
}

export default router;

import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, projects, files, memberships, runs, chatMessages } from "@workspace/db";
import { eq, and, or, isNull, ilike, sql, asc } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { cuid } from "../lib/cuid";
import { assertSafePath } from "../lib/pathValidation";

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

    for (const f of parsed.data.files) assertSafePath(f.path);
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
    solidity: [
      { path: "contracts/${slug}.sol", name: `${slug}.sol`, mimeType: "text/x-solidity", isDir: false,
        content: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\n/// @title ${projectName}\n/// @notice A smart contract for ${projectName}\ncontract ${projectName.replace(/\s+/g, "")} {\n    address public owner;\n\n    event Action(address indexed actor, string message);\n\n    modifier onlyOwner() {\n        require(msg.sender == owner, "Not owner");\n        _;\n    }\n\n    constructor() {\n        owner = msg.sender;\n    }\n\n    function greet() external pure returns (string memory) {\n        return "Hello from ${projectName}!";\n    }\n}\n`, size: 0 },
      { path: "hardhat.config.js", name: "hardhat.config.js", mimeType: "application/javascript", isDir: false,
        content: `require("@nomicfoundation/hardhat-toolbox");\nrequire("dotenv").config();\n\n/** @type import('hardhat/config').HardhatUserConfig */\nmodule.exports = {\n  solidity: {\n    version: "0.8.20",\n    settings: { optimizer: { enabled: true, runs: 200 } },\n  },\n  networks: {\n    hardhat: {},\n    sepolia: {\n      url: process.env.SEPOLIA_RPC_URL || "",\n      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],\n    },\n  },\n  etherscan: { apiKey: process.env.ETHERSCAN_API_KEY || "" },\n};\n`, size: 0 },
      { path: "package.json", name: "package.json", mimeType: "application/json", isDir: false,
        content: JSON.stringify({ name: slug, version: "1.0.0", scripts: { compile: "hardhat compile", test: "hardhat test", deploy: "hardhat run scripts/deploy.js --network hardhat", node: "hardhat node" }, devDependencies: { "@nomicfoundation/hardhat-toolbox": "^4.0.0", hardhat: "^2.19.0", dotenv: "^16.0.0" } }, null, 2) + "\n", size: 0 },
      { path: "scripts/deploy.js", name: "deploy.js", mimeType: "application/javascript", isDir: false,
        content: `const hre = require("hardhat");\n\nasync function main() {\n  const [deployer] = await hre.ethers.getSigners();\n  console.log("Deploying with account:", deployer.address);\n\n  const Contract = await hre.ethers.getContractFactory("${projectName.replace(/\s+/g, "")}");\n  const contract = await Contract.deploy();\n  await contract.waitForDeployment();\n\n  console.log("Contract deployed to:", await contract.getAddress());\n}\n\nmain().catch((e) => { console.error(e); process.exit(1); });\n`, size: 0 },
      { path: "test/test.js", name: "test.js", mimeType: "application/javascript", isDir: false,
        content: `const { expect } = require("chai");\nconst { ethers } = require("hardhat");\n\ndescribe("${projectName.replace(/\s+/g, "")}", function () {\n  let contract;\n\n  beforeEach(async function () {\n    const Factory = await ethers.getContractFactory("${projectName.replace(/\s+/g, "")}");\n    contract = await Factory.deploy();\n  });\n\n  it("Should return greeting", async function () {\n    expect(await contract.greet()).to.equal("Hello from ${projectName}!");\n  });\n\n  it("Should set correct owner", async function () {\n    const [owner] = await ethers.getSigners();\n    expect(await contract.owner()).to.equal(owner.address);\n  });\n});\n`, size: 0 },
      { path: ".env.example", name: ".env.example", mimeType: "text/plain", isDir: false,
        content: `SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY\nPRIVATE_KEY=0xYOUR_PRIVATE_KEY\nETHERSCAN_API_KEY=YOUR_ETHERSCAN_KEY\n`, size: 0 },
    ],
    vyper: [
      { path: `contracts/${slug}.vy`, name: `${slug}.vy`, mimeType: "text/x-vyper", isDir: false,
        content: `# @version ^0.3.10\n# @title ${projectName}\n# @notice A Vyper smart contract for ${projectName}\n\nowner: public(address)\n\n@deploy\ndef __init__():\n    self.owner = msg.sender\n\n@view\n@external\ndef greet() -> String[64]:\n    return "Hello from ${projectName}!"\n`, size: 0 },
      { path: "requirements.txt", name: "requirements.txt", mimeType: "text/plain", isDir: false,
        content: `vyper>=0.3.10\nweb3>=6.0.0\npy-solc-x>=1.1.1\n`, size: 0 },
      { path: "deploy.py", name: "deploy.py", mimeType: "text/x-python", isDir: false,
        content: `from vyper import compile_code\nfrom web3 import Web3\nimport os\n\nw3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL", "http://localhost:8545")))\n\nwith open("contracts/${slug}.vy") as f:\n    source = f.read()\n\nabi = compile_code(source, output_formats=["abi"])["abi"]\nbytecode = compile_code(source, output_formats=["bytecode"])["bytecode"]\n\nContract = w3.eth.contract(abi=abi, bytecode=bytecode)\nprint("ABI:", abi)\nprint("Deploy with: Contract.constructor().transact()")\n`, size: 0 },
    ],
    move: [
      { path: `sources/${slug}.move`, name: `${slug}.move`, mimeType: "text/x-move", isDir: false,
        content: `module ${slug}::${slug.replace(/-/g, "_")} {\n    use std::string;\n    use aptos_framework::account;\n\n    /// Core resource for ${projectName}\n    struct ProjectInfo has key {\n        name: string::String,\n        owner: address,\n    }\n\n    /// Initialize the module\n    public entry fun initialize(account: &signer) {\n        let info = ProjectInfo {\n            name: string::utf8(b"${projectName}"),\n            owner: aptos_framework::signer::address_of(account),\n        };\n        move_to(account, info);\n    }\n\n    #[view]\n    public fun get_name(addr: address): string::String acquires ProjectInfo {\n        borrow_global<ProjectInfo>(addr).name\n    }\n}\n`, size: 0 },
      { path: "Move.toml", name: "Move.toml", mimeType: "text/plain", isDir: false,
        content: `[package]\nname = "${slug}"\nversion = "1.0.0"\nauthors = []\n\n[addresses]\n${slug.replace(/-/g, "_")} = "_"\n\n[dependencies.AptosFramework]\ngit = "https://github.com/aptos-labs/aptos-core.git"\nrev = "main"\nsubdir = "aptos-move/framework/aptos-framework"\n`, size: 0 },
    ],
    bsv: [
      { path: "index.js", name: "index.js", mimeType: "application/javascript", isDir: false,
        content: `// ${projectName} — Bitcoin SV (BSV) project\nimport { PrivateKey, P2PKH, Transaction, ARC, WhatsOnChain } from "@bsv/sdk";\n\nconst NETWORK = "mainnet"; // or "testnet" | "stn"\nconst woc = new WhatsOnChain(NETWORK);\n\nasync function main() {\n  // ── 1. Generate / load a key pair ──────────────────────────────────────\n  const privKey = PrivateKey.fromRandom();\n  const address = privKey.toAddress();\n  console.log("BSV Address:", address.toString());\n\n  // ── 2. Query balance via WhatsOnChain ──────────────────────────────────\n  try {\n    const balance = await woc.getBalance(address.toString());\n    console.log("Balance:", balance, "satoshis");\n  } catch (e) {\n    console.log("Balance check skipped (no funds or testnet):", e.message);\n  }\n\n  // ── 3. Build a P2PKH transaction (unsigned skeleton) ───────────────────\n  const tx = new Transaction();\n  // tx.addInput({ ... });   // add UTXOs as inputs\n  // tx.addOutput({ lockingScript: new P2PKH().lock(recipientAddress), satoshis: 1000 });\n  // await tx.sign();        // sign all inputs\n  // const txid = await new ARC("https://api.taal.com/arc", { apiKey: "YOUR_KEY" }).broadcast(tx);\n  // console.log("Broadcast txid:", txid);\n\n  console.log("${projectName} ready. Fill in UTXOs and recipient to broadcast.");\n}\n\nmain().catch(console.error);\n`, size: 0 },
      { path: "package.json", name: "package.json", mimeType: "application/json", isDir: false,
        content: JSON.stringify({ name: slug, version: "1.0.0", type: "module", main: "index.js", scripts: { start: "node index.js", test: "node --test" }, dependencies: { "@bsv/sdk": "^1.0.0" } }, null, 2) + "\n", size: 0 },
      { path: "whatsonchain.js", name: "whatsonchain.js", mimeType: "application/javascript", isDir: false,
        content: `// WhatsOnChain API helper — ${projectName}\n// Docs: https://docs.whatsonchain.com\n\nconst NETWORK = "main"; // "main" | "test" | "stn"\nconst BASE = \`https://api.whatsonchain.com/v1/bsv/\${NETWORK}\`;\n\nexport async function getBalance(address) {\n  const r = await fetch(\`\${BASE}/address/\${address}/balance\`);\n  return r.json(); // { confirmed: number, unconfirmed: number }\n}\n\nexport async function getHistory(address) {\n  const r = await fetch(\`\${BASE}/address/\${address}/history\`);\n  return r.json();\n}\n\nexport async function getUtxos(address) {\n  const r = await fetch(\`\${BASE}/address/\${address}/unspent\`);\n  return r.json(); // [{ tx_hash, tx_pos, height, value }]\n}\n\nexport async function getTx(txid) {\n  const r = await fetch(\`\${BASE}/tx/hash/\${txid}\`);\n  return r.json();\n}\n\nexport async function getRawTx(txid) {\n  const r = await fetch(\`\${BASE}/tx/\${txid}/hex\`);\n  return r.text();\n}\n\nexport async function broadcastRaw(rawhex) {\n  const r = await fetch(\`\${BASE}/tx/raw\`, {\n    method: "POST",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify({ txhex: rawhex }),\n  });\n  return r.json(); // returns txid string on success\n}\n\nexport async function getMerkleProof(txid) {\n  const r = await fetch(\`\${BASE}/tx/\${txid}/proof\`);\n  return r.json(); // BUMP (BSV Unified Merkle Path)\n}\n`, size: 0 },
      { path: "README.md", name: "README.md", mimeType: "text/markdown", isDir: false,
        content: `# ${projectName}\n\nA Bitcoin SV (BSV) project built with the [@bsv/sdk](https://github.com/bitcoin-sv/ts-sdk).\n\n## Setup\n\n\`\`\`bash\nnpm install\nnode index.js\n\`\`\`\n\n## Key concepts\n\n- **WhatsOnChain** — Block explorer & REST API at \`api.whatsonchain.com/v1/bsv/{network}\`\n- **TeraNode** — BSV's high-performance node implementation\n- **ARC** — Transaction broadcast API (Taal: \`api.taal.com/arc\`)\n- **P2PKH** — Pay-to-Public-Key-Hash, the standard BSV locking script\n- **OP_RETURN** — Embed arbitrary data on-chain (up to ~100KB on BSV)\n- **BEEF** — Background Evaluation Extended Format (txs with embedded Merkle proofs)\n- **BUMP** — BSV Unified Merkle Path (compact SPV proof)\n\n## Networks\n\n| Network  | WoC Base URL                                    |\n|----------|-------------------------------------------------|\n| mainnet  | https://api.whatsonchain.com/v1/bsv/main        |\n| testnet  | https://api.whatsonchain.com/v1/bsv/test        |\n| STN      | https://api.whatsonchain.com/v1/bsv/stn         |\n`, size: 0 },
    ],
    scrypt: [
      { path: "src/contracts/HelloWorld.ts", name: "HelloWorld.ts", mimeType: "text/typescript", isDir: false,
        content: `import {\n  method,\n  prop,\n  SmartContract,\n  assert,\n  ByteString,\n  sha256,\n  Sha256,\n} from "scrypt-ts";\n\n/// @title ${projectName}\n/// @notice A sCrypt smart contract on Bitcoin SV\nexport class ${projectName.replace(/\s+/g, "")} extends SmartContract {\n  @prop()\n  readonly hash: Sha256;\n\n  constructor(hash: Sha256) {\n    super(...arguments);\n    this.hash = hash;\n  }\n\n  /// Unlock the contract by providing the pre-image of the stored hash\n  @method()\n  public unlock(message: ByteString) {\n    assert(sha256(message) === this.hash, "Hash mismatch");\n  }\n}\n`, size: 0 },
      { path: "src/deploy.ts", name: "deploy.ts", mimeType: "text/typescript", isDir: false,
        content: `import { ${slug.replace(/-/g, "")}  } from "./contracts/HelloWorld";\nimport { toByteString, sha256, bsv } from "scrypt-ts";\n\nasync function main() {\n  await ${slug.replace(/-/g, "")}.loadArtifact();\n\n  // Use a private key (testnet)\n  const privKey = bsv.PrivateKey.fromRandom("testnet");\n  const address = privKey.toAddress();\n  console.log("Deploy address (fund this on testnet):", address.toString());\n\n  const message = toByteString("hello bsv", true);\n  const instance = new ${slug.replace(/-/g, "")}(sha256(message));\n\n  // Connect a signer\n  // const signer = new TestWallet(privKey, new DefaultProvider({ network: bsv.Networks.testnet }));\n  // await instance.connect(signer);\n  // const deployTx = await instance.deploy(1000); // 1000 satoshis\n  // console.log("Deployed txid:", deployTx.id);\n}\n\nmain().catch(console.error);\n`, size: 0 },
      { path: "package.json", name: "package.json", mimeType: "application/json", isDir: false,
        content: JSON.stringify({ name: slug, version: "1.0.0", scripts: { compile: "npx scrypt-cli compile", deploy: "ts-node src/deploy.ts", test: "mocha --timeout 60000 tests/**/*.ts" }, dependencies: { "scrypt-ts": "latest" }, devDependencies: { typescript: "^5.0.0", "ts-node": "^10.0.0", mocha: "^10.0.0", "@types/node": "^20.0.0" } }, null, 2) + "\n", size: 0 },
      { path: "tsconfig.json", name: "tsconfig.json", mimeType: "application/json", isDir: false,
        content: JSON.stringify({ compilerOptions: { target: "ES2020", module: "commonjs", experimentalDecorators: true, emitDecoratorMetadata: true, strict: true, outDir: "dist" }, include: ["src/**/*", "tests/**/*"] }, null, 2) + "\n", size: 0 },
      { path: "tests/HelloWorld.test.ts", name: "HelloWorld.test.ts", mimeType: "text/typescript", isDir: false,
        content: `import { expect } from "chai";\nimport { ${slug.replace(/-/g, "")} } from "../src/contracts/HelloWorld";\nimport { toByteString, sha256 } from "scrypt-ts";\n\ndescribe("${projectName}", () => {\n  before(async () => {\n    await ${slug.replace(/-/g, "")}.loadArtifact();\n  });\n\n  it("should pass with correct pre-image", async () => {\n    const message = toByteString("hello bsv", true);\n    const instance = new ${slug.replace(/-/g, "")}(sha256(message));\n    // Call unlock — passes if no exception thrown\n    const result = instance.verify(() => instance.unlock(message));\n    expect(result.success).to.be.true;\n  });\n\n  it("should fail with wrong pre-image", async () => {\n    const instance = new ${slug.replace(/-/g, "")}(sha256(toByteString("hello bsv", true)));\n    expect(() => instance.verify(() => instance.unlock(toByteString("wrong", true)))).to.throw();\n  });\n});\n`, size: 0 },
    ],
    web3: [
      { path: "index.html", name: "index.html", mimeType: "text/html", isDir: false,
        content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${projectName}</title>\n  <script src="https://cdn.ethers.io/lib/ethers-5.7.2.umd.min.js"></script>\n  <style>\n    * { box-sizing: border-box; margin: 0; padding: 0; }\n    body { font-family: system-ui, sans-serif; background: #0f0f1a; color: #e2e8f0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }\n    .card { background: #1e1e3a; border: 1px solid #3d3d6b; border-radius: 16px; padding: 2rem; max-width: 480px; width: 100%; text-align: center; }\n    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; background: linear-gradient(135deg, #a78bfa, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }\n    p { color: #94a3b8; margin-bottom: 1.5rem; }\n    button { background: linear-gradient(135deg, #7c3aed, #2563eb); color: white; border: none; border-radius: 8px; padding: 0.75rem 1.5rem; font-size: 1rem; cursor: pointer; transition: opacity 0.2s; }\n    button:hover { opacity: 0.85; }\n    #status { margin-top: 1rem; font-size: 0.875rem; color: #94a3b8; word-break: break-all; }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h1>${projectName}</h1>\n    <p>A Web3 decentralized application</p>\n    <button id="connectBtn">Connect Wallet</button>\n    <div id="status">Not connected</div>\n  </div>\n  <script src="app.js"></script>\n</body>\n</html>\n`, size: 0 },
      { path: "app.js", name: "app.js", mimeType: "application/javascript", isDir: false,
        content: `// ${projectName} — Web3 dApp\nconst btn = document.getElementById("connectBtn");\nconst status = document.getElementById("status");\n\nlet provider, signer;\n\nasync function connectWallet() {\n  if (!window.ethereum) {\n    status.textContent = "MetaMask not detected. Please install MetaMask.";\n    return;\n  }\n  try {\n    provider = new ethers.providers.Web3Provider(window.ethereum);\n    await provider.send("eth_requestAccounts", []);\n    signer = provider.getSigner();\n    const address = await signer.getAddress();\n    const network = await provider.getNetwork();\n    const balance = await provider.getBalance(address);\n    status.innerHTML = [\n      \`<strong>Connected:</strong> \${address.slice(0,6)}...\${address.slice(-4)}\`,\n      \`<strong>Network:</strong> \${network.name} (chainId: \${network.chainId})\`,\n      \`<strong>Balance:</strong> \${ethers.utils.formatEther(balance)} ETH\`,\n    ].join("<br/>");\n    btn.textContent = "Connected ✓";\n  } catch (err) {\n    status.textContent = "Connection failed: " + err.message;\n  }\n}\n\nbtn.addEventListener("click", connectWallet);\n\n// Auto-reconnect if previously connected\nif (window.ethereum?.selectedAddress) connectWallet();\n`, size: 0 },
    ],
  };
  return (starters[language] ?? starters.nodejs).map((f) => ({
    ...f, size: Buffer.byteLength(f.content, "utf8"),
  }));
}

// ── Community (public projects) ───────────────────────────────────────────────

router.get("/community", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const search = String(req.query.search ?? "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    const conditions = [
      isNull(projects.deletedAt) as ReturnType<typeof eq>,
      sql`${projects.isPublic} = true` as unknown as ReturnType<typeof eq>,
      ...(search ? [ilike(projects.name, `%${search}%`) as ReturnType<typeof eq>] : []),
    ];

    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        language: projects.language,
        ownerId: projects.ownerId,
        ownerName: sql<string | null>`(SELECT name FROM users WHERE id = ${projects.ownerId})`,
        ownerUsername: sql<string>`(SELECT username FROM users WHERE id = ${projects.ownerId})`,
        updatedAt: projects.updatedAt,
        fileCount: sql<number>`(SELECT COUNT(*) FROM files WHERE project_id = ${projects.id} AND deleted_at IS NULL AND is_dir = false)`,
      })
      .from(projects)
      .where(and(...conditions))
      .orderBy(asc(projects.updatedAt))
      .limit(limit)
      .offset(offset);

    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(projects)
      .where(and(...conditions));

    res.json({ data: rows, total: Number(totalCount), page, limit });
  } catch (err) { next(err); }
});

// ── Fork a project ────────────────────────────────────────────────────────────

router.post("/:id/fork", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ workspaceId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("workspaceId required", 400));

    const sourceId = String(req.params.id);
    const [source] = await db.select().from(projects)
      .where(and(eq(projects.id, sourceId), isNull(projects.deletedAt), sql`${projects.isPublic} = true`)).limit(1);
    if (!source) return next(createError("Project not found or not public", 404));

    await assertWorkspaceMember(parsed.data.workspaceId, req.user!.id);

    const forkedId = cuid();
    const slug = await uniqueProjectSlug(parsed.data.workspaceId, slugify(source.name));

    await db.insert(projects).values({
      id: forkedId,
      name: `${source.name}`,
      slug,
      description: source.description,
      language: source.language,
      workspaceId: parsed.data.workspaceId,
      ownerId: req.user!.id,
      isPublic: false,
    });

    const sourceFiles = await db.select().from(files)
      .where(and(eq(files.projectId, sourceId), isNull(files.deletedAt)));

    if (sourceFiles.length > 0) {
      await db.insert(files).values(
        sourceFiles.map(f => ({ ...f, id: cuid(), projectId: forkedId, createdAt: new Date(), updatedAt: new Date() }))
      );
    }

    res.status(201).json({ data: { id: forkedId, name: source.name }, message: `Forked from ${source.name}` });
  } catch (err) { next(err); }
});

export default router;

import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, runs, projects, memberships, files } from "@workspace/db";
import { eq, and, or, isNull, desc, sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { cuid } from "../lib/cuid";
import { logger } from "../lib/logger";
import {
  prepareWorkspace,
  installDeps,
  spawnProcess,
  stopProcess,
  getProcess,
} from "../lib/processManager";

const router = Router();

const ENTRY_POINT: Record<string, string> = {
  nodejs:     "node index.js",
  typescript: "npx --yes tsx src/index.ts",
  python:     "python main.py",
  html:       "echo 'Open index.html in a browser'",
};

async function detectProjectSetup(projectId: string, language: string) {
  const projectFiles = await db.select({ path: files.path, content: files.content })
    .from(files).where(and(eq(files.projectId, projectId), isNull(files.deletedAt))).limit(50);

  const paths = projectFiles.map(f => f.path.toLowerCase());
  const hasPnpmLock = paths.some(p => p.includes("pnpm-lock"));
  const hasYarnLock = paths.some(p => p.includes("yarn.lock"));
  const packageManager = hasPnpmLock ? "pnpm" : hasYarnLock ? "yarn" : "npm";

  const pkgFile = projectFiles.find(f => f.path === "package.json");
  let scripts: Record<string, string> = {};
  let framework = language === "python" ? "Python" : language === "typescript" ? "TypeScript" : "Node.js";
  let devCmd: string | null = null;

  if (pkgFile?.content) {
    try {
      const pkg = JSON.parse(pkgFile.content) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      scripts = pkg.scripts ?? {};
      devCmd = scripts.dev ?? scripts.develop ?? scripts.start ?? null;
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if (deps["next"]) framework = "Next.js";
      else if (deps["vite"]) framework = "Vite";
      else if (deps["react"]) framework = "React";
      else if (deps["vue"]) framework = "Vue.js";
      else if (deps["svelte"]) framework = "Svelte";
      else if (deps["express"]) framework = "Express.js";
      else if (deps["astro"]) framework = "Astro";
    } catch { /* ignore */ }
  }

  const hasReqTxt = paths.some(p => p.includes("requirements.txt"));
  if (hasReqTxt) { framework = "Python"; devCmd = "python main.py"; }
  if (paths.some(p => p.endsWith("cargo.toml"))) { framework = "Rust / Cargo"; devCmd = "cargo run"; }
  if (paths.some(p => p.endsWith("go.mod"))) { framework = "Go"; devCmd = "go run ."; }

  const installCmd = packageManager === "pnpm" ? "pnpm install" : packageManager === "yarn" ? "yarn" : "npm install";

  return { framework, scripts, devCmd, installCmd, packageManager };
}

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

// ── POST /api/runs/:projectId — start a run ─────────────────────────────────
router.post("/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await assertProjectAccess(projectId, req.user!.id);
    const schema = z.object({ command: z.string().max(500).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

    let command = parsed.data.command;
    if (!command) {
      const setup = await detectProjectSetup(project.id, project.language);
      command = setup.devCmd ?? ENTRY_POINT[project.language] ?? "node index.js";
    }

    // Sanitize common AI-generated malformed patterns
    if (/^npm install\s+npm\s/.test(command)) {
      command = command.replace(/^npm install\s+(npm\s+run\s+)/, "npm install && $1");
    }

    const runId = cuid();
    const [run] = await db.insert(runs).values({
      id: runId, projectId: project.id, command, status: "running",
    }).returning();

    const sandboxUrl = process.env.SANDBOX_URL;
    if (sandboxUrl) {
      fetch(`${sandboxUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id, projectId: project.id, command, language: project.language }),
      }).catch(() => {
        db.update(runs).set({ status: "error", output: "Sandbox service unavailable", completedAt: new Date() })
          .where(eq(runs.id, run.id)).catch((e: unknown) => logger.warn({ err: e }, "Failed to update run status"));
      });
      return res.status(202).json({ data: run });
    }

    // Local persistent execution
    (async () => {
      try {
        const projectFiles = await db
          .select({ path: files.path, content: files.content })
          .from(files)
          .where(and(eq(files.projectId, project.id), isNull(files.deletedAt)));

        const dir = await prepareWorkspace(project.id, projectFiles);

        // Stream install output before starting the main process
        const installOutput = await installDeps(dir);
        if (installOutput) {
          const { getIo } = await import("../lib/ioSingleton");
          getIo()?.to(`project:${projectId}`).emit("terminal:output", {
            projectId, runId: run.id, data: installOutput,
          });
        }

        // Spawn the long-running process
        const mp = await spawnProcess(project.id, run.id, command, dir);

        // Update run to running state
        await db.update(runs).set({ status: "running" }).where(eq(runs.id, run.id));

        // When process exits, update the DB record
        mp.proc.once("close", async (code) => {
          await db.update(runs).set({
            status: code === 0 ? "success" : "error",
            output: mp.outputBuf.slice(-50_000),
            exitCode: code ?? -1,
            completedAt: new Date(),
          }).where(eq(runs.id, run.id)).catch(() => undefined);
        });
      } catch (e) {
        logger.warn({ err: e }, "Local executor error");
        await db.update(runs).set({
          status: "error",
          output: String((e as Error).message ?? "Execution failed"),
          completedAt: new Date(),
        }).where(eq(runs.id, run.id));
      }
    })();

    res.status(202).json({ data: run });
  } catch (err) { next(err); }
});

// ── DELETE /api/runs/:projectId/stop — kill running process ─────────────────
router.delete("/:projectId/stop", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    await assertProjectAccess(projectId, req.user!.id);
    const stopped = stopProcess(projectId);
    res.json({ data: { stopped } });
  } catch (err) { next(err); }
});

// ── GET /api/runs/:projectId/status — check running process status ───────────
router.get("/:projectId/status", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    await assertProjectAccess(projectId, req.user!.id);
    const mp = getProcess(projectId);
    res.json({ data: { running: !!mp?.alive, port: mp?.port ?? null, runId: mp?.runId ?? null } });
  } catch (err) { next(err); }
});

// ── GET /api/runs/:projectId — list runs ────────────────────────────────────
router.get("/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    await assertProjectAccess(projectId, req.user!.id);
    const rows = await db.select().from(runs).where(eq(runs.projectId, projectId)).orderBy(desc(runs.createdAt)).limit(50);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ── GET /api/runs/:projectId/:runId — single run ────────────────────────────
router.get("/:projectId/:runId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    const runId = String(req.params.runId);
    await assertProjectAccess(projectId, req.user!.id);
    const [run] = await db.select().from(runs)
      .where(and(eq(runs.id, runId), eq(runs.projectId, projectId))).limit(1);
    if (!run) return next(createError("Run not found", 404));
    res.json({ data: run });
  } catch (err) { next(err); }
});

// ── POST /api/runs/callback/result — sandbox callback ───────────────────────
router.post("/callback/result", async (req, res, next) => {
  try {
    const internalKey = process.env.SANDBOX_INTERNAL_KEY;
    const provided = req.headers["x-internal-key"];
    if (!internalKey || provided !== internalKey) {
      return next(createError("Unauthorized", 401));
    }
    const schema = z.object({
      runId: z.string(), status: z.enum(["success", "error"]),
      output: z.string(), exitCode: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));
    const [run] = await db.update(runs).set({
      status: parsed.data.status, output: parsed.data.output,
      exitCode: parsed.data.exitCode ?? null, completedAt: new Date(),
    }).where(eq(runs.id, parsed.data.runId)).returning();
    res.json({ data: run });
  } catch (err) { next(err); }
});

export default router;

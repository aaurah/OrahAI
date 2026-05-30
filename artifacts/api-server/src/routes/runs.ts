import { Router, type Response, type NextFunction } from "express";
import * as fs from "fs/promises";
import * as path from "path";
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
  installPythonDeps,
  spawnProcess,
  stopProcess,
  getProcess,
} from "../lib/processManager";

const router = Router();

// Conventional entry-point filenames, checked in priority order per language.
const PY_ENTRIES = ["main.py", "app.py", "run.py", "manage.py", "server.py", "bot.py", "wsgi.py", "asgi.py", "__main__.py", "index.py"];
const TS_ENTRIES = ["src/index.ts", "index.ts", "src/main.ts", "main.ts", "src/server.ts", "server.ts", "app.ts", "src/app.ts"];
const NODE_ENTRIES = ["index.js", "src/index.js", "server.js", "app.js", "main.js"];

function commandForEntry(entry: string): string {
  if (entry.endsWith(".py")) return `python ${entry}`;
  if (entry.endsWith(".ts")) return `npx --yes tsx ${entry}`;
  return `node ${entry}`;
}

// Pick a run command from an entry file that ACTUALLY exists in the project,
// preferring the project's declared language. Returns null if none is found.
function findEntryCommand(pathSet: Set<string>, language: string): string | null {
  const order =
    language === "python" ? [PY_ENTRIES, TS_ENTRIES, NODE_ENTRIES]
    : language === "typescript" ? [TS_ENTRIES, NODE_ENTRIES, PY_ENTRIES]
    : [NODE_ENTRIES, TS_ENTRIES, PY_ENTRIES];
  for (const list of order) for (const c of list) if (pathSet.has(c)) return commandForEntry(c);
  return null;
}

// Extract the source file a run command will execute, so we can verify it
// exists before spawning and surface a friendly error instead of a raw OS error.
function extractEntryFile(command: string): string | null {
  const m =
    command.match(/\b(?:python3?|bun)\s+([^\s&|;><]+\.[A-Za-z0-9]+)/) ||
    command.match(/\bnode\s+([^\s&|;><]+\.[A-Za-z0-9]+)/) ||
    command.match(/\b(?:tsx|ts-node)\s+([^\s&|;><]+)/);
  return m ? m[1] : null;
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function detectProjectSetup(projectId: string, language: string) {
  const projectFiles = await db.select({ path: files.path, content: files.content })
    .from(files).where(and(eq(files.projectId, projectId), isNull(files.deletedAt), eq(files.isDir, false)));

  const pathSet = new Set(projectFiles.map(f => f.path));
  const lowerSet = new Set(projectFiles.map(f => f.path.toLowerCase()));
  // Marker files only count when they sit at the project ROOT — a requirements.txt
  // or go.mod vendored deep inside a subdirectory must not hijack the run command.
  const hasRoot = (name: string) => lowerSet.has(name.toLowerCase());

  const packageManager = hasRoot("pnpm-lock.yaml") ? "pnpm" : hasRoot("yarn.lock") ? "yarn" : "npm";

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

  if (!devCmd) {
    if (hasRoot("requirements.txt") || hasRoot("pyproject.toml") || hasRoot("pipfile")) framework = "Python";
    else if (hasRoot("cargo.toml")) { framework = "Rust / Cargo"; devCmd = "cargo run"; }
    else if (hasRoot("go.mod")) { framework = "Go"; devCmd = "go run ."; }
  }

  // Last resort: a real entry-point file that exists in the project tree.
  if (!devCmd) devCmd = findEntryCommand(pathSet, language);

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

    let command = parsed.data.command?.trim() ?? "";
    if (!command) {
      const setup = await detectProjectSetup(project.id, project.language);
      command = setup.devCmd ?? "";
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
      const { getIo } = await import("../lib/ioSingleton");
      const emitTerminal = (data: string) =>
        getIo()?.to(`project:${projectId}`).emit("terminal:output", { projectId, runId: run.id, data });
      const emitStopped = () =>
        getIo()?.to(`project:${projectId}`).emit("process:stopped", { projectId, runId: run.id, exitCode: 1 });

      try {
        // Only sync actual file content, not directory entries
        const projectFiles = await db
          .select({ path: files.path, content: files.content })
          .from(files)
          .where(and(eq(files.projectId, project.id), isNull(files.deletedAt), eq(files.isDir, false)));

        if (projectFiles.length === 0) {
          const msg =
            "\r\n\x1b[33m[No files found in project]\x1b[0m\r\n" +
            "Create at least one file (e.g. \x1b[36mmain.py\x1b[0m, \x1b[36mindex.js\x1b[0m, or \x1b[36mindex.html\x1b[0m) " +
            "then click \x1b[1mRun\x1b[0m again.\r\n";
          emitTerminal(msg);
          emitStopped();
          await db.update(runs).set({ status: "error", output: "No files in project", completedAt: new Date() })
            .where(eq(runs.id, run.id));
          return;
        }

        // No entry point could be detected for this project.
        if (!command) {
          const msg =
            "\r\n\x1b[33m[No run command detected]\x1b[0m\r\n" +
            "Couldn't find a runnable entry point (e.g. \x1b[36mmain.py\x1b[0m, \x1b[36mindex.js\x1b[0m, or \x1b[36msrc/index.ts\x1b[0m) " +
            "at the project root.\r\nAdd one, or type a command in the terminal and press \x1b[1mRun\x1b[0m.\r\n";
          emitTerminal(msg);
          emitStopped();
          await db.update(runs).set({ status: "error", output: "No run command detected", completedAt: new Date() })
            .where(eq(runs.id, run.id));
          return;
        }

        const dir = await prepareWorkspace(project.id, projectFiles);
        emitTerminal(`\r\n\x1b[90m[Synced ${projectFiles.length} file${projectFiles.length !== 1 ? "s" : ""}]\x1b[0m\r\n`);

        // Verify the entry file the command will execute actually exists, so we
        // surface a clear message instead of a raw "can't open file" OS error.
        const entryFile = extractEntryFile(command);
        if (entryFile) {
          const resolvedDir = path.resolve(dir);
          const entryFull = path.resolve(dir, entryFile);
          const within = entryFull === resolvedDir || entryFull.startsWith(resolvedDir + path.sep);
          if (!within || !(await fileExists(entryFull))) {
            const runnable = projectFiles
              .map(f => f.path)
              .filter(p => !p.includes("/") && /\.(py|js|mjs|cjs|ts)$/.test(p))
              .slice(0, 8);
            const hint = runnable.length
              ? `Runnable files at the project root: \x1b[36m${runnable.join("\x1b[0m, \x1b[36m")}\x1b[0m.\r\n` +
                "Rename your entry file or type the correct command in the terminal.\r\n"
              : "No runnable entry file was found at the project root.\r\n";
            emitTerminal(
              `\r\n\x1b[33m[Entry point not found: ${entryFile}]\x1b[0m\r\n` + hint,
            );
            emitStopped();
            await db.update(runs).set({ status: "error", output: `Entry point not found: ${entryFile}`, completedAt: new Date() })
              .where(eq(runs.id, run.id));
            return;
          }
        }

        emitTerminal(`\x1b[90m[Running: \x1b[0m\x1b[36m${command}\x1b[90m]\x1b[0m\r\n`);

        // Stream install output before starting the main process
        const installOutput = await installDeps(dir);
        if (installOutput) emitTerminal(installOutput);

        const pythonInstallOutput = await installPythonDeps(dir);
        if (pythonInstallOutput) emitTerminal(pythonInstallOutput);

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

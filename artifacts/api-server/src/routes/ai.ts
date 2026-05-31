import { Router, type Response, type NextFunction } from "express";
import { exec as _exec } from "child_process";
import { z } from "zod";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { db, chatMessages, projects, memberships, files, runs as runsTable, mcpServers, projectSecrets } from "@workspace/db";
import { prepareWorkspace, installDeps, installPythonDeps, spawnProcess, stopProcess } from "../lib/processManager";
import { eq, and, or, isNull, asc, desc, sql } from "drizzle-orm";
import { discoverAllMcpTools, callMcpTool, type McpTool, type McpServerConfig } from "../lib/mcpClient";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { aiRateLimiter } from "../middlewares/rateLimit";
import { cuid } from "../lib/cuid";
import { logger } from "../lib/logger";

const router = Router();

function getAnthropicClient(): Anthropic | null {
  const proxyBase = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const proxyKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const ownKey    = process.env.ANTHROPIC_API_KEY;
  const apiKey    = ownKey ?? proxyKey;
  if (!apiKey && !proxyBase) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Anthropic({ ...(proxyBase && !ownKey ? { baseURL: proxyBase } : {}), apiKey: apiKey ?? "dummy" } as any);
}

function getGithubCopilotClient(): OpenAI | null {
  const token = process.env.GITHUB_COPILOT_TOKEN;
  if (!token) return null;
  return new OpenAI({
    baseURL: "https://api.githubcopilot.com",
    apiKey: token,
    defaultHeaders: { "Copilot-Integration-Id": "vscode-chat" },
  });
}

function toAnthropicMessages(msgs: OpenAI.ChatCompletionMessageParam[]): unknown[] {
  return msgs
    .filter(m => m.role !== "system")
    .map(m => {
      const role = m.role as "user" | "assistant";
      if (typeof m.content === "string") return { role, content: m.content };
      if (!Array.isArray(m.content)) return { role, content: String(m.content ?? "") };
      const blocks = (m.content as OpenAI.ChatCompletionContentPart[]).map(p => {
        if (p.type === "text") return { type: "text", text: p.text };
        if (p.type === "image_url") {
          const url = p.image_url.url;
          if (url.startsWith("data:")) {
            const sep = url.indexOf(",");
            const header = url.slice(0, sep);
            const data = url.slice(sep + 1);
            const mediaType = (header.match(/data:([^;]+)/) ?? [])[1] ?? "image/jpeg";
            return { type: "image", source: { type: "base64", media_type: mediaType, data } };
          }
          return { type: "text", text: url };
        }
        return { type: "text", text: "" };
      });
      return { role, content: blocks };
    });
}

// ── In-memory background job tracker ─────────────────────────────────────────
// Keeps a record of in-flight AI requests so clients can re-subscribe after
// closing and reopening the tab.  Lives in process memory — fine for single-
// instance deployments; jobs are auto-evicted after 30 minutes.

interface ActiveJob {
  projectId: string;
  startedAt: Date;
  timer: ReturnType<typeof setTimeout>;
}

const activeJobs = new Map<string, ActiveJob>();

function registerJob(projectId: string) {
  const existing = activeJobs.get(projectId);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => activeJobs.delete(projectId), 30 * 60 * 1000);
  activeJobs.set(projectId, { projectId, startedAt: new Date(), timer });
}

function unregisterJob(projectId: string) {
  const job = activeJobs.get(projectId);
  if (job) { clearTimeout(job.timer); activeJobs.delete(projectId); }
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

// ── Strip ANSI escape codes (for clean AI-readable output) ───────────────────
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[mGKHFABCDJhp]|\x1b\][^\x07]*\x07|\x1b[=>]/g, "");
}

// ── Detect the run command for a project ────────────────────────────────────
async function detectAiRunCommand(projectId: string, language: string): Promise<string> {
  const projectFiles = await db
    .select({ path: files.path, content: files.content })
    .from(files)
    .where(and(eq(files.projectId, projectId), isNull(files.deletedAt)));

  const paths = projectFiles.map(f => f.path.toLowerCase());

  if (language === "python" || paths.some(p => p.includes("requirements.txt"))) {
    for (const name of ["main.py", "app.py", "server.py", "run.py", "index.py"]) {
      if (paths.some(p => p.endsWith(name))) return `python ${name}`;
    }
    const py = paths.find(p => p.endsWith(".py"));
    return py ? `python ${py}` : "python main.py";
  }
  if (paths.some(p => p.endsWith("cargo.toml"))) return "cargo run";
  if (paths.some(p => p.endsWith("go.mod"))) return "go run .";
  if (language === "html") return 'python -m http.server 3000';

  const pkgFile = projectFiles.find(f => f.path === "package.json");
  if (pkgFile?.content) {
    try {
      const pkg = JSON.parse(pkgFile.content) as { scripts?: Record<string, string> };
      const s = pkg.scripts ?? {};
      if (s.dev)   return "npm run dev";
      if (s.start) return "npm start";
    } catch { /* ignore */ }
  }
  if (language === "typescript") return "npx --yes tsx src/index.ts";
  return "node index.js";
}

// ── Run the project and capture output for the AI ────────────────────────────
interface AiRunResult {
  command: string;
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

async function runProjectForAI(
  projectId: string,
  language: string,
  runIdx: number,
  send: (evt: object) => void,
): Promise<AiRunResult> {
  const command = await detectAiRunCommand(projectId, language);
  const runId = cuid();

  // Re-load files (may have just been written by WRITE ops)
  const projectFiles = await db
    .select({ path: files.path, content: files.content })
    .from(files)
    .where(and(eq(files.projectId, projectId), isNull(files.deletedAt)));

  const dir = await prepareWorkspace(projectId, projectFiles);

  // Install dependencies silently
  await installDeps(dir);
  await installPythonDeps(dir);

  send({ type: "run_start", idx: runIdx, command });

  const mp = await spawnProcess(projectId, runId, command, dir);

  // Also insert a DB run record so the Console shows it
  await db.insert(runsTable).values({
    id: runId, projectId, command, status: "running",
  }).catch(() => undefined);

  return new Promise<AiRunResult>((resolve) => {
    let settled = false;

    const finish = (timedOut: boolean) => {
      if (settled) return;
      settled = true;

      if (mp.alive) stopProcess(projectId);

      const output = stripAnsi(mp.outputBuf)
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim()
        .slice(0, 8000);

      const exitCode = mp.exitCode;
      const isServer = mp.port !== null;

      // Update DB run record
      db.update(runsTable).set({
        status: exitCode === 0 ? "success" : (timedOut && isServer ? "running" : "error"),
        output: output.slice(0, 50_000),
        exitCode: exitCode ?? undefined,
        completedAt: timedOut && isServer ? undefined : new Date(),
      }).where(eq(runsTable.id, runId)).catch(() => undefined);

      send({
        type: "run_result",
        idx: runIdx,
        command,
        output,
        exitCode,
        status: exitCode === 0 ? "success" : (timedOut && isServer ? "running" : "error"),
      });

      resolve({ command, output, exitCode, timedOut });
    };

    // Script exits naturally
    mp.proc.once("close", () => setTimeout(() => finish(false), 300));

    // Poll for port detection (server start)
    let serverTimer: ReturnType<typeof setTimeout> | null = null;
    const scriptTimer = setTimeout(() => finish(true), 20_000);

    const portPoll = setInterval(() => {
      if (!mp.alive) {
        clearInterval(portPoll);
        if (serverTimer) clearTimeout(serverTimer);
        clearTimeout(scriptTimer);
        return;
      }
      if (mp.port && !serverTimer) {
        // Server started — give it a few more seconds to print useful output
        clearTimeout(scriptTimer);
        serverTimer = setTimeout(() => {
          clearInterval(portPoll);
          finish(true);
        }, 5_000);
      }
    }, 400);
  });
}

// ── Parse <<<WRITE:path>>> ... <<<END>>> and <<<DELETE:path>>> blocks ─────────
interface FileOp {
  action: "write" | "delete";
  path: string;
  content?: string;
}

function extractFileOps(content: string): FileOp[] {
  const ops: FileOp[] = [];

  // WRITE blocks: <<<WRITE:path>>>\ncontent\n<<<END>>>
  const writeRe = /<<<WRITE:([^\n>]+)>>>\n([\s\S]*?)<<<END>>>/g;
  let m: RegExpExecArray | null;
  while ((m = writeRe.exec(content)) !== null) {
    const path = m[1].trim();
    const fileContent = m[2];
    if (path && !path.includes("..") && !path.startsWith("/")) {
      ops.push({ action: "write", path, content: fileContent });
    }
  }

  // DELETE blocks: <<<DELETE:path>>>
  const deleteRe = /<<<DELETE:([^\n>]+)>>>/g;
  while ((m = deleteRe.exec(content)) !== null) {
    const path = m[1].trim();
    if (path && !path.includes("..") && !path.startsWith("/")) {
      ops.push({ action: "delete", path });
    }
  }

  return ops;
}

// ── Parse <<<MCP_CALL:server:tool>>> ... <<<MCP_END>>> blocks ────────────────
interface McpCallOp {
  serverName: string;
  toolName: string;
  args: Record<string, unknown>;
}

function extractMcpCalls(content: string): McpCallOp[] {
  const ops: McpCallOp[] = [];
  const re = /<<<MCP_CALL:([^:>]+):([^>]+)>>>\s*([\s\S]*?)<<<MCP_END>>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const serverName = m[1].trim();
    const toolName   = m[2].trim();
    const rawArgs    = m[3].trim();
    let args: Record<string, unknown> = {};
    if (rawArgs) {
      try { args = JSON.parse(rawArgs); } catch { /* leave empty */ }
    }
    ops.push({ serverName, toolName, args });
  }
  return ops;
}

// ── Extract <<<READ:path>>> on-demand file fetch requests ─────────────────────
function extractReadOps(content: string): string[] {
  const paths: string[] = [];
  const re = /<<<READ:([^\n>]+)>>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const p = m[1].trim();
    if (p && !p.includes("..") && !p.startsWith("/")) paths.push(p);
  }
  return [...new Set(paths)];
}

// ── Extract <<<SEARCH:pattern>>> code search requests ─────────────────────────
function extractSearchOps(content: string): string[] {
  const patterns: string[] = [];
  const re = /<<<SEARCH:([^\n>]+)>>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const p = m[1].trim();
    if (p) patterns.push(p);
  }
  return [...new Set(patterns)];
}

// ── Extract <<<CMD:command>>> arbitrary shell command requests ─────────────────
// NOTE: blocklist cannot be exhaustive; these commands run in a project workspace
// under /tmp/orahai-runs. All executions are logged for audit.
const BLOCKED_CMD_PATTERNS = [
  // Destructive recursive removal targeting absolute paths, home, or parent dirs
  /rm\s+.*-[a-z]*r[a-z]*f[a-z]*\s+[/~]/, /rm\s+.*-[a-z]*f[a-z]*r[a-z]*\s+[/~]/,
  /rm\s+(-[rf]{1,2}\s+)+\.\./,
  // Disk-level destruction
  /mkfs/, /dd\s+if=\/dev\/(zero|random|urandom)\s+of=\/dev\//, /shred\s+\/dev\//,
  // System control
  /\b(shutdown|reboot|halt|poweroff)\b/, /\binit\s+[0-6]\b/,
  /systemctl\s+(stop|disable|mask)\b/,
  // Privilege escalation
  /\bsudo\b/, /\bsu\s*(root|-\s*$)/,
  // Fork bomb
  /:\(\)\s*\{/,
  // Reverse shell patterns
  /\/dev\/tcp\//, /\/dev\/udp\//,
  /\bnc\b.*-e\s*(bash|sh|cmd)/i,
  // Download-and-execute patterns
  /\b(curl|wget)\b.*\|\s*(bash|sh|zsh|fish|python\d?|perl|ruby|node)\b/i,
  // Writing to sensitive system paths
  /[|>]\s*\/(etc|root|boot|usr\/bin|usr\/sbin|bin|sbin)\//, /\btee\s+\/(etc|root)\//,
  // chmod/chown system dirs
  /chmod\s+-R\s+[0-9]*7[0-9]*\s+\//, /chown\s+-R[^\s]*\s+\//,
  // Null byte
  /\x00/,
];

function extractCmdOps(content: string): string[] {
  const cmds: string[] = [];
  const re = /<<<CMD:([^\n]+)>>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const cmd = m[1].trim();
    if (!cmd) continue;
    const blocked = BLOCKED_CMD_PATTERNS.some(p => p.test(cmd));
    if (!blocked) cmds.push(cmd);
  }
  return cmds;
}

// ── Run a one-shot command in the project workspace ──────────────────────────
interface CmdExResult { cmd: string; stdout: string; stderr: string; exitCode: number }

function runCmdInProject(cmd: string, dir: string): Promise<CmdExResult> {
  return new Promise(resolve => {
    _exec(cmd, { cwd: dir, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        cmd,
        stdout: stripAnsi(stdout ?? "").slice(0, 4000),
        stderr: stripAnsi(stderr ?? "").slice(0, 2000),
        exitCode: (err as NodeJS.ErrnoException | null)?.code !== undefined
          ? Number((err as NodeJS.ErrnoException).code)
          : (err ? 1 : 0),
      });
    });
  });
}

// ── Extract @filename mentions from a user message ────────────────────────────
function extractMentions(message: string): string[] {
  const re = /@([\w./-]+)/g;
  const paths: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    paths.push(m[1]);
  }
  return [...new Set(paths)];
}

function mimeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    js: "application/javascript", ts: "text/typescript", tsx: "text/typescript",
    jsx: "text/javascript", py: "text/x-python", html: "text/html", css: "text/css",
    json: "application/json", md: "text/markdown", sh: "text/x-shellscript",
    yaml: "text/yaml", yml: "text/yaml", go: "text/x-go", rs: "text/x-rust",
    java: "text/x-java", sql: "text/x-sql", toml: "text/plain", env: "text/plain",
  };
  return map[ext] ?? "text/plain";
}

// Write or update a file in the DB
async function upsertFile(projectId: string, filePath: string, content: string) {
  const name = filePath.split("/").pop() ?? filePath;
  const mime = mimeFromPath(filePath);
  const size = Buffer.byteLength(content, "utf8");

  // Ensure parent directories exist
  const parts = filePath.split("/");
  for (let i = 1; i < parts.length; i++) {
    const dirPath = parts.slice(0, i).join("/");
    const dirName = parts[i - 1];
    const [existingDir] = await db.select({ id: files.id })
      .from(files).where(and(eq(files.projectId, projectId), eq(files.path, dirPath))).limit(1);
    if (!existingDir) {
      await db.insert(files).values({
        id: cuid(), projectId, path: dirPath, name: dirName,
        content: "", mimeType: "inode/directory", size: 0, isDir: true,
      }).onConflictDoNothing();
    }
  }

  const [existing] = await db.select({ id: files.id })
    .from(files).where(and(eq(files.projectId, projectId), eq(files.path, filePath))).limit(1);

  let file;
  if (existing) {
    [file] = await db.update(files)
      .set({ content, size, mimeType: mime, deletedAt: null, updatedAt: new Date() })
      .where(eq(files.id, existing.id)).returning();
  } else {
    [file] = await db.insert(files).values({
      id: cuid(), projectId, path: filePath, name, content, mimeType: mime, size, isDir: false,
    }).returning();
  }

  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
  return file;
}

// Soft-delete a file in the DB
async function deleteFile(projectId: string, filePath: string) {
  const [existing] = await db.select({ id: files.id })
    .from(files).where(and(eq(files.projectId, projectId), eq(files.path, filePath), isNull(files.deletedAt))).limit(1);
  if (!existing) return false;
  await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, existing.id));
  return true;
}

interface FileOpResult {
  path: string; action: string; success: boolean; size?: number; error?: string;
}
interface CmdResult {
  command: string; status: string; output: string; exitCode?: number;
}
interface McpResult {
  serverName: string; toolName: string; ok: boolean; output: string;
}
interface ReadResult {
  path: string; content: string; found: boolean;
}
interface SearchResult {
  pattern: string; matches: Array<{ path: string; lineNumber: number; line: string }>;
}

function buildContinuationMessage(
  step: number,
  fileOps: FileOpResult[],
  cmds: CmdResult[],
  mcpResults: McpResult[] = [],
  runResults: AiRunResult[] = [],
  readResults: ReadResult[] = [],
  searchResults: SearchResult[] = [],
  cmdExResults: CmdExResult[] = [],
): string {
  const lines: string[] = [`[Tool results from step ${step}]`];

  // ── READ results ────────────────────────────────────────────────────────────
  if (readResults.length > 0) {
    lines.push("\nFile reads:");
    for (const r of readResults) {
      if (r.found) {
        lines.push(`\n--- ${r.path} ---`);
        lines.push(r.content + (r.content.length >= 8000 ? "\n...(truncated to 8000 chars)" : ""));
      } else {
        lines.push(`  ✗ READ ${r.path} — file not found`);
      }
    }
  }

  // ── SEARCH results ──────────────────────────────────────────────────────────
  if (searchResults.length > 0) {
    lines.push("\nSearch results:");
    for (const r of searchResults) {
      if (r.matches.length === 0) {
        lines.push(`  Pattern "${r.pattern}": no matches`);
      } else {
        lines.push(`  Pattern "${r.pattern}": ${r.matches.length} match(es)`);
        for (const m of r.matches) {
          lines.push(`    ${m.path}:${m.lineNumber}  ${m.line}`);
        }
      }
    }
  }

  // ── CMD results ─────────────────────────────────────────────────────────────
  if (cmdExResults.length > 0) {
    lines.push("\nShell command results:");
    for (const r of cmdExResults) {
      lines.push(`\n$ ${r.cmd}`);
      lines.push(`Exit code: ${r.exitCode}`);
      if (r.stdout) lines.push(`stdout:\n${r.stdout}`);
      if (r.stderr) lines.push(`stderr:\n${r.stderr}`);
    }
  }

  // ── File op results ─────────────────────────────────────────────────────────
  if (fileOps.length > 0) {
    lines.push("\nFile operations:");
    for (const op of fileOps) {
      if (op.success) {
        lines.push(`  ✓ ${op.action.toUpperCase()} ${op.path}${op.size !== undefined ? ` (${op.size} bytes)` : ""}`);
      } else {
        lines.push(`  ✗ ${op.action.toUpperCase()} ${op.path} — ERROR: ${op.error}`);
      }
    }
  }

  if (cmds.length > 0) {
    lines.push("\nCommand results:");
    for (const cmd of cmds) {
      lines.push(`\n$ ${cmd.command}`);
      lines.push(`Exit code: ${cmd.exitCode ?? "?"}`);
      if (cmd.output) {
        const trimmed = cmd.output.slice(0, 4000);
        lines.push(`Output:\n${trimmed}${cmd.output.length > 4000 ? "\n...(truncated)" : ""}`);
      }
    }
  }

  if (mcpResults.length > 0) {
    lines.push("\nMCP tool results:");
    for (const r of mcpResults) {
      lines.push(`\n[${r.serverName}/${r.toolName}] ${r.ok ? "✓" : "✗"}`);
      const out = r.output.slice(0, 6000);
      lines.push(out + (r.output.length > 6000 ? "\n...(truncated)" : ""));
    }
  }

  if (runResults.length > 0) {
    lines.push("\nRun results:");
    for (const r of runResults) {
      lines.push(`\n$ ${r.command}`);
      if (r.timedOut && r.exitCode === null) {
        lines.push(`Status: Server/long-running process started (still running in background)`);
      } else {
        lines.push(`Exit code: ${r.exitCode ?? "?"}`);
      }
      if (r.output) {
        const trimmed = r.output.slice(0, 6000);
        lines.push(`Output:\n${trimmed}${r.output.length > 6000 ? "\n...(truncated)" : ""}`);
      }
    }
  }

  // Port-collision: "Address already in use" is a transient race, NOT a code bug.
  // The fix is already applied at the process-manager level (waits for old proc to die).
  // Don't let the AI spiral by treating it as a fixable error.
  const hasPortCollision = runResults.some(r =>
    r.output && (
      r.output.includes("Address already in use") ||
      r.output.includes("EADDRINUSE") ||
      r.output.includes("address already in use")
    )
  );
  const runFailed = runResults.some(r => !r.timedOut && r.exitCode !== 0 && r.exitCode !== null && !hasPortCollision);
  const hasErrors = fileOps.some(o => !o.success) || cmds.some(c => c.status === "error" || (c.exitCode !== undefined && c.exitCode !== 0)) || mcpResults.some(r => !r.ok) || runFailed;

  if (hasPortCollision) {
    lines.push("\nNote: The run failed with \"Address already in use\" — a previous server instance was still shutting down. The process manager now waits for the port to clear before each new spawn, so this should resolve itself. Do NOT retry the same run command again. If all required files have been written, just wrap up with a summary of what was done.");
  } else if (hasErrors) {
    lines.push("\nSome operations had errors. Diagnose and fix them now — don't ask for permission.");
  } else {
    lines.push("\nAll operations succeeded. Continue if there are more steps needed to fully complete the task, or wrap up with a summary if done.");
  }

  return lines.join("\n");
}

router.post("/chat/:projectId", requireAuth, aiRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        message: z.string().min(1).max(500_000),
        fileContext: z.string().optional(),
        filePath: z.string().optional(),
        imageData: z.string().optional(),
        imageMimeType: z.string().optional(),
        images: z.array(z.object({ data: z.string(), mimeType: z.string() })).max(10).optional(),
        mode: z.enum(["lite", "economy", "power"]).default("economy"),
        model: z.string().max(200).optional().default("anthropic:claude-sonnet-4-5"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const project = await assertProjectAccess(String(req.params.projectId), req.user!.id);
      const { message, fileContext, filePath, imageData, imageMimeType, images, mode, model: modelField } = parsed.data;
      const colonIdx = (modelField ?? "").indexOf(":");
      const provider = colonIdx >= 0 ? (modelField ?? "").slice(0, colonIdx) : "anthropic";
      const modelName = colonIdx >= 0 ? (modelField ?? "").slice(colonIdx + 1) : "claude-sonnet-4-5";
      const autoResolved = false;

      // Mode → capability settings
      const MODE_CONFIG = {
        lite:    { maxTokens:  8000, maxSteps: 2, historyLimit: 20, fileCharLimit: 2000, totalFileChars: 30000 },
        economy: { maxTokens: 16000, maxSteps: 4, historyLimit: 25, fileCharLimit: 5000, totalFileChars: 60000 },
        power:   { maxTokens: 32000, maxSteps: 6, historyLimit: 20, fileCharLimit: 2500, totalFileChars: 50000 },
      } as const;
      let { maxSteps } = MODE_CONFIG[mode];
      let maxTokens: number = MODE_CONFIG[mode].maxTokens;
      let historyLimit: number = MODE_CONFIG[mode].historyLimit;
      let fileCharLimit: number = MODE_CONFIG[mode].fileCharLimit;
      let totalFileChars: number = MODE_CONFIG[mode].totalFileChars;

      const allImages: { data: string; mimeType: string }[] = images?.length
        ? images
        : imageData && imageMimeType
          ? [{ data: imageData, mimeType: imageMimeType }]
          : [];

      const projectFiles = await db.select({ path: files.path, content: files.content, mimeType: files.mimeType })
        .from(files)
        .where(and(eq(files.projectId, project.id), isNull(files.deletedAt), eq(files.isDir, false)))
        .orderBy(asc(files.path))
        .limit(80);

      // Resolve @mentions → pin those files for full-content injection
      const mentionedPaths = extractMentions(message);
      const pinnedFiles: typeof projectFiles = [];
      for (const mention of mentionedPaths) {
        const lo = mention.toLowerCase();
        const match = projectFiles.find(f =>
          f.path === mention ||
          f.path.toLowerCase() === lo ||
          f.path.endsWith("/" + mention) ||
          f.path.toLowerCase().endsWith("/" + lo),
        );
        if (match && !pinnedFiles.some(p => p.path === match.path)) pinnedFiles.push(match);
      }

      const history = await db.select({ role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages).where(eq(chatMessages.projectId, project.id))
        .orderBy(desc(chatMessages.createdAt)).limit(historyLimit);
      history.reverse();

      const userContent = message || "Please analyze these images.";
      await db.insert(chatMessages).values({
        id: cuid(), projectId: project.id, userId: req.user!.id, role: "user", content: userContent,
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      // Fault-tolerant send — if the client has already disconnected the write
      // will throw or return false; we swallow it so processing continues.
      const send = (event: object) => {
        try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* client gone */ }
      };

      registerJob(project.id);

      // If auto-routing resolved the model, tell the client which model was picked
      if (autoResolved) {
        send({ type: "model_resolved", model: `${provider}:${modelName}` });
      }

      const modeNote = mode === "lite"
        ? "\n\nMODE: Lite — give a concise, direct answer. Skip lengthy preamble. Write files only if truly necessary."
        : mode === "power"
          ? "\n\nMODE: Power — think thoroughly, be exhaustive. Write complete, production-quality code. Take as many steps as needed."
          : "";

      // ── Load enabled MCP servers & discover their tools ───────────────────
      const enabledMcpServers = await db.select().from(mcpServers)
        .where(and(eq(mcpServers.projectId, project.id), eq(mcpServers.enabled, true)));

      // Resolve $SECRET_NAME placeholders in authToken from project secrets
      let resolvedSecrets: Record<string, string> = {};
      const needsResolution = enabledMcpServers.some(s => s.authToken?.includes("$"));
      if (needsResolution) {
        const secrets = await db.select({ key: projectSecrets.key, value: projectSecrets.value })
          .from(projectSecrets).where(eq(projectSecrets.projectId, project.id));
        resolvedSecrets = Object.fromEntries(secrets.map(s => [s.key, s.value]));
      }
      function resolveToken(token: string | null): string | null {
        if (!token) return token;
        return token.replace(/\$([A-Z0-9_]+)/g, (_, key: string) => resolvedSecrets[key] ?? `$${key}`);
      }

      const mcpServerConfigs: McpServerConfig[] = enabledMcpServers.map(s => ({
        id: s.id, name: s.name, url: s.url, transport: s.transport,
        authToken: resolveToken(s.authToken),
      }));
      let discoveredMcpTools: McpTool[] = [];
      if (mcpServerConfigs.length > 0) {
        const { tools, errors } = await discoverAllMcpTools(mcpServerConfigs);
        discoveredMcpTools = tools;
        if (errors.length) {
          send({ type: "mcp_discovery_errors", errors });
        }
      }

      const systemPrompt = buildSystemPrompt(project.name, project.language, projectFiles, filePath, fileContext, fileCharLimit, totalFileChars, pinnedFiles, discoveredMcpTools) + modeNote;

      const userMessageContent: OpenAI.ChatCompletionContentPart[] = [{ type: "text", text: userContent }];
      for (const img of allImages) {
        userMessageContent.push({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.data}`, detail: "high" },
        });
      }

      let allContent = "";

      const agentMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: allImages.length ? userMessageContent : userContent },
      ];

      // ── Agentic loop ──────────────────────────────────────────────────────
      for (let step = 1; step <= maxSteps; step++) {
        send({ type: "agent_step", step, maxSteps });

        if (step > 1) {
          send({ type: "delta", content: "\n\n---\n" });
          allContent += "\n\n---\n";
        }

        let stepContent = "";
        let stepFailed = false;

        // ── AI provider call ────────────────────────────────────────────────
        try {
          if (provider === "github") {
            // ── GitHub Copilot ────────────────────────────────────────────────
            const githubClient = getGithubCopilotClient();
            if (!githubClient) {
              const errMsg = "GitHub Copilot not configured. Add GITHUB_COPILOT_TOKEN to your environment.";
              stepContent = errMsg; allContent += errMsg;
              send({ type: "delta", content: errMsg }); stepFailed = true;
            } else {
              const stream = await githubClient.chat.completions.create({
                model: modelName,
                max_tokens: maxTokens,
                messages: agentMessages,
                stream: true,
              });
              for await (const chunk of stream) {
                const t = chunk.choices[0]?.delta?.content ?? "";
                if (t) { stepContent += t; allContent += t; send({ type: "delta", content: t }); }
              }
            }
          } else {
            // ── Anthropic Claude (default) ────────────────────────────────────
            const anthropicClient = getAnthropicClient();
            if (!anthropicClient) {
              const errMsg = "Anthropic not configured. Add ANTHROPIC_API_KEY to your project secrets.";
              stepContent = errMsg; allContent += errMsg;
              send({ type: "delta", content: errMsg }); stepFailed = true;
            } else {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const stream = await (anthropicClient.messages.create as any)({
                model: modelName,
                max_tokens: maxTokens,
                system: systemPrompt,
                messages: toAnthropicMessages(agentMessages),
                stream: true,
              });
              for await (const event of stream as AsyncIterable<Record<string, unknown>>) {
                const delta = event.delta as Record<string, unknown> | undefined;
                if (event.type === "content_block_delta" && delta?.type === "text_delta") {
                  const t = String(delta.text ?? "");
                  stepContent += t; allContent += t;
                  send({ type: "delta", content: t });
                }
              }
            }
          }
        } catch (e) {
          logger.warn({ err: e, provider, model: modelName }, "AI error");
          const errStatus = (e as { status?: number })?.status;
          const isRateLimit = errStatus === 429 || errStatus === 413;
          const errMsg = isRateLimit
            ? "Rate limit reached. Please wait a moment and try again."
            : "AI service temporarily unavailable. Please try again.";
          stepContent = errMsg; allContent += errMsg;
          send({ type: "delta", content: errMsg }); stepFailed = true;
        }

        if (stepFailed) break;

        // ── Truncation detection — check for opened but unclosed WRITE blocks ──
        const openCount = (stepContent.match(/<<<WRITE:[^\n>]+>>>/g) ?? []).length;
        const closeCount = (stepContent.match(/<<<END>>>/g) ?? []).length;
        const truncatedBlock = openCount > closeCount;
        if (truncatedBlock && step < maxSteps) {
          // Find which file was being written when the stream cut off
          const allOpens = [...stepContent.matchAll(/<<<WRITE:([^\n>]+)>>>/g)];
          const lastOpen = allOpens[allOpens.length - 1]?.[1]?.trim() ?? "the file";
          const continueMsg = `Your previous response was cut off mid-file while writing "${lastOpen}". `
            + `You MUST now rewrite that file in its ENTIRETY from the very beginning — no truncation, no "// ... rest unchanged". `
            + `Write the full working file and close it with <<<END>>>.`;
          agentMessages.push({ role: "assistant", content: stepContent });
          agentMessages.push({ role: "user", content: continueMsg });
          send({ type: "delta", content: `\n\n⚠️ _Response was cut off — continuing automatically…_\n` });
          allContent += `\n\n⚠️ _Response was cut off — continuing automatically…_\n`;
          continue; // skip file ops for this step, let next step write the complete file
        }

        // ── File operations ──────────────────────────────────────────────────
        const fileOps = extractFileOps(stepContent);
        const fileOpResults: FileOpResult[] = [];
        if (fileOps.length > 0) {
          send({ type: "file_ops_start", count: fileOps.length });
          await Promise.all(fileOps.map(async (op) => {
            try {
              if (op.action === "write" && op.content !== undefined) {
                const saved = await upsertFile(project.id, op.path, op.content);
                send({ type: "file_write", path: op.path, size: saved.size });
                fileOpResults.push({ path: op.path, action: "write", success: true, size: saved.size });
              } else if (op.action === "delete") {
                const deleted = await deleteFile(project.id, op.path);
                send({ type: "file_delete", path: op.path, found: deleted });
                fileOpResults.push({ path: op.path, action: "delete", success: true });
              }
            } catch (e) {
              logger.warn({ err: e, op }, "File op failed");
              const errMsg = (e as Error).message;
              send({ type: "file_op_error", path: op.path, action: op.action, error: errMsg });
              fileOpResults.push({ path: op.path, action: op.action, success: false, error: errMsg });
            }
          }));
          send({ type: "file_ops_done" });
        }

        const cmdResults: CmdResult[] = [];

        // ── <<<READ:path>>> — on-demand file fetch ────────────────────────────
        const readOps = extractReadOps(stepContent);
        const readResults: ReadResult[] = [];
        if (readOps.length > 0) {
          for (const filePath of readOps) {
            const [row] = await db.select({ content: files.content })
              .from(files)
              .where(and(eq(files.projectId, project.id), eq(files.path, filePath), isNull(files.deletedAt)))
              .limit(1);
            if (row) {
              readResults.push({ path: filePath, content: row.content.slice(0, 8000), found: true });
              send({ type: "file_read", path: filePath });
            } else {
              readResults.push({ path: filePath, content: "", found: false });
            }
          }
        }

        // ── <<<SEARCH:pattern>>> — code search across project files ───────────
        const searchPatterns = extractSearchOps(stepContent);
        const searchResults: SearchResult[] = [];
        if (searchPatterns.length > 0) {
          const allProjectFiles = await db
            .select({ path: files.path, content: files.content })
            .from(files)
            .where(and(eq(files.projectId, project.id), isNull(files.deletedAt), eq(files.isDir, false)))
            .limit(200);
          for (const pattern of searchPatterns) {
            const q = pattern.toLowerCase();
            const matches: Array<{ path: string; lineNumber: number; line: string }> = [];
            for (const f of allProjectFiles) {
              if (matches.length >= 30) break;
              const lines = f.content.split("\n");
              lines.forEach((line, idx) => {
                if (matches.length < 30 && line.toLowerCase().includes(q)) {
                  matches.push({ path: f.path, lineNumber: idx + 1, line: line.trim().slice(0, 200) });
                }
              });
            }
            searchResults.push({ pattern, matches });
            send({ type: "search_result", pattern, count: matches.length });
          }
        }

        // ── <<<CMD:command>>> — arbitrary shell command ────────────────────────
        const cmdOps = extractCmdOps(stepContent);
        const cmdExResults: CmdExResult[] = [];
        if (cmdOps.length > 0) {
          const currentFiles = await db
            .select({ path: files.path, content: files.content })
            .from(files)
            .where(and(eq(files.projectId, project.id), isNull(files.deletedAt)));
          const wsDir = await prepareWorkspace(project.id, currentFiles);
          // Install deps once so commands like npm/pip work
          await Promise.all([installDeps(wsDir), installPythonDeps(wsDir)]).catch(() => undefined);
          for (const cmd of cmdOps) {
            logger.info({ projectId: project.id, userId: req.user!.id, cmd }, "ai:cmd_exec");
            send({ type: "cmd_start", cmd });
            const result = await runCmdInProject(cmd, wsDir);
            cmdExResults.push(result);
            send({ type: "cmd_done", cmd, exitCode: result.exitCode });
          }
        }

        // ── MCP tool calls ────────────────────────────────────────────────────
        const mcpCallOps = extractMcpCalls(stepContent);
        const mcpCallResults: McpResult[] = [];
        if (mcpCallOps.length > 0 && mcpServerConfigs.length > 0) {
          send({ type: "mcp_calls_start", count: mcpCallOps.length });
          for (const op of mcpCallOps) {
            const srv = mcpServerConfigs.find(s => s.name === op.serverName);
            if (!srv) {
              const errMsg = `MCP server "${op.serverName}" not found or not enabled`;
              send({ type: "mcp_call_error", serverName: op.serverName, toolName: op.toolName, error: errMsg });
              mcpCallResults.push({ serverName: op.serverName, toolName: op.toolName, ok: false, output: errMsg });
              continue;
            }
            try {
              const output = await callMcpTool(srv, op.toolName, op.args);
              send({ type: "mcp_call_done", serverName: op.serverName, toolName: op.toolName });
              mcpCallResults.push({ serverName: op.serverName, toolName: op.toolName, ok: true, output });
            } catch (err) {
              const errMsg = (err as Error).message;
              send({ type: "mcp_call_error", serverName: op.serverName, toolName: op.toolName, error: errMsg });
              mcpCallResults.push({ serverName: op.serverName, toolName: op.toolName, ok: false, output: errMsg });
            }
          }
          send({ type: "mcp_calls_done" });
        }

        // ── <<<RUN>>> — run the project and capture output ───────────────────
        const hasRunToken = /<<<RUN>>>/.test(stepContent);
        const aiRunResults: AiRunResult[] = [];
        if (hasRunToken) {
          try {
            const runResult = await runProjectForAI(project.id, project.language, step, send);
            aiRunResults.push(runResult);
          } catch (e) {
            const errMsg = (e as Error).message ?? "Run failed";
            logger.warn({ err: e }, "AI <<<RUN>>> failed");
            send({ type: "run_result", idx: step, command: "?", output: errMsg, exitCode: -1, status: "error" });
            aiRunResults.push({ command: "?", output: errMsg, exitCode: -1, timedOut: false });
          }
        }

        // If no actions were taken, the agent is done
        const hasNewTools = readOps.length > 0 || searchPatterns.length > 0 || cmdOps.length > 0;
        if (fileOps.length === 0 && mcpCallOps.length === 0 && !hasRunToken && !hasNewTools) break;
        if (step === maxSteps) break;

        // Feed results back so the agent can react and continue
        agentMessages.push({ role: "assistant", content: stepContent });
        agentMessages.push({ role: "user", content: buildContinuationMessage(step, fileOpResults, cmdResults, mcpCallResults, aiRunResults, readResults, searchResults, cmdExResults) });
      }

      const [saved] = await db.insert(chatMessages).values({
        id: cuid(), projectId: project.id, role: "assistant", content: allContent,
      }).returning();

      unregisterJob(project.id);
      send({ type: "done", messageId: saved.id });
      try { res.end(); } catch { /* client gone */ }
    } catch (err) {
      unregisterJob(String(req.params.projectId));
      next(err);
    }
  });

// ── Code search across project files ─────────────────────────────────────────
router.get("/search/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await assertProjectAccess(String(req.params.projectId), req.user!.id);
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 50);

    if (q.length < 2) return res.json({ data: [] });

    const projectFiles = await db
      .select({ path: files.path, content: files.content })
      .from(files)
      .where(and(eq(files.projectId, project.id), isNull(files.deletedAt), eq(files.isDir, false)))
      .limit(200);

    const results: Array<{ path: string; lineNumber: number; line: string; context: string }> = [];

    // Path-name matches first (highest relevance)
    for (const f of projectFiles) {
      if (results.length >= limit) break;
      const fileName = f.path.split("/").pop() ?? f.path;
      if (fileName.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)) {
        results.push({ path: f.path, lineNumber: 0, line: f.path, context: "" });
      }
    }

    // Content matches
    for (const f of projectFiles) {
      if (results.length >= limit) break;
      if (!f.content) continue;
      const lines = f.content.split("\n");
      for (let i = 0; i < lines.length && results.length < limit; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          const ctx = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join("\n");
          if (!results.some(r => r.path === f.path && r.lineNumber === i + 1)) {
            results.push({ path: f.path, lineNumber: i + 1, line: lines[i].trim(), context: ctx });
          }
        }
      }
    }

    return res.json({ data: results.slice(0, limit) });
  } catch (err) { next(err); return; }
});

// ── Background job status (used by client on tab-reopen) ─────────────────────
router.get("/chat/:projectId/status", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await assertProjectAccess(String(req.params.projectId), req.user!.id);
    const job = activeJobs.get(String(req.params.projectId));
    res.json({ data: { active: !!job, startedAt: job?.startedAt ?? null } });
  } catch (err) { next(err); }
});

router.get("/chat/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await assertProjectAccess(String(req.params.projectId), req.user!.id);
    const messages = await db.select().from(chatMessages)
      .where(eq(chatMessages.projectId, project.id))
      .orderBy(asc(chatMessages.createdAt)).limit(200);
    res.json({ data: messages });
  } catch (err) { next(err); }
});

router.delete("/chat/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, String(req.params.projectId)), eq(projects.ownerId, req.user!.id), isNull(projects.deletedAt))).limit(1);
    if (!project) return next(createError("Project not found", 404));
    await db.delete(chatMessages).where(eq(chatMessages.projectId, project.id));
    res.json({ data: null, message: "Chat history cleared" });
  } catch (err) { next(err); }
});

// ── Language-specific guidance injected at top of system prompt ───────────────

function buildLangGuide(language: string): string[] {
  switch (language) {
    case "nodejs":
      return [
        `This is a Node.js project inside OrahAI.`,
        ``,
        `════ HOW ORAHAI RUNS NODE.JS PROJECTS ════`,
        `✅ OrahAI executes your project with the ▶ Run button — it runs "npm run dev" (or "npm start",`,
        `   "node src/index.js", etc. depending on package.json scripts).`,
        `✅ When the server starts listening on a port, the Live tab in Preview shows the running app.`,
        `✅ Build full-stack apps: Express/Fastify backend + HTML/JS frontend is totally fine.`,
        `✅ Frontend code can call your own /api/... routes — they work in the Live tab.`,
        ``,
        `════ WHAT TO BUILD ════`,
        `✅ src/index.js (or server.js) — Express/Fastify/Koa server`,
        `✅ public/ — static frontend files served by the Express app`,
        `✅ package.json with a "start" or "dev" script (e.g. "node src/index.js")`,
        `✅ For data: use SQLite (better-sqlite3), in-memory stores, or public APIs`,
        ``,
        `════ STATIC-ONLY PROJECTS (no backend needed) ════`,
        `If this project has no server logic, put everything in public/:`,
        `✅ public/index.html, public/app.js, public/style.css`,
        `✅ Use public APIs (CoinGecko, Open-Meteo, JSONPlaceholder) + localStorage`,
        ``,
        `════ WHAT NOT TO DO ════`,
        `❌ NEVER use localhost: URLs in the frontend — use relative paths like /api/route`,
        `❌ DO NOT use fetch("/api/...") in the Frontend (static) tab — it only works in the Live tab`,
      ];
    case "typescript":
      return [
        `This is a TypeScript project inside OrahAI.`,
        ``,
        `════ HOW ORAHAI RUNS TYPESCRIPT PROJECTS ════`,
        `✅ OrahAI runs your project via ▶ Run ("npm run dev", "ts-node src/index.ts", etc.)`,
        `✅ Full-stack TypeScript apps work: write an Express/Fastify server + public/ frontend`,
        `✅ Frontend fetch("/api/...") works in the Live tab once the server is running`,
        `✅ package.json with "dev" script (e.g. "ts-node src/index.ts" or "tsx src/index.ts")`,
        `✅ Use .ts throughout — no plain .js in src/`,
        `✅ For data: SQLite (better-sqlite3), in-memory stores, or public APIs`,
        ``,
        `════ STATIC-ONLY (no backend) ════`,
        `✅ public/index.html + public/app.js + public/style.css`,
        `✅ Use CoinGecko, Open-Meteo, or other CORS-enabled public APIs for live data`,
        ``,
        `❌ NEVER use localhost: URLs in frontend code — use relative /api/... paths`,
      ];
    case "python":
      return [
        `This is a Python project inside OrahAI.`,
        ``,
        `════ HOW ORAHAI RUNS PYTHON PROJECTS ════`,
        `✅ OrahAI runs your project via ▶ Run — it executes "python main.py" (or "flask run",`,
        `   "uvicorn app:app --host 0.0.0.0 --port $PORT", etc. from your run command).`,
        `✅ When Flask/FastAPI starts listening, the Live tab appears with the running app.`,
        `✅ requirements.txt — list all pip dependencies here`,
        `✅ Entry point: main.py or app.py`,
        ``,
        `════ BACKEND / SCRIPTS ════`,
        `✅ Write the full Python code. If it's a script (no web UI), that's fine — show the run command.`,
        `✅ For web apps: use Flask or FastAPI. Bind to host="0.0.0.0" and port from os.environ.get("PORT", 5000).`,
        `✅ For data: use SQLite (sqlite3 stdlib), in-memory dicts, or public REST APIs via requests/httpx.`,
        `✅ For async evaluation scripts (like MCP eval harnesses): write main.py + requirements.txt,`,
        `   set up the run command, and tell the user to add their API keys in Project Secrets then click ▶ Run.`,
        ``,
        `════ WHAT NOT TO DO ════`,
        `❌ DO NOT use Node.js or write JavaScript files`,
        `❌ NEVER hardcode secrets — tell the user to add them via Project Secrets (⚙ Secrets panel)`,
        `❌ NEVER refuse to write backend code because a schema or config is missing — make reasonable`,
        `   assumptions, write working code, and note what the user needs to configure (e.g. API keys).`,
      ];
    case "html":
      return [
        `This is a static HTML/CSS/JS project — no server needed.`,
        `✅ Single index.html with embedded or linked CSS/JS`,
        `✅ Use vanilla JS and fetch() for public APIs (e.g. crypto prices from CoinGecko)`,
        `✅ Make it visually polished: dark theme, gradients, proper responsive layout`,
        `❌ DO NOT create a package.json or Node server — keep it purely static`,
      ];
    case "go":
      return [
        `This is a Go project.`,
        `✅ go.mod with module name and go version`,
        `✅ main.go as entry point — use net/http or gin for web apps`,
        `✅ Idiomatic Go: package main, proper error handling, goroutines where useful`,
      ];
    case "rust":
      return [
        `This is a Rust project.`,
        `✅ Cargo.toml with [package] and [dependencies]`,
        `✅ src/main.rs as entry point`,
        `✅ For web: use actix-web or axum crate`,
        `✅ Use proper Result/Option error handling, no unwrap() in production code`,
      ];
    case "java":
      return [
        `This is a Java project.`,
        `✅ Main.java with a public static void main entry point`,
        `✅ For web: use Spring Boot (with pom.xml) or plain HttpServer`,
        `✅ Proper OOP: classes, interfaces, generics where appropriate`,
      ];
    case "kotlin":
      return [
        `This is a Kotlin project.`,
        `✅ main.kt with a fun main() entry point`,
        `✅ For web: use Ktor framework`,
        `✅ Use Kotlin idioms: data classes, extension functions, coroutines`,
      ];
    case "swift":
      return [
        `This is a Swift project.`,
        `✅ main.swift as entry point`,
        `✅ Use Swift standard library; for web use Vapor`,
        `✅ Modern Swift: optionals, protocols, async/await`,
      ];
    case "ruby":
      return [
        `This is a Ruby project.`,
        `✅ main.rb as entry point, Gemfile for dependencies`,
        `✅ For web: use Sinatra (simple) or Rails (full-stack)`,
        `✅ Idiomatic Ruby: blocks, symbols, modules`,
      ];
    case "php":
      return [
        `This is a PHP project.`,
        `✅ index.php as entry point`,
        `✅ Use modern PHP 8+ features: typed properties, match expressions, named args`,
        `✅ For APIs: return JSON with header('Content-Type: application/json')`,
      ];
    case "cpp":
      return [
        `This is a C++ project.`,
        `✅ main.cpp as entry point, Makefile or CMakeLists.txt for building`,
        `✅ Use C++17 or C++20 features: structured bindings, ranges, concepts`,
        `✅ Proper memory management: prefer RAII, smart pointers over raw new/delete`,
      ];
    case "c":
      return [
        `This is a C project.`,
        `✅ main.c as entry point, Makefile for building`,
        `✅ Standard C17, proper header files (.h), clean memory management`,
      ];
    case "csharp":
      return [
        `This is a C# / .NET project.`,
        `✅ Program.cs with top-level statements (modern .NET 6+)`,
        `✅ .csproj file for build config`,
        `✅ For web: use ASP.NET Core minimal APIs`,
        `✅ Use C# idioms: LINQ, async/await, records`,
      ];
    case "scala":
      return [
        `This is a Scala project.`,
        `✅ main.scala with @main def`,
        `✅ Functional style: immutable data, pattern matching, for-comprehensions`,
        `✅ For web: use Akka HTTP or http4s`,
      ];
    case "r":
      return [
        `This is an R project.`,
        `✅ main.R as entry point`,
        `✅ Use tidyverse for data manipulation, ggplot2 for visualisation`,
        `✅ For web apps: use Shiny`,
      ];
    case "dart":
      return [
        `This is a Dart project.`,
        `✅ main.dart as entry point`,
        `✅ Use async/await and streams idiomatically`,
        `✅ For Flutter apps: use StatelessWidget / StatefulWidget`,
      ];
    case "elixir":
      return [
        `This is an Elixir project.`,
        `✅ main.exs for scripts, or mix project with lib/ for applications`,
        `✅ Use Phoenix for web, GenServer for stateful processes`,
        `✅ Functional, pattern-matching, pipe operator |> style`,
      ];
    case "haskell":
      return [
        `This is a Haskell project.`,
        `✅ Main.hs as entry point`,
        `✅ Pure functional: type classes, monads, do-notation`,
        `✅ Use cabal or stack for dependencies`,
      ];
    case "bash":
      return [
        `This is a Bash / shell scripting project.`,
        `✅ main.sh with #!/bin/bash shebang`,
        `✅ Use shellcheck-clean style: quote variables, handle errors with set -e`,
        `✅ Functions for reusable logic, getopts for argument parsing`,
      ];
    case "lua":
      return [
        `This is a Lua project.`,
        `✅ main.lua as entry point`,
        `✅ Use Lua 5.4 features; LuaRocks for dependencies`,
        `✅ For game scripts: use Love2D conventions`,
      ];
    case "perl":
      return [
        `This is a Perl project.`,
        `✅ main.pl with use strict; use warnings;`,
        `✅ CPAN modules via cpan or cpanm`,
      ];

    // ── Bitcoin SV ─────────────────────────────────────────────────────────
    case "bsv":
      return [
        `This is a Bitcoin SV (BSV) project. You are an expert in the original Bitcoin protocol as restored in BSV.`,
        ``,
        `════ STACK ════`,
        `✅ Primary SDK: @bsv/sdk (npm install @bsv/sdk) — the official BSV TypeScript SDK`,
        `   Imports: { PrivateKey, P2PKH, P2PK, Transaction, Script, ARC, WhatsOnChain, MerklePath } from "@bsv/sdk"`,
        `✅ package.json: "type": "module" (ESM), or use ts-node with tsconfig for TypeScript`,
        ``,
        `════ WHATSONCHAIN API ════`,
        `Base URLs:`,
        `  mainnet: https://api.whatsonchain.com/v1/bsv/main`,
        `  testnet: https://api.whatsonchain.com/v1/bsv/test`,
        `  STN:     https://api.whatsonchain.com/v1/bsv/stn`,
        ``,
        `Endpoints (all GET unless noted):`,
        `  /address/{address}/balance      → { confirmed, unconfirmed } in satoshis`,
        `  /address/{address}/history      → [{ tx_hash, height }]`,
        `  /address/{address}/unspent      → [{ tx_hash, tx_pos, height, value }]  ← UTXOs`,
        `  /tx/hash/{txid}                 → full decoded transaction JSON`,
        `  /tx/{txid}/hex                  → raw transaction hex`,
        `  /tx/{txid}/proof               → BUMP (BSV Unified Merkle Path) for SPV`,
        `  /block/hash/{hash}              → block details`,
        `  /block/{height}/header          → block header`,
        `  /chain/info                     → current chain tip info`,
        `  POST /tx/raw { txhex: "..." }   → broadcast raw transaction, returns txid`,
        `  /search/leaderboard             → top addresses by balance`,
        ``,
        `✅ Always handle WoC rate limits (429) gracefully with retry logic`,
        `✅ For bulk queries use /txs/detail (POST with array of txids, max 20)`,
        ``,
        `════ TERANODE ════`,
        `✅ TeraNode is BSV's enterprise-grade node implementation designed for massive scale (1TB+ blocks)`,
        `✅ It exposes a standard JSON-RPC interface (same as Bitcoin Core RPC):`,
        `   POST http://<node>:<port>/ with { jsonrpc:"2.0", method:"...", params:[...], id:1 }`,
        `   Auth: HTTP Basic (user:password in Authorization header)`,
        `✅ Key RPC methods: getblockchaininfo, getblockcount, getblockhash, getblock, getrawtransaction,`,
        `   sendrawtransaction, getmempoolinfo, getrawmempool, gettxout (UTXO lookup)`,
        `✅ TeraNode supports IPv6, SPV headers, and block streaming for high-throughput apps`,
        `✅ For production, connect to a node provider (TAAL, GorillaPool) rather than self-hosting`,
        ``,
        `════ BITCOIN SCRIPT (BSV Script) ════`,
        `BSV restores the FULL original Bitcoin Script — all disabled opcodes are active:`,
        ``,
        `Standard locking scripts:`,
        `  P2PKH:  OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG`,
        `  P2PK:   <pubKey> OP_CHECKSIG`,
        `  P2MS:   OP_M <pubKey1>...<pubKeyN> OP_N OP_CHECKMULTISIG`,
        `  OP_RETURN: OP_FALSE OP_RETURN <data>   ← on-chain data storage (up to ~100KB)`,
        ``,
        `Restored opcodes (BSV ONLY — NOT available on BTC):`,
        `  OP_CAT    — concatenate two stack items`,
        `  OP_SPLIT  — split a byte sequence at position N`,
        `  OP_AND / OP_OR / OP_XOR — bitwise operations`,
        `  OP_NUM2BIN / OP_BIN2NUM — number ↔ byte array conversion`,
        `  OP_LSHIFT / OP_RSHIFT   — bit shift operations`,
        `  OP_DIV / OP_MOD         — integer division`,
        `  OP_INVERT               — bitwise NOT`,
        ``,
        `Advanced patterns:`,
        `  OP_PUSH_TX   — push the full serialized transaction for introspection (covenant)`,
        `  OP_CODESEPARATOR — used in signature verification customization`,
        `  Covenant scripts — constrain outputs to specific scripts (chain behavior)`,
        `  R-puzzle     — pay to whoever knows a k value (r, s) ECDSA pair`,
        ``,
        `✅ When writing raw Script: use @bsv/sdk Script class`,
        `   Script.fromASM("OP_DUP OP_HASH160 <hash> OP_EQUALVERIFY OP_CHECKSIG")`,
        `   Or Script.fromHex("76a914...")`,
        ``,
        `════ TRANSACTIONS ════`,
        `✅ UTXO model — inputs spend previous outputs, outputs create new lockingScripts`,
        `✅ Transaction structure: version | inputs[] | outputs[] | locktime`,
        `✅ Input: prevTxid + outputIndex + unlockingScript + sequence`,
        `✅ Output: satoshis + lockingScript`,
        `✅ Fee: sum(inputs) - sum(outputs) — goes to miner, no separate fee field`,
        `✅ Typical fee rate: 1 sat/byte (BSV fees are tiny vs other chains)`,
        `✅ SIGHASH flags: ALL, NONE, SINGLE, ANYONECANPAY variants`,
        ``,
        `ARC (Transaction Broadcast API — replaces old /tx/broadcast):`,
        `✅ Use ARC class from @bsv/sdk: new ARC("https://api.taal.com/arc", { apiKey: "..." })`,
        `✅ await arc.broadcast(tx) — returns { txid, status, extraInfo }`,
        `✅ ARC validates, stores, and monitors tx status; use await arc.queryTxStatus(txid) to poll`,
        ``,
        `BEEF format (Background Evaluation Extended Format):`,
        `✅ BEEF = raw transaction + embedded ancestor txs + Merkle proofs (BUMPs)`,
        `✅ Allows SPV verification without a full node`,
        `✅ @bsv/sdk: tx.toHexBEEF() / Transaction.fromHexBEEF(hex)`,
        ``,
        `════ SPV & MERKLE PROOFS ════`,
        `✅ SPV = Simplified Payment Verification — verify tx included in a block via Merkle path`,
        `✅ BUMP = BSV Unified Merkle Path — standard compact proof format`,
        `✅ WoC endpoint: /tx/{txid}/proof returns BUMP JSON`,
        `✅ @bsv/sdk: MerklePath.fromObject(bumpJson).verify(txid, blockHeader)`,
        ``,
        `════ METANET & ON-CHAIN DATA ════`,
        `✅ Metanet = BSV protocol for structured on-chain data, like a permanent internet`,
        `✅ OP_RETURN payloads: prefix protocols like B:// (file), MAP (metadata), AIP (signature)`,
        `✅ 1Sat Ordinals — BSV's inscription protocol (similar to BTC ordinals but much cheaper)`,
        `✅ For OP_RETURN: output with 0 satoshis, lockingScript = OP_FALSE OP_RETURN <data chunks>`,
        `✅ To query Metanet/OP_RETURN data: use GorillaPool's Junglebus or BMAP API`,
        ``,
        `════ NETWORKS ════`,
        `  mainnet — production BSV blockchain`,
        `  testnet — BSV test network (free test coins from faucet.bitcoinsv.io)`,
        `  STN     — Scaling Test Network (for stress testing, large blocks)`,
        ``,
        `════ SECURITY ════`,
        `❌ NEVER hardcode private keys in source code — load from env vars or encrypted keystore`,
        `❌ NEVER broadcast unsigned transactions`,
        `❌ NEVER trust unverified UTXO sets — verify with SPV or a trusted node`,
        `❌ NEVER use deprecated bsv.js (npm: bsv) — use @bsv/sdk instead`,
        `✅ Always validate addresses before sending (checksum, network match)`,
        `✅ Always check UTXO is unspent before spending (double-spend prevention)`,
      ];

    case "scrypt":
      return [
        `This is a sCrypt smart contract project for Bitcoin SV (BSV).`,
        `sCrypt compiles TypeScript to native Bitcoin Script — contracts run on-chain as Script.`,
        ``,
        `════ STACK ════`,
        `✅ Package: scrypt-ts (npm install scrypt-ts)`,
        `✅ Compiler CLI: npx scrypt-cli compile — generates .json artifact files`,
        `✅ TypeScript with experimentalDecorators: true, emitDecoratorMetadata: true`,
        ``,
        `════ CONTRACT STRUCTURE ════`,
        `\`\`\`typescript`,
        `import { method, prop, SmartContract, assert, ByteString, sha256, Sha256, PubKey, Sig, hash160, Ripemd160 } from "scrypt-ts";`,
        ``,
        `export class MyContract extends SmartContract {`,
        `  @prop()                        // on-chain state (stored in UTXO)`,
        `  readonly myProp: bigint;`,
        ``,
        `  @prop(true)                    // stateful — can be updated between calls`,
        `  counter: bigint;`,
        ``,
        `  constructor(myProp: bigint) {`,
        `    super(...arguments);         // ALWAYS call super(...arguments) first`,
        `    this.myProp = myProp;`,
        `    this.counter = 0n;`,
        `  }`,
        ``,
        `  @method()                      // public = entrypoint (unlocking function)`,
        `  public unlock(sig: Sig, pubKey: PubKey) {`,
        `    assert(this.checkSig(sig, pubKey), "Invalid signature");`,
        `  }`,
        ``,
        `  @method()                      // private = internal helper`,
        `  increment(): void {`,
        `    this.counter++;`,
        `  }`,
        `}`,
        `\`\`\``,
        ``,
        `════ TYPES ════`,
        `✅ bigint   — integers (all Script numbers are big integers)`,
        `✅ boolean  — true/false`,
        `✅ ByteString — byte arrays (toByteString("hello", true) for UTF-8)`,
        `✅ PubKey   — 33-byte compressed public key`,
        `✅ Sig      — DER-encoded ECDSA signature`,
        `✅ Ripemd160, Sha256, Sha1 — fixed-length hash types`,
        `✅ FixedArray<T, N>  — fixed-size arrays (dynamic arrays NOT allowed in Script)`,
        ``,
        `════ BUILT-IN FUNCTIONS ════`,
        `✅ sha256(data: ByteString): Sha256`,
        `✅ hash160(data: ByteString): Ripemd160`,
        `✅ sha1(data: ByteString): Sha1`,
        `✅ assert(condition: boolean, msg?: string)  — abort if false`,
        `✅ this.checkSig(sig: Sig, pubKey: PubKey): boolean`,
        `✅ this.checkMultiSig(sigs: Sig[], pubKeys: PubKey[]): boolean`,
        `✅ len(b: ByteString): bigint`,
        `✅ slice(b: ByteString, start: bigint, end: bigint): ByteString`,
        `✅ byteString2Int(b: ByteString): bigint`,
        `✅ int2ByteString(n: bigint, len: bigint): ByteString`,
        ``,
        `════ STATEFUL CONTRACTS ════`,
        `✅ @prop(true) — mutable state (stored in locking script, updated each call)`,
        `✅ this.buildStateOutput(satoshis) — create output containing updated state`,
        `✅ this.changeAmount — remaining satoshis after fee`,
        `✅ In @method(): always call this.buildStateOutput() to continue the contract chain`,
        ``,
        `════ DEPLOYMENT & TESTING ════`,
        `✅ Compile: npx scrypt-cli compile → generates artifacts/*.json`,
        `✅ Load artifact: await MyContract.loadArtifact()`,
        `✅ Test without node: instance.verify(() => instance.myMethod(...)) — local execution`,
        `✅ Deploy to testnet: use TestWallet + DefaultProvider from scrypt-ts`,
        `✅ Fund testnet address at: https://faucet.bitcoinsv.io`,
        `✅ Check deployment on: https://test.whatsonchain.com`,
        ``,
        `════ RESTRICTIONS (Script limits) ════`,
        `❌ NO dynamic-length arrays — use FixedArray<T, N> with compile-time N`,
        `❌ NO recursion — Script has no call stack`,
        `❌ NO floating point — use bigint, represent decimals as integer * 10^n`,
        `❌ NO external calls or I/O inside @method() — contracts are pure Script`,
        `❌ NO for-loops with variable count — loop bounds must be compile-time constants`,
        `❌ NO delete, continue, break inside loops`,
        `❌ NEVER omit super(...arguments) in constructor`,
      ];

    // ── Blockchain ─────────────────────────────────────────────────────────
    case "solidity":
      return [
        `This is a Solidity / EVM smart contract project using Hardhat.`,
        ``,
        `REQUIRED FILE STRUCTURE:`,
        `✅ contracts/<Name>.sol  — the main Solidity contract (pragma ^0.8.20)`,
        `✅ hardhat.config.js     — Hardhat config with solidity version + network config`,
        `✅ package.json          — with hardhat, @nomicfoundation/hardhat-toolbox, dotenv`,
        `✅ scripts/deploy.js     — Hardhat deployment script`,
        `✅ test/test.js          — Hardhat + Chai + Ethers unit tests`,
        `✅ .env.example          — template with SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY`,
        ``,
        `SOLIDITY BEST PRACTICES (enforce all):`,
        `✅ Always start with // SPDX-License-Identifier: MIT`,
        `✅ Use OpenZeppelin contracts for standard patterns (ERC-20, ERC-721, ERC-1155, Ownable, ReentrancyGuard, Pausable, AccessControl)`,
        `✅ Import OpenZeppelin: "@openzeppelin/contracts/token/ERC20/ERC20.sol" etc.`,
        `✅ Check-Effects-Interactions pattern to prevent reentrancy`,
        `✅ Use custom errors instead of revert strings: error Unauthorized(); revert Unauthorized();`,
        `✅ Use events for all state changes: emit Transfer(from, to, amount);`,
        `✅ Add NatSpec comments: @title, @notice, @param, @return on all public functions`,
        `✅ Use modifiers for access control (onlyOwner, onlyRole, whenNotPaused)`,
        `✅ Mark functions view/pure where applicable — saves gas`,
        `✅ Use SafeMath is NOT needed in ^0.8.x — overflow/underflow is built in`,
        `✅ Use immutable for values set once in constructor (saves gas vs storage)`,
        `✅ Declare variables with smallest type that fits (uint8, uint128) to pack storage slots`,
        ``,
        `SECURITY — NEVER violate these:`,
        `❌ NEVER use tx.origin for authentication — use msg.sender`,
        `❌ NEVER call external contracts before updating state (reentrancy)`,
        `❌ NEVER use block.timestamp for randomness — it can be manipulated`,
        `❌ NEVER leave unbounded loops over user-supplied arrays`,
        `❌ NEVER use delegatecall to untrusted contracts`,
        `❌ NEVER store private keys or secrets on-chain — blockchain is public`,
        `❌ NEVER use deprecated transfer()/send() — use call{value:}("") with checks`,
        ``,
        `DeFi / Protocol patterns (use when relevant):`,
        `✅ ERC-20: OpenZeppelin ERC20.sol with mint/burn`,
        `✅ NFT: ERC-721 with ERC721URIStorage + ERC721Enumerable`,
        `✅ DAO: Governor.sol + GovernorTimelockControl`,
        `✅ Staking: ReentrancyGuard + nonReentrant modifier`,
        `✅ Proxy/Upgradeable: TransparentUpgradeableProxy or UUPS`,
        `✅ Flash loans: ERC-3156 interface`,
        ``,
        `DEPLOYMENT:`,
        `✅ Support both hardhat local network AND Sepolia/Polygon testnets via env vars`,
        `✅ Verify contract on Etherscan: hre.run("verify:verify", { address, constructorArguments })`,
        `✅ Write comprehensive tests: happy path, edge cases, access control, events emitted`,
      ];

    case "vyper":
      return [
        `This is a Vyper smart contract project.`,
        ``,
        `✅ Use Vyper ^0.3.10 syntax: @version ^0.3.10 at top of file`,
        `✅ Entry file: contracts/<name>.vy`,
        `✅ requirements.txt: vyper>=0.3.10, web3>=6.0.0`,
        `✅ deploy.py: Python script using web3.py to compile + deploy`,
        ``,
        `VYPER SPECIFICS:`,
        `✅ State variables declared at module level (not inside functions)`,
        `✅ @deploy decorator on __init__ (Vyper 0.3.10+)`,
        `✅ @external, @internal, @view, @pure decorators on all functions`,
        `✅ DynArray[Type, maxSize] for dynamic arrays (must declare max size)`,
        `✅ Use Bytes[N] for fixed-size byte arrays`,
        `✅ assert with reason string instead of require()`,
        `✅ No inheritance — use interfaces instead`,
        ``,
        `SECURITY:`,
        `❌ NEVER use raw_call without checking return value`,
        `❌ NEVER leave re-entrancy unguarded — Vyper has @nonreentrant("lock") decorator`,
      ];

    case "move":
      return [
        `This is a Move language project (Aptos or Sui blockchain).`,
        ``,
        `REQUIRED FILES:`,
        `✅ Move.toml — package manifest with [package], [addresses], [dependencies]`,
        `✅ sources/<module>.move — the main Move module`,
        ``,
        `MOVE LANGUAGE RULES:`,
        `✅ Every file starts with: module <address>::<module_name> { ... }`,
        `✅ Structs with abilities: has key (global storage), has store (nested in other structs), has copy, has drop`,
        `✅ Resources (has key) are owned by accounts — use move_to, move_from, borrow_global, borrow_global_mut`,
        `✅ Entry functions: public entry fun name(account: &signer, ...)`,
        `✅ View functions: #[view] public fun name(...): ReturnType acquires ResourceName`,
        `✅ Use std::string::utf8(b"...") for string literals`,
        `✅ Use aptos_framework::signer::address_of(account) to get address from signer`,
        `✅ Events: use aptos_framework::event module, emit with event::emit(...)`,
        `✅ Errors: use const E_NOT_OWNER: u64 = 1; abort E_NOT_OWNER; pattern`,
        `✅ Coin transfers: aptos_framework::coin::transfer<AptosCoin>(from, to_addr, amount)`,
        ``,
        `APTOS vs SUI:`,
        `✅ Aptos: uses account-based resource model, Move 1.x, aptos_framework`,
        `✅ Sui: uses object-based model, Move 2.x, sui::object, sui::transfer`,
        ``,
        `SECURITY:`,
        `❌ NEVER allow unauthorized access — always check signer address`,
        `❌ NEVER ignore resource exhaustion — Move enforces linear types, do not drop resources`,
        `❌ NEVER use assert! without a clear abort code constant`,
      ];

    case "web3":
      return [
        `This is a Web3 dApp frontend (no smart contract code needed unless asked).`,
        ``,
        `REQUIRED FILES:`,
        `✅ index.html — styled dark-themed Web3 UI with MetaMask connect button`,
        `✅ app.js     — wallet connection, chain detection, contract interaction`,
        `✅ style.css  — optional separate stylesheet (or inline in HTML)`,
        ``,
        `STACK:`,
        `✅ Use ethers.js v5 via CDN: https://cdn.ethers.io/lib/ethers-5.7.2.umd.min.js`,
        `✅ Or wagmi + viem if building with React/TypeScript (include package.json)`,
        `✅ MetaMask: window.ethereum.request({ method: "eth_requestAccounts" })`,
        `✅ provider = new ethers.providers.Web3Provider(window.ethereum)`,
        `✅ signer = provider.getSigner(); address = await signer.getAddress();`,
        `✅ Network check: provider.getNetwork() — warn if wrong chain`,
        `✅ Contract interaction: new ethers.Contract(address, abi, signer)`,
        ``,
        `UX REQUIREMENTS:`,
        `✅ Show wallet address (shortened: 0x1234...5678) when connected`,
        `✅ Show network name and chain ID`,
        `✅ Show ETH balance`,
        `✅ Handle MetaMask not installed gracefully (prompt to install)`,
        `✅ Handle user rejection of connection gracefully`,
        `✅ Listen for account/chain changes: window.ethereum.on("accountsChanged", ...)`,
        `✅ Dark themed, gradient accents, professional Web3 aesthetic`,
        ``,
        `SECURITY:`,
        `❌ NEVER hardcode private keys — wallets sign client-side only`,
        `❌ NEVER trust user-supplied contract addresses without validation`,
        `❌ NEVER skip chain ID verification before contract calls`,
      ];

    default:
      return [
        `This is a ${language} project. Use idiomatic ${language} patterns and best practices.`,
        `✅ Include all necessary build/dependency files`,
        `✅ Write clean, well-structured code following ${language} conventions`,
      ];
  }
}

// ── System prompt ──────────────────────────────────────────────────────────────

function buildSystemPrompt(
  projectName: string,
  language: string,
  projectFiles: { path: string; content: string; mimeType: string }[],
  activeFilePath?: string,
  activeFileContent?: string,
  fileCharLimit = 5000,
  totalFileChars = 60000,
  pinnedFiles: { path: string; content: string }[] = [],
  mcpTools: McpTool[] = [],
): string {
  const fileTree = projectFiles.map(f => `  ${f.path}`).join("\n") || "  (no files yet)";
  const pinnedPaths = new Set(pinnedFiles.map(f => f.path));

  const langGuide = buildLangGuide(language);

  const lines: string[] = [
    `You are OrahAI — an expert autonomous coding agent with COMPLETE ACCESS to the "${projectName}" project (${language}).`,
    ``,
    `════════════════════════════════════════════`,
    `  LANGUAGE / STACK REQUIREMENTS`,
    `════════════════════════════════════════════`,
    ``,
    ...langGuide,
    ``,
    `════════════════════════════════════════════`,
    `  ENVIRONMENT — READ THIS FIRST`,
    `════════════════════════════════════════════`,
    ``,
    `This project runs inside OrahAI, a browser-based IDE hosted on Replit.`,
    ``,
    `❌ NEVER mention or link to "localhost", "127.0.0.1", or any "localhost:PORT" URL.`,
    `   These URLs DO NOT work in this environment. The app runs behind a proxy — only the`,
    `   Replit-assigned domain (shown in the Preview/Live tab) is accessible to the user.`,
    `❌ NEVER suggest the user open a terminal outside of OrahAI or clone a repo manually.`,
    `   Files are edited inside this browser IDE. Use <<<WRITE>>> to create/update files.`,
    `✅ The ▶ Run button executes the project's start command as a real process. Shell commands`,
    `   shown in code blocks are for reference; the user runs them by clicking ▶ Run.`,
    ``,
    `⚠️  ORAHAI — HOW PROCESSES AND PREVIEW WORK:`,
    ``,
    `   ▶ RUN BUTTON: Spawns the project's start command as a real OS process. Output streams live`,
    `     to the Terminal tab. The user can see stdout/stderr in real time there.`,
    ``,
    `   TERMINAL TAB: Shows ALL process output — use this for scripts, CLIs, evaluation harnesses,`,
    `     backend logs, and any process that does NOT start a web server. THIS IS THE PRIMARY OUTPUT TAB.`,
    ``,
    `   LIVE TAB: ONLY appears when the running process binds to a network port (e.g. Flask on :5000,`,
    `     Express on :3000). It proxies that port through OrahAI's preview. Do NOT tell users to open`,
    `     the Live tab for scripts that don't start a server — it will never appear.`,
    ``,
    `   FRONTEND TAB (static): Serves public/index.html, public/app.js, public/style.css directly.`,
    `     No server executes here. Any fetch("/api/custom-route") will 404. Use public APIs + localStorage.`,
    ``,
    `✅ For scripts / CLI tools / eval harnesses (python main.py, node script.js, etc.):`,
    `   Tell the user: "Click ▶ Run, then watch the Terminal tab for output."`,
    `✅ For web servers (Flask, Express, FastAPI, Next.js, etc.):`,
    `   Tell the user: "Click ▶ Run — once the server starts, the Live tab will appear with your app."`,
    `✅ For static-only projects: use public/ files + public APIs + localStorage.`,
    ``,
    `════════════════════════════════════════════`,
    `  ABSOLUTE RULES — violating any = failure`,
    `════════════════════════════════════════════`,
    ``,
    `❌ NEVER ask the user for file paths, locations, or filenames. You have every file below — find it yourself.`,
    `❌ NEVER ask "which file", "where is X", "can you show me", "could you provide", or any clarifying question about the codebase.`,
    `❌ NEVER ask for permission. NEVER say "Should I…", "Do you want me to…", "Would you like…".`,
    `❌ NEVER refuse to write code because schema/config/API details are "missing". Make reasonable assumptions,`,
    `   write working code, and note at the end what the user should configure (e.g. API keys, DB URL).`,
    `❌ NEVER say "I cannot safely assume", "please provide the schema", "without explicit specs I cannot".`,
    `   Just implement the most sensible version and tell the user what they need to fill in.`,
    `❌ NEVER create a public/index.html "overview" or "documentation" page just because a project has no`,
    `   frontend UI. Backend scripts, CLIs, and evaluation harnesses DO NOT need a placeholder page.`,
    `   If a project is backend-only, say so in one line and direct the user to click ▶ Run + watch`,
    `   the Terminal tab. Do NOT invent a fake frontend just to fill the Preview/Frontend tab.`,
    `❌ NEVER claim you "added", "set", or "configured" a secret or environment variable. You cannot`,
    `   touch the Secrets panel — only the user can. When a secret is needed, say exactly:`,
    `   "Add VARIABLE_NAME to Project Secrets (⚙ Secrets panel in the sidebar), then click ▶ Run."`,
    `✅ YOU CAN RUN the project directly — use <<<RUN>>> on its own line after writing files.`,
    `   The project executes, stdout/stderr is captured, and the output is fed back to you.`,
    `   Use this to verify code works, catch errors, and fix them immediately.`,
    `   <<<RUN>>> uses the project's auto-detected start command (python main.py / npm run dev / etc.).`,
    ``,
    `   When to use <<<RUN>>>:`,
    `   • After writing a script/CLI that should produce output — run it and verify`,
    `   • After fixing a crash — run it and confirm the fix works`,
    `   • When the user asks to "run", "test", or "try" the code`,
    ``,
    `   When NOT to use <<<RUN>>>:`,
    `   • File-only changes with no runnable output (pure refactor, adding comments)`,
    `   • When the user just asks a question about the code`,
    `   • Long-running servers when the user only wants to check startup`,
    ``,
    `❌ NEVER say "I will now run…" without actually emitting <<<RUN>>>. Either run it or don't.`,
    `❌ NEVER show code in a markdown block and ask the user to copy it — use <<<WRITE>>> to apply it directly.`,
    `❌ NEVER write partial files or use placeholders like "// ... existing code ...", "// ... rest unchanged", "// TODO", or "// continues…". Write the FULL file every time.`,
    `❌ NEVER truncate a file mid-way and close with <<<END>>>. An incomplete file causes crashes. If a file is long, take as many tokens as needed — do NOT stop early.`,
    `❌ NEVER split one file across multiple <<<WRITE>>> blocks. One file = one WRITE block, complete, from top to bottom.`,
    `❌ NEVER explain what you're about to do before doing it. Act first, then give a brief summary at the end.`,
    ``,
    `✅ ALWAYS write complete file contents in every <<<WRITE>>> block — every import, every function, every closing brace.`,
    `✅ If you have many large files to write, write them one at a time across multiple steps rather than truncating any single file.`,
    `✅ ALWAYS look at the existing code first — match its style, patterns, naming, and structure exactly.`,
    `✅ ALWAYS fix errors immediately without asking. Diagnose → fix → move on.`,
    `✅ When in doubt about a detail, make the best reasonable assumption and proceed.`,
    ``,
    `════════════════════════════════════════════`,
    `  COPILOT TOOLS — your full toolkit`,
    `════════════════════════════════════════════`,
    ``,
    `You are a sovereign developer Copilot. Think step-by-step before making changes.`,
    `Prefer minimal, surgical edits over large rewrites. Use tools when needed.`,
    ``,
    `── READ ── Fetch a file's full content on demand:`,
    `<<<READ:path/to/file.ext>>>`,
    `The file content is fed back to you in the next step. Use this when a file wasn't`,
    `included in context below, or you need the latest version after a write.`,
    ``,
    `── SEARCH ── Search for a pattern across all project files:`,
    `<<<SEARCH:function name or symbol>>>`,
    `Returns up to 30 matching lines with file path and line number. Use to locate`,
    `usages, definitions, or any string across the entire codebase.`,
    ``,
    `── CMD ── Run an arbitrary shell command in the project workspace:`,
    `<<<CMD:npm install express>>>`,
    `<<<CMD:pip install requests>>>`,
    `<<<CMD:git log --oneline -10>>>`,
    `<<<CMD:ls -la src/>>>`,
    `Output (stdout + stderr) is captured and fed back to you. Max 30 s per command.`,
    `Multiple CMD blocks are fine in one step. Use for installs, git ops, file listing,`,
    `lint checks, test runs — anything a developer would type in a terminal.`,
    ``,
    `── WRITE ── Write a file (FULL content required):`,
    `<<<WRITE:path/to/file.ext>>>`,
    `(entire file content — no snippets, no "rest of file unchanged")`,
    `<<<END>>>`,
    ``,
    `── DELETE ── Delete a file:`,
    `<<<DELETE:path/to/file.ext>>>`,
    ``,
    `── RUN ── Run the project (captures stdout/stderr, feeds output back to you):`,
    `<<<RUN>>>`,
    ``,
    `Tool ordering rules:`,
    `- READ/SEARCH before writing if you need to inspect something first`,
    `- CMD installs BEFORE WRITE if new packages are needed`,
    `- WRITE before <<<RUN>>> — all files must exist before running`,
    `- <<<RUN>>> MUST be the last token in your response`,
    `- One <<<RUN>>> per response; multiple READ/SEARCH/CMD/WRITE/DELETE are fine`,
    `- All paths are relative to project root — no leading "/" or ".."`,
    ``,
    `════════════════════════════════════════════`,
    `  PROJECT FILE TREE  (you have ALL of these)`,
    `════════════════════════════════════════════`,
    ``,
    fileTree,
    ``,
  ];

  if (activeFilePath && activeFileContent) {
    lines.push(`════════════════════════════════════════════`);
    lines.push(`  CURRENTLY OPEN FILE: ${activeFilePath}`);
    lines.push(`════════════════════════════════════════════`);
    lines.push(`\`\`\`${langFromPath(activeFilePath)}`);
    lines.push(activeFileContent.slice(0, 15000));
    if (activeFileContent.length > 15000) lines.push("…(truncated — full file via write block if needed)");
    lines.push("```");
    lines.push("");
  }

  const otherFiles = projectFiles.filter(f => f.path !== activeFilePath);
  if (otherFiles.length > 0) {
    lines.push(`════════════════════════════════════════════`);
    lines.push(`  ALL PROJECT FILES (full content)`);
    lines.push(`════════════════════════════════════════════`);
    lines.push(``);
    let totalChars = 0;
    for (const f of otherFiles) {
      if (totalChars >= totalFileChars) {
        lines.push(`_(context limit reached — remaining file contents omitted, but paths are listed in the file tree above)_`);
        break;
      }
      const excerpt = f.content.slice(0, fileCharLimit);
      lines.push(`--- ${f.path} ---`);
      lines.push(`\`\`\`${langFromPath(f.path)}`);
      lines.push(excerpt + (f.content.length > fileCharLimit ? "\n…(truncated)" : ""));
      lines.push("```");
      lines.push("");
      totalChars += excerpt.length;
    }
  } else if (!activeFilePath) {
    lines.push(`No files yet. Create them with <<<WRITE:filename>>>.`);
  }

  // ── MCP tools section ────────────────────────────────────────────────────
  if (mcpTools.length > 0) {
    lines.push(``);
    lines.push(`════════════════════════════════════════════`);
    lines.push(`  MCP TOOLS — EXTERNAL TOOL SERVERS`);
    lines.push(`════════════════════════════════════════════`);
    lines.push(``);
    lines.push(`You have access to external tools via MCP (Model Context Protocol) servers.`);
    lines.push(`To call a tool, use this EXACT format (nothing else, no markdown, no explanation before calling):`);
    lines.push(``);
    lines.push(`<<<MCP_CALL:server-name:tool-name>>>`);
    lines.push(`{"arg1": "value1", "arg2": "value2"}`);
    lines.push(`<<<MCP_END>>>`);
    lines.push(``);
    lines.push(`Rules:`);
    lines.push(`- Call tools BEFORE writing files if you need data from them first`);
    lines.push(`- You can make multiple MCP calls in one step`);
    lines.push(`- The result will be injected into the next step for you to use`);
    lines.push(`- ALWAYS pass valid JSON as the argument block (or {} for no args)`);
    lines.push(``);
    lines.push(`Available tools:`);
    lines.push(``);
    const byServer = new Map<string, McpTool[]>();
    for (const t of mcpTools) {
      const arr = byServer.get(t.serverName) ?? [];
      arr.push(t);
      byServer.set(t.serverName, arr);
    }
    for (const [serverName, tools] of byServer) {
      lines.push(`[Server: ${serverName}]`);
      for (const t of tools) {
        const schemaStr = t.inputSchema && Object.keys(t.inputSchema).length > 0
          ? JSON.stringify(t.inputSchema, null, 2)
          : "(no arguments)";
        lines.push(`  • ${t.name}: ${t.description}`);
        lines.push(`    Schema: ${schemaStr}`);
      }
      lines.push(``);
    }
  }

  return lines.join("\n");
}

function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    c: "c", cpp: "cpp", cs: "csharp", html: "html", css: "css",
    scss: "scss", json: "json", yaml: "yaml", yml: "yaml",
    md: "markdown", sh: "bash", sql: "sql", toml: "toml",
  };
  return map[ext] ?? ext;
}

export default router;

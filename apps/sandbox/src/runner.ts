import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { logger } from "./logger";

const MAX_OUTPUT = 100 * 1024;       // 100 KB
const TIMEOUT_MS = 30_000;           // 30 s hard limit
const API_URL = process.env.API_URL ?? "http://localhost:4000";

interface RunOptions {
  runId:     string;
  projectId: string;
  command:   string;
  language:  string;
  onOutput:  (chunk: string) => void;
}

interface RunResult { output: string; exitCode: number }

export async function executeRun(opts: RunOptions): Promise<RunResult> {
  const { runId, projectId, command, language, onOutput } = opts;

  // Fetch project files from API
  const workDir = path.join(os.tmpdir(), "orahai", uuidv4());
  await fs.mkdir(workDir, { recursive: true });

  try {
    await writeProjectFiles(projectId, workDir);
  } catch (err) {
    logger.warn(`Could not fetch files for ${projectId}: ${err}`);
    // Continue — file might not be available yet
  }

  return new Promise((resolve) => {
    const args = command.trim().split(/\s+/);
    const [cmd, ...rest] = args;

    // NOTE: MVP uses process-level limits only (output cap + timeout).
    // Phase 2: replace with Docker + cgroups for CPU/memory isolation.
    const child = spawn(cmd, rest, {
      cwd: workDir,
      env: { ...process.env, NODE_ENV: "sandbox" },
      timeout: TIMEOUT_MS,
    });

    let output = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);

    const onData = (data: Buffer) => {
      const chunk = data.toString();
      if (output.length < MAX_OUTPUT) {
        output += chunk;
        onOutput(chunk);
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        const msg = "\n\n[Execution timed out after 30s]";
        output += msg;
        onOutput(msg);
      }
      // Clean up tmp dir
      fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      resolve({ output: output.slice(0, MAX_OUTPUT), exitCode: code ?? 1 });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      const msg = `\n[Spawn error: ${err.message}]`;
      output += msg;
      onOutput(msg);
      resolve({ output: output.slice(0, MAX_OUTPUT), exitCode: 1 });
    });
  });
}

async function writeProjectFiles(projectId: string, dir: string) {
  const res = await fetch(`${API_URL}/api/files/${projectId}`);
  if (!res.ok) return;
  const body = await res.json() as { data?: { flat?: { path: string; content: string; isDir: boolean }[] } };
  const files = body.data?.flat ?? [];
  for (const file of files) {
    if (file.isDir) continue;
    const dest = path.join(dir, file.path);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, file.content, "utf8");
  }
}

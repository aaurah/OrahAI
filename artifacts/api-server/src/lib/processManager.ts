import { spawn, type ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import { getIo } from "./ioSingleton";

export const RUN_ROOT = "/tmp/orahai-runs";

const EXEC_ENV = (dir: string, extra?: Record<string, string>) => {
  // Strip PORT so spawned processes don't inherit OrahAI's own port (8080)
  // and accidentally try to bind to an already-occupied socket.
  const { PORT: _port, ...restEnv } = process.env as Record<string, string | undefined>;
  return {
    ...restEnv,
    HOME: dir,
    PATH: process.env.PATH,
    NPM_CONFIG_FUND: "false",
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_UPDATE_NOTIFIER: "false",
    FORCE_COLOR: "1",
    CI: "false",
    // Python: disable output buffering so tracebacks always appear in the terminal
    PYTHONUNBUFFERED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    ...extra,
  };
};

export interface ManagedProcess {
  proc: ChildProcess;
  projectId: string;
  runId: string;
  command: string;
  port: number | null;
  outputBuf: string;
  startedAt: Date;
  exitCode: number | null;
  alive: boolean;
}

const processes = new Map<string, ManagedProcess>();

const PORT_PATTERNS = [
  /\blocalhost:(\d{4,5})\b/i,
  /\b127\.0\.0\.1:(\d{4,5})\b/i,
  /\b0\.0\.0\.0:(\d{4,5})\b/i,
  /\bport[:\s]+(\d{4,5})\b/i,
  /\blistening.*?:(\d{4,5})\b/i,
  /\bhttp:\/\/.*?:(\d{4,5})\b/i,
  /\bLocal:\s+https?:\/\/[^:]+:(\d{4,5})/i,
  /\bNetwork:\s+https?:\/\/[^:]+:(\d{4,5})/i,
  /\bStarted.*?:(\d{4,5})\b/i,
  /\bserver.*?on.*?:(\d{4,5})\b/i,
  /\bready.*?:(\d{4,5})\b/i,
];

function detectPort(text: string): number | null {
  for (const pat of PORT_PATTERNS) {
    const m = pat.exec(text);
    if (m) {
      const p = parseInt(m[1], 10);
      if (p > 1023 && p < 65536) return p;
    }
  }
  return null;
}

export function getProcess(projectId: string): ManagedProcess | undefined {
  return processes.get(projectId);
}

export function stopProcess(projectId: string): boolean {
  const mp = processes.get(projectId);
  if (!mp) return false;
  mp.alive = false;
  try {
    mp.proc.kill("SIGTERM");
    setTimeout(() => {
      try { if (!mp.proc.killed) mp.proc.kill("SIGKILL"); } catch { /* ignore */ }
    }, 3000);
  } catch { /* already dead */ }
  processes.delete(projectId);
  return true;
}

export function getAllProcesses(): Map<string, ManagedProcess> {
  return processes;
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function prepareWorkspace(
  projectId: string,
  projectFiles: { path: string; content: string | null }[],
): Promise<string> {
  const dir = path.join(RUN_ROOT, projectId);
  await fs.mkdir(dir, { recursive: true });
  const resolvedDir = path.resolve(dir);

  for (const f of projectFiles) {
    const fullPath = path.resolve(dir, f.path);
    if (!fullPath.startsWith(resolvedDir + path.sep) && fullPath !== resolvedDir) continue;
    await fs.mkdir(path.dirname(fullPath), { recursive: true }).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "EEXIST") throw e;
    });
    await fs.writeFile(fullPath, f.content ?? "", "utf8").catch(() => undefined);
  }
  return dir;
}

export interface InstallResult { output: string; ok: boolean; }

export async function installDeps(dir: string): Promise<InstallResult> {
  const pkgJson = path.join(dir, "package.json");
  const yarnLock = path.join(dir, "yarn.lock");
  const pnpmLock = path.join(dir, "pnpm-lock.yaml");
  const nodeModules = path.join(dir, "node_modules");

  if (!(await fileExists(pkgJson))) return { output: "", ok: true };
  if (await fileExists(nodeModules)) return { output: "", ok: true };

  const pm = (await fileExists(pnpmLock)) ? "pnpm" : (await fileExists(yarnLock)) ? "yarn" : "npm";
  const installCmd =
    pm === "pnpm" ? "pnpm install --prefer-offline --no-frozen-lockfile" :
    pm === "yarn" ? "yarn install --prefer-offline --non-interactive" :
                   "npm install --prefer-offline --no-fund --no-audit --legacy-peer-deps";

  return new Promise((resolve) => {
    const chunks: string[] = [];
    const header = `\r\n\x1b[33m[Installing ${pm} packages…]\x1b[0m\r\n`;
    chunks.push(header);

    const proc = spawn(installCmd, [], {
      cwd: dir,
      env: EXEC_ENV(dir),
      shell: true,
    });

    const onData = (buf: Buffer) => {
      const text = buf.toString().replace(/\n/g, "\r\n");
      chunks.push(text);
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);

    proc.on("close", (code) => {
      const ok = code === 0;
      chunks.push(ok
        ? `\x1b[32m[Dependencies installed]\x1b[0m\r\n`
        : `\x1b[31m[Install exited with code ${code}]\x1b[0m\r\n`);
      resolve({ output: chunks.join(""), ok });
    });

    proc.on("error", (err) => {
      resolve({ output: `\x1b[31m[Install error: ${err.message}]\x1b[0m\r\n`, ok: false });
    });
  });
}

export async function installPythonDeps(dir: string): Promise<InstallResult> {
  const reqTxt = path.join(dir, "requirements.txt");
  if (!(await fileExists(reqTxt))) return { output: "", ok: true };

  return new Promise((resolve) => {
    const chunks: string[] = [];
    const header = `\r\n\x1b[33m[Installing Python packages…]\x1b[0m\r\n`;
    chunks.push(header);

    const proc = spawn("pip install -r requirements.txt --quiet --disable-pip-version-check", [], {
      cwd: dir,
      env: EXEC_ENV(dir),
      shell: true,
    });

    const onData = (buf: Buffer) => {
      const text = buf.toString().replace(/\n/g, "\r\n");
      chunks.push(text);
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);

    proc.on("close", (code) => {
      const ok = code === 0;
      chunks.push(ok
        ? `\x1b[32m[Python packages installed]\x1b[0m\r\n`
        : `\x1b[31m[pip install exited with code ${code}]\x1b[0m\r\n`);
      resolve({ output: chunks.join(""), ok });
    });

    proc.on("error", (err) => {
      resolve({ output: `\x1b[31m[pip install error: ${err.message}]\x1b[0m\r\n`, ok: false });
    });
  });
}

export async function spawnProcess(
  projectId: string,
  runId: string,
  command: string,
  dir: string,
  extraEnv?: Record<string, string>,
): Promise<ManagedProcess> {
  // Grab the old process BEFORE stopProcess deletes it from the map
  const prior = processes.get(projectId);
  stopProcess(projectId);

  if (prior) {
    // Wait for the OS process to actually exit so it releases its bound port.
    // stopProcess sends SIGTERM (+ SIGKILL after 3 s), but the port is still
    // held until the kernel processes the exit — typically <100 ms for SIGTERM
    // but up to 3+ s if the process ignores it and needs SIGKILL.
    await new Promise<void>(resolve => {
      // If the proc is already dead, bail immediately
      if (prior.proc.exitCode !== null || prior.proc.killed) return resolve();
      const tid = setTimeout(resolve, 3500); // absolute safety timeout
      prior.proc.once("close", () => { clearTimeout(tid); resolve(); });
    });
    // Extra 200 ms for the kernel to release the port binding
    await new Promise(r => setTimeout(r, 200));
  }

  const mp: ManagedProcess = {
    proc: null as unknown as ChildProcess,
    projectId,
    runId,
    command,
    port: null,
    outputBuf: "",
    startedAt: new Date(),
    exitCode: null,
    alive: true,
  };

  const proc = spawn(command, [], {
    cwd: dir,
    env: EXEC_ENV(dir, extraEnv),
    shell: true,
  });

  mp.proc = proc;
  processes.set(projectId, mp);

  const room = `project:${projectId}`;

  const handleChunk = (buf: Buffer) => {
    const raw = buf.toString();
    const text = raw.replace(/\n/g, "\r\n");
    mp.outputBuf += raw;

    const io = getIo();
    io?.to(room).emit("terminal:output", { projectId, runId, data: text });

    if (!mp.port) {
      const port = detectPort(raw);
      if (port) {
        mp.port = port;
        const notice = `\r\n\x1b[32m[Server running on port ${port}]\x1b[0m\r\n`;
        mp.outputBuf += notice;
        io?.to(room).emit("terminal:output", { projectId, runId, data: notice });
        io?.to(room).emit("process:port", { projectId, runId, port });
      }
    }
  };

  proc.stdout?.on("data", handleChunk);
  proc.stderr?.on("data", handleChunk);

  proc.on("close", (code) => {
    mp.alive = false;
    mp.exitCode = code ?? -1;
    processes.delete(projectId);

    const msg = `\r\n\x1b[${code === 0 ? "32" : "31"}m[Process exited with code ${code ?? "?"}]\x1b[0m\r\n`;
    mp.outputBuf += msg;
    const io = getIo();
    io?.to(room).emit("terminal:output", { projectId, runId, data: msg });
    io?.to(room).emit("process:stopped", { projectId, runId, exitCode: code ?? -1 });
  });

  proc.on("error", (err) => {
    mp.alive = false;
    processes.delete(projectId);
    const msg = `\r\n\x1b[31m[Error: ${err.message}]\x1b[0m\r\n`;
    mp.outputBuf += msg;
    const io = getIo();
    io?.to(room).emit("terminal:output", { projectId, runId, data: msg });
    io?.to(room).emit("process:stopped", { projectId, runId, exitCode: -1 });
  });

  return mp;
}

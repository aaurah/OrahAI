import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

export interface ExecResult {
  output: string;
  exitCode: number;
  status: "success" | "error";
}

const RUN_ROOT = "/tmp/orahai-runs";

const EXEC_ENV = (dir: string) => ({
  ...process.env,
  HOME: dir,
  PATH: process.env.PATH,
  NPM_CONFIG_FUND: "false",
  NPM_CONFIG_AUDIT: "false",
  NPM_CONFIG_UPDATE_NOTIFIER: "false",
});

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function installDeps(dir: string): Promise<string> {
  const pkgJson   = path.join(dir, "package.json");
  const yarnLock  = path.join(dir, "yarn.lock");
  const pnpmLock  = path.join(dir, "pnpm-lock.yaml");
  const nodeModules = path.join(dir, "node_modules");

  if (!(await fileExists(pkgJson))) return "";   // no package.json — nothing to install
  if (await fileExists(nodeModules)) return "";  // already installed

  const pm = (await fileExists(pnpmLock)) ? "pnpm" : (await fileExists(yarnLock)) ? "yarn" : "npm";
  const installCmd =
    pm === "pnpm" ? "pnpm install --prefer-offline --no-frozen-lockfile" :
    pm === "yarn" ? "yarn install --prefer-offline --non-interactive" :
                   "npm install --prefer-offline --no-fund --no-audit --legacy-peer-deps";

  try {
    const { stdout, stderr } = await execAsync(installCmd, {
      cwd: dir,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      env: EXEC_ENV(dir),
    });
    const out = [stdout, stderr].map(s => s?.trim()).filter(Boolean).join("\n");
    return out ? `[${pm} install]\n${out}\n` : "";
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const msg = [err.stdout, err.stderr, err.message].map(s => s?.trim()).filter(Boolean).join("\n");
    return `[${pm} install failed]\n${msg}\n`;
  }
}

const ENTRY_STUBS: { pattern: RegExp; file: string; stub: string }[] = [
  { pattern: /python\s+(\S+\.py)/, file: "$1",
    stub: '# Entry file not found.\n# Create this file and add your Python code to get started!\nprint("Hello! Add your code to this file.")\n' },
  { pattern: /node\s+(\S+\.js)/, file: "$1",
    stub: '// Entry file not found.\n// Create this file and add your Node.js code to get started!\nconsole.log("Hello! Add your code to this file.");\n' },
  { pattern: /npx.*tsx?\s+(\S+\.[jt]s)/, file: "$1",
    stub: '// Entry file not found.\nconsole.log("Hello! Add your code to this file.");\n' },
];

export async function runInProject(
  projectId: string,
  command: string,
  projectFiles: { path: string; content: string | null }[],
): Promise<ExecResult> {
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

  // If the entry point file doesn't exist, write a helpful stub so the user
  // sees a clear message instead of a confusing "No such file" OS error.
  for (const { pattern, file, stub } of ENTRY_STUBS) {
    const m = command.match(pattern);
    if (!m) continue;
    const entryName = file.replace("$1", m[1]);
    const entryPath = path.join(dir, entryName);
    if (!(await fileExists(entryPath))) {
      await fs.mkdir(path.dirname(entryPath), { recursive: true }).catch(() => undefined);
      await fs.writeFile(entryPath, stub, "utf8").catch(() => undefined);
    }
    break;
  }

  // Auto-install npm/yarn/pnpm deps if package.json present and node_modules missing
  const installLog = await installDeps(dir);

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: dir,
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
      env: EXEC_ENV(dir),
    });
    const out = [
      installLog,
      stdout,
      stderr ? `[stderr] ${stderr}` : "",
    ].map(s => s?.trim()).filter(Boolean).join("\n").trim();
    return { output: out || "(no output)", exitCode: 0, status: "success" };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; code?: number; message?: string };
    const out = [
      installLog,
      err.stdout,
      err.stderr ? `[stderr] ${err.stderr}` : "",
    ].map(s => s?.trim()).filter(Boolean).join("\n").trim();
    return { output: out || err.message || "Unknown error", exitCode: err.code ?? 1, status: "error" };
  }
}

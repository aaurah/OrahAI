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
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, f.content ?? "", "utf8").catch(() => undefined);
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: dir,
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, HOME: dir, PATH: process.env.PATH },
    });
    const out = [stdout, stderr ? `[stderr] ${stderr}` : ""].filter(Boolean).join("\n").trim();
    return { output: out || "(no output)", exitCode: 0, status: "success" };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; code?: number; message?: string };
    const out = [err.stdout, err.stderr ? `[stderr] ${err.stderr}` : ""].filter(Boolean).join("\n").trim();
    return { output: out || err.message || "Unknown error", exitCode: err.code ?? 1, status: "error" };
  }
}

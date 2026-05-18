import Docker from "dockerode";
import { prisma } from "@orahai/db";
import { config } from "../config";
import { logger } from "../utils/logger";
import type { Project, Workspace } from "@prisma/client";

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export class WorkspaceService {
  private docker: Docker;

  constructor() {
    this.docker = new Docker({ socketPath: config.sandbox.dockerSocket });
  }

  async createAndStart(
    project: Project,
    userId: string
  ): Promise<Workspace> {
    // Create workspace record
    const workspace = await prisma.workspace.create({
      data: {
        projectId: project.id,
        userId,
        status: "STARTING",
      },
    });

    // Kick off container creation asynchronously
    this.startContainer(workspace.id, project).catch(async (err) => {
      logger.error(`Failed to start workspace ${workspace.id}:`, err);
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { status: "ERROR" },
      }).catch(() => undefined);
    });

    return workspace;
  }

  private async startContainer(
    workspaceId: string,
    project: Project
  ): Promise<void> {
    const containerName = `orahai-ws-${workspaceId}`;
    const workDir = `/workspace/${project.id}`;

    try {
      // Pull image if not available (best effort)
      try {
        await this.docker.pull(config.sandbox.image);
      } catch {
        logger.warn(`Could not pull image ${config.sandbox.image}, using cached`);
      }

      const container = await this.docker.createContainer({
        name: containerName,
        Image: config.sandbox.image,
        Cmd: ["/bin/sh", "-c", "sleep infinity"],
        WorkingDir: workDir,
        Env: [
          `PROJECT_ID=${project.id}`,
          `LANGUAGE=${project.language}`,
          ...Object.entries(
            (project.envVars as Record<string, string>) ?? {}
          ).map(([k, v]) => `${k}=${v}`),
        ],
        HostConfig: {
          Memory: parseMemory(config.sandbox.memoryLimit),
          CpuQuota: config.sandbox.cpuQuota,
          NetworkMode: config.sandbox.network,
          AutoRemove: false,
          ReadonlyRootfs: false,
          CapDrop: ["ALL"],
          SecurityOpt: ["no-new-privileges"],
          Binds: [],
        },
        Labels: {
          "orahai.workspace": workspaceId,
          "orahai.project": project.id,
          "orahai.user": String(project.ownerId),
        },
      });

      await container.start();

      // Assign a port for preview if needed
      const info = await container.inspect();
      const containerId = info.Id;

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          status: "RUNNING",
          containerId,
          startedAt: new Date(),
          lastPingAt: new Date(),
        },
      });

      await this.logMessage(workspaceId, "SYSTEM", "Workspace started successfully");

      // Copy project files into container
      await this.syncFilesToContainer(workspaceId, project.id, container);
    } catch (err) {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { status: "ERROR" },
      });
      throw err;
    }
  }

  private async syncFilesToContainer(
    workspaceId: string,
    projectId: string,
    container: Docker.Container
  ): Promise<void> {
    const files = await prisma.projectFile.findMany({
      where: { projectId, deletedAt: null, isDir: false },
      select: { path: true, content: true },
    });

    for (const file of files) {
      try {
        const exec = await container.exec({
          Cmd: [
            "/bin/sh",
            "-c",
            `mkdir -p "$(dirname /workspace/${projectId}/${file.path})" && cat > "/workspace/${projectId}/${file.path}"`,
          ],
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
        });

        await new Promise<void>((resolve, reject) => {
          exec.start({ hijack: true, stdin: true }, (err, stream) => {
            if (err) return reject(err);
            if (!stream) return resolve();
            stream.write(file.content);
            stream.end();
            stream.on("end", resolve);
            stream.on("error", reject);
          });
        });
      } catch (err) {
        logger.warn(`Failed to sync file ${file.path} to workspace:`, err);
      }
    }

    await this.logMessage(workspaceId, "SYSTEM", `Synced ${files.length} files to workspace`);
  }

  async exec(workspace: Workspace, command: string): Promise<ExecResult> {
    if (!workspace.containerId) {
      throw new Error("Workspace container not available");
    }

    const container = this.docker.getContainer(workspace.containerId);
    const start = Date.now();

    const exec = await container.exec({
      Cmd: ["/bin/sh", "-c", command],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });

    return new Promise((resolve, reject) => {
      exec.start({ hijack: false, stdin: false }, (err, stream) => {
        if (err) return reject(err);
        if (!stream) return resolve({ exitCode: 0, stdout: "", stderr: "", duration: 0 });

        let stdout = "";
        let stderr = "";

        container.modem.demuxStream(
          stream,
          { write: (chunk: Buffer) => { stdout += chunk.toString(); } },
          { write: (chunk: Buffer) => { stderr += chunk.toString(); } }
        );

        stream.on("end", async () => {
          const inspect = await exec.inspect();
          const duration = Date.now() - start;

          await this.logMessage(
            workspace.id,
            "STDOUT",
            `$ ${command}\n${stdout}`
          );
          if (stderr) {
            await this.logMessage(workspace.id, "STDERR", stderr);
          }

          resolve({
            exitCode: inspect.ExitCode ?? 0,
            stdout,
            stderr,
            duration,
          });
        });

        stream.on("error", reject);
      });
    });
  }

  async stop(workspaceId: string): Promise<void> {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace?.containerId) return;

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { status: "STOPPING" },
    });

    try {
      const container = this.docker.getContainer(workspace.containerId);
      await container.stop({ t: 10 });
      await container.remove({ force: true });
    } catch (err) {
      logger.warn(`Failed to stop container for workspace ${workspaceId}:`, err);
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { status: "STOPPED", stoppedAt: new Date(), containerId: null },
    });

    await this.logMessage(workspaceId, "SYSTEM", "Workspace stopped");
  }

  private async logMessage(
    workspaceId: string,
    stream: "STDOUT" | "STDERR" | "SYSTEM",
    message: string
  ): Promise<void> {
    await prisma.workspaceLog.create({
      data: { workspaceId, stream, message },
    }).catch(() => undefined);
  }
}

function parseMemory(memStr: string): number {
  const units: Record<string, number> = {
    b: 1,
    k: 1024,
    m: 1024 * 1024,
    g: 1024 * 1024 * 1024,
  };
  const match = memStr.toLowerCase().match(/^(\d+)([bkmg]?)$/);
  if (!match) return 512 * 1024 * 1024;
  const [, num, unit] = match;
  return parseInt(num, 10) * (units[unit] ?? 1);
}

import { prisma } from "@orahai/db";
import { config } from "../config";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";
import type { Project, Deployment } from "@prisma/client";

interface DeployOptions {
  project: Project;
  userId: string;
  environment: "PREVIEW" | "STAGING" | "PRODUCTION";
  commitSha?: string;
  commitMsg?: string;
}

export class DeploymentService {
  async deploy(options: DeployOptions): Promise<Deployment> {
    const { project, userId, environment, commitSha, commitMsg } = options;

    const version = `v${Date.now().toString(36)}`;

    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        userId,
        version,
        environment,
        status: "PENDING",
        commitSha: commitSha ?? null,
        commitMsg: commitMsg ?? null,
        startedAt: new Date(),
      },
    });

    // Run build + deploy asynchronously
    this.runBuild(deployment, project).catch(async (err) => {
      logger.error(`Deployment ${deployment.id} failed:`, err);
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: "FAILED",
          buildLog: String(err),
          finishedAt: new Date(),
        },
      }).catch(() => undefined);
    });

    return deployment;
  }

  private async runBuild(
    deployment: Deployment,
    project: Project
  ): Promise<void> {
    const logs: string[] = [];
    const log = (msg: string) => {
      logger.info(`[deploy:${deployment.id}] ${msg}`);
      logs.push(`[${new Date().toISOString()}] ${msg}`);
    };

    try {
      // Update status to BUILDING
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: "BUILDING" },
      });

      log(`Starting build for project ${project.name} (${project.language})`);
      log(`Version: ${deployment.version}`);
      log(`Environment: ${deployment.environment}`);

      // Simulate build steps (in production this would run Docker builds,
      // static site generation, etc.)
      await this.sleep(1000);
      log("Installing dependencies...");
      await this.sleep(500);
      log("Building project...");
      await this.sleep(500);
      log("Running tests...");
      await this.sleep(300);
      log("Build successful!");

      // Update status to DEPLOYING
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: "DEPLOYING", buildLog: logs.join("\n") },
      });

      log("Deploying to infrastructure...");
      await this.sleep(1000);

      // Generate deployment URL
      const subdomain = `${project.slug}-${deployment.version}`;
      const url = `https://${subdomain}.orahai.app`;

      log(`Deployed to ${url}`);

      // Mark as succeeded
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: "SUCCEEDED",
          url,
          buildLog: logs.join("\n"),
          finishedAt: new Date(),
        },
      });

      // Create notification
      await prisma.notification.create({
        data: {
          userId: deployment.userId,
          type: "DEPLOYMENT_SUCCESS",
          title: "Deployment Successful",
          body: `${project.name} deployed to ${deployment.environment}`,
          data: { deploymentId: deployment.id, url },
        },
      }).catch(() => undefined);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logs.push(`ERROR: ${errMsg}`);

      await prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: "FAILED",
          buildLog: logs.join("\n"),
          finishedAt: new Date(),
        },
      });

      // Notify failure
      await prisma.notification.create({
        data: {
          userId: deployment.userId,
          type: "DEPLOYMENT_FAILED",
          title: "Deployment Failed",
          body: `${project.name} deployment failed: ${errMsg}`,
          data: { deploymentId: deployment.id },
        },
      }).catch(() => undefined);

      throw err;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

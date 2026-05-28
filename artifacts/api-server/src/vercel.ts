/**
 * Vercel Serverless Function entry point.
 *
 * Unlike index.ts, this file does NOT call app.listen() — Vercel manages the
 * HTTP server itself. The Express app is imported directly and used as a
 * request handler.
 *
 * Startup migrations run once per Lambda cold start (not per request) via a
 * module-level promise that is awaited before the first request is processed.
 */
import app from "./app";
import { runEmailNormalizationMigration } from "./lib/emailMigration";
import { runDomainsMigration } from "./lib/domainsMigration";
import { runMcpMigration } from "./lib/mcpMigration";
import { logger } from "./lib/logger";
import type { Request, Response } from "express";

// Run once per cold start; any request that arrives before this resolves will
// wait for it to complete before being forwarded to Express.
const startupPromise = Promise.all([
  runEmailNormalizationMigration(),
  runDomainsMigration(),
  runMcpMigration(),
]).catch((err: unknown) => {
  logger.error({ err }, "Vercel cold-start migrations failed");
});

export default async function handler(req: Request, res: Response): Promise<void> {
  await startupPromise;
  app(req, res);
}

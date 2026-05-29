import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function runVercelMigration(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vercel_deployments (
        id              TEXT PRIMARY KEY,
        project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        vercel_id       TEXT NOT NULL,
        url             TEXT,
        inspector_url   TEXT,
        status          TEXT NOT NULL DEFAULT 'QUEUED',
        project_name    TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS vercel_deployments_project_id_idx
      ON vercel_deployments (project_id, created_at DESC)
    `);
    logger.info("vercel-migration: vercel_deployments table ready");
  } catch (err) {
    logger.error({ err }, "vercel-migration: failed");
    throw err;
  }
}

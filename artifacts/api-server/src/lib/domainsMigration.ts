import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function runDomainsMigration(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_domains (
        id                 TEXT PRIMARY KEY,
        project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        domain             TEXT NOT NULL,
        status             TEXT NOT NULL DEFAULT 'pending',
        verification_token TEXT NOT NULL,
        verified_at        TIMESTAMPTZ,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS project_domains_project_domain_idx
      ON project_domains (project_id, domain)
    `);

    logger.info("domains-migration: project_domains table ready");
  } catch (err) {
    logger.error({ err }, "domains-migration: failed");
    throw err;
  }
}

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function runMcpMigration(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        url         TEXT NOT NULL,
        transport   TEXT NOT NULL DEFAULT 'sse',
        auth_token  TEXT,
        enabled     BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS mcp_servers_project_name_idx
      ON mcp_servers (project_id, name)
    `);
    logger.info("mcp-migration: mcp_servers table ready");
  } catch (err) {
    logger.error({ err }, "mcp-migration: failed");
    throw err;
  }
}

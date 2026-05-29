import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function runNotificationsMigration(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        TEXT NOT NULL,
        message     TEXT NOT NULL,
        link        TEXT,
        is_read     BOOLEAN NOT NULL DEFAULT false,
        actor_name  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS notifications_user_id_idx
      ON notifications (user_id, created_at DESC)
    `);
    logger.info("notifications-migration: notifications table ready");
  } catch (err) {
    logger.error({ err }, "notifications-migration: failed");
    throw err;
  }
}

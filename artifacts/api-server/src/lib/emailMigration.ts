import { db, users } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

type DeactivatedEntry = {
  id: string;
  originalEmail: string;
  canonicalId: string;
  canonicalEmail: string;
  reason: string;
};

export async function runEmailNormalizationMigration(): Promise<void> {
  const deactivated: DeactivatedEntry[] = [];

  try {
    await db.transaction(async (tx) => {
      const collidingRows = await tx.execute<{
        id: string;
        email: string;
        is_admin: boolean;
        created_at: Date;
        deleted_at: Date | null;
      }>(sql`
        SELECT id, email, is_admin, created_at, deleted_at
        FROM users
        WHERE lower(email) IN (
          SELECT lower(email) FROM users GROUP BY lower(email) HAVING count(*) > 1
        )
        ORDER BY lower(email), created_at ASC
      `);

      if (collidingRows.rows.length > 0) {
        const groups = new Map<string, typeof collidingRows.rows>();
        for (const row of collidingRows.rows) {
          const key = row.email.toLowerCase().trim();
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(row);
        }

        for (const [canonicalEmail, group] of groups) {
          const canonical = group.slice().sort((a, b) => {
            if (!a.deleted_at && b.deleted_at) return -1;
            if (a.deleted_at && !b.deleted_at) return 1;
            if (a.is_admin && !b.is_admin) return -1;
            if (!a.is_admin && b.is_admin) return 1;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          })[0];

          logger.warn(
            { canonicalEmail, canonicalId: canonical.id, totalInGroup: group.length },
            "email-migration: resolving case-insensitive email collision"
          );

          for (const row of group) {
            if (row.id === canonical.id) {
              await tx.execute(sql`
                UPDATE users SET email = ${canonicalEmail}, updated_at = now()
                WHERE id = ${row.id}
              `);
            } else {
              const mangled = `__deactivated_${row.id}_${canonicalEmail}`;
              const reason =
                row.is_admin === canonical.is_admin
                  ? "older account selected as canonical by createdAt"
                  : canonical.is_admin
                  ? "admin account selected as canonical"
                  : "active account selected as canonical";
              deactivated.push({
                id: row.id,
                originalEmail: row.email,
                canonicalId: canonical.id,
                canonicalEmail,
                reason,
              });
              await tx.execute(sql`
                UPDATE users
                SET email = ${mangled},
                    password_hash = NULL,
                    deleted_at = now(),
                    updated_at = now()
                WHERE id = ${row.id}
              `);
            }
          }
        }
      }

      const mixedCaseRows = await tx.execute<{ id: string; email: string }>(sql`
        SELECT id, email FROM users WHERE email <> lower(email)
      `);

      if (mixedCaseRows.rows.length > 0) {
        logger.info(
          { count: mixedCaseRows.rows.length },
          "email-migration: normalizing remaining mixed-case emails"
        );
        for (const row of mixedCaseRows.rows) {
          await tx.execute(sql`
            UPDATE users SET email = lower(email), updated_at = now()
            WHERE id = ${row.id}
          `);
        }
      } else if (collidingRows.rows.length === 0) {
        logger.info("email-migration: no mixed-case emails found, skipping backfill");
      }
    });

    await db.execute(sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'users_email_unique'
            AND conrelid = 'users'::regclass
        ) THEN
          ALTER TABLE users DROP CONSTRAINT users_email_unique;
        END IF;
      END
      $$
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx
      ON users (lower(email))
    `);

    if (deactivated.length > 0) {
      logger.error(
        {
          deactivatedCount: deactivated.length,
          accounts: deactivated,
          action:
            "Review each entry. If any deactivated account belongs to a legitimate user, " +
            "restore it by clearing deleted_at and setting a new password_hash via the admin API. " +
            "Query: SELECT id, email FROM users WHERE email LIKE '__deactivated_%'",
        },
        "email-migration: OPERATOR ACTION REQUIRED — duplicate email accounts were deactivated. " +
        "Check the 'accounts' field for affected user IDs and original emails."
      );
    }

    logger.info(
      { deactivatedCount: deactivated.length },
      "email-migration: complete — case-insensitive unique index in place"
    );
  } catch (err) {
    logger.error({ err }, "email-migration: failed");
    throw err;
  }
}

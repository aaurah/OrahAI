import { Router, type Response, type NextFunction } from "express";
import { Pool } from "pg";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, projects, projectSecrets } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { logger } from "../lib/logger";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function assertProjectAccess(projectId: string, userId: string) {
  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));
  if (!project) throw createError("Project not found", 404);
  return project;
}

async function getConnectionString(projectId: string, overrideUrl?: string): Promise<string> {
  if (overrideUrl) return overrideUrl;
  const [secret] = await db.select({ value: projectSecrets.value })
    .from(projectSecrets)
    .where(and(eq(projectSecrets.projectId, projectId), eq(projectSecrets.key, "DATABASE_URL")));
  if (!secret?.value) throw createError("No DATABASE_URL found in project secrets. Add it in the Secrets panel.", 400);
  return secret.value;
}

async function withPool<T>(connStr: string, fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({
    connectionString: connStr,
    max: 2,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 8000,
    ssl: connStr.includes("sslmode=require") || connStr.includes("neon.tech") || connStr.includes("supabase")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  try {
    return await fn(pool);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function runQuery(pool: Pool, sql: string, params: unknown[] = []) {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '15000'");
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /api/projects/:id/database/connect — test connection
router.post("/:projectId/database/connect", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    await assertProjectAccess(projectId, req.user!.id);
    const { url } = z.object({ url: z.string().url().optional() }).parse(req.body);
    const connStr = await getConnectionString(projectId, url);
    await withPool(connStr, async (pool) => {
      await runQuery(pool, "SELECT 1");
    });
    res.json({ ok: true, message: "Connected successfully" });
  } catch (e) {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode) return next(e);
    next(createError(`Connection failed: ${err.message}`, 400));
  }
});

// GET /api/projects/:id/database/tables — list tables with row counts
router.get("/:projectId/database/tables", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    await assertProjectAccess(projectId, req.user!.id);
    const { url } = z.object({ url: z.string().optional() }).parse(req.query);
    const connStr = await getConnectionString(projectId, url);

    const tables = await withPool(connStr, async (pool) => {
      const r = await runQuery(pool, `
        SELECT
          t.table_schema,
          t.table_name,
          t.table_type,
          COALESCE(s.n_live_tup, 0) AS row_estimate
        FROM information_schema.tables t
        LEFT JOIN pg_stat_user_tables s
          ON s.schemaname = t.table_schema AND s.relname = t.table_name
        WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY t.table_schema, t.table_name
      `);
      return r.rows;
    });

    res.json({ tables });
  } catch (e) {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode) return next(e);
    next(createError(`Failed to list tables: ${(e as Error).message}`, 400));
  }
});

// GET /api/projects/:id/database/tables/:schema/:table/columns
router.get("/:projectId/database/columns", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    await assertProjectAccess(projectId, req.user!.id);
    const { url, table, schema = "public" } = z.object({
      url: z.string().optional(),
      table: z.string().min(1),
      schema: z.string().optional(),
    }).parse(req.query);
    const connStr = await getConnectionString(projectId, url);

    const columns = await withPool(connStr, async (pool) => {
      const r = await runQuery(pool, `
        SELECT
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          c.character_maximum_length,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT ku.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage ku
            ON tc.constraint_name = ku.constraint_name
            AND tc.table_schema = ku.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_name = $1
            AND tc.table_schema = $2
        ) pk ON pk.column_name = c.column_name
        WHERE c.table_name = $1 AND c.table_schema = $2
        ORDER BY c.ordinal_position
      `, [table, schema]);
      return r.rows;
    });

    res.json({ columns });
  } catch (e) {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode) return next(e);
    next(createError(`Failed to get columns: ${(e as Error).message}`, 400));
  }
});

// GET /api/projects/:id/database/rows — paginated rows
router.get("/:projectId/database/rows", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    await assertProjectAccess(projectId, req.user!.id);
    const { url, table, schema = "public", offset = "0", limit = "100", orderBy, orderDir = "asc" } = z.object({
      url:      z.string().optional(),
      table:    z.string().min(1),
      schema:   z.string().optional(),
      offset:   z.string().optional(),
      limit:    z.string().optional(),
      orderBy:  z.string().optional(),
      orderDir: z.enum(["asc", "desc"]).optional(),
    }).parse(req.query);

    const connStr = await getConnectionString(projectId, url);
    const lim = Math.min(parseInt(limit) || 100, 500);
    const off = parseInt(offset) || 0;

    const result = await withPool(connStr, async (pool) => {
      const ident = `"${schema.replace(/"/g, '""')}"."${table.replace(/"/g, '""')}"`;
      const orderClause = orderBy
        ? `ORDER BY "${orderBy.replace(/"/g, '""')}" ${orderDir === "desc" ? "DESC" : "ASC"}`
        : "";
      const [rows, countRes] = await Promise.all([
        runQuery(pool, `SELECT * FROM ${ident} ${orderClause} LIMIT $1 OFFSET $2`, [lim, off]),
        runQuery(pool, `SELECT COUNT(*) AS total FROM ${ident}`),
      ]);
      return { rows: rows.rows, total: parseInt(countRes.rows[0]?.total ?? "0") };
    });

    res.json(result);
  } catch (e) {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode) return next(e);
    next(createError(`Failed to fetch rows: ${(e as Error).message}`, 400));
  }
});

// POST /api/projects/:id/database/query — run arbitrary SQL
router.post("/:projectId/database/query", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    await assertProjectAccess(projectId, req.user!.id);
    const { url, sql } = z.object({
      url: z.string().optional(),
      sql: z.string().min(1).max(100_000),
    }).parse(req.body);

    const connStr = await getConnectionString(projectId, url);
    const start = Date.now();

    const result = await withPool(connStr, async (pool) => {
      // Split multiple statements, run each sequentially
      const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
      const allResults: Array<{ sql: string; rows: unknown[]; fields: string[]; rowCount: number; duration: number }> = [];

      for (const stmt of statements) {
        const t = Date.now();
        try {
          const r = await runQuery(pool, stmt);
          allResults.push({
            sql: stmt.slice(0, 120),
            rows: (r.rows ?? []).slice(0, 500),
            fields: (r.fields ?? []).map((f: { name: string }) => f.name),
            rowCount: r.rowCount ?? 0,
            duration: Date.now() - t,
          });
        } catch (stmtErr) {
          allResults.push({
            sql: stmt.slice(0, 120),
            rows: [],
            fields: [],
            rowCount: 0,
            duration: Date.now() - t,
          });
          throw Object.assign(new Error((stmtErr as Error).message), {
            partialResults: allResults,
          });
        }
      }

      return allResults;
    });

    res.json({ results: result, totalDuration: Date.now() - start });
  } catch (e) {
    const err = e as Error & { statusCode?: number; partialResults?: unknown };
    if (err.statusCode) return next(e);
    logger.warn({ sql: req.body?.sql?.slice(0, 200) }, `DB query error: ${err.message}`);
    res.status(400).json({
      error: "Query error",
      message: err.message,
      partialResults: err.partialResults ?? [],
    });
  }
});

// GET /api/projects/:id/database/export — SQL dump
router.get("/:projectId/database/export", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    const project = await assertProjectAccess(projectId, req.user!.id);
    const { url, tables: tableFilter } = z.object({
      url:    z.string().optional(),
      tables: z.string().optional(),
    }).parse(req.query);

    const connStr = await getConnectionString(projectId, url);
    const filterSet = tableFilter ? new Set(tableFilter.split(",").map(t => t.trim())) : null;

    const dump = await withPool(connStr, async (pool) => {
      const tableRes = await runQuery(pool, `
        SELECT table_schema, table_name FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog','information_schema')
          AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
      `);

      const targetTables = tableRes.rows.filter((t: { table_schema: string; table_name: string }) =>
        !filterSet || filterSet.has(t.table_name)
      );

      let out = `-- OrahAI Database Export\n-- Project: ${project.name}\n-- Date: ${new Date().toISOString()}\n\n`;
      out += `SET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\n\n`;

      for (const tbl of targetTables) {
        const schema = tbl.table_schema;
        const name = tbl.table_name;
        const ident = `"${schema}"."${name}"`;

        // Get column definitions for CREATE TABLE
        const colRes = await runQuery(pool, `
          SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position
        `, [schema, name]);

        out += `-- Table: ${ident}\n`;
        out += `DROP TABLE IF EXISTS ${ident} CASCADE;\n`;
        out += `CREATE TABLE ${ident} (\n`;
        const coldefs = colRes.rows.map((c: Record<string, string | null>) => {
          let def = `  "${c.column_name}" ${c.data_type}`;
          if (c.character_maximum_length) def += `(${c.character_maximum_length})`;
          if (c.column_default) def += ` DEFAULT ${c.column_default}`;
          if (c.is_nullable === "NO") def += ` NOT NULL`;
          return def;
        });
        out += coldefs.join(",\n");
        out += "\n);\n\n";

        // Export rows (up to 10k)
        const rowRes = await runQuery(pool, `SELECT * FROM ${ident} LIMIT 10000`);
        if (rowRes.rows.length > 0) {
          const cols = rowRes.fields.map((f: { name: string }) => `"${f.name}"`).join(", ");
          out += `INSERT INTO ${ident} (${cols}) VALUES\n`;
          const vals = rowRes.rows.map((row: Record<string, unknown>) => {
            const escaped = Object.values(row).map(v => {
              if (v === null || v === undefined) return "NULL";
              if (typeof v === "number" || typeof v === "boolean") return String(v);
              if (v instanceof Date) return `'${v.toISOString()}'`;
              return `'${String(v).replace(/'/g, "''")}'`;
            });
            return `  (${escaped.join(", ")})`;
          });
          out += vals.join(",\n");
          out += ";\n\n";
        }
      }

      return out;
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${project.name}-dump.sql"`);
    res.send(dump);
  } catch (e) {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode) return next(e);
    next(createError(`Export failed: ${(e as Error).message}`, 400));
  }
});

// POST /api/projects/:id/database/import — execute SQL
router.post("/:projectId/database/import", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    await assertProjectAccess(projectId, req.user!.id);
    const { url, sql } = z.object({
      url: z.string().optional(),
      sql: z.string().min(1).max(10_000_000),
    }).parse(req.body);

    const connStr = await getConnectionString(projectId, url);

    const { statementsRun, errors } = await withPool(connStr, async (pool) => {
      const client = await pool.connect();
      let statementsRun = 0;
      const errors: string[] = [];
      try {
        await client.query("SET statement_timeout = '30000'");
        await client.query("BEGIN");
        const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
        for (const stmt of statements) {
          try {
            await client.query(stmt);
            statementsRun++;
          } catch (e) {
            errors.push(`Statement ${statementsRun + 1}: ${(e as Error).message}`);
            if (errors.length > 5) break;
          }
        }
        if (errors.length === 0) {
          await client.query("COMMIT");
        } else {
          await client.query("ROLLBACK");
        }
      } finally {
        client.release();
      }
      return { statementsRun, errors };
    });

    if (errors.length > 0) {
      res.status(400).json({ ok: false, statementsRun, errors });
    } else {
      res.json({ ok: true, statementsRun, errors: [] });
    }
  } catch (e) {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode) return next(e);
    next(createError(`Import failed: ${(e as Error).message}`, 400));
  }
});

export default router;

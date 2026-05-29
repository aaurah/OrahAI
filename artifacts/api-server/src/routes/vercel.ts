import { Router, type Response, type NextFunction } from "express";
import { db, projects, projectSecrets, files as filesTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { cuid } from "../lib/cuid";

const router = Router();
router.use(requireAuth);

async function assertProjectOwner(projectId: string, userId: string) {
  const [p] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt), eq(projects.ownerId, userId)))
    .limit(1);
  if (!p) throw createError("Project not found or insufficient permissions", 403);
  return p;
}

async function getVercelToken(projectId: string): Promise<string | null> {
  const [secret] = await db.select()
    .from(projectSecrets)
    .where(and(eq(projectSecrets.projectId, projectId), eq(projectSecrets.key, "VERCEL_TOKEN")))
    .limit(1);
  return secret?.value ?? null;
}

// GET /api/vercel/:projectId/token-status
router.get("/:projectId/token-status", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    await assertProjectOwner(projectId, req.user!.id);
    const token = await getVercelToken(projectId);
    res.json({ data: { hasToken: !!token } });
  } catch (err) { next(err); }
});

// GET /api/vercel/:projectId/deployments
router.get("/:projectId/deployments", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    await assertProjectOwner(projectId, req.user!.id);
    const result = await db.execute(sql`
      SELECT id, project_id, vercel_id, url, inspector_url, status, project_name, created_at, updated_at
      FROM vercel_deployments
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
      LIMIT 20
    `);
    res.json({ data: result.rows });
  } catch (err) { next(err); }
});

// POST /api/vercel/:projectId/deploy
router.post("/:projectId/deploy", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    const project = await assertProjectOwner(projectId, req.user!.id);

    const token = await getVercelToken(projectId);
    if (!token) return next(createError("VERCEL_TOKEN not found in project secrets", 400));

    // Load all project files
    const fileRows = await db.select({
      path: filesTable.path,
      content: filesTable.content,
      isDir: filesTable.isDir,
    })
      .from(filesTable)
      .where(and(eq(filesTable.projectId, projectId), isNull(filesTable.deletedAt)));

    const deployFiles = fileRows
      .filter(f => !f.isDir)
      .map(f => ({
        file: f.path.replace(/^\//, ""),
        data: Buffer.from(f.content ?? "").toString("base64"),
        encoding: "base64" as const,
      }));

    if (deployFiles.length === 0) return next(createError("No files to deploy", 400));

    const projectSlug = project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "orahai-project";

    // Create Vercel deployment via Vercel REST API
    const deployRes = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectSlug,
        files: deployFiles,
        projectSettings: { framework: null },
        target: "production",
      }),
    });

    type VercelDeployResponse = {
      id?: string;
      url?: string;
      inspectorUrl?: string;
      readyState?: string;
      error?: { message?: string };
    };
    const deployJson = (await deployRes.json()) as VercelDeployResponse;

    if (!deployRes.ok || !deployJson.id) {
      const errMsg = deployJson.error?.message ?? `Vercel API error ${deployRes.status}`;
      return next(createError(errMsg, deployRes.status >= 500 ? 502 : 400));
    }

    // Persist deployment record
    const id = cuid();
    await db.execute(sql`
      INSERT INTO vercel_deployments
        (id, project_id, vercel_id, url, inspector_url, status, project_name, created_at, updated_at)
      VALUES
        (${id}, ${projectId}, ${deployJson.id}, ${deployJson.url ?? null},
         ${deployJson.inspectorUrl ?? null}, ${deployJson.readyState ?? "QUEUED"},
         ${projectSlug}, now(), now())
    `);

    res.status(201).json({
      data: {
        id,
        vercelId: deployJson.id,
        url: deployJson.url ?? null,
        inspectorUrl: deployJson.inspectorUrl ?? null,
        status: deployJson.readyState ?? "QUEUED",
        projectName: projectSlug,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/vercel/deployments/:id/status — poll Vercel for live status
router.get("/deployments/:id/status", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params["id"]);

    const result = await db.execute(sql`
      SELECT vd.id, vd.project_id, vd.vercel_id, vd.url, vd.inspector_url,
             vd.status, vd.project_name, p.owner_id
      FROM vercel_deployments vd
      JOIN projects p ON p.id = vd.project_id
      WHERE vd.id = ${id}
      LIMIT 1
    `);

    type DeployRow = {
      id: string; project_id: string; vercel_id: string; url: string | null;
      inspector_url: string | null; status: string; project_name: string | null;
      owner_id: string;
    };
    const row = result.rows[0] as DeployRow | undefined;
    if (!row) return next(createError("Deployment not found", 404));
    if (row.owner_id !== req.user!.id) return next(createError("Forbidden", 403));

    const token = await getVercelToken(row.project_id);
    if (!token) return next(createError("VERCEL_TOKEN not configured", 400));

    // Poll Vercel
    const statusRes = await fetch(`https://api.vercel.com/v13/deployments/${row.vercel_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    type VercelStatusResponse = {
      readyState?: string;
      url?: string;
      inspectorUrl?: string;
      error?: { message?: string };
    };
    const statusJson = (await statusRes.json()) as VercelStatusResponse;

    if (!statusRes.ok) {
      return next(createError(statusJson.error?.message ?? "Vercel API error", 502));
    }

    const newStatus = statusJson.readyState ?? row.status;
    const newUrl = statusJson.url ? `https://${statusJson.url}` : row.url;

    await db.execute(sql`
      UPDATE vercel_deployments
      SET status = ${newStatus}, url = ${newUrl ?? null}, updated_at = now()
      WHERE id = ${id}
    `);

    res.json({
      data: {
        id: row.id,
        vercelId: row.vercel_id,
        url: newUrl,
        inspectorUrl: row.inspector_url,
        status: newStatus,
        projectName: row.project_name,
      },
    });
  } catch (err) { next(err); }
});

export default router;

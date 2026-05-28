import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, projects, mcpServers } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { cuid } from "../lib/cuid";
import { discoverMcpTools } from "../lib/mcpClient";

const router = Router();
router.use(requireAuth);

async function assertProjectOwner(projectId: string, userId: string) {
  const [p] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt), eq(projects.ownerId, userId)))
    .limit(1);
  if (!p) throw createError("Project not found or insufficient permissions", 403);
  return p;
}

const serverSchema = z.object({
  name:      z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, "Name must be alphanumeric with hyphens/underscores only"),
  url:       z.string().url("Must be a valid URL"),
  transport: z.enum(["sse", "http", "streamable-http"]).default("sse"),
  authToken: z.string().max(512).optional().nullable(),
  enabled:   z.boolean().optional().default(true),
});

// GET /api/projects/:projectId/mcp
router.get("/:projectId/mcp", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    await assertProjectOwner(projectId, req.user!.id);
    const rows = await db.select().from(mcpServers).where(eq(mcpServers.projectId, projectId));
    res.json({ data: rows.map(r => ({ ...r, authToken: r.authToken ? "••••••••" : null })) });
  } catch (err) { next(err); }
});

// POST /api/projects/:projectId/mcp
router.post("/:projectId/mcp", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    await assertProjectOwner(projectId, req.user!.id);
    const parsed = serverSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.errors[0]?.message ?? "Validation error", 400));
    const { name, url, transport, authToken, enabled } = parsed.data;
    const existing = await db.select({ id: mcpServers.id }).from(mcpServers)
      .where(and(eq(mcpServers.projectId, projectId), eq(mcpServers.name, name))).limit(1);
    if (existing.length) return next(createError("A server with this name already exists", 409));
    const [row] = await db.insert(mcpServers).values({
      id: cuid(), projectId, name, url, transport, authToken: authToken ?? null, enabled: enabled ?? true,
    }).returning();
    res.status(201).json({ data: { ...row, authToken: row?.authToken ? "••••••••" : null } });
  } catch (err) { next(err); }
});

// PATCH /api/projects/:projectId/mcp/:id
router.patch("/:projectId/mcp/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    const id = String(req.params["id"]);
    await assertProjectOwner(projectId, req.user!.id);
    const patchSchema = serverSchema.partial();
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.errors[0]?.message ?? "Validation error", 400));
    const d = parsed.data;
    const [row] = await db.update(mcpServers)
      .set({
        ...(d.name      !== undefined && { name:      d.name }),
        ...(d.url       !== undefined && { url:       d.url }),
        ...(d.transport !== undefined && { transport: d.transport }),
        ...(d.authToken !== undefined && { authToken: d.authToken }),
        ...(d.enabled   !== undefined && { enabled:   d.enabled }),
        updatedAt: new Date(),
      })
      .where(and(eq(mcpServers.id, id), eq(mcpServers.projectId, projectId)))
      .returning();
    if (!row) return next(createError("MCP server not found", 404));
    res.json({ data: { ...row, authToken: row.authToken ? "••••••••" : null } });
  } catch (err) { next(err); }
});

// DELETE /api/projects/:projectId/mcp/:id
router.delete("/:projectId/mcp/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    const id = String(req.params["id"]);
    await assertProjectOwner(projectId, req.user!.id);
    await db.delete(mcpServers).where(and(eq(mcpServers.id, id), eq(mcpServers.projectId, projectId)));
    res.json({ data: null, message: "MCP server deleted" });
  } catch (err) { next(err); }
});

// POST /api/projects/:projectId/mcp/:id/test — connect and list tools
router.post("/:projectId/mcp/:id/test", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params["projectId"]);
    const id = String(req.params["id"]);
    await assertProjectOwner(projectId, req.user!.id);
    const [server] = await db.select().from(mcpServers)
      .where(and(eq(mcpServers.id, id), eq(mcpServers.projectId, projectId))).limit(1);
    if (!server) return next(createError("MCP server not found", 404));
    try {
      const tools = await discoverMcpTools({ ...server, authToken: server.authToken });
      res.json({ data: { ok: true, tools: tools.map(t => ({ name: t.name, description: t.description })) } });
    } catch (err) {
      res.json({ data: { ok: false, error: (err as Error).message, tools: [] } });
    }
  } catch (err) { next(err); }
});

export default router;

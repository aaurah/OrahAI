import { Router, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db, projects, files, memberships } from "@workspace/db";
import { eq, and, or, isNull, like, sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { cuid } from "../lib/cuid";

const router = Router();

// ── In-memory SSE sessions (lost on restart — clients must reconnect) ─────────
interface McpSession {
  res: Response;
  userId: string;
}
const sessions = new Map<string, McpSession>();

// ── MCP tool definitions ──────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "list_projects",
    description: "List all projects accessible to the authenticated OrahAI user.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "list_files",
    description: "List all files and directories in a project.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "The project ID (from list_projects)" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "read_file",
    description: "Read the content of a file in a project.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        path: { type: "string", description: "File path within the project (e.g. src/index.ts)" },
      },
      required: ["project_id", "path"],
    },
  },
  {
    name: "write_file",
    description: "Create or overwrite a file in a project with the given content.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        path: { type: "string", description: "File path within the project" },
        content: { type: "string", description: "Full file content to write" },
      },
      required: ["project_id", "path", "content"],
    },
  },
  {
    name: "delete_file",
    description: "Soft-delete a file from a project.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        path: { type: "string", description: "File path within the project" },
      },
      required: ["project_id", "path"],
    },
  },
  {
    name: "search_files",
    description: "Search for a text string across all file contents in a project. Returns matching lines with context.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        query: { type: "string", description: "Text to search for (case-insensitive)" },
        max_results: { type: "number", description: "Maximum number of matches to return (default 20)" },
      },
      required: ["project_id", "query"],
    },
  },
];

// ── Project access check ──────────────────────────────────────────────────────
async function assertProjectAccess(projectId: string, userId: string) {
  const memberSubquery = db.select({ workspaceId: memberships.workspaceId })
    .from(memberships).where(eq(memberships.userId, userId));
  const [p] = await db.select().from(projects).where(and(
    eq(projects.id, projectId),
    isNull(projects.deletedAt),
    or(eq(projects.ownerId, userId), sql`${projects.workspaceId} IN (${memberSubquery})`),
  )).limit(1);
  if (!p) throw { code: -32602, message: "Project not found or access denied" };
  return p;
}

// ── Tool execution ────────────────────────────────────────────────────────────
async function callTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<{ type: "text"; text: string }[]> {
  switch (name) {
    case "list_projects": {
      const memberSubquery = db.select({ workspaceId: memberships.workspaceId })
        .from(memberships).where(eq(memberships.userId, userId));
      const rows = await db.select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        updatedAt: projects.updatedAt,
      }).from(projects).where(and(
        isNull(projects.deletedAt),
        or(eq(projects.ownerId, userId), sql`${projects.workspaceId} IN (${memberSubquery})`),
      ));
      return [{ type: "text", text: JSON.stringify(rows, null, 2) }];
    }

    case "list_files": {
      const projectId = String(args.project_id ?? "");
      await assertProjectAccess(projectId, userId);
      const rows = await db.select({
        path: files.path,
        isDir: files.isDir,
        size: files.size,
        updatedAt: files.updatedAt,
      }).from(files).where(and(
        eq(files.projectId, projectId),
        isNull(files.deletedAt),
      ));
      return [{ type: "text", text: JSON.stringify(rows, null, 2) }];
    }

    case "read_file": {
      const projectId = String(args.project_id ?? "");
      const path = String(args.path ?? "");
      await assertProjectAccess(projectId, userId);
      const [file] = await db.select({
        path: files.path,
        content: files.content,
        size: files.size,
      }).from(files).where(and(
        eq(files.projectId, projectId),
        eq(files.path, path),
        isNull(files.deletedAt),
      )).limit(1);
      if (!file) throw { code: -32602, message: `File not found: ${path}` };
      return [{ type: "text", text: file.content ?? "" }];
    }

    case "write_file": {
      const projectId = String(args.project_id ?? "");
      const filePath = String(args.path ?? "");
      const content = String(args.content ?? "");
      if (!filePath || filePath.includes("..")) throw { code: -32602, message: "Invalid path" };
      await assertProjectAccess(projectId, userId);

      const name = filePath.split("/").pop() ?? filePath;
      const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
      const MIME: Record<string, string> = {
        ts: "text/typescript", tsx: "text/tsx", js: "application/javascript",
        jsx: "text/jsx", json: "application/json", html: "text/html",
        css: "text/css", md: "text/markdown", py: "text/x-python",
        sh: "text/x-sh", env: "text/plain",
      };
      const mime = MIME[ext] ?? "text/plain";
      const size = Buffer.byteLength(content, "utf8");

      const [existing] = await db.select({ id: files.id }).from(files).where(
        and(eq(files.projectId, projectId), eq(files.path, filePath)),
      ).limit(1);

      if (existing) {
        await db.update(files).set({ content, size, updatedAt: new Date(), deletedAt: null })
          .where(eq(files.id, existing.id));
      } else {
        await db.insert(files).values({
          id: cuid(), projectId, path: filePath, name, content, mimeType: mime,
          size, isDir: false, createdAt: new Date(), updatedAt: new Date(),
        });
      }
      await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
      return [{ type: "text", text: JSON.stringify({ ok: true, path: filePath, size }) }];
    }

    case "delete_file": {
      const projectId = String(args.project_id ?? "");
      const filePath = String(args.path ?? "");
      await assertProjectAccess(projectId, userId);
      const [existing] = await db.select({ id: files.id }).from(files).where(
        and(eq(files.projectId, projectId), eq(files.path, filePath), isNull(files.deletedAt)),
      ).limit(1);
      if (!existing) throw { code: -32602, message: `File not found: ${filePath}` };
      await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, existing.id));
      return [{ type: "text", text: JSON.stringify({ ok: true, path: filePath }) }];
    }

    case "search_files": {
      const projectId = String(args.project_id ?? "");
      const query = String(args.query ?? "");
      const maxResults = Math.min(Number(args.max_results ?? 20), 50);
      if (!query) throw { code: -32602, message: "query is required" };
      await assertProjectAccess(projectId, userId);

      const matching = await db.select({ path: files.path, content: files.content })
        .from(files).where(and(
          eq(files.projectId, projectId),
          isNull(files.deletedAt),
          eq(files.isDir, false),
          like(files.content, `%${query}%`),
        ));

      const results: { path: string; line: number; text: string }[] = [];
      const lowerQ = query.toLowerCase();
      for (const f of matching) {
        if (!f.content) continue;
        const lines = f.content.split("\n");
        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
          if (lines[i].toLowerCase().includes(lowerQ)) {
            results.push({ path: f.path, line: i + 1, text: lines[i].trimEnd() });
          }
        }
        if (results.length >= maxResults) break;
      }
      return [{ type: "text", text: JSON.stringify(results, null, 2) }];
    }

    default:
      throw { code: -32601, message: `Unknown tool: ${name}` };
  }
}

// ── Core JSON-RPC dispatcher ──────────────────────────────────────────────────
async function dispatch(
  body: Record<string, unknown>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { method, id, params } = body as {
    method: string;
    id?: string | number | null;
    params?: Record<string, unknown>;
  };

  const reply = (result: unknown) =>
    id != null ? { jsonrpc: "2.0", id, result } : { jsonrpc: "2.0", result };

  const rpcError = (code: number, message: string) => ({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });

  try {
    switch (method) {
      case "initialize":
        return reply({
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "orahai", version: "1.0.0" },
        });

      case "initialized":
        return { jsonrpc: "2.0" };

      case "ping":
        return reply({});

      case "tools/list":
        return reply({ tools: TOOLS });

      case "tools/call": {
        const { name, arguments: toolArgs = {} } = (params ?? {}) as {
          name: string;
          arguments?: Record<string, unknown>;
        };
        const content = await callTool(name, toolArgs, userId);
        return reply({ content });
      }

      default:
        return rpcError(-32601, `Method not found: ${method}`);
    }
  } catch (e: unknown) {
    const mcpErr = e as { code?: number; message?: string };
    return rpcError(mcpErr.code ?? -32603, mcpErr.message ?? "Internal error");
  }
}

// ── 0. Health / info  GET /api/mcp ────────────────────────────────────────────
// No auth required — lets external status pages and AI clients check liveness.
router.get("/", (_req, res: Response) => {
  res.json({
    ok: true,
    name: "orahai",
    version: "1.0.0",
    protocolVersion: "2025-03-26",
    transport: ["streamable-http", "sse"],
    endpoints: {
      http: "POST /api/mcp",
      sse: "GET /api/mcp/sse",
    },
  });
});

// ── 1. Streamable HTTP transport  POST /api/mcp ───────────────────────────────
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const body = req.body as Record<string, unknown> | Array<Record<string, unknown>>;

    // Support JSON-RPC batch requests
    if (Array.isArray(body)) {
      const results = await Promise.all(body.map(b => dispatch(b, userId)));
      res.json(results);
    } else {
      const result = await dispatch(body, userId);
      res.json(result);
    }
  } catch (err) {
    next(err);
  }
});

// ── 2. SSE transport  GET /api/mcp/sse ───────────────────────────────────────
router.get("/sse", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const sessionId = crypto.randomUUID();
  const userId = req.user!.id;

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // Tell the client where to POST messages
  res.write(`event: endpoint\ndata: /api/mcp/message?sessionId=${sessionId}\n\n`);

  // Keepalive ping every 25 s
  const ping = setInterval(() => { res.write(": ping\n\n"); }, 25_000);

  sessions.set(sessionId, { res, userId });

  req.on("close", () => {
    clearInterval(ping);
    sessions.delete(sessionId);
  });
});

// ── 3. SSE message endpoint  POST /api/mcp/message ───────────────────────────
router.post("/message", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const sessionId = String(req.query.sessionId ?? "");
    const session = sessions.get(sessionId);

    if (!session || session.userId !== req.user!.id) {
      res.status(404).json({ error: "Session not found or expired" });
      return;
    }

    const result = await dispatch(
      req.body as Record<string, unknown>,
      session.userId,
    );

    session.res.write(`event: message\ndata: ${JSON.stringify(result)}\n\n`);
    res.status(202).end();
  } catch (err) {
    next(err);
  }
});

export default router;

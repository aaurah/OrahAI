import { Router, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, files, projects, memberships } from "@workspace/db";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { config } from "../lib/config";
import { createError } from "../middlewares/errorHandler";

const router = Router();

async function assertProjectAccess(projectId: string, userId: string) {
  const memberSubquery = db.select({ workspaceId: memberships.workspaceId })
    .from(memberships).where(eq(memberships.userId, userId));
  const [p] = await db.select().from(projects).where(and(
    eq(projects.id, projectId),
    isNull(projects.deletedAt),
    or(eq(projects.ownerId, userId), sql`${projects.workspaceId} IN (${memberSubquery})`),
  )).limit(1);
  if (!p) throw createError("Project not found", 404);
  return p;
}

// GET /api/preview/:projectId?token=JWT
// Serves assembled HTML preview with inlined CSS & JS
router.get("/:projectId", async (req: any, res: Response, next: NextFunction) => {
  try {
    const token = String(req.query.token ?? "");
    if (!token) return next(createError("Missing preview token", 401));

    let userId: string;
    try {
      const payload = jwt.verify(token, config.auth.jwtSecret) as { sub: string };
      userId = payload.sub;
    } catch {
      return next(createError("Invalid or expired token", 401));
    }

    const project = await assertProjectAccess(String(req.params.projectId), userId);

    const projectFiles = await db
      .select({ path: files.path, content: files.content, mimeType: files.mimeType })
      .from(files)
      .where(and(eq(files.projectId, project.id), isNull(files.deletedAt), eq(files.isDir, false)));

    const fileMap = new Map(projectFiles.map((f) => [f.path, f.content ?? ""]));

    const html =
      fileMap.get("index.html") ??
      fileMap.get("public/index.html") ??
      fileMap.get("src/index.html") ??
      fileMap.get("dist/index.html") ??
      null;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Cache-Control", "no-store");

    if (!html) {
      return res.send(noPreviewHtml(project.name, project.language as string));
    }

    res.send(inlineAssets(html, fileMap));
  } catch (err) { next(err); }
});

// ── HTML assembly helpers ─────────────────────────────────────────────────────

function inlineAssets(html: string, fileMap: Map<string, string>): string {
  const resolve = (href: string) => {
    if (href.startsWith("http") || href.startsWith("//") || href.startsWith("data:")) return null;
    const clean = href.replace(/^\.?\//, "").split("?")[0];
    return fileMap.get(clean) ?? fileMap.get(`public/${clean}`) ?? fileMap.get(`src/${clean}`) ?? null;
  };

  // Inline <link rel="stylesheet" href="...">
  let out = html.replace(
    /<link\s[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi,
    (original, href) => {
      const css = resolve(href);
      return css != null ? `<style>/* ${href} */\n${css}\n</style>` : original;
    },
  );

  // Also handle reversed attribute order: href before rel
  out = out.replace(
    /<link\s[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi,
    (original, href) => {
      const css = resolve(href);
      return css != null ? `<style>/* ${href} */\n${css}\n</style>` : original;
    },
  );

  // Inline <script src="..."></script>
  out = out.replace(
    /<script\s[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
    (original, src) => {
      const js = resolve(src);
      return js != null ? `<script>/* ${src} */\n${js}\n</script>` : original;
    },
  );

  return out;
}

function noPreviewHtml(name: string, language: string): string {
  const tips: Record<string, string> = {
    html:       "Add an <code>index.html</code> file to see a live preview here.",
    nodejs:     "This is a Node.js project. Add an <code>index.html</code> for a web preview, or use the Run button to execute server code.",
    typescript: "This is a TypeScript project. Add an <code>index.html</code> for a web preview.",
    python:     "This is a Python project. Add an <code>index.html</code> for a web preview, or use the Run button to execute code.",
  };
  const tip = tips[language] ?? "Add an <code>index.html</code> to this project to enable live preview.";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;
       background:#0a0a0a;font-family:system-ui,sans-serif;color:#888;text-align:center;padding:24px}
  h2{color:#ccc;font-size:1.1rem;font-weight:600;margin-bottom:8px}
  p{font-size:.875rem;line-height:1.6;max-width:320px}
  code{background:#1a1a1a;color:#a78bfa;padding:2px 6px;border-radius:4px;font-size:.8rem}
</style></head><body>
  <div>
    <h2>No preview for "${name}"</h2>
    <p>${tip}</p>
  </div>
</body></html>`;
}

export default router;

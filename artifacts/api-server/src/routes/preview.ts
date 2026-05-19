import { Router, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, files, projects, memberships } from "@workspace/db";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { config } from "../lib/config";
import { createError } from "../middlewares/errorHandler";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

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

// POST /api/preview/:projectId/token
// Issues a short-lived, preview-scoped JWT that only works for this preview route.
// Requires the caller to be authenticated with a real session token.
router.post("/:projectId/token", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    const userId = req.user!.id;

    await assertProjectAccess(projectId, userId);

    const previewToken = jwt.sign(
      { sub: projectId },
      config.auth.jwtSecret,
      { audience: "preview", expiresIn: "5m" },
    );

    res.json({ token: previewToken });
  } catch (err) { next(err); }
});

// GET /api/preview/:projectId?token=PREVIEW_JWT
// Serves assembled HTML preview with inlined CSS & JS.
// Only accepts short-lived preview-scoped tokens (aud: "preview", sub: projectId).
router.get("/:projectId", async (req: any, res: Response, next: NextFunction) => {
  try {
    const token = String(req.query.token ?? "");
    if (!token) return next(createError("Missing preview token", 401));

    const projectId = String(req.params.projectId);

    try {
      jwt.verify(token, config.auth.jwtSecret, { audience: "preview", subject: projectId });
    } catch {
      return next(createError("Invalid or expired preview token", 401));
    }

    const [project] = await db.select().from(projects).where(and(
      eq(projects.id, projectId),
      isNull(projects.deletedAt),
    )).limit(1);
    if (!project) return next(createError("Project not found", 404));

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
  const lang = language ?? "nodejs";

  const info: Record<string, { icon: string; title: string; steps: string[] }> = {
    html: {
      icon: "🌐",
      title: "Add index.html to see your preview",
      steps: [
        "Create a file named <code>index.html</code> in your project root",
        "Add your HTML content and save the file",
        "Click the <strong>Refresh</strong> button in the preview bar above",
      ],
    },
    nodejs: {
      icon: "🟩",
      title: "Node.js project — static preview ready",
      steps: [
        "Add an <code>index.html</code> to your project root for an instant static preview",
        "CSS and JS files are automatically inlined — no server needed",
        "For server-side features (Express, APIs), you need an execution-enabled environment",
      ],
    },
    typescript: {
      icon: "🔷",
      title: "TypeScript project — static preview ready",
      steps: [
        "Add an <code>index.html</code> to your project root — it will appear here immediately",
        "Reference your <code>.css</code> and <code>.js</code> files normally — they get inlined automatically",
        "For full TypeScript compilation and server execution, deploy to an execution environment",
      ],
    },
    python: {
      icon: "🐍",
      title: "Python project",
      steps: [
        "Add an <code>index.html</code> for a static web preview of your frontend",
        "Python server code (Flask, FastAPI, Django) requires an execution-enabled environment to run",
        "Your Python files are saved and ready — deploy to run them",
      ],
    },
  };

  const { icon, title, steps } = info[lang] ?? info.nodejs;
  const stepHtml = steps.map((s, i) => `<li><span class="num">${i + 1}</span><span>${s}</span></li>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    background: #0a0a0a; font-family: system-ui, -apple-system, sans-serif;
    color: #888; padding: 32px 24px;
  }
  .card {
    max-width: 420px; width: 100%;
    background: #111; border: 1px solid #1f1f1f; border-radius: 16px;
    padding: 28px 28px 24px; text-align: left;
  }
  .icon { font-size: 2rem; margin-bottom: 12px; display: block; }
  h2 {
    color: #e5e5e5; font-size: 1rem; font-weight: 600;
    margin: 0 0 6px; line-height: 1.4;
  }
  .sub { font-size: .8rem; color: #555; margin: 0 0 20px; }
  ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
  li { display: flex; align-items: flex-start; gap: 10px; font-size: .8rem; line-height: 1.5; color: #777; }
  .num {
    min-width: 20px; height: 20px; border-radius: 50%;
    background: #1a1a1a; border: 1px solid #2a2a2a;
    display: flex; align-items: center; justify-content: center;
    font-size: .7rem; color: #555; font-weight: 600; margin-top: 1px; flex-shrink: 0;
  }
  code {
    background: #1a1a1a; color: #a78bfa;
    padding: 1px 5px; border-radius: 4px; font-size: .78rem; font-family: monospace;
  }
  strong { color: #aaa; font-weight: 500; }
  .project { font-size: .75rem; color: #333; margin-top: 20px; padding-top: 16px; border-top: 1px solid #1a1a1a; }
  .project span { color: #444; }
</style>
</head>
<body>
  <div class="card">
    <span class="icon">${icon}</span>
    <h2>${title}</h2>
    <p class="sub">Project <strong style="color:#555">${name}</strong> — files are saved and ready</p>
    <ol>${stepHtml}</ol>
    <p class="project">💡 <span>Tip: click <strong style="color:#555">Refresh ↺</strong> in the preview bar after adding your HTML file</span></p>
  </div>
</body>
</html>`;
}

export default router;

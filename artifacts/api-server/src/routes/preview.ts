import { Router, type Request, type Response, type NextFunction } from "express";
import * as http from "http";
import * as https from "https";
import jwt from "jsonwebtoken";
import { db, files, projects, memberships } from "@workspace/db";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { config } from "../lib/config";
import { createError } from "../middlewares/errorHandler";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { getProcess } from "../lib/processManager";

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
router.post("/:projectId/token", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    await assertProjectAccess(projectId, req.user!.id);
    const previewToken = jwt.sign(
      { sub: projectId },
      config.auth.jwtSecret,
      { audience: "preview", expiresIn: "5m" },
    );
    res.json({ token: previewToken });
  } catch (err) { next(err); }
});

// GET /api/preview/:projectId/live-status — returns current running port
router.get("/:projectId/live-status", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    await assertProjectAccess(projectId, req.user!.id);
    const mp = getProcess(projectId);
    res.json({ data: { running: !!mp?.alive, port: mp?.port ?? null } });
  } catch (err) { next(err); }
});

// GET /api/preview/:projectId/live — proxy to running dev server
// All sub-paths are forwarded: /api/preview/:projectId/live/assets/main.js → localhost:{port}/assets/main.js
// Auth: accepts a short-lived preview JWT via ?token= (same format as static preview) so iframes can load without custom headers.
// On sub-resource requests the token is not required — only the root HTML page needs it (the iframe carries the session via origin).
router.use("/:projectId/live", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const projectId = String(req.params.projectId);

  // Resolve auth: prefer ?token= (preview JWT) then fall back to Authorization header for API clients
  const rawToken = String(req.query.token ?? "");
  let authedProjectId: string | null = null;

  if (rawToken) {
    try {
      const payload = jwt.verify(rawToken, config.auth.jwtSecret, { audience: "preview" }) as { sub: string };
      authedProjectId = payload.sub;
    } catch {
      res.status(401).json({ error: "Invalid or expired preview token" });
      return;
    }
  } else {
    // Fall back to Bearer token auth (for direct API / non-iframe use)
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      const payload = jwt.verify(header.slice(7), config.auth.jwtSecret) as { sub: string; aud?: string | string[] };
      const aud = payload.aud;
      const isPreview = aud && (Array.isArray(aud) ? aud.includes("preview") : aud === "preview");
      if (isPreview) {
        authedProjectId = payload.sub;
      } else {
        // Full user JWT — verify project access via DB
        const userId = payload.sub;
        const memberSubquery = db.select({ workspaceId: memberships.workspaceId })
          .from(memberships).where(eq(memberships.userId, userId));
        const [p] = await db.select({ id: projects.id }).from(projects).where(and(
          eq(projects.id, projectId),
          isNull(projects.deletedAt),
          or(eq(projects.ownerId, userId), sql`${projects.workspaceId} IN (${memberSubquery})`),
        )).limit(1);
        if (!p) { res.status(404).json({ error: "Project not found" }); return; }
        authedProjectId = p.id;
      }
    } catch {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
  }

  if (authedProjectId !== projectId) {
    res.status(403).json({ error: "Token does not match project" });
    return;
  }

  const mp = getProcess(projectId);
  if (!mp?.alive || !mp.port) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(503).send(noDevServerHtml());
    return;
  }

  const port = mp.port;
  const targetPath = req.path || "/";
  // Strip the ?token param before forwarding so the user's server doesn't see it
  const qs = new URLSearchParams(req.url.includes("?") ? req.url.slice(req.url.indexOf("?") + 1) : "");
  qs.delete("token");
  const qStr = qs.toString();
  const fullPath = targetPath + (qStr ? `?${qStr}` : "");
  proxyToLocalPort(req, res, port, fullPath, projectId);
});

// GET /api/preview/:projectId — static asset-inlined preview
router.get("/:projectId", async (req: Request, res: Response, next: NextFunction) => {
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
      fileMap.get("client/index.html") ??
      fileMap.get("frontend/index.html") ??
      fileMap.get("web/index.html") ??
      fileMap.get("app/index.html") ??
      fileMap.get("static/index.html") ??
      fileMap.get("www/index.html") ??
      null;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Cache-Control", "no-store");

    if (!html) return res.send(noPreviewHtml(project.name, project.language as string));
    res.send(inlineAssets(html, fileMap));
  } catch (err) { next(err); }
});

// ── Proxy helper ──────────────────────────────────────────────────────────────

function proxyToLocalPort(req: Request, res: Response, port: number, path: string, projectId: string) {
  const options: http.RequestOptions = {
    hostname: "127.0.0.1",
    port,
    path,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${port}`,
      "x-forwarded-for": req.ip ?? "127.0.0.1",
      "x-forwarded-proto": "http",
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const contentType = proxyRes.headers["content-type"] ?? "";
    const isHtml = contentType.includes("text/html");

    if (isHtml) {
      const chunks: Buffer[] = [];
      proxyRes.on("data", (c: Buffer) => chunks.push(c));
      proxyRes.on("end", () => {
        let body = Buffer.concat(chunks).toString("utf8");
        body = rewriteHtmlPaths(body, projectId);

        const headers = { ...proxyRes.headers };
        delete headers["content-length"];
        delete headers["content-security-policy"];
        delete headers["x-frame-options"];
        headers["x-frame-options"] = "SAMEORIGIN";
        headers["cache-control"] = "no-store";

        res.writeHead(proxyRes.statusCode ?? 200, headers);
        res.end(body, "utf8");
      });
    } else {
      const headers = { ...proxyRes.headers };
      delete headers["content-security-policy"];
      headers["x-frame-options"] = "SAMEORIGIN";

      res.writeHead(proxyRes.statusCode ?? 200, headers);
      proxyRes.pipe(res, { end: true });
    }
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(502).send(proxyErrorHtml(port, err.message));
    }
  });

  proxyReq.setTimeout(10_000, () => {
    proxyReq.destroy();
    if (!res.headersSent) res.status(504).send("Proxy timeout");
  });

  if (req.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
    try {
      const body = JSON.stringify(req.body);
      proxyReq.setHeader("content-length", Buffer.byteLength(body));
      proxyReq.write(body);
    } catch { /* ignore */ }
  }

  proxyReq.end();
}

function rewriteHtmlPaths(html: string, projectId: string): string {
  const base = `/api/preview/${projectId}/live`;
  return html
    .replace(/(src|href|action)=(["'])\/(?!\/)/g, `$1=$2${base}/`)
    .replace(/url\(["']?\/((?![\/"']))/g, `url("${base}/$1`);
}

// ── HTML assembly helpers ─────────────────────────────────────────────────────

function inlineAssets(html: string, fileMap: Map<string, string>): string {
  const resolve = (href: string) => {
    if (href.startsWith("http") || href.startsWith("//") || href.startsWith("data:")) return null;
    const clean = href.replace(/^\.?\//, "").split("?")[0];
    return fileMap.get(clean) ?? fileMap.get(`public/${clean}`) ?? fileMap.get(`src/${clean}`) ?? null;
  };

  let out = html.replace(
    /<link\s[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi,
    (original, href) => {
      const css = resolve(href);
      return css != null ? `<style>/* ${href} */\n${css}\n</style>` : original;
    },
  );

  out = out.replace(
    /<link\s[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi,
    (original, href) => {
      const css = resolve(href);
      return css != null ? `<style>/* ${href} */\n${css}\n</style>` : original;
    },
  );

  out = out.replace(
    /<script\s[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
    (original, src) => {
      const js = resolve(src);
      return js != null ? `<script>/* ${src} */\n${js}\n</script>` : original;
    },
  );

  return out;
}

function noDevServerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:system-ui,-apple-system,sans-serif;color:#888;padding:32px 24px}
  .card{max-width:360px;width:100%;background:#111;border:1px solid #1f1f1f;border-radius:16px;padding:28px;text-align:center}
  .icon{font-size:2.5rem;margin-bottom:16px;display:block}
  h2{color:#e5e5e5;font-size:1rem;font-weight:600;margin:0 0 8px}
  p{font-size:.8rem;color:#555;margin:0 0 20px;line-height:1.5}
  .badge{display:inline-flex;align-items:center;gap:6px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:6px 12px;font-size:.75rem;color:#666}
  .dot{width:7px;height:7px;border-radius:50%;background:#333}
</style>
</head>
<body>
  <div class="card">
    <span class="icon">⚡</span>
    <h2>Dev server not running</h2>
    <p>Click <strong style="color:#aaa">▶ Run</strong> to start your project. Once the server is running, the live preview will appear here automatically.</p>
    <div class="badge"><div class="dot"></div>Waiting for server…</div>
  </div>
</body>
</html>`;
}

function proxyErrorHtml(port: number, msg: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:system-ui,sans-serif;color:#888;padding:24px}
  .card{max-width:380px;background:#111;border:1px solid #1f1f1f;border-radius:16px;padding:24px}
  h2{color:#e5e5e5;font-size:.95rem;font-weight:600;margin:0 0 8px}
  p{font-size:.78rem;color:#555;margin:0 0 12px}
  code{background:#1a1a1a;color:#f87171;padding:3px 6px;border-radius:4px;font-size:.75rem}
</style>
</head>
<body>
  <div class="card">
    <h2>⚠️ Could not connect to server</h2>
    <p>Port <strong style="color:#aaa">${port}</strong> is not responding.</p>
    <p>The process may still be starting up — wait a moment and click <strong style="color:#aaa">Refresh</strong>.</p>
    <code>${msg}</code>
  </div>
</body>
</html>`;
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
      title: "Node.js project",
      steps: [
        "Click <strong>▶ Run</strong> to start your dev server — the live preview will appear",
        "Or add an <code>index.html</code> for instant static preview",
        "CSS and JS files are automatically inlined for static preview",
      ],
    },
    typescript: {
      icon: "🔷",
      title: "TypeScript project",
      steps: [
        "Click <strong>▶ Run</strong> to start your dev server — the live preview will appear",
        "Or add an <code>index.html</code> for instant static preview",
        "For full TypeScript compilation, use <code>npm run dev</code> or <code>npm run build</code>",
      ],
    },
    python: {
      icon: "🐍",
      title: "Python project",
      steps: [
        "Click <strong>▶ Run</strong> to start your server (Flask, FastAPI, Django…)",
        "Once running, the live preview will appear on this tab",
        "Add an <code>index.html</code> for a static web preview",
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
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:system-ui,-apple-system,sans-serif;color:#888;padding:32px 24px}
  .card{max-width:420px;width:100%;background:#111;border:1px solid #1f1f1f;border-radius:16px;padding:28px 28px 24px;text-align:left}
  .icon{font-size:2rem;margin-bottom:12px;display:block}
  h2{color:#e5e5e5;font-size:1rem;font-weight:600;margin:0 0 6px;line-height:1.4}
  .sub{font-size:.8rem;color:#555;margin:0 0 20px}
  ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
  li{display:flex;align-items:flex-start;gap:10px;font-size:.8rem;line-height:1.5;color:#777}
  .num{min-width:20px;height:20px;border-radius:50%;background:#1a1a1a;border:1px solid #2a2a2a;display:flex;align-items:center;justify-content:center;font-size:.7rem;color:#555;font-weight:600;margin-top:1px;flex-shrink:0}
  code{background:#1a1a1a;color:#a78bfa;padding:1px 5px;border-radius:4px;font-size:.78rem;font-family:monospace}
  strong{color:#aaa;font-weight:500}
  .project{font-size:.75rem;color:#333;margin-top:20px;padding-top:16px;border-top:1px solid #1a1a1a}
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

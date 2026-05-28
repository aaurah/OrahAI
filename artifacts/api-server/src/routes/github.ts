import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { db, users, projects, files, memberships } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { cuid } from "../lib/cuid";
import { config } from "../lib/config";
import {
  parseGitHubUrl, getRepo, getRepoTree, downloadFiles,
  getBranchSha, createOrUpdateFile, getMimeType, isImportable,
  createRepo, getAuthenticatedUser, enablePages,
  listCommits, listBranches, createBranch,
  listReleases, createRelease, createGist, listWorkflowRuns,
  LANGUAGE_MAP,
} from "../lib/github";

const router = Router();

// ── GitHub OAuth (public routes — no requireAuth) ─────────────────────────────

// GET /api/github/oauth/configured  — lets the frontend know OAuth is set up
router.get("/oauth/configured", (_req: any, res: Response) => {
  res.json({ data: { configured: !!config.github.clientId } });
});

// GET /api/github/oauth/start?token=JWT  — opens in a popup, redirects to GitHub
router.get("/oauth/start", (req: any, res: Response, next: NextFunction) => {
  try {
    const { clientId, callbackUrl } = config.github;
    if (!clientId) return next(createError("GitHub OAuth is not configured on this server", 501));

    const rawToken = String(req.query.token ?? "");
    if (!rawToken) return next(createError("Missing token", 401));

    // Verify the token so we know who this is
    try {
      jwt.verify(rawToken, config.auth.jwtSecret);
    } catch {
      return next(createError("Invalid or expired session — please log in again", 401));
    }

    // Encode token as state (used in callback to identify user)
    const state = Buffer.from(rawToken).toString("base64url");
    const redirectUri = callbackUrl || `${req.protocol}://${req.get("host")}/api/github/oauth/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "repo workflow read:user",
      state,
    });

    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  } catch (err) { next(err); }
});

// GET /api/github/oauth/callback  — GitHub redirects here after authorization
router.get("/oauth/callback", async (req: any, res: Response, next: NextFunction) => {
  try {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const errorParam = String(req.query.error ?? "");

    if (errorParam) {
      return res.send(oauthCallbackHtml("error", req.query.error_description as string ?? "Authorization was denied"));
    }

    if (!code || !state) {
      return res.send(oauthCallbackHtml("error", "Missing code or state parameter"));
    }

    // Decode state → JWT → userId
    let userId: string;
    try {
      const rawToken = Buffer.from(state, "base64url").toString("utf-8");
      const payload = jwt.verify(rawToken, config.auth.jwtSecret) as { sub: string };
      userId = payload.sub;
    } catch {
      return res.send(oauthCallbackHtml("error", "Session expired — please close this window and try again"));
    }

    // Exchange code for access token
    const callbackUrl = config.github.callbackUrl || `${req.protocol}://${req.get("host")}/api/github/oauth/callback`;
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "OrahAI/1.0",
      },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
        redirect_uri: callbackUrl,
      }),
    });

    if (!tokenRes.ok) {
      return res.send(oauthCallbackHtml("error", "Failed to exchange authorization code — please try again"));
    }

    const tokenData = await tokenRes.json() as { access_token?: string; error?: string; error_description?: string };

    if (!tokenData.access_token) {
      const detail = tokenData.error_description ?? tokenData.error ?? "No access token returned";
      return res.send(oauthCallbackHtml("error", detail));
    }

    // Fetch GitHub user info to confirm identity
    const ghUserRes = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `Bearer ${tokenData.access_token}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "OrahAI/1.0",
      },
    });

    if (!ghUserRes.ok) {
      return res.send(oauthCallbackHtml("error", "Could not fetch GitHub profile — token may be invalid"));
    }

    const ghUser = await ghUserRes.json() as { login: string; name: string | null };

    // Save token to DB
    await db.update(users)
      .set({ githubToken: tokenData.access_token, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return res.send(oauthCallbackHtml("success", ghUser.login));
  } catch (err) { next(err); return; }
});

function oauthCallbackHtml(status: "success" | "error", detail: string): string {
  const safeDetail = detail.replace(/[<>"'&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "&": "&amp;" }[c] ?? c));
  const message = JSON.stringify({ type: "github-oauth", status, detail: safeDetail });
  const icon = status === "success" ? "✓" : "✗";
  const color = status === "success" ? "#22c55e" : "#ef4444";
  const text = status === "success"
    ? `Connected as <strong>@${safeDetail}</strong> — you can close this window.`
    : `Something went wrong: ${safeDetail}`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>GitHub ${status === "success" ? "Connected" : "Error"}</title>
<style>
  body { margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh;
         background:#0a0a0a; font-family:system-ui,sans-serif; color:#ccc; text-align:center; padding:24px; }
  .icon { font-size:2.5rem; color:${color}; margin-bottom:12px; }
  p { font-size:.9rem; line-height:1.6; max-width:300px; }
  strong { color:#fff; }
</style></head>
<body>
  <div>
    <div class="icon">${icon}</div>
    <p>${text}</p>
  </div>
  <script>
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(${message}, '*');
        if (${status === "success"}) setTimeout(() => window.close(), 800);
      }
    } catch(e) { /* cross-origin guard */ }
  </script>
</body></html>`;
}

// ── All routes below require authentication ───────────────────────────────────
router.use(requireAuth);

// ── Token management ─────────────────────────────────────────────────────────

router.get("/token", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [user] = await db
      .select({ githubToken: users.githubToken })
      .from(users).where(eq(users.id, req.user!.id)).limit(1);
    res.json({ data: { hasToken: !!user?.githubToken } });
  } catch (err) { next(err); }
});

router.post("/token", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ token: z.string().min(1).max(256) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Invalid token format", 400));

    const verifyRes = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `Bearer ${parsed.data.token}`,
        "User-Agent": "OrahAI/1.0",
        "Accept": "application/vnd.github.v3+json",
      },
    });
    if (!verifyRes.ok) return next(createError("Invalid GitHub token — check it has the required permissions", 401));
    const ghUser = await verifyRes.json() as { login: string; name: string | null };

    await db.update(users)
      .set({ githubToken: parsed.data.token, updatedAt: new Date() })
      .where(eq(users.id, req.user!.id));

    res.json({ data: { login: ghUser.login, name: ghUser.name } });
  } catch (err) { next(err); }
});

router.delete("/token", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await db.update(users)
      .set({ githubToken: null, updatedAt: new Date() })
      .where(eq(users.id, req.user!.id));
    res.json({ data: null, message: "GitHub token removed" });
  } catch (err) { next(err); }
});

// ── Preview (for import dialog) ───────────────────────────────────────────────

router.post("/preview", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      repoUrl: z.string().min(1),
      token: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

    const [userRow] = await db
      .select({ githubToken: users.githubToken })
      .from(users).where(eq(users.id, req.user!.id)).limit(1);
    const token = parsed.data.token ?? userRow?.githubToken ?? null;

    const parsedUrl = parseGitHubUrl(parsed.data.repoUrl);
    if (!parsedUrl) return next(createError("Invalid GitHub repository URL", 400));
    const { owner, repo } = parsedUrl;

    const repoInfo = await getRepo(owner, repo, token);

    let fileCount = 0;
    let branch = repoInfo.default_branch;
    try {
      const sha = await getBranchSha(owner, repo, branch, token);
      const tree = await getRepoTree(owner, repo, sha, token);
      fileCount = Math.min(tree.tree.filter(isImportable).length, 150);
    } catch { /* ignore if rate limited */ }

    res.json({
      data: {
        name: repoInfo.name,
        fullName: repoInfo.full_name,
        description: repoInfo.description,
        language: repoInfo.language,
        defaultBranch: branch,
        private: repoInfo.private,
        stars: repoInfo.stargazers_count,
        forks: repoInfo.forks_count,
        importableFiles: fileCount,
        mappedLanguage: LANGUAGE_MAP[repoInfo.language ?? ""] ?? "nodejs",
      },
    });
  } catch (err) { next(err); }
});

// ── Import (creates project with real files) ──────────────────────────────────

router.post("/import", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      repoUrl: z.string().min(1),
      workspaceId: z.string().min(1),
      branch: z.string().optional(),
      token: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

    const [userRow] = await db
      .select({ githubToken: users.githubToken })
      .from(users).where(eq(users.id, req.user!.id)).limit(1);
    const token = parsed.data.token ?? userRow?.githubToken ?? null;

    const parsedUrl = parseGitHubUrl(parsed.data.repoUrl);
    if (!parsedUrl) return next(createError("Invalid GitHub repository URL", 400));
    const { owner, repo } = parsedUrl;

    const [m] = await db.select().from(memberships)
      .where(and(eq(memberships.userId, req.user!.id), eq(memberships.workspaceId, parsed.data.workspaceId)))
      .limit(1);
    if (!m) return next(createError("Workspace not found or access denied", 404));

    const repoInfo = await getRepo(owner, repo, token);
    const branch = parsed.data.branch ?? repoInfo.default_branch;
    const sha = await getBranchSha(owner, repo, branch, token);
    const tree = await getRepoTree(owner, repo, sha, token);
    const downloaded = await downloadFiles(owner, repo, tree.tree, sha, token);

    function slugify(s: string) {
      return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "project";
    }
    let slug = slugify(repoInfo.name);
    let i = 1;
    while (
      (await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.workspaceId, parsed.data.workspaceId), eq(projects.slug, slug), isNull(projects.deletedAt)))
        .limit(1)).length > 0
    ) {
      slug = `${slugify(repoInfo.name)}-${i++}`;
    }

    const projectId = cuid();
    const [project] = await db.insert(projects).values({
      id: projectId,
      name: repoInfo.name,
      slug,
      description: repoInfo.description ?? null,
      language: LANGUAGE_MAP[repoInfo.language ?? ""] ?? "nodejs",
      isPublic: !repoInfo.private,
      workspaceId: parsed.data.workspaceId,
      ownerId: req.user!.id,
      githubRepo: `${owner}/${repo}`,
      githubBranch: branch,
      githubSha: sha,
      githubSyncedAt: new Date(),
    }).returning();

    if (downloaded.length > 0) {
      await db.insert(files).values(
        downloaded.map((f) => ({
          id: cuid(),
          projectId,
          path: f.path,
          name: f.path.split("/").pop()!,
          content: f.content,
          mimeType: getMimeType(f.path),
          isDir: false,
          size: Buffer.byteLength(f.content, "utf-8"),
        })),
      );
    }

    res.status(201).json({
      data: { ...project, _count: { files: downloaded.length, runs: 0, chats: 0 } },
      message: `Imported ${downloaded.length} files from ${owner}/${repo}`,
    });
  } catch (err) { next(err); }
});

// ── Per-project: status ───────────────────────────────────────────────────────

router.get("/projects/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [p] = await db.select({
      id: projects.id, githubRepo: projects.githubRepo,
      githubBranch: projects.githubBranch, githubSha: projects.githubSha,
      githubSyncedAt: projects.githubSyncedAt,
    }).from(projects).where(and(eq(projects.id, String(req.params.id)), isNull(projects.deletedAt))).limit(1);
    if (!p) return next(createError("Project not found", 404));
    const [userRow] = await db.select({ githubToken: users.githubToken }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    res.json({ data: { ...p, hasToken: !!userRow?.githubToken } });
  } catch (err) { next(err); }
});

// ── Per-project: connect / disconnect ────────────────────────────────────────

router.patch("/projects/:id/connect", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ repoUrl: z.string().nullable(), branch: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400));

    const [p] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, String(req.params.id)), isNull(projects.deletedAt), eq(projects.ownerId, req.user!.id)))
      .limit(1);
    if (!p) return next(createError("Project not found", 404));

    if (parsed.data.repoUrl === null) {
      await db.update(projects)
        .set({ githubRepo: null, githubBranch: null, githubSha: null, githubSyncedAt: null, updatedAt: new Date() })
        .where(eq(projects.id, p.id));
      return res.json({ data: null, message: "Disconnected from GitHub" });
    }

    const parsedUrl = parseGitHubUrl(parsed.data.repoUrl);
    if (!parsedUrl) return next(createError("Invalid GitHub URL", 400));
    const branch = parsed.data.branch ?? "main";

    await db.update(projects)
      .set({ githubRepo: `${parsedUrl.owner}/${parsedUrl.repo}`, githubBranch: branch, githubSha: null, githubSyncedAt: null, updatedAt: new Date() })
      .where(eq(projects.id, p.id));

    res.json({ data: { githubRepo: `${parsedUrl.owner}/${parsedUrl.repo}`, githubBranch: branch } });
  } catch (err) { next(err); }
});

// ── Per-project: pull (sync from GitHub) ─────────────────────────────────────

router.post("/projects/:id/pull", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [p] = await db.select().from(projects)
      .where(and(eq(projects.id, String(req.params.id)), isNull(projects.deletedAt), eq(projects.ownerId, req.user!.id)))
      .limit(1);
    if (!p) return next(createError("Project not found", 404));
    if (!p.githubRepo) return next(createError("No GitHub repository connected to this project", 400));

    const [owner, repo] = p.githubRepo.split("/");
    const branch = p.githubBranch ?? "main";

    const [userRow] = await db.select({ githubToken: users.githubToken }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    const token = userRow?.githubToken ?? null;

    const latestSha = await getBranchSha(owner, repo, branch, token);
    if (latestSha === p.githubSha) {
      return res.json({ data: { updated: 0, created: 0, sha: latestSha }, message: "Already up to date" });
    }

    const tree = await getRepoTree(owner, repo, latestSha, token);
    const downloaded = await downloadFiles(owner, repo, tree.tree, latestSha, token);

    const existingFiles = await db.select({ id: files.id, path: files.path, content: files.content })
      .from(files).where(and(eq(files.projectId, p.id), isNull(files.deletedAt)));
    const byPath = new Map(existingFiles.map(f => [f.path, f]));

    let updated = 0;
    let created = 0;

    for (const f of downloaded) {
      const existing = byPath.get(f.path);
      if (existing) {
        if (existing.content !== f.content) {
          await db.update(files)
            .set({ content: f.content, size: Buffer.byteLength(f.content, "utf-8"), updatedAt: new Date() })
            .where(eq(files.id, existing.id));
          updated++;
        }
      } else {
        await db.insert(files).values({
          id: cuid(), projectId: p.id,
          path: f.path, name: f.path.split("/").pop()!,
          content: f.content, mimeType: getMimeType(f.path),
          isDir: false, size: Buffer.byteLength(f.content, "utf-8"),
        });
        created++;
      }
    }

    await db.update(projects)
      .set({ githubSha: latestSha, githubSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, p.id));

    res.json({
      data: { updated, created, sha: latestSha },
      message: `Pulled: ${created} new file${created !== 1 ? "s" : ""}, ${updated} updated`,
    });
  } catch (err) { next(err); }
});

// ── Per-project: push (sync to GitHub) ───────────────────────────────────────

router.post("/projects/:id/push", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ message: z.string().max(500).optional().default("Update from OrahAI") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400));

    const [p] = await db.select().from(projects)
      .where(and(eq(projects.id, String(req.params.id)), isNull(projects.deletedAt), eq(projects.ownerId, req.user!.id)))
      .limit(1);
    if (!p) return next(createError("Project not found", 404));
    if (!p.githubRepo) return next(createError("No GitHub repository connected to this project", 400));

    const [userRow] = await db.select({ githubToken: users.githubToken }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!userRow?.githubToken) return next(createError("No GitHub token set — add one in settings", 401));
    const token = userRow.githubToken;

    const [owner, repo] = p.githubRepo.split("/");
    const branch = p.githubBranch ?? "main";

    const ghTreeMap = new Map<string, string>();
    try {
      const latestSha = await getBranchSha(owner, repo, branch, token);
      const tree = await getRepoTree(owner, repo, latestSha, token);
      for (const item of tree.tree) {
        if (item.type === "blob") ghTreeMap.set(item.path, item.sha);
      }
    } catch { /* new or empty repo */ }

    const projectFiles = await db.select({ path: files.path, content: files.content })
      .from(files)
      .where(and(eq(files.projectId, p.id), isNull(files.deletedAt), eq(files.isDir, false)));

    let pushed = 0;
    const BATCH = 3;
    for (let i = 0; i < projectFiles.length; i += BATCH) {
      const batch = projectFiles.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(async (f) => {
        await createOrUpdateFile(owner, repo, f.path, f.content, parsed.data.message!, token, ghTreeMap.get(f.path) ?? null);
        pushed++;
      }));
      if (i + BATCH < projectFiles.length) await new Promise(r => setTimeout(r, 150));
    }

    let newSha = p.githubSha;
    try { newSha = await getBranchSha(owner, repo, branch, token); } catch { /* ignore */ }

    await db.update(projects)
      .set({ githubSha: newSha, githubSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, p.id));

    res.json({ data: { pushed, sha: newSha }, message: `Pushed ${pushed} file${pushed !== 1 ? "s" : ""} to ${owner}/${repo}` });
  } catch (err) { next(err); }
});

// ── Per-project: create new GitHub repo & push all files ─────────────────────

router.post("/projects/:id/create-and-push", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      repoName: z.string().min(1).max(100),
      private: z.boolean().optional().default(false),
      description: z.string().max(300).optional().default(""),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

    const [p] = await db.select().from(projects)
      .where(and(eq(projects.id, String(req.params.id)), isNull(projects.deletedAt), eq(projects.ownerId, req.user!.id)))
      .limit(1);
    if (!p) return next(createError("Project not found", 404));

    const [userRow] = await db.select({ githubToken: users.githubToken }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!userRow?.githubToken) return next(createError("No GitHub token — add one in Settings first", 401));
    const token = userRow.githubToken;

    // Get authenticated user to build the full repo path
    const ghUser = await getAuthenticatedUser(token);
    const owner = ghUser.login;

    // Create the repo on GitHub
    const newRepo = await createRepo(parsed.data.repoName, {
      description: parsed.data.description,
      private: parsed.data.private,
      autoInit: false,
    }, token);

    // Push all project files to the new repo
    const projectFiles = await db.select({ path: files.path, content: files.content })
      .from(files)
      .where(and(eq(files.projectId, p.id), isNull(files.deletedAt), eq(files.isDir, false)));

    let pushed = 0;
    const BATCH = 3;
    for (let i = 0; i < projectFiles.length; i += BATCH) {
      const batch = projectFiles.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(async (f) => {
        await createOrUpdateFile(owner, newRepo.name, f.path, f.content, "Initial commit from OrahAI", token, null, "main");
        pushed++;
      }));
      if (i + BATCH < projectFiles.length) await new Promise(r => setTimeout(r, 150));
    }

    // Connect the project to the new repo
    let newSha: string | null = null;
    try {
      const { getBranchSha: _getBranchSha } = await import("../lib/github");
      newSha = await _getBranchSha(owner, newRepo.name, "main", token);
    } catch { /* ignore */ }

    await db.update(projects)
      .set({
        githubRepo: `${owner}/${newRepo.name}`,
        githubBranch: "main",
        githubSha: newSha,
        githubSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, p.id));

    res.json({
      data: {
        repo: `${owner}/${newRepo.name}`,
        url: `https://github.com/${owner}/${newRepo.name}`,
        pushed,
        private: newRepo.private,
      },
      message: `Created ${owner}/${newRepo.name} and pushed ${pushed} file${pushed !== 1 ? "s" : ""}`,
    });
  } catch (err) { next(err); }
});

// ── Per-project: deploy to GitHub Pages ──────────────────────────────────────

router.post("/projects/:id/deploy", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ message: z.string().max(500).optional().default("Deploy from OrahAI") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400));

    const [p] = await db.select().from(projects)
      .where(and(eq(projects.id, String(req.params.id)), isNull(projects.deletedAt), eq(projects.ownerId, req.user!.id)))
      .limit(1);
    if (!p) return next(createError("Project not found", 404));
    if (!p.githubRepo) return next(createError("Connect a GitHub repository first", 400));

    const [userRow] = await db.select({ githubToken: users.githubToken }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!userRow?.githubToken) return next(createError("No GitHub token set", 401));
    const token = userRow.githubToken;

    const [owner, repo] = p.githubRepo.split("/");
    const deployBranch = "gh-pages";

    // Get all project files
    const projectFiles = await db.select({ path: files.path, content: files.content })
      .from(files)
      .where(and(eq(files.projectId, p.id), isNull(files.deletedAt), eq(files.isDir, false)));

    if (projectFiles.length === 0) return next(createError("No files to deploy", 400));

    // Get existing tree on gh-pages (to find existing file SHAs for updates)
    const ghTreeMap = new Map<string, string>();
    try {
      const sha = await getBranchSha(owner, repo, deployBranch, token);
      const tree = await getRepoTree(owner, repo, sha, token);
      for (const item of tree.tree) {
        if (item.type === "blob") ghTreeMap.set(item.path, item.sha);
      }
    } catch { /* branch doesn't exist yet — that's fine */ }

    // Always inject .nojekyll so GitHub Pages skips Jekyll processing,
    // which would otherwise silently drop files/folders starting with "_"
    // (e.g. _next, _app, __pycache__). See: https://docs.github.com/en/pages
    const filesToDeploy = [
      ...projectFiles,
      { path: ".nojekyll", content: "" },
    ];

    const BATCH = 3;
    let pushed = 0;
    for (let i = 0; i < filesToDeploy.length; i += BATCH) {
      const batch = filesToDeploy.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(async (f) => {
        await createOrUpdateFile(owner, repo, f.path, f.content, parsed.data.message!, token, ghTreeMap.get(f.path) ?? null, deployBranch);
        pushed++;
      }));
      if (i + BATCH < filesToDeploy.length) await new Promise(r => setTimeout(r, 150));
    }
    pushed -= 1; // don't count .nojekyll in the user-facing total

    const pagesUrl = `https://${owner.toLowerCase()}.github.io/${repo}/`;
    const settingsUrl = `https://github.com/${owner}/${repo}/settings/pages`;

    // Auto-enable GitHub Pages so users don't have to do it manually.
    // Will 409 (already on) gracefully. Throws for private repos on free plans.
    let pagesEnabled = false;
    let pagesWarning: string | null = null;
    try {
      pagesEnabled = await enablePages(owner, repo, deployBranch, token);
    } catch (e: unknown) {
      const err = e as Error & { statusCode?: number };
      // 403/404 usually means private repo on free plan — not fatal
      pagesWarning = err.message ?? "Could not auto-enable GitHub Pages";
    }

    res.json({
      data: { pushed, url: pagesUrl, settingsUrl, branch: deployBranch, pagesEnabled, pagesWarning },
      message: `Deployed ${pushed} file${pushed !== 1 ? "s" : ""} to GitHub Pages`,
    });
  } catch (err) { next(err); }
});

// ── Per-project: commits ──────────────────────────────────────────────────────

router.get("/projects/:id/commits", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const [p] = await db.select({ githubRepo: projects.githubRepo, githubBranch: projects.githubBranch })
      .from(projects).where(and(eq(projects.id, String(req.params.id)), isNull(projects.deletedAt))).limit(1);
    if (!p?.githubRepo) return next(createError("No GitHub repository connected", 400));

    const [userRow] = await db.select({ githubToken: users.githubToken }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    const [owner, repo] = p.githubRepo.split("/");
    const branch = p.githubBranch ?? "main";
    const commits = await listCommits(owner, repo, branch, userRow?.githubToken ?? null, limit);
    res.json({
      data: commits.map(c => ({
        sha: c.sha,
        message: c.commit.message.split("\n")[0],
        authorName: c.commit.author.name,
        authorDate: c.commit.author.date,
        url: c.html_url,
        authorLogin: c.author?.login ?? null,
        authorAvatar: c.author?.avatar_url ?? null,
      })),
    });
  } catch (err) { next(err); }
});

// ── Per-project: branches ─────────────────────────────────────────────────────

router.get("/projects/:id/branches", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [p] = await db.select({ githubRepo: projects.githubRepo, githubBranch: projects.githubBranch })
      .from(projects).where(and(eq(projects.id, String(req.params.id)), isNull(projects.deletedAt))).limit(1);
    if (!p?.githubRepo) return next(createError("No GitHub repository connected", 400));

    const [userRow] = await db.select({ githubToken: users.githubToken }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    const [owner, repo] = p.githubRepo.split("/");
    const branches = await listBranches(owner, repo, userRow?.githubToken ?? null);
    res.json({
      data: branches.map(b => ({
        name: b.name,
        sha: b.commit.sha,
        protected: b.protected,
        active: b.name === (p.githubBranch ?? "main"),
      })),
    });
  } catch (err) { next(err); }
});

router.post("/projects/:id/branch", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ name: z.string().min(1).max(100), fromBranch: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400));

    const [p] = await db.select({ id: projects.id, githubRepo: projects.githubRepo, githubBranch: projects.githubBranch, ownerId: projects.ownerId })
      .from(projects).where(and(eq(projects.id, String(req.params.id)), isNull(projects.deletedAt))).limit(1);
    if (!p?.githubRepo) return next(createError("No GitHub repository connected", 400));
    if (p.ownerId !== req.user!.id) return next(createError("Forbidden", 403));

    const [userRow] = await db.select({ githubToken: users.githubToken }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!userRow?.githubToken) return next(createError("No GitHub token", 401));

    const [owner, repo] = p.githubRepo.split("/");
    const fromBranch = parsed.data.fromBranch ?? p.githubBranch ?? "main";
    const sha = await getBranchSha(owner, repo, fromBranch, userRow.githubToken);
    await createBranch(owner, repo, parsed.data.name, sha, userRow.githubToken);
    res.json({ data: { name: parsed.data.name, fromBranch, sha }, message: `Branch "${parsed.data.name}" created` });
  } catch (err) { next(err); }
});

// ── Per-project: releases ─────────────────────────────────────────────────────

router.get("/projects/:id/releases", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [p] = await db.select({ githubRepo: projects.githubRepo, githubBranch: projects.githubBranch })
      .from(projects).where(and(eq(projects.id, String(req.params.id)), isNull(projects.deletedAt))).limit(1);
    if (!p?.githubRepo) return next(createError("No GitHub repository connected", 400));

    const [userRow] = await db.select({ githubToken: users.githubToken }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    const [owner, repo] = p.githubRepo.split("/");
    const releases = await listReleases(owner, repo, userRow?.githubToken ?? null, 10);
    res.json({
      data: releases.map(r => ({
        id: r.id, tag: r.tag_name, name: r.name,
        body: r.body ?? "", draft: r.draft, prerelease: r.prerelease,
        url: r.html_url, publishedAt: r.published_at,
      })),
    });
  } catch (err) { next(err); }
});

router.post("/projects/:id/release", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      tag: z.string().min(1).max(128),
      name: z.string().max(255).optional().default(""),
      body: z.string().max(10000).optional().default(""),
      draft: z.boolean().optional().default(false),
      prerelease: z.boolean().optional().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400));

    const [p] = await db.select({ id: projects.id, githubRepo: projects.githubRepo, githubBranch: projects.githubBranch, ownerId: projects.ownerId })
      .from(projects).where(and(eq(projects.id, String(req.params.id)), isNull(projects.deletedAt))).limit(1);
    if (!p?.githubRepo) return next(createError("No GitHub repository connected", 400));
    if (p.ownerId !== req.user!.id) return next(createError("Forbidden", 403));

    const [userRow] = await db.select({ githubToken: users.githubToken }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!userRow?.githubToken) return next(createError("No GitHub token", 401));

    const [owner, repo] = p.githubRepo.split("/");
    const release = await createRelease(owner, repo, {
      tag: parsed.data.tag,
      name: parsed.data.name || parsed.data.tag,
      body: parsed.data.body,
      draft: parsed.data.draft,
      prerelease: parsed.data.prerelease,
      targetBranch: p.githubBranch ?? "main",
    }, userRow.githubToken);

    res.json({
      data: { id: release.id, tag: release.tag_name, name: release.name, url: release.html_url, draft: release.draft, prerelease: release.prerelease },
      message: `Release ${release.tag_name} created`,
    });
  } catch (err) { next(err); }
});

// ── Gists (not project-scoped) ────────────────────────────────────────────────

router.post("/gists", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      projectId: z.string().min(1),
      description: z.string().max(300).optional().default(""),
      public: z.boolean().optional().default(true),
      paths: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(createError("Validation error", 400));

    const [p] = await db.select({ id: projects.id, ownerId: projects.ownerId })
      .from(projects).where(and(eq(projects.id, parsed.data.projectId), isNull(projects.deletedAt))).limit(1);
    if (!p) return next(createError("Project not found", 404));
    if (p.ownerId !== req.user!.id) return next(createError("Forbidden", 403));

    const [userRow] = await db.select({ githubToken: users.githubToken }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!userRow?.githubToken) return next(createError("No GitHub token", 401));

    const query = db.select({ path: files.path, content: files.content, isDir: files.isDir })
      .from(files)
      .where(and(eq(files.projectId, p.id), isNull(files.deletedAt), eq(files.isDir, false)));

    const projectFiles = await query;
    const filtered = parsed.data.paths?.length
      ? projectFiles.filter(f => parsed.data.paths!.includes(f.path))
      : projectFiles.slice(0, 20);

    if (filtered.length === 0) return next(createError("No files to share", 400));

    const fileMap: Record<string, string> = {};
    for (const f of filtered) {
      const filename = f.path.replace(/\//g, "_");
      fileMap[filename] = f.content || " ";
    }

    const gist = await createGist(parsed.data.description, parsed.data.public, fileMap, userRow.githubToken);
    res.json({ data: { id: gist.id, url: gist.html_url, description: gist.description }, message: "Gist created" });
  } catch (err) { next(err); }
});

// ── Per-project: GitHub Actions runs ─────────────────────────────────────────

router.get("/projects/:id/actions", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [p] = await db.select({ githubRepo: projects.githubRepo })
      .from(projects).where(and(eq(projects.id, String(req.params.id)), isNull(projects.deletedAt))).limit(1);
    if (!p?.githubRepo) return next(createError("No GitHub repository connected", 400));

    const [userRow] = await db.select({ githubToken: users.githubToken }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    const [owner, repo] = p.githubRepo.split("/");
    const runs = await listWorkflowRuns(owner, repo, userRow?.githubToken ?? null, 10);
    res.json({
      data: runs.map(r => ({
        id: r.id, name: r.name, status: r.status,
        conclusion: r.conclusion, url: r.html_url,
        createdAt: r.created_at,
        commitMessage: r.head_commit?.message?.split("\n")[0] ?? "",
        branch: r.head_branch ?? "",
        event: r.event,
      })),
    });
  } catch (err) { next(err); }
});

export default router;


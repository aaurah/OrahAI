import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, users, projects, files, memberships } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { cuid } from "../lib/cuid";
import {
  parseGitHubUrl, getRepo, getRepoTree, downloadFiles,
  getBranchSha, createOrUpdateFile, getMimeType, isImportable,
  LANGUAGE_MAP,
} from "../lib/github";

const router = Router();
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

export default router;

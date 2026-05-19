const GH_API = "https://api.github.com";

export interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  default_branch: string;
  private: boolean;
  stargazers_count: number;
  forks_count: number;
}

export interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

export interface RepoTree {
  sha: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

const TEXT_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "py", "rb", "php", "go", "rs", "java", "c", "cpp", "h", "hpp", "cs",
  "html", "htm", "css", "scss", "sass", "less", "svelte", "vue",
  "json", "json5", "yaml", "yml", "toml", "xml",
  "md", "mdx", "txt", "rst",
  "sh", "bash", "zsh", "fish", "ps1",
  "sql", "graphql", "prisma",
  "gitignore", "env", "example", "editorconfig",
  "dockerfile", "makefile",
]);

const SKIP_PATH_SEGMENTS = [
  "node_modules", ".git", ".next", ".nuxt", "dist", "build",
  "__pycache__", "vendor", ".venv", "venv", ".cache",
  "coverage", ".nyc_output",
];

const MAX_FILE_SIZE = 500_000;
export const MAX_IMPORT_FILES = 150;

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const clean = url.trim().replace(/\/$/, "").replace(/\.git$/, "");
  const match = clean.match(/github\.com\/([^/\s]+)\/([^/\s?#]+)/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

export function isImportable(item: GitHubTreeItem): boolean {
  if (item.type !== "blob") return false;
  const parts = item.path.split("/");
  if (parts.some(p => SKIP_PATH_SEGMENTS.includes(p.toLowerCase()))) return false;
  if ((item.size ?? 0) > MAX_FILE_SIZE) return false;
  const filename = parts[parts.length - 1].toLowerCase();
  const dotParts = filename.split(".");
  if (dotParts.length < 2) {
    return ["makefile", "dockerfile", "rakefile", "gemfile", "procfile"].includes(filename);
  }
  const ext = dotParts[dotParts.length - 1];
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (filename.startsWith(".") && TEXT_EXTENSIONS.has(filename.slice(1))) return true;
  return false;
}

async function ghFetch<T>(url: string, token?: string | null, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "OrahAI/1.0",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> | undefined ?? {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText })) as { message?: string };
    let msg: string;
    if (res.status === 404) {
      msg = token
        ? "Repository not found — check the URL is correct and the token has repo access"
        : "Repository not found — if this is a private repo, expand 'Use a token for private repos' and add your GitHub Personal Access Token";
    } else if (res.status === 401) {
      msg = "GitHub token is invalid or expired — generate a new one at github.com/settings/tokens";
    } else if (res.status === 403) {
      const rateLimitRemaining = res.headers.get("x-ratelimit-remaining");
      if (rateLimitRemaining === "0") {
        msg = "GitHub API rate limit reached — add a Personal Access Token for higher limits";
      } else {
        msg = "Access denied — your token may not have the required 'repo' scope";
      }
    } else if (res.status === 429) {
      msg = "GitHub API rate limit reached — add a Personal Access Token for higher limits";
    } else {
      msg = body.message ?? `GitHub API error ${res.status}`;
    }
    const err = new Error(msg) as Error & { statusCode: number };
    err.statusCode = res.status === 404 ? 404 : res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function getRepo(owner: string, repo: string, token?: string | null): Promise<GitHubRepo> {
  return ghFetch<GitHubRepo>(`${GH_API}/repos/${owner}/${repo}`, token);
}

export async function getRepoTree(owner: string, repo: string, ref: string, token?: string | null): Promise<RepoTree> {
  return ghFetch<RepoTree>(`${GH_API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, token);
}

export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token?: string | null,
): Promise<{ content: string; sha: string }> {
  const data = await ghFetch<{ content: string; sha: string }>(
    `${GH_API}/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
    token,
  );
  const content = Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf-8");
  return { content, sha: data.sha };
}

export async function getBranchSha(owner: string, repo: string, branch: string, token?: string | null): Promise<string> {
  const data = await ghFetch<{ sha: string }>(
    `${GH_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`,
    token,
  );
  return data.sha;
}

export async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  token: string,
  sha?: string | null,
  branch?: string,
): Promise<void> {
  const encoded = Buffer.from(content, "utf-8").toString("base64");
  const body: Record<string, unknown> = { message, content: encoded };
  if (sha) body.sha = sha;
  if (branch) body.branch = branch;

  const res = await fetch(
    `${GH_API}/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "OrahAI/1.0",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `Failed to push ${path}` })) as { message?: string };
    throw new Error(err.message ?? `Failed to push ${path}`);
  }
}

export async function createRepo(
  name: string,
  options: { description?: string; private?: boolean; autoInit?: boolean },
  token: string,
): Promise<GitHubRepo> {
  const body: Record<string, unknown> = {
    name,
    description: options.description ?? "",
    private: options.private ?? false,
    auto_init: options.autoInit ?? false,
  };
  const res = await fetch(`${GH_API}/user/repos`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "OrahAI/1.0",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` })) as { message?: string; errors?: { message: string }[] };
    const detail = err.errors?.[0]?.message ?? err.message ?? `GitHub API error ${res.status}`;
    if (res.status === 422 && detail.toLowerCase().includes("already exists")) {
      throw new Error(`A repository named "${name}" already exists on your GitHub account`);
    }
    throw new Error(detail);
  }
  return res.json() as Promise<GitHubRepo>;
}

export async function getAuthenticatedUser(token: string): Promise<{ login: string; name: string | null }> {
  return ghFetch<{ login: string; name: string | null }>(`${GH_API}/user`, token);
}

export async function downloadFiles(
  owner: string,
  repo: string,
  items: GitHubTreeItem[],
  ref: string,
  token?: string | null,
): Promise<Array<{ path: string; content: string; sha: string }>> {
  const importable = items.filter(isImportable).slice(0, MAX_IMPORT_FILES);
  const results: Array<{ path: string; content: string; sha: string }> = [];
  const BATCH = 5;

  for (let i = 0; i < importable.length; i += BATCH) {
    const batch = importable.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(async (item) => {
        const { content, sha } = await getFileContent(owner, repo, item.path, ref, token);
        return { path: item.path, content, sha };
      }),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") results.push(r.value);
    }
    if (i + BATCH < importable.length) await new Promise(r => setTimeout(r, 80));
  }
  return results;
}

export function getMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    js: "application/javascript", jsx: "application/javascript",
    mjs: "application/javascript", cjs: "application/javascript",
    ts: "text/typescript", tsx: "text/typescript",
    py: "text/x-python", rb: "application/x-ruby",
    html: "text/html", css: "text/css", scss: "text/css",
    json: "application/json", yaml: "application/yaml", yml: "application/yaml",
    md: "text/markdown", txt: "text/plain",
    go: "text/x-go", rs: "text/x-rust", java: "text/x-java",
    sh: "application/x-sh", sql: "application/sql",
    graphql: "application/graphql", toml: "application/toml",
  };
  return map[ext] ?? "text/plain";
}

/**
 * Enable GitHub Pages for a repo, sourcing from the given branch at "/".
 * Gracefully handles 409 (already enabled) and 422 (already configured).
 * Returns true if Pages was freshly enabled, false if it was already on.
 */
export async function enablePages(owner: string, repo: string, branch: string, token: string): Promise<boolean> {
  const body = JSON.stringify({ source: { branch, path: "/" } });
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/vnd.github.v3+json",
    "Authorization": `Bearer ${token}`,
    "User-Agent": "OrahAI/1.0",
  };

  // Try to create Pages (will 409 if already exists)
  const createRes = await fetch(`${GH_API}/repos/${owner}/${repo}/pages`, {
    method: "POST", headers, body,
  });
  if (createRes.status === 201) return true;
  if (createRes.status === 409 || createRes.status === 422) {
    // Already enabled — update the source branch to make sure it's gh-pages
    await fetch(`${GH_API}/repos/${owner}/${repo}/pages`, {
      method: "PUT", headers, body,
    });
    return false;
  }
  // Non-critical failure (e.g. private repo on free plan) — don't throw,
  // just let the caller surface a helpful message.
  const errBody = await createRes.json().catch(() => ({})) as { message?: string };
  const err = new Error(errBody.message ?? `GitHub Pages API error ${createRes.status}`) as Error & { statusCode: number };
  err.statusCode = createRes.status;
  throw err;
}

export const LANGUAGE_MAP: Record<string, string> = {
  JavaScript: "nodejs", TypeScript: "typescript",
  Python: "python", HTML: "html", CSS: "html",
  Go: "nodejs", Rust: "nodejs", Java: "nodejs",
  Ruby: "nodejs", PHP: "nodejs", "C#": "nodejs", "C++": "nodejs",
};

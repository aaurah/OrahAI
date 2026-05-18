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
    const msg = body.message ?? `GitHub API error ${res.status}`;
    const err = new Error(msg) as Error & { statusCode: number };
    err.statusCode = res.status;
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
): Promise<void> {
  const encoded = Buffer.from(content, "utf-8").toString("base64");
  const body: Record<string, unknown> = { message, content: encoded };
  if (sha) body.sha = sha;

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

export const LANGUAGE_MAP: Record<string, string> = {
  JavaScript: "nodejs", TypeScript: "typescript",
  Python: "python", HTML: "html", CSS: "html",
  Go: "nodejs", Rust: "nodejs", Java: "nodejs",
  Ruby: "nodejs", PHP: "nodejs", "C#": "nodejs", "C++": "nodejs",
};

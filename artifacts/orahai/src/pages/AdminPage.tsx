import { useState, useEffect, useCallback } from "react";
import { Shield, Users, FolderOpen, Play, BarChart3, Search, Trash2, RefreshCw, ChevronLeft, ChevronRight, Activity, Loader2, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { formatDistanceToNow } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Tab = "overview" | "users" | "projects" | "runs";

interface Stats {
  users: { total: number; new30Days: number };
  projects: { total: number; new30Days: number };
  files: { total: number };
  runs: { total: number; success: number; error: number };
  chats: { total: number };
}

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
  projectCount: number;
}

interface AdminProject {
  id: string;
  name: string;
  description: string | null;
  language: string;
  isPublic: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner: { email: string; username: string } | null;
  fileCount: number;
  runCount: number;
}

interface AdminRun {
  id: string;
  projectId: string;
  projectName: string;
  command: string;
  status: string;
  exitCode: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const LANG_COLORS: Record<string, string> = {
  python: "bg-blue-500", nodejs: "bg-green-500",
  typescript: "bg-indigo-500", html: "bg-amber-500",
};

const LANG_LABELS: Record<string, string> = {
  python: "Python", nodejs: "Node.js", typescript: "TypeScript", html: "HTML",
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await api.get<{ data: Stats }>("/api/admin/stats");
      setStats(res.data);
    } catch { /* ignore */ } finally { setStatsLoading(false); }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
    { id: "projects", label: "Projects", icon: <FolderOpen className="w-4 h-4" /> },
    { id: "runs", label: "Runs", icon: <Activity className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">System management and monitoring</p>
          </div>
          <Button variant="ghost" size="sm" onClick={loadStats} className="ml-auto gap-2" disabled={statsLoading}>
            <RefreshCw className={cn("w-4 h-4", statsLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="flex gap-1 mb-8 border-b border-border">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && <OverviewTab stats={stats} loading={statsLoading} />}
        {tab === "users" && <UsersTab />}
        {tab === "projects" && <ProjectsTab />}
        {tab === "runs" && <RunsTab />}
      </main>
    </div>
  );
}

function StatCard({ label, value, sub, icon, color }: { label: string; value: number | string; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground font-medium">{label}</span>
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", color)}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function OverviewTab({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (!stats) return (
    <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
      <AlertCircle className="w-5 h-5" /> Failed to load stats
    </div>
  );

  const runSuccessRate = stats.runs.total > 0
    ? Math.round((stats.runs.success / stats.runs.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats.users.total}
          sub={`+${stats.users.new30Days} this month`}
          icon={<Users className="w-4 h-4 text-primary" />} color="bg-primary/10" />
        <StatCard label="Projects" value={stats.projects.total}
          sub={`+${stats.projects.new30Days} this month`}
          icon={<FolderOpen className="w-4 h-4 text-emerald-600" />} color="bg-emerald-500/10" />
        <StatCard label="Total Runs" value={stats.runs.total}
          sub={`${runSuccessRate}% success rate`}
          icon={<Play className="w-4 h-4 text-amber-600" />} color="bg-amber-500/10" />
        <StatCard label="Files" value={stats.files.total}
          sub={`${stats.chats.total} chat messages`}
          icon={<Activity className="w-4 h-4 text-violet-600" />} color="bg-violet-500/10" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" /> Run Outcomes
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span className="text-sm">Successful</span>
              </div>
              <span className="text-sm font-semibold text-emerald-600">{stats.runs.success.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm">Failed</span>
              </div>
              <span className="text-sm font-semibold text-destructive">{stats.runs.error.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Other</span>
              </div>
              <span className="text-sm font-semibold text-muted-foreground">
                {(stats.runs.total - stats.runs.success - stats.runs.error).toLocaleString()}
              </span>
            </div>
            {stats.runs.total > 0 && (
              <div className="pt-2">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${runSuccessRate}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{runSuccessRate}% success rate</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Quick Stats
          </h3>
          <div className="space-y-3">
            {[
              { label: "Avg projects per user", value: stats.users.total ? (stats.projects.total / stats.users.total).toFixed(1) : "0" },
              { label: "Avg files per project", value: stats.projects.total ? (stats.files.total / stats.projects.total).toFixed(1) : "0" },
              { label: "Avg runs per project", value: stats.projects.total ? (stats.runs.total / stats.projects.total).toFixed(1) : "0" },
              { label: "Avg chats per project", value: stats.projects.total ? (stats.chats.total / stats.projects.total).toFixed(1) : "0" },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="text-sm font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await api.get<{ data: { users: AdminUser[]; total: number; pages: number } }>(`/api/admin/users?${params}`);
      setUsers(res.data.users);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [page, debouncedSearch]);

  useEffect(() => { setPage(1); }, [debouncedSearch]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Delete user "${email}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await api.delete(`/api/admin/users/${id}`);
      load();
    } catch { /* ignore */ } finally { setDeleting(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total.toLocaleString()} total users</p>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by email or username…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Username</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Projects</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No users found</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                      {(u.name ?? u.username)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{u.name ?? u.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">@{u.username}</td>
                <td className="px-4 py-3 text-right tabular-nums">{u.projectCount}</td>
                <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(u.createdAt))} ago
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(u.id, u.email)} disabled={!!deleting}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40">
                    {deleting === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= pages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectsTab() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [language, setLanguage] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (language) params.set("language", language);
      const res = await api.get<{ data: { projects: AdminProject[]; total: number; pages: number } }>(`/api/admin/projects?${params}`);
      setProjects(res.data.projects);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [page, debouncedSearch, language]);

  useEffect(() => { setPage(1); }, [debouncedSearch, language]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await api.delete(`/api/admin/projects/${id}`);
      load();
    } catch { /* ignore */ } finally { setDeleting(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground flex-1">{total.toLocaleString()} total projects</p>
        <select value={language} onChange={e => setLanguage(e.target.value)}
          className="h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground">
          <option value="">All languages</option>
          {["nodejs", "python", "typescript", "html"].map(l => (
            <option key={l} value={l}>{LANG_LABELS[l]}</option>
          ))}
        </select>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Project</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Owner</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Language</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Files</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Runs</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : projects.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No projects found</td></tr>
            ) : projects.map(p => (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate max-w-[180px]">{p.name}</p>
                    {p.isPublic && <Badge variant="secondary" className="text-xs shrink-0">Public</Badge>}
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{p.description}</p>}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {p.owner ? `@${p.owner.username}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", LANG_COLORS[p.language] ?? "bg-gray-400")} />
                    <span className="text-xs text-muted-foreground">{LANG_LABELS[p.language] ?? p.language}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{p.fileCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">{p.runCount}</td>
                <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap text-xs">
                  {formatDistanceToNow(new Date(p.createdAt))} ago
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(p.id, p.name)} disabled={!!deleting}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40">
                    {deleting === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= pages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RunsTab() {
  const [runsList, setRunsList] = useState<AdminRun[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: AdminRun[] }>("/api/admin/runs?limit=50");
      setRunsList(res.data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
    success: { color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30", icon: <CheckCircle className="w-3 h-3" /> },
    error: { color: "text-destructive bg-destructive/10", icon: <AlertCircle className="w-3 h-3" /> },
    running: { color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    queued: { color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30", icon: <Clock className="w-3 h-3" /> },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Last 50 runs</p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Project</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Command</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Exit</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Started</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : runsList.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No runs yet</td></tr>
            ) : runsList.map(r => {
              const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.queued;
              return (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{r.projectName}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{r.command || "default"}</code>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full", cfg.color)}>
                      {cfg.icon}{r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {r.exitCode !== null ? r.exitCode : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs whitespace-nowrap">
                    {r.startedAt ? `${formatDistanceToNow(new Date(r.startedAt))} ago` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

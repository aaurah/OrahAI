import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Shield, Users, FolderOpen, Play, BarChart3, Search, Trash2,
  RefreshCw, ChevronLeft, ChevronRight, Activity, Loader2,
  AlertCircle, CheckCircle, Clock, Infinity, Lock, ShieldCheck,
  ShieldOff, Unlock, RotateCcw, X, Bot, Cpu, Cloud, CheckCircle2,
  XCircle, Download, Server, Zap, ExternalLink, StopCircle, Wifi,
  WifiOff, Sparkles, Copy, Laptop, Eye, UploadCloud,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { api, API_BASE } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { OLLAMA_MODEL_LIBRARY } from "@/lib/models";

type Tab = "overview" | "users" | "projects" | "runs" | "ai";

// ── AI tab types ──────────────────────────────────────────────────────────────
type OllamaEndpoint = "server" | "remote";

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  details?: { parameter_size?: string; quantization_level?: string };
}

interface ProviderStatus {
  available: boolean;
  models?: string[];
  version?: string;
  configured?: boolean;
  url?: string | null;
  error?: string;
  statusCode?: number;
}

interface ProvidersData {
  openai: ProviderStatus;
  anthropic: ProviderStatus;
  groq: ProviderStatus;
  ollama: ProviderStatus;
  "ollama-remote": ProviderStatus;
  [key: string]: ProviderStatus;
}

interface PullState {
  model: string;
  endpoint: OllamaEndpoint;
  status: string;
  percent: number;
  done: boolean;
  error: string | null;
}

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

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
  isAdmin: boolean;
  isFreeAccess: boolean;
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
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await api.get<{ data: Stats }>("/api/admin/stats");
      setStats(res.data);
    } catch (e) {
      toast({ title: "Failed to load stats", description: (e as Error).message, variant: "destructive" });
    } finally { setStatsLoading(false); }
  }, []);

  useEffect(() => {
    if (!isLoading && user?.isAdmin) loadStats();
  }, [isLoading, user, loadStats]);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!user || !user.isAdmin) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-destructive" />
            </div>
            <h1 className="text-xl font-bold mb-2">Access denied</h1>
            <p className="text-muted-foreground text-sm mb-6">
              You need admin privileges to view this page.
            </p>
            <Button onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
          </div>
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
    { id: "projects", label: "Projects", icon: <FolderOpen className="w-4 h-4" /> },
    { id: "runs", label: "Runs", icon: <Activity className="w-4 h-4" /> },
    { id: "ai", label: "AI", icon: <Bot className="w-4 h-4" /> },
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
          <div className="ml-auto flex items-center gap-2">
            <ResetDataButton onReset={loadStats} />
            <Button variant="ghost" size="sm" onClick={loadStats} className="gap-2" disabled={statsLoading}>
              <RefreshCw className={cn("w-4 h-4", statsLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
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
        {tab === "users" && <UsersTab currentUserId={user.id} />}
        {tab === "projects" && <ProjectsTab />}
        {tab === "runs" && <RunsTab />}
        {tab === "ai" && <AiTab />}
      </main>
    </div>
  );
}

// ── Reset Data Dialog ─────────────────────────────────────────────────────────

function ResetDataButton({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const [clearRuns, setClearRuns] = useState(true);
  const [clearChats, setClearChats] = useState(true);
  const [clearFiles, setClearFiles] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState("");

  const nothingSelected = !clearRuns && !clearChats && !clearFiles;
  const canReset = confirm === "RESET" && !nothingSelected;

  const handleReset = async () => {
    if (!canReset) return;
    setLoading(true);
    try {
      const res = await api.post<{ data: Record<string, number>; message: string }>(
        "/api/admin/reset", { clearRuns, clearChats, clearFiles }
      );
      const d = res.data ?? {};
      const parts: string[] = [];
      if (d.runs !== undefined) parts.push(`${d.runs} runs`);
      if (d.chatMessages !== undefined) parts.push(`${d.chatMessages} chat messages`);
      if (d.files !== undefined) parts.push(`${d.files} files`);
      alert(`Reset complete. Removed: ${parts.join(", ") || "nothing"}.`);
      setOpen(false);
      setConfirm("");
      onReset();
    } catch (err) {
      alert("Reset failed. See console for details.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
        <RotateCcw className="w-4 h-4" />
        Reset Data
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h2 className="font-bold text-base">Reset Data</h2>
              <p className="text-xs text-muted-foreground">Users &amp; projects are always kept</p>
            </div>
          </div>
          <button onClick={() => { setOpen(false); setConfirm(""); }}
            className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-5">
          Select what to clear. This <strong>cannot be undone</strong>.
          Users, projects, and all their files remain intact unless you choose "Delete files" below.
        </p>

        <div className="space-y-3 mb-6">
          {([
            { label: "Run history", sub: "All run records and output logs", checked: clearRuns, set: setClearRuns, danger: false },
            { label: "Chat messages", sub: "All AI conversation history", checked: clearChats, set: setClearChats, danger: false },
            { label: "Delete files", sub: "Soft-delete all project files (dangerous)", checked: clearFiles, set: setClearFiles, danger: true },
          ] as { label: string; sub: string; checked: boolean; set: (v: boolean) => void; danger: boolean }[]).map(({ label, sub, checked, set, danger }) => (
            <label key={label}
              className={cn(
                "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                checked
                  ? danger ? "border-destructive/40 bg-destructive/5" : "border-primary/40 bg-primary/5"
                  : "border-border hover:bg-muted/50"
              )}>
              <input type="checkbox" checked={checked} onChange={e => set(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-primary" />
              <div>
                <p className={cn("text-sm font-medium", danger && checked && "text-destructive")}>{label}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="mb-5">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Type <span className="font-mono font-bold text-foreground">RESET</span> to confirm
          </label>
          <input
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="RESET"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-destructive/50 focus:border-destructive"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => { setOpen(false); setConfirm(""); }}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
            disabled={!canReset || loading || nothingSelected}
            onClick={handleReset}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Reset Now
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, color }: {
  label: string; value: number | string; sub?: string; icon: React.ReactNode; color: string;
}) {
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

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

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
    } catch (e) {
      toast({ title: "Failed to load users", description: (e as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [page, debouncedSearch]);

  useEffect(() => { setPage(1); }, [debouncedSearch]);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string, endpoint: string) => {
    setActing(id + endpoint);
    try {
      await api.post(`/api/admin/users/${id}/${endpoint}`, {});
      setUsers(prev => prev.map(u => {
        if (u.id !== id) return u;
        if (endpoint === "grant-free") return { ...u, isFreeAccess: true };
        if (endpoint === "revoke-free") return { ...u, isFreeAccess: false };
        if (endpoint === "grant-admin") return { ...u, isAdmin: true };
        if (endpoint === "revoke-admin") return { ...u, isAdmin: false };
        return u;
      }));
    } catch (e) {
      toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
    } finally { setActing(null); }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Delete user "${email}"? This cannot be undone.`)) return;
    setActing(id + "delete");
    try {
      await api.delete(`/api/admin/users/${id}`);
      load();
    } catch (e) {
      toast({ title: "Failed to delete user", description: (e as Error).message, variant: "destructive" });
    } finally { setActing(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">{total.toLocaleString()} total users</p>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by email or username…" value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Access</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Projects</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Joined</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
              </td></tr>
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

                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {u.isFreeAccess ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <Infinity className="w-3 h-3" /> Unlimited
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                        Free plan
                      </span>
                    )}
                    {u.isAdmin && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                        <Shield className="w-3 h-3" /> Admin
                      </span>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3 text-right tabular-nums">{u.projectCount}</td>

                <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap text-xs">
                  {formatDistanceToNow(new Date(u.createdAt))} ago
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {u.isFreeAccess ? (
                      <button
                        onClick={() => act(u.id, "revoke-free")}
                        disabled={!!acting}
                        title="Revoke unlimited access"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors disabled:opacity-40"
                      >
                        {acting === u.id + "revoke-free"
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Lock className="w-3.5 h-3.5" />}
                        Revoke unlimited
                      </button>
                    ) : (
                      <button
                        onClick={() => act(u.id, "grant-free")}
                        disabled={!!acting}
                        title="Grant unlimited access"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 border border-border text-foreground transition-colors disabled:opacity-40"
                      >
                        {acting === u.id + "grant-free"
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Unlock className="w-3.5 h-3.5" />}
                        Grant unlimited
                      </button>
                    )}

                    {u.id !== currentUserId && (
                      u.isAdmin ? (
                        <button
                          onClick={() => act(u.id, "revoke-admin")}
                          disabled={!!acting}
                          title="Revoke admin"
                          className="p-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                        >
                          {acting === u.id + "revoke-admin"
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <ShieldOff className="w-4 h-4" />}
                        </button>
                      ) : (
                        <button
                          onClick={() => act(u.id, "grant-admin")}
                          disabled={!!acting}
                          title="Grant admin"
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                        >
                          {acting === u.id + "grant-admin"
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <ShieldCheck className="w-4 h-4" />}
                        </button>
                      )
                    )}

                    <button
                      onClick={() => handleDelete(u.id, u.email)}
                      disabled={!!acting || u.id === currentUserId}
                      title="Delete user"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                    >
                      {acting === u.id + "delete"
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
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
    } catch (e) {
      toast({ title: "Failed to load projects", description: (e as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [page, debouncedSearch, language]);

  useEffect(() => { setPage(1); }, [debouncedSearch, language]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await api.delete(`/api/admin/projects/${id}`);
      load();
    } catch (e) {
      toast({ title: "Failed to delete project", description: (e as Error).message, variant: "destructive" });
    } finally { setDeleting(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
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
          <Input placeholder="Search projects…" value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
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
              <tr><td colSpan={7} className="text-center py-12">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
              </td></tr>
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

// ── AI Tab ────────────────────────────────────────────────────────────────────

const AI_LIB_FILTERS = ["all", "general", "code", "vision", "fast", "powerful", "embed"];

function AiProviderCard({ name, icon, available, version, models, note, unavailableLabel }: {
  name: string; icon: React.ReactNode; available: boolean;
  version?: string; models?: string[]; note?: string; unavailableLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn(
      "rounded-xl border p-4 transition-colors",
      available ? "border-green-500/20 bg-green-500/5" : "border-border bg-card",
    )}>
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", available ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground")}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{name}</span>
            {version && <span className="text-[10px] text-muted-foreground">v{version}</span>}
          </div>
          {note && <p className="text-xs text-muted-foreground mt-0.5 truncate">{note}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {available ? (
            <div className="flex items-center gap-1 text-green-400 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Ready
            </div>
          ) : (
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <XCircle className="w-3.5 h-3.5" /> {unavailableLabel ?? "Not configured"}
            </div>
          )}
          {models && models.length > 0 && (
            <button onClick={() => setExpanded(v => !v)}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
              {expanded
                ? <ChevronLeft className="w-3.5 h-3.5 rotate-90" />
                : <ChevronLeft className="w-3.5 h-3.5 -rotate-90" />}
            </button>
          )}
        </div>
      </div>
      {expanded && models && models.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap gap-1.5">
          {models.map(m => (
            <span key={m} className="text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border/40 text-muted-foreground font-mono">{m}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function AiInstalledRow({ model, onDelete, onUpdate, deleting, updating }: {
  model: OllamaModel;
  onDelete: (name: string) => void;
  onUpdate: (name: string) => void;
  deleting: boolean;
  updating: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-medium truncate">{model.name}</span>
          {model.details?.parameter_size && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-medium shrink-0">
              {model.details.parameter_size}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{fmtBytes(model.size)}</span>
          {model.details?.quantization_level && (
            <span className="text-xs text-muted-foreground">{model.details.quantization_level}</span>
          )}
          <span className="text-xs text-muted-foreground">
            updated {formatDistanceToNow(new Date(model.modified_at))} ago
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onUpdate(model.name)} disabled={updating || deleting}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors disabled:opacity-50"
          title="Re-pull latest version">
          {updating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <UploadCloud className="w-3 h-3" />}
          Update
        </button>
        <button onClick={() => onDelete(model.name)} disabled={deleting || updating}
          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
          title="Remove model">
          {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function AiLibraryCard({ model, serverInstalled, remoteInstalled, pullingServer, pullingRemote, serverAvailable, remoteAvailable, remoteConfigured, onPull }: {
  model: typeof OLLAMA_MODEL_LIBRARY[0];
  serverInstalled: boolean;
  remoteInstalled: boolean;
  pullingServer: boolean;
  pullingRemote: boolean;
  serverAvailable: boolean;
  remoteAvailable: boolean;
  remoteConfigured: boolean;
  onPull: (id: string, endpoint: OllamaEndpoint) => void;
}) {
  const [showLocal, setShowLocal] = useState(false);
  const [copied, setCopied] = useState(false);
  const localCmd = `ollama pull ${model.id}`;
  function copyCmd() {
    void navigator.clipboard.writeText(localCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className={cn(
      "rounded-xl border p-4 flex flex-col gap-2",
      (serverInstalled || remoteInstalled) ? "border-green-500/20 bg-green-500/5" : "border-border bg-card",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold">{model.name}</span>
            {model.badge && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                {model.badge}
              </span>
            )}
            {model.vision && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium flex items-center gap-0.5">
                <Eye className="w-2.5 h-2.5" /> Vision
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
        </div>
        <span className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5">{model.size}</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {serverInstalled ? (
          <div className="flex items-center gap-1 text-green-400 text-xs font-medium">
            <CheckCircle2 className="w-3 h-3" /> Server
          </div>
        ) : serverAvailable ? (
          <button onClick={() => onPull(model.id, "server")} disabled={pullingServer}
            className={cn(
              "flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1 transition-colors",
              pullingServer ? "bg-muted text-muted-foreground cursor-wait" : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20",
            )}>
            {pullingServer ? <><RefreshCw className="w-3 h-3 animate-spin" /> Server…</> : <><Server className="w-3 h-3" /> Server</>}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <WifiOff className="w-3 h-3" /> Server offline
          </span>
        )}

        {remoteConfigured && (
          remoteInstalled ? (
            <div className="flex items-center gap-1 text-sky-400 text-xs font-medium">
              <CheckCircle2 className="w-3 h-3" /> Remote
            </div>
          ) : remoteAvailable ? (
            <button onClick={() => onPull(model.id, "remote")} disabled={pullingRemote}
              className={cn(
                "flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1 transition-colors",
                pullingRemote ? "bg-muted text-muted-foreground cursor-wait" : "bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20",
              )}>
              {pullingRemote ? <><RefreshCw className="w-3 h-3 animate-spin" /> Remote…</> : <><Wifi className="w-3 h-3" /> Remote</>}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <WifiOff className="w-3 h-3" /> Remote offline
            </span>
          )
        )}

        <button onClick={() => setShowLocal(v => !v)}
          className="flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors">
          <Laptop className="w-3 h-3" /> Local
        </button>
      </div>

      {showLocal && (
        <div className="rounded-lg bg-muted/50 border border-amber-500/20 p-2.5 space-y-1.5 text-xs">
          <p className="text-muted-foreground">Run on <strong className="text-foreground">your machine</strong> (requires{" "}
            <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Ollama</a>):
          </p>
          <div className="flex items-center gap-1.5 bg-background rounded px-2 py-1.5 border border-border/40">
            <code className="font-mono flex-1 text-foreground text-[11px]">{localCmd}</code>
            <button onClick={copyCmd} className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              {copied ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface RemoteTestResult {
  ok: boolean;
  stage?: string;
  error?: string;
  hint?: string;
  steps?: Array<{ step: string; ok: boolean; detail?: string }>;
  version?: string;
  models?: string[];
}

function AiTab() {
  const [providers, setProviders] = useState<ProvidersData | null>(null);
  const [serverModels, setServerModels] = useState<OllamaModel[]>([]);
  const [remoteModels, setRemoteModels] = useState<OllamaModel[]>([]);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pulls, setPulls] = useState<Record<string, PullState>>({});
  const [customModel, setCustomModel] = useState("");
  const [libFilter, setLibFilter] = useState("all");
  const [installedEndpoint, setInstalledEndpoint] = useState<OllamaEndpoint>("server");
  const [remoteTest, setRemoteTest] = useState<RemoteTestResult | null>(null);
  const [remoteTestLoading, setRemoteTestLoading] = useState(false);
  const abortRefs = useRef<Record<string, AbortController>>({});

  const remoteConfigured = !!(providers?.["ollama-remote"]?.url);

  const runRemoteTest = useCallback(async () => {
    setRemoteTestLoading(true);
    setRemoteTest(null);
    try {
      const result = await api.get<RemoteTestResult>("/api/ai/remote-test");
      setRemoteTest(result);
      if (result.ok) {
        toast({ title: "Remote Ollama connected!", description: `v${result.version ?? "?"} · ${result.models?.length ?? 0} model(s)` });
        void refresh();
      }
    } catch (e) {
      setRemoteTest({ ok: false, hint: (e as Error).message });
    } finally {
      setRemoteTestLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [provRes, serverRes, remoteRes] = await Promise.all([
        api.get<{ providers: ProvidersData }>("/api/ai/providers"),
        api.get<{ models: OllamaModel[]; ollamaAvailable: boolean }>("/api/ai/models?endpoint=server"),
        api.get<{ models: OllamaModel[]; ollamaAvailable: boolean }>("/api/ai/models?endpoint=remote"),
      ]);
      setProviders(provRes.providers);
      setServerModels(serverRes.models ?? []);
      setServerAvailable(serverRes.ollamaAvailable);
      setRemoteModels(remoteRes.models ?? []);
      setRemoteAvailable(remoteRes.ollamaAvailable);
    } catch (e) {
      toast({ title: "Failed to load AI providers", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const serverNames = new Set(serverModels.map(m => m.name));
  const remoteNames = new Set(remoteModels.map(m => m.name));

  async function startPull(modelId: string, endpoint: OllamaEndpoint) {
    const key = `${endpoint}:${modelId}`;
    const token = localStorage.getItem("orahai_token");
    const abortCtrl = new AbortController();
    abortRefs.current[key] = abortCtrl;

    setPulls(prev => ({
      ...prev,
      [key]: { model: modelId, endpoint, status: "Initializing…", percent: 0, done: false, error: null },
    }));

    try {
      const res = await fetch(`${API_BASE || ""}/api/ai/models/pull`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ model: modelId, endpoint }),
        signal: abortCtrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = dec.decode(value, { stream: true })
          .split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim());
        for (const line of lines) {
          try {
            const evt = JSON.parse(line) as { type: string; status?: string; completed?: number; total?: number; error?: string };
            if (evt.type === "error") {
              setPulls(prev => ({ ...prev, [key]: { ...prev[key], error: evt.error ?? "Pull failed", done: true } }));
              break;
            }
            if (evt.type === "done") {
              setPulls(prev => ({ ...prev, [key]: { ...prev[key], status: "Complete", percent: 100, done: true, error: null } }));
              await refresh();
              break;
            }
            if (evt.type === "progress") {
              const pct = evt.total && evt.total > 0 ? Math.round((evt.completed ?? 0) / evt.total * 100) : 0;
              setPulls(prev => ({ ...prev, [key]: { ...prev[key], status: evt.status ?? "Downloading…", percent: pct, done: false, error: null } }));
            }
          } catch { /* skip bad JSON */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        setPulls(prev => ({ ...prev, [key]: { ...prev[key], error: (e as Error).message, done: true } }));
      } else {
        setPulls(prev => { const n = { ...prev }; delete n[key]; return n; });
      }
    }
  }

  function cancelPull(key: string) {
    abortRefs.current[key]?.abort();
    setPulls(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  async function handleDelete(name: string, endpoint: OllamaEndpoint) {
    const key = `${endpoint}:${name}`;
    setDeleting(key);
    try {
      await api.delete(`/api/ai/models?name=${encodeURIComponent(name)}&endpoint=${endpoint}`);
      toast({ title: `Removed ${name} from ${endpoint}` });
      await refresh();
    } catch (e) {
      toast({ title: `Failed to remove model`, description: (e as Error).message, variant: "destructive" });
    } finally { setDeleting(null); }
  }

  function handleUpdate(name: string, endpoint: OllamaEndpoint) {
    void startPull(name, endpoint);
  }

  function handleCustomPull(endpoint: OllamaEndpoint) {
    const m = customModel.trim();
    if (!m) return;
    void startPull(m, endpoint);
    setCustomModel("");
  }

  const activePulls = Object.entries(pulls).filter(([, p]) => !p.done || p.error);
  const filteredLib = OLLAMA_MODEL_LIBRARY.filter(m => libFilter === "all" || m.tags?.includes(libFilter));
  const displayedModels = installedEndpoint === "server" ? serverModels : remoteModels;
  const endpointAvailable = installedEndpoint === "server" ? serverAvailable : remoteAvailable;

  return (
    <div className="space-y-8">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" /> AI Management
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage all AI providers, pull models to server or remote, and keep them up to date
          </p>
        </div>
        <button onClick={refresh} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Provider status grid */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Provider Status</h3>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">
            {[0,1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-muted" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AiProviderCard name="Ollama — Server" icon={<Server className="w-4 h-4" />}
              available={serverAvailable} version={providers?.ollama?.version}
              note={serverAvailable
                ? `${serverModels.length} model${serverModels.length !== 1 ? "s" : ""} installed`
                : "Not running on this server"}
              models={providers?.ollama?.models} />
            {/* ── Ollama Remote card — with diagnostics ── */}
            <div className={cn(
              "rounded-xl border p-4 transition-colors",
              remoteAvailable ? "border-green-500/20 bg-green-500/5" : "border-border bg-card",
            )}>
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg shrink-0", remoteAvailable ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground")}>
                  <Wifi className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Ollama — Remote</span>
                    {providers?.["ollama-remote"]?.version && (
                      <span className="text-[10px] text-muted-foreground">v{providers["ollama-remote"].version}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {!remoteConfigured
                      ? "Set OLLAMA_REMOTE_URL secret to connect"
                      : remoteAvailable
                        ? `${remoteModels.length} model${remoteModels.length !== 1 ? "s" : ""} available`
                        : (providers?.["ollama-remote"]?.error ?? "URL set but remote didn't respond")}
                  </p>
                </div>
                <div className="shrink-0">
                  {remoteAvailable ? (
                    <div className="flex items-center gap-1 text-green-400 text-xs font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-muted-foreground text-xs">
                      <XCircle className="w-3.5 h-3.5" /> {remoteConfigured ? "Unreachable" : "Not configured"}
                    </div>
                  )}
                </div>
              </div>

              {/* Test button — always visible if configured */}
              {remoteConfigured && (
                <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                  <button
                    onClick={runRemoteTest}
                    disabled={remoteTestLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {remoteTestLoading
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Testing…</>
                      : <><Activity className="w-3.5 h-3.5" />Test connection</>}
                  </button>

                  {/* Diagnostic result */}
                  {remoteTest && (
                    <div className={cn(
                      "rounded-lg border p-3 text-xs space-y-2",
                      remoteTest.ok ? "border-green-500/30 bg-green-500/5" : "border-destructive/30 bg-destructive/5",
                    )}>
                      {/* Step trace */}
                      {remoteTest.steps && remoteTest.steps.length > 0 && (
                        <div className="space-y-1">
                          {remoteTest.steps.map(s => (
                            <div key={s.step} className="flex items-center gap-2">
                              {s.ok
                                ? <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                                : <XCircle className="w-3 h-3 text-destructive shrink-0" />}
                              <span className="text-muted-foreground font-mono">{s.step}</span>
                              {s.detail && <span className="text-muted-foreground/70 truncate">{s.detail}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Hint / fix suggestion */}
                      {remoteTest.hint && (
                        <p className={cn("leading-snug", remoteTest.ok ? "text-green-400" : "text-destructive")}>
                          {remoteTest.hint}
                        </p>
                      )}
                      {remoteTest.ok && !remoteTest.hint && (
                        <p className="text-green-400">Connected successfully — reload to refresh model list.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <AiProviderCard name="Groq — Free Cloud" icon={<Sparkles className="w-4 h-4" />}
              available={providers?.groq?.available ?? false}
              note={providers?.groq?.available
                ? `${(providers.groq.models ?? []).length} models — Llama 4, Qwen 3, Compound`
                : "Free — set GROQ_API_KEY secret"}
              models={providers?.groq?.models} />
            <AiProviderCard name="OpenAI — GPT" icon={<Cloud className="w-4 h-4" />}
              available={providers?.openai?.available ?? false}
              note={providers?.openai?.available ? "gpt-4.1, gpt-4o, o3-mini" : "Set OPENAI_API_KEY secret"}
              models={providers?.openai?.models} />
            <AiProviderCard name="Anthropic — Claude" icon={<Zap className="w-4 h-4" />}
              available={providers?.anthropic?.available ?? false}
              note={providers?.anthropic?.available ? "Claude Opus, Sonnet, Haiku" : "Set ANTHROPIC_API_KEY secret"}
              models={providers?.anthropic?.models} />
            <AiProviderCard name="Google — Gemini" icon={<Cpu className="w-4 h-4" />}
              available={providers?.gemini?.available ?? false}
              note={providers?.gemini?.available ? "Gemini 2.5 Pro, Flash, 2.0 Flash" : "Set GOOGLE_API_KEY secret (aistudio.google.com)"}
              models={providers?.gemini?.models} />
            <AiProviderCard name="xAI — Grok" icon={<Bot className="w-4 h-4" />}
              available={providers?.xai?.available ?? false}
              note={providers?.xai?.available ? "Grok 3, Grok 3 Mini, Grok 2" : "Set XAI_API_KEY secret (console.x.ai)"}
              models={providers?.xai?.models} />
            <AiProviderCard name="Perplexity — Sonar" icon={<Wifi className="w-4 h-4" />}
              available={providers?.perplexity?.available ?? false}
              note={providers?.perplexity?.available ? "Sonar Pro, Sonar Reasoning — live web search" : "Set PERPLEXITY_API_KEY secret (perplexity.ai/api)"}
              models={providers?.perplexity?.models} />
            <AiProviderCard name="DeepSeek" icon={<Sparkles className="w-4 h-4" />}
              available={providers?.deepseek?.available ?? false}
              note={providers?.deepseek?.available ? "DeepSeek V3 (code) + R1 (reasoning)" : "Set DEEPSEEK_API_KEY secret (platform.deepseek.com)"}
              models={providers?.deepseek?.models} />
          </div>
        )}
      </section>

      {/* Active pulls */}
      {activePulls.length > 0 && (
        <section className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center gap-2">
            <Download className="w-4 h-4 text-primary animate-bounce" />
            <h3 className="text-sm font-semibold">Downloading</h3>
          </div>
          <div className="divide-y divide-border">
            {activePulls.map(([key, p]) => (
              <div key={key} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-medium">{p.model}</span>
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded-full border font-medium",
                      p.endpoint === "remote"
                        ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                        : "bg-primary/10 text-primary border-primary/20",
                    )}>
                      {p.endpoint === "remote" ? "Remote" : "Server"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{p.status}</span>
                    {!p.done && (
                      <button onClick={() => cancelPull(key)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                        title="Cancel">
                        <StopCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {p.error ? (
                  <div className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="w-3.5 h-3.5" /> {p.error}
                  </div>
                ) : (
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-300", p.done ? "bg-green-500" : "bg-primary")}
                      style={{ width: `${p.percent}%` }} />
                  </div>
                )}
                {p.percent > 0 && !p.error && (
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">{p.percent}%</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Installed models */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Installed Models</h3>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {(["server", "remote"] as OllamaEndpoint[]).map(ep => (
              <button key={ep} onClick={() => setInstalledEndpoint(ep)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize",
                  installedEndpoint === ep ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}>
                {ep === "server" ? <Server className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
                {ep}
              </button>
            ))}
          </div>
        </div>

        {!endpointAvailable ? (
          <div className="rounded-xl border bg-card p-6 text-center">
            {installedEndpoint === "server" ? (
              <p className="text-sm text-muted-foreground">Ollama server is not running on this machine.</p>
            ) : (
              <div className="space-y-1">
                <WifiOff className="w-6 h-6 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {remoteConfigured ? "Remote Ollama is unreachable — check the tunnel is running." : "No remote configured — set OLLAMA_REMOTE_URL in Secrets."}
                </p>
              </div>
            )}
          </div>
        ) : displayedModels.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            No models installed yet — pull one from the library below.
          </div>
        ) : (
          <div className="rounded-xl border bg-card divide-y divide-border overflow-hidden">
            {displayedModels.map(m => {
              const key = `${installedEndpoint}:${m.name}`;
              return (
                <AiInstalledRow key={m.name} model={m}
                  onDelete={name => handleDelete(name, installedEndpoint)}
                  onUpdate={name => handleUpdate(name, installedEndpoint)}
                  deleting={deleting === key}
                  updating={!!pulls[key] && !pulls[key].done} />
              );
            })}
          </div>
        )}
      </section>

      {/* Custom model pull */}
      <section className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" />
          Pull any model
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Enter any model name from{" "}
          <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-0.5">
            ollama.com/library <ExternalLink className="w-2.5 h-2.5" />
          </a>{" "}
          and pull it to the server or your remote machine.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            className="flex-1 min-w-[200px] rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="e.g. llama3.2:3b or qwen2.5-coder:7b"
            value={customModel}
            onChange={e => setCustomModel(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleCustomPull("server"); }}
          />
          <button
            onClick={() => handleCustomPull("server")}
            disabled={!customModel.trim() || !serverAvailable}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Server className="w-3.5 h-3.5" /> Pull to Server
          </button>
          {remoteConfigured && (
            <button
              onClick={() => handleCustomPull("remote")}
              disabled={!customModel.trim() || !remoteAvailable}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <Wifi className="w-3.5 h-3.5" /> Pull to Remote
            </button>
          )}
        </div>
        {!serverAvailable && (
          <p className="text-xs text-amber-400/80 mt-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Ollama server is offline — start it to pull models
          </p>
        )}
      </section>

      {/* Model library */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Model Library</h3>
          <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1">
            Browse all <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400/90 flex gap-2 items-start">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            <strong className="text-amber-300">Server disk is limited.</strong>{" "}
            Each card has three options: <strong className="text-foreground">Server</strong> (Replit, limited space) ·{" "}
            <strong className="text-foreground">Remote</strong> (your connected machine) ·{" "}
            <strong className="text-foreground">Local</strong> (copy command to run on your own computer).
          </span>
        </div>

        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {AI_LIB_FILTERS.map(tag => (
            <button key={tag} onClick={() => setLibFilter(tag)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors capitalize",
                libFilter === tag ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground border border-border/40",
              )}>
              {tag}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredLib.map(m => (
            <AiLibraryCard key={m.id} model={m}
              serverInstalled={serverNames.has(m.id) || serverNames.has(m.id.split(":")[0])}
              remoteInstalled={remoteNames.has(m.id) || remoteNames.has(m.id.split(":")[0])}
              pullingServer={!!pulls[`server:${m.id}`] && !pulls[`server:${m.id}`].done}
              pullingRemote={!!pulls[`remote:${m.id}`] && !pulls[`remote:${m.id}`].done}
              serverAvailable={serverAvailable}
              remoteAvailable={remoteAvailable}
              remoteConfigured={remoteConfigured}
              onPull={startPull} />
          ))}
        </div>
        {filteredLib.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">No models matching this filter.</div>
        )}
      </section>

      {/* Footer note */}
      <section className="rounded-xl border border-border/40 bg-muted/30 p-4">
        <div className="flex gap-3">
          <Cpu className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong className="text-foreground">Server models</strong> run on this Replit instance (CPU, limited disk). Good for 1B–3B models.</p>
            <p><strong className="text-foreground">Remote models</strong> run on your own machine or GPU server — no quota limits, faster for large models.</p>
            <p><strong className="text-foreground">Cloud APIs</strong> (Groq, OpenAI, Anthropic) require their respective API key secrets to be set.</p>
            <p>All providers and installed models appear in the <strong className="text-foreground">AI chat panel</strong> model picker for every user.</p>
          </div>
        </div>
      </section>

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
    } catch (e) {
      toast({ title: "Failed to load runs", description: (e as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
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

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Project</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Command</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Exit</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">When</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
              </td></tr>
            ) : runsList.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No runs yet</td></tr>
            ) : runsList.map(r => {
              const sc = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.queued;
              return (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium max-w-[140px] truncate">{r.projectName}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono max-w-[180px] block truncate">{r.command}</code>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", sc.color)}>
                      {sc.icon}{r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
                    {r.exitCode ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap text-xs">
                    {formatDistanceToNow(new Date(r.createdAt))} ago
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

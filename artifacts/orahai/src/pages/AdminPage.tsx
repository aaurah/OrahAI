import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Shield, Users, FolderOpen, Play, BarChart3, Search, Trash2,
  RefreshCw, ChevronLeft, ChevronRight, Activity, Loader2,
  AlertCircle, CheckCircle, Clock, Infinity, Lock, ShieldCheck,
  ShieldOff, Unlock, RotateCcw, X,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

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

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Github, GitBranch, RefreshCw, Upload, Unlink, Link2,
  Loader2, CheckCircle2, Key, ExternalLink, X, Plus, Lock, Globe,
  ChevronDown, ChevronUp, GitCommitHorizontal, Tag, Zap,
  Code2, MonitorPlay, GitPullRequest, AlertCircle, BookMarked,
  CheckCheck, XCircle, Clock, GitFork, Star, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { api, API_BASE } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type {
  ApiResponse, GitHubProjectStatus, GitHubSyncResult, GitHubPushResult,
  GitHubCommitItem, GitHubBranchItem, GitHubReleaseItem, GitHubActionRun, GitHubGistResult,
} from "@/types";

interface Props {
  projectId: string;
  projectName?: string;
  onSynced?: () => void;
}

type ConnectedTab = "sync" | "branches" | "releases" | "actions" | "gist";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 100) || "my-project";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function RunBadge({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status === "in_progress" || status === "queued") {
    return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400"><Loader2 className="w-2.5 h-2.5 animate-spin" />{status === "queued" ? "Queued" : "Running"}</span>;
  }
  if (conclusion === "success") return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400"><CheckCheck className="w-2.5 h-2.5" />Passed</span>;
  if (conclusion === "failure") return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400"><XCircle className="w-2.5 h-2.5" />Failed</span>;
  if (conclusion === "cancelled") return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground"><X className="w-2.5 h-2.5" />Cancelled</span>;
  return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground"><Clock className="w-2.5 h-2.5" />{conclusion ?? status}</span>;
}

export function GitHubPanel({ projectId, projectName, onSynced }: Props) {
  const [status, setStatus] = useState<GitHubProjectStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [oauthConfigured, setOauthConfigured] = useState(false);

  // Auth state
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);

  // Not-connected: tab between "new repo" and "connect existing"
  const [activeConnectTab, setActiveConnectTab] = useState<"new" | "connect">("new");
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [connectUrl, setConnectUrl] = useState("");
  const [connectBranch, setConnectBranch] = useState("main");
  const [isConnecting, setIsConnecting] = useState(false);

  // Connected: tab
  const [connectedTab, setConnectedTab] = useState<ConnectedTab>("sync");

  // Sync tab
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [commitMsg, setCommitMsg] = useState("Update from OrahAI");
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);
  const [commits, setCommits] = useState<GitHubCommitItem[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);

  // Branches tab
  const [branches, setBranches] = useState<GitHubBranchItem[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchFrom, setNewBranchFrom] = useState("");
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [showBranchForm, setShowBranchForm] = useState(false);

  // Releases tab
  const [releases, setReleases] = useState<GitHubReleaseItem[]>([]);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [releaseTag, setReleaseTag] = useState("");
  const [releaseName, setReleaseName] = useState("");
  const [releaseBody, setReleaseBody] = useState("");
  const [releaseDraft, setReleaseDraft] = useState(false);
  const [releasePrerelease, setReleasePrerelease] = useState(false);
  const [isReleaseing, setIsReleaseing] = useState(false);

  // Actions tab
  const [runs, setRuns] = useState<GitHubActionRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  // Gist tab
  const [gistDesc, setGistDesc] = useState("");
  const [gistPublic, setGistPublic] = useState(true);
  const [isGisting, setIsGisting] = useState(false);
  const [lastGist, setLastGist] = useState<GitHubGistResult | null>(null);

  const popupRef = useRef<Window | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<GitHubProjectStatus>>(`/api/github/projects/${projectId}`);
      setStatus(res.data);
    } catch { } finally { setIsLoading(false); }
  }, [projectId]);

  useEffect(() => {
    refresh();
    api.get<ApiResponse<{ configured: boolean }>>("/api/github/oauth/configured")
      .then(r => setOauthConfigured(r.data.configured))
      .catch(() => setOauthConfigured(false));
  }, [projectId]);

  useEffect(() => {
    if (projectName && !newRepoName) setNewRepoName(slugify(projectName));
  }, [projectName]);

  // Load tab data when switching tabs
  useEffect(() => {
    if (!status?.githubRepo) return;
    if (connectedTab === "sync" && commits.length === 0) fetchCommits();
    if (connectedTab === "branches" && branches.length === 0) fetchBranches();
    if (connectedTab === "releases" && releases.length === 0) fetchReleases();
    if (connectedTab === "actions" && runs.length === 0) fetchRuns();
  }, [connectedTab, status?.githubRepo]);

  // OAuth popup
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== "github-oauth") return;
      setIsOAuthLoading(false);
      if (e.data.status === "success") {
        toast({ title: `Connected as @${e.data.detail}` });
        refresh();
      } else {
        toast({ title: e.data.detail ?? "GitHub authorization failed", variant: "destructive" });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const fetchCommits = async () => {
    setCommitsLoading(true);
    try {
      const res = await api.get<ApiResponse<GitHubCommitItem[]>>(`/api/github/projects/${projectId}/commits?limit=10`);
      setCommits(res.data);
    } catch { } finally { setCommitsLoading(false); }
  };

  const fetchBranches = async () => {
    setBranchesLoading(true);
    try {
      const res = await api.get<ApiResponse<GitHubBranchItem[]>>(`/api/github/projects/${projectId}/branches`);
      setBranches(res.data);
    } catch { } finally { setBranchesLoading(false); }
  };

  const fetchReleases = async () => {
    setReleasesLoading(true);
    try {
      const res = await api.get<ApiResponse<GitHubReleaseItem[]>>(`/api/github/projects/${projectId}/releases`);
      setReleases(res.data);
    } catch { } finally { setReleasesLoading(false); }
  };

  const fetchRuns = async () => {
    setRunsLoading(true);
    try {
      const res = await api.get<ApiResponse<GitHubActionRun[]>>(`/api/github/projects/${projectId}/actions`);
      setRuns(res.data);
    } catch { } finally { setRunsLoading(false); }
  };

  // ── Auth handlers ──────────────────────────────────────────────────────────

  const handleOAuth = () => {
    const token = localStorage.getItem("orahai_token") ?? "";
    if (!token) { toast({ title: "Please log in first", variant: "destructive" }); return; }
    const base = API_BASE || "";
    const url = `${base}/api/github/oauth/start?token=${encodeURIComponent(token)}`;
    const popup = window.open(url, "github-oauth", "width=600,height=700,scrollbars=yes,resizable=yes");
    if (!popup || popup.closed) { toast({ title: "Pop-up blocked — please allow pop-ups for this site", variant: "destructive" }); return; }
    popupRef.current = popup;
    setIsOAuthLoading(true);
    const poll = setInterval(() => { if (popup.closed) { clearInterval(poll); setIsOAuthLoading(false); } }, 500);
  };

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return;
    setIsSavingToken(true);
    try {
      const res = await api.post<ApiResponse<{ login: string }>>("/api/github/token", { token: tokenInput.trim() });
      toast({ title: `Connected as @${res.data.login}` });
      setTokenInput(""); setShowTokenForm(false);
      await refresh();
    } catch (err: unknown) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setIsSavingToken(false); }
  };

  const handleDisconnectToken = async () => {
    try {
      await api.delete<ApiResponse<null>>("/api/github/token");
      toast({ title: "GitHub disconnected" });
      await refresh();
    } catch { toast({ title: "Failed to disconnect", variant: "destructive" }); }
  };

  // ── Repo connection handlers ───────────────────────────────────────────────

  const handleCreateAndPush = async () => {
    const name = newRepoName.trim();
    if (!name) { toast({ title: "Enter a repository name", variant: "destructive" }); return; }
    setIsCreating(true);
    try {
      const res = await api.post<ApiResponse<{ repoUrl: string; pushed: number }>>(
        `/api/github/projects/${projectId}/create-and-push`,
        { repoName: name, private: newRepoPrivate, description: newRepoDesc.trim() },
      );
      toast({ title: "Pushed to GitHub", description: res.message ?? `${res.data.pushed} files pushed to ${name}` });
      onSynced?.(); await refresh();
    } catch (err: unknown) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setIsCreating(false); }
  };

  const handleConnect = async () => {
    if (!connectUrl.trim()) return;
    setIsConnecting(true);
    try {
      await api.patch<ApiResponse<unknown>>(`/api/github/projects/${projectId}/connect`, {
        repoUrl: connectUrl.trim(), branch: connectBranch.trim() || "main",
      });
      toast({ title: "Repository connected" });
      setConnectUrl(""); await refresh();
    } catch (err: unknown) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setIsConnecting(false); }
  };

  const handleDisconnectRepo = async () => {
    try {
      await api.patch<ApiResponse<unknown>>(`/api/github/projects/${projectId}/connect`, { repoUrl: null });
      toast({ title: "Disconnected from GitHub" });
      setLastSyncResult(null); setCommits([]); setBranches([]); setReleases([]); setRuns([]);
      await refresh();
    } catch (err: unknown) { toast({ title: (err as Error).message, variant: "destructive" }); }
  };

  // ── Sync handlers ──────────────────────────────────────────────────────────

  const handlePull = async () => {
    setIsPulling(true); setLastSyncResult(null);
    try {
      const res = await api.post<ApiResponse<GitHubSyncResult>>(`/api/github/projects/${projectId}/pull`);
      const msg = res.message ?? `${res.data.created} new, ${res.data.updated} updated`;
      setLastSyncResult(msg);
      toast({ title: "Pulled from GitHub", description: msg });
      onSynced?.(); await refresh(); await fetchCommits();
    } catch (err: unknown) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setIsPulling(false); }
  };

  const handlePush = async () => {
    setIsPushing(true); setLastSyncResult(null);
    try {
      const res = await api.post<ApiResponse<GitHubPushResult>>(`/api/github/projects/${projectId}/push`, { message: commitMsg });
      const msg = res.message ?? `${res.data.pushed} files pushed`;
      setLastSyncResult(msg);
      toast({ title: "Pushed to GitHub", description: msg });
      await refresh(); await fetchCommits();
    } catch (err: unknown) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setIsPushing(false); }
  };

  // ── Branch handlers ────────────────────────────────────────────────────────

  const handleCreateBranch = async () => {
    const name = newBranchName.trim();
    if (!name) { toast({ title: "Enter a branch name", variant: "destructive" }); return; }
    setIsCreatingBranch(true);
    try {
      const res = await api.post<ApiResponse<{ name: string }>>(
        `/api/github/projects/${projectId}/branch`,
        { name, fromBranch: newBranchFrom || undefined },
      );
      toast({ title: res.message ?? `Branch "${name}" created` });
      setNewBranchName(""); setNewBranchFrom(""); setShowBranchForm(false);
      await fetchBranches();
    } catch (err: unknown) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setIsCreatingBranch(false); }
  };

  // ── Release handlers ───────────────────────────────────────────────────────

  const handleCreateRelease = async () => {
    if (!releaseTag.trim()) { toast({ title: "Enter a version tag", variant: "destructive" }); return; }
    setIsReleaseing(true);
    try {
      const res = await api.post<ApiResponse<{ tag: string; url: string }>>(
        `/api/github/projects/${projectId}/release`,
        { tag: releaseTag.trim(), name: releaseName.trim(), body: releaseBody, draft: releaseDraft, prerelease: releasePrerelease },
      );
      toast({ title: res.message ?? `Release ${res.data.tag} created` });
      setReleaseTag(""); setReleaseName(""); setReleaseBody(""); setReleaseDraft(false); setReleasePrerelease(false);
      await fetchReleases();
    } catch (err: unknown) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setIsReleaseing(false); }
  };

  // ── Gist handler ───────────────────────────────────────────────────────────

  const handleCreateGist = async () => {
    setIsGisting(true); setLastGist(null);
    try {
      const res = await api.post<ApiResponse<GitHubGistResult>>("/api/github/gists", {
        projectId, description: gistDesc.trim(), public: gistPublic,
      });
      setLastGist(res.data);
      toast({ title: "Gist created", description: res.data.url });
    } catch (err: unknown) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setIsGisting(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="flex items-center justify-center h-24"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  }

  const hasToken = status?.hasToken ?? false;
  const isConnected = !!status?.githubRepo;
  const [repoOwner, repoName] = (status?.githubRepo ?? "/").split("/");
  const branch = status?.githubBranch ?? "main";

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-border/40 shrink-0">
        <Github className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">GitHub</span>
        {isConnected && (
          <a href={`https://github.com/${status!.githubRepo}`} target="_blank" rel="noopener noreferrer"
            className="ml-auto text-[10px] text-primary hover:underline truncate max-w-[120px]">
            {status!.githubRepo}
          </a>
        )}
      </div>

      <div className="p-3 space-y-3 text-sm">

        {/* ── AUTH ──────────────────────────────────────────────── */}
        {!hasToken && (
          <div className="space-y-3">
            {oauthConfigured && (
              <button onClick={handleOAuth} disabled={isOAuthLoading}
                className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-[#24292f] hover:bg-[#32383f] text-white text-xs font-medium transition-colors disabled:opacity-60">
                {isOAuthLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Github className="w-3.5 h-3.5" />}
                {isOAuthLoading ? "Waiting for authorization…" : "Sign in with GitHub"}
              </button>
            )}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">{oauthConfigured ? "Or use a Personal Access Token" : "Connect with GitHub"}</span>
              </div>
              {!showTokenForm ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowTokenForm(true)} className="text-xs text-primary hover:underline">{oauthConfigured ? "Use a token instead" : "Add token →"}</button>
                  <span className="text-muted-foreground text-xs">·</span>
                  <a href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=OrahAI" target="_blank" rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                    Create token <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input type="password" placeholder="ghp_xxxxxxxxxxxx" value={tokenInput} onChange={e => setTokenInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSaveToken(); }} className="h-7 text-xs" autoFocus />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveToken} disabled={isSavingToken || !tokenInput.trim()} className="h-7 text-xs gap-1">
                      {isSavingToken && <Loader2 className="w-3 h-3 animate-spin" />} Save token
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowTokenForm(false); setTokenInput(""); }} className="h-7 text-xs"><X className="w-3 h-3" /></Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CONNECTED TOKEN, NO REPO ─────────────────────────── */}
        {hasToken && !isConnected && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-green-500">
                <CheckCircle2 className="w-3.5 h-3.5" /><span>GitHub connected</span>
              </div>
              <button onClick={handleDisconnectToken} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">Disconnect</button>
            </div>

            {/* Tab: New repo | Connect existing */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              {([["new", Plus, "New repo"], ["connect", Link2, "Existing"]] as const).map(([id, Icon, label]) => (
                <button key={id} onClick={() => setActiveConnectTab(id as "new" | "connect")}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 h-7 text-xs font-medium transition-colors first:border-r first:border-border",
                    activeConnectTab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40")}>
                  <Icon className="w-3 h-3" />{label}
                </button>
              ))}
            </div>

            {activeConnectTab === "new" && (
              <div className="space-y-2.5">
                <div className="space-y-1.5">
                  <Label className="text-xs">Repository name</Label>
                  <Input placeholder="my-project" value={newRepoName} onChange={e => setNewRepoName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleCreateAndPush(); }} className="h-7 text-xs font-mono" autoFocus />
                </div>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {([["pub", Globe, "Public", false], ["priv", Lock, "Private", true]] as const).map(([k, Icon, label, val]) => (
                    <button key={k} onClick={() => setNewRepoPrivate(val)}
                      className={cn("flex-1 flex items-center justify-center gap-1.5 h-7 text-xs font-medium transition-colors first:border-r first:border-border",
                        newRepoPrivate === val ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/30")}>
                      <Icon className="w-3 h-3" />{label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowAdvanced(v => !v)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{showAdvanced ? "Hide options" : "More options"}
                </button>
                {showAdvanced && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Description (optional)</Label>
                    <Input placeholder="What this project does" value={newRepoDesc} onChange={e => setNewRepoDesc(e.target.value)} className="h-7 text-xs" />
                  </div>
                )}
                <Button size="sm" onClick={handleCreateAndPush} disabled={isCreating || !newRepoName.trim()} className="w-full h-8 text-xs gap-2">
                  {isCreating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating &amp; pushing…</> : <><Github className="w-3.5 h-3.5" />Create repo &amp; push</>}
                </Button>
                <p className="text-[10px] text-muted-foreground">Creates <code className="bg-muted px-1 rounded">{newRepoName.trim() || "my-project"}</code> on GitHub and pushes all project files.</p>
              </div>
            )}

            {activeConnectTab === "connect" && (
              <div className="space-y-2">
                <Label className="text-xs">Repository URL</Label>
                <Input placeholder="https://github.com/owner/repo" value={connectUrl} onChange={e => setConnectUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleConnect(); }} className="h-7 text-xs" autoFocus />
                <div className="flex gap-2">
                  <Input placeholder="Branch (main)" value={connectBranch} onChange={e => setConnectBranch(e.target.value)} className="h-7 text-xs w-28 shrink-0" />
                  <Button size="sm" onClick={handleConnect} disabled={isConnecting || !connectUrl.trim()} className="h-7 text-xs gap-1 flex-1">
                    {isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}Connect
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── CONNECTED STATE ───────────────────────────────────── */}
        {isConnected && (
          <>
            {/* Repo info strip */}
            <div className="rounded-lg border bg-muted/20 px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <Github className="w-3.5 h-3.5 text-primary shrink-0" />
                <a href={`https://github.com/${status!.githubRepo}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-medium text-primary hover:underline truncate flex-1">{status!.githubRepo}</a>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" />{branch}</span>
                {status!.githubSha && <span className="font-mono">{status!.githubSha.slice(0, 7)}</span>}
                {status!.githubSyncedAt && <span>{timeAgo(status!.githubSyncedAt)}</span>}
              </div>
            </div>

            {/* Quick links grid */}
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { icon: Code2, label: "github.dev", href: `https://github.dev/${status!.githubRepo}/tree/${branch}`, title: "Open in github.dev (web editor)" },
                { icon: MonitorPlay, label: "Codespace", href: `https://codespaces.new/${status!.githubRepo}?quickstart=1`, title: "Open in GitHub Codespaces" },
                { icon: GitPullRequest, label: "Pull Reqs", href: `https://github.com/${status!.githubRepo}/pulls`, title: "View Pull Requests" },
                { icon: AlertCircle, label: "Issues", href: `https://github.com/${status!.githubRepo}/issues`, title: "View Issues" },
                { icon: Zap, label: "Actions", href: `https://github.com/${status!.githubRepo}/actions`, title: "View GitHub Actions" },
                { icon: GitFork, label: "Fork", href: `https://github.com/${status!.githubRepo}/fork`, title: "Fork this repository" },
                { icon: Star, label: "Stars", href: `https://github.com/${status!.githubRepo}/stargazers`, title: "View stargazers" },
                { icon: Eye, label: "Insights", href: `https://github.com/${status!.githubRepo}/graphs/traffic`, title: "View repository insights" },
                { icon: BookMarked, label: "Wiki", href: `https://github.com/${status!.githubRepo}/wiki`, title: "View repository wiki" },
              ].map(({ icon: Icon, label, href, title }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={title}
                  className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg border border-border/50 bg-card hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground">
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-medium leading-none">{label}</span>
                </a>
              ))}
            </div>

            {/* Connected tabs */}
            <div className="flex border-b border-border/50 overflow-x-auto -mx-3 px-3">
              {([
                ["sync", GitCommitHorizontal, "Sync"],
                ["branches", GitBranch, "Branches"],
                ["releases", Tag, "Releases"],
                ["actions", Zap, "Actions"],
                ["gist", BookMarked, "Gist"],
              ] as const).map(([id, Icon, label]) => (
                <button key={id} onClick={() => setConnectedTab(id as ConnectedTab)}
                  className={cn("flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors",
                    connectedTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  <Icon className="w-3 h-3" />{label}
                </button>
              ))}
            </div>

            {/* ── SYNC TAB ──────────────────────────────────────── */}
            {connectedTab === "sync" && (
              <div className="space-y-3">
                {lastSyncResult && (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground bg-green-500/10 border border-green-500/20 rounded p-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" /><span>{lastSyncResult}</span>
                  </div>
                )}
                <Button size="sm" variant="outline" onClick={handlePull} disabled={isPulling} className="w-full h-8 text-xs gap-2">
                  {isPulling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Pull latest from GitHub
                </Button>
                <div className="space-y-1.5">
                  <Label className="text-xs">Commit message</Label>
                  <Input value={commitMsg} onChange={e => setCommitMsg(e.target.value)} className="h-7 text-xs" />
                  <Button size="sm" onClick={handlePush} disabled={isPushing} className="w-full h-8 text-xs gap-2">
                    {isPushing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}Push to GitHub
                  </Button>
                </div>
                {/* Commit history */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recent commits</p>
                    <button onClick={fetchCommits} disabled={commitsLoading} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40">
                      <RefreshCw className={cn("w-3 h-3", commitsLoading && "animate-spin")} />
                    </button>
                  </div>
                  {commitsLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                  ) : commits.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center py-3">No commits yet</p>
                  ) : (
                    <div className="space-y-1">
                      {commits.map(c => (
                        <a key={c.sha} href={c.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/40 transition-colors group">
                          <GitCommitHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-foreground leading-snug truncate">{c.message}</p>
                            <p className="text-[10px] text-muted-foreground">{c.authorName} · {timeAgo(c.authorDate)} · <span className="font-mono">{c.sha.slice(0, 7)}</span></p>
                          </div>
                          <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={handleDisconnectRepo}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors">
                  <Unlink className="w-3 h-3" />Disconnect repository
                </button>
              </div>
            )}

            {/* ── BRANCHES TAB ──────────────────────────────────── */}
            {connectedTab === "branches" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Branches</p>
                  <div className="flex items-center gap-1.5">
                    <button onClick={fetchBranches} disabled={branchesLoading} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40">
                      <RefreshCw className={cn("w-3 h-3", branchesLoading && "animate-spin")} />
                    </button>
                    <button onClick={() => setShowBranchForm(v => !v)}
                      className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                      <Plus className="w-3 h-3" />New
                    </button>
                  </div>
                </div>
                {showBranchForm && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 space-y-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Branch name</Label>
                      <Input value={newBranchName} onChange={e => setNewBranchName(e.target.value)} placeholder="feature/my-feature" className="h-7 text-xs font-mono" autoFocus />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">From branch (optional)</Label>
                      <Input value={newBranchFrom} onChange={e => setNewBranchFrom(e.target.value)} placeholder={branch} className="h-7 text-xs font-mono" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleCreateBranch} disabled={isCreatingBranch || !newBranchName.trim()} className="h-7 text-xs flex-1 gap-1">
                        {isCreatingBranch ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}Create
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowBranchForm(false); setNewBranchName(""); setNewBranchFrom(""); }} className="h-7 text-xs"><X className="w-3 h-3" /></Button>
                    </div>
                  </div>
                )}
                {branchesLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                ) : branches.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-3">No branches found</p>
                ) : (
                  <div className="space-y-1">
                    {branches.map(b => (
                      <div key={b.name} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted/30 transition-colors">
                        <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className={cn("text-xs flex-1 font-mono truncate", b.active && "text-primary font-semibold")}>{b.name}</span>
                        {b.active && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">active</span>}
                        {b.protected && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">protected</span>}
                        <a href={`https://github.com/${status!.githubRepo}/tree/${b.name}`} target="_blank" rel="noopener noreferrer"
                          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── RELEASES TAB ──────────────────────────────────── */}
            {connectedTab === "releases" && (
              <div className="space-y-3">
                {/* Create release form */}
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Create release</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Tag (e.g. v1.0.0)</Label>
                      <Input value={releaseTag} onChange={e => setReleaseTag(e.target.value)} placeholder="v1.0.0" className="h-7 text-xs font-mono" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Release title</Label>
                      <Input value={releaseName} onChange={e => setReleaseName(e.target.value)} placeholder="Optional" className="h-7 text-xs" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Release notes</Label>
                    <textarea value={releaseBody} onChange={e => setReleaseBody(e.target.value)} placeholder="What's changed in this release…"
                      className="w-full h-20 text-xs px-2.5 py-1.5 rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <input type="checkbox" checked={releaseDraft} onChange={e => setReleaseDraft(e.target.checked)} className="w-3 h-3" />
                      Draft
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <input type="checkbox" checked={releasePrerelease} onChange={e => setReleasePrerelease(e.target.checked)} className="w-3 h-3" />
                      Pre-release
                    </label>
                  </div>
                  <Button size="sm" onClick={handleCreateRelease} disabled={isReleaseing || !releaseTag.trim()} className="w-full h-8 text-xs gap-2">
                    {isReleaseing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating…</> : <><Tag className="w-3.5 h-3.5" />Create release</>}
                  </Button>
                </div>
                {/* Releases list */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recent releases</p>
                  <button onClick={fetchReleases} disabled={releasesLoading} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40">
                    <RefreshCw className={cn("w-3 h-3", releasesLoading && "animate-spin")} />
                  </button>
                </div>
                {releasesLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                ) : releases.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-3">No releases yet</p>
                ) : (
                  <div className="space-y-2">
                    {releases.map(r => (
                      <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-start gap-2 p-2.5 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors group">
                        <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-mono font-semibold text-foreground">{r.tag}</span>
                            {r.draft && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground">Draft</span>}
                            {r.prerelease && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">Pre-release</span>}
                          </div>
                          {r.name && r.name !== r.tag && <p className="text-[11px] text-muted-foreground truncate">{r.name}</p>}
                          <p className="text-[10px] text-muted-foreground">{timeAgo(r.publishedAt)}</p>
                        </div>
                        <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── ACTIONS TAB ───────────────────────────────────── */}
            {connectedTab === "actions" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Workflow runs</p>
                  <div className="flex items-center gap-2">
                    <button onClick={fetchRuns} disabled={runsLoading} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40">
                      <RefreshCw className={cn("w-3 h-3", runsLoading && "animate-spin")} />
                    </button>
                    <a href={`https://github.com/${status!.githubRepo}/actions`} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                      View all <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
                {runsLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                ) : runs.length === 0 ? (
                  <div className="text-center py-4 space-y-2">
                    <p className="text-[11px] text-muted-foreground">No workflow runs found.</p>
                    <a href={`https://github.com/${status!.githubRepo}/actions/new`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center justify-center gap-1">
                      Set up a workflow <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {runs.map(r => (
                      <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-start gap-2 p-2.5 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors group">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 justify-between">
                            <span className="text-[11px] font-medium text-foreground truncate">{r.name}</span>
                            <RunBadge status={r.status} conclusion={r.conclusion} />
                          </div>
                          {r.commitMessage && <p className="text-[10px] text-muted-foreground truncate">{r.commitMessage}</p>}
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-0.5"><GitBranch className="w-2.5 h-2.5" />{r.branch}</span>
                            <span>{timeAgo(r.createdAt)}</span>
                            <span className="capitalize">{r.event}</span>
                          </div>
                        </div>
                        <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
                      </a>
                    ))}
                  </div>
                )}
                <a href={`https://github.com/${status!.githubRepo}/actions/new`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Plus className="w-3 h-3" />Add workflow
                </a>
              </div>
            )}

            {/* ── GIST TAB ──────────────────────────────────────── */}
            {connectedTab === "gist" && (
              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground">Share your project files as a GitHub Gist — a lightweight public snippet or private note.</p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description (optional)</Label>
                  <Input value={gistDesc} onChange={e => setGistDesc(e.target.value)} placeholder={`Files from ${projectName || "project"}`} className="h-7 text-xs" />
                </div>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {([["pub", Globe, "Public gist", true], ["priv", Lock, "Secret gist", false]] as const).map(([k, Icon, label, val]) => (
                    <button key={k} onClick={() => setGistPublic(val)}
                      className={cn("flex-1 flex items-center justify-center gap-1.5 h-7 text-xs font-medium transition-colors first:border-r first:border-border",
                        gistPublic === val ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/30")}>
                      <Icon className="w-3 h-3" />{label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Uploads all project files (up to 20). File paths with <code className="bg-muted px-1 rounded">/</code> are flattened using <code className="bg-muted px-1 rounded">_</code>.</p>
                <Button size="sm" onClick={handleCreateGist} disabled={isGisting} className="w-full h-8 text-xs gap-2">
                  {isGisting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating gist…</> : <><BookMarked className="w-3.5 h-3.5" />Create gist</>}
                </Button>
                {lastGist && (
                  <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">Gist created</p>
                    </div>
                    <div className="flex items-center gap-2 bg-muted/40 rounded px-2.5 py-1.5 border border-border/60">
                      <span className="text-[10px] font-mono text-muted-foreground flex-1 break-all">{lastGist.url}</span>
                      <a href={lastGist.url} target="_blank" rel="noopener noreferrer"
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import {
  Github, GitBranch, RefreshCw, Upload, Unlink, Link2,
  Loader2, CheckCircle2, Key, ExternalLink, X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { api, API_BASE } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import type { ApiResponse, GitHubProjectStatus, GitHubSyncResult, GitHubPushResult } from "@/types";

interface Props {
  projectId: string;
  onSynced?: () => void;
}

export function GitHubPanel({ projectId, onSynced }: Props) {
  const [status, setStatus] = useState<GitHubProjectStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [oauthConfigured, setOauthConfigured] = useState(false);

  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [commitMsg, setCommitMsg] = useState("Update from OrahAI");
  const [lastResult, setLastResult] = useState<string | null>(null);

  const [connectUrl, setConnectUrl] = useState("");
  const [connectBranch, setConnectBranch] = useState("main");
  const [isConnecting, setIsConnecting] = useState(false);

  const [showTokenForm, setShowTokenForm] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);

  const popupRef = useRef<Window | null>(null);

  const refresh = async () => {
    try {
      const res = await api.get<ApiResponse<GitHubProjectStatus>>(`/api/github/projects/${projectId}`);
      setStatus(res.data);
    } catch { } finally { setIsLoading(false); }
  };

  useEffect(() => {
    refresh();
    // Check if OAuth is configured on this server
    api.get<ApiResponse<{ configured: boolean }>>("/api/github/oauth/configured")
      .then(r => setOauthConfigured(r.data.configured))
      .catch(() => setOauthConfigured(false));
  }, [projectId]);

  // Listen for OAuth popup message
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

  const handleOAuth = () => {
    const token = localStorage.getItem("orahai_token") ?? "";
    if (!token) { toast({ title: "Please log in first", variant: "destructive" }); return; }

    const base = API_BASE || "";
    const url = `${base}/api/github/oauth/start?token=${encodeURIComponent(token)}`;
    const popup = window.open(url, "github-oauth", "width=600,height=700,scrollbars=yes,resizable=yes");

    if (!popup || popup.closed) {
      toast({ title: "Pop-up blocked — please allow pop-ups for this site and try again", variant: "destructive" });
      return;
    }

    popupRef.current = popup;
    setIsOAuthLoading(true);

    // Detect if popup closes without postMessage (user closed manually)
    const poll = setInterval(() => {
      if (popup.closed) {
        clearInterval(poll);
        setIsOAuthLoading(false);
      }
    }, 500);
  };

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return;
    setIsSavingToken(true);
    try {
      const res = await api.post<ApiResponse<{ login: string }>>("/api/github/token", { token: tokenInput.trim() });
      toast({ title: `Connected as @${res.data.login}` });
      setTokenInput(""); setShowTokenForm(false);
      await refresh();
    } catch (err: unknown) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally { setIsSavingToken(false); }
  };

  const handleConnect = async () => {
    if (!connectUrl.trim()) return;
    setIsConnecting(true);
    try {
      await api.patch<ApiResponse<unknown>>(`/api/github/projects/${projectId}/connect`, {
        repoUrl: connectUrl.trim(), branch: connectBranch.trim() || "main",
      });
      toast({ title: "Repository connected" });
      setConnectUrl("");
      await refresh();
    } catch (err: unknown) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally { setIsConnecting(false); }
  };

  const handleDisconnect = async () => {
    try {
      await api.patch<ApiResponse<unknown>>(`/api/github/projects/${projectId}/connect`, { repoUrl: null });
      toast({ title: "Disconnected from GitHub" });
      setLastResult(null);
      await refresh();
    } catch (err: unknown) {
      toast({ title: (err as Error).message, variant: "destructive" });
    }
  };

  const handlePull = async () => {
    setIsPulling(true); setLastResult(null);
    try {
      const res = await api.post<ApiResponse<GitHubSyncResult>>(`/api/github/projects/${projectId}/pull`);
      const { updated, created } = res.data;
      const msg = res.message ?? `${created} new, ${updated} updated`;
      setLastResult(msg);
      toast({ title: "Pulled from GitHub", description: msg });
      onSynced?.();
      await refresh();
    } catch (err: unknown) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally { setIsPulling(false); }
  };

  const handlePush = async () => {
    setIsPushing(true); setLastResult(null);
    try {
      const res = await api.post<ApiResponse<GitHubPushResult>>(`/api/github/projects/${projectId}/push`, { message: commitMsg });
      const msg = res.message ?? `${res.data.pushed} files pushed`;
      setLastResult(msg);
      toast({ title: "Pushed to GitHub", description: msg });
      await refresh();
    } catch (err: unknown) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally { setIsPushing(false); }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-24">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasToken = status?.hasToken ?? false;
  const isConnected = !!status?.githubRepo;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-border/40 shrink-0">
        <Github className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">GitHub</span>
      </div>

      <div className="p-3 space-y-4 text-sm">

        {/* ── Auth section ──────────────────────────────────────── */}
        {!hasToken && (
          <div className="space-y-3">
            {/* OAuth button (shown when configured) */}
            {oauthConfigured && (
              <button
                onClick={handleOAuth}
                disabled={isOAuthLoading}
                className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-[#24292f] hover:bg-[#32383f] text-white text-xs font-medium transition-colors disabled:opacity-60"
              >
                {isOAuthLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Github className="w-3.5 h-3.5" />}
                {isOAuthLoading ? "Waiting for authorization…" : "Sign in with GitHub"}
              </button>
            )}

            {/* PAT fallback */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">
                  {oauthConfigured ? "Or use a Personal Access Token" : "Connect with GitHub"}
                </span>
              </div>

              {!oauthConfigured && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Add a GitHub Personal Access Token to push code, pull repositories, and sync your work.
                </p>
              )}

              {!showTokenForm ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowTokenForm(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    {oauthConfigured ? "Use a token instead" : "Add token →"}
                  </button>
                  <span className="text-muted-foreground text-xs">·</span>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=OrahAI"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                  >
                    Create token
                    <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxx"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveToken(); }}
                    className="h-7 text-xs"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveToken}
                      disabled={isSavingToken || !tokenInput.trim()}
                      className="h-7 text-xs gap-1"
                    >
                      {isSavingToken && <Loader2 className="w-3 h-3 animate-spin" />}
                      Save token
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setShowTokenForm(false); setTokenInput(""); }}
                      className="h-7 text-xs"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Token connected indicator ─────────────────────────── */}
        {hasToken && !isConnected && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-green-500">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>GitHub connected</span>
            </div>
            <button
              onClick={async () => {
                try {
                  await api.delete<ApiResponse<null>>("/api/github/token");
                  toast({ title: "GitHub disconnected" });
                  await refresh();
                } catch {
                  toast({ title: "Failed to disconnect", variant: "destructive" });
                }
              }}
              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}

        {/* ── Connect repo ──────────────────────────────────────── */}
        {!isConnected && (
          <div className="space-y-2">
            <Label className="text-xs">Connect a repository</Label>
            <Input
              placeholder="https://github.com/owner/repo"
              value={connectUrl}
              onChange={(e) => setConnectUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
              className="h-7 text-xs"
            />
            <div className="flex gap-2">
              <Input
                placeholder="Branch (main)"
                value={connectBranch}
                onChange={(e) => setConnectBranch(e.target.value)}
                className="h-7 text-xs w-28 shrink-0"
              />
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={isConnecting || !connectUrl.trim()}
                className="h-7 text-xs gap-1 flex-1"
              >
                {isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                Connect
              </Button>
            </div>
          </div>
        )}

        {/* ── Connected state ───────────────────────────────────── */}
        {isConnected && (
          <>
            <div className="rounded-lg border bg-muted/30 p-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <Github className="w-3.5 h-3.5 text-primary" />
                <a
                  href={`https://github.com/${status!.githubRepo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary hover:underline truncate"
                >
                  {status!.githubRepo}
                </a>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <GitBranch className="w-3 h-3" />
                <span>{status!.githubBranch ?? "main"}</span>
                {status!.githubSha && (
                  <span className="font-mono opacity-60">{status!.githubSha.slice(0, 7)}</span>
                )}
              </div>
              {status!.githubSyncedAt && (
                <p className="text-xs text-muted-foreground">
                  Synced {new Date(status!.githubSyncedAt).toLocaleString()}
                </p>
              )}
            </div>

            {lastResult && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded p-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                <span>{lastResult}</span>
              </div>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={handlePull}
              disabled={isPulling}
              className="w-full h-8 text-xs gap-2"
            >
              {isPulling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Pull latest from GitHub
            </Button>

            <div className="space-y-1.5">
              <Label className="text-xs">Commit message</Label>
              <Input
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                className="h-7 text-xs"
              />
              <Button
                size="sm"
                onClick={handlePush}
                disabled={isPushing || !hasToken}
                className="w-full h-8 text-xs gap-2"
              >
                {isPushing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Push to GitHub
              </Button>
              {!hasToken && (
                <p className="text-xs text-muted-foreground">Add a token above to enable push</p>
              )}
            </div>

            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Unlink className="w-3 h-3" />
              Disconnect repository
            </button>
          </>
        )}
      </div>
    </div>
  );
}

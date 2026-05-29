import { useState, useEffect, useCallback, useRef } from "react";
import {
  Rocket, Github, Download, ExternalLink, Loader2, CheckCircle2,
  XCircle, Globe, ChevronDown, ChevronUp, Monitor,
  AlertCircle, Smartphone, Copy, Check, RefreshCw, Link2, Zap,
  KeyRound, Clock, ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";
import { DomainsPanel } from "./DomainsPanel";

interface DeployResult {
  pushed: number;
  url: string;
  settingsUrl: string;
  branch: string;
  pagesEnabled: boolean;
  pagesWarning: string | null;
  deployedAt: string;
}

interface Props {
  project: Project;
  onProjectUpdate?: () => void;
}

const REGIONS = [
  "United States (East)", "United States (West)", "Europe (Frankfurt)",
  "Europe (London)", "Asia Pacific (Singapore)", "Asia Pacific (Tokyo)",
  "Australia (Sydney)", "South America (São Paulo)",
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span className={cn(
        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform duration-200",
        checked ? "translate-x-4" : "translate-x-0",
      )} />
    </button>
  );
}

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30 transition-colors text-left"
      >
        <span className="text-sm font-semibold">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-3">{children}</div>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CmdBlock({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center gap-1 bg-[#0d0d0d] rounded-lg px-3 py-2 font-mono text-xs text-slate-300 border border-white/5">
      <span className="text-muted-foreground/50 mr-1 select-none">$</span>
      <span className="flex-1 break-all">{cmd}</span>
      <CopyButton text={cmd} />
    </div>
  );
}

export function DeployPanel({ project, onProjectUpdate }: Props) {
  const slugified = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const [deployTab, setDeployTab] = useState<"publish" | "domains" | "vercel" | "netlify" | "github" | "download" | "mobile">("publish");

  // GitHub state
  const [deploying, setDeploying] = useState(false);
  const [commitMsg, setCommitMsg] = useState("Deploy from OrahAI");
  const [lastDeploy, setLastDeploy] = useState<DeployResult | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);

  // Download state
  const [downloading, setDownloading] = useState(false);

  // Mobile / Expo state
  const [expoUrl, setExpoUrl] = useState<string | null>(null);
  const [expoLoading, setExpoLoading] = useState(false);

  // Vercel deploy state
  type VercelDeployment = {
    id: string; vercelId?: string; vercel_id?: string; url: string | null;
    inspectorUrl?: string | null; inspector_url?: string | null;
    status: string; projectName?: string | null; project_name?: string | null;
    createdAt?: string; created_at?: string;
  };
  const [hasVercelToken, setHasVercelToken] = useState<boolean | null>(null);
  const [vercelTokenInput, setVercelTokenInput] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [vercelDeploying, setVercelDeploying] = useState(false);
  const [vercelDeployments, setVercelDeployments] = useState<VercelDeployment[]>([]);
  const [vercelLoadingDeployments, setVercelLoadingDeployments] = useState(false);
  const vercelPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchExpoUrl = useCallback(async () => {
    setExpoLoading(true);
    try {
      const res = await api.get<{ data: { expoUrl: string | null } }>("/api/mobile/expo-url");
      setExpoUrl(res.data.expoUrl);
    } catch { setExpoUrl(null); }
    finally { setExpoLoading(false); }
  }, []);

  useEffect(() => {
    if (deployTab === "mobile") fetchExpoUrl();
  }, [deployTab, fetchExpoUrl]);

  const handleGhDeploy = async () => {
    if (deploying) return;
    setDeploying(true); setDeployError(null);
    try {
      const res = await api.post<{ data: { pushed: number; url: string; settingsUrl: string; branch: string; pagesEnabled: boolean; pagesWarning: string | null } }>(
        `/api/github/projects/${project.id}/deploy`,
        { message: commitMsg || "Deploy from OrahAI" },
      );
      setLastDeploy({ ...res.data, deployedAt: new Date().toISOString() });
      toast({ title: `Deployed to GitHub Pages — ${res.data.pushed} files` });
      onProjectUpdate?.();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      const msg = e.response?.data?.message ?? "Deploy failed";
      setDeployError(msg); toast({ title: msg, variant: "destructive" });
    } finally { setDeploying(false); }
  };

  const handleDownloadZip = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { strFromU8, zipSync } = await import("fflate");
      const filesRes = await api.get<{ data: { path: string; content: string; isDir: boolean }[] }>(`/api/files/${project.id}`);
      const textFiles = (filesRes.data ?? []).filter(f => !f.isDir);
      const zipEntries: Record<string, Uint8Array> = {};
      for (const f of textFiles) zipEntries[f.path] = new TextEncoder().encode(f.content);
      const zipped = zipSync(zipEntries);
      const blob = new Blob([zipped], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${project.name.replace(/\s+/g, "-")}.zip`;
      a.click(); URL.revokeObjectURL(url);
      toast({ title: `Downloaded ${textFiles.length} files as ZIP` });
      void strFromU8;
    } catch { toast({ title: "Download failed", variant: "destructive" }); }
    finally { setDownloading(false); }
  };

  // ── Vercel helpers ──────────────────────────────────────────────────────────

  const loadVercelDeployments = useCallback(async () => {
    setVercelLoadingDeployments(true);
    try {
      const res = await api.get<{ data: VercelDeployment[] }>(`/api/vercel/${project.id}/deployments`);
      setVercelDeployments(res.data ?? []);
    } catch { /* silent */ }
    finally { setVercelLoadingDeployments(false); }
  }, [project.id]);

  const checkVercelToken = useCallback(async () => {
    try {
      const res = await api.get<{ data: { hasToken: boolean } }>(`/api/vercel/${project.id}/token-status`);
      setHasVercelToken(res.data.hasToken);
      if (res.data.hasToken) loadVercelDeployments();
    } catch { setHasVercelToken(false); }
  }, [project.id, loadVercelDeployments]);

  useEffect(() => {
    if (deployTab === "vercel") checkVercelToken();
    return () => {
      if (vercelPollRef.current) { clearInterval(vercelPollRef.current); vercelPollRef.current = null; }
    };
  }, [deployTab, checkVercelToken]);

  const startPolling = useCallback((deploymentId: string) => {
    if (vercelPollRef.current) clearInterval(vercelPollRef.current);
    vercelPollRef.current = setInterval(async () => {
      try {
        const res = await api.get<{ data: VercelDeployment }>(`/api/vercel/deployments/${deploymentId}/status`);
        const updated = res.data;
        setVercelDeployments(prev => prev.map(d => d.id === deploymentId ? { ...d, ...updated } : d));
        const terminal = ["READY", "ERROR", "CANCELED"].includes(updated.status ?? "");
        if (terminal) {
          if (vercelPollRef.current) { clearInterval(vercelPollRef.current); vercelPollRef.current = null; }
          if (updated.status === "READY") toast({ title: "✓ Deployed to Vercel", description: updated.url ?? undefined });
          if (updated.status === "ERROR") toast({ title: "Vercel deploy failed", variant: "destructive" });
        }
      } catch { /* ignore poll errors */ }
    }, 3000);
  }, []);

  const handleVercelDeploy = async () => {
    if (vercelDeploying) return;
    setVercelDeploying(true);
    try {
      const res = await api.post<{ data: VercelDeployment }>(`/api/vercel/${project.id}/deploy`, {});
      const deployment = res.data;
      setVercelDeployments(prev => [deployment, ...prev]);
      toast({ title: "Deployment started", description: "Building on Vercel…" });
      startPolling(deployment.id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast({ title: e.response?.data?.message ?? "Deploy failed", variant: "destructive" });
    } finally { setVercelDeploying(false); }
  };

  const handleSaveVercelToken = async () => {
    const token = vercelTokenInput.trim();
    if (!token) return;
    setSavingToken(true);
    try {
      await api.post(`/api/projects/${project.id}/secrets`, { key: "VERCEL_TOKEN", value: token });
      setHasVercelToken(true);
      setVercelTokenInput("");
      toast({ title: "Vercel token saved" });
      loadVercelDeployments();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast({ title: e.response?.data?.message ?? "Failed to save token", variant: "destructive" });
    } finally { setSavingToken(false); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 h-10 border-b border-border shrink-0">
        <Rocket className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Publish &amp; Deploy</span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0 overflow-x-auto">
        {([
          { id: "publish",  label: "Publish",  icon: Globe },
          { id: "domains",  label: "Domains",  icon: Link2 },
          { id: "vercel",   label: "Vercel",   icon: Zap },
          { id: "netlify",  label: "Netlify",  icon: Rocket },
          { id: "mobile",   label: "Mobile",   icon: Smartphone },
          { id: "github",   label: "GitHub",   icon: Github },
          { id: "download", label: "Download", icon: Download },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setDeployTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors flex-1 justify-center whitespace-nowrap",
              deployTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}>
            <Icon className="w-3 h-3" />{label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── PUBLISH TAB ─────────────────────────────────────────────── */}
        {deployTab === "publish" && (
          <div className="p-4 space-y-4">
            {/* Coming soon banner */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Rocket className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-primary">One-click publishing — coming soon</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Direct publishing to <span className="font-mono text-foreground">*.orahai.app</span> is not available yet. In the meantime, use <strong className="text-foreground">GitHub Pages</strong> to deploy your app for free, or <strong className="text-foreground">Download</strong> a ZIP to host anywhere.
              </p>
            </div>

            {/* Preview of what's coming */}
            <div className="space-y-3 opacity-40 pointer-events-none select-none">
              <div>
                <h2 className="text-lg font-bold">Publish your app</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Make it live and accessible to anyone</p>
              </div>

              {/* Domain preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Domain</Label>
                </div>
                <div className="flex items-center gap-0">
                  <div className="flex-1 h-9 px-3 flex items-center bg-muted/50 border border-input rounded-l-md text-sm font-mono text-muted-foreground">
                    {slugified}
                  </div>
                  <div className="h-9 flex items-center px-3 bg-muted/50 border border-input rounded-r-md text-sm text-muted-foreground font-mono shrink-0">
                    .orahai.app
                  </div>
                </div>
              </div>

              {/* What you're publishing */}
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground mb-2 font-medium">What you're publishing</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Monitor className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{project.name}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Globe className="w-3 h-3" />
                      https://{slugified}.orahai.app/
                    </p>
                  </div>
                </div>
              </div>

              {/* Publish button preview */}
              <div className="w-full flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-bold bg-primary/40 text-primary-foreground/60 cursor-not-allowed">
                <Rocket className="w-4 h-4" />Publish
              </div>
            </div>

            {/* Alternatives */}
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Available right now</p>
              <button
                onClick={() => setDeployTab("github")}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Github className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Deploy to GitHub Pages</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Free hosting via your GitHub repository</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-auto" />
              </button>
              <button
                onClick={() => setDeployTab("download")}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Download className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Download as ZIP</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Deploy to Vercel, Netlify, or any host</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-auto" />
              </button>
            </div>
          </div>
        )}

        {/* ── DOMAINS TAB ─────────────────────────────────────────────── */}
        {deployTab === "domains" && (
          <DomainsPanel project={project} />
        )}

        {/* ── VERCEL TAB ──────────────────────────────────────────────── */}
        {deployTab === "vercel" && (
          <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center shrink-0">
                <svg viewBox="0 0 76 65" className="w-5 h-5 fill-background" aria-hidden="true"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Vercel Functions</p>
                <p className="text-xs text-muted-foreground">Deploy directly — no GitHub required</p>
              </div>
              {hasVercelToken && (
                <button onClick={() => { loadVercelDeployments(); checkVercelToken(); }}
                  disabled={vercelLoadingDeployments}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                  title="Refresh">
                  <RefreshCw className={cn("w-3.5 h-3.5", vercelLoadingDeployments && "animate-spin")} />
                </button>
              )}
            </div>

            {/* Loading skeleton */}
            {hasVercelToken === null && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* No token — connect form */}
            {hasVercelToken === false && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="text-xs font-semibold">Connect your Vercel account</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Paste your Vercel API token below. It's saved as a project secret (<code className="font-mono">VERCEL_TOKEN</code>) and never leaves the server.
                  </p>
                  <ol className="space-y-1">
                    {[
                      <>Go to <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline inline-flex items-center gap-0.5">vercel.com/account/tokens <ExternalLink className="w-2.5 h-2.5" /></a></>,
                      <>Click <strong className="text-foreground">Create Token</strong>, give it a name, set scope to <strong className="text-foreground">Full Account</strong></>,
                      <>Paste the token here:</>,
                    ].map((text, i) => (
                      <li key={i} className="flex gap-2 text-[11px] text-muted-foreground">
                        <span className="font-mono text-primary font-bold shrink-0">{i + 1}.</span>
                        <span>{text}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="password"
                      placeholder="vercel_••••••••"
                      value={vercelTokenInput}
                      onChange={e => setVercelTokenInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSaveVercelToken()}
                      className="flex-1 h-8 text-xs font-mono"
                    />
                    <Button size="sm" onClick={handleSaveVercelToken} disabled={savingToken || !vercelTokenInput.trim()} className="h-8 text-xs px-3">
                      {savingToken ? <Loader2 className="w-3 h-3 animate-spin" /> : "Connect"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Connected — deploy UI */}
            {hasVercelToken === true && (
              <div className="space-y-4">
                {/* Token status */}
                <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-green-600 dark:text-green-400">Vercel account connected</p>
                    <p className="text-[11px] text-muted-foreground">Token stored as <code className="font-mono">VERCEL_TOKEN</code> project secret</p>
                  </div>
                  <button
                    onClick={() => setHasVercelToken(false)}
                    className="text-[10px] text-muted-foreground hover:text-destructive transition-colors underline shrink-0">
                    Change
                  </button>
                </div>

                {/* Deploy button */}
                <button
                  onClick={handleVercelDeploy}
                  disabled={vercelDeploying}
                  className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-foreground text-background text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {vercelDeploying
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Deploying…</>
                    : <><svg viewBox="0 0 76 65" className="w-4 h-4 fill-background" aria-hidden="true"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z" /></svg> Deploy to Vercel</>
                  }
                </button>
                <p className="text-[11px] text-center text-muted-foreground -mt-2">
                  Uploads all project files · Live in ~30 seconds
                </p>

                {/* Deployment history */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Deployments</p>
                    {vercelLoadingDeployments && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  </div>

                  {vercelDeployments.length === 0 && !vercelLoadingDeployments && (
                    <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4 flex flex-col items-center gap-1.5 text-center">
                      <Rocket className="w-5 h-5 text-muted-foreground/40" />
                      <p className="text-xs text-muted-foreground">No deployments yet</p>
                      <p className="text-[11px] text-muted-foreground/60">Hit Deploy to push your first version</p>
                    </div>
                  )}

                  {vercelDeployments.map(d => {
                    const status = d.status ?? "QUEUED";
                    const url = d.url ?? null;
                    const inspectorUrl = d.inspectorUrl ?? d.inspector_url ?? null;
                    const projectName = d.projectName ?? d.project_name ?? "—";
                    const createdAt = d.createdAt ?? d.created_at;
                    const isBuilding = ["QUEUED", "INITIALIZING", "BUILDING", "DEPLOYING"].includes(status);
                    const isReady = status === "READY";
                    const isError = ["ERROR", "CANCELED"].includes(status);

                    return (
                      <div key={d.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 shrink-0">
                            {isBuilding && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />}
                            {isReady && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                            {isError && <XCircle className="w-3.5 h-3.5 text-destructive" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-mono text-foreground truncate">{projectName}</span>
                              <span className={cn(
                                "text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                                isBuilding && "bg-amber-500/10 text-amber-500",
                                isReady && "bg-green-500/10 text-green-500",
                                isError && "bg-destructive/10 text-destructive",
                              )}>
                                {status}
                              </span>
                            </div>
                            {createdAt && (
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Clock className="w-2.5 h-2.5" />
                                {new Date(createdAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>

                        {isReady && url && (
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[11px] text-primary hover:underline font-mono break-all">
                            <ArrowUpRight className="w-3 h-3 shrink-0" />
                            {url.replace(/^https?:\/\//, "")}
                          </a>
                        )}

                        {inspectorUrl && (
                          <a href={inspectorUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                            <ExternalLink className="w-2.5 h-2.5" /> View build logs on Vercel
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* How it works */}
                <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">How it works</p>
                  {[
                    "All project files are uploaded directly to Vercel's API",
                    "Files in api/ become Serverless Functions automatically",
                    "Static files are served from Vercel's global edge CDN",
                    "Each deploy creates a unique preview URL",
                  ].map(item => (
                    <p key={item} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-primary/60 shrink-0 mt-0.5" />{item}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── NETLIFY TAB ─────────────────────────────────────────────── */}
        {deployTab === "netlify" && (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#00c7b7] flex items-center justify-center shrink-0">
                <svg viewBox="0 0 40 40" className="w-5 h-5 fill-white" aria-hidden="true"><path d="M27.8 10.2l-1.7 1.7-5.3-5.3v18.3h-2.4V6.6l-5.3 5.3-1.7-1.7L20 2l7.8 8.2zM34 24.8l-7.8 8.2-7.8-8.2 1.7-1.7 5.3 5.3V10.1h2.4v18.3l5.3-5.3 1.9 1.7z"/></svg>
              </div>
              <div>
                <p className="text-sm font-semibold">Deploy to Netlify</p>
                <p className="text-xs text-muted-foreground">Continuous deployment with built-in CI/CD</p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Option 1 — Drag &amp; Drop</p>
              <ol className="space-y-2">
                <li className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-mono text-primary shrink-0 font-bold">1.</span>
                  Download your project ZIP using the <button onClick={() => setDeployTab("download")} className="text-primary underline hover:no-underline">Download tab</button>
                </li>
                <li className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-mono text-primary shrink-0 font-bold">2.</span>
                  Unzip it locally and run your build (e.g. <span className="font-mono text-foreground">npm run build</span>)
                </li>
                <li className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-mono text-primary shrink-0 font-bold">3.</span>
                  Drag the <span className="font-mono text-foreground">dist/</span> folder to <a href="https://app.netlify.com/drop" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline inline-flex items-center gap-1">app.netlify.com/drop <ExternalLink className="w-3 h-3" /></a>
                </li>
              </ol>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Option 2 — Netlify CLI</p>
              <div className="space-y-1.5">
                <CmdBlock cmd="npm install -g netlify-cli" />
              </div>
              <div className="space-y-1.5">
                <CmdBlock cmd="netlify deploy --prod --dir=dist" />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Option 3 — GitHub → Netlify</p>
              <ol className="space-y-2">
                <li className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-mono text-primary shrink-0 font-bold">1.</span>
                  Push to GitHub via the <button onClick={() => setDeployTab("github")} className="text-primary underline hover:no-underline">GitHub tab</button>
                </li>
                <li className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-mono text-primary shrink-0 font-bold">2.</span>
                  Go to <a href="https://app.netlify.com" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline inline-flex items-center gap-1">app.netlify.com <ExternalLink className="w-3 h-3" /></a> → Add new site → Import from Git
                </li>
                <li className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-mono text-primary shrink-0 font-bold">3.</span>
                  Set build command + publish directory — Netlify detects most frameworks automatically
                </li>
              </ol>
            </div>

            <div className="rounded-xl border border-[#00c7b7]/20 bg-[#00c7b7]/5 p-3">
              <p className="text-xs font-semibold text-[#00a89a] mb-1">Netlify Free tier includes</p>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">✓ 100 GB bandwidth / month</p>
                <p className="text-xs text-muted-foreground">✓ 300 build minutes / month</p>
                <p className="text-xs text-muted-foreground">✓ Automatic HTTPS + CDN</p>
                <p className="text-xs text-muted-foreground">✓ Form handling + serverless functions</p>
              </div>
            </div>

            <a href="https://docs.netlify.com" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              Netlify Docs <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* ── MOBILE TAB ──────────────────────────────────────────────── */}
        {deployTab === "mobile" && (
          <div className="p-4 space-y-5">

            {/* ── Test on device ─────────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Test on device</p>
                <button onClick={fetchExpoUrl} disabled={expoLoading}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                  title="Refresh">
                  <RefreshCw className={cn("w-3.5 h-3.5", expoLoading && "animate-spin")} />
                </button>
              </div>

              {expoLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : expoUrl ? (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex justify-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=ffffff&color=000000&data=${encodeURIComponent(expoUrl)}`}
                      alt="Expo Go QR code"
                      width={180}
                      height={180}
                      className="rounded-lg border border-border"
                    />
                  </div>
                  <p className="text-center text-xs text-muted-foreground">
                    Scan with <strong className="text-foreground">Expo Go</strong> on iOS or Android
                  </p>
                  <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 border border-border/60">
                    <span className="text-[10px] font-mono text-muted-foreground flex-1 break-all">{expoUrl}</span>
                    <CopyButton text={expoUrl} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <a href="https://apps.apple.com/app/expo-go/id982107779" target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors text-xs font-medium">
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                      App Store
                    </a>
                    <a href="https://play.google.com/store/apps/details?id=host.exp.exponent" target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors text-xs font-medium">
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true"><path d="M3.18 23.76c.3.17.64.24.99.2l12.45-7.19-2.75-2.77-10.69 9.76zM.54 1.52C.2 1.86 0 2.4 0 3.1v17.8c0 .7.2 1.24.54 1.58l.08.08 9.97-9.97v-.22L.62 1.44l-.08.08zm15.6 10.98-3.31-3.31 3.31-3.31c.63.36 1.04.99 1.04 1.67v3.28c0 .68-.41 1.31-1.04 1.67zm1.52 4.13-1.63.94-2.75-2.77 2.75-2.77 1.63.94c1.63.94 1.63 2.71 0 3.66z"/></svg>
                      Play Store
                    </a>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4 flex flex-col items-center gap-2 text-center">
                  <AlertCircle className="w-5 h-5 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">Expo dev server not detected.</p>
                  <p className="text-[11px] text-muted-foreground/70">Make sure the Expo workflow is running, then refresh.</p>
                </div>
              )}
            </div>

            {/* ── Build for Android ──────────────────────────────────── */}
            <Section title="Build for Android" defaultOpen={false}>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Build a production-ready <strong className="text-foreground">APK</strong> (sideload) or <strong className="text-foreground">AAB</strong> (Play Store) using Expo Application Services.
              </p>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">1. Install EAS CLI</p>
                <CmdBlock cmd="npm install -g eas-cli" />
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">2. Log in to Expo</p>
                <CmdBlock cmd="eas login" />
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">3. Build Android bundle (AAB)</p>
                <CmdBlock cmd="eas build --platform android --profile production" />
              </div>
              <div className="rounded-lg bg-muted/30 border border-border/50 p-3 space-y-1">
                <p className="text-[11px] font-medium">App details</p>
                <p className="text-[10px] text-muted-foreground font-mono">Package: com.replit.orahaimobile</p>
                <p className="text-[10px] text-muted-foreground font-mono">Version: 1.0.0</p>
              </div>
              <a href="https://docs.expo.dev/build/setup/" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                EAS Build docs <ExternalLink className="w-3 h-3" />
              </a>
            </Section>

            {/* ── Build for iOS ──────────────────────────────────────── */}
            <Section title="Build for iOS" defaultOpen={false}>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Build an <strong className="text-foreground">IPA</strong> for the App Store using EAS. Requires an Apple Developer account ($99/yr).
              </p>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">1. Install EAS CLI</p>
                <CmdBlock cmd="npm install -g eas-cli" />
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">2. Build iOS archive (IPA)</p>
                <CmdBlock cmd="eas build --platform ios --profile production" />
              </div>
              <div className="rounded-lg bg-muted/30 border border-border/50 p-3 space-y-1">
                <p className="text-[11px] font-medium">App details</p>
                <p className="text-[10px] text-muted-foreground font-mono">Bundle ID: com.replit.orahaimobile</p>
                <p className="text-[10px] text-muted-foreground font-mono">Version: 1.0.0</p>
              </div>
              <a href="https://docs.expo.dev/build/setup/" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                EAS Build docs <ExternalLink className="w-3 h-3" />
              </a>
            </Section>

            {/* ── Submit to stores ───────────────────────────────────── */}
            <Section title="Submit to stores" defaultOpen={false}>
              <p className="text-xs text-muted-foreground leading-relaxed">
                After a successful build, submit directly to the App Store or Google Play with one command.
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 mb-1">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-muted-foreground" aria-hidden="true"><path d="M3.18 23.76c.3.17.64.24.99.2l12.45-7.19-2.75-2.77-10.69 9.76zM.54 1.52C.2 1.86 0 2.4 0 3.1v17.8c0 .7.2 1.24.54 1.58l.08.08 9.97-9.97v-.22L.62 1.44l-.08.08zm15.6 10.98-3.31-3.31 3.31-3.31c.63.36 1.04.99 1.04 1.67v3.28c0 .68-.41 1.31-1.04 1.67zm1.52 4.13-1.63.94-2.75-2.77 2.75-2.77 1.63.94c1.63.94 1.63 2.71 0 3.66z"/></svg>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Google Play Store</p>
                </div>
                <CmdBlock cmd="eas submit --platform android" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 mb-1">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-muted-foreground" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Apple App Store</p>
                </div>
                <CmdBlock cmd="eas submit --platform ios" />
              </div>
              <a href="https://docs.expo.dev/submit/introduction/" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                EAS Submit docs <ExternalLink className="w-3 h-3" />
              </a>
            </Section>

          </div>
        )}

        {/* ── GITHUB TAB ──────────────────────────────────────────────── */}
        {deployTab === "github" && (
          <div className="p-4 space-y-4">
            <div className={cn(
              "rounded-xl border p-4 space-y-3",
              project.githubRepo ? "border-border bg-card" : "border-dashed border-border/60 bg-muted/20",
            )}>
              <div className="flex items-center gap-2">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  project.githubRepo ? "bg-foreground/10" : "bg-muted")}>
                  <Github className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">GitHub Pages</p>
                  <p className="text-xs text-muted-foreground">
                    {project.githubRepo ? project.githubRepo : "Connect GitHub repo first"}
                  </p>
                </div>
                {project.githubRepo && <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto shrink-0" />}
              </div>

              {!project.githubRepo ? (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Open the GitHub panel (top bar) to connect a repository, then come back to deploy.
                  </p>
                </div>
              ) : (
                <>
                  {/* How it works — 3 steps */}
                  <div className="rounded-lg bg-muted/30 border border-border/50 p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">How it works</p>
                    {[
                      { n: "1", text: <>OrahAI pushes your files to a <code className="bg-muted px-1 rounded">gh-pages</code> branch and adds <code className="bg-muted px-1 rounded">.nojekyll</code> so all file types are served correctly.</> },
                      { n: "2", text: <>GitHub Pages is <strong className="text-foreground">enabled automatically</strong> on your repo. If the repo is private you'll need to upgrade to GitHub Pro or make it public first.</> },
                      { n: "3", text: <>Your site goes live at <code className="bg-muted px-1 rounded">https://&lt;user&gt;.github.io/&lt;repo&gt;/</code> — GitHub usually takes under a minute to build and publish.</> },
                    ].map(({ n, text }) => (
                      <div key={n} className="flex gap-2.5">
                        <span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{text}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Commit message</Label>
                    <Input value={commitMsg} onChange={e => setCommitMsg(e.target.value)} className="h-8 text-xs" />
                  </div>

                  {deployError && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                      <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                      <p className="text-xs text-destructive">{deployError}</p>
                    </div>
                  )}

                  {lastDeploy && !deployError && (
                    <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 space-y-2.5">
                      {/* Files pushed */}
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                          Pushed {lastDeploy.pushed} file{lastDeploy.pushed !== 1 ? "s" : ""} to <code className="bg-green-500/20 px-1 rounded">gh-pages</code>
                        </p>
                      </div>

                      {/* Pages enable status */}
                      {lastDeploy.pagesWarning ? (
                        <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <div className="space-y-1 min-w-0">
                            <p className="text-[11px] text-amber-600 dark:text-amber-400">{lastDeploy.pagesWarning}</p>
                            <a href={lastDeploy.settingsUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline">
                              Enable manually in Settings → Pages <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          <p className="text-xs text-green-600 dark:text-green-400">
                            {lastDeploy.pagesEnabled ? "GitHub Pages enabled automatically" : "GitHub Pages already enabled"}
                          </p>
                        </div>
                      )}

                      {/* Live URL */}
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">Your site will be live at (takes ~1 min to build):</p>
                        <div className="flex items-center gap-2 bg-muted/40 rounded px-2.5 py-1.5 border border-border/60">
                          <span className="text-[10px] font-mono text-muted-foreground flex-1 break-all">{lastDeploy.url}</span>
                          <CopyButton text={lastDeploy.url} />
                          <a href={lastDeploy.url} target="_blank" rel="noopener noreferrer"
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Open site">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  <Button className="w-full gap-2" onClick={handleGhDeploy} disabled={deploying}>
                    {deploying
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Deploying…</>
                      : <><Github className="w-4 h-4" />{lastDeploy ? "Re-deploy to GitHub Pages" : "Deploy to GitHub Pages"}</>}
                  </Button>

                  {!lastDeploy && (
                    <p className="text-[10px] text-muted-foreground/60">
                      Also writes <code className="bg-muted px-1 rounded">.nojekyll</code> so Jekyll doesn't hide your files.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── DOWNLOAD TAB ────────────────────────────────────────────── */}
        {deployTab === "download" && (
          <div className="p-4 space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Download as ZIP</p>
                  <p className="text-xs text-muted-foreground">Export all project files locally</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Downloads all {project.name} source files as a ZIP archive. Binary and generated files (node_modules, dist) are excluded.
              </p>
              <Button variant="outline" className="w-full gap-2" onClick={handleDownloadZip} disabled={downloading}>
                {downloading ? <><Loader2 className="w-4 h-4 animate-spin" />Preparing…</> : <><Download className="w-4 h-4" />{project.name}.zip</>}
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">More export options</p>
              {[
                { name: "Vercel", desc: "One-click serverless deploy" },
                { name: "Netlify", desc: "Static sites & functions" },
                { name: "Railway", desc: "Full-stack with database" },
              ].map(p => (
                <div key={p.name} className="flex items-center gap-3 rounded-lg border border-dashed border-border/40 p-3 opacity-50">
                  <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Rocket className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.desc}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Soon</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

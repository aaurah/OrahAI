import { useState, useEffect } from "react";
import {
  Rocket, Github, Download, ExternalLink, Loader2, CheckCircle2,
  XCircle, Globe, Shield, Bell, ChevronDown, ChevronUp, Monitor,
  Database, Zap, MapPin, Lock, Tag, MessageCircle, Eye, EyeOff,
  Server, Cpu, MemoryStick, AlertCircle, Star,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

interface DeployResult {
  pushed: number;
  url: string;
  branch: string;
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

export function DeployPanel({ project, onProjectUpdate }: Props) {
  const slugified = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const [deployTab, setDeployTab] = useState<"publish" | "github" | "download">("publish");

  // GitHub state
  const [deploying, setDeploying] = useState(false);
  const [commitMsg, setCommitMsg] = useState("Deploy from OrahAI");
  const [lastDeploy, setLastDeploy] = useState<DeployResult | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);

  // Download state
  const [downloading, setDownloading] = useState(false);

  const handleGhDeploy = async () => {
    if (deploying) return;
    setDeploying(true); setDeployError(null);
    try {
      const res = await api.post<{ data: { pushed: number; url: string; branch: string } }>(
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 h-10 border-b border-border shrink-0">
        <Rocket className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Publish &amp; Deploy</span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {([
          { id: "publish", label: "Publish", icon: Globe },
          { id: "github", label: "GitHub", icon: Github },
          { id: "download", label: "Download", icon: Download },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setDeployTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors flex-1 justify-center",
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
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-green-600 dark:text-green-400 font-medium">Deployed {lastDeploy.pushed} files</p>
                        <a href={lastDeploy.url} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-green-600/80 dark:text-green-400/80 hover:underline break-all flex items-center gap-1 mt-0.5">
                          {lastDeploy.url} <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    </div>
                  )}
                  <Button className="w-full gap-2" onClick={handleGhDeploy} disabled={deploying}>
                    {deploying ? <><Loader2 className="w-4 h-4 animate-spin" />Deploying…</> : <><Github className="w-4 h-4" />Deploy to GitHub Pages</>}
                  </Button>
                  <p className="text-[10px] text-muted-foreground/60">
                    Pushes files to <code className="bg-muted px-1 rounded">gh-pages</code> branch.
                    Enable GitHub Pages in repo Settings → Pages.
                  </p>
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

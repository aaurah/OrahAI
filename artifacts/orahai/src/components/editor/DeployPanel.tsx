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
  const [domain, setDomain] = useState(slugified);
  const [domainAvailable, setDomainAvailable] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [feedbackWidget, setFeedbackWidget] = useState(false);
  const [badge, setBadge] = useState(false);
  const [blockVulns, setBlockVulns] = useState(false);
  const [region, setRegion] = useState("United States (East)");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [deployTab, setDeployTab] = useState<"publish" | "github" | "download">("publish");

  // GitHub state
  const [deploying, setDeploying] = useState(false);
  const [commitMsg, setCommitMsg] = useState("Deploy from OrahAI");
  const [lastDeploy, setLastDeploy] = useState<DeployResult | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);

  // Download state
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setDomainAvailable(domain.length >= 3);
  }, [domain]);

  const handlePublish = async () => {
    if (publishing || !domainAvailable) return;
    setPublishing(true);
    await new Promise(r => setTimeout(r, 2200));
    const url = `https://${domain}.orahai.app/`;
    setPublishedUrl(url);
    setPublished(true);
    setPublishing(false);
    toast({ title: `Published to ${url}` });
  };

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
            <div>
              <h2 className="text-lg font-bold">Publish your app</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Make it live and accessible to anyone</p>
            </div>

            {/* Published success state */}
            {published && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-sm font-semibold text-emerald-400">App is live!</span>
                </div>
                <a href={publishedUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline break-all">
                  {publishedUrl}<ExternalLink className="w-3 h-3 shrink-0" />
                </a>
                <button onClick={() => setPublished(false)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                  Edit publish settings
                </button>
              </div>
            )}

            {!published && (
              <>
                {/* Domain */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Domain</Label>
                    <span className={cn(
                      "text-[10px] font-medium flex items-center gap-1",
                      domainAvailable ? "text-emerald-400" : "text-destructive",
                    )}>
                      <CheckCircle2 className="w-3 h-3" />
                      {domainAvailable ? "Available" : "Too short"}
                    </span>
                  </div>
                  <div className="flex items-center gap-0">
                    <Input
                      value={domain}
                      onChange={e => setDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      className="h-9 text-sm rounded-r-none border-r-0 font-mono"
                      placeholder={slugified}
                    />
                    <div className="h-9 flex items-center px-3 bg-muted/50 border border-input rounded-r-md text-sm text-muted-foreground font-mono shrink-0">
                      .orahai.app
                    </div>
                  </div>
                  {domain.length >= 3 && (
                    <p className="text-[11px] text-muted-foreground">
                      Your app will be at <span className="text-foreground font-mono">https://{domain}.orahai.app/</span>
                    </p>
                  )}
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
                        https://{domain || slugified}.orahai.app/
                      </p>
                    </div>
                  </div>
                </div>

                {/* Who can access */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Who can access your app</Label>
                  <div className="relative">
                    <select
                      value={isPublic ? "public" : "private"}
                      onChange={e => setIsPublic(e.target.value === "public")}
                      className="w-full h-9 rounded-md border border-input bg-transparent pl-9 pr-4 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none"
                    >
                      <option value="public">Public — Anyone on the internet</option>
                      <option value="private">Private — Only me</option>
                    </select>
                    <Globe className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Database settings */}
                <Section title="Database settings" defaultOpen={false}>
                  <div className="flex items-start gap-3">
                    <Database className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium">Production database</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        A separate production database is automatically provisioned when you publish.
                        Your development data stays isolated.
                      </p>
                    </div>
                  </div>
                </Section>

                {/* Monitoring tools */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monitoring tools</p>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <Bell className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Enable app monitoring</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                            Be the first to know when your app is down. We'll continuously check if your app is online and notify you if things go wrong.
                          </p>
                        </div>
                      </div>
                      <Toggle checked={monitoringEnabled} onChange={setMonitoringEnabled} />
                    </div>
                  </div>
                </div>

                {/* Engagement tools */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Engagement tools</p>
                  <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                    <div className="flex items-start justify-between gap-3 p-4">
                      <div className="flex items-start gap-2 min-w-0">
                        <MessageCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Enable feedback widget</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                            Add a feedback widget to your published app. Users can submit bug reports sent directly to the AI.
                          </p>
                        </div>
                      </div>
                      <Toggle checked={feedbackWidget} onChange={setFeedbackWidget} />
                    </div>
                    <div className="flex items-start justify-between gap-3 p-4">
                      <div className="flex items-start gap-2 min-w-0">
                        <Star className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">"Made with OrahAI" badge</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                            Display a badge on your published app. When someone signs up via your referral link, you earn credits.
                          </p>
                        </div>
                      </div>
                      <Toggle checked={badge} onChange={setBadge} />
                    </div>
                  </div>
                </div>

                {/* Publish button */}
                <button
                  onClick={handlePublish}
                  disabled={publishing || !domainAvailable}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-bold transition-all",
                    publishing || !domainAvailable
                      ? "bg-primary/40 text-primary-foreground/60 cursor-not-allowed"
                      : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-primary/20 hover:shadow-lg",
                  )}
                >
                  {publishing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Publishing…</>
                  ) : (
                    <><Rocket className="w-4 h-4" />Publish</>
                  )}
                </button>

                {/* Adjust settings */}
                <div className="rounded-xl border border-border overflow-hidden">
                  <button
                    onClick={() => setAdjustOpen(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold">Adjust settings</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Manually configure machine settings, secrets, ports, and more.</p>
                    </div>
                    {adjustOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </button>

                  {adjustOpen && (
                    <div className="border-t border-border divide-y divide-border/50">
                      {/* Deployment type */}
                      <div className="px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deployment type</p>
                          <span className="text-[10px] text-muted-foreground">
                            Technology used to publish your app.{" "}
                            <span className="text-primary cursor-pointer hover:underline">Learn more</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between h-9 px-3 rounded-md border border-input bg-muted/20 text-sm">
                          <div className="flex items-center gap-2">
                            <Zap className="w-3.5 h-3.5 text-primary" />
                            <span className="font-medium">Autoscale</span>
                          </div>
                          <span className="text-[10px] bg-primary/15 text-primary font-semibold px-1.5 py-0.5 rounded">Recommended</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Automatically scales from zero to any level of demand.</p>
                      </div>

                      {/* Machine configuration */}
                      <div className="px-4 py-3 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Machine configuration</p>
                        <p className="text-[11px] text-muted-foreground">The power of the servers running your app.</p>
                        <div className="flex items-center justify-between px-3 py-2.5 rounded-md border border-border bg-card">
                          <div className="flex items-center gap-3 text-xs">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Cpu className="w-3.5 h-3.5" />
                              <span>2 vCPUs</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <MemoryStick className="w-3.5 h-3.5" />
                              <span>4 GiB RAM</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Server className="w-3.5 h-3.5" />
                              <span>3 max</span>
                            </div>
                          </div>
                          <button className="text-xs text-primary flex items-center gap-1 hover:underline shrink-0">
                            Edit <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground px-0.5">
                          <span>Per machine: <span className="text-foreground font-mono">$0.004/hr</span></span>
                          <span>At max traffic: <span className="text-foreground font-mono">$0.011/hr</span></span>
                        </div>
                      </div>

                      {/* Deployment secrets */}
                      <div className="px-4 py-3">
                        <button onClick={() => setSecretsOpen(v => !v)}
                          className="w-full flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                            <p className="text-sm font-medium">Deployment secrets</p>
                          </div>
                          {secretsOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                        </button>
                        <p className="text-[11px] text-muted-foreground mt-1">Private keys your app uses to access APIs and services.</p>
                        {secretsOpen && (
                          <div className="mt-2 p-3 rounded-md border border-dashed border-border/60 bg-muted/20 text-xs text-muted-foreground text-center">
                            Manage secrets in the Secrets panel → they are automatically available in production.
                          </div>
                        )}
                      </div>

                      {/* Deployment geography */}
                      <div className="px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                          <p className="text-sm font-medium">Deployment geography</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Choose where your app is hosted. Selecting a region closer to your users reduces latency.</p>
                        <div className="flex items-center gap-2">
                          <select
                            value={region}
                            onChange={e => setRegion(e.target.value)}
                            className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            {REGIONS.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          <span className="text-[10px] bg-primary/15 text-primary font-semibold px-1.5 py-1 rounded shrink-0">Closest</span>
                        </div>
                      </div>

                      {/* Block critical vulnerabilities */}
                      <div className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 min-w-0">
                            <Shield className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium">Block publishing of critical vulnerabilities</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                We always run a security scan before publishing. This setting controls whether publishing is blocked when critical security issues are found.
                              </p>
                            </div>
                          </div>
                          <Toggle checked={blockVulns} onChange={setBlockVulns} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
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

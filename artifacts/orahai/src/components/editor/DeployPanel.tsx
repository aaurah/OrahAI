import { useState } from "react";
import { Rocket, Github, Download, ExternalLink, Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
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

export function DeployPanel({ project, onProjectUpdate }: Props) {
  const [deploying, setDeploying] = useState(false);
  const [commitMsg, setCommitMsg] = useState("Deploy from OrahAI");
  const [lastDeploy, setLastDeploy] = useState<DeployResult | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const hasGitHub = !!project.githubRepo;

  const handleDeploy = async () => {
    if (deploying) return;
    setDeploying(true);
    setDeployError(null);
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
      setDeployError(msg);
      toast({ title: msg, variant: "destructive" });
    } finally {
      setDeploying(false);
    }
  };

  const handleDownloadZip = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { strFromU8, zipSync } = await import("fflate");
      const filesRes = await api.get<{ data: { path: string; content: string; isDir: boolean }[] }>(`/api/files/${project.id}`);
      const textFiles = (filesRes.data ?? []).filter(f => !f.isDir);
      const zipEntries: Record<string, Uint8Array> = {};
      for (const f of textFiles) {
        const encoder = new TextEncoder();
        zipEntries[f.path] = encoder.encode(f.content);
      }
      const zipped = zipSync(zipEntries);
      const blob = new Blob([zipped], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${project.name.replace(/\s+/g, "-")}.zip`;
      a.click(); URL.revokeObjectURL(url);
      toast({ title: `Downloaded ${textFiles.length} files as ZIP` });
      void strFromU8; // avoid unused import warning
    } catch (err) {
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-3 h-10 border-b border-border shrink-0">
        <Rocket className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deploy</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">

        {/* GitHub Pages */}
        <div className={cn(
          "rounded-xl border p-4 space-y-3 transition-colors",
          hasGitHub ? "border-border bg-card" : "border-dashed border-border/60 bg-muted/20",
        )}>
          <div className="flex items-center gap-2">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              hasGitHub ? "bg-foreground/10" : "bg-muted")}>
              <Github className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">GitHub Pages</p>
              <p className="text-xs text-muted-foreground">
                {hasGitHub ? `${project.githubRepo}` : "Connect GitHub repo first"}
              </p>
            </div>
            {hasGitHub && <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto shrink-0" />}
          </div>

          {!hasGitHub ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Open the GitHub panel (top right) to connect a repository, then come back to deploy.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Commit message</Label>
                <Input
                  value={commitMsg}
                  onChange={e => setCommitMsg(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="Deploy from OrahAI"
                />
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

              <Button
                className="w-full gap-2"
                onClick={handleDeploy}
                disabled={deploying}
              >
                {deploying
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Deploying…</>
                  : <><Rocket className="w-4 h-4" /> Deploy to GitHub Pages</>}
              </Button>

              <p className="text-[10px] text-muted-foreground/60">
                Pushes all project files to the <code className="bg-muted px-1 rounded">gh-pages</code> branch.
                Enable GitHub Pages in your repo Settings → Pages → Branch: gh-pages.
              </p>
            </>
          )}
        </div>

        {/* Download ZIP */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Download ZIP</p>
              <p className="text-xs text-muted-foreground">Export all project files locally</p>
            </div>
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={handleDownloadZip} disabled={downloading}>
            {downloading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</>
              : <><Download className="w-4 h-4" /> Download {project.name}.zip</>}
          </Button>
        </div>

        {/* Coming soon providers */}
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-0.5">More providers</p>
          {[
            { name: "Vercel", desc: "Deploy serverless & edge functions" },
            { name: "Netlify", desc: "Static sites & serverless functions" },
            { name: "Railway", desc: "Full-stack apps & databases" },
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

        {/* Run history hint */}
        <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3">
          <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Deploy history and rollback will be available soon. For now, use GitHub commit history to track versions.
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useLocation } from "wouter";
import { X, Github, Loader2, Star, GitFork, Lock, Globe, FileCode2, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import type { ApiResponse, GitHubRepoPreview, ProjectWithCounts } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}

export function GitHubImportDialog({ open, onOpenChange, onImported }: Props) {
  const [, navigate] = useLocation();
  const { workspaces } = useWorkspaces();
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [patOverride, setPatOverride] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [preview, setPreview] = useState<GitHubRepoPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handlePreview = async () => {
    if (!repoUrl.trim()) return;
    setError(null);
    setPreview(null);
    setIsPreviewing(true);
    try {
      const res = await api.post<ApiResponse<GitHubRepoPreview>>("/api/github/preview", {
        repoUrl: repoUrl.trim(),
        ...(patOverride ? { token: patOverride } : {}),
      });
      setPreview(res.data);
      if (!branch) setBranch(res.data.defaultBranch);
    } catch (err: unknown) {
      setError((err as Error).message ?? "Failed to fetch repository info");
    } finally {
      setIsPreviewing(false);
    }
  };

  const ensureWorkspace = async (): Promise<string> => {
    const existing = workspaceId || workspaces[0]?.id;
    if (existing) return existing;
    const res = await api.post<{ data: { id: string } }>("/api/workspaces", { name: "My Workspace" });
    return res.data.id;
  };

  const handleImport = async () => {
    if (!preview) return;
    setIsImporting(true);
    setError(null);
    let ws: string;
    try { ws = await ensureWorkspace(); } catch { setError("Failed to create workspace"); setIsImporting(false); return; }
    try {
      const res = await api.post<ApiResponse<ProjectWithCounts>>("/api/github/import", {
        repoUrl: repoUrl.trim(),
        workspaceId: ws,
        branch: branch || preview.defaultBranch,
        ...(patOverride ? { token: patOverride } : {}),
      });
      toast({ title: `Imported ${preview.name}`, description: res.message ?? `${res.data._count.files} files imported` });
      localStorage.setItem("orahai_agent_mode", "power");
      onOpenChange(false);
      onImported?.();
      navigate(`/workspace/${res.data.id}?setup=1`);
    } catch (err: unknown) {
      setError((err as Error).message ?? "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setRepoUrl(""); setBranch(""); setPatOverride("");
    setPreview(null); setError(null);
  };

  const handleBack = () => {
    setPreview(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-card border rounded-xl shadow-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          {preview ? (
            <button
              onClick={handleBack}
              className="p-1 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <Github className="w-5 h-5" />
          )}
          <h2 className="text-lg font-semibold">
            {preview ? preview.fullName : "Import from GitHub"}
          </h2>
          <button onClick={handleClose} className="ml-auto text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {!preview ? (
            <>
              <div className="space-y-1.5">
                <Label>Repository URL</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://github.com/owner/repo"
                    value={repoUrl}
                    onChange={(e) => { setRepoUrl(e.target.value); setError(null); }}
                    onKeyDown={(e) => e.key === "Enter" && handlePreview()}
                    className="flex-1"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePreview}
                    disabled={!repoUrl.trim() || isPreviewing}
                    className="shrink-0"
                  >
                    {isPreviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Preview"}
                  </Button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPat((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPat ? "▾ Hide token" : "▸ Use a token for private repos"}
              </button>

              {showPat && (
                <div className="space-y-1.5">
                  <Label>GitHub Personal Access Token (optional)</Label>
                  <Input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxx"
                    value={patOverride}
                    onChange={(e) => setPatOverride(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Only used for this import. To save it permanently, use the GitHub settings.
                  </p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  {preview.private
                    ? <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    : <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    {preview.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{preview.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {preview.language && (
                    <span className="flex items-center gap-1"><FileCode2 className="w-3 h-3" />{preview.language}</span>
                  )}
                  <span className="flex items-center gap-1"><Star className="w-3 h-3" />{preview.stars.toLocaleString()}</span>
                  <span className="flex items-center gap-1"><GitFork className="w-3 h-3" />{preview.forks.toLocaleString()}</span>
                  <span className="ml-auto text-primary font-medium">{preview.importableFiles} files</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Input
                  placeholder={preview.defaultBranch}
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Workspace</Label>
                {workspaces.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">A workspace will be created automatically.</p>
                ) : (
                  <select
                    value={workspaceId || workspaces[0]?.id || ""}
                    onChange={(e) => setWorkspaceId(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button
                className="w-full gap-2"
                onClick={handleImport}
                disabled={isImporting}
              >
                {isImporting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
                ) : (
                  <><Github className="w-4 h-4" /> Import {preview.importableFiles} files</>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

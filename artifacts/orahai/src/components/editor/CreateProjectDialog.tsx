import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, X, Github, Lock, Globe, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { PROJECT_TEMPLATES } from "@/types";
import type { ApiResponse, Project } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

function slugifyRepoName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 100) || "my-project";
}

export function CreateProjectDialog({ open, onOpenChange, onCreated }: Props) {
  const [, navigate] = useLocation();
  const { workspaces } = useWorkspaces();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("nodejs");
  const [workspaceId, setWorkspaceId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Inline workspace creation
  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [isCreatingWs, setIsCreatingWs] = useState(false);

  // GitHub push option
  const [pushToGitHub, setPushToGitHub] = useState(false);
  const [hasGitHubToken, setHasGitHubToken] = useState<boolean | null>(null);
  const [repoName, setRepoName] = useState("");
  const [repoPrivate, setRepoPrivate] = useState(false);
  const [githubStep, setGithubStep] = useState<"idle" | "creating-repo" | "pushing">( "idle");

  // Sync repo name when project name changes
  useEffect(() => { setRepoName(slugifyRepoName(name)); }, [name]);

  // Check if user has a GitHub token when they expand the GitHub option
  useEffect(() => {
    if (!pushToGitHub || hasGitHubToken !== null) return;
    api.get<ApiResponse<{ hasToken: boolean }>>("/api/github/token")
      .then(r => setHasGitHubToken(r.data.hasToken))
      .catch(() => setHasGitHubToken(false));
  }, [pushToGitHub]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !workspaceId) return;
    setIsLoading(true);
    setGithubStep("idle");
    try {
      // 1. Create the project (also seeds starter files)
      const res = await api.post<ApiResponse<Project>>("/api/projects", {
        name: name.trim(), language, workspaceId,
      });
      const project = res.data;

      // 2. Optionally create GitHub repo & push
      if (pushToGitHub && hasGitHubToken) {
        setGithubStep("creating-repo");
        try {
          await api.post(`/api/github/projects/${project.id}/create-and-push`, {
            repoName: repoName.trim() || slugifyRepoName(name),
            private: repoPrivate,
            description: `Created with OrahAI`,
          });
          toast({ title: "Project created & pushed to GitHub!" });
        } catch (ghErr: unknown) {
          // Non-fatal: project was created, GitHub push failed
          toast({
            title: "Project created — GitHub push failed",
            description: (ghErr as Error).message,
            variant: "destructive",
          });
        }
        setGithubStep("idle");
      } else {
        toast({ title: "Project created!" });
      }

      onOpenChange(false);
      onCreated?.();
      navigate(`/workspace/${project.id}`);
    } catch (err: unknown) {
      toast({ title: (err as Error).message ?? "Failed to create project", variant: "destructive" });
    } finally {
      setIsLoading(false);
      setGithubStep("idle");
    }
  };

  const stepLabel = githubStep === "creating-repo"
    ? "Creating repo…"
    : githubStep === "pushing"
      ? "Pushing files…"
      : isLoading
        ? "Creating…"
        : "Create project";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-card border rounded-xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <button onClick={() => onOpenChange(false)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-semibold mb-4">New project</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project name */}
          <div className="space-y-1.5">
            <Label htmlFor="pname">Project name</Label>
            <Input
              id="pname"
              placeholder="My awesome project"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          {/* Template */}
          <div className="space-y-1.5">
            <Label>Language / Template</Label>
            <div className="grid grid-cols-2 gap-2">
              {PROJECT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setLanguage(t.language)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left transition-colors ${
                    language === t.language
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <span className="text-base">{t.icon}</span>
                  <span className="font-medium">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Workspace */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="workspace">Workspace</Label>
              <button
                type="button"
                onClick={() => { setShowNewWs(v => !v); setNewWsName(""); }}
                className="text-xs text-primary hover:underline"
              >
                + New workspace
              </button>
            </div>

            {/* Inline new-workspace form */}
            {showNewWs && (
              <div className="flex gap-2">
                <Input
                  placeholder="Workspace name"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  autoFocus
                  className="h-8 text-sm"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!newWsName.trim() || isCreatingWs) return;
                      setIsCreatingWs(true);
                      try {
                        const res = await api.post<ApiResponse<{ id: string; name: string }>>("/api/workspaces", { name: newWsName.trim() });
                        setWorkspaceId(res.data.id);
                        setShowNewWs(false);
                        setNewWsName("");
                      } catch { /* ignore */ } finally { setIsCreatingWs(false); }
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-3 text-xs shrink-0"
                  disabled={!newWsName.trim() || isCreatingWs}
                  onClick={async () => {
                    if (!newWsName.trim() || isCreatingWs) return;
                    setIsCreatingWs(true);
                    try {
                      const res = await api.post<ApiResponse<{ id: string; name: string }>>("/api/workspaces", { name: newWsName.trim() });
                      setWorkspaceId(res.data.id);
                      setShowNewWs(false);
                      setNewWsName("");
                    } catch { /* ignore */ } finally { setIsCreatingWs(false); }
                  }}
                >
                  {isCreatingWs ? <Loader2 className="w-3 h-3 animate-spin" /> : "Create"}
                </Button>
              </div>
            )}

            {workspaces.length === 0 && !showNewWs ? (
              <p className="text-sm text-muted-foreground">
                No workspaces yet — click <span className="text-primary">+ New workspace</span> above to create one.
              </p>
            ) : (
              <select
                id="workspace"
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                required
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select workspace…</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* GitHub push toggle */}
          <div className="rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setPushToGitHub(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Github className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">Push to GitHub</span>
                <span className="text-xs text-muted-foreground">optional</span>
              </div>
              {pushToGitHub
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />
              }
            </button>

            {pushToGitHub && (
              <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border bg-muted/20">
                {hasGitHubToken === false && (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-500">
                    No GitHub token found. Add one in{" "}
                    <a href="/settings/profile" className="underline font-medium" onClick={() => onOpenChange(false)}>
                      Settings → GitHub
                    </a>{" "}
                    first.
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Repository name</Label>
                  <Input
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))}
                    placeholder="my-project"
                    className="h-8 text-sm font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Visibility</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRepoPrivate(false)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md border text-xs transition-colors ${
                        !repoPrivate ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepoPrivate(true)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md border text-xs transition-colors ${
                        repoPrivate ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Private
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !workspaceId || (pushToGitHub && hasGitHubToken === false)}
          >
            {isLoading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{stepLabel}</>
              : pushToGitHub && hasGitHubToken
                ? <><Github className="w-4 h-4 mr-2" />Create & push to GitHub</>
                : "Create project"
            }
          </Button>
        </form>
      </div>
    </div>
  );
}

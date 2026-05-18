import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, X, Github, Lock, Globe, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import type { ApiResponse, Project } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

function slugifyRepoName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 100) || "my-project";
}

function inferLanguage(name: string): string {
  const n = name.toLowerCase();
  if (/python|script|data|ml|machine.?learn|jupyter|pandas|flask|django|fastapi|ai.?model|analysis/.test(n)) return "python";
  if (/typescript|\.ts\b/.test(n)) return "typescript";
  if (/html|css|landing.?page|portfolio|website|static|webpage|blog/.test(n)) return "html";
  if (/node|express|api\b|server|backend|rest/.test(n)) return "nodejs";
  if (/react|vue|next|nuxt|svelte|dashboard|app\b|frontend|ui\b|spa/.test(n)) return "nodejs";
  return "nodejs";
}

function languageLabel(lang: string): string {
  const map: Record<string, string> = {
    nodejs: "Node.js", typescript: "TypeScript", python: "Python", html: "HTML/CSS/JS",
  };
  return map[lang] ?? "Node.js";
}

export function CreateProjectDialog({ open, onOpenChange, onCreated }: Props) {
  const [, navigate] = useLocation();
  const { workspaces } = useWorkspaces();
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [isCreatingWs, setIsCreatingWs] = useState(false);

  const [pushToGitHub, setPushToGitHub] = useState(false);
  const [hasGitHubToken, setHasGitHubToken] = useState<boolean | null>(null);
  const [repoName, setRepoName] = useState("");
  const [repoPrivate, setRepoPrivate] = useState(false);
  const [githubStep, setGithubStep] = useState<"idle" | "creating-repo" | "pushing">("idle");

  const detectedLang = inferLanguage(name);

  useEffect(() => { setRepoName(slugifyRepoName(name)); }, [name]);

  useEffect(() => {
    if (!pushToGitHub || hasGitHubToken !== null) return;
    api.get<ApiResponse<{ hasToken: boolean }>>("/api/github/token")
      .then(r => setHasGitHubToken(r.data.hasToken))
      .catch(() => setHasGitHubToken(false));
  }, [pushToGitHub]);

  // Auto-select first workspace
  useEffect(() => {
    if (!workspaceId && workspaces.length > 0) setWorkspaceId(workspaces[0].id);
  }, [workspaces]);

  if (!open) return null;

  const handleCreateWorkspace = async () => {
    if (!newWsName.trim() || isCreatingWs) return;
    setIsCreatingWs(true);
    try {
      const res = await api.post<ApiResponse<{ id: string; name: string }>>("/api/workspaces", { name: newWsName.trim() });
      setWorkspaceId(res.data.id);
      setShowNewWs(false);
      setNewWsName("");
    } catch { } finally { setIsCreatingWs(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !workspaceId) return;
    setIsLoading(true);
    setGithubStep("idle");
    try {
      const res = await api.post<ApiResponse<Project>>("/api/projects", {
        name: name.trim(),
        language: detectedLang,
        workspaceId,
      });
      const project = res.data;

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

        <h2 className="text-lg font-semibold mb-1">New project</h2>
        <p className="text-sm text-muted-foreground mb-5">Name your project — AI will handle the rest.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project name */}
          <div className="space-y-1.5">
            <Label htmlFor="pname">Project name</Label>
            <Input
              id="pname"
              placeholder="e.g. Weather app, Portfolio site, REST API…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
            {/* AI language hint */}
            {name.trim().length > 2 && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Sparkles className="w-3 h-3 text-primary" />
                <span>AI will set up a <strong className="text-foreground">{languageLabel(detectedLang)}</strong> project for you</span>
              </div>
            )}
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

            {showNewWs && (
              <div className="flex gap-2">
                <Input
                  placeholder="Workspace name"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  autoFocus
                  className="h-8 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateWorkspace(); } }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-3 text-xs shrink-0"
                  disabled={!newWsName.trim() || isCreatingWs}
                  onClick={handleCreateWorkspace}
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
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {pushToGitHub && (
              <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border bg-muted/20">
                {hasGitHubToken === false && (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-500">
                    No GitHub token found — connect GitHub from the workspace sidebar first.
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
                      <Globe className="w-3.5 h-3.5" />Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepoPrivate(true)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md border text-xs transition-colors ${
                        repoPrivate ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />Private
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
                : "Create project"}
          </Button>
        </form>
      </div>
    </div>
  );
}

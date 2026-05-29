import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Loader2, X, Github, Lock, Globe, ChevronDown, ChevronUp, Sparkles, ArrowRight } from "lucide-react";
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

function inferLanguage(text: string): string {
  const n = text.toLowerCase();
  // Blockchain / Web3 — highest specificity first
  if (/\bvyper\b/.test(n)) return "vyper";
  if (/\bmove\b.*(aptos|sui|lang)|\b(aptos|sui)\b.*\bmove\b|\bmove\b language/.test(n)) return "move";
  if (/\bscrypt\b|scrypt.?ts|@scrypt.?inc|scrypt.?contract/.test(n)) return "scrypt";
  if (/bitcoin.?sv|\bbsv\b|teranode|bsv.?sdk|satoshi.?vision|metanet|1sat.?ordinal|bsv.?ordinal/.test(n)) return "bsv";
  if (/\bsolidity\b|smart.?contract|erc.?20|erc.?721|erc.?1155|\bnft.*(contract|mint|deploy)|\bdefi\b|hardhat|foundry|openzeppelin|msg\.sender/.test(n)) return "solidity";
  if (/\bweb3\b|dapp|decentrali[zs]ed.?app|ethers\.js|wagmi|viem\b|metamask|wallet.?connect|rainbow.?kit/.test(n)) return "web3";
  if (/\bsolana\b|\banchor\b.*(program|rust|framework)|spl.?token/.test(n)) return "rust";
  if (/\bethereum\b|\bevm\b|\bblockchain\b|defi|yield.?farm|liquidity|amm\b|uniswap|aave\b/.test(n)) return "solidity";
  // Other languages
  if (/\brust\b|cargo\b|actix|axum|tokio/.test(n)) return "rust";
  if (/\bgo\b|golang|gin\b|goroutine|go\.mod/.test(n)) return "go";
  if (/\bjava\b|spring\b|maven|gradle|jvm/.test(n)) return "java";
  if (/\bkotlin\b|ktor\b/.test(n)) return "kotlin";
  if (/\bswift\b|vapor\b|swiftui/.test(n)) return "swift";
  if (/\bruby\b|rails\b|sinatra\b|gemfile/.test(n)) return "ruby";
  if (/\bphp\b|laravel|symfony|wordpress/.test(n)) return "php";
  if (/\bc\+\+\b|cpp\b|cmake\b/.test(n)) return "cpp";
  if (/\bscala\b|akka\b/.test(n)) return "scala";
  if (/\bflutter\b|\bdart\b/.test(n)) return "dart";
  if (/\belixir\b|phoenix\b/.test(n)) return "elixir";
  if (/\bhaskell\b|cabal\b/.test(n)) return "haskell";
  if (/\blua\b|love2d/.test(n)) return "lua";
  if (/\bperl\b/.test(n)) return "perl";
  if (/\bbash\b|shell.?script|\.sh\b/.test(n)) return "bash";
  if (/\br\b|rstudio|tidyverse|shiny\b|ggplot/.test(n)) return "r";
  if (/\bc#\b|csharp|\.net\b|asp\.net|dotnet/.test(n)) return "csharp";
  if (/python|pandas|flask|django|fastapi|machine.?learn|data.?sci|jupyter|numpy|scipy/.test(n)) return "python";
  if (/\btypescript\b|\.ts\b/.test(n)) return "typescript";
  if (/\bapi\b|backend|server|express|node\.?js|rest\b|graphql|socket|websocket|database|mongo|postgres|mysql|sqlite|\bauth\b|login|dashboard|tracker|manager|monitor|\bapp\b/.test(n)) return "nodejs";
  if (/\bhtml\b|\bcss\b|landing.?page|portfolio.?site|portfolio.?web|portfolio.?page|\bwebsite\b|static.?site|\bblog\b/.test(n)) return "html";
  if (/expo|react.?native|\bmobile\b|ios\b|android\b/.test(n)) return "typescript";
  return "nodejs";
}

const STOP_WORDS = new Set([
  "i", "want", "to", "build", "create", "make", "a", "an", "the",
  "with", "using", "for", "and", "that", "which", "is", "of", "in",
  "on", "at", "by", "from", "my", "me", "can", "you", "please",
  "like", "would", "id", "app", "application",
]);

function extractProjectName(description: string): string {
  const cleaned = description
    .replace(/^(i('d| would)? (want|like) to (build |create |make )?|build |create |make |please |can you )+/i, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned
    .split(" ")
    .filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(0, 4);

  if (words.length === 0) return "New Project";
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

const PLACEHOLDERS = [
  "A weather app that shows 7-day forecasts…",
  "A portfolio website with dark mode…",
  "A REST API for a blog with comments…",
  "A todo list with drag and drop…",
  "A real-time chat app…",
  "A dashboard for sales metrics…",
];

export function CreateProjectDialog({ open, onOpenChange, onCreated }: Props) {
  const [, navigate] = useLocation();
  const { workspaces } = useWorkspaces();
  const [description, setDescription] = useState("");
  const [projectName, setProjectName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [isCreatingWs, setIsCreatingWs] = useState(false);

  const [pushToGitHub, setPushToGitHub] = useState(false);
  const [hasGitHubToken, setHasGitHubToken] = useState<boolean | null>(null);
  const [repoName, setRepoName] = useState("");
  const [repoPrivate, setRepoPrivate] = useState(false);

  // Auto-generate project name from description (unless user has manually edited it)
  useEffect(() => {
    if (!nameEdited && description.trim().length > 3) {
      setProjectName(extractProjectName(description));
    }
    if (!nameEdited && description.trim().length === 0) {
      setProjectName("");
    }
  }, [description, nameEdited]);

  // Sync repo name to project name
  useEffect(() => { setRepoName(slugifyRepoName(projectName || description)); }, [projectName, description]);

  // Check GitHub token when expanded
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

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setDescription(""); setProjectName(""); setNameEdited(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const detectedLang = inferLanguage(description || projectName);
  const langLabel: Record<string, string> = {
    nodejs: "Node.js", typescript: "TypeScript", python: "Python", html: "HTML/CSS/JS",
    go: "Go", rust: "Rust", java: "Java", kotlin: "Kotlin", swift: "Swift",
    ruby: "Ruby", php: "PHP", cpp: "C++", csharp: "C#", c: "C", scala: "Scala",
    dart: "Dart", elixir: "Elixir", haskell: "Haskell", lua: "Lua", perl: "Perl",
    bash: "Bash", r: "R",
    solidity: "Solidity", vyper: "Vyper", move: "Move", web3: "Web3/dApp", bsv: "Bitcoin SV", scrypt: "sCrypt",
  };

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
    const finalName = projectName.trim() || extractProjectName(description) || "New Project";
    const finalDesc = description.trim();
    if (!finalDesc || !workspaceId) return;

    setIsLoading(true);
    try {
      const res = await api.post<ApiResponse<Project>>("/api/projects", {
        name: finalName,
        language: detectedLang,
        workspaceId,
      });
      const project = res.data;

      if (pushToGitHub && hasGitHubToken) {
        try {
          await api.post(`/api/github/projects/${project.id}/create-and-push`, {
            repoName: repoName.trim() || slugifyRepoName(finalName),
            private: repoPrivate,
            description: finalDesc,
          });
          toast({ title: "Project created & pushed to GitHub!" });
        } catch (ghErr: unknown) {
          toast({ title: "Project created — GitHub push failed", description: (ghErr as Error).message, variant: "destructive" });
        }
      }

      onOpenChange(false);
      onCreated?.();
      // Navigate to workspace with the description as the initial AI prompt
      navigate(`/workspace/${project.id}?prompt=${encodeURIComponent(finalDesc)}`);
    } catch (err: unknown) {
      toast({ title: (err as Error).message ?? "Failed to create project", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-card border rounded-xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <button onClick={() => onOpenChange(false)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">What do you want to build?</h2>
            <p className="text-xs text-muted-foreground">Describe your idea — AI will set everything up.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Description textarea */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={placeholder}
              rows={3}
              required
              className="w-full resize-none rounded-lg border border-input bg-muted/30 px-3.5 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring leading-relaxed"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(e as any);
              }}
            />
          </div>

          {/* Auto-generated project name */}
          {description.trim().length > 3 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Project name</Label>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-primary" />
                  {langLabel[detectedLang]} · auto-detected
                </span>
              </div>
              <Input
                value={projectName}
                onChange={(e) => { setProjectName(e.target.value); setNameEdited(true); }}
                placeholder="Project name…"
                className="h-8 text-sm"
              />
            </div>
          )}

          {/* Workspace */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="workspace" className="text-xs">Workspace</Label>
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
                <Button type="button" size="sm" className="h-8 px-3 text-xs shrink-0"
                  disabled={!newWsName.trim() || isCreatingWs} onClick={handleCreateWorkspace}>
                  {isCreatingWs ? <Loader2 className="w-3 h-3 animate-spin" /> : "Create"}
                </Button>
              </div>
            )}

            {workspaces.length === 0 && !showNewWs ? (
              <p className="text-sm text-muted-foreground">
                No workspaces yet — click <span className="text-primary">+ New workspace</span> to create one.
              </p>
            ) : (
              <select
                id="workspace"
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                required
                className="w-full h-8 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            <button type="button" onClick={() => setPushToGitHub(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                <Github className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-medium text-sm">Push to GitHub</span>
                <span className="text-xs text-muted-foreground">optional</span>
              </div>
              {pushToGitHub ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
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
                  <Input value={repoName}
                    onChange={(e) => setRepoName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))}
                    placeholder="my-project" className="h-8 text-sm font-mono" />
                </div>
                <div className="flex gap-2">
                  {[false, true].map((priv) => (
                    <button key={String(priv)} type="button" onClick={() => setRepoPrivate(priv)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md border text-xs transition-colors ${
                        repoPrivate === priv ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                      }`}>
                      {priv ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                      {priv ? "Private" : "Public"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={isLoading || !description.trim() || !workspaceId || (pushToGitHub && hasGitHubToken === false)}
          >
            {isLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Creating…</>
              : pushToGitHub && hasGitHubToken
                ? <><Github className="w-4 h-4" />Create & push to GitHub</>
                : <><ArrowRight className="w-4 h-4" />Start building</>}
          </Button>

          <p className="text-center text-[11px] text-muted-foreground">
            Press <kbd className="bg-muted px-1 py-0.5 rounded text-[10px] font-mono">⌘ Enter</kbd> to create
          </p>
        </form>
      </div>
    </div>
  );
}

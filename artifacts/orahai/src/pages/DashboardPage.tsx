import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Plus, Search, Code2, Globe, Clock, ArrowRight, FolderOpen,
  Download, MoreVertical, Trash2, ExternalLink, Loader2,
  Sparkles, Send, Github, Lock, CheckCircle2, ChevronDown, ChevronUp, X, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Navbar } from "@/components/layout/Navbar";
import { ImportProjectDialog } from "@/components/editor/ImportProjectDialog";
import { useProjects } from "@/hooks/useProjects";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow, cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { MODEL_GROUPS, DEFAULT_MODEL, getModelShortName, makeOllamaModelDef, makeOllamaRemoteModelDef, type ModelDef } from "@/lib/models";
import type { ProjectWithCounts, ApiResponse, Project } from "@/types";

const LANGUAGE_ICONS: Record<string, string> = {
  nodejs: "🟩", typescript: "🔷", python: "🐍", html: "🌐",
  go: "🐹", rust: "🦀", java: "☕", kotlin: "🎯", swift: "🍎",
  ruby: "💎", php: "🐘", cpp: "⚙️", c: "🔵", csharp: "🟣",
  scala: "🔺", r: "📊", dart: "🎱", elixir: "💧", haskell: "λ",
  bash: "🖥️", lua: "🌙", perl: "🐪",
  solidity: "⟠", vyper: "🐍⟠", move: "◎", web3: "🔗",
  bsv: "₿", scrypt: "🔐₿",
};

const SUGGESTIONS = [
  "A weather app with 7-day forecast",
  "Portfolio website with dark mode",
  "REST API for a blog",
  "Real-time chat with rooms",
  "Todo list with drag and drop",
  "Dashboard for sales analytics",
];

const TEMPLATES: { emoji: string; label: string; tag: string; prompt: string }[] = [
  {
    emoji: "⚛️", label: "React App", tag: "Vite + TypeScript",
    prompt: "Build a complete React app with Vite, TypeScript, Tailwind CSS, and React Router. Include a home page, about page, and reusable components.",
  },
  {
    emoji: "🚀", label: "Next.js App", tag: "Full-stack",
    prompt: "Build a Next.js 14 app with TypeScript, Tailwind CSS, server components, and API routes. Include a home page, navigation, and a data fetching example.",
  },
  {
    emoji: "⚡", label: "Express API", tag: "Node.js + REST",
    prompt: "Build a production-ready Express REST API with TypeScript, JWT authentication, PostgreSQL, input validation, error handling, and CRUD endpoints.",
  },
  {
    emoji: "🐍", label: "FastAPI", tag: "Python + OpenAPI",
    prompt: "Build a Python FastAPI backend with Pydantic models, SQLAlchemy ORM, JWT auth, automatic OpenAPI docs, and CRUD endpoints for a resource.",
  },
  {
    emoji: "⟠", label: "Smart Contract", tag: "Solidity + Hardhat",
    prompt: "Build a Solidity smart contract with Hardhat, including an ERC-20 token, deployment scripts, and tests. Add a README with usage instructions.",
  },
  {
    emoji: "🌐", label: "Portfolio Site", tag: "HTML + CSS",
    prompt: "Build a beautiful developer portfolio website with HTML, CSS, and JavaScript. Include hero, about, skills, projects, and contact sections with animations.",
  },
];

const STOP_WORDS = new Set([
  "i","want","to","build","create","make","a","an","the","with","using",
  "for","and","that","which","is","of","in","on","at","by","from","my",
  "me","can","you","please","like","would","id","app","application",
]);

function inferLanguage(text: string): string {
  const n = text.toLowerCase();
  // ── Blockchain / Web3 — checked first (highest specificity) ──────────────
  if (/\bvyper\b/.test(n)) return "vyper";
  if (/\bmove\b.*(aptos|sui|lang)|\b(aptos|sui)\b.*\bmove\b|\bmove\b language/.test(n)) return "move";
  // ── Bitcoin SV — checked before generic blockchain ──────────────────────
  if (/\bscrypt\b|scrypt.?ts|@scrypt.?inc|scrypt.?contract/.test(n)) return "scrypt";
  if (/bitcoin.?sv|\bbsv\b|teranode|whatsonchain|whats.?on.?chain|bsv.?sdk|@bsv\/|op_return|op_push|p2pkh|p2pk|bitcoin.?script|satoshi.?vision|metanet|1sat.?ordinal|bsv.?ordinal|stn\b|bsv.?testnet|bump\b|beef\b.*tx|spv\b.*bitcoin|bitcoin.*spv/.test(n)) return "bsv";
  if (/\bsolidity\b|smart.?contract|erc.?20|erc.?721|erc.?1155|erc.?4626|\bnft.*(contract|mint|deploy)|\bdefi\b|\bdao\b|\btoken.?contract|hardhat|foundry|truffle|openzeppelin|abi\.encode|msg\.sender|\bwei\b|\bgwei\b|\bsolc\b/.test(n)) return "solidity";
  if (/\bweb3\b|dapp|decentrali[zs]ed.?app|ethers\.js|wagmi|viem\b|metamask|wallet.?connect|rainbow.?kit/.test(n)) return "web3";
  if (/\bsolana\b|\banchor\b.*(program|rust|framework)|spl.?token|borsh\b/.test(n)) return "rust";
  if (/\bethereum\b|\bevm\b|\bpolygon\b|\bavalanch|\bbnb.?chain|\barbitrum|\boptimism|\bbase.?chain|\bzksync|\bstarknet|\bblockchain\b|\bdeploy.*(contract|token)|mint\b.*\bnft|\bnft\b|\btoken\b.*(deploy|create|build|launch)|defi|yield.?farm|liquidity|amm\b|uniswap|aave\b|compound\b/.test(n)) return "solidity";
  // ── Other languages ────────────────────────────────────────────────────────
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
  if (/\bc\b(?!#|\+\+)|ansi.?c\b/.test(n)) return "c";
  if (/python|pandas|flask|django|fastapi|machine.?learn|data.?sci|jupyter|numpy|scipy/.test(n)) return "python";
  if (/\btypescript\b|\.ts\b/.test(n)) return "typescript";
  if (/\bapi\b|backend|server|express|node\.?js|rest\b|graphql|socket|websocket|database|mongo|postgres|mysql|sqlite|\bauth\b|login|dashboard|tracker|manager|monitor|\bapp\b/.test(n)) return "nodejs";
  if (/\bhtml\b|\bcss\b|landing.?page|portfolio.?site|portfolio.?web|portfolio.?page|\bwebsite\b|static.?site|\bblog\b/.test(n)) return "html";
  return "nodejs";
}

function extractProjectName(description: string): string {
  const cleaned = description
    .replace(/^(i('d| would)? (want|like) to (build |create |make )?|build |create |make |please |can you )+/i, "")
    .replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ")
    .filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(0, 4);
  if (words.length === 0) return "New Project";
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function slugifyRepo(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 100) || "my-project";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const { projects, isLoading, mutate } = useProjects({ search });
  const { workspaces, isLoading: isWorkspacesLoading } = useWorkspaces();

  const [prompt, setPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createStep, setCreateStep] = useState<"idle" | "project" | "github">("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // AI model selector
  const [aiModel, setAiModel] = useState<string>(() => localStorage.getItem("orahai_ai_model") ?? DEFAULT_MODEL);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [liveOllamaModels, setLiveOllamaModels] = useState<ModelDef[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const modelInitDone = useRef(false);

  // Fetch live Ollama models when picker opens
  useEffect(() => {
    if (!modelPickerOpen) return;
    setOllamaLoading(true);
    api.get<{ models: Array<{ name: string }>; ollamaAvailable: boolean }>("/api/ai/models?endpoint=server")
      .then(res => {
        setLiveOllamaModels(res.ollamaAvailable ? (res.models ?? []).map(m => makeOllamaModelDef(m.name)) : []);
      })
      .catch(() => setLiveOllamaModels([]))
      .finally(() => setOllamaLoading(false));
  }, [modelPickerOpen]);

  // On first load: auto-select the best local Ollama model if no saved preference
  useEffect(() => {
    if (modelInitDone.current || localStorage.getItem("orahai_ai_model")) { modelInitDone.current = true; return; }
    modelInitDone.current = true;
    api.get<{ models: Array<{ name: string }>; ollamaAvailable: boolean }>("/api/ai/models?endpoint=server")
      .then(res => {
        if (!res.ollamaAvailable || !res.models?.length) return;
        const preferred = ["qwen2.5-coder", "deepseek-coder", "codellama", "llama3", "llama", "mistral", "gemma", "phi"];
        const names = res.models.map(m => m.name);
        let pick = names[0];
        for (const pref of preferred) { const f = names.find(n => n.startsWith(pref)); if (f) { pick = f; break; } }
        if (pick) { const id = `ollama:${pick}`; setAiModel(id); localStorage.setItem("orahai_ai_model", id); }
      })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickModel = (id: string) => { setAiModel(id); localStorage.setItem("orahai_ai_model", id); setModelPickerOpen(false); };
  const isOllamaModel = aiModel.startsWith("ollama:") || aiModel.startsWith("ollama-remote:");
  const isPaidModel = (m: string) => /^(openai|anthropic|gemini|xai|perplexity|deepseek):/.test(m);

  // GitHub push option
  const [pushToGitHub, setPushToGitHub] = useState(false);
  const [ghRepoName, setGhRepoName] = useState("");
  const [ghRepoPrivate, setGhRepoPrivate] = useState(false);
  const [hasGithubToken, setHasGithubToken] = useState<boolean | null>(null);

  useEffect(() => {
    api.get<{ data: { hasToken: boolean } }>("/api/github/token")
      .then(r => setHasGithubToken(r.data.hasToken))
      .catch(() => setHasGithubToken(false));
  }, []);

  // Keep repo name in sync with project name derived from prompt
  useEffect(() => {
    if (pushToGitHub && prompt.trim()) {
      setGhRepoName(slugifyRepo(extractProjectName(prompt.trim())));
    }
  }, [prompt, pushToGitHub]);

  const handleBuild = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isCreating) return;

    // Wait for workspace data to load before acting
    if (isWorkspacesLoading) return;

    let wsId = workspaces[0]?.id;
    if (!wsId) {
      // Auto-create a personal workspace for the user
      try {
        const wsName = user?.name ? `${user.name.split(" ")[0]}'s Workspace` : "My Workspace";
        const wsRes = await api.post<{ data: { id: string } }>("/api/workspaces", { name: wsName });
        wsId = wsRes.data.id;
      } catch {
        toast({ title: "Could not create a workspace. Please try again.", variant: "destructive" });
        return;
      }
    }

    setIsCreating(true);
    setCreateStep("project");
    try {
      const res = await api.post<ApiResponse<Project>>("/api/projects", {
        name: extractProjectName(trimmed),
        language: inferLanguage(trimmed),
        workspaceId: wsId,
      });
      mutate();

      if (pushToGitHub && ghRepoName.trim()) {
        setCreateStep("github");
        try {
          await api.post(`/api/github/projects/${res.data.id}/create-and-push`, {
            repoName: ghRepoName.trim(),
            private: ghRepoPrivate,
            description: `Created with OrahAI`,
          });
          toast({ title: `Created & pushed to GitHub — ${ghRepoName.trim()}` });
        } catch (ghErr: unknown) {
          const e = ghErr as { response?: { data?: { message?: string } } };
          toast({
            title: `Project created, but GitHub push failed: ${e.response?.data?.message ?? "unknown error"}`,
            variant: "destructive",
          });
        }
      }

      navigate(`/workspace/${res.data.id}?prompt=${encodeURIComponent(trimmed)}`);
    } catch (err: unknown) {
      toast({ title: (err as Error).message ?? "Failed to create project", variant: "destructive" });
      setIsCreating(false);
      setCreateStep("idle");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleBuild(prompt);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [prompt]);

  const firstName = user?.name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />

      <main className="flex-1 flex flex-col">
        {/* ── AI Hero ─────────────────────────────────────────── */}
        <div className="w-full max-w-2xl mx-auto px-4 pt-12 pb-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-1.5">
              Hi {firstName} 👋
            </h1>
            <p className="text-muted-foreground text-sm">
              What do you want to build today?
            </p>
          </div>

          {/* Main chat input */}
          <div className="rounded-xl border border-border bg-card shadow-lg focus-within:border-primary/50 focus-within:shadow-primary/10 focus-within:shadow-xl transition-all">
            <div className="flex items-start gap-3 px-4 pt-4 pb-3">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              </div>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what you want to build… (e.g. A weather app with 7-day forecast)"
                rows={1}
                disabled={isCreating || isWorkspacesLoading}
                className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none leading-relaxed min-h-[24px] disabled:opacity-60"
              />
              <button
                onClick={() => handleBuild(prompt)}
                disabled={!prompt.trim() || isCreating || isWorkspacesLoading}
                className="shrink-0 w-8 h-8 rounded-lg bg-primary flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors mt-0.5"
              >
                {isCreating
                  ? <Loader2 className="w-3.5 h-3.5 text-primary-foreground animate-spin" />
                  : <Send className="w-3.5 h-3.5 text-primary-foreground" />}
              </button>
            </div>

            {/* Suggestion chips */}
            {!prompt && !pushToGitHub && (
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                {SUGGESTIONS.slice(0, 4).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setPrompt(s); textareaRef.current?.focus(); }}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors bg-muted/30"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* ── AI model selector ──────────────────────────── */}
            <div className="border-t border-border/60 px-4 py-2 flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0">AI model</span>
              <div className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setModelPickerOpen(v => !v)}
                  disabled={isCreating}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors disabled:opacity-40",
                    modelPickerOpen
                      ? "border-primary/40 text-primary bg-primary/10"
                      : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border",
                  )}
                >
                  {isOllamaModel && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
                  <span className="max-w-[130px] truncate">{getModelShortName(aiModel)}</span>
                  {isPaidModel(aiModel) && <span className="text-amber-400 text-[9px] font-bold">Pro</span>}
                  <ChevronDown className={cn("w-3 h-3 transition-transform shrink-0", modelPickerOpen && "rotate-180")} />
                </button>

                {modelPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setModelPickerOpen(false)} />
                    <div className="absolute bottom-full right-0 mb-1.5 w-72 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                      <div className="max-h-72 overflow-y-auto">

                        {/* OrahAI Free Local — live Ollama models */}
                        {(liveOllamaModels.length > 0 || ollamaLoading) && (
                          <div>
                            <div className="sticky top-0 flex items-center justify-between px-3 py-1.5 bg-green-950/40 backdrop-blur border-b border-green-900/30">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
                                <span className="text-[9px] font-bold text-green-400 uppercase tracking-wider">OrahAI — Free, Local</span>
                              </div>
                              {ollamaLoading
                                ? <span className="text-[8px] text-muted-foreground">Loading…</span>
                                : <span className="text-[8px] text-green-500/70">no API key needed</span>
                              }
                            </div>
                            {liveOllamaModels.map(m => (
                              <button key={m.id} onClick={() => pickModel(m.id)}
                                className={cn("w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left", aiModel === m.id && "text-primary bg-primary/5")}>
                                <span className="flex-1 font-mono font-medium truncate">{m.name}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-medium shrink-0">Free</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Static groups: auto + groq + paid (if unlocked) */}
                        {MODEL_GROUPS.filter(g => {
                          if (g.provider === "ollama" || g.provider === "ollama-remote") return false;
                          const PAID = ["openai","anthropic","gemini","xai","perplexity","deepseek"];
                          if (PAID.includes(g.provider)) {
                            try { const enabled = new Set(JSON.parse(localStorage.getItem("orahai_enabled_paid_providers") ?? "[]") as string[]); return enabled.has(g.provider); }
                            catch { return false; }
                          }
                          return true;
                        }).map(group => {
                          const isPaid = ["openai","anthropic","gemini","xai","perplexity","deepseek"].includes(group.provider);
                          return (
                            <div key={group.label}>
                              <div className="sticky top-0 flex items-center justify-between px-3 py-1.5 bg-muted/60 backdrop-blur border-b border-border/40">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                                  {isPaid && <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">Pro</span>}
                                </div>
                                {!isPaid && group.note && (
                                  <span className="text-[8px] text-muted-foreground/70 truncate max-w-[120px]">{group.note}</span>
                                )}
                              </div>
                              {group.models.map(m => (
                                <button key={m.id} onClick={() => pickModel(m.id)}
                                  className={cn("w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left", aiModel === m.id && "text-primary bg-primary/5")}>
                                  <span className="flex-1 font-medium truncate">{m.name}</span>
                                  {m.badge && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground border border-border/40 font-medium shrink-0">{m.badge}</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </div>

                      <div className="border-t border-border/40 px-3 py-2">
                        <a href="/ai-models" onClick={() => setModelPickerOpen(false)}
                          className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors">
                          <Bot className="w-3 h-3" />
                          Manage models & pull new ones →
                        </a>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── GitHub push option ─────────────────────────── */}
            <div className="border-t border-border/60 px-4 py-2.5">
              {/* Toggle row */}
              <button
                type="button"
                onClick={() => {
                  if (!pushToGitHub && !hasGithubToken) {
                    toast({ title: "Connect GitHub first — open any project workspace and use the GitHub panel", variant: "destructive" });
                    return;
                  }
                  setPushToGitHub(v => !v);
                }}
                className="flex items-center gap-2 w-full text-left group"
              >
                <div className={cn(
                  "relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200",
                  pushToGitHub ? "bg-primary" : "bg-muted-foreground/30",
                )}>
                  <span className={cn(
                    "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform duration-200",
                    pushToGitHub ? "translate-x-3" : "translate-x-0",
                  )} />
                </div>
                <Github className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                  Also push to GitHub
                </span>
                {hasGithubToken === false && (
                  <span className="ml-auto text-[10px] text-amber-500 font-medium">GitHub not connected</span>
                )}
                {pushToGitHub && (
                  hasGithubToken
                    ? <CheckCircle2 className="ml-auto w-3.5 h-3.5 text-green-500" />
                    : <ChevronDown className="ml-auto w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>

              {/* Expanded repo options */}
              {pushToGitHub && hasGithubToken && (
                <div className="mt-3 space-y-2.5">
                  {/* Repo name */}
                  <div className="flex items-center gap-2">
                    <Github className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      value={ghRepoName}
                      onChange={e => setGhRepoName(e.target.value.replace(/[^a-z0-9-_.]/gi, "-").toLowerCase())}
                      placeholder="repo-name"
                      disabled={isCreating}
                      className="flex-1 h-7 px-2.5 text-xs font-mono rounded-lg border border-input bg-muted/30 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    />
                  </div>
                  {/* Visibility toggle */}
                  <div className="flex items-center gap-1.5">
                    {([
                      { val: false, label: "Public",  Icon: Globe },
                      { val: true,  label: "Private", Icon: Lock  },
                    ] as const).map(({ val, label, Icon }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setGhRepoPrivate(val)}
                        disabled={isCreating}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors",
                          ghRepoPrivate === val
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/30",
                        )}
                      >
                        <Icon className="w-3 h-3" />{label}
                      </button>
                    ))}
                    {!ghRepoPrivate && (
                      <span className="text-[10px] text-muted-foreground ml-1">Free GitHub Pages hosting</span>
                    )}
                  </div>
                  {/* Loading step label */}
                  {isCreating && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {createStep === "project" ? "Creating project…" : "Creating GitHub repo & pushing…"}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-2.5">
            Press <kbd className="bg-muted px-1.5 py-0.5 rounded font-mono">Enter</kbd> to create &nbsp;·&nbsp; Shift+Enter for new line
          </p>
        </div>

        {/* ── Project Templates ─────────────────────────────────── */}
        <div className="w-full max-w-2xl mx-auto px-4 pb-10">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 text-center">
            Or start from a template
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                disabled={isCreating}
                onClick={() => handleBuild(tpl.prompt)}
                className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left group disabled:opacity-50"
              >
                <span className="text-xl shrink-0">{tpl.emoji}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{tpl.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{tpl.tag}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Projects section ─────────────────────────────────── */}
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {search ? "Search results" : "Recent projects"}
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 pr-3 text-xs rounded-lg border border-input bg-transparent focus:outline-none focus:ring-1 focus:ring-ring w-36"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5 h-8 text-xs">
                <Github className="w-3.5 h-3.5" />
                Import
              </Button>
            </div>
          </div>

          {isLoading ? (
            <ProjectsSkeleton />
          ) : projects.length === 0 ? (
            <EmptyState search={search} onImportClick={() => setImportOpen(true)} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} hasGithubToken={!!hasGithubToken} onDeleted={() => mutate()} onLinked={() => mutate()} />
              ))}
            </div>
          )}
        </div>
      </main>

      {importOpen && (
        <ImportProjectDialog
          onOpenChange={setImportOpen}
          onImported={() => mutate()}
        />
      )}
    </div>
  );
}

// ── Project card with swipe-to-delete ─────────────────────────────────────────

const SWIPE_THRESHOLD = 72; // px to reveal delete button
const DELETE_TRIGGER  = 180; // px to auto-confirm delete

function ProjectCard({ project, hasGithubToken, onDeleted, onLinked }: {
  project: ProjectWithCounts;
  hasGithubToken: boolean;
  onDeleted: () => void;
  onLinked: () => void;
}) {
  const [, navigate] = useLocation();
  const icon = LANGUAGE_ICONS[project.language] ?? "📁";
  const [deleting, setDeleting] = useState(false);
  const [swiped, setSwiped] = useState(false); // true = delete button visible
  const [linkOpen, setLinkOpen] = useState(false);

  const cardRef   = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number | null>(null);
  const curDxRef  = useRef(0);
  const draggingRef = useRef(false);

  function applyTranslate(dx: number, animated = false) {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = animated ? "transform 0.25s ease" : "none";
    el.style.transform  = `translateX(${dx}px)`;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (deleting) return;
    startXRef.current = e.clientX;
    draggingRef.current = false;
    cardRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (startXRef.current === null) return;
    const rawDx = e.clientX - startXRef.current;
    const baseDx = swiped ? -SWIPE_THRESHOLD : 0;
    const dx = Math.min(0, Math.max(-DELETE_TRIGGER, baseDx + rawDx));

    if (Math.abs(rawDx) > 6) {
      draggingRef.current = true;
      e.preventDefault();
    }
    curDxRef.current = dx;
    applyTranslate(dx);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (startXRef.current === null) return;
    startXRef.current = null;
    const dx = curDxRef.current;

    if (!draggingRef.current) {
      // Tap — if delete strip is showing and tap is on the right side, ignore (handled by button)
      if (swiped) {
        // tap anywhere on card while swiped → close
        setSwiped(false);
        applyTranslate(0, true);
      } else {
        navigate(`/workspace/${project.id}`);
      }
      return;
    }

    draggingRef.current = false;

    if (dx <= -DELETE_TRIGGER) {
      // Full swipe — delete immediately
      applyTranslate(-DELETE_TRIGGER, true);
      handleDelete();
    } else if (dx <= -SWIPE_THRESHOLD) {
      // Partial swipe — snap open to reveal button
      setSwiped(true);
      applyTranslate(-SWIPE_THRESHOLD, true);
    } else {
      // Swipe back — snap closed
      setSwiped(false);
      applyTranslate(0, true);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/api/projects/${project.id}`);
      toast({ title: `"${project.name}" deleted` });
      onDeleted();
    } catch (err: unknown) {
      toast({ title: (err as Error).message ?? "Failed to delete project", variant: "destructive" });
      setSwiped(false);
      applyTranslate(0, true);
    } finally { setDeleting(false); }
  }

  return (
    <div className="relative rounded-xl overflow-hidden">
      {/* Red delete strip revealed behind the card */}
      <div className="absolute inset-0 flex items-center justify-end bg-destructive rounded-xl">
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(); }}
          disabled={deleting}
          className="w-[72px] flex flex-col items-center justify-center gap-1 h-full text-white disabled:opacity-60"
        >
          {deleting
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : <Trash2 className="w-5 h-5" />}
          <span className="text-[10px] font-medium">{deleting ? "…" : "Delete"}</span>
        </button>
      </div>

      {/* Card — slides left on swipe */}
      <div
        ref={cardRef}
        className="group relative rounded-xl border bg-card touch-pan-y will-change-transform select-none overflow-hidden"
        style={{ transform: "translateX(0)" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="p-4 pb-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl shrink-0 mt-0.5">{icon}</span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors leading-tight">
                {project.name}
              </h3>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                <span className="capitalize bg-muted px-1.5 py-0.5 rounded-full">{project.language}</span>
                {project.isPublic && (
                  <span className="flex items-center gap-0.5"><Globe className="w-2.5 h-2.5" />Public</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="w-2.5 h-2.5" />
              {formatDistanceToNow(new Date(project.updatedAt))}
            </span>

            {/* Open button — visible on mobile, hover on desktop */}
            <span className="flex items-center gap-1 text-xs font-semibold text-primary sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              Open <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* GitHub row */}
        {project.githubRepo && (
          <div className="px-4 pb-3" onClick={e => e.stopPropagation()}>
            <a
              href={`https://github.com/${project.githubRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary truncate"
            >
              <Github className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{project.githubRepo}</span>
              <ExternalLink className="w-2 h-2 shrink-0 opacity-60" />
            </a>
          </div>
        )}
      </div>

      {linkOpen && (
        <LinkGitHubModal
          projectId={project.id}
          projectName={project.name}
          hasGithubToken={hasGithubToken}
          onClose={() => setLinkOpen(false)}
          onLinked={() => { onLinked(); setLinkOpen(false); }}
        />
      )}
    </div>
  );
}

// ── Link to GitHub modal ───────────────────────────────────────────────────────

function LinkGitHubModal({
  projectId, projectName, hasGithubToken, onClose, onLinked,
}: {
  projectId: string;
  projectName: string;
  hasGithubToken: boolean;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [mode, setMode] = useState<"connect" | "create">("connect");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [repoName, setRepoName] = useState(() => slugifyRepo(projectName));
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConnect() {
    if (!repoUrl.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/api/github/projects/${projectId}/connect`, { repoUrl: repoUrl.trim(), branch: branch.trim() || "main" });
      toast({ title: "Linked to GitHub repo" });
      onLinked();
    } catch (err: unknown) {
      toast({ title: (err as Error).message ?? "Failed to link", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function handleCreate() {
    if (!repoName.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/github/projects/${projectId}/create-and-push`, {
        repoName: repoName.trim(), private: isPrivate, description: projectName,
      });
      toast({ title: "GitHub repo created and pushed!" });
      onLinked();
    } catch (err: unknown) {
      toast({ title: (err as Error).message ?? "Failed to create repo", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="w-4 h-4" />
            <span className="text-sm font-semibold">Link to GitHub</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground -mt-1">
          Connect <span className="font-medium text-foreground">{projectName}</span> to a GitHub repository.
        </p>

        {!hasGithubToken ? (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs p-3 leading-relaxed">
            GitHub not connected. Open any project workspace, click the GitHub button in the top bar, and sign in — then come back here.
          </div>
        ) : (
          <>
            {/* Mode tabs */}
            <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
              {(["connect", "create"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex-1 py-1.5 transition-colors",
                    mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {m === "connect" ? "Connect existing repo" : "Create new repo"}
                </button>
              ))}
            </div>

            {mode === "connect" ? (
              <div className="flex flex-col gap-2.5">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">GitHub repo URL</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="https://github.com/owner/repo"
                    value={repoUrl}
                    onChange={e => setRepoUrl(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleConnect()}
                    disabled={busy}
                    className="w-full h-8 px-2.5 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Branch</label>
                  <input
                    type="text"
                    placeholder="main"
                    value={branch}
                    onChange={e => setBranch(e.target.value)}
                    disabled={busy}
                    className="w-full h-8 px-2.5 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <Button size="sm" onClick={handleConnect} disabled={busy || !repoUrl.trim()} className="w-full gap-1.5">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Github className="w-3.5 h-3.5" />}
                  {busy ? "Linking…" : "Link repo"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Repository name</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="my-project"
                    value={repoName}
                    onChange={e => setRepoName(slugifyRepo(e.target.value))}
                    onKeyDown={e => e.key === "Enter" && handleCreate()}
                    disabled={busy}
                    className="w-full h-8 px-2.5 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {([
                    { val: false, label: "Public" },
                    { val: true,  label: "Private" },
                  ] as const).map(({ val, label }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setIsPrivate(val)}
                      disabled={busy}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors",
                        isPrivate === val
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/30",
                      )}
                    >
                      {val && <Lock className="w-3 h-3" />}{label}
                    </button>
                  ))}
                  {!isPrivate && <span className="text-[10px] text-muted-foreground ml-1">Free GitHub Pages</span>}
                </div>
                <Button size="sm" onClick={handleCreate} disabled={busy || !repoName.trim()} className="w-full gap-1.5">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Github className="w-3.5 h-3.5" />}
                  {busy ? "Creating & pushing…" : "Create repo & push"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ search, onImportClick }: { search: string; onImportClick: () => void }) {
  if (search) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FolderOpen className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No projects match "{search}"</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm text-muted-foreground mb-4">
        Type above to create your first project, or import an existing repo.
      </p>
      <Button variant="outline" size="sm" onClick={onImportClick} className="gap-2">
        <Download className="w-3.5 h-3.5" />Import from GitHub
      </Button>
    </div>
  );
}

function ProjectsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-24 rounded-xl border bg-muted animate-pulse" />
      ))}
    </div>
  );
}

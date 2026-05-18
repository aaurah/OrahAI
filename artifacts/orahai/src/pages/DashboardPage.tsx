import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Plus, Search, Code2, Globe, Clock, ArrowRight, FolderOpen,
  Download, MoreVertical, Trash2, ExternalLink, Loader2,
  Sparkles, Send, Github,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Navbar } from "@/components/layout/Navbar";
import { ImportProjectDialog } from "@/components/editor/ImportProjectDialog";
import { useProjects } from "@/hooks/useProjects";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
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

export default function DashboardPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const { projects, isLoading, mutate } = useProjects({ search });
  const { workspaces } = useWorkspaces();

  const [prompt, setPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleBuild = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isCreating) return;

    const wsId = workspaces[0]?.id;
    if (!wsId) {
      toast({ title: "Create a workspace first — click your workspace name in the top nav", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    try {
      const res = await api.post<ApiResponse<Project>>("/api/projects", {
        name: extractProjectName(trimmed),
        language: inferLanguage(trimmed),
        workspaceId: wsId,
      });
      mutate();
      navigate(`/workspace/${res.data.id}?prompt=${encodeURIComponent(trimmed)}`);
    } catch (err: unknown) {
      toast({ title: (err as Error).message ?? "Failed to create project", variant: "destructive" });
      setIsCreating(false);
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
          <div className="relative rounded-xl border border-border bg-card shadow-lg focus-within:border-primary/50 focus-within:shadow-primary/10 focus-within:shadow-xl transition-all">
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
                disabled={isCreating}
                className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none leading-relaxed min-h-[24px] disabled:opacity-60"
              />
              <button
                onClick={() => handleBuild(prompt)}
                disabled={!prompt.trim() || isCreating}
                className="shrink-0 w-8 h-8 rounded-lg bg-primary flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors mt-0.5"
              >
                {isCreating
                  ? <Loader2 className="w-3.5 h-3.5 text-primary-foreground animate-spin" />
                  : <Send className="w-3.5 h-3.5 text-primary-foreground" />}
              </button>
            </div>

            {/* Suggestion chips */}
            {!prompt && (
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
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-2.5">
            Press <kbd className="bg-muted px-1.5 py-0.5 rounded font-mono">Enter</kbd> to create &nbsp;·&nbsp; Shift+Enter for new line
          </p>
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
                <ProjectCard key={project.id} project={project} onDeleted={() => mutate()} />
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

function ProjectCard({ project, onDeleted }: { project: ProjectWithCounts; onDeleted: () => void }) {
  const [, navigate] = useLocation();
  const icon = LANGUAGE_ICONS[project.language] ?? "📁";
  const [deleting, setDeleting] = useState(false);
  const [swiped, setSwiped] = useState(false); // true = delete button visible

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
        className="group relative p-4 rounded-xl border bg-card touch-pan-y will-change-transform select-none"
        style={{ transform: "translateX(0)" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="flex items-start gap-3">
          <span className="text-xl shrink-0">{icon}</span>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
              {project.name}
            </h3>
            {project.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{project.description}</p>
            )}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-2">
              <span className="capitalize">{project.language}</span>
              {project.isPublic && (
                <span className="flex items-center gap-0.5"><Globe className="w-2.5 h-2.5" />Public</span>
              )}
              <span className="ml-auto flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {formatDistanceToNow(new Date(project.updatedAt))}
              </span>
            </div>
          </div>

          {/* Desktop three-dot menu — hidden on touch */}
          <div className="hidden sm:block relative" onClick={e => e.stopPropagation()}>
            <MoreVertical className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-pointer"
              onClick={() => navigate(`/workspace/${project.id}`)} />
          </div>
        </div>

        {/* Desktop hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-card/70 rounded-xl pointer-events-none sm:flex hidden">
          <span className="flex items-center gap-1 text-xs font-medium text-primary">
            Open <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
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

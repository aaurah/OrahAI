import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  Search, Globe, GitFork, Loader2, Code2, Clock,
  Star, TrendingUp, ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui/Badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { formatDistanceToNow, cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import type { ApiResponse } from "@/types";

interface PublicProject {
  id: string;
  name: string;
  description: string | null;
  language: string;
  ownerId: string;
  ownerName: string | null;
  ownerUsername: string;
  ownerAvatarUrl: string | null;
  updatedAt: string;
  fileCount: number;
  starCount: number;
  isStarred: boolean;
}

const LANG_COLORS: Record<string, string> = {
  nodejs: "bg-green-500", python: "bg-yellow-400", typescript: "bg-blue-500",
  html: "bg-orange-400", go: "bg-cyan-400", rust: "bg-orange-600",
  java: "bg-red-500", ruby: "bg-red-400", php: "bg-purple-400",
};

const LANG_ICONS: Record<string, string> = {
  nodejs: "🟩", typescript: "🔷", python: "🐍", html: "🌐",
  go: "🐹", rust: "🦀", java: "☕", ruby: "💎", php: "🐘",
  cpp: "⚙️", csharp: "🟣", solidity: "⟠",
};

const LANG_FILTERS = [
  { value: "", label: "All" },
  { value: "typescript", label: "TypeScript" },
  { value: "nodejs", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "html", label: "HTML" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
];

export default function ExplorePage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { workspaces } = useWorkspaces();
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("");
  const [sort, setSort] = useState<"newest" | "stars">("newest");
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [forkingId, setForkingId] = useState<string | null>(null);
  const [starringId, setStarringId] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20", sort });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (language) params.set("language", language);
      const res = await api.get<ApiResponse<PublicProject[]> & { total: number }>(
        `/api/projects/community?${params}`
      );
      setProjects(res.data);
      setTotal(res.total ?? 0);
    } catch { setProjects([]); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { setPage(1); }, [debouncedSearch, language, sort]);
  useEffect(() => { fetchProjects(); }, [page, debouncedSearch, language, sort]);

  const handleFork = async (project: PublicProject) => {
    if (!user) { navigate("/login"); return; }
    const wsId = workspaces[0]?.id;
    if (!wsId) { toast({ title: "No workspace found", variant: "destructive" }); return; }
    setForkingId(project.id);
    try {
      const res = await api.post<ApiResponse<{ id: string }>>(`/api/projects/${project.id}/fork`, { workspaceId: wsId });
      toast({ title: `Forked "${project.name}"` });
      navigate(`/workspace/${res.data.id}`);
    } catch (err: unknown) {
      toast({ title: (err as Error).message ?? "Fork failed", variant: "destructive" });
    } finally { setForkingId(null); }
  };

  const handleStar = async (project: PublicProject) => {
    if (!user) { navigate("/login"); return; }
    setStarringId(project.id);
    try {
      const res = await api.post<ApiResponse<{ starred: boolean; starCount: number }>>(`/api/projects/${project.id}/star`, {});
      setProjects(prev => prev.map(p =>
        p.id === project.id
          ? { ...p, isStarred: res.data.starred, starCount: res.data.starCount }
          : p
      ));
    } catch (err: unknown) {
      toast({ title: (err as Error).message ?? "Failed", variant: "destructive" });
    } finally { setStarringId(null); }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Globe className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Explore</h1>
            {total > 0 && <Badge variant="secondary">{total} projects</Badge>}
          </div>
          <p className="text-muted-foreground text-sm">
            Discover public projects built by the OrahAI community. Star or fork any project.
          </p>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="pl-9"
              />
            </div>
            <button
              onClick={() => setSort(s => s === "newest" ? "stars" : "newest")}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border border-border transition-colors whitespace-nowrap",
                "hover:bg-muted",
              )}
              title="Toggle sort"
            >
              {sort === "newest"
                ? <><Clock className="w-4 h-4" />Newest</>
                : <><TrendingUp className="w-4 h-4" />Most starred</>}
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Language tabs */}
          <div className="flex gap-1 flex-wrap">
            {LANG_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setLanguage(f.value)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                  language === f.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {LANG_ICONS[f.value] && <span className="mr-1">{LANG_ICONS[f.value]}</span>}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Globe className="w-12 h-12 opacity-20" />
            <p className="text-sm">
              {debouncedSearch ? `No projects matching "${debouncedSearch}"` : "No public projects yet"}
            </p>
            <p className="text-xs">Make a project public from your dashboard to share it here.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(p => (
                <div
                  key={p.id}
                  className="flex flex-col rounded-xl border border-border bg-card hover:border-border/80 hover:shadow-sm transition-all overflow-hidden group"
                >
                  <div className="flex-1 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base">{LANG_ICONS[p.language] ?? "📄"}</span>
                        <div className="min-w-0">
                          <a
                            href={`/workspace/${p.id}`}
                            className="text-sm font-semibold hover:text-primary transition-colors truncate block"
                          >
                            {p.name}
                          </a>
                          <Link
                            href={`/u/${p.ownerUsername}`}
                            className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            <span className="flex items-center gap-1">
                              <Avatar className="w-3.5 h-3.5 inline">
                                <AvatarImage src={p.ownerAvatarUrl ?? undefined} />
                                <AvatarFallback className="text-[8px]">
                                  {(p.ownerName ?? p.ownerUsername ?? "U")[0].toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              @{p.ownerUsername}
                            </span>
                          </Link>
                        </div>
                      </div>
                      <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${LANG_COLORS[p.language] ?? "bg-muted-foreground/50"}`} />
                    </div>

                    {p.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border/50 bg-muted/20">
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(p.updatedAt))}
                      </span>
                      <span className="flex items-center gap-1">
                        <Code2 className="w-3 h-3" />
                        {p.fileCount} files
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStar(p)}
                        disabled={starringId === p.id}
                        className={cn(
                          "flex items-center gap-1 h-6 px-2 rounded text-xs transition-colors",
                          p.isStarred
                            ? "text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20"
                            : "text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10",
                        )}
                        title={p.isStarred ? "Unstar" : "Star"}
                      >
                        {starringId === p.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Star className={cn("w-3 h-3", p.isStarred && "fill-current")} />}
                        <span>{Number(p.starCount)}</span>
                      </button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleFork(p)}
                        disabled={forkingId === p.id}
                        className="h-6 text-xs gap-1 px-2"
                      >
                        {forkingId === p.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <GitFork className="w-3 h-3" />}
                        Fork
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

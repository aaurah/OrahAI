import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Search, Code2, Globe, Clock, ArrowRight, FolderOpen, Download, MoreVertical, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Navbar } from "@/components/layout/Navbar";
import { CreateProjectDialog } from "@/components/editor/CreateProjectDialog";
import { ImportProjectDialog } from "@/components/editor/ImportProjectDialog";
import { useProjects } from "@/hooks/useProjects";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import type { ProjectWithCounts } from "@/types";

const LANGUAGE_ICONS: Record<string, string> = {
  python: "🐍", nodejs: "🟩", typescript: "🔷", html: "🌐",
  go: "🐹", rust: "🦀", java: "☕", ruby: "💎",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { projects, isLoading, mutate } = useProjects({ search });

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold">
                {user?.name ? `Welcome back, ${user.name.split(" ")[0]}` : "My Projects"}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Build, run, and deploy your projects with AI assistance
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
                <Download className="w-4 h-4" />
                <span className="hidden sm:block">Import</span>
              </Button>
              <Button onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:block">New project</span>
              </Button>
            </div>
          </div>

          <div className="relative mb-6 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <ProjectsSkeleton />
          ) : projects.length === 0 ? (
            <EmptyState onCreateClick={() => setCreateOpen(true)} onImportClick={() => setImportOpen(true)} search={search} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} onDeleted={() => mutate()} />
              ))}
            </div>
          )}

          <CreateProjectDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={() => mutate()}
          />
          {importOpen && (
            <ImportProjectDialog
              onOpenChange={setImportOpen}
              onImported={() => mutate()}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ── Project card with context menu ────────────────────────────────────────────

function ProjectCard({ project, onDeleted }: { project: ProjectWithCounts; onDeleted: () => void }) {
  const [, navigate] = useLocation();
  const icon = LANGUAGE_ICONS[project.language] ?? "📁";
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/api/projects/${project.id}`);
      toast({ title: `"${project.name}" deleted` });
      setConfirmDelete(false);
      onDeleted();
    } catch (err: unknown) {
      toast({ title: (err as Error).message ?? "Failed to delete project", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/* Card */}
      <div className="group relative p-5 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all">
        {/* Three-dot menu button */}
        <div ref={menuRef} className="absolute top-3 right-3 z-10">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(v => !v); }}
            className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Project options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-7 w-44 rounded-lg border bg-popover shadow-lg py-1 z-20">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); navigate(`/workspace/${project.id}`); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                Open workspace
              </button>
              <div className="my-1 border-t border-border" />
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setConfirmDelete(true); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete project
              </button>
            </div>
          )}
        </div>

        {/* Card body — click to open */}
        <div onClick={() => navigate(`/workspace/${project.id}`)} className="cursor-pointer">
          <div className="flex items-start justify-between mb-3">
            <span className="text-2xl">{icon}</span>
            {project.isPublic && (
              <Badge variant="secondary" className="text-xs mr-6">
                <Globe className="w-3 h-3 mr-1" />
                Public
              </Badge>
            )}
          </div>

          <h3 className="font-semibold text-sm mb-1 truncate group-hover:text-primary transition-colors pr-6">
            {project.name}
          </h3>

          {project.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{project.description}</p>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-auto">
            <Code2 className="w-3 h-3" />
            <span className="capitalize">{project.language}</span>
            <span className="ml-auto flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(project.updatedAt))}
            </span>
          </div>

          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-card/80 rounded-xl pointer-events-none">
            <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
              Open workspace
              <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-card border rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h2 className="font-semibold">Delete project?</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  This will permanently delete <span className="font-medium text-foreground">"{project.name}"</span> and all its files.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="gap-1.5"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EmptyState({
  onCreateClick, onImportClick, search,
}: { onCreateClick: () => void; onImportClick: () => void; search: string }) {
  if (search) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FolderOpen className="w-12 h-12 text-muted-foreground/50 mb-4" />
        <h3 className="font-semibold mb-1">No projects found</h3>
        <p className="text-sm text-muted-foreground">No projects match &ldquo;{search}&rdquo;</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Code2 className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">Create your first project</h3>
      <p className="text-muted-foreground mb-6 max-w-sm">
        Start with a template, import from GitHub, or upload local files.
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={onCreateClick} size="lg" className="gap-2">
          <Plus className="w-5 h-5" />
          New project
        </Button>
        <Button onClick={onImportClick} size="lg" variant="outline" className="gap-2">
          <Download className="w-5 h-5" />
          Import
        </Button>
      </div>
    </div>
  );
}

function ProjectsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-40 rounded-xl border bg-muted animate-pulse" />
      ))}
    </div>
  );
}

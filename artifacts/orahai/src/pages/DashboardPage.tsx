import { useState } from "react";
import { Link } from "wouter";
import { Plus, Search, Code2, Globe, Clock, ArrowRight, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Navbar } from "@/components/layout/Navbar";
import { CreateProjectDialog } from "@/components/editor/CreateProjectDialog";
import { useProjects } from "@/hooks/useProjects";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "@/lib/utils";
import type { ProjectWithCounts } from "@/types";

const LANGUAGE_ICONS: Record<string, string> = {
  python: "🐍", nodejs: "🟩", typescript: "🔷", html: "🌐",
  go: "🐹", rust: "🦀", java: "☕", ruby: "💎",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
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
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              New project
            </Button>
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
            <EmptyState onCreateClick={() => setCreateOpen(true)} search={search} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}

          <CreateProjectDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={() => mutate()}
          />
        </div>
      </main>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectWithCounts }) {
  const icon = LANGUAGE_ICONS[project.language] ?? "📁";

  return (
    <Link href={`/workspace/${project.id}`}>
      <div className="group relative p-5 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <span className="text-2xl">{icon}</span>
          {project.isPublic && (
            <Badge variant="secondary" className="text-xs">
              <Globe className="w-3 h-3 mr-1" />
              Public
            </Badge>
          )}
        </div>

        <h3 className="font-semibold text-sm mb-1 truncate group-hover:text-primary transition-colors">
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

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-card/80 rounded-xl">
          <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
            Open workspace
            <ArrowRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ onCreateClick, search }: { onCreateClick: () => void; search: string }) {
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
        Start with a template or a blank project. OrahAI will help you build it.
      </p>
      <Button onClick={onCreateClick} size="lg" className="gap-2">
        <Plus className="w-5 h-5" />
        New project
      </Button>
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

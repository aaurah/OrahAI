import { useState } from "react";
import { Link } from "wouter";
import { Rocket, Github, Download, ExternalLink, Clock, CheckCircle2, XCircle, ArrowRight, Globe } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { useProjects } from "@/hooks/useProjects";
import { cn } from "@/lib/utils";

const LANG_ICONS: Record<string, string> = {
  nodejs: "🟩", python: "🐍", typescript: "🔷", html: "🌐",
};

export default function DeploymentsPage() {
  const { projects, isLoading } = useProjects({});
  const [filter, setFilter] = useState<"all" | "connected">("all");

  const filtered = projects.filter(p =>
    filter === "all" ? true : !!p.githubRepo,
  );

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Rocket className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Deployments</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Deploy your projects to GitHub Pages or download as ZIP</p>
          </div>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {[
            { icon: Github, title: "Connect GitHub", desc: "Link a GitHub repo in the workspace GitHub panel", step: "1" },
            { icon: Rocket, title: "Deploy", desc: "Open Deploy panel in workspace and push to GitHub Pages", step: "2" },
            { icon: Globe, title: "Live site", desc: "Your project is live at username.github.io/repo", step: "3" },
          ].map(({ icon: Icon, title, desc, step }) => (
            <div key={step} className="rounded-xl border border-border bg-card p-4 flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">{step}</div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-medium">Projects</span>
          <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5 ml-auto">
            {(["all", "connected"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn("text-xs px-3 py-1 rounded-md font-medium transition-colors capitalize",
                  filter === f ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {f === "connected" ? "GitHub connected" : "All"}
              </button>
            ))}
          </div>
        </div>

        {/* Projects list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-20 rounded-xl border border-border bg-card animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <Rocket className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold">{filter === "connected" ? "No GitHub-connected projects" : "No projects yet"}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {filter === "connected"
                  ? "Open a project, connect it to GitHub, then deploy from the Deploy panel."
                  : "Create a project from the dashboard to get started."}
              </p>
            </div>
            <Link href="/dashboard">
              <Button variant="outline" size="sm">Go to Dashboard</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(p => {
              const pagesUrl = p.githubRepo
                ? `https://${p.githubRepo.split("/")[0]}.github.io/${p.githubRepo.split("/")[1]}/`
                : null;

              return (
                <div key={p.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
                  <div className="text-2xl">{LANG_ICONS[p.language] ?? "📁"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{p.name}</span>
                      {p.githubRepo && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <Github className="w-3 h-3" />{p.githubRepo}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {p.githubRepo ? (
                        <>
                          <div className="flex items-center gap-1 text-xs text-green-500">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>GitHub connected</span>
                          </div>
                          {p.githubSyncedAt && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              <span>Synced {new Date(p.githubSyncedAt).toLocaleDateString()}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <XCircle className="w-3 h-3" />
                          <span>No GitHub repo — connect in workspace</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {pagesUrl && (
                      <a href={pagesUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Open GitHub Pages">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <Link href={`/workspace/${p.id}`}>
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8">
                        Open <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Download note */}
        <div className="mt-8 rounded-xl border border-dashed border-border p-4 flex items-start gap-3">
          <Download className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Download as ZIP</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Open any project workspace → click the <Rocket className="w-3 h-3 inline" /> Deploy button in the topbar → Download ZIP to export all files locally.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  Star, GitFork, Code2, Clock, Globe, Loader2, User,
  Calendar, ExternalLink,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { formatDistanceToNow } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/useToast";
import type { ApiResponse } from "@/types";

interface UserProfile {
  id: string;
  name: string | null;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

interface ProfileProject {
  id: string;
  name: string;
  description: string | null;
  language: string;
  updatedAt: string;
  starCount: number;
  fileCount: number;
}

interface ProfileData {
  user: UserProfile;
  projects: ProfileProject[];
  stats: { projectCount: number; starCount: number };
}

interface StarredProject extends ProfileProject {
  ownerUsername: string;
}

const LANG_ICONS: Record<string, string> = {
  nodejs: "🟩", typescript: "🔷", python: "🐍", html: "🌐",
  go: "🐹", rust: "🦀", java: "☕", ruby: "💎", php: "🐘",
  cpp: "⚙️", csharp: "🟣", solidity: "⟠",
};

const LANG_COLORS: Record<string, string> = {
  nodejs: "bg-green-500", python: "bg-yellow-400", typescript: "bg-blue-500",
  html: "bg-orange-400", go: "bg-cyan-400", rust: "bg-orange-600",
  java: "bg-red-500", ruby: "bg-red-400", php: "bg-purple-400",
};

function ProjectCard({ p, href }: { p: ProfileProject & { ownerUsername?: string }; href: string }) {
  return (
    <a
      href={href}
      className="flex flex-col rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all overflow-hidden group"
    >
      <div className="flex-1 p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">{LANG_ICONS[p.language] ?? "📄"}</span>
            <div className="min-w-0">
              <span className="text-sm font-semibold group-hover:text-primary transition-colors truncate block">
                {p.name}
              </span>
              {p.ownerUsername && (
                <p className="text-[11px] text-muted-foreground">@{p.ownerUsername}</p>
              )}
            </div>
          </div>
          <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${LANG_COLORS[p.language] ?? "bg-muted-foreground/50"}`} />
        </div>
        {p.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
        )}
      </div>
      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-border/50 bg-muted/20 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><Star className="w-3 h-3" />{Number(p.starCount)}</span>
        <span className="flex items-center gap-1"><Code2 className="w-3 h-3" />{p.fileCount} files</span>
        <span className="flex items-center gap-1 ml-auto"><Clock className="w-3 h-3" />{formatDistanceToNow(new Date(p.updatedAt))}</span>
      </div>
    </a>
  );
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [, navigate] = useLocation();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [starred, setStarred] = useState<StarredProject[]>([]);
  const [tab, setTab] = useState<"projects" | "stars">("projects");
  const [isLoading, setIsLoading] = useState(true);
  const [starsLoading, setStarsLoading] = useState(false);

  useEffect(() => {
    if (!username) return;
    setIsLoading(true);
    api.get<ApiResponse<ProfileData>>(`/api/users/${username}/profile`)
      .then(r => setProfile(r.data))
      .catch(() => toast({ title: "User not found", variant: "destructive" }))
      .finally(() => setIsLoading(false));
  }, [username]);

  useEffect(() => {
    if (tab !== "stars" || !username) return;
    setStarsLoading(true);
    api.get<ApiResponse<StarredProject[]>>(`/api/users/${username}/stars`)
      .then(r => setStarred(r.data))
      .catch(() => setStarred([]))
      .finally(() => setStarsLoading(false));
  }, [tab, username]);

  const isOwnProfile = currentUser?.username === username;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-10">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !profile ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <User className="w-16 h-16 text-muted-foreground/20" />
            <p className="text-muted-foreground">User not found.</p>
            <Button variant="outline" onClick={() => navigate("/explore")}>Browse Explore</Button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-10">
            {/* Sidebar */}
            <aside className="md:w-64 shrink-0">
              <div className="flex flex-col items-center md:items-start gap-4">
                <Avatar className="w-24 h-24">
                  <AvatarImage src={profile.user.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-2xl">
                    {(profile.user.name ?? profile.user.username ?? "U")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="text-center md:text-left">
                  <h1 className="text-xl font-bold">{profile.user.name ?? profile.user.username}</h1>
                  <p className="text-sm text-muted-foreground">@{profile.user.username}</p>
                </div>

                {profile.user.bio && (
                  <p className="text-sm text-muted-foreground text-center md:text-left">{profile.user.bio}</p>
                )}

                {isOwnProfile && (
                  <Button variant="outline" size="sm" className="w-full md:w-auto" asChild>
                    <a href="/settings/profile">Edit profile</a>
                  </Button>
                )}

                <div className="w-full space-y-2 border-t border-border pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4 shrink-0" />
                    <span>Joined {new Date(profile.user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Globe className="w-4 h-4 shrink-0" />
                    <span>{profile.stats.projectCount} public projects</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Star className="w-4 h-4 shrink-0" />
                    <span>{profile.stats.starCount} stars earned</span>
                  </div>
                </div>
              </div>
            </aside>

            {/* Main */}
            <div className="flex-1 min-w-0">
              {/* Tabs */}
              <div className="flex gap-1 border-b border-border mb-6">
                {(["projects", "stars"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      tab === t
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "projects" ? <><Code2 className="w-4 h-4" />Projects</> : <><Star className="w-4 h-4" />Stars</>}
                    <Badge variant="secondary" className="text-xs h-5 px-1.5">
                      {t === "projects" ? profile.stats.projectCount : starred.length}
                    </Badge>
                  </button>
                ))}
              </div>

              {/* Projects grid */}
              {tab === "projects" && (
                <>
                  {profile.projects.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
                      <GitFork className="w-10 h-10 opacity-20" />
                      <p className="text-sm">No public projects yet.</p>
                      {isOwnProfile && (
                        <Button size="sm" onClick={() => navigate("/dashboard")}>
                          <ExternalLink className="w-4 h-4 mr-2" />Create a project
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {profile.projects.map(p => (
                        <ProjectCard key={p.id} p={p} href={`/workspace/${p.id}`} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Stars grid */}
              {tab === "stars" && (
                <>
                  {starsLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : starred.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
                      <Star className="w-10 h-10 opacity-20" />
                      <p className="text-sm">No starred projects yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {starred.map(p => (
                        <ProjectCard key={p.id} p={p} href={`/workspace/${p.id}`} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

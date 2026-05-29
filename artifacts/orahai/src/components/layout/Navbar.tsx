import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  Bot, Code2, LayoutDashboard, Rocket, ChevronDown, LogOut, User, Shield,
  Sun, Moon, Circle, Globe, Cpu, Bell, BellDot, Check, Trash2, Sparkles,
  GitFork, Star, Loader2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import { api } from "@/lib/api";
import { formatDistanceToNow } from "@/lib/utils";
import type { ApiResponse } from "@/types";

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  link: string | null;
  isRead: boolean;
  actorName: string | null;
  createdAt: string;
}

const NAV_ITEMS = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/explore",     label: "Explore",     icon: Globe           },
  { href: "/templates",   label: "Templates",   icon: Sparkles        },
  { href: "/deployments", label: "Deployments", icon: Rocket          },
];

const THEME_OPTS: { value: Theme; label: string; Icon: React.ElementType }[] = [
  { value: "light",  label: "Light",  Icon: Sun    },
  { value: "dark",   label: "Dark",   Icon: Moon   },
  { value: "amoled", label: "AMOLED", Icon: Circle },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const current = THEME_OPTS.find((o) => o.value === theme) ?? THEME_OPTS[1];
  const Icon = current.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Change theme"
        >
          <Icon className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuLabel className="text-xs">Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEME_OPTS.map(({ value, label, Icon: Ico }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={cn("gap-2 text-sm cursor-pointer", theme === value && "text-primary font-medium")}
          >
            <Ico className="w-3.5 h-3.5" />
            {label}
            {theme === value && <span className="ml-auto text-primary text-xs">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const NOTIF_ICONS: Record<string, React.ElementType> = {
  fork:  GitFork,
  star:  Star,
};

function NotificationBell({ userId }: { userId: string }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifs = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const r = await api.get<ApiResponse<NotificationItem[]> & { unreadCount: number }>("/api/notifications");
      setNotifs(r.data);
      setUnread(r.unreadCount ?? r.data.filter(n => !n.isRead).length);
    } catch { /* ignore */ }
    finally { if (!quiet) setLoading(false); }
  };

  useEffect(() => {
    void fetchNotifs(true);
    pollRef.current = setInterval(() => fetchNotifs(true), 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [userId]);

  const markAllRead = async () => {
    await api.patch("/api/notifications/read-all").catch(() => null);
    setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnread(0);
  };

  const dismiss = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.delete(`/api/notifications/${id}`).catch(() => null);
    setNotifs(prev => prev.filter(n => n.id !== id));
    setUnread(prev => {
      const was = notifs.find(n => n.id === id);
      return was && !was.isRead ? Math.max(0, prev - 1) : prev;
    });
  };

  const handleClick = async (n: NotificationItem) => {
    if (!n.isRead) {
      await api.patch(`/api/notifications/${n.id}/read`).catch(() => null);
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
      setUnread(prev => Math.max(0, prev - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const hasUnread = unread > 0;

  return (
    <DropdownMenu open={open} onOpenChange={(v) => { setOpen(v); if (v) fetchNotifs(); }}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Notifications"
        >
          {hasUnread ? <BellDot className="w-4 h-4 text-primary" /> : <Bell className="w-4 h-4" />}
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[440px] overflow-y-auto p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-popover z-10">
          <span className="font-semibold text-sm">Notifications</span>
          {hasUnread && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Check className="w-3 h-3" />Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <Bell className="w-8 h-8 opacity-20" />
            <p className="text-xs">No notifications yet</p>
          </div>
        ) : (
          <div>
            {notifs.map(n => {
              const Icon = NOTIF_ICONS[n.type] ?? Bell;
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0 group",
                    !n.isRead && "bg-primary/5",
                  )}
                >
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    n.type === "star" ? "bg-yellow-500/10 text-yellow-500" :
                    n.type === "fork" ? "bg-blue-500/10 text-blue-500" :
                    "bg-muted text-muted-foreground",
                  )}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs leading-snug", !n.isRead && "font-medium")}>{n.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(n.createdAt))} ago
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    <button
                      onClick={(e) => dismiss(n.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Navbar() {
  const [pathname] = useLocation();
  const { user } = useAuth();

  return (
    <nav className="h-14 border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-50">
      <div className="h-full px-4 flex items-center justify-between gap-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold shrink-0">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="hidden sm:block">OrahAI</span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:block">{item.label}</span>
              </Link>
            );
          })}
          {user?.isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Shield className="w-4 h-4" />
              <span className="hidden sm:block">Admin</span>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />

          {user ? (
            <>
              <NotificationBell userId={user.id} />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="flex items-center gap-2 px-2">
                    <Avatar className="w-7 h-7">
                      <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name ?? ""} />
                      <AvatarFallback className="text-xs">
                        {(user.name ?? user.email ?? "U")[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:block text-sm font-medium max-w-32 truncate">
                      {user.name ?? user.email}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{user.name}</span>
                      <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/u/${user.username}`}>
                      <User className="w-4 h-4 mr-2" />My profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings/profile">
                      <User className="w-4 h-4 mr-2" />Profile settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings/api-keys">
                      <Code2 className="w-4 h-4 mr-2" />API keys
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/ai-models">
                      <Cpu className="w-4 h-4 mr-2" />AI Models
                    </Link>
                  </DropdownMenuItem>
                  {user.isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin">
                        <Shield className="w-4 h-4 mr-2" />Admin panel
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={signOut}
                  >
                    <LogOut className="w-4 h-4 mr-2" />Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Link href="/login">
              <Button size="sm">Sign in</Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

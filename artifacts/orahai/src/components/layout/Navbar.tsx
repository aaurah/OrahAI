import { Link, useLocation } from "wouter";
import {
  Bot, Code2, LayoutDashboard, Rocket, ChevronDown, LogOut, User, Shield,
  Sun, Moon, Circle, Globe,
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

const NAV_ITEMS = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/explore",     label: "Explore",     icon: Globe           },
  { href: "/deployments", label: "Deployments", icon: Rocket          },
  { href: "/vision",      label: "Vision",      icon: Code2           },
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
                  <Link href="/settings/profile">
                    <User className="w-4 h-4 mr-2" />Profile settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/api-keys">
                    <Code2 className="w-4 h-4 mr-2" />API keys
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

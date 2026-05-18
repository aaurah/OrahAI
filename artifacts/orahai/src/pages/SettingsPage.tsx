import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { User, Key } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "/settings/profile",  label: "Profile",  icon: User },
  { path: "/settings/api-keys", label: "API Keys", icon: Key },
];

export default function SettingsPage() {
  const [pathname] = useLocation();

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        <div className="flex gap-1 mb-8 border-b border-border">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.path;
            return (
              <button
                key={tab.path}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="rounded-xl border bg-card p-6 text-muted-foreground text-sm">
          Settings coming soon.
        </div>
      </main>
    </div>
  );
}

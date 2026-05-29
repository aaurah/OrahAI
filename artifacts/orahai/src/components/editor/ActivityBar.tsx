import { cn } from "@/lib/utils";
import {
  Files, Search, GitBranch, Wrench, Rocket,
  ChevronLeft, ChevronRight,
} from "lucide-react";

export type LeftPanel = "files" | "search" | "git" | "tools" | "deploy";

interface Props {
  leftPanel: LeftPanel | null;
  onLeftPanel: (p: LeftPanel | null) => void;
  hasGithub?: boolean;
  isOwner?: boolean;
}

const ITEMS: { id: LeftPanel; icon: React.ElementType; label: string }[] = [
  { id: "files",  icon: Files,     label: "Explorer"        },
  { id: "search", icon: Search,    label: "Search"          },
  { id: "git",    icon: GitBranch, label: "Source Control"  },
  { id: "tools",  icon: Wrench,    label: "Tools"           },
  { id: "deploy", icon: Rocket,    label: "Deploy"          },
];

export function ActivityBar({ leftPanel, onLeftPanel, hasGithub, isOwner = true }: Props) {
  const visible = ITEMS.filter(i => {
    if (i.id === "deploy") return true;
    if (i.id === "tools") return isOwner;
    if (i.id === "git") return hasGithub !== false;
    return true;
  });

  return (
    <div className="w-10 flex-shrink-0 border-r border-border flex flex-col items-center py-2 gap-1 bg-background/80 z-10">
      {visible.map(({ id, icon: Icon, label }) => {
        const active = leftPanel === id;
        return (
          <button
            key={id}
            title={label}
            onClick={() => onLeftPanel(active ? null : id)}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-md transition-colors group relative",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full -ml-1" />
            )}
            <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
          </button>
        );
      })}

      <div className="flex-1" />

      <button
        title={leftPanel !== null ? "Collapse sidebar" : "Expand sidebar"}
        onClick={() => onLeftPanel(leftPanel !== null ? null : "files")}
        className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        {leftPanel !== null
          ? <ChevronLeft className="w-4 h-4" />
          : <ChevronRight className="w-4 h-4" />}
      </button>
    </div>
  );
}

import { useRef, useEffect } from "react";
import { X, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectFile } from "@/types";

function fileIcon(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "🔷", tsx: "🔷", js: "🟨", jsx: "🟨", py: "🐍",
    html: "🌐", css: "🎨", scss: "🎨", json: "📋",
    md: "📝", sh: "🖥️", sql: "🗃️", rs: "🦀", go: "🐹",
    java: "☕", kt: "🎯", rb: "💎", php: "🐘",
    vue: "💚", svelte: "🟠", yaml: "📄", yml: "📄",
    toml: "📄", env: "🔑", lock: "🔒", gitignore: "📂",
  };
  return map[ext] ?? "📄";
}

interface Props {
  tabs: ProjectFile[];
  activeTabPath: string | null;
  dirtyPaths: Set<string>;
  onSelect: (file: ProjectFile) => void;
  onClose: (path: string) => void;
}

export function FileTabs({ tabs, activeTabPath, dirtyPaths, onSelect, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeTabPath || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLButtonElement>(`[data-path="${CSS.escape(activeTabPath)}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabPath]);

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-stretch border-b border-border bg-background shrink-0 overflow-hidden">
      <div ref={scrollRef} className="flex-1 flex overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const isActive = tab.path === activeTabPath;
          const isDirty = dirtyPaths.has(tab.path);
          const name = tab.path.split("/").pop() ?? tab.path;
          return (
            <button
              key={tab.path}
              data-path={tab.path}
              onClick={() => onSelect(tab)}
              className={cn(
                "group flex items-center gap-1.5 h-8 px-3 text-xs shrink-0 border-r border-border/50 transition-colors relative",
                isActive
                  ? "bg-muted text-foreground border-b-2 border-b-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <span className="text-[11px] leading-none">{fileIcon(tab.path)}</span>
              <span className={cn("max-w-[120px] truncate", isDirty && "italic")}>{name}</span>
              {isDirty && <Circle className="w-1.5 h-1.5 fill-primary text-primary shrink-0" />}
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onClose(tab.path); }}
                className="opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 rounded p-0.5 ml-0.5 transition-opacity"
              >
                <X className="w-3 h-3" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

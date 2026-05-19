import { useState, useEffect, useRef, useCallback } from "react";
import { Search, FileText, Zap, Play, Github, KeyRound, Rocket, Globe, Terminal, MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectFile } from "@/types";

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  kbd?: string;
}

interface Props {
  open: boolean;
  files: ProjectFile[];
  onClose: () => void;
  onFileSelect: (file: ProjectFile) => void;
  commands?: Command[];
}

export function CommandPalette({ open, files, onClose, onFileSelect, commands = [] }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filteredFiles = query.trim()
    ? files.filter(f => f.path.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : files.slice(0, 5);

  const filteredCmds = query.trim()
    ? commands.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.description?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5)
    : commands.slice(0, 5);

  const items: Array<{ type: "file"; data: ProjectFile } | { type: "cmd"; data: Command }> = [
    ...filteredFiles.map(f => ({ type: "file" as const, data: f })),
    ...filteredCmds.map(c => ({ type: "cmd" as const, data: c })),
  ];

  const clampedSelected = Math.min(selected, items.length - 1);

  const execute = useCallback((idx: number) => {
    const item = items[idx];
    if (!item) return;
    if (item.type === "file") onFileSelect(item.data);
    else item.data.action();
    onClose();
  }, [items, onClose, onFileSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, items.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); return; }
    if (e.key === "Enter") { execute(clampedSelected); return; }
  };

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[clampedSelected] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [clampedSelected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search files and commands…"
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">No results</div>
          )}

          {filteredFiles.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Files</div>
              {filteredFiles.map((f, i) => {
                const idx = i;
                const name = f.path.split("/").pop() ?? f.path;
                const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
                return (
                  <button key={f.path} onClick={() => execute(idx)}
                    className={cn("w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                      clampedSelected === idx ? "bg-muted" : "hover:bg-muted/60")}>
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{name}</span>
                    {dir && <span className="text-xs text-muted-foreground truncate ml-auto">{dir}</span>}
                  </button>
                );
              })}
            </>
          )}

          {filteredCmds.length > 0 && (
            <>
              <div className="px-3 py-1 mt-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Commands</div>
              {filteredCmds.map((c, i) => {
                const idx = filteredFiles.length + i;
                return (
                  <button key={c.id} onClick={() => execute(idx)}
                    className={cn("w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                      clampedSelected === idx ? "bg-muted" : "hover:bg-muted/60")}>
                    <span className="w-4 h-4 text-muted-foreground shrink-0 flex items-center justify-center">{c.icon}</span>
                    <div className="flex-1 flex items-baseline gap-2 min-w-0">
                      <span className="font-medium truncate">{c.label}</span>
                      {c.description && <span className="text-xs text-muted-foreground truncate">{c.description}</span>}
                    </div>
                    {c.kbd && (
                      <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground shrink-0">{c.kbd}</kbd>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="px-3 h-8 border-t border-border flex items-center gap-3 text-[10px] text-muted-foreground">
          <span><kbd className="border border-border rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="border border-border rounded px-1">↵</kbd> open</span>
          <span><kbd className="border border-border rounded px-1">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

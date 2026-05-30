import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import {
  Bot, Play, Pause, Loader2, MessageSquare,
  ArrowLeft, Globe, ChevronDown, Sprout, Command, X, Upload,
} from "lucide-react";
import { ImportProjectDialog } from "@/components/editor/ImportProjectDialog";
import { cn } from "@/lib/utils";
import type { Project, Run } from "@/types";

interface Props {
  project: Project;
  latestRun?: Run | null;
  isRunning: boolean;
  processRunning?: boolean;
  onRun: () => void;
  onStop?: () => void;
  chatOpen: boolean;
  onChatToggle: () => void;
  previewOpen: boolean;
  onPreviewToggle: () => void;
  autoDevEnabled: boolean;
  onAutoDevToggle: () => void;
  growthCount?: number;
  onCommandPalette: () => void;
}

const LANG_COLORS: Record<string, string> = {
  nodejs:     "bg-green-500",
  python:     "bg-yellow-400",
  typescript: "bg-blue-500",
  html:       "bg-orange-400",
  go:         "bg-cyan-400",
  rust:       "bg-orange-600",
  ruby:       "bg-red-400",
  java:       "bg-red-500",
};

const LANG_LABELS: Record<string, string> = {
  nodejs: "Node", python: "Python", typescript: "TypeScript", html: "HTML",
  go: "Go", rust: "Rust", ruby: "Ruby", java: "Java", php: "PHP",
  cpp: "C++", csharp: "C#",
};

export function WorkspaceTopbar({
  project, latestRun, isRunning, processRunning = false, onRun, onStop,
  chatOpen, onChatToggle,
  previewOpen, onPreviewToggle,
  autoDevEnabled, onAutoDevToggle, growthCount = 0,
  onCommandPalette,
}: Props) {
  const [importOpen, setImportOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileMenuOpen]);

  const runStatus = latestRun?.status;
  const dotColor =
    runStatus === "success" ? "bg-green-500"
    : runStatus === "error"   ? "bg-red-500"
    : runStatus === "running" ? "bg-amber-400 animate-pulse"
    : "bg-muted-foreground/30";

  return (
    <>
      <div className="h-11 border-b border-border flex items-center gap-1 px-2 bg-background shrink-0">
        {/* Back + brand */}
        <Link href="/dashboard"
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted mr-0.5">
          <ArrowLeft className="w-4 h-4" />
          <Bot className="w-4 h-4 text-primary" />
        </Link>

        {/* Project name + language badge */}
        <div className="flex items-center gap-2 mr-2 min-w-0">
          <div className={cn("w-2 h-2 rounded-full shrink-0", LANG_COLORS[project.language] ?? "bg-muted-foreground/50")} />
          <span className="text-sm font-semibold truncate max-w-[110px] sm:max-w-[180px]">{project.name}</span>
          <span className="hidden sm:flex items-center text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
            {LANG_LABELS[project.language] ?? project.language}
          </span>
        </div>

        {/* Run status dot */}
        {latestRun && (
          <div className="hidden sm:flex items-center gap-1.5 mr-1">
            <div className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
            <span className="text-[11px] text-muted-foreground capitalize">{runStatus}</span>
          </div>
        )}

        <div className="flex-1" />

        {/* Command palette shortcut */}
        <button onClick={onCommandPalette} title="Command Palette (Ctrl+K)"
          className="hidden md:flex items-center gap-1.5 h-7 px-2 rounded-md border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mr-1">
          <Command className="w-3 h-3" />
          <span className="hidden lg:inline">Search…</span>
          <kbd className="hidden lg:inline text-[10px] px-1 rounded bg-muted border border-border">⌘K</kbd>
        </button>

        {/* Run / Pause — single play/pause toggle, Replit-style */}
        {processRunning ? (
          <button onClick={onStop} title="Pause the running app"
            className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-sm font-semibold transition-all shrink-0 bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20">
            <Pause className="w-3.5 h-3.5 fill-current" />
            <span>Pause</span>
          </button>
        ) : (
          <button onClick={onRun} disabled={isRunning}
            className={cn(
              "flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-sm font-semibold transition-all shrink-0",
              isRunning
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/30 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-500 text-white shadow-sm",
            )}>
            {isRunning
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Starting…</span></>
              : <><Play className="w-3.5 h-3.5 fill-current" /><span>Run</span></>}
          </button>
        )}

        {/* Auto-develop (Grow) */}
        <button onClick={onAutoDevToggle}
          title={autoDevEnabled ? `Grow mode ON — ${growthCount} cycle${growthCount !== 1 ? "s" : ""} — click to stop` : "Auto-develop: AI grows your project like a tree"}
          className={cn(
            "relative hidden md:flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-semibold transition-all shrink-0 ml-1",
            autoDevEnabled
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40"
              : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent",
          )}>
          {autoDevEnabled && <span className="absolute inset-0 rounded-lg animate-pulse bg-emerald-500/10 pointer-events-none" />}
          <Sprout className={cn("w-3.5 h-3.5 shrink-0", autoDevEnabled && "animate-pulse")} />
          <span className="hidden sm:inline text-xs">
            {autoDevEnabled ? (growthCount > 0 ? `🍎 ×${growthCount}` : "Growing…") : "Grow"}
          </span>
        </button>

        {/* View toggles — desktop only */}
        <div className="hidden md:flex items-center gap-0.5 ml-1">
          <TooltipBtn label="Preview" active={previewOpen} onClick={onPreviewToggle}>
            <Globe className="w-4 h-4" />
          </TooltipBtn>
          <div className="w-px h-4 bg-border mx-0.5" />
          <TooltipBtn label="AI Assistant" active={chatOpen} onClick={onChatToggle}>
            <MessageSquare className="w-4 h-4" />
          </TooltipBtn>
          <TooltipBtn label="Import project" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" />
          </TooltipBtn>
        </div>

        {/* Mobile: panel menu */}
        <div className="md:hidden relative ml-1" ref={mobileMenuRef}>
          <button onClick={() => setMobileMenuOpen(v => !v)}
            className={cn("p-1.5 rounded transition-colors",
              mobileMenuOpen ? "bg-muted text-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground")}>
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {mobileMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-background shadow-lg py-1">
              {[
                { label: "Preview",  icon: <Globe className="w-4 h-4" />,         active: previewOpen,  onClick: () => { onPreviewToggle();  setMobileMenuOpen(false); } },
                { label: "AI Chat",  icon: <MessageSquare className="w-4 h-4" />, active: chatOpen,     onClick: () => { onChatToggle();     setMobileMenuOpen(false); } },
              ].map(item => (
                <button key={item.label} onClick={item.onClick}
                  className={cn("w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                    item.active ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}>
                  {item.icon}
                  {item.label}
                  {item.active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {importOpen && <ImportProjectDialog onOpenChange={setImportOpen} />}
    </>
  );
}

function TooltipBtn({
  children, label, active, onClick,
}: {
  children: React.ReactNode; label: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} title={label}
      className={cn("p-1.5 rounded hover:bg-muted transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

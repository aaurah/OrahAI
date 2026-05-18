import { useState } from "react";
import { Link } from "wouter";
import {
  Bot, Play, Square, Loader2, MessageSquare, Terminal as TerminalIcon,
  ArrowLeft, Github, Globe, KeyRound, Rocket, Upload, ChevronDown, Sprout,
} from "lucide-react";
import { ImportProjectDialog } from "@/components/editor/ImportProjectDialog";
import { cn } from "@/lib/utils";
import type { Project, Run } from "@/types";

interface Props {
  project: Project;
  latestRun?: Run | null;
  isRunning: boolean;
  onRun: () => void;
  chatOpen: boolean;
  onChatToggle: () => void;
  terminalOpen: boolean;
  onTerminalToggle: () => void;
  githubOpen: boolean;
  onGithubToggle: () => void;
  previewOpen: boolean;
  onPreviewToggle: () => void;
  secretsOpen: boolean;
  onSecretsToggle: () => void;
  deployOpen: boolean;
  onDeployToggle: () => void;
  autoDevEnabled: boolean;
  onAutoDevToggle: () => void;
  growthCount?: number;
}

const LANG_COLORS: Record<string, string> = {
  nodejs:     "bg-green-500",
  python:     "bg-yellow-400",
  typescript: "bg-blue-500",
  html:       "bg-orange-400",
};

const LANG_LABELS: Record<string, string> = {
  nodejs: "Node", python: "Python", typescript: "TypeScript", html: "HTML",
};

export function WorkspaceTopbar({
  project, latestRun, isRunning, onRun,
  chatOpen, onChatToggle,
  terminalOpen, onTerminalToggle,
  githubOpen, onGithubToggle,
  previewOpen, onPreviewToggle,
  secretsOpen, onSecretsToggle,
  deployOpen, onDeployToggle,
  autoDevEnabled, onAutoDevToggle, growthCount = 0,
}: Props) {
  const [importOpen, setImportOpen] = useState(false);

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

        {/* Run status dot (desktop) */}
        {latestRun && (
          <div className="hidden sm:flex items-center gap-1.5 mr-1">
            <div className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
            <span className="text-[11px] text-muted-foreground capitalize">{runStatus}</span>
          </div>
        )}

        <div className="flex-1" />

        {/* ── Run button ──────────────────────────────────────────────── */}
        <button
          onClick={onRun}
          disabled={isRunning}
          className={cn(
            "flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-sm font-semibold transition-all shrink-0",
            isRunning
              ? "bg-amber-500/10 text-amber-400 border border-amber-500/30 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-500 text-white shadow-sm",
          )}
        >
          {isRunning ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden sm:inline">Running</span></>
          ) : (
            <><Play className="w-3.5 h-3.5 fill-current" /><span className="hidden sm:inline">Run</span></>
          )}
        </button>

        {/* ── Auto-develop button ─────────────────────────────────────── */}
        <button
          onClick={onAutoDevToggle}
          title={autoDevEnabled
            ? `Auto-develop ON — ${growthCount} growth cycle${growthCount !== 1 ? "s" : ""} run — click to stop`
            : "Auto-develop: AI grows your project like a tree, continuously"}
          className={cn(
            "relative flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-semibold transition-all shrink-0 ml-1",
            autoDevEnabled
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40"
              : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent",
          )}
        >
          {autoDevEnabled && (
            <span className="absolute inset-0 rounded-lg animate-pulse bg-emerald-500/10 pointer-events-none" />
          )}
          <Sprout className={cn("w-3.5 h-3.5 shrink-0", autoDevEnabled && "animate-bounce")} />
          <span className="hidden sm:inline text-xs">
            {autoDevEnabled
              ? growthCount > 0 ? `🍎 ×${growthCount}` : "Growing…"
              : "Grow"}
          </span>
        </button>

        {/* ── Desktop panel toggles ──────────────────────────────────── */}
        <div className="hidden md:flex items-center gap-0.5 ml-1">
          <TooltipBtn label="Preview" active={previewOpen} onClick={onPreviewToggle}>
            <Globe className="w-4 h-4" />
          </TooltipBtn>
          <TooltipBtn label="Console" active={terminalOpen} onClick={onTerminalToggle}>
            <TerminalIcon className="w-4 h-4" />
          </TooltipBtn>
          <TooltipBtn label="AI Chat" active={chatOpen} onClick={onChatToggle}>
            <MessageSquare className="w-4 h-4" />
          </TooltipBtn>
          <div className="w-px h-4 bg-border mx-0.5" />
          <TooltipBtn label="Import" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" />
          </TooltipBtn>
          <TooltipBtn label="GitHub" active={githubOpen} onClick={onGithubToggle} highlight={!!project.githubRepo}>
            <Github className="w-4 h-4" />
          </TooltipBtn>
          <TooltipBtn label="Secrets" active={secretsOpen} onClick={onSecretsToggle}>
            <KeyRound className="w-4 h-4" />
          </TooltipBtn>
          <TooltipBtn label="Deploy" active={deployOpen} onClick={onDeployToggle}>
            <Rocket className="w-4 h-4" />
          </TooltipBtn>
        </div>

        {/* Mobile: chevron dropdown hint */}
        <button className="md:hidden ml-1 p-1.5 rounded hover:bg-muted text-muted-foreground">
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {importOpen && <ImportProjectDialog onOpenChange={setImportOpen} />}
    </>
  );
}

function TooltipBtn({
  children, label, active, highlight, onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "p-1.5 rounded hover:bg-muted transition-colors",
        active    ? "bg-muted text-foreground"
        : highlight ? "text-primary"
        : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

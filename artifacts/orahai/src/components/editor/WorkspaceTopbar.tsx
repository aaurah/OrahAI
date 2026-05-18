import { useState } from "react";
import { Link } from "wouter";
import {
  Bot, Play, Loader2, MessageSquare, Terminal as TerminalIcon,
  ArrowLeft, Circle, Github, Globe, KeyRound, Rocket, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
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
}

const LANG_ICONS: Record<string, string> = {
  nodejs: "🟩", python: "🐍", typescript: "🔷", html: "🌐",
};

export function WorkspaceTopbar({
  project, latestRun, isRunning, onRun,
  chatOpen, onChatToggle,
  terminalOpen, onTerminalToggle,
  githubOpen, onGithubToggle,
  previewOpen, onPreviewToggle,
  secretsOpen, onSecretsToggle,
  deployOpen, onDeployToggle,
}: Props) {
  const [importOpen, setImportOpen] = useState(false);

  const statusColor =
    latestRun?.status === "success" ? "text-green-500"
    : latestRun?.status === "error" ? "text-destructive"
    : latestRun?.status === "running" ? "text-amber-400 animate-pulse"
    : "text-muted-foreground";

  return (
    <>
      <div className="h-12 border-b border-border flex items-center gap-1.5 px-3 bg-background shrink-0">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors mr-1">
          <ArrowLeft className="w-4 h-4" />
          <Bot className="w-5 h-5 text-primary" />
        </Link>

        <span className="text-sm font-semibold truncate max-w-[120px] sm:max-w-[180px]">
          {LANG_ICONS[project.language] ?? "📁"} {project.name}
        </span>

        <span className="text-muted-foreground/40 text-xs hidden sm:block capitalize">
          · {project.language}
        </span>

        <div className="flex-1" />

        {latestRun && (
          <div className={cn("flex items-center gap-1 text-xs", statusColor)}>
            <Circle className="w-2 h-2 fill-current" />
            <span className="capitalize hidden sm:inline">{latestRun.status}</span>
          </div>
        )}

        <Button
          size="sm"
          variant={isRunning ? "outline" : "default"}
          onClick={onRun}
          disabled={isRunning}
          className="gap-1.5 h-8 px-3"
        >
          {isRunning ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden sm:inline">Running</span></>
          ) : (
            <><Play className="w-3.5 h-3.5" /><span className="hidden sm:inline">Run</span></>
          )}
        </Button>

        {/* Desktop-only panel toggles */}
        <div className="hidden md:flex items-center gap-0.5">
          <button
            onClick={() => setImportOpen(true)}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Import project"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={onPreviewToggle}
            className={cn("p-1.5 rounded hover:bg-muted transition-colors",
              previewOpen ? "bg-muted text-primary" : "text-muted-foreground")}
            title="Toggle preview"
          >
            <Globe className="w-4 h-4" />
          </button>
          <button
            onClick={onTerminalToggle}
            className={cn("p-1.5 rounded hover:bg-muted transition-colors",
              terminalOpen ? "bg-muted text-foreground" : "text-muted-foreground")}
            title="Toggle terminal"
          >
            <TerminalIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onChatToggle}
            className={cn("p-1.5 rounded hover:bg-muted transition-colors",
              chatOpen ? "bg-muted text-foreground" : "text-muted-foreground")}
            title="Toggle AI chat"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={onSecretsToggle}
            className={cn("p-1.5 rounded hover:bg-muted transition-colors",
              secretsOpen ? "bg-muted text-foreground" : "text-muted-foreground")}
            title="Secrets / env vars"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <button
            onClick={onDeployToggle}
            className={cn("p-1.5 rounded hover:bg-muted transition-colors",
              deployOpen ? "bg-muted text-primary" : "text-muted-foreground")}
            title="Deploy"
          >
            <Rocket className="w-4 h-4" />
          </button>
          <button
            onClick={onGithubToggle}
            className={cn(
              "p-1.5 rounded hover:bg-muted transition-colors",
              githubOpen ? "bg-muted text-foreground" : "text-muted-foreground",
              project.githubRepo && "text-primary",
            )}
            title="GitHub sync"
          >
            <Github className="w-4 h-4" />
          </button>
        </div>
      </div>

      {importOpen && (
        <ImportProjectDialog onOpenChange={setImportOpen} />
      )}
    </>
  );
}

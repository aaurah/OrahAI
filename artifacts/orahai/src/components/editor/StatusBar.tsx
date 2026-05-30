import { Play, Square, Loader2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  isRunning: boolean;
  processRunning: boolean;
  onRun: () => void;
  onStop: () => void;
  onOpenPreview?: () => void;
  livePort?: number | null;
  runStatus?: string | null;
  language?: string;
  className?: string;
}

const LANG_LABELS: Record<string, string> = {
  nodejs: "Node", python: "Python", typescript: "TypeScript", html: "HTML",
  go: "Go", rust: "Rust", ruby: "Ruby", java: "Java", php: "PHP",
  cpp: "C++", csharp: "C#",
};

export function StatusBar({
  isRunning, processRunning, onRun, onStop, onOpenPreview, livePort, runStatus, language, className,
}: Props) {
  const dotColor =
    processRunning ? "bg-amber-400 animate-pulse"
    : runStatus === "success" ? "bg-green-500"
    : runStatus === "error" ? "bg-red-500"
    : "bg-muted-foreground/30";

  const statusLabel =
    processRunning ? "Running"
    : isRunning ? "Starting…"
    : runStatus === "success" ? "Stopped"
    : runStatus === "error" ? "Error"
    : "Ready";

  return (
    <div
      className={cn(
        "h-7 border-t border-border bg-background flex items-center gap-2 px-1.5 text-xs shrink-0 select-none",
        className,
      )}
    >
      {/* Play / Stop — bottom-left, Replit-style */}
      {processRunning ? (
        <button
          onClick={onStop}
          title="Stop the running process"
          className="flex items-center gap-1.5 h-5 pl-1.5 pr-2 rounded font-semibold text-red-400 hover:bg-red-500/15 transition-colors"
        >
          <Square className="w-3 h-3 fill-current" />
          <span>Stop</span>
        </button>
      ) : (
        <button
          onClick={onRun}
          disabled={isRunning}
          title="Run project (Ctrl+Enter)"
          className={cn(
            "flex items-center gap-1.5 h-5 pl-1.5 pr-2 rounded font-semibold transition-colors",
            isRunning
              ? "text-amber-400 cursor-not-allowed"
              : "text-green-500 hover:bg-green-500/15",
          )}
        >
          {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
          <span>{isRunning ? "Starting…" : "Run"}</span>
        </button>
      )}

      <div className="w-px h-4 bg-border" />

      {/* Live status */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor)} />
        <span>{statusLabel}</span>
      </div>

      {/* Detected port — opens the in-app preview */}
      {processRunning && livePort && (
        onOpenPreview ? (
          <button
            onClick={onOpenPreview}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            title={`App is serving on port ${livePort} — open preview`}
          >
            <Globe className="w-3 h-3" />
            <span>port {livePort}</span>
          </button>
        ) : (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Globe className="w-3 h-3" />
            <span>port {livePort}</span>
          </span>
        )
      )}

      <div className="flex-1" />

      {language && (
        <span className="text-muted-foreground/70">{LANG_LABELS[language] ?? language}</span>
      )}
    </div>
  );
}

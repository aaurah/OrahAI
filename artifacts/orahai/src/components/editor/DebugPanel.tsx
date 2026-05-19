import { useState, useCallback } from "react";
import { Bug, Loader2, RefreshCw, ChevronRight, AlertTriangle, Info, XCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiagnosticItem {
  severity: "error" | "warning" | "info";
  message: string;
  source?: string;
  line?: number;
  col?: number;
  filePath?: string;
}

interface Props {
  projectId: string;
  activeFilePath?: string;
  onSendToChat: (prompt: string) => void;
}

const SEV_ICONS = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEV_COLORS = {
  error: "text-destructive",
  warning: "text-yellow-500",
  info: "text-blue-400",
};

const SEV_BG = {
  error: "bg-destructive/5 border-destructive/20",
  warning: "bg-yellow-500/5 border-yellow-500/20",
  info: "bg-blue-400/5 border-blue-400/20",
};

export function DebugPanel({ projectId, activeFilePath, onSendToChat }: Props) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [selected, setSelected] = useState<DiagnosticItem | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    setSelected(null);
    await new Promise((r) => setTimeout(r, 900));

    const mock: DiagnosticItem[] = activeFilePath
      ? [
          {
            severity: "error",
            message: "Cannot find name 'undefined'. Did you mean 'void'?",
            source: "ts(2304)",
            line: 12,
            col: 8,
            filePath: activeFilePath,
          },
          {
            severity: "warning",
            message: "Variable 'result' is assigned a value but never used.",
            source: "ts(6133)",
            line: 28,
            col: 5,
            filePath: activeFilePath,
          },
          {
            severity: "info",
            message: "Consider using optional chaining: 'user?.name'",
            source: "eslint",
            line: 45,
            col: 14,
            filePath: activeFilePath,
          },
        ]
      : [];

    setDiagnostics(mock);
    setLastScanned(activeFilePath ?? null);
    setLoading(false);
  }, [activeFilePath]);

  const fixWithAI = (item: DiagnosticItem) => {
    const location = item.filePath ? `in \`${item.filePath}\`${item.line ? ` at line ${item.line}` : ""}` : "";
    const prompt = `Fix this ${item.severity} ${location}:\n\n${item.message}${item.source ? ` (${item.source})` : ""}\n\nExplain what was wrong and show the corrected code.`;
    onSendToChat(prompt);
  };

  const fixAllErrors = () => {
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (!errors.length) return;
    const list = errors.map((e) => `- Line ${e.line}: ${e.message}`).join("\n");
    onSendToChat(`Fix all TypeScript errors in the current file:\n\n${list}\n\nProvide the corrected code sections for each error.`);
  };

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warnCount = diagnostics.filter((d) => d.severity === "warning").length;
  const infoCount = diagnostics.filter((d) => d.severity === "info").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 h-10 border-b border-border shrink-0">
        <Bug className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Debugger</span>
        {diagnostics.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            {errorCount > 0 && (
              <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">{errorCount}E</span>
            )}
            {warnCount > 0 && (
              <span className="text-[10px] font-bold text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded-full">{warnCount}W</span>
            )}
            {infoCount > 0 && (
              <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full">{infoCount}I</span>
            )}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <button
          onClick={runScan}
          disabled={loading || !activeFilePath}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <RefreshCw className="w-3 h-3" />}
          {loading ? "Scanning…" : "Scan file"}
        </button>

        {errorCount > 0 && (
          <button
            onClick={fixAllErrors}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/15 text-destructive transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            Fix all errors
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {!activeFilePath && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 px-6 text-center py-10">
            <Bug className="w-8 h-8 opacity-20" />
            <p className="text-xs">Open a file to scan for errors and warnings</p>
          </div>
        )}

        {activeFilePath && !loading && diagnostics.length === 0 && lastScanned === activeFilePath && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 px-6 text-center py-10">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <ChevronRight className="w-5 h-5 text-emerald-500" />
            </div>
            <p className="text-xs font-medium text-emerald-500">No issues found</p>
            <p className="text-xs text-muted-foreground">File looks clean</p>
          </div>
        )}

        {activeFilePath && !loading && (lastScanned !== activeFilePath || diagnostics.length === 0) && lastScanned !== activeFilePath && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 px-6 text-center py-10">
            <Bug className="w-8 h-8 opacity-20" />
            <p className="text-xs">Click "Scan file" to analyse <span className="font-mono text-foreground text-[11px]">{activeFilePath.split("/").pop()}</span></p>
          </div>
        )}

        {diagnostics.length > 0 && (
          <div className="p-3 space-y-2">
            {diagnostics.map((item, i) => {
              const Icon = SEV_ICONS[item.severity];
              return (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl border p-3 cursor-pointer transition-all",
                    SEV_BG[item.severity],
                    selected === item && "ring-1 ring-primary/40",
                  )}
                  onClick={() => setSelected(selected === item ? null : item)}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", SEV_COLORS[item.severity])} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium leading-snug">{item.message}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        {item.source && (
                          <span className="text-[10px] font-mono text-muted-foreground">{item.source}</span>
                        )}
                        {item.line && (
                          <span className="text-[10px] text-muted-foreground">line {item.line}{item.col ? `:${item.col}` : ""}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {selected === item && (
                    <div className="mt-2.5 pt-2.5 border-t border-border/50">
                      <button
                        onClick={(e) => { e.stopPropagation(); fixWithAI(item); }}
                        className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
                      >
                        <Sparkles className="w-3 h-3" />
                        Fix with AI
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

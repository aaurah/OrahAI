import { useState, useEffect, useRef } from "react";
import { Globe, RefreshCw, ExternalLink, Monitor, Github, Loader2, Terminal, Play } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Run } from "@/types";

interface PreviewPanelProps {
  projectId: string;
  language?: string;
  githubRepo?: string | null;
  latestRun?: Run | null;
  refreshKey?: number;
  onOpenConsole?: () => void;
}

type PreviewMode = "local" | "github";

const WEB_LANGUAGES = new Set(["html", "javascript", "nodejs"]);

export function PreviewPanel({
  projectId, language, githubRepo, latestRun, refreshKey, onOpenConsole,
}: PreviewPanelProps) {
  const [mode, setMode] = useState<PreviewMode>("local");
  const [iframeKey, setIframeKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isWebLang = WEB_LANGUAGES.has(language ?? "");

  const githubPagesUrl = githubRepo
    ? (() => { const [owner, repo] = githubRepo.split("/"); return `https://${owner}.github.io/${repo}/`; })()
    : null;

  const token = typeof window !== "undefined" ? localStorage.getItem("orahai_token") ?? "" : "";
  const BASE = API_BASE || "";
  const localSrc = `${BASE}/api/preview/${projectId}?token=${encodeURIComponent(token)}&v=${refreshKey ?? 0}`;
  const activeSrc = mode === "local" ? localSrc : (githubPagesUrl ?? localSrc);
  const displayUrl = mode === "local" ? `preview/${projectId}` : (githubPagesUrl ?? "preview");

  useEffect(() => {
    if (mode === "local") { setIframeKey((k) => k + 1); setLoading(true); setIframeError(false); }
  }, [refreshKey, mode]);

  const refresh = () => { setIframeKey((k) => k + 1); setLoading(true); setIframeError(false); };

  // For non-web projects, show a console-style output panel instead of an iframe
  if (!isWebLang) {
    const statusColor =
      latestRun?.status === "success" ? "text-green-400"
      : latestRun?.status === "error"   ? "text-red-400"
      : latestRun?.status === "running" ? "text-amber-400"
      : "text-slate-500";

    return (
      <div className="flex flex-col h-full bg-[#0d0d0d]">
        {/* Chrome */}
        <div className="flex items-center gap-2 px-3 h-9 border-b border-white/5 shrink-0 bg-[#111]">
          <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground flex-1 font-mono">Output</span>
          {latestRun && (
            <span className={cn("text-xs font-mono", statusColor)}>
              {latestRun.status}{latestRun.exitCode != null ? ` · exit ${latestRun.exitCode}` : ""}
            </span>
          )}
        </div>

        {/* Output body */}
        <div className="flex-1 overflow-auto p-4 font-mono text-sm text-slate-300">
          {latestRun?.status === "running" && (
            <div className="flex items-center gap-2 text-amber-400 mb-3">
              <span className="animate-pulse">●</span>
              <span>Running…</span>
            </div>
          )}

          {latestRun?.output ? (
            <pre className="whitespace-pre-wrap leading-5 text-slate-300">{latestRun.output}</pre>
          ) : (
            <div className="flex flex-col gap-4 pt-4">
              <div className="flex flex-col gap-1.5 text-slate-500">
                <span className="text-xs">$ _</span>
                <span className="text-xs opacity-60">No output yet — press Run to execute your project</span>
              </div>
              {onOpenConsole && (
                <button
                  onClick={onOpenConsole}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors w-fit"
                >
                  <Play className="w-3 h-3" />
                  Open Console
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Web project — show browser-like iframe preview
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 px-2 h-10 border-b border-border bg-muted/20 shrink-0">
        {/* Mode toggle */}
        <div className="flex items-center bg-muted rounded-md p-0.5 gap-0.5 shrink-0">
          <button
            onClick={() => { setMode("local"); refresh(); }}
            className={cn(
              "flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors font-medium",
              mode === "local" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Monitor className="w-2.5 h-2.5" />Local
          </button>
          <button
            onClick={() => { if (githubPagesUrl) { setMode("github"); refresh(); } }}
            disabled={!githubPagesUrl}
            title={githubPagesUrl ? `Open ${githubPagesUrl}` : "Connect a GitHub repo first"}
            className={cn(
              "flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors font-medium",
              !githubPagesUrl && "opacity-40 cursor-not-allowed",
              mode === "github" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Github className="w-2.5 h-2.5" />Live
          </button>
        </div>

        {/* URL bar */}
        <div className="flex-1 flex items-center gap-1.5 bg-muted/40 rounded px-2 py-1 min-w-0">
          <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground font-mono truncate">{displayUrl}</span>
        </div>

        <button onClick={refresh} title="Refresh" className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
        <a href={activeSrc} target="_blank" rel="noopener noreferrer" title="Open in new tab"
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* iframe */}
      <div className="flex-1 relative overflow-hidden bg-white">
        {loading && !iframeError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {iframeError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10 gap-2 text-muted-foreground">
            <p className="text-sm">Preview failed to load</p>
            <button onClick={refresh} className="text-xs text-primary hover:underline">Retry</button>
          </div>
        )}
        {mode === "github" && githubPagesUrl ? (
          <iframe key={`gh-${iframeKey}`} src={githubPagesUrl} className="w-full h-full border-0" title="GitHub Pages Preview"
            onLoad={() => setLoading(false)} onError={() => { setLoading(false); setIframeError(true); }} />
        ) : (
          <iframe key={`local-${iframeKey}`} ref={iframeRef} src={localSrc} className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals" title="Local Preview"
            onLoad={() => setLoading(false)} onError={() => { setLoading(false); setIframeError(true); }} />
        )}
      </div>
    </div>
  );
}

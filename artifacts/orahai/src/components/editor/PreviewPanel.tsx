import { useState, useEffect, useRef } from "react";
import { Globe, RefreshCw, ExternalLink, Monitor, Github, AlertCircle, Loader2 } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { cn } from "@/lib/utils";

interface PreviewPanelProps {
  projectId: string;
  githubRepo?: string | null;
  refreshKey?: number;
}

type PreviewMode = "local" | "github";

export function PreviewPanel({ projectId, githubRepo, refreshKey }: PreviewPanelProps) {
  const [mode, setMode] = useState<PreviewMode>("local");
  const [iframeKey, setIframeKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build GitHub Pages URL from "owner/repo"
  const githubPagesUrl = githubRepo
    ? (() => {
        const [owner, repo] = githubRepo.split("/");
        return `https://${owner}.github.io/${repo}/`;
      })()
    : null;

  // Local preview URL — JWT from localStorage
  const token = typeof window !== "undefined" ? localStorage.getItem("orahai_token") ?? "" : "";
  const BASE = API_BASE || "";
  const localSrc = `${BASE}/api/preview/${projectId}?token=${encodeURIComponent(token)}&v=${refreshKey ?? 0}`;

  const activeSrc = mode === "local" ? localSrc : (githubPagesUrl ?? localSrc);
  const displayUrl = mode === "local" ? `preview/${projectId}` : (githubPagesUrl ?? "preview");

  // Auto-refresh local preview when refreshKey changes
  useEffect(() => {
    if (mode === "local") {
      setIframeKey((k) => k + 1);
      setLoading(true);
      setError(false);
    }
  }, [refreshKey, mode]);

  const refresh = () => {
    setIframeKey((k) => k + 1);
    setLoading(true);
    setError(false);
  };

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
            <Monitor className="w-2.5 h-2.5" />
            Local
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
            <Github className="w-2.5 h-2.5" />
            Live
          </button>
        </div>

        {/* URL bar */}
        <div className="flex-1 flex items-center gap-1.5 bg-muted/40 rounded px-2 py-1 min-w-0">
          <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground font-mono truncate">{displayUrl}</span>
        </div>

        {/* Controls */}
        <button
          onClick={refresh}
          title="Refresh preview"
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>

        <a
          href={activeSrc}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in new tab"
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* iframe */}
      <div className="flex-1 relative overflow-hidden bg-white">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10 gap-2 text-muted-foreground">
            <AlertCircle className="w-6 h-6" />
            <p className="text-sm">Preview failed to load</p>
            <button onClick={refresh} className="text-xs text-primary hover:underline">Retry</button>
          </div>
        )}

        {mode === "github" && githubPagesUrl ? (
          <iframe
            key={`gh-${iframeKey}`}
            src={githubPagesUrl}
            className="w-full h-full border-0"
            title="GitHub Pages Preview"
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        ) : (
          <iframe
            key={`local-${iframeKey}`}
            ref={iframeRef}
            src={localSrc}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
            title="Local Preview"
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        )}
      </div>
    </div>
  );
}

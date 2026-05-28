import { useState, useRef, useEffect, useCallback } from "react";
import { Globe, RefreshCw, ExternalLink, Monitor, Github, Loader2 } from "lucide-react";
import { API_BASE, api } from "@/lib/api";
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

export function PreviewPanel({
  projectId, githubRepo, refreshKey,
}: PreviewPanelProps) {
  const [mode, setMode] = useState<PreviewMode>("local");
  const [iframeKey, setIframeKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const githubPagesUrl = githubRepo
    ? (() => { const [owner, repo] = githubRepo.split("/"); return `https://${owner}.github.io/${repo}/`; })()
    : null;

  const BASE = API_BASE || "";

  const fetchPreviewToken = useCallback(async (): Promise<string | null> => {
    try {
      const { token } = await api.post<{ token: string }>(`/api/preview/${projectId}/token`);
      return token;
    } catch {
      return null;
    }
  }, [projectId]);

  const loadLocalPreview = useCallback(async () => {
    setLoading(true);
    setIframeError(false);
    setPreviewSrc(null);
    const token = await fetchPreviewToken();
    if (!token) {
      setLoading(false);
      setIframeError(true);
      return;
    }
    const v = refreshKey ?? iframeKey;
    setPreviewSrc(`${BASE}/api/preview/${projectId}?token=${encodeURIComponent(token)}&v=${v}`);
  }, [projectId, fetchPreviewToken, refreshKey, iframeKey, BASE]);

  useEffect(() => {
    if (mode === "local") {
      loadLocalPreview();
    }
  }, [mode, iframeKey, refreshKey, projectId]);

  const refresh = () => {
    if (mode === "local") {
      setIframeKey((k) => k + 1);
    } else {
      setIframeKey((k) => k + 1);
      setLoading(true);
      setIframeError(false);
    }
  };

  const openInNewTab = async () => {
    if (mode === "github" && githubPagesUrl) {
      window.open(githubPagesUrl, "_blank", "noopener,noreferrer");
    } else {
      const token = await fetchPreviewToken();
      if (token) {
        const v = refreshKey ?? iframeKey;
        window.open(`${BASE}/api/preview/${projectId}?token=${encodeURIComponent(token)}&v=${v}`, "_blank", "noopener,noreferrer");
      }
    }
  };

  const displayUrl = mode === "local" ? `preview/${projectId}` : (githubPagesUrl ?? "preview");

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 px-2 h-10 border-b border-border bg-muted/20 shrink-0">
        {/* Mode toggle */}
        <div className="flex items-center bg-muted rounded-md p-0.5 gap-0.5 shrink-0">
          <button
            onClick={() => { setMode("local"); }}
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
            title={githubPagesUrl ? `Open ${githubPagesUrl}` : "Connect a GitHub repo to enable Live tab"}
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

        <button onClick={refresh} title="Refresh preview" className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
        <button onClick={openInNewTab} title="Open preview in new tab"
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0">
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* iframe — always shown; the server returns a helpful page when no index.html exists */}
      <div className="flex-1 relative overflow-hidden bg-white">
        {loading && !iframeError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {iframeError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10 gap-3 text-muted-foreground px-6 text-center">
            <Globe className="w-8 h-8 opacity-20" />
            <p className="text-sm font-medium">Preview unavailable</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              The preview could not load. Make sure you have an <code className="bg-muted px-1 rounded text-foreground">index.html</code> in your project files.
            </p>
            <button onClick={refresh} className="text-xs text-primary hover:underline mt-1">Try again</button>
          </div>
        )}
        {mode === "github" && githubPagesUrl ? (
          <iframe key={`gh-${iframeKey}`} src={githubPagesUrl} className="w-full h-full border-0"
            title="GitHub Pages Preview"
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setIframeError(true); }} />
        ) : (
          <iframe
            key={`local-${iframeKey}`}
            ref={iframeRef}
            src={previewSrc ?? undefined}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            title="Local Preview"
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setIframeError(true); }}
          />
        )}
      </div>
    </div>
  );
}

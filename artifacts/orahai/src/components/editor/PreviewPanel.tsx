import { useState, useRef, useCallback, useEffect } from "react";
import {
  Globe, RefreshCw, ExternalLink, Monitor, Github,
  Loader2, Plus, X, AlertCircle,
} from "lucide-react";
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

type TabKind = "local" | "github" | "custom";

interface PreviewTab {
  id: string;
  kind: TabKind;
  label: string;
  url?: string;       // for custom tabs
  iframeKey: number;
}

let _tabCounter = 0;
const newId = () => `tab-${++_tabCounter}`;

function useLocalPreview(projectId: string, refreshKey: number | undefined) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const BASE = API_BASE || "";

  const load = useCallback(async (vKey: number) => {
    setLoading(true);
    setError(false);
    setSrc(null);
    try {
      const { token } = await api.post<{ token: string }>(`/api/preview/${projectId}/token`);
      const v = refreshKey ?? vKey;
      setSrc(`${BASE}/api/preview/${projectId}?token=${encodeURIComponent(token)}&v=${v}`);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [projectId, BASE, refreshKey]);

  return { src, loading, setLoading, error, load };
}

// ── Single iframe pane ──────────────────────────────────────────────────────

function LocalPane({ projectId, iframeKey, refreshKey, onRefresh }: {
  projectId: string;
  iframeKey: number;
  refreshKey?: number;
  onRefresh: () => void;
}) {
  const { src, loading, setLoading, error, load } = useLocalPreview(projectId, refreshKey);

  useEffect(() => { load(iframeKey); }, [iframeKey, projectId]);

  return (
    <div className="absolute inset-0">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <EmptyState onRetry={onRefresh} />
      )}
      {src && (
        <iframe
          key={`local-${iframeKey}`}
          src={src}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          title="Local Preview"
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); }}
        />
      )}
    </div>
  );
}

function GithubPane({ url, iframeKey, onRefresh }: {
  url: string;
  iframeKey: number;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => { setLoading(true); setError(false); }, [iframeKey]);

  return (
    <div className="absolute inset-0">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && <EmptyState onRetry={onRefresh} message="GitHub Pages not reachable." />}
      <iframe
        key={`gh-${iframeKey}`}
        src={url}
        className="w-full h-full border-0"
        title="GitHub Pages Preview"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
      />
    </div>
  );
}

function CustomPane({ url, iframeKey, onRefresh }: {
  url: string;
  iframeKey: number;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => { setLoading(true); setError(false); }, [iframeKey, url]);

  if (!url) return <EmptyState onRetry={onRefresh} message="No URL entered." />;

  return (
    <div className="absolute inset-0">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && <EmptyState onRetry={onRefresh} message="Could not load URL." />}
      <iframe
        key={`custom-${iframeKey}-${url}`}
        src={url}
        className="w-full h-full border-0"
        title="Preview"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
      />
    </div>
  );
}

function EmptyState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background gap-3 text-muted-foreground px-6 text-center">
      <AlertCircle className="w-8 h-8 opacity-20" />
      <p className="text-sm font-medium">Preview unavailable</p>
      <p className="text-xs text-muted-foreground max-w-xs">
        {message ?? <>Make sure you have an <code className="bg-muted px-1 rounded text-foreground">index.html</code> in your project files.</>}
      </p>
      <button onClick={onRetry} className="text-xs text-primary hover:underline mt-1">Try again</button>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function PreviewPanel({ projectId, githubRepo, refreshKey }: PreviewPanelProps) {
  const BASE = API_BASE || "";

  const githubPagesUrl = githubRepo
    ? (() => { const [owner, repo] = githubRepo.split("/"); return `https://${owner}.github.io/${repo}/`; })()
    : null;

  const initialTabs: PreviewTab[] = [
    { id: newId(), kind: "local", label: "Local", iframeKey: 0 },
    ...(githubPagesUrl ? [{ id: newId(), kind: "github" as TabKind, label: "Live", iframeKey: 0 }] : []),
  ];

  const [tabs, setTabs] = useState<PreviewTab[]>(initialTabs);
  const [activeId, setActiveId] = useState<string>(initialTabs[0].id);
  const [urlBarValue, setUrlBarValue] = useState("");
  const [urlBarEditing, setUrlBarEditing] = useState(false);
  const urlBarRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find(t => t.id === activeId) ?? tabs[0];

  // Sync refreshKey → bump active local tab
  const prevRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== prevRefreshKey.current) {
      prevRefreshKey.current = refreshKey;
      setTabs(ts => ts.map(t => t.id === activeId && t.kind === "local"
        ? { ...t, iframeKey: t.iframeKey + 1 } : t));
    }
  }, [refreshKey]);

  // Keep URL bar in sync with active tab
  useEffect(() => {
    if (!urlBarEditing) {
      if (activeTab?.kind === "local") setUrlBarValue(`preview/${projectId}`);
      else if (activeTab?.kind === "github") setUrlBarValue(githubPagesUrl ?? "");
      else setUrlBarValue(activeTab?.url ?? "");
    }
  }, [activeTab, urlBarEditing, projectId, githubPagesUrl]);

  const refresh = () => {
    setTabs(ts => ts.map(t => t.id === activeId ? { ...t, iframeKey: t.iframeKey + 1 } : t));
  };

  const openInNewTab = async () => {
    if (!activeTab) return;
    if (activeTab.kind === "github" && githubPagesUrl) {
      window.open(githubPagesUrl, "_blank", "noopener,noreferrer");
    } else if (activeTab.kind === "custom" && activeTab.url) {
      window.open(activeTab.url, "_blank", "noopener,noreferrer");
    } else {
      try {
        const { token } = await api.post<{ token: string }>(`/api/preview/${projectId}/token`);
        const v = refreshKey ?? activeTab.iframeKey;
        window.open(`${BASE}/api/preview/${projectId}?token=${encodeURIComponent(token)}&v=${v}`, "_blank", "noopener,noreferrer");
      } catch { /* ignore */ }
    }
  };

  const addTab = () => {
    const id = newId();
    setTabs(ts => [...ts, { id, kind: "custom", label: "New tab", url: "", iframeKey: 0 }]);
    setActiveId(id);
    setUrlBarEditing(true);
    setTimeout(() => urlBarRef.current?.focus(), 50);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(ts => {
      const next = ts.filter(t => t.id !== id);
      if (next.length === 0) return ts; // always keep ≥1 tab
      return next;
    });
    if (activeId === id) {
      setTabs(ts => {
        const next = ts.filter(t => t.id !== id);
        if (next.length > 0) setActiveId(next[next.length - 1].id);
        return next;
      });
    }
  };

  const commitUrl = (raw: string) => {
    let url = raw.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    setTabs(ts => ts.map(t => {
      if (t.id !== activeId) return t;
      const label = url ? new URL(url).hostname.replace(/^www\./, "") : "New tab";
      return { ...t, url, label, iframeKey: t.iframeKey + 1 };
    }));
    setUrlBarEditing(false);
  };

  const tabIcon = (tab: PreviewTab) => {
    if (tab.kind === "local") return <Monitor className="w-3 h-3 shrink-0" />;
    if (tab.kind === "github") return <Github className="w-3 h-3 shrink-0" />;
    return <Globe className="w-3 h-3 shrink-0" />;
  };

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Tab bar ── */}
      <div className="flex items-end gap-0 border-b border-border bg-muted/10 shrink-0 overflow-x-auto no-scrollbar">
        {tabs.map(tab => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveId(tab.id)}
              className={cn(
                "group flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium shrink-0 border-r border-border/40 transition-colors min-w-0 max-w-[140px] relative",
                active
                  ? "bg-background text-foreground border-b-2 border-b-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              )}
            >
              {tabIcon(tab)}
              <span className="truncate">{tab.label}</span>
              {tabs.length > 1 && (
                <span
                  role="button"
                  onClick={(e) => closeTab(tab.id, e)}
                  className={cn(
                    "ml-auto w-4 h-4 flex items-center justify-center rounded transition-colors shrink-0",
                    active ? "opacity-60 hover:opacity-100 hover:bg-muted" : "opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-muted",
                  )}
                >
                  <X className="w-2.5 h-2.5" />
                </span>
              )}
            </button>
          );
        })}

        {/* Add tab */}
        <button
          onClick={addTab}
          title="Open new tab"
          className="flex items-center justify-center w-8 h-8 mb-0.5 ml-0.5 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── URL / toolbar bar ── */}
      <div className="flex items-center gap-1.5 px-2 h-9 border-b border-border bg-muted/10 shrink-0">
        {/* URL bar */}
        <div className="flex-1 flex items-center gap-1.5 bg-muted/50 hover:bg-muted/70 focus-within:bg-muted rounded-md px-2.5 py-1 min-w-0 transition-colors">
          <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
          {activeTab?.kind !== "local" && activeTab?.kind !== "github" ? (
            <input
              ref={urlBarRef}
              value={urlBarValue}
              onChange={e => setUrlBarValue(e.target.value)}
              onFocus={() => setUrlBarEditing(true)}
              onBlur={() => commitUrl(urlBarValue)}
              onKeyDown={e => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
              placeholder="Enter URL…"
              className="flex-1 bg-transparent text-[11px] font-mono outline-none text-foreground placeholder:text-muted-foreground min-w-0"
            />
          ) : (
            <span
              className="flex-1 text-[11px] text-muted-foreground font-mono truncate cursor-default select-none"
              title={urlBarValue}
            >
              {urlBarValue}
            </span>
          )}
        </div>

        <button onClick={refresh} title="Refresh" className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button onClick={openInNewTab} title="Open in new tab" className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0">
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 relative overflow-hidden bg-white">
        {tabs.map(tab => (
          <div key={tab.id} className={cn("absolute inset-0", tab.id !== activeId && "hidden")}>
            {tab.kind === "local" && (
              <LocalPane
                projectId={projectId}
                iframeKey={tab.iframeKey}
                refreshKey={refreshKey}
                onRefresh={refresh}
              />
            )}
            {tab.kind === "github" && githubPagesUrl && (
              <GithubPane url={githubPagesUrl} iframeKey={tab.iframeKey} onRefresh={refresh} />
            )}
            {tab.kind === "custom" && (
              <CustomPane url={tab.url ?? ""} iframeKey={tab.iframeKey} onRefresh={refresh} />
            )}
          </div>
        ))}
      </div>

    </div>
  );
}

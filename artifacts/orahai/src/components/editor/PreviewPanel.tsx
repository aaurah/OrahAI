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

// ── Tab model ──────────────────────────────────────────────────────────────

type TabKind = "local" | "url" | "github";

interface PreviewTab {
  id: string;
  kind: TabKind;
  label: string;
  icon: "monitor" | "github" | "globe";
  url?: string;          // for url/github kinds
  iframeKey: number;
  pinned?: boolean;      // preset tabs can't be closed
}

let _tabCounter = 0;
const newId = () => `tab-${++_tabCounter}`;

// ── Sub-panes ──────────────────────────────────────────────────────────────

function LocalPane({
  projectId, iframeKey, refreshKey, onRefresh,
}: {
  projectId: string; iframeKey: number; refreshKey?: number; onRefresh: () => void;
}) {
  const BASE = API_BASE || "";
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (key: number) => {
    setLoading(true); setError(false); setSrc(null);
    try {
      const { token } = await api.post<{ token: string }>(`/api/preview/${projectId}/token`);
      const v = refreshKey ?? key;
      setSrc(`${BASE}/api/preview/${projectId}?token=${encodeURIComponent(token)}&v=${v}`);
    } catch { setError(true); setLoading(false); }
  }, [projectId, BASE, refreshKey]);

  useEffect(() => { load(iframeKey); }, [iframeKey, projectId]);

  return (
    <div className="absolute inset-0">
      {loading && !error && <Spinner />}
      {error && <EmptyState onRetry={onRefresh} />}
      {src && (
        <iframe
          key={`local-${iframeKey}`}
          src={src}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
          title="Frontend Preview"
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      )}
    </div>
  );
}

function UrlPane({
  url, iframeKey, onRefresh,
}: {
  url: string; iframeKey: number; onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => { setLoading(true); setError(false); }, [iframeKey, url]);

  if (!url) return <EmptyState onRetry={onRefresh} message="No URL set." />;

  return (
    <div className="absolute inset-0">
      {loading && !error && <Spinner />}
      {error && <EmptyState onRetry={onRefresh} message="Could not load this URL." />}
      <iframe
        key={`url-${iframeKey}-${url}`}
        src={url}
        className="w-full h-full border-0"
        title="Preview"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
      />
    </div>
  );
}

function Spinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
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

// ── Icon helper ────────────────────────────────────────────────────────────

function TabIcon({ icon, className }: { icon: PreviewTab["icon"]; className?: string }) {
  const cls = cn("w-3 h-3 shrink-0", className);
  if (icon === "monitor") return <Monitor className={cls} />;
  if (icon === "github")  return <Github className={cls} />;
  return <Globe className={cls} />;
}

// ── Main component ─────────────────────────────────────────────────────────

export function PreviewPanel({ projectId, githubRepo, refreshKey }: PreviewPanelProps) {
  const BASE = API_BASE || "";

  const githubPagesUrl = githubRepo
    ? (() => { const [owner, repo] = githubRepo.split("/"); return `https://${owner}.github.io/${repo}/`; })()
    : null;

  const buildPresetTabs = (): PreviewTab[] => [
    { id: "frontend",  kind: "local",   label: "Frontend",    icon: "monitor", iframeKey: 0, pinned: true },
    ...(githubPagesUrl ? [{ id: "live", kind: "github" as TabKind, label: "Live", icon: "github" as const, iframeKey: 0, pinned: true, url: githubPagesUrl }] : []),
  ];

  const [tabs, setTabs] = useState<PreviewTab[]>(buildPresetTabs);
  const [activeId, setActiveId] = useState<string>("frontend");
  const [urlBarValue, setUrlBarValue] = useState("");
  const [urlBarEditing, setUrlBarEditing] = useState(false);
  const urlBarRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find(t => t.id === activeId) ?? tabs[0];

  // Sync external refreshKey → bump active frontend tab
  const prevRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== prevRefreshKey.current) {
      prevRefreshKey.current = refreshKey;
      setTabs(ts => ts.map(t => t.id === "frontend" ? { ...t, iframeKey: t.iframeKey + 1 } : t));
    }
  }, [refreshKey]);

  // Keep URL bar display in sync with active tab
  useEffect(() => {
    if (!urlBarEditing) {
      if (activeTab?.kind === "local") setUrlBarValue(`preview/${projectId}`);
      else setUrlBarValue(activeTab?.url ?? "");
    }
  }, [activeTab, urlBarEditing, projectId]);

  const refresh = () => {
    setTabs(ts => ts.map(t => t.id === activeId ? { ...t, iframeKey: t.iframeKey + 1 } : t));
  };

  const openInNewTab = async () => {
    if (!activeTab) return;
    if (activeTab.kind === "local") {
      try {
        const { token } = await api.post<{ token: string }>(`/api/preview/${projectId}/token`);
        const v = refreshKey ?? activeTab.iframeKey;
        window.open(`${BASE}/api/preview/${projectId}?token=${encodeURIComponent(token)}&v=${v}`, "_blank", "noopener,noreferrer");
      } catch { /* ignore */ }
    } else if (activeTab.url) {
      window.open(activeTab.url, "_blank", "noopener,noreferrer");
    }
  };

  const addCustomTab = () => {
    const id = newId();
    setTabs(ts => [...ts, { id, kind: "url", label: "New tab", icon: "globe", url: "", iframeKey: 0 }]);
    setActiveId(id);
    setUrlBarEditing(true);
    setTimeout(() => urlBarRef.current?.focus(), 60);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(ts => {
      const next = ts.filter(t => t.id !== id);
      if (next.length === 0) return ts;
      if (activeId === id) setActiveId(next[next.length - 1].id);
      return next;
    });
  };

  const commitUrl = (raw: string) => {
    let url = raw.trim();
    if (url && !/^https?:\/\//i.test(url) && !url.startsWith("/")) url = `https://${url}`;
    let label = "New tab";
    try { label = new URL(url, window.location.origin).hostname.replace(/^www\./, ""); } catch { /* keep */ }
    setTabs(ts => ts.map(t => t.id !== activeId ? t : { ...t, url, label, iframeKey: t.iframeKey + 1 }));
    setUrlBarEditing(false);
  };

  const isEditable = activeTab?.kind === "url" && !activeTab.pinned;

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
                "group flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium shrink-0 border-r border-border/40 transition-colors min-w-0 max-w-[140px] relative select-none",
                active
                  ? "bg-background text-foreground border-b-2 border-b-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              )}
            >
              <TabIcon icon={tab.icon}
                className={active ? (
                  tab.icon === "monitor" ? "text-sky-400" :
                  tab.icon === "github" ? "text-violet-400" : ""
                ) : ""}
              />
              <span className="truncate">{tab.label}</span>
              {!tab.pinned && (
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

        {/* New custom tab */}
        <button
          onClick={addCustomTab}
          title="Open new tab"
          className="flex items-center justify-center w-8 h-8 mb-0.5 ml-0.5 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Address / toolbar bar ── */}
      <div className="flex items-center gap-1.5 px-2 h-9 border-b border-border bg-muted/10 shrink-0">
        <div className="flex-1 flex items-center gap-1.5 bg-muted/50 hover:bg-muted/70 focus-within:bg-muted rounded-md px-2.5 py-1 min-w-0 transition-colors">
          <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
          {isEditable ? (
            <input
              ref={urlBarRef}
              value={urlBarValue}
              onChange={e => setUrlBarValue(e.target.value)}
              onFocus={() => setUrlBarEditing(true)}
              onBlur={() => commitUrl(urlBarValue)}
              onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
              placeholder="Enter URL…"
              className="flex-1 bg-transparent text-[11px] font-mono outline-none text-foreground placeholder:text-muted-foreground min-w-0"
            />
          ) : (
            <span className="flex-1 text-[11px] text-muted-foreground font-mono truncate cursor-default select-none" title={urlBarValue}>
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

      {/* ── Content ── */}
      <div className="flex-1 relative overflow-hidden bg-white">
        {tabs.map(tab => (
          <div key={tab.id} className={cn("absolute inset-0", tab.id !== activeId && "hidden")}>
            {tab.kind === "local" && (
              <LocalPane projectId={projectId} iframeKey={tab.iframeKey} refreshKey={refreshKey} onRefresh={refresh} />
            )}
            {tab.kind !== "local" && tab.url && (
              <UrlPane url={tab.url} iframeKey={tab.iframeKey} onRefresh={refresh} />
            )}
            {tab.kind !== "local" && !tab.url && (
              <EmptyState onRetry={refresh} message="No URL configured for this tab." />
            )}
          </div>
        ))}
      </div>

    </div>
  );
}

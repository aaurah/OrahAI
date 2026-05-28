import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import {
  Bot, Cpu, Cloud, CheckCircle2, XCircle, Download, Trash2,
  RefreshCw, ChevronDown, ChevronUp, Eye, Server, Zap, ExternalLink,
  AlertCircle, StopCircle, Wifi, WifiOff, Link,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, API_BASE } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { OLLAMA_MODEL_LIBRARY } from "@/lib/models";

type OllamaEndpoint = "server" | "remote";

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  details?: { parameter_size?: string; quantization_level?: string };
}

interface ProviderStatus {
  available: boolean;
  models?: string[];
  version?: string;
  configured?: boolean;
  url?: string | null;
}

interface ProvidersData {
  openai: ProviderStatus;
  anthropic: ProviderStatus;
  ollama: ProviderStatus;
  "ollama-remote": ProviderStatus;
}

interface InstalledModelsResponse {
  models: OllamaModel[];
  ollamaAvailable: boolean;
  endpoint: OllamaEndpoint;
}

interface PullState {
  model: string;
  endpoint: OllamaEndpoint;
  status: string;
  percent: number;
  done: boolean;
  error: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ── Provider Status Card ──────────────────────────────────────────────────────

function ProviderCard({
  name, icon, available, version, models, note,
}: {
  name: string;
  icon: React.ReactNode;
  available: boolean;
  version?: string;
  models?: string[];
  note?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn(
      "rounded-xl border p-4 transition-colors",
      available ? "border-green-500/20 bg-green-500/5" : "border-border bg-card",
    )}>
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", available ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground")}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{name}</span>
            {version && <span className="text-[10px] text-muted-foreground">v{version}</span>}
          </div>
          {note && <p className="text-xs text-muted-foreground mt-0.5 truncate">{note}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {available ? (
            <div className="flex items-center gap-1 text-green-400 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Ready
            </div>
          ) : (
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <XCircle className="w-3.5 h-3.5" /> Not configured
            </div>
          )}
          {models && models.length > 0 && (
            <button onClick={() => setExpanded(v => !v)}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
      {expanded && models && models.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap gap-1.5">
          {models.map(m => (
            <span key={m} className="text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border/40 text-muted-foreground font-mono">{m}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Installed Model Row ───────────────────────────────────────────────────────

function InstalledModelRow({ model, onDelete, deleting }: {
  model: OllamaModel;
  onDelete: (name: string) => void;
  deleting: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-medium truncate">{model.name}</span>
          {model.details?.parameter_size && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-medium shrink-0">
              {model.details.parameter_size}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{formatBytes(model.size)}</span>
          {model.details?.quantization_level && (
            <span className="text-xs text-muted-foreground">{model.details.quantization_level}</span>
          )}
        </div>
      </div>
      <button onClick={() => onDelete(model.name)} disabled={deleting}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all disabled:opacity-50"
        title="Remove model">
        {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ── Library Model Card ────────────────────────────────────────────────────────

function LibraryCard({ model, serverInstalled, remoteInstalled, pullingServer, pullingRemote, onPull, remoteConfigured }: {
  model: typeof OLLAMA_MODEL_LIBRARY[0];
  serverInstalled: boolean;
  remoteInstalled: boolean;
  pullingServer: boolean;
  pullingRemote: boolean;
  onPull: (id: string, endpoint: OllamaEndpoint) => void;
  remoteConfigured: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border p-4 flex flex-col gap-2",
      (serverInstalled || remoteInstalled) ? "border-green-500/20 bg-green-500/5" : "border-border bg-card",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold">{model.name}</span>
            {model.badge && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                {model.badge}
              </span>
            )}
            {model.vision && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium flex items-center gap-0.5">
                <Eye className="w-2.5 h-2.5" /> Vision
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
        </div>
        <span className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5">{model.size}</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {/* Server pull button */}
        {serverInstalled ? (
          <div className="flex items-center gap-1 text-green-400 text-xs font-medium">
            <CheckCircle2 className="w-3 h-3" /> Server
          </div>
        ) : (
          <button onClick={() => onPull(model.id, "server")} disabled={pullingServer}
            className={cn(
              "flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1 transition-colors",
              pullingServer ? "bg-muted text-muted-foreground cursor-wait" : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20",
            )}>
            {pullingServer ? <><RefreshCw className="w-3 h-3 animate-spin" /> Server…</> : <><Server className="w-3 h-3" /> Server</>}
          </button>
        )}

        {/* Remote pull button */}
        {remoteConfigured && (
          remoteInstalled ? (
            <div className="flex items-center gap-1 text-sky-400 text-xs font-medium">
              <CheckCircle2 className="w-3 h-3" /> Remote
            </div>
          ) : (
            <button onClick={() => onPull(model.id, "remote")} disabled={pullingRemote}
              className={cn(
                "flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1 transition-colors",
                pullingRemote ? "bg-muted text-muted-foreground cursor-wait" : "bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20",
              )}>
              {pullingRemote ? <><RefreshCw className="w-3 h-3 animate-spin" /> Remote…</> : <><Wifi className="w-3 h-3" /> Remote</>}
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ── Installed section ─────────────────────────────────────────────────────────

function InstalledSection({ label, icon, models, available, emptyNote, onDelete, deleting, endpoint }: {
  label: string;
  icon: React.ReactNode;
  models: OllamaModel[];
  available: boolean;
  emptyNote: string;
  onDelete: (name: string, endpoint: OllamaEndpoint) => void;
  deleting: string | null;
  endpoint: OllamaEndpoint;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          {icon}{label}
        </span>
        <span className="text-xs text-muted-foreground">({models.length})</span>
      </div>
      {!available ? (
        <div className="rounded-xl border bg-card p-4 text-center text-sm text-muted-foreground">{emptyNote}</div>
      ) : models.length === 0 ? (
        <div className="rounded-xl border bg-card p-4 text-center text-sm text-muted-foreground">No models installed yet — pull one from the library below.</div>
      ) : (
        <div className="rounded-xl border bg-card divide-y divide-border overflow-hidden">
          {models.map(m => (
            <InstalledModelRow key={m.name} model={m}
              onDelete={name => onDelete(name, endpoint)}
              deleting={deleting === `${endpoint}:${m.name}`} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

const FILTER_TAGS = ["all", "general", "code", "vision", "fast", "powerful", "embed"];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AiModelsPage() {
  const [, navigate] = useLocation();
  const [providers, setProviders] = useState<ProvidersData | null>(null);
  const [serverModels, setServerModels] = useState<OllamaModel[]>([]);
  const [remoteModels, setRemoteModels] = useState<OllamaModel[]>([]);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pulls, setPulls] = useState<Record<string, PullState>>({});
  const [filter, setFilter] = useState("all");
  const [remoteUrlInput, setRemoteUrlInput] = useState("");
  const abortRefs = useRef<Record<string, AbortController>>({});

  const remoteConfigured = !!(providers?.["ollama-remote"]?.url);

  const refresh = useCallback(async () => {
    try {
      const [provRes, serverRes, remoteRes] = await Promise.all([
        api.get<{ data: ProvidersData }>("/api/ai/providers"),
        api.get<{ data: InstalledModelsResponse }>("/api/ai/models?endpoint=server"),
        api.get<{ data: InstalledModelsResponse }>("/api/ai/models?endpoint=remote"),
      ]);
      setProviders(provRes.data);
      setServerModels(serverRes.data.models ?? []);
      setServerAvailable(serverRes.data.ollamaAvailable);
      setRemoteModels(remoteRes.data.models ?? []);
      setRemoteAvailable(remoteRes.data.ollamaAvailable);
    } catch {
      toast({ title: "Failed to load AI providers", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const serverNames = new Set(serverModels.map(m => m.name));
  const remoteNames = new Set(remoteModels.map(m => m.name));

  async function handleDelete(name: string, endpoint: OllamaEndpoint) {
    const key = `${endpoint}:${name}`;
    setDeleting(key);
    try {
      await api.delete(`/api/ai/models?name=${encodeURIComponent(name)}&endpoint=${endpoint}`);
      toast({ title: `Removed ${name} from ${endpoint}` });
      await refresh();
    } catch (e: unknown) {
      toast({ title: `Failed to remove: ${(e as Error).message}`, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  }

  async function handlePull(modelId: string, endpoint: OllamaEndpoint) {
    const key = `${endpoint}:${modelId}`;
    const token = localStorage.getItem("orahai_token");
    const abortCtrl = new AbortController();
    abortRefs.current[key] = abortCtrl;

    setPulls(prev => ({
      ...prev,
      [key]: { model: modelId, endpoint, status: "Initializing…", percent: 0, done: false, error: null },
    }));

    try {
      const res = await fetch(`${API_BASE || ""}/api/ai/models/pull`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ model: modelId, endpoint }),
        signal: abortCtrl.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = dec.decode(value, { stream: true })
          .split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim());

        for (const line of lines) {
          try {
            const evt = JSON.parse(line) as { type: string; status?: string; completed?: number; total?: number; error?: string };
            if (evt.type === "error") {
              setPulls(prev => ({ ...prev, [key]: { ...prev[key], error: evt.error ?? "Pull failed", done: true } }));
              break;
            }
            if (evt.type === "done") {
              setPulls(prev => ({ ...prev, [key]: { ...prev[key], status: "Complete", percent: 100, done: true, error: null } }));
              await refresh();
              break;
            }
            if (evt.type === "progress") {
              const pct = evt.total && evt.total > 0 ? Math.round((evt.completed ?? 0) / evt.total * 100) : 0;
              setPulls(prev => ({ ...prev, [key]: { ...prev[key], status: evt.status ?? "Downloading…", percent: pct, done: false, error: null } }));
            }
          } catch { /* skip */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        setPulls(prev => ({ ...prev, [key]: { ...prev[key], error: (e as Error).message, done: true } }));
      } else {
        setPulls(prev => { const n = { ...prev }; delete n[key]; return n; });
      }
    }
  }

  function handleCancelPull(key: string) {
    abortRefs.current[key]?.abort();
    setPulls(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  const filteredLibrary = OLLAMA_MODEL_LIBRARY.filter(m =>
    filter === "all" ? true : m.tags?.includes(filter)
  );

  const activePulls = Object.entries(pulls).filter(([, p]) => !p.done || p.error);

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="w-6 h-6 text-primary" />
              AI Models
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage local Ollama models — on this server and your own machine
            </p>
          </div>
          <button onClick={() => navigate("/settings/profile")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Settings
          </button>
        </div>

        {/* Provider status */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Provider Status</h2>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
              {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-muted" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <ProviderCard name="OpenAI" icon={<Cloud className="w-4 h-4" />}
                available={providers?.openai?.available ?? false}
                note="gpt-4.1, gpt-4o, o3-mini" models={providers?.openai?.models} />
              <ProviderCard name="Anthropic" icon={<Zap className="w-4 h-4" />}
                available={providers?.anthropic?.available ?? false}
                note="Set ANTHROPIC_API_KEY secret" models={providers?.anthropic?.models} />
              <ProviderCard name="Ollama — Server" icon={<Server className="w-4 h-4" />}
                available={serverAvailable}
                version={providers?.ollama?.version}
                note={serverAvailable ? `${serverModels.length} model${serverModels.length !== 1 ? "s" : ""} installed` : "Not running"}
                models={providers?.ollama?.models} />
              <ProviderCard name="Ollama — Remote" icon={<Wifi className="w-4 h-4" />}
                available={remoteAvailable}
                version={providers?.["ollama-remote"]?.version}
                note={
                  !remoteConfigured ? "Set OLLAMA_REMOTE_URL secret" :
                  remoteAvailable ? `${remoteModels.length} model${remoteModels.length !== 1 ? "s" : ""} available` :
                  "Unreachable — check URL"
                }
                models={providers?.["ollama-remote"]?.models} />
            </div>
          )}
        </section>

        {/* Remote Ollama configuration */}
        <section className="mb-8 rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <Link className="w-4 h-4 text-primary" />
            Connect Your Local Machine
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Run Ollama on your own PC or a remote GPU server, then point OrahAI to it.
            Models on your machine run with your hardware — no disk quota, no cloud cost.
          </p>

          <div className="space-y-3">
            <div className="rounded-lg bg-muted/40 border border-border/40 p-3 text-xs space-y-1.5">
              <p className="font-medium text-foreground">Step 1 — Install Ollama on your machine</p>
              <p className="text-muted-foreground">Download from <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ollama.com/download</a> and pull any model</p>
              <code className="block bg-background rounded px-2 py-1 font-mono mt-1">ollama pull llama3.1:8b</code>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border/40 p-3 text-xs space-y-1.5">
              <p className="font-medium text-foreground">Step 2 — Expose it publicly (ngrok or Cloudflare)</p>
              <code className="block bg-background rounded px-2 py-1 font-mono">ngrok http 11434</code>
              <p className="text-muted-foreground">This gives you a URL like <span className="text-foreground">https://abc123.ngrok.io</span></p>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border/40 p-3 text-xs space-y-1.5">
              <p className="font-medium text-foreground">Step 3 — Set <code className="bg-background rounded px-1 font-mono">OLLAMA_REMOTE_URL</code> in Replit Secrets</p>
              <p className="text-muted-foreground">Go to <strong>Tools → Secrets</strong> in your Replit project and add:</p>
              <div className="flex gap-2 items-center mt-1">
                <input
                  className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="https://abc123.ngrok.io"
                  value={remoteUrlInput}
                  onChange={e => setRemoteUrlInput(e.target.value)}
                />
              </div>
              <p className="text-muted-foreground text-[10px] mt-1">
                {remoteConfigured
                  ? <>Currently set to: <code className="bg-background rounded px-1">{providers?.["ollama-remote"]?.url}</code></>
                  : "Not configured — add OLLAMA_REMOTE_URL to Replit Secrets and restart the API server."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            {remoteAvailable ? (
              <div className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Connected — {remoteModels.length} model{remoteModels.length !== 1 ? "s" : ""} available
              </div>
            ) : remoteConfigured ? (
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium">
                <WifiOff className="w-3.5 h-3.5" /> Configured but unreachable — check tunnel is running
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <WifiOff className="w-3.5 h-3.5" /> Not configured
              </div>
            )}
            <button onClick={refresh} className="ml-auto p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        {/* Active pulls */}
        {activePulls.length > 0 && (
          <section className="mb-8 rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/40">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Download className="w-4 h-4 text-primary animate-bounce" /> Downloading
              </h2>
            </div>
            <div className="divide-y divide-border">
              {activePulls.map(([key, p]) => (
                <div key={key} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium">{p.model}</span>
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded-full border font-medium",
                        p.endpoint === "remote"
                          ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                          : "bg-primary/10 text-primary border-primary/20"
                      )}>
                        {p.endpoint === "remote" ? "Remote" : "Server"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{p.status}</span>
                      {!p.done && (
                        <button onClick={() => handleCancelPull(key)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                          title="Cancel">
                          <StopCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {p.error ? (
                    <div className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="w-3.5 h-3.5" /> {p.error}
                    </div>
                  ) : (
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-300", p.done ? "bg-green-500" : "bg-primary")}
                        style={{ width: `${p.percent}%` }} />
                    </div>
                  )}
                  {p.percent > 0 && !p.error && (
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">{p.percent}%</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Installed models — both endpoints */}
        <section className="mb-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Installed Models</h2>
            <button onClick={refresh} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <InstalledSection label="Server (built-in)" icon={<Server className="w-3.5 h-3.5" />}
            models={serverModels} available={serverAvailable}
            emptyNote="Ollama server is not running"
            onDelete={handleDelete} deleting={deleting} endpoint="server" />
          <InstalledSection label="Remote (your machine)" icon={<Wifi className="w-3.5 h-3.5" />}
            models={remoteModels} available={remoteAvailable}
            emptyNote={remoteConfigured ? "Remote Ollama unreachable — is the tunnel running?" : "Configure your remote URL above to connect your machine"}
            onDelete={handleDelete} deleting={deleting} endpoint="remote" />
        </section>

        {/* Model library */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Model Library</h2>
            <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1">
              Browse all <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
            {FILTER_TAGS.map(tag => (
              <button key={tag} onClick={() => setFilter(tag)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors capitalize",
                  filter === tag ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground border border-border/40",
                )}>
                {tag}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredLibrary.map(m => {
              const serverKey = `server:${m.id}`;
              const remoteKey = `remote:${m.id}`;
              return (
                <LibraryCard key={m.id} model={m}
                  serverInstalled={serverNames.has(m.id) || serverNames.has(m.id.split(":")[0])}
                  remoteInstalled={remoteNames.has(m.id) || remoteNames.has(m.id.split(":")[0])}
                  pullingServer={!!pulls[serverKey] && !pulls[serverKey].done}
                  pullingRemote={!!pulls[remoteKey] && !pulls[remoteKey].done}
                  onPull={handlePull}
                  remoteConfigured={remoteConfigured} />
              );
            })}
          </div>

          {filteredLibrary.length === 0 && (
            <div className="text-center py-12 text-sm text-muted-foreground">No models matching this filter.</div>
          )}
        </section>

        {/* Info note */}
        <section className="mt-8 rounded-xl border border-border/40 bg-muted/30 p-4">
          <div className="flex gap-3">
            <Cpu className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">Server models</strong> run on this Replit instance (CPU, small disk quota). Good for 1B–3B models.</p>
              <p><strong className="text-foreground">Remote models</strong> run on your own machine or a GPU server — no quota limits, much faster for large models.</p>
              <p>Both appear separately in the <strong className="text-foreground">AI chat panel</strong> model picker. Select the one you want per conversation.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

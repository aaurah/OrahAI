import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import {
  Bot, Cpu, Cloud, CheckCircle2, XCircle, Download, Trash2,
  RefreshCw, ChevronDown, ChevronUp, Eye, Server, Zap, ExternalLink,
  AlertCircle, StopCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, API_BASE } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { OLLAMA_MODEL_LIBRARY } from "@/lib/models";

// ── Types ─────────────────────────────────────────────────────────────────────

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
}

interface ProvidersResponse {
  providers: {
    openai: ProviderStatus;
    anthropic: ProviderStatus;
    ollama: ProviderStatus;
  };
}

interface InstalledModelsResponse {
  models: OllamaModel[];
  ollamaAvailable: boolean;
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
  name,
  icon,
  available,
  version,
  models,
  note,
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
              <CheckCircle2 className="w-3.5 h-3.5" />
              Ready
            </div>
          ) : (
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <XCircle className="w-3.5 h-3.5" />
              Not configured
            </div>
          )}
          {models && models.length > 0 && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
      {expanded && models && models.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap gap-1.5">
          {models.map(m => (
            <span key={m} className="text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border/40 text-muted-foreground font-mono">
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Installed Model Row ───────────────────────────────────────────────────────

function InstalledModelRow({
  model,
  onDelete,
  deleting,
}: {
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
      <button
        onClick={() => onDelete(model.name)}
        disabled={deleting}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all disabled:opacity-50"
        title="Remove model"
      >
        {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ── Pull Progress ─────────────────────────────────────────────────────────────

interface PullState {
  model: string;
  status: string;
  percent: number;
  done: boolean;
  error: string | null;
}

// ── Library Model Card ────────────────────────────────────────────────────────

function LibraryCard({
  model,
  installed,
  pulling,
  onPull,
}: {
  model: typeof OLLAMA_MODEL_LIBRARY[0];
  installed: boolean;
  pulling: boolean;
  onPull: (id: string) => void;
}) {
  return (
    <div className={cn(
      "rounded-xl border p-4 flex flex-col gap-2",
      installed ? "border-green-500/20 bg-green-500/5" : "border-border bg-card",
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
      {installed ? (
        <div className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Installed
        </div>
      ) : (
        <button
          onClick={() => onPull(model.id)}
          disabled={pulling}
          className={cn(
            "flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors",
            pulling
              ? "bg-muted text-muted-foreground cursor-wait"
              : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20",
          )}
        >
          {pulling ? (
            <><RefreshCw className="w-3 h-3 animate-spin" /> Pulling…</>
          ) : (
            <><Download className="w-3 h-3" /> Pull</>
          )}
        </button>
      )}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

const FILTER_TAGS = ["all", "general", "code", "vision", "fast", "powerful", "embed"];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AiModelsPage() {
  const [, navigate] = useLocation();
  const [providers, setProviders] = useState<ProvidersResponse["providers"] | null>(null);
  const [installed, setInstalled] = useState<OllamaModel[]>([]);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pulls, setPulls] = useState<Record<string, PullState>>({});
  const [filter, setFilter] = useState("all");
  const [ollamaUrlInput, setOllamaUrlInput] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const abortRefs = useRef<Record<string, AbortController>>({});

  const refresh = useCallback(async () => {
    try {
      const [provRes, modRes] = await Promise.all([
        api.get<{ data: ProvidersResponse["providers"] }>("/api/ai/providers"),
        api.get<{ data: InstalledModelsResponse }>("/api/ai/models"),
      ]);
      setProviders(provRes.data);
      setInstalled(modRes.data.models ?? []);
      setOllamaAvailable(modRes.data.ollamaAvailable);
    } catch {
      toast({ title: "Failed to load AI providers", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const installedNames = new Set(installed.map(m => m.name));

  async function handleDelete(name: string) {
    setDeleting(name);
    try {
      await api.delete(`/api/ai/models?name=${encodeURIComponent(name)}`);
      toast({ title: `Removed ${name}` });
      await refresh();
    } catch (e: unknown) {
      toast({ title: `Failed to remove: ${(e as Error).message}`, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  }

  async function handlePull(modelId: string) {
    const token = localStorage.getItem("orahai_token");
    const abortCtrl = new AbortController();
    abortRefs.current[modelId] = abortCtrl;

    setPulls(prev => ({
      ...prev,
      [modelId]: { model: modelId, status: "Initializing…", percent: 0, done: false, error: null },
    }));

    try {
      const res = await fetch(`${API_BASE || ""}/api/ai/models/pull`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ model: modelId }),
        signal: abortCtrl.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = dec.decode(value, { stream: true })
          .split("\n")
          .filter(l => l.startsWith("data:"))
          .map(l => l.slice(5).trim());

        for (const line of lines) {
          try {
            const evt = JSON.parse(line) as {
              type: string;
              status?: string;
              completed?: number;
              total?: number;
              error?: string;
            };
            if (evt.type === "error") {
              setPulls(prev => ({
                ...prev,
                [modelId]: { ...prev[modelId], error: evt.error ?? "Pull failed", done: true },
              }));
              break;
            }
            if (evt.type === "done") {
              setPulls(prev => ({
                ...prev,
                [modelId]: { ...prev[modelId], status: "Complete", percent: 100, done: true, error: null },
              }));
              await refresh();
              break;
            }
            if (evt.type === "progress") {
              const pct = evt.total && evt.total > 0 ? Math.round((evt.completed ?? 0) / evt.total * 100) : 0;
              setPulls(prev => ({
                ...prev,
                [modelId]: { ...prev[modelId], status: evt.status ?? "Downloading…", percent: pct, done: false, error: null },
              }));
            }
          } catch { /* skip */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        setPulls(prev => ({
          ...prev,
          [modelId]: { ...prev[modelId], error: (e as Error).message, done: true },
        }));
      } else {
        setPulls(prev => { const n = { ...prev }; delete n[modelId]; return n; });
      }
    }
  }

  function handleCancelPull(modelId: string) {
    abortRefs.current[modelId]?.abort();
    setPulls(prev => { const n = { ...prev }; delete n[modelId]; return n; });
  }

  const filteredLibrary = OLLAMA_MODEL_LIBRARY.filter(m => {
    if (filter === "all") return true;
    return m.tags?.includes(filter);
  });

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
              Manage local Ollama models and configure AI providers
            </p>
          </div>
          <button
            onClick={() => navigate("/settings/profile")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Settings
          </button>
        </div>

        {/* Provider status */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Provider Status</h2>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-pulse">
              {[0,1,2].map(i => <div key={i} className="h-20 rounded-xl bg-muted" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ProviderCard
                name="OpenAI"
                icon={<Cloud className="w-4 h-4" />}
                available={providers?.openai?.available ?? false}
                note="gpt-4.1, gpt-4o, o3-mini"
                models={providers?.openai?.models}
              />
              <ProviderCard
                name="Anthropic / Claude"
                icon={<Zap className="w-4 h-4" />}
                available={providers?.anthropic?.available ?? false}
                note="Set ANTHROPIC_API_KEY secret"
                models={providers?.anthropic?.models}
              />
              <ProviderCard
                name="Ollama (Local)"
                icon={<Server className="w-4 h-4" />}
                available={ollamaAvailable}
                version={providers?.ollama?.available ? "0.9.5" : undefined}
                note={ollamaAvailable ? `${installed.length} model${installed.length !== 1 ? "s" : ""} installed` : "Not running"}
                models={providers?.ollama?.models}
              />
            </div>
          )}
        </section>

        {/* Ollama URL override */}
        <section className="mb-8 rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            Ollama Server URL
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            By default OrahAI uses the built-in Ollama server at <code className="bg-muted px-1 rounded">http://localhost:11434</code>.
            Set <code className="bg-muted px-1 rounded">OLLAMA_BASE_URL</code> in your environment to point to a different server (e.g., a remote GPU machine).
          </p>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="http://localhost:11434"
              value={ollamaUrlInput}
              onChange={e => setOllamaUrlInput(e.target.value)}
            />
            <button
              onClick={async () => {
                setSavingUrl(true);
                try {
                  await api.patch("/api/auth/me/settings", { ollamaBaseUrl: ollamaUrlInput.trim() || null });
                  toast({ title: "Ollama URL saved — restart the API server to apply" });
                } catch {
                  toast({ title: "Set OLLAMA_BASE_URL in Replit Secrets instead", variant: "destructive" });
                } finally {
                  setSavingUrl(false);
                }
              }}
              disabled={savingUrl || !ollamaUrlInput.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              Save
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            💡 To use a remote Ollama instance, set <strong>OLLAMA_BASE_URL</strong> in Replit Secrets.
          </p>
        </section>

        {/* Active pulls */}
        {Object.keys(pulls).length > 0 && (
          <section className="mb-8 rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/40">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Download className="w-4 h-4 text-primary animate-bounce" />
                Downloading
              </h2>
            </div>
            <div className="divide-y divide-border">
              {Object.entries(pulls).map(([id, p]) => (
                <div key={id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-mono font-medium">{id}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{p.status}</span>
                      {!p.done && (
                        <button
                          onClick={() => handleCancelPull(id)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                          title="Cancel download"
                        >
                          <StopCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {p.error ? (
                    <div className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {p.error}
                    </div>
                  ) : (
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-300",
                          p.done ? "bg-green-500" : "bg-primary")}
                        style={{ width: `${p.percent}%` }}
                      />
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

        {/* Installed models */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Installed Models ({installed.length})
            </h2>
            <button
              onClick={refresh}
              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {!ollamaAvailable ? (
            <div className="rounded-xl border bg-card p-6 text-center">
              <Server className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Ollama is not running</p>
              <p className="text-xs text-muted-foreground mt-1">The built-in Ollama service should start automatically.</p>
            </div>
          ) : installed.length === 0 ? (
            <div className="rounded-xl border bg-card p-6 text-center">
              <Bot className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No models installed yet</p>
              <p className="text-xs text-muted-foreground mt-1">Pull a model from the library below to get started.</p>
            </div>
          ) : (
            <div className="rounded-xl border bg-card divide-y divide-border overflow-hidden">
              {installed.map(m => (
                <InstalledModelRow
                  key={m.name}
                  model={m}
                  onDelete={handleDelete}
                  deleting={deleting === m.name}
                />
              ))}
            </div>
          )}
        </section>

        {/* Model library */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Model Library</h2>
            <a
              href="https://ollama.com/library"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Browse all <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
            {FILTER_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => setFilter(tag)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors capitalize",
                  filter === tag
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground border border-border/40",
                )}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredLibrary.map(m => {
              const pullState = pulls[m.id];
              return (
                <LibraryCard
                  key={m.id}
                  model={m}
                  installed={installedNames.has(m.id) || installedNames.has(m.id.split(":")[0])}
                  pulling={!!pullState && !pullState.done}
                  onPull={handlePull}
                />
              );
            })}
          </div>

          {filteredLibrary.length === 0 && (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No models matching this filter.
            </div>
          )}
        </section>

        {/* How it works note */}
        <section className="mt-8 rounded-xl border border-border/40 bg-muted/30 p-4">
          <div className="flex gap-3">
            <Cpu className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">How local models work:</strong> Models run entirely on your server via Ollama — no API key needed, fully private.</p>
              <p>Select any installed model in the <strong className="text-foreground">AI chat panel</strong> within your workspace using the model picker button.</p>
              <p>Smaller models (1B–4B) run on CPU. Larger models benefit from GPU — if you have one, set <code className="bg-muted px-1 rounded font-mono">OLLAMA_BASE_URL</code> to a GPU server.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

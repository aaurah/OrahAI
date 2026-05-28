import { useState } from "react";
import useSWR from "swr";
import { Plus, Trash2, PlugZap, Unplug, Loader2, ChevronDown, ChevronRight, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api";

interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: "sse" | "http" | "streamable-http";
  authToken: string | null;
  enabled: boolean;
  createdAt: string;
}

interface TestResult {
  ok: boolean;
  error?: string;
  tools: { name: string; description: string }[];
}

interface Props {
  projectId: string;
}

function useServers(projectId: string) {
  const { data, error, mutate } = useSWR<{ data: McpServer[] }>(
    `/api/projects/${projectId}/mcp`,
    (url: string) => api.get<{ data: McpServer[] }>(url),
  );
  return { servers: data?.data ?? [], loading: !data && !error, mutate };
}

export function McpPanel({ projectId }: Props) {
  const { servers, loading, mutate } = useServers(projectId);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", transport: "sse" as McpServer["transport"], authToken: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult & { loading?: boolean }>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const handleAdd = async () => {
    if (!form.name || !form.url) { setFormError("Name and URL are required"); return; }
    setSubmitting(true); setFormError(null);
    try {
      await api.post(`/api/projects/${projectId}/mcp`, {
        name: form.name,
        url: form.url,
        transport: form.transport,
        authToken: form.authToken || null,
      });
      setForm({ name: "", url: "", transport: "sse", authToken: "" });
      setAdding(false);
      mutate();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEnabled = async (server: McpServer) => {
    try {
      await api.patch(`/api/projects/${projectId}/mcp/${server.id}`, { enabled: !server.enabled });
      mutate();
    } catch { /* ignore */ }
  };

  const deleteServer = async (id: string) => {
    try {
      await api.delete(`/api/projects/${projectId}/mcp/${id}`);
      mutate();
      setTestResults(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch { /* ignore */ }
  };

  const testServer = async (id: string) => {
    setTestResults(prev => ({ ...prev, [id]: { loading: true, ok: false, tools: [] } }));
    try {
      const res = await api.post<{ data: TestResult }>(`/api/projects/${projectId}/mcp/${id}/test`);
      setTestResults(prev => ({ ...prev, [id]: { ...res.data, loading: false } }));
      setExpanded(prev => ({ ...prev, [id]: true }));
    } catch (e) {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, error: (e as Error).message, tools: [], loading: false } }));
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 h-10 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">MCP Servers</span>
        <button
          onClick={() => { setAdding(a => !a); setFormError(null); }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {adding && (
          <div className="border-b border-border p-3 bg-muted/30 space-y-2">
            <p className="text-xs font-medium text-foreground">New MCP Server</p>
            <input
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Name (e.g. github, filesystem)"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
            <input
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Server URL (https://...)"
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
            <select
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              value={form.transport}
              onChange={e => setForm(f => ({ ...f, transport: e.target.value as McpServer["transport"] }))}
            >
              <option value="sse">SSE (Server-Sent Events)</option>
              <option value="http">Streamable HTTP</option>
            </select>
            <input
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Auth token (optional)"
              type="password"
              value={form.authToken}
              onChange={e => setForm(f => ({ ...f, authToken: e.target.value }))}
            />
            {formError && <p className="text-xs text-destructive">{formError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={submitting}
                className="flex-1 text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {submitting ? "Adding…" : "Add Server"}
              </button>
              <button
                onClick={() => { setAdding(false); setFormError(null); }}
                className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && servers.length === 0 && !adding && (
          <div className="p-6 text-center">
            <PlugZap className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No MCP servers configured.</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Connect external tools so the AI can query databases, search the web, read files, and more.
            </p>
          </div>
        )}

        {servers.map(server => {
          const test = testResults[server.id];
          const isExpanded = expanded[server.id];
          return (
            <div key={server.id} className="border-b border-border last:border-0">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  onClick={() => setExpanded(prev => ({ ...prev, [server.id]: !isExpanded }))}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-xs font-medium truncate", !server.enabled && "text-muted-foreground/60")}>
                      {server.name}
                    </span>
                    {!server.enabled && (
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">(off)</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{server.url}</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => testServer(server.id)}
                    disabled={test?.loading}
                    title="Test connection"
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted disabled:opacity-50"
                  >
                    {test?.loading
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />
                    }
                  </button>
                  <button
                    onClick={() => toggleEnabled(server)}
                    title={server.enabled ? "Disable" : "Enable"}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted"
                  >
                    {server.enabled
                      ? <PlugZap className="w-3.5 h-3.5 text-green-500" />
                      : <Unplug className="w-3.5 h-3.5" />
                    }
                  </button>
                  <button
                    onClick={() => deleteServer(server.id)}
                    title="Remove server"
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded hover:bg-muted"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-1.5 ml-5">
                  <div className="text-[10px] text-muted-foreground space-y-0.5 bg-muted/30 rounded p-2">
                    <div><span className="opacity-60">Transport:</span> {server.transport}</div>
                    <div><span className="opacity-60">Auth:</span> {server.authToken ? "configured" : "none"}</div>
                  </div>
                  {test && !test.loading && (
                    <div className={cn("rounded p-2 text-[10px] space-y-1", test.ok ? "bg-green-500/10" : "bg-destructive/10")}>
                      <div className="flex items-center gap-1 font-medium">
                        {test.ok
                          ? <><CheckCircle2 className="w-3 h-3 text-green-500" /><span className="text-green-600 dark:text-green-400">Connected — {test.tools.length} tool{test.tools.length !== 1 ? "s" : ""}</span></>
                          : <><XCircle className="w-3 h-3 text-destructive" /><span className="text-destructive">Connection failed</span></>
                        }
                      </div>
                      {test.error && <p className="text-destructive/80 break-all">{test.error}</p>}
                      {test.tools.length > 0 && (
                        <ul className="space-y-0.5 pt-0.5">
                          {test.tools.map(t => (
                            <li key={t.name} className="flex gap-1 flex-wrap">
                              <span className="font-mono text-primary shrink-0">{t.name}</span>
                              {t.description && <span className="text-muted-foreground">— {t.description}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-3 py-2 border-t border-border shrink-0">
        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
          Enabled servers give the AI access to external tools during chat. Use{" "}
          <code className="font-mono text-[9px]">{"<<<MCP_CALL:name:tool>>>"}</code> format.
        </p>
      </div>
    </div>
  );
}

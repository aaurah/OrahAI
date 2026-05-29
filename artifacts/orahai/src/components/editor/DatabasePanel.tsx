import { useState, useRef, useCallback, useEffect } from "react";
import {
  Database, Play, Download, Upload, RefreshCw, ChevronRight,
  ChevronDown, Table2, AlertCircle, CheckCircle2, Loader2,
  Link2, X, Copy, Check, FileText, ArrowLeft, ArrowRight,
  Search, Settings2, Trash2, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";

interface Props {
  projectId: string;
}

type Tab = "browse" | "query" | "import" | "export";

interface TableInfo {
  table_schema: string;
  table_name: string;
  table_type: string;
  row_estimate: number;
}

interface Column {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  is_primary_key: boolean;
}

interface QueryResult {
  sql: string;
  rows: Record<string, unknown>[];
  fields: string[];
  rowCount: number;
  duration: number;
}

const API_BASE = (import.meta.env.VITE_API_URL as string) || "";

function cellValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ResultsGrid({ fields, rows }: { fields: string[]; rows: Record<string, unknown>[] }) {
  if (!fields.length) return <p className="text-xs text-muted-foreground p-3">No results</p>;
  return (
    <div className="overflow-auto flex-1 text-xs">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
          <tr>
            {fields.map(f => (
              <th key={f} className="px-3 py-1.5 text-left font-semibold border-b border-border whitespace-nowrap text-foreground/80">
                {f}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={cn("hover:bg-muted/40 transition-colors", ri % 2 === 0 ? "" : "bg-muted/20")}>
              {fields.map(f => {
                const v = row[f];
                const isNull = v === null || v === undefined;
                return (
                  <td key={f} className={cn(
                    "px-3 py-1 border-b border-border/50 max-w-[240px] truncate",
                    isNull && "text-muted-foreground/50 italic"
                  )}>
                    {isNull ? "NULL" : cellValue(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DatabasePanel({ projectId }: Props) {
  const [tab, setTab] = useState<Tab>("browse");
  const [customUrl, setCustomUrl] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const isInitialLoad = useRef(true);

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set(["public"]));

  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [browsePage, setBrowsePage] = useState(0);
  const [browseLoading, setBrowseLoading] = useState(false);
  const PAGE_SIZE = 100;

  const [sql, setSql] = useState("SELECT * FROM ");
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryRunning, setQueryRunning] = useState(false);
  const [queryDuration, setQueryDuration] = useState<number | null>(null);
  const [activeResult, setActiveResult] = useState(0);

  const [importSql, setImportSql] = useState("");
  const [importRunning, setImportRunning] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; statementsRun: number; errors: string[] } | null>(null);

  const [exportLoading, setExportLoading] = useState(false);
  const [exportTableFilter, setExportTableFilter] = useState("");

  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectiveUrl = customUrl || undefined;

  const getParams = () => effectiveUrl ? `?url=${encodeURIComponent(effectiveUrl)}` : "";

  // ── Connection ─────────────────────────────────────────────────────────────

  const testConnection = useCallback(async () => {
    setConnecting(true);
    try {
      await api.post(`/api/projects/${projectId}/database/connect`, { url: effectiveUrl || undefined });
      setConnected(true);
      toast({ title: "Connected to database" });
      loadTables();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? (e as Error).message;
      setConnected(false);
      toast({ title: msg, variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  }, [projectId, effectiveUrl]);

  const loadTables = useCallback(async (silent = false) => {
    setTablesLoading(true);
    try {
      const res = await api.get<{ tables: TableInfo[] }>(
        `/api/projects/${projectId}/database/tables${getParams()}`
      );
      setTables(res.tables);
      setConnected(true);
      isInitialLoad.current = false;
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? (e as Error).message;
      setConnected(false);
      isInitialLoad.current = false;
      if (!silent) toast({ title: `Failed to load tables: ${msg}`, variant: "destructive" });
    } finally {
      setTablesLoading(false);
    }
  }, [projectId, effectiveUrl]);

  useEffect(() => { loadTables(true); }, []);

  // ── Browse ──────────────────────────────────────────────────────────────────

  const loadTableData = useCallback(async (tbl: TableInfo, page = 0) => {
    setBrowseLoading(true);
    setSelectedTable(tbl);
    setBrowsePage(page);
    try {
      const qs = new URLSearchParams({
        table: tbl.table_name,
        schema: tbl.table_schema,
        offset: String(page * PAGE_SIZE),
        limit: String(PAGE_SIZE),
        ...(effectiveUrl ? { url: effectiveUrl } : {}),
      });
      const [colRes, rowRes] = await Promise.all([
        api.get<{ columns: Column[] }>(`/api/projects/${projectId}/database/columns?table=${tbl.table_name}&schema=${tbl.table_schema}${effectiveUrl ? `&url=${encodeURIComponent(effectiveUrl)}` : ""}`),
        api.get<{ rows: Record<string, unknown>[]; total: number }>(`/api/projects/${projectId}/database/rows?${qs}`),
      ]);
      setColumns(colRes.columns);
      setRows(rowRes.rows);
      setTotalRows(rowRes.total);
      setTab("browse");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? (e as Error).message;
      toast({ title: `Failed to load table: ${msg}`, variant: "destructive" });
    } finally {
      setBrowseLoading(false);
    }
  }, [projectId, effectiveUrl]);

  // ── Query ───────────────────────────────────────────────────────────────────

  const runQuery = useCallback(async () => {
    if (!sql.trim() || queryRunning) return;
    setQueryRunning(true);
    setQueryError(null);
    setQueryResults([]);
    setActiveResult(0);
    try {
      const res = await api.post<{ results: QueryResult[]; totalDuration: number }>(
        `/api/projects/${projectId}/database/query`,
        { url: effectiveUrl || undefined, sql }
      );
      setQueryResults(res.results);
      setQueryDuration(res.totalDuration);
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { message?: string; partialResults?: QueryResult[] } } }).response?.data;
      setQueryError(data?.message ?? (e as Error).message);
      if (data?.partialResults?.length) setQueryResults(data.partialResults);
    } finally {
      setQueryRunning(false);
    }
  }, [sql, projectId, effectiveUrl, queryRunning]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
  };

  // ── Import ──────────────────────────────────────────────────────────────────

  const runImport = useCallback(async () => {
    if (!importSql.trim() || importRunning) return;
    setImportRunning(true);
    setImportResult(null);
    try {
      const res = await api.post<{ ok: boolean; statementsRun: number; errors: string[] }>(
        `/api/projects/${projectId}/database/import`,
        { url: effectiveUrl || undefined, sql: importSql }
      );
      setImportResult(res);
      if (res.ok) {
        toast({ title: `Imported ${res.statementsRun} statement${res.statementsRun !== 1 ? "s" : ""} successfully` });
        loadTables();
      } else {
        toast({ title: "Import completed with errors", variant: "destructive" });
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? (e as Error).message;
      toast({ title: `Import failed: ${msg}`, variant: "destructive" });
    } finally {
      setImportRunning(false);
    }
  }, [importSql, projectId, effectiveUrl, importRunning]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImportSql(ev.target?.result as string ?? "");
    reader.readAsText(file);
  };

  // ── Export ──────────────────────────────────────────────────────────────────

  const runExport = useCallback(async () => {
    setExportLoading(true);
    try {
      const token = localStorage.getItem("orahai_token");
      const qs = new URLSearchParams({
        ...(effectiveUrl ? { url: effectiveUrl } : {}),
        ...(exportTableFilter.trim() ? { tables: exportTableFilter.trim() } : {}),
      });
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/database/export?${qs}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `db-export-${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "SQL dump downloaded" });
    } catch (e: unknown) {
      toast({ title: `Export failed: ${(e as Error).message}`, variant: "destructive" });
    } finally {
      setExportLoading(false);
    }
  }, [projectId, effectiveUrl, exportTableFilter]);

  // ── Schema grouping ─────────────────────────────────────────────────────────

  const schemaGroups: Record<string, TableInfo[]> = {};
  for (const t of tables) {
    (schemaGroups[t.table_schema] ??= []).push(t);
  }

  const toggleSchema = (schema: string) => {
    setExpandedSchemas(prev => {
      const next = new Set(prev);
      next.has(schema) ? next.delete(schema) : next.add(schema);
      return next;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "browse",  label: "Browse",  icon: <Table2 className="w-3.5 h-3.5" /> },
    { id: "query",   label: "Query",   icon: <Play className="w-3.5 h-3.5" /> },
    { id: "import",  label: "Import",  icon: <Upload className="w-3.5 h-3.5" /> },
    { id: "export",  label: "Export",  icon: <Download className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-border shrink-0">
        <Database className="w-4 h-4 text-primary shrink-0" />
        <span className="font-semibold text-sm flex-1">Database</span>
        <button
          onClick={() => setShowUrlInput(v => !v)}
          title="Custom connection URL"
          className={cn("p-1 rounded hover:bg-muted transition-colors", showUrlInput && "bg-muted text-foreground", "text-muted-foreground")}
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => loadTables()}
          disabled={tablesLoading}
          title="Refresh tables"
          className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", tablesLoading && "animate-spin")} />
        </button>
      </div>

      {/* Connection status + optional URL override */}
      {showUrlInput && (
        <div className="px-3 py-2 border-b border-border bg-muted/30 shrink-0 flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
              placeholder="postgres://user:pass@host/db  (uses DATABASE_URL secret if blank)"
              className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            onClick={testConnection}
            disabled={connecting}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 w-fit"
          >
            {connecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Test Connection
          </button>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-border shrink-0 bg-muted/20">
        <div className={cn(
          "w-2 h-2 rounded-full shrink-0",
          connected === true  ? "bg-green-500" :
          connected === false ? "bg-red-500" :
          "bg-muted-foreground/40"
        )} />
        <span className="text-xs text-muted-foreground">
          {connected === true  ? `${tables.length} table${tables.length !== 1 ? "s" : ""}` :
           connected === false ? "Not connected" :
           "Loading…"}
        </span>
        {connected === false && (
          <button onClick={testConnection} className="ml-auto text-xs text-primary hover:underline">
            Connect
          </button>
        )}
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Table tree */}
        <div className="w-40 shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {tablesLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!tablesLoading && tables.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {connected === false ? "Not connected" : "No tables found"}
              </div>
            )}
            {Object.entries(schemaGroups).map(([schema, schemaTables]) => (
              <div key={schema}>
                <button
                  onClick={() => toggleSchema(schema)}
                  className="flex items-center gap-1 w-full px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  {expandedSchemas.has(schema)
                    ? <ChevronDown className="w-3 h-3 shrink-0" />
                    : <ChevronRight className="w-3 h-3 shrink-0" />}
                  <span className="truncate">{schema}</span>
                </button>
                {expandedSchemas.has(schema) && schemaTables.map(t => (
                  <button
                    key={t.table_name}
                    onClick={() => loadTableData(t)}
                    className={cn(
                      "flex items-center gap-1.5 w-full pl-5 pr-2 py-1 text-[11px] hover:bg-muted/60 transition-colors text-left",
                      selectedTable?.table_name === t.table_name && selectedTable?.table_schema === t.table_schema
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground/80"
                    )}
                  >
                    <Table2 className="w-3 h-3 shrink-0 opacity-60" />
                    <span className="truncate flex-1">{t.table_name}</span>
                    {t.row_estimate > 0 && (
                      <span className="text-[9px] text-muted-foreground ml-auto shrink-0">
                        {t.row_estimate > 1000 ? `${Math.round(t.row_estimate / 1000)}k` : t.row_estimate}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Tab content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Tab bar */}
          <div className="flex border-b border-border shrink-0 bg-muted/20">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* ── BROWSE tab ── */}
          {tab === "browse" && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Not-connected onboarding screen */}
              {connected === false && !tablesLoading && (
                <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold">Connect a database</h3>
                    <p className="text-xs text-muted-foreground">
                      Paste a connection URL below, or add <code className="font-mono bg-muted px-1 rounded">DATABASE_URL</code> to your project secrets.
                    </p>
                  </div>

                  {/* URL input — main hero */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Connection URL</label>
                    <div className="flex items-center gap-1.5 bg-muted/30 border border-border rounded px-2.5 py-2">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <input
                        value={customUrl}
                        onChange={e => setCustomUrl(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && testConnection()}
                        placeholder="postgres://user:pass@host:5432/db"
                        className="flex-1 bg-transparent text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none"
                      />
                      {customUrl && (
                        <button onClick={() => setCustomUrl("")} className="text-muted-foreground hover:text-foreground">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick-fill provider buttons */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Quick-fill template</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { label: "Neon",      prefix: "postgres://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require" },
                        { label: "Supabase",  prefix: "postgres://postgres:[pass]@db.[ref].supabase.co:5432/postgres" },
                        { label: "Railway",   prefix: "postgres://postgres:[pass]@[host].railway.app:5432/railway" },
                        { label: "Render",    prefix: "postgres://user:pass@[host].render.com/dbname" },
                      ].map(({ label, prefix }) => (
                        <button
                          key={label}
                          onClick={() => setCustomUrl(prefix)}
                          className="flex items-center gap-1.5 h-7 px-2 rounded border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-left"
                        >
                          <Plus className="w-3 h-3 shrink-0" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={testConnection}
                    disabled={connecting}
                    className="flex items-center justify-center gap-2 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                    {connecting ? "Connecting…" : "Connect"}
                  </button>

                  <div className="rounded border border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground space-y-1.5">
                    <p className="font-semibold text-foreground/70">Or use a secret</p>
                    <p>Open the <span className="font-medium text-foreground/80">Secrets</span> panel (🔑 in the toolbar) and add a secret named <code className="font-mono bg-muted px-1 rounded">DATABASE_URL</code>. The panel will auto-connect on the next open.</p>
                  </div>
                </div>
              )}

              {!selectedTable && connected !== false && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground px-4">
                  <Table2 className="w-8 h-8 opacity-20" />
                  <p className="text-xs text-center">Select a table from the left to browse its data</p>
                </div>
              )}
              {selectedTable && (
                <>
                  {/* Table header */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 bg-muted/30">
                    <Table2 className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="font-semibold text-xs truncate">
                      {selectedTable.table_schema !== "public" && (
                        <span className="text-muted-foreground">{selectedTable.table_schema}.</span>
                      )}
                      {selectedTable.table_name}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">
                      {totalRows.toLocaleString()} rows
                    </span>
                  </div>

                  {/* Columns schema */}
                  {columns.length > 0 && (
                    <details className="shrink-0 border-b border-border">
                      <summary className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none">
                        Schema ({columns.length} columns)
                      </summary>
                      <div className="px-3 pb-2 text-[11px] grid grid-cols-1 gap-0.5">
                        {columns.map(c => (
                          <div key={c.column_name} className="flex items-center gap-2 py-0.5">
                            {c.is_primary_key && <span className="text-amber-400 text-[9px] font-bold shrink-0">PK</span>}
                            <span className={cn("font-mono font-medium truncate", !c.is_primary_key && "ml-5")}>{c.column_name}</span>
                            <span className="text-muted-foreground ml-auto shrink-0">{c.data_type}</span>
                            {c.is_nullable === "NO" && <span className="text-red-400/80 text-[9px]">NOT NULL</span>}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* Data grid */}
                  {browseLoading ? (
                    <div className="flex items-center justify-center flex-1">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ResultsGrid
                      fields={columns.map(c => c.column_name)}
                      rows={rows}
                    />
                  )}

                  {/* Pagination */}
                  {totalRows > PAGE_SIZE && (
                    <div className="flex items-center justify-between px-3 py-2 border-t border-border shrink-0 bg-muted/20">
                      <span className="text-xs text-muted-foreground">
                        {browsePage * PAGE_SIZE + 1}–{Math.min((browsePage + 1) * PAGE_SIZE, totalRows)} of {totalRows.toLocaleString()}
                      </span>
                      <div className="flex gap-1">
                        <button
                          disabled={browsePage === 0 || browseLoading}
                          onClick={() => selectedTable && loadTableData(selectedTable, browsePage - 1)}
                          className="p-1 rounded hover:bg-muted disabled:opacity-40 transition-colors"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          disabled={(browsePage + 1) * PAGE_SIZE >= totalRows || browseLoading}
                          onClick={() => selectedTable && loadTableData(selectedTable, browsePage + 1)}
                          className="p-1 rounded hover:bg-muted disabled:opacity-40 transition-colors"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── QUERY tab ── */}
          {tab === "query" && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* SQL editor */}
              <div className="flex flex-col shrink-0 border-b border-border" style={{ height: "40%" }}>
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0">
                  <span className="text-[11px] text-muted-foreground flex-1 font-mono">SQL — Ctrl+Enter to run</span>
                  <button
                    onClick={runQuery}
                    disabled={queryRunning || !sql.trim()}
                    className="flex items-center gap-1.5 h-6 px-2.5 rounded bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {queryRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
                    Run
                  </button>
                </div>
                <textarea
                  ref={textareaRef}
                  value={sql}
                  onChange={e => setSql(e.target.value)}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  className="flex-1 resize-none bg-[#0d0d0d] text-slate-200 font-mono text-xs p-3 focus:outline-none placeholder:text-muted-foreground/40"
                  placeholder="SELECT * FROM users LIMIT 10;"
                />
              </div>

              {/* Results */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {queryError && (
                  <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border-b border-red-500/20 shrink-0">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-red-400 font-mono">{queryError}</span>
                  </div>
                )}

                {queryResults.length > 0 && (
                  <>
                    {/* Result tabs */}
                    {queryResults.length > 1 && (
                      <div className="flex border-b border-border shrink-0 bg-muted/10 overflow-x-auto">
                        {queryResults.map((r, i) => (
                          <button
                            key={i}
                            onClick={() => setActiveResult(i)}
                            className={cn(
                              "px-3 py-1.5 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors",
                              activeResult === i ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                          >
                            #{i + 1} · {r.rowCount} row{r.rowCount !== 1 ? "s" : ""}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Result info */}
                    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border shrink-0 bg-muted/20">
                      <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                      <span className="text-[11px] text-muted-foreground">
                        {queryResults[activeResult]?.rowCount ?? 0} rows · {queryResults[activeResult]?.duration ?? 0}ms
                      </span>
                      {queryDuration != null && queryResults.length > 1 && (
                        <span className="text-[11px] text-muted-foreground">· total {queryDuration}ms</span>
                      )}
                      <button
                        onClick={() => {
                          const r = queryResults[activeResult];
                          if (!r) return;
                          const csv = [r.fields.join(","), ...r.rows.map(row => r.fields.map(f => JSON.stringify(cellValue(row[f]))).join(","))].join("\n");
                          copyToClipboard(csv);
                        }}
                        className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copied" : "Copy CSV"}
                      </button>
                    </div>

                    <ResultsGrid
                      fields={queryResults[activeResult]?.fields ?? []}
                      rows={queryResults[activeResult]?.rows ?? []}
                    />
                  </>
                )}

                {!queryError && queryResults.length === 0 && !queryRunning && (
                  <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2">
                    <Play className="w-6 h-6 opacity-20" />
                    <p className="text-xs">Run a query to see results</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── IMPORT tab ── */}
          {tab === "import" && (
            <div className="flex flex-col flex-1 overflow-hidden p-3 gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground flex-1">Paste SQL or upload a .sql file</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sql,.txt"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 h-7 px-2.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Upload file
                </button>
                {importSql && (
                  <button
                    onClick={() => { setImportSql(""); setImportResult(null); }}
                    className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <textarea
                value={importSql}
                onChange={e => setImportSql(e.target.value)}
                spellCheck={false}
                className="flex-1 resize-none bg-[#0d0d0d] text-slate-200 font-mono text-xs p-3 rounded border border-border focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
                placeholder="-- Paste your SQL here (CREATE TABLE, INSERT, etc.)&#10;CREATE TABLE my_table (&#10;  id serial PRIMARY KEY,&#10;  name text NOT NULL&#10;);"
              />

              {importResult && (
                <div className={cn(
                  "rounded border px-3 py-2 text-xs shrink-0",
                  importResult.ok
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                )}>
                  {importResult.ok
                    ? `✓ Imported ${importResult.statementsRun} statement${importResult.statementsRun !== 1 ? "s" : ""} successfully`
                    : (
                      <div className="space-y-1">
                        <p className="font-semibold">Import failed ({importResult.statementsRun} ran before error)</p>
                        {importResult.errors.map((e, i) => <p key={i} className="font-mono text-[11px]">{e}</p>)}
                      </div>
                    )
                  }
                </div>
              )}

              <button
                onClick={runImport}
                disabled={!importSql.trim() || importRunning}
                className="flex items-center justify-center gap-2 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
              >
                {importRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importRunning ? "Importing…" : "Run Import"}
              </button>
            </div>
          )}

          {/* ── EXPORT tab ── */}
          {tab === "export" && (
            <div className="flex flex-col flex-1 overflow-auto p-4 gap-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">SQL Dump</h3>
                <p className="text-xs text-muted-foreground">
                  Exports CREATE TABLE statements and INSERT rows for all tables (up to 10,000 rows per table).
                  The file is downloaded directly to your browser.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-muted-foreground">Filter tables (optional)</label>
                <div className="flex items-center gap-2 bg-muted/30 border border-border rounded px-2 py-1.5">
                  <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <input
                    value={exportTableFilter}
                    onChange={e => setExportTableFilter(e.target.value)}
                    placeholder="users, orders, products  (comma-separated)"
                    className="flex-1 bg-transparent text-xs font-mono focus:outline-none placeholder:text-muted-foreground/50"
                  />
                  {exportTableFilter && (
                    <button onClick={() => setExportTableFilter("")} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Table preview */}
              {tables.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Tables to export ({exportTableFilter.trim()
                      ? tables.filter(t => exportTableFilter.split(",").map(s => s.trim()).includes(t.table_name)).length
                      : tables.length})
                  </span>
                  <div className="rounded border border-border overflow-hidden max-h-48 overflow-y-auto">
                    {tables
                      .filter(t => !exportTableFilter.trim() || exportTableFilter.split(",").map(s => s.trim()).includes(t.table_name))
                      .map(t => (
                        <div key={`${t.table_schema}.${t.table_name}`} className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 last:border-0 text-xs">
                          <Table2 className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="font-mono">{t.table_schema !== "public" ? `${t.table_schema}.` : ""}{t.table_name}</span>
                          <span className="ml-auto text-muted-foreground">{t.row_estimate.toLocaleString()} rows~</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <button
                onClick={runExport}
                disabled={exportLoading || tables.length === 0}
                className="flex items-center justify-center gap-2 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exportLoading ? "Generating…" : "Download SQL Dump"}
              </button>

              <div className="rounded border border-border p-3 bg-muted/20 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground/70">What's included</p>
                <p>• <code className="font-mono bg-muted px-1 rounded">DROP TABLE IF EXISTS … CASCADE</code> statements</p>
                <p>• <code className="font-mono bg-muted px-1 rounded">CREATE TABLE</code> with column types and constraints</p>
                <p>• <code className="font-mono bg-muted px-1 rounded">INSERT INTO</code> bulk data (≤10k rows/table)</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

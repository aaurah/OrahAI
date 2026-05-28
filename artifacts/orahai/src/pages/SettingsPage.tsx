import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { User, Key, Building2, Lock, Plus, Trash2, Copy, Check, Eye, EyeOff, PlugZap, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useAuth } from "@/hooks/useAuth";
import type { ApiResponse, WorkspaceWithRole } from "@/types";

const TABS = [
  { path: "/settings/profile",    label: "Profile",     icon: User },
  { path: "/settings/workspace",  label: "Workspace",   icon: Building2 },
  { path: "/settings/password",   label: "Password",    icon: Lock },
  { path: "/settings/api-keys",   label: "API Keys",    icon: Key },
  { path: "/settings/mcp-server", label: "MCP Server",  icon: PlugZap },
];

// ── Profile tab ───────────────────────────────────────────────────────────────
function ProfileTab() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (user) { setName(user.name ?? ""); setBio(user.bio ?? ""); }
  }, [user]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await api.patch("/api/auth/me", { name: name.trim() || null, bio: bio.trim() || null });
      setMsg({ ok: true, text: "Profile saved." });
    } catch (e: unknown) {
      setMsg({ ok: false, text: (e as Error).message ?? "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Profile</h2>
        <p className="text-sm text-muted-foreground">Update your display name and bio.</p>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Email</label>
          <input
            className="w-full rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
            value={user?.email ?? ""}
            disabled
            readOnly
          />
          <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Username</label>
          <input
            className="w-full rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
            value={user?.username ?? ""}
            disabled
            readOnly
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Display name</label>
          <input
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Your full name"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Bio</label>
          <textarea
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder="A short bio about you"
            value={bio}
            onChange={e => setBio(e.target.value)}
            rows={3}
            maxLength={500}
          />
        </div>

        {msg && (
          <p className={cn("text-sm", msg.ok ? "text-green-500" : "text-destructive")}>{msg.text}</p>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}

// ── Workspace tab ─────────────────────────────────────────────────────────────
function WorkspaceTab() {
  const { workspaces, mutate } = useWorkspaces();
  const [editing, setEditing] = useState<Record<string, { name: string; description: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [msgs, setMsgs] = useState<Record<string, { ok: boolean; text: string }>>({});

  useEffect(() => {
    const initial: Record<string, { name: string; description: string }> = {};
    for (const ws of workspaces) {
      if (!editing[ws.id]) {
        initial[ws.id] = { name: ws.name, description: ws.description ?? "" };
      }
    }
    if (Object.keys(initial).length) setEditing(prev => ({ ...initial, ...prev }));
  }, [workspaces]);

  function setField(id: string, field: "name" | "description", value: string) {
    setEditing(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function save(ws: WorkspaceWithRole) {
    const vals = editing[ws.id];
    if (!vals?.name?.trim()) return;
    setSaving(prev => ({ ...prev, [ws.id]: true }));
    setMsgs(prev => ({ ...prev, [ws.id]: { ok: false, text: "" } }));
    try {
      await api.patch(`/api/workspaces/${ws.id}`, {
        name: vals.name.trim(),
        description: vals.description.trim() || null,
      });
      await mutate();
      setMsgs(prev => ({ ...prev, [ws.id]: { ok: true, text: "Workspace updated." } }));
    } catch (e: unknown) {
      setMsgs(prev => ({ ...prev, [ws.id]: { ok: false, text: (e as Error).message ?? "Failed." } }));
    } finally {
      setSaving(prev => ({ ...prev, [ws.id]: false }));
    }
  }

  if (!workspaces.length) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-1">Workspace</h2>
          <p className="text-sm text-muted-foreground">Manage your workspace settings.</p>
        </div>
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Workspace</h2>
        <p className="text-sm text-muted-foreground">Rename your workspace or update its description.</p>
      </div>

      {workspaces.map(ws => {
        const vals = editing[ws.id] ?? { name: ws.name, description: ws.description ?? "" };
        const isSaving = saving[ws.id] ?? false;
        const msg = msgs[ws.id];
        const canEdit = ws.role === "owner" || ws.role === "admin";

        return (
          <div key={ws.id} className="rounded-xl border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-primary" />
                </div>
                <span className="font-medium">{ws.name}</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                {ws.role}
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Workspace name</label>
              <input
                className={cn(
                  "w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary",
                  !canEdit && "bg-muted text-muted-foreground cursor-not-allowed"
                )}
                value={vals.name}
                onChange={e => setField(ws.id, "name", e.target.value)}
                disabled={!canEdit}
                maxLength={80}
                placeholder="Workspace name"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
              <input
                className={cn(
                  "w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary",
                  !canEdit && "bg-muted text-muted-foreground cursor-not-allowed"
                )}
                value={vals.description}
                onChange={e => setField(ws.id, "description", e.target.value)}
                disabled={!canEdit}
                maxLength={300}
                placeholder="Short description of this workspace"
              />
            </div>

            {msg?.text && (
              <p className={cn("text-sm", msg.ok ? "text-green-500" : "text-destructive")}>{msg.text}</p>
            )}

            {canEdit && (
              <button
                onClick={() => save(ws)}
                disabled={isSaving || !vals.name.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isSaving ? "Saving…" : "Save workspace"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Password tab ──────────────────────────────────────────────────────────────
function PasswordTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    if (next !== confirm) {
      setMsg({ ok: false, text: "New passwords do not match." });
      return;
    }
    if (next.length < 8) {
      setMsg({ ok: false, text: "New password must be at least 8 characters." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await api.post("/api/auth/change-password", { currentPassword: current, newPassword: next });
      setMsg({ ok: true, text: "Password changed successfully." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e: unknown) {
      setMsg({ ok: false, text: (e as Error).message ?? "Failed to change password." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Password</h2>
        <p className="text-sm text-muted-foreground">Change your account password.</p>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Current password</label>
          <input
            type="password"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={current}
            onChange={e => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">New password</label>
          <input
            type="password"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={next}
            onChange={e => setNext(e.target.value)}
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Confirm new password</label>
          <input
            type="password"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        {msg && (
          <p className={cn("text-sm", msg.ok ? "text-green-500" : "text-destructive")}>{msg.text}</p>
        )}

        <button
          onClick={save}
          disabled={saving || !current || !next || !confirm}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {saving ? "Saving…" : "Change password"}
        </button>
      </div>
    </div>
  );
}

// ── API Keys tab ──────────────────────────────────────────────────────────────
interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface NewKeyResult extends ApiKeyRow {
  key: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function NewKeyBanner({ result, onDismiss }: { result: NewKeyResult; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-emerald-400">Key created — copy it now</p>
          <p className="text-xs text-muted-foreground mt-0.5">This is the only time you'll see the full key.</p>
        </div>
        <button onClick={onDismiss} className="text-xs text-muted-foreground hover:text-foreground">
          Dismiss
        </button>
      </div>
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 font-mono text-xs break-all">
        <span className="flex-1 select-all">{visible ? result.key : result.keyPrefix + "•".repeat(result.key.length - result.keyPrefix.length)}</span>
        <button
          onClick={() => setVisible(v => !v)}
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
          title={visible ? "Hide" : "Reveal"}
        >
          {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
        <CopyButton text={result.key} />
      </div>
    </div>
  );
}

function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<NewKeyResult | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<ApiKeyRow[]>("/api/user/api-keys");
      setKeys(rows);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!newName.trim()) return;
    setCreating(true);
    setErr(null);
    try {
      const result = await api.post<NewKeyResult>("/api/user/api-keys", { name: newName.trim() });
      setNewKey(result);
      setNewName("");
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setRevoking(id);
    try {
      await api.delete(`/api/user/api-keys/${id}`);
      await load();
    } catch { /* ignore */ } finally {
      setRevoking(null);
    }
  }

  const activeKeys = keys.filter(k => !k.revokedAt);
  const revokedKeys = keys.filter(k => k.revokedAt);

  function fmtDate(d: string | null) {
    if (!d) return "Never";
    return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold mb-1">API Keys</h2>
          <p className="text-sm text-muted-foreground">
            Use API keys to authenticate programmatic requests to the OrahAI API.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New key
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Create a new API key</p>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") create(); if (e.key === "Escape") setShowForm(false); }}
            placeholder="Key name (e.g. My script)"
            autoFocus
            maxLength={80}
            className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={creating || !newName.trim()}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating…" : "Create key"}
            </button>
            <button
              onClick={() => { setShowForm(false); setErr(null); setNewName(""); }}
              className="px-3 py-1.5 text-sm rounded-lg border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* New key reveal banner */}
      {newKey && <NewKeyBanner result={newKey} onDismiss={() => setNewKey(null)} />}

      {/* Active keys */}
      {loading ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
      ) : activeKeys.length === 0 && !showForm ? (
        <div className="rounded-xl border bg-card p-8 text-center space-y-2">
          <Key className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-sm text-primary hover:underline"
          >
            Create your first key
          </button>
        </div>
      ) : activeKeys.length > 0 ? (
        <div className="rounded-xl border divide-y divide-border overflow-hidden">
          {activeKeys.map(key => (
            <div key={key.id} className="flex items-center gap-3 px-4 py-3 bg-card">
              <Key className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{key.name}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {key.keyPrefix}••••••••
                  <span className="ml-3 font-sans">Created {fmtDate(key.createdAt)}</span>
                  {key.lastUsedAt && <span className="ml-2">· Last used {fmtDate(key.lastUsedAt)}</span>}
                </p>
              </div>
              <button
                onClick={() => revoke(key.id)}
                disabled={revoking === key.id}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                {revoking === key.id ? "Revoking…" : "Revoke"}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Usage hint */}
      {activeKeys.length > 0 && (
        <div className="rounded-xl border bg-muted/30 p-4 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Usage</p>
          <div className="flex items-center gap-2 font-mono text-xs bg-card rounded-lg border px-3 py-2">
            <span className="flex-1 select-all text-muted-foreground">Authorization: Bearer {"<your-key>"}</span>
          </div>
        </div>
      )}

      {/* Revoked keys (collapsed section) */}
      {revokedKeys.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground list-none flex items-center gap-1">
            <span className="group-open:hidden">▶</span>
            <span className="hidden group-open:inline">▼</span>
            {revokedKeys.length} revoked key{revokedKeys.length > 1 ? "s" : ""}
          </summary>
          <div className="mt-2 rounded-xl border divide-y divide-border overflow-hidden opacity-60">
            {revokedKeys.map(key => (
              <div key={key.id} className="flex items-center gap-3 px-4 py-3 bg-card">
                <Key className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate line-through text-muted-foreground">{key.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {key.keyPrefix}••••••••
                    <span className="ml-3 font-sans">Revoked {fmtDate(key.revokedAt)}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── MCP Server tab ────────────────────────────────────────────────────────────
function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/40">
        <span className="font-medium text-muted-foreground">{label}</span>
        <CopyButton text={code} />
      </div>
      <pre className="p-3 overflow-x-auto text-foreground leading-relaxed whitespace-pre">{code}</pre>
    </div>
  );
}

function McpServerTab() {
  const baseUrl = typeof window !== "undefined"
    ? window.location.origin
    : "https://orahai.replit.app";

  const httpUrl = `${baseUrl}/api/mcp`;
  const sseUrl  = `${baseUrl}/api/mcp/sse`;

  const claudeConfig = JSON.stringify({
    mcpServers: {
      orahai: {
        type: "http",
        url: httpUrl,
        headers: { Authorization: "Bearer YOUR_API_KEY" },
      },
    },
  }, null, 2);

  const cursorConfig = JSON.stringify({
    mcpServers: {
      orahai: {
        url: httpUrl,
        headers: { Authorization: "Bearer YOUR_API_KEY" },
      },
    },
  }, null, 2);

  const windsurfConfig = JSON.stringify({
    mcpServers: {
      orahai: {
        serverUrl: sseUrl,
        headers: { Authorization: "Bearer YOUR_API_KEY" },
      },
    },
  }, null, 2);

  const TOOLS = [
    { name: "list_projects",  desc: "List all your accessible projects" },
    { name: "list_files",     desc: "List files in a project" },
    { name: "read_file",      desc: "Read a file's content" },
    { name: "write_file",     desc: "Create or overwrite a file" },
    { name: "delete_file",    desc: "Soft-delete a file" },
    { name: "search_files",   desc: "Search text across all files in a project" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Connect OrahAI as an MCP Server</h2>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Give any MCP-compatible AI (Claude, Cursor, Windsurf, …) direct access to your OrahAI projects — read files, write code, and search across your workspace.
        </p>
      </div>

      {/* Step 1 — API key */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">1</span>
          <h3 className="font-medium">Generate an API key</h3>
        </div>
        <p className="text-sm text-muted-foreground ml-7">
          API keys are used instead of your password so external tools can authenticate securely.
        </p>
        <div className="ml-7">
          <a
            href="/settings/api-keys"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Key className="w-3.5 h-3.5" />
            Go to API Keys settings
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Step 2 — Endpoints */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">2</span>
          <h3 className="font-medium">Server endpoints</h3>
        </div>
        <div className="ml-7 space-y-2">
          {[
            { label: "Streamable HTTP (modern clients)", url: httpUrl },
            { label: "SSE transport (legacy clients)", url: sseUrl },
          ].map(({ label, url }) => (
            <div key={url} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 bg-muted/20">
              <span className="text-xs text-muted-foreground shrink-0">{label}</span>
              <code className="text-xs font-mono flex-1 truncate">{url}</code>
              <CopyButton text={url} />
            </div>
          ))}
        </div>
      </div>

      {/* Step 3 — Client configs */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">3</span>
          <h3 className="font-medium">Add to your AI client</h3>
        </div>
        <p className="text-sm text-muted-foreground ml-7">
          Replace <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">YOUR_API_KEY</code> with your actual key.
        </p>
        <div className="ml-7 space-y-4">
          <CodeBlock label="Claude Desktop  (claude_desktop_config.json)" code={claudeConfig} />
          <CodeBlock label="Cursor  (.cursor/mcp.json)" code={cursorConfig} />
          <CodeBlock label="Windsurf  (mcp_config.json)" code={windsurfConfig} />
        </div>
      </div>

      {/* Available tools */}
      <div className="space-y-3">
        <h3 className="font-medium">Available tools</h3>
        <div className="rounded-lg border border-border divide-y divide-border">
          {TOOLS.map(t => (
            <div key={t.name} className="flex items-start gap-3 px-4 py-2.5">
              <PlugZap className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <div>
                <code className="text-xs font-mono font-semibold">{t.name}</code>
                <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main settings page ────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [pathname, navigate] = useLocation();

  const activeTab = TABS.find(t => pathname === t.path) ?? TABS[0];

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        <div className="flex gap-1 mb-8 border-b border-border overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.path;
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab.path === "/settings/profile"     && <ProfileTab />}
        {activeTab.path === "/settings/workspace"  && <WorkspaceTab />}
        {activeTab.path === "/settings/password"   && <PasswordTab />}
        {activeTab.path === "/settings/api-keys"   && <ApiKeysTab />}
        {activeTab.path === "/settings/mcp-server" && <McpServerTab />}
      </main>
    </div>
  );
}

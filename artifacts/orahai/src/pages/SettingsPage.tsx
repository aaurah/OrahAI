import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { User, Key, Building2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useAuth } from "@/hooks/useAuth";
import type { ApiResponse, WorkspaceWithRole } from "@/types";

const TABS = [
  { path: "/settings/profile",   label: "Profile",    icon: User },
  { path: "/settings/workspace", label: "Workspace",  icon: Building2 },
  { path: "/settings/password",  label: "Password",   icon: Lock },
  { path: "/settings/api-keys",  label: "API Keys",   icon: Key },
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
function ApiKeysTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">API Keys</h2>
        <p className="text-sm text-muted-foreground">Manage your personal API keys.</p>
      </div>
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        API key management coming soon.
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

        {activeTab.path === "/settings/profile"   && <ProfileTab />}
        {activeTab.path === "/settings/workspace" && <WorkspaceTab />}
        {activeTab.path === "/settings/password"  && <PasswordTab />}
        {activeTab.path === "/settings/api-keys"  && <ApiKeysTab />}
      </main>
    </div>
  );
}

import { useState, useRef } from "react";
import { Plus, Trash2, Eye, EyeOff, KeyRound, Loader2, X, Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { useProjectSecrets } from "@/hooks/useProjectSecrets";
import type { ProjectSecret } from "@/hooks/useProjectSecrets";

interface Props {
  projectId: string;
}

export function SecretsPanel({ projectId }: Props) {
  const { secrets, mutate } = useProjectSecrets(projectId);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async () => {
    if (!newKey.trim() || saving) return;
    setSaving(true);
    try {
      await api.post(`/api/projects/${projectId}/secrets`, { key: newKey.trim().toUpperCase().replace(/\s+/g, "_"), value: newValue });
      await mutate();
      setNewKey(""); setNewValue(""); setAdding(false);
      toast({ title: "Secret saved" });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast({ title: e.response?.data?.message ?? "Failed to save secret", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReveal = async (s: ProjectSecret) => {
    if (revealed[s.id]) { setRevealed(r => { const n = { ...r }; delete n[s.id]; return n; }); return; }
    setRevealing(s.id);
    try {
      const res = await api.get<{ data: { value: string } }>(`/api/projects/${projectId}/secrets/${s.id}/reveal`);
      setRevealed(r => ({ ...r, [s.id]: res.data.value }));
    } catch {
      toast({ title: "Could not reveal secret", variant: "destructive" });
    } finally {
      setRevealing(null);
    }
  };

  const handleEditSave = async (s: ProjectSecret) => {
    setEditSaving(true);
    try {
      await api.patch(`/api/projects/${projectId}/secrets/${s.id}`, { value: editValue });
      await mutate();
      setEditingId(null);
      setRevealed(r => { const n = { ...r }; delete n[s.id]; return n; });
      toast({ title: "Secret updated" });
    } catch {
      toast({ title: "Failed to update secret", variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (s: ProjectSecret) => {
    setDeletingId(s.id);
    try {
      await api.delete(`/api/projects/${projectId}/secrets/${s.id}`);
      await mutate();
      toast({ title: `${s.key} deleted` });
    } catch {
      toast({ title: "Failed to delete secret", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleEnvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!e.target.files) return;
    e.target.value = "";
    if (!file) return;
    if (file.size > 500_000) { toast({ title: "File too large (max 500 KB)", variant: "destructive" }); return; }
    setImporting(true);
    try {
      const content = await file.text();
      const res = await api.post<{ data: { created: number; updated: number; total: number } }>(
        `/api/projects/${projectId}/secrets/import-env`,
        { content }
      );
      await mutate();
      const { created, updated } = res.data;
      const parts: string[] = [];
      if (created) parts.push(`${created} added`);
      if (updated) parts.push(`${updated} updated`);
      toast({ title: `.env imported — ${parts.join(", ")}` });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast({ title: e.response?.data?.message ?? "Import failed", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-10 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <KeyRound className="w-3.5 h-3.5" />
          Secrets
        </div>
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".env,text/plain"
            className="hidden"
            onChange={handleEnvFile}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Import .env file"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          </button>
          <button
            onClick={() => { setAdding(v => !v); setNewKey(""); setNewValue(""); }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Add secret"
          >
            {adding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {adding && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">New secret</p>
            <Input
              placeholder="KEY_NAME"
              value={newKey}
              onChange={e => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
              className="h-8 text-xs font-mono"
              autoFocus
            />
            <Input
              placeholder="value"
              type="password"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              className="h-8 text-xs font-mono"
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleAdd} disabled={!newKey.trim() || saving}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {secrets.length === 0 && !adding && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No secrets yet</p>
              <p className="text-xs text-muted-foreground mt-1">Store API keys and env vars here. They're masked and never exposed in logs.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="text-xs">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add secret
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing} className="text-xs">
                <Upload className="w-3.5 h-3.5 mr-1" /> Import .env
              </Button>
            </div>
          </div>
        )}

        {secrets.map(s => (
          <div key={s.id} className="group rounded-lg border border-border bg-card px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-foreground">{s.key}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleReveal(s)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title={revealed[s.id] ? "Hide" : "Reveal"}
                >
                  {revealing === s.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : revealed[s.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => { setEditingId(s.id); setEditValue(revealed[s.id] ?? ""); }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs leading-none"
                  title="Edit value"
                >Edit</button>
                <button
                  onClick={() => handleDelete(s)}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete"
                >
                  {deletingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {editingId === s.id ? (
              <div className="flex gap-1.5">
                <Input
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  className="h-7 text-xs font-mono flex-1"
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter") handleEditSave(s); if (e.key === "Escape") setEditingId(null); }}
                />
                <button onClick={() => handleEditSave(s)} disabled={editSaving}
                  className="p-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                  {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setEditingId(null)}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="font-mono text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1 truncate">
                {revealed[s.id] ? revealed[s.id] : "••••••••••••"}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="px-3 py-2 border-t border-border shrink-0">
        <p className="text-[10px] text-muted-foreground/60 leading-snug">
          Secrets are stored encrypted. Use them as environment variables when your sandbox executes code.
        </p>
      </div>
    </div>
  );
}

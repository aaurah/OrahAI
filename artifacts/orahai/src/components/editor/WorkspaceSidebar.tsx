import { useState, useCallback, useEffect } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, Trash2, RefreshCw, FilePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useFiles } from "@/hooks/useFiles";
import { toast } from "@/hooks/useToast";
import type { FileNode, ProjectFile } from "@/types";

interface Props {
  projectId: string;
  activeFilePath?: string;
  onFileSelect: (file: ProjectFile) => void;
  refreshKey?: number;
}

export function WorkspaceSidebar({ projectId, activeFilePath, onFileSelect, refreshKey }: Props) {
  const { tree, flat, isLoading, mutate } = useFiles(projectId);

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) mutate();
  }, [refreshKey, mutate]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const toggle = (path: string) =>
    setExpanded((s) => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n; });

  const openCreateInput = (parentPath: string) => {
    setCreating(parentPath);
    setNewName("");
  };

  const commitCreate = useCallback(async () => {
    if (!newName.trim()) { setCreating(null); return; }
    const path = creating ? `${creating}/${newName.trim()}` : newName.trim();
    try {
      await api.put(`/api/files/${projectId}`, { path, content: "" });
      await mutate();
      const created: ProjectFile = { id: "", projectId, path, name: newName.trim(), content: "", mimeType: "text/plain", isDir: false, size: 0, createdAt: "", updatedAt: "" };
      onFileSelect(created);
    } catch { toast({ title: "Failed to create file", variant: "destructive" }); }
    setCreating(null);
  }, [newName, creating, projectId, mutate, onFileSelect]);

  const deleteFile = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete ${path}?`)) return;
    try {
      await api.delete(`/api/files/${projectId}?path=${encodeURIComponent(path)}`);
      await mutate();
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  const selectFile = async (node: FileNode) => {
    if (node.isDir) return;
    const full = flat.find((f) => f.path === node.path);
    if (full) { onFileSelect(full); return; }
    try {
      const res = await api.get<{ data: ProjectFile }>(`/api/files/${projectId}/read?path=${encodeURIComponent(node.path)}`);
      onFileSelect(res.data);
    } catch { toast({ title: "Failed to open file", variant: "destructive" }); }
  };

  const renderNode = (node: FileNode, depth = 0): React.ReactNode => {
    const isOpen = expanded.has(node.path);
    const isActive = node.path === activeFilePath;
    const indent = depth * 12;

    return (
      <div key={node.path}>
        <div
          onClick={() => node.isDir ? toggle(node.path) : selectFile(node)}
          style={{ paddingLeft: 8 + indent }}
          className={cn(
            "group flex items-center gap-1.5 h-7 pr-1 cursor-pointer rounded-sm text-sm select-none",
            isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
          )}
        >
          {node.isDir ? (
            <>
              {isOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                       : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
              {isOpen ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                       : <Folder className="w-3.5 h-3.5 shrink-0 text-blue-400" />}
            </>
          ) : (
            <>
              <span className="w-3.5 shrink-0" />
              <File className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            </>
          )}
          <span className="flex-1 truncate text-sm leading-none">{node.name}</span>
          <button
            onClick={(e) => deleteFile(node.path, e)}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive rounded"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        {node.isDir && isOpen && (
          <div>
            {(node.children ?? []).map((child) => renderNode(child, depth + 1))}
            {creating === node.path && (
              <CreateInput indent={8 + indent + 12} value={newName} onChange={setNewName} onCommit={commitCreate} onCancel={() => setCreating(null)} />
            )}
            <button
              onClick={() => openCreateInput(node.path)}
              style={{ paddingLeft: 8 + indent + 24 }}
              className="flex items-center gap-1 h-6 w-full text-xs text-muted-foreground/60 hover:text-muted-foreground"
            >
              <FilePlus className="w-3 h-3" /> new file
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-52 flex-shrink-0 border-r border-border flex flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between px-3 h-9 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Files</span>
        <div className="flex gap-1">
          <button onClick={() => openCreateInput("")} className="p-1 rounded hover:bg-muted" title="New file">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={mutate} className="p-1 rounded hover:bg-muted" title="Refresh">
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
        ) : tree.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">No files yet</div>
        ) : (
          tree.map((node) => renderNode(node))
        )}
        {creating === "" && (
          <CreateInput indent={8} value={newName} onChange={setNewName} onCommit={commitCreate} onCancel={() => setCreating(null)} />
        )}
      </div>
    </div>
  );
}

function CreateInput({ indent, value, onChange, onCommit, onCancel }: {
  indent: number; value: string;
  onChange: (v: string) => void; onCommit: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ paddingLeft: indent }} className="pr-2 py-0.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel(); }}
        onBlur={onCommit}
        placeholder="filename.js"
        className="w-full text-sm bg-muted border border-primary rounded px-1.5 py-0.5 outline-none"
      />
    </div>
  );
}

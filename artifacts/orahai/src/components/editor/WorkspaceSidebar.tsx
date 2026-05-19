import { useState, useCallback, useEffect, useRef } from "react";
import {
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  Plus, Trash2, RefreshCw, FilePlus, FolderPlus, Pencil,
  Copy, Search, MoreHorizontal,
} from "lucide-react";
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
  onSearchOpen?: () => void;
}

interface ContextMenu {
  x: number;
  y: number;
  node: FileNode;
}

export function WorkspaceSidebar({ projectId, activeFilePath, onFileSelect, refreshKey, onSearchOpen }: Props) {
  const { tree, flat, isLoading, mutate } = useFiles(projectId);

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) mutate();
  }, [refreshKey, mutate]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<{ parent: string; isDir: boolean } | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const [searchFilter, setSearchFilter] = useState("");

  const toggle = (path: string) =>
    setExpanded(s => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n; });

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const openCreate = (parent: string, isDir = false) => {
    setCreating({ parent, isDir });
    setNewName("");
    if (parent) setExpanded(s => new Set(s).add(parent));
  };

  const commitCreate = useCallback(async () => {
    if (!newName.trim() || !creating) { setCreating(null); return; }
    const path = creating.parent ? `${creating.parent}/${newName.trim()}` : newName.trim();
    try {
      await api.put(`/api/files/${projectId}`, {
        path: creating.isDir ? path + "/.gitkeep" : path,
        content: "",
        isDir: creating.isDir,
      });
      await mutate();
      if (!creating.isDir) {
        const created: ProjectFile = {
          id: "", projectId, path, name: newName.trim(),
          content: "", mimeType: "text/plain", isDir: false, size: 0, createdAt: "", updatedAt: "",
        };
        onFileSelect(created);
      }
    } catch { toast({ title: "Failed to create", variant: "destructive" }); }
    setCreating(null);
  }, [newName, creating, projectId, mutate, onFileSelect]);

  const deleteFile = async (node: FileNode) => {
    setContextMenu(null);
    if (!confirm(`Delete "${node.path}"?`)) return;
    try {
      await api.delete(`/api/files/${projectId}?path=${encodeURIComponent(node.path)}`);
      await mutate();
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  const startRename = (node: FileNode) => {
    setContextMenu(null);
    const name = node.path.split("/").pop() ?? node.path;
    setRenaming({ path: node.path, name });
  };

  const commitRename = useCallback(async () => {
    if (!renaming || !renaming.name.trim()) { setRenaming(null); return; }
    const parts = renaming.path.split("/");
    parts[parts.length - 1] = renaming.name.trim();
    const newPath = parts.join("/");
    if (newPath === renaming.path) { setRenaming(null); return; }
    try {
      await api.post(`/api/files/${projectId}/rename`, { oldPath: renaming.path, newPath });
      await mutate();
    } catch { toast({ title: "Failed to rename", variant: "destructive" }); }
    setRenaming(null);
  }, [renaming, projectId, mutate]);

  const copyPath = (path: string) => {
    setContextMenu(null);
    navigator.clipboard.writeText(path).then(() => toast({ title: "Path copied" }));
  };

  const selectFile = async (node: FileNode) => {
    if (node.isDir) return;
    const full = flat.find(f => f.path === node.path);
    if (full) { onFileSelect(full); return; }
    try {
      const res = await api.get<{ data: ProjectFile }>(`/api/files/${projectId}/read?path=${encodeURIComponent(node.path)}`);
      onFileSelect(res.data);
    } catch { toast({ title: "Failed to open file", variant: "destructive" }); }
  };

  const filteredTree = searchFilter.trim()
    ? flat.filter(f => !f.isDir && f.path.toLowerCase().includes(searchFilter.toLowerCase()))
    : null;

  const renderNode = (node: FileNode, depth = 0): React.ReactNode => {
    const isOpen = expanded.has(node.path);
    const isActive = node.path === activeFilePath;
    const indent = depth * 12;
    const isRenaming = renaming?.path === node.path;

    return (
      <div key={node.path}>
        <div
          onClick={() => node.isDir ? toggle(node.path) : selectFile(node)}
          onContextMenu={e => handleContextMenu(e, node)}
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

          {isRenaming ? (
            <input
              autoFocus
              value={renaming.name}
              onChange={e => setRenaming(r => r ? { ...r, name: e.target.value } : r)}
              onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
              onBlur={commitRename}
              onClick={e => e.stopPropagation()}
              className="flex-1 text-sm bg-muted border border-primary rounded px-1 py-0.5 outline-none min-w-0"
            />
          ) : (
            <span className="flex-1 truncate text-sm leading-none">{node.name}</span>
          )}

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
            {node.isDir && (
              <>
                <button onClick={e => { e.stopPropagation(); openCreate(node.path, false); }}
                  className="p-0.5 hover:text-foreground text-muted-foreground rounded" title="New file">
                  <FilePlus className="w-3 h-3" />
                </button>
                <button onClick={e => { e.stopPropagation(); openCreate(node.path, true); }}
                  className="p-0.5 hover:text-foreground text-muted-foreground rounded" title="New folder">
                  <FolderPlus className="w-3 h-3" />
                </button>
              </>
            )}
            <button onClick={e => { e.stopPropagation(); startRename(node); }}
              className="p-0.5 hover:text-foreground text-muted-foreground rounded" title="Rename">
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={e => { e.stopPropagation(); deleteFile(node); }}
              className="p-0.5 hover:text-destructive text-muted-foreground rounded" title="Delete">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {node.isDir && isOpen && (
          <div>
            {(node.children ?? []).map(child => renderNode(child, depth + 1))}
            {creating?.parent === node.path && (
              <CreateInput
                indent={8 + indent + 12}
                value={newName}
                isDir={creating.isDir}
                onChange={setNewName}
                onCommit={commitCreate}
                onCancel={() => setCreating(null)}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-52 flex-shrink-0 border-r border-border flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Files</span>
        <div className="flex gap-0.5">
          {onSearchOpen && (
            <button onClick={onSearchOpen} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Search in files (Ctrl+Shift+F)">
              <Search className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => openCreate("", false)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="New file">
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => openCreate("", true)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="New folder">
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => mutate()} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Refresh">
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-2 py-1.5 border-b border-border/40">
        <div className="flex items-center gap-1.5 h-6 px-2 rounded-md border border-input/50 bg-muted/20 focus-within:border-input">
          <Search className="w-3 h-3 text-muted-foreground/60 shrink-0" />
          <input
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            placeholder="Filter files…"
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
        ) : filteredTree ? (
          filteredTree.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No files match</div>
          ) : (
            filteredTree.map(f => (
              <button key={f.path} onClick={() => onFileSelect(f)}
                className={cn("w-full flex items-center gap-1.5 h-7 px-3 text-sm cursor-pointer rounded-sm truncate",
                  activeFilePath === f.path ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
                <File className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{f.path}</span>
              </button>
            ))
          )
        ) : tree.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">No files yet</div>
        ) : (
          tree.map(node => renderNode(node))
        )}
        {creating?.parent === "" && (
          <CreateInput
            indent={8}
            value={newName}
            isDir={creating.isDir}
            onChange={setNewName}
            onCommit={commitCreate}
            onCancel={() => setCreating(null)}
          />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          style={{ top: contextMenu.y, left: contextMenu.x, position: "fixed", zIndex: 9999 }}
          className="min-w-[160px] bg-card border border-border rounded-lg shadow-xl overflow-hidden py-1"
        >
          {[
            { icon: <Pencil className="w-3.5 h-3.5" />, label: "Rename", action: () => startRename(contextMenu.node) },
            { icon: <Copy className="w-3.5 h-3.5" />, label: "Copy path", action: () => copyPath(contextMenu.node.path) },
            ...(contextMenu.node.isDir ? [
              { icon: <FilePlus className="w-3.5 h-3.5" />, label: "New file here", action: () => { setContextMenu(null); openCreate(contextMenu.node.path, false); } },
              { icon: <FolderPlus className="w-3.5 h-3.5" />, label: "New folder here", action: () => { setContextMenu(null); openCreate(contextMenu.node.path, true); } },
            ] : []),
            { icon: <Trash2 className="w-3.5 h-3.5 text-destructive" />, label: <span className="text-destructive">Delete</span>, action: () => deleteFile(contextMenu.node) },
          ].map((item, i) => (
            <button key={i} onClick={item.action}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left">
              <span className="text-muted-foreground">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateInput({ indent, value, isDir, onChange, onCommit, onCancel }: {
  indent: number; value: string; isDir: boolean;
  onChange: (v: string) => void; onCommit: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ paddingLeft: indent }} className="pr-2 py-0.5 flex items-center gap-1">
      {isDir ? <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" /> : <File className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel(); }}
        onBlur={onCommit}
        placeholder={isDir ? "folder-name" : "filename.js"}
        className="flex-1 text-sm bg-muted border border-primary rounded px-1.5 py-0.5 outline-none"
      />
    </div>
  );
}

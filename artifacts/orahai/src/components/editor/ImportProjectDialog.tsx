import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  X, Github, Upload, Loader2, Star, GitFork, Lock, Globe,
  FileCode2, AlertCircle, FolderOpen, ExternalLink, ChevronRight, CheckCircle2,
} from "lucide-react";
import { Decompress, unzip } from "fflate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import type { ApiResponse, GitHubRepoPreview, ProjectWithCounts } from "@/types";

type Tab = "github" | "local" | "replit";

interface LocalFile { path: string; content: string; }

interface Props {
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}

const SKIP_PATHS = ["node_modules/", ".git/", ".next/", "dist/", "build/", "__pycache__/"];
const TEXT_EXTS = new Set(["js","jsx","ts","tsx","mjs","cjs","py","rb","php","go","rs","java","c","cpp","h","cs","html","css","scss","less","svelte","vue","json","yaml","yml","toml","xml","md","txt","sh","sql","graphql","gitignore","env","dockerfile","makefile"]);
const MAX_FILE_CONTENT = 500_000; // 500 KB per file

function isTextFile(path: string): boolean {
  if (SKIP_PATHS.some(s => path.includes(s))) return false;
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  const parts = name.split(".");
  if (parts.length < 2) return ["makefile","dockerfile","rakefile","gemfile","procfile"].includes(name);
  return TEXT_EXTS.has(parts[parts.length - 1]);
}

function detectLanguage(files: LocalFile[]): string {
  const paths = files.map(f => f.path.toLowerCase());
  if (paths.some(p => p.endsWith(".py"))) return "python";
  if (paths.some(p => p.endsWith(".ts") || p.endsWith(".tsx"))) return "typescript";
  if (paths.some(p => p.endsWith(".html"))) return "html";
  return "nodejs";
}

// ── Streaming tar string reader ───────────────────────────────────────────────

function readTarStr(buf: Uint8Array, offset: number, length: number): string {
  let end = offset;
  while (end < offset + length && buf[end] !== 0) end++;
  return new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(offset, end));
}

// ── Incremental tar parser (processes chunks as they arrive) ──────────────────

type TarState = "header" | "data" | "skip";

class TarStream {
  private buf: Uint8Array = new Uint8Array(0);
  private state: TarState = "header";
  private fileSize = 0;      // actual content size in bytes
  private blockSize = 0;     // fileSize rounded up to 512-byte boundary
  private currentPath = "";
  private wantFile = false;
  private chunks: Uint8Array[] = [];
  private chunksLen = 0;
  fileCount = 0;

  constructor(private onFile: (f: LocalFile) => void) {}

  push(chunk: Uint8Array) {
    // Append new data
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
    this.drain();
  }

  private drain() {
    while (true) {
      if (this.state === "header") {
        if (this.buf.length < 512) return;
        const hdr = this.buf.slice(0, 512);
        this.buf = this.buf.slice(512);

        // Two zero blocks = end of archive
        if (hdr[0] === 0) return;

        const name   = readTarStr(hdr, 0, 100);
        const prefix = readTarStr(hdr, 345, 155);
        const full   = prefix ? `${prefix}/${name}` : name;
        const path   = full.replace(/^[^/]+\//, ""); // strip top-level dir

        const sizeOct = readTarStr(hdr, 124, 12).trim();
        this.fileSize  = parseInt(sizeOct, 8) || 0;
        this.blockSize = Math.ceil(this.fileSize / 512) * 512;

        const type = String.fromCharCode(hdr[156]);
        const isRegular = type === "0" || type === "\0" || type === "";

        this.currentPath = path;
        this.wantFile    = isRegular && this.fileSize > 0 && !!path && isTextFile(path) && this.fileSize <= MAX_FILE_CONTENT;
        this.chunks      = [];
        this.chunksLen   = 0;
        this.state       = this.fileSize > 0 ? (this.wantFile ? "data" : "skip") : "header";

      } else if (this.state === "data") {
        if (this.buf.length < this.blockSize) return;
        const raw = this.buf.slice(0, this.fileSize);
        this.buf  = this.buf.slice(this.blockSize);
        try {
          const content = new TextDecoder("utf-8", { fatal: true }).decode(raw);
          this.onFile({ path: this.currentPath, content });
          this.fileCount++;
        } catch { /* binary — skip */ }
        this.state = "header";

      } else { // "skip"
        if (this.buf.length < this.blockSize) return;
        this.buf   = this.buf.slice(this.blockSize);
        this.state = "header";
      }
    }
  }
}

// ── Streaming tar.gz extractor ────────────────────────────────────────────────

async function extractTarGz(
  file: File,
  onProgress: (pct: number) => void,
): Promise<LocalFile[]> {
  const results: LocalFile[] = [];
  const tar = new TarStream(f => results.push(f));

  return new Promise((resolve, reject) => {
    let bytesRead = 0;
    const total = file.size;

    const dc = new Decompress((chunk: Uint8Array) => {
      tar.push(chunk);
    });

    const reader = file.stream().getReader();

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { dc.push(new Uint8Array(0), true); break; }
          bytesRead += value.length;
          onProgress(Math.round((bytesRead / total) * 100));
          dc.push(value, false);
        }
        resolve(results);
      } catch (e) {
        reject(e);
      }
    };

    pump();
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ImportProjectDialog({ onOpenChange, onImported }: Props) {
  const [, navigate] = useLocation();
  const { workspaces } = useWorkspaces();
  const [tab, setTab] = useState<Tab>("github");

  // GitHub state
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [patOverride, setPatOverride] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [preview, setPreview] = useState<GitHubRepoPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isGhImporting, setIsGhImporting] = useState(false);

  // Local/Replit state
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [localName, setLocalName] = useState("");
  const [localWorkspace, setLocalWorkspace] = useState("");
  const [isLocalImporting, setIsLocalImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractPct, setExtractPct] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef  = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    onOpenChange(false);
    setRepoUrl(""); setBranch(""); setPatOverride(""); setPreview(null);
    setLocalFiles([]); setLocalName(""); setError(null);
    setExtracting(false); setExtractPct(0);
  };

  // ── GitHub tab ─────────────────────────────────────────────────────────────

  const handleGhPreview = async () => {
    if (!repoUrl.trim()) return;
    setError(null); setPreview(null); setIsPreviewing(true);
    try {
      const res = await api.post<ApiResponse<GitHubRepoPreview>>("/api/github/preview", {
        repoUrl: repoUrl.trim(), ...(patOverride ? { token: patOverride } : {}),
      });
      setPreview(res.data);
      if (!branch) setBranch(res.data.defaultBranch);
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setIsPreviewing(false); }
  };

  const handleGhImport = async () => {
    if (!preview) return;
    const ws = localWorkspace || workspaces[0]?.id;
    if (!ws) { setError("Please select a workspace"); return; }
    setIsGhImporting(true); setError(null);
    try {
      const res = await api.post<ApiResponse<ProjectWithCounts>>("/api/github/import", {
        repoUrl: repoUrl.trim(),
        workspaceId: ws,
        branch: branch || preview.defaultBranch,
        ...(patOverride ? { token: patOverride } : {}),
      });
      toast({ title: `Imported ${preview.name}`, description: `${res.data._count.files} files imported` });
      handleClose(); onImported?.();
      navigate(`/workspace/${res.data.id}?setup=1`);
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setIsGhImporting(false); }
  };

  // ── Local / archive processing ─────────────────────────────────────────────

  const isArchive = (name: string) =>
    name.endsWith(".zip") || name.endsWith(".tar.gz") || name.endsWith(".tgz");

  const processArchive = useCallback(async (file: File) => {
    setError(null);
    setLocalFiles([]);
    const isTarGz = file.name.endsWith(".tar.gz") || file.name.endsWith(".tgz");

    if (isTarGz) {
      setExtracting(true);
      setExtractPct(0);
      try {
        const extracted = await extractTarGz(file, pct => setExtractPct(pct));
        if (extracted.length === 0) {
          setError("No importable text files found in archive. Binary files and common build folders (node_modules, dist, .git) are skipped.");
          return;
        }
        setLocalFiles(extracted);
        if (!localName) setLocalName(file.name.replace(/\.(tar\.gz|tgz)$/i, ""));
      } catch (err: unknown) {
        const msg = (err as Error).message ?? "";
        if (msg.includes("Decompression")) {
          setError("Could not decompress the file — it may be corrupt or not a valid gzip archive.");
        } else {
          setError(`Extraction failed: ${msg}`);
        }
      } finally {
        setExtracting(false);
      }
    } else {
      // ZIP — async via fflate (memory-efficient for typical sizes)
      setExtracting(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        const buf = new Uint8Array(e.target!.result as ArrayBuffer);
        unzip(buf, (err, unzipped) => {
          setExtracting(false);
          if (err) { setError("Failed to extract ZIP file — it may be corrupt."); return; }
          const extracted: LocalFile[] = [];
          for (const [rawPath, data] of Object.entries(unzipped)) {
            if (rawPath.endsWith("/")) continue;
            const path = rawPath.replace(/^[^/]+\//, "");
            if (!path || !isTextFile(path)) continue;
            if (data.length > MAX_FILE_CONTENT) continue;
            try { extracted.push({ path, content: new TextDecoder().decode(data) }); }
            catch { /* skip binary */ }
          }
          if (extracted.length === 0) {
            setError("No importable text files found in ZIP.");
            return;
          }
          setLocalFiles(extracted);
          if (!localName) setLocalName(file.name.replace(/\.zip$/i, ""));
        });
      };
      reader.onerror = () => { setExtracting(false); setError("Failed to read file."); };
      reader.readAsArrayBuffer(file);
    }
  }, [localName]);

  const processFiles = useCallback((fileList: FileList) => {
    const results: LocalFile[] = [];
    let pending = 0;
    Array.from(fileList).forEach((file) => {
      if (isArchive(file.name)) { processArchive(file); return; }
      if (!isTextFile(file.name)) return;
      pending++;
      const reader = new FileReader();
      reader.onload = (e) => {
        try { results.push({ path: file.webkitRelativePath || file.name, content: e.target!.result as string }); }
        catch {}
        pending--;
        if (pending === 0) setLocalFiles((prev) => [...prev, ...results]);
      };
      reader.readAsText(file);
    });
  }, [processArchive]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const handleLocalImport = async () => {
    if (!localFiles.length || !localName.trim()) return;
    const ws = localWorkspace || workspaces[0]?.id;
    if (!ws) { setError("Please select a workspace"); return; }
    setIsLocalImporting(true); setError(null);
    try {
      const res = await api.post<ApiResponse<ProjectWithCounts>>("/api/projects/import/files", {
        workspaceId: ws, name: localName.trim(),
        language: detectLanguage(localFiles),
        files: localFiles.slice(0, 200),
      });
      toast({ title: `Imported ${localName}`, description: `${res.data._count.files} files` });
      handleClose(); onImported?.();
      navigate(`/workspace/${res.data.id}?setup=1`);
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setIsLocalImporting(false); }
  };

  const WorkspaceSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div className="space-y-1.5">
      <Label>Workspace</Label>
      {workspaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">No workspaces found.</p>
      ) : (
        <select value={value || workspaces[0]?.id || ""} onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}
    </div>
  );

  // ── Archive extraction progress UI ─────────────────────────────────────────

  const ExtractionProgress = () => (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
        <span className="text-sm font-medium">Extracting archive…</span>
        <span className="ml-auto text-xs text-muted-foreground">{extractPct}%</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-200"
          style={{ width: `${extractPct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">Large archives may take a moment — please keep this tab open.</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg bg-card border rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">Import project</h2>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-border shrink-0">
          {([
            { id: "github", label: "GitHub",      icon: Github },
            { id: "local",  label: "Local files", icon: Upload },
            { id: "replit", label: "From Replit", icon: ExternalLink },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setTab(id); setError(null); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* ── GitHub tab ────────────────────────────────────────────── */}
          {tab === "github" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Repository URL</Label>
                <div className="flex gap-2">
                  <Input placeholder="https://github.com/owner/repo" value={repoUrl}
                    onChange={(e) => { setRepoUrl(e.target.value); setPreview(null); setError(null); }}
                    onKeyDown={(e) => e.key === "Enter" && handleGhPreview()}
                    className="flex-1" />
                  <Button variant="outline" onClick={handleGhPreview} disabled={!repoUrl.trim() || isPreviewing} className="shrink-0">
                    {isPreviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Preview"}
                  </Button>
                </div>
              </div>

              <button onClick={() => setShowPat((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight className={`w-3 h-3 transition-transform ${showPat ? "rotate-90" : ""}`} />
                Use a token for private repos
              </button>
              {showPat && (
                <div className="space-y-1.5">
                  <Label>GitHub Personal Access Token</Label>
                  <Input type="password" placeholder="ghp_xxxxxxxxxxxx" value={patOverride} onChange={(e) => setPatOverride(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Only used for this import. Save permanently in GitHub settings.</p>
                </div>
              )}

              {preview && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    {preview.private ? <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /> : <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{preview.fullName}</p>
                      {preview.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{preview.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    {preview.language && <span className="flex items-center gap-1"><FileCode2 className="w-3 h-3" />{preview.language}</span>}
                    <span className="flex items-center gap-1"><Star className="w-3 h-3" />{preview.stars.toLocaleString()}</span>
                    <span className="flex items-center gap-1"><GitFork className="w-3 h-3" />{preview.forks.toLocaleString()}</span>
                    <span className="ml-auto text-primary font-medium">{preview.importableFiles} files</span>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Branch</Label>
                    <Input placeholder={preview.defaultBranch} value={branch} onChange={(e) => setBranch(e.target.value)} />
                  </div>
                  <WorkspaceSelect value={localWorkspace} onChange={setLocalWorkspace} />
                  <Button className="w-full gap-2" onClick={handleGhImport} disabled={isGhImporting}>
                    {isGhImporting ? <><Loader2 className="w-4 h-4 animate-spin" />Importing…</> : <><Github className="w-4 h-4" />Import {preview.importableFiles} files</>}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Local files tab ──────────────────────────────────────── */}
          {tab === "local" && (
            <div className="space-y-4">
              {extracting ? (
                <ExtractionProgress />
              ) : (
                <>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FolderOpen className={`w-8 h-8 mx-auto mb-3 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="text-sm font-medium mb-1">Drop files, ZIP, or tar.gz here</p>
                    <p className="text-xs text-muted-foreground">Or click to browse files</p>
                    <input ref={fileInputRef} type="file" multiple className="hidden"
                      accept=".js,.jsx,.ts,.tsx,.py,.html,.css,.json,.md,.txt,.sh,.yaml,.yml,.toml,.go,.rs,.java,.c,.cpp,.h,.zip,.tar.gz,.tgz"
                      onChange={(e) => e.target.files && processFiles(e.target.files)} />
                  </div>

                  <div className="text-center">
                    <button onClick={() => zipInputRef.current?.click()}
                      className="text-sm text-primary hover:underline">
                      Upload a ZIP or tar.gz instead
                    </button>
                    <input ref={zipInputRef} type="file" accept=".zip,.tar.gz,.tgz" className="hidden"
                      onChange={(e) => e.target.files?.[0] && processArchive(e.target.files[0])} />
                  </div>
                </>
              )}

              {!extracting && localFiles.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    <p className="text-sm font-medium">{localFiles.length} files ready to import</p>
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-0.5">
                    {localFiles.slice(0, 20).map((f) => (
                      <p key={f.path} className="text-xs text-muted-foreground truncate">{f.path}</p>
                    ))}
                    {localFiles.length > 20 && <p className="text-xs text-muted-foreground">…and {localFiles.length - 20} more</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Project name</Label>
                    <Input placeholder="My project" value={localName} onChange={(e) => setLocalName(e.target.value)} />
                  </div>
                  <WorkspaceSelect value={localWorkspace} onChange={setLocalWorkspace} />
                  <Button className="w-full gap-2" onClick={handleLocalImport} disabled={isLocalImporting || !localName.trim()}>
                    {isLocalImporting ? <><Loader2 className="w-4 h-4 animate-spin" />Importing…</> : <><Upload className="w-4 h-4" />Import {localFiles.length} files</>}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Replit tab ───────────────────────────────────────────── */}
          {tab === "replit" && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
                <p className="font-medium">How to import from Replit:</p>
                <ol className="space-y-2 text-muted-foreground list-decimal list-inside">
                  <li>Open your Replit project</li>
                  <li>Click the three dots (⋯) menu → <strong className="text-foreground">Download as ZIP</strong> or <strong className="text-foreground">Download as tar.gz</strong></li>
                  <li>Upload that file below</li>
                </ol>
              </div>

              {extracting ? (
                <ExtractionProgress />
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  onClick={() => zipInputRef.current?.click()}
                >
                  <Upload className={`w-8 h-8 mx-auto mb-3 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                  <p className="text-sm font-medium mb-1">Upload Replit export</p>
                  <p className="text-xs text-muted-foreground">Drop your .zip or .tar.gz here, or click to browse</p>
                  <input ref={zipInputRef} type="file" accept=".zip,.tar.gz,.tgz" className="hidden"
                    onChange={(e) => e.target.files?.[0] && processArchive(e.target.files[0])} />
                </div>
              )}

              {!extracting && localFiles.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    <p className="text-sm font-medium">{localFiles.length} files extracted</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Project name</Label>
                    <Input placeholder="My Replit project" value={localName} onChange={(e) => setLocalName(e.target.value)} />
                  </div>
                  <WorkspaceSelect value={localWorkspace} onChange={setLocalWorkspace} />
                  <Button className="w-full gap-2" onClick={handleLocalImport} disabled={isLocalImporting || !localName.trim()}>
                    {isLocalImporting ? <><Loader2 className="w-4 h-4 animate-spin" />Importing…</> : <><ExternalLink className="w-4 h-4" />Import from Replit</>}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Bot, User, Loader2, Sparkles, StopCircle, Trash2,
  Copy, Check, Play, Terminal as TerminalIcon,
  ChevronDown, ChevronUp, ImagePlus, X, CheckCircle2, XCircle,
  FileCode2, FileX, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { API_BASE, api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { ChatMessage, Run, ApiResponse } from "@/types";

interface ChatPanelProps {
  projectId: string;
  activeFilePath?: string;
  activeFileContent?: string;
  onApplyCode?: (code: string) => void;
  onFileChange?: (path: string, action: "write" | "delete") => void;
}

interface AttachedImage {
  dataUrl: string;
  mimeType: string;
  name: string;
}

interface RunEvent {
  id: string;
  command: string;
  status: "running" | "success" | "error";
  output?: string;
  exitCode?: number;
}

interface FileOpEvent {
  id: string;
  path: string;
  action: "write" | "delete" | "error";
  size?: number;
  error?: string;
}

type ListItem =
  | (ChatMessage & { pending?: boolean; image?: AttachedImage })
  | (RunEvent & { _type: "run" })
  | (FileOpEvent & { _type: "fileop" });

export function ChatPanel({ projectId, activeFilePath, activeFileContent, onApplyCode, onFileChange }: ChatPanelProps) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.get<{ data: ChatMessage[] }>(`/api/ai/chat/${projectId}`)
      .then((res) => setItems(res.data ?? []))
      .catch(() => undefined);
  }, [projectId]);

  const scrollBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollBottom, [items, scrollBottom]);

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only image files are supported", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Image must be under 10 MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setAttachedImage({ dataUrl: e.target?.result as string, mimeType: file.type, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (item) { const f = item.getAsFile(); if (f) handleImageFile(f); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) handleImageFile(file);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if ((!text && !attachedImage) || isStreaming) return;
    setInput("");
    const img = attachedImage;
    setAttachedImage(null);

    const userMsg: ChatMessage & { image?: AttachedImage } = {
      id: `temp-${crypto.randomUUID()}`, projectId, userId: null,
      role: "user", content: text || "(image)", createdAt: new Date().toISOString(),
      image: img ?? undefined,
    };
    const assistantId = `temp-${crypto.randomUUID()}`;
    const assistantMsg: ChatMessage & { pending?: boolean } = {
      id: assistantId, projectId, userId: null,
      role: "assistant", content: "", createdAt: new Date().toISOString(), pending: true,
    };
    setItems((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    abortRef.current = new AbortController();

    try {
      const token = localStorage.getItem("orahai_token");
      const baseUrl = API_BASE || "";
      const imageData = img ? img.dataUrl.split(",")[1] : undefined;

      const res = await fetch(`${baseUrl}/api/ai/chat/${projectId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: text || "Please analyze this image.",
          filePath: activeFilePath,
          fileContext: activeFileContent?.slice(0, 8000),
          imageData,
          imageMimeType: img?.mimeType,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type: string; content?: string;
              idx?: number; command?: string; output?: string;
              status?: string; exitCode?: number;
              path?: string; action?: string; size?: number; error?: string;
            };

            if (evt.type === "delta" && evt.content) {
              setItems((prev) =>
                prev.map((m) => "role" in m && m.id === assistantId
                  ? { ...m, content: m.content + evt.content } : m)
              );

            } else if (evt.type === "run_start") {
              const runItem: RunEvent & { _type: "run" } = {
                _type: "run",
                id: `run-${evt.idx}-${assistantId}`,
                command: evt.command!,
                status: "running",
              };
              setItems((prev) => [...prev, runItem]);
              scrollBottom();

            } else if (evt.type === "run_result") {
              const rid = `run-${evt.idx}-${assistantId}`;
              setItems((prev) => prev.map((item) =>
                "_type" in item && item._type === "run" && item.id === rid
                  ? { ...item, status: (evt.status ?? "error") as "success" | "error", output: evt.output, exitCode: evt.exitCode }
                  : item
              ));

            } else if (evt.type === "file_write" && evt.path) {
              const fid = `fop-write-${evt.path}-${assistantId}`;
              setItems((prev) => {
                const exists = prev.some((i) => "_type" in i && i._type === "fileop" && i.id === fid);
                const newItem: FileOpEvent & { _type: "fileop" } = {
                  _type: "fileop", id: fid, path: evt.path!, action: "write", size: evt.size,
                };
                return exists ? prev : [...prev, newItem];
              });
              onFileChange?.(evt.path, "write");
              scrollBottom();

            } else if (evt.type === "file_delete" && evt.path) {
              const fid = `fop-delete-${evt.path}-${assistantId}`;
              setItems((prev) => {
                const exists = prev.some((i) => "_type" in i && i._type === "fileop" && i.id === fid);
                const newItem: FileOpEvent & { _type: "fileop" } = {
                  _type: "fileop", id: fid, path: evt.path!, action: "delete",
                };
                return exists ? prev : [...prev, newItem];
              });
              onFileChange?.(evt.path, "delete");
              scrollBottom();

            } else if (evt.type === "file_op_error" && evt.path) {
              const fid = `fop-err-${evt.path}-${assistantId}`;
              setItems((prev) => {
                const exists = prev.some((i) => "_type" in i && i._type === "fileop" && i.id === fid);
                const newItem: FileOpEvent & { _type: "fileop" } = {
                  _type: "fileop", id: fid, path: evt.path!, action: "error", error: evt.error,
                };
                return exists ? prev : [...prev, newItem];
              });
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast({ title: "AI request failed", variant: "destructive" });
        setItems((prev) => prev.map((m) =>
          "role" in m && m.id === assistantId ? { ...m, content: "Something went wrong. Please try again." } : m
        ));
      }
    } finally {
      setItems((prev) => prev.map((m) => "role" in m && m.id === assistantId ? { ...m, pending: false } : m));
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const clearHistory = async () => {
    if (!confirm("Clear chat history?")) return;
    try {
      await api.delete(`/api/ai/chat/${projectId}`);
      setItems([]);
    } catch { toast({ title: "Failed to clear history", variant: "destructive" }); }
  };

  return (
    <div className="flex flex-col h-full bg-background" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-border shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-sm font-medium">AI Chat</span>
        {activeFilePath && (
          <span className="text-xs text-muted-foreground truncate flex-1">· {activeFilePath}</span>
        )}
        <button onClick={clearHistory} className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Clear history">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground pb-8">
            <Bot className="w-8 h-8 opacity-30" />
            <p className="text-sm text-center">
              Ask me to create, edit, or delete any file.<br />I'll make the changes directly.
            </p>
            <div className="w-full space-y-1">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => setInput(s)}
                  className="w-full text-left text-xs px-2.5 py-2 rounded border hover:bg-muted transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {items.map((item) => {
          if ("_type" in item && item._type === "run") {
            return <RunCard key={item.id} event={item as RunEvent & { _type: "run" }} />;
          }
          if ("_type" in item && item._type === "fileop") {
            return <FileOpCard key={item.id} event={item as FileOpEvent & { _type: "fileop" }} />;
          }
          const msg = item as ChatMessage & { pending?: boolean; image?: AttachedImage };
          return (
            <div key={msg.id} className={cn("flex gap-2", msg.role === "user" && "flex-row-reverse")}>
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs",
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}>
                {msg.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
              </div>
              <div className={cn(
                "max-w-[85%] text-sm rounded-xl px-3 py-2 space-y-2",
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}>
                {msg.image && (
                  <img src={msg.image.dataUrl} alt={msg.image.name}
                    className="max-w-full max-h-48 rounded-lg object-contain" />
                )}
                {(msg as { pending?: boolean }).pending && !msg.content ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : msg.content && msg.content !== "(image)" ? (
                  <MsgContent
                    content={msg.content}
                    isAssistant={msg.role === "assistant"}
                    onApply={onApplyCode}
                    activeFilePath={activeFilePath}
                    projectId={projectId}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Image preview strip */}
      {attachedImage && (
        <div className="px-2.5 pt-2 flex items-center gap-2">
          <div className="relative inline-flex">
            <img src={attachedImage.dataUrl} alt={attachedImage.name}
              className="h-16 w-16 object-cover rounded-lg border border-border" />
            <button onClick={() => setAttachedImage(null)}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background border border-border flex items-center justify-center hover:bg-muted">
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
          <span className="text-xs text-muted-foreground truncate max-w-[160px]">{attachedImage.name}</span>
        </div>
      )}

      {/* Input */}
      <div className="p-2.5 border-t border-border">
        <form onSubmit={handleSubmit} className="relative">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            onPaste={handlePaste}
            placeholder={attachedImage ? "Describe what you want…" : "Ask me to edit files, fix bugs, add features…"}
            rows={2}
            className="resize-none pr-16 text-sm"
            disabled={isStreaming}
          />
          <div className="absolute right-1.5 bottom-1.5 flex items-center gap-0.5">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isStreaming}
              title="Attach image"
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40">
              <ImagePlus className="w-3.5 h-3.5" />
            </button>
            {isStreaming ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => abortRef.current?.abort()} className="w-7 h-7 p-0">
                <StopCircle className="w-3.5 h-3.5 text-destructive" />
              </Button>
            ) : (
              <Button type="submit" size="sm" className="w-7 h-7 p-0" disabled={!input.trim() && !attachedImage}>
                <Send className="w-3 h-3" />
              </Button>
            )}
          </div>
        </form>
        <p className="text-[10px] text-muted-foreground mt-1">↵ send · ⇧↵ newline · paste image</p>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }} />
    </div>
  );
}

// ── File Op Card ──────────────────────────────────────────────────────────────

function FileOpCard({ event }: { event: FileOpEvent & { _type: "fileop" } }) {
  const isWrite = event.action === "write";
  const isDelete = event.action === "delete";
  const isError = event.action === "error";

  return (
    <div className={cn(
      "ml-8 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono",
      isWrite && "bg-emerald-950/30 border-emerald-500/20 text-emerald-400",
      isDelete && "bg-red-950/30 border-red-500/20 text-red-400",
      isError && "bg-yellow-950/30 border-yellow-500/20 text-yellow-400",
    )}>
      {isWrite && <FileCode2 className="w-3.5 h-3.5 shrink-0" />}
      {isDelete && <FileX className="w-3.5 h-3.5 shrink-0" />}
      {isError && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
      <span className="flex-1 truncate">
        {isWrite && "wrote "}
        {isDelete && "deleted "}
        {isError && "failed "}
        <span className="font-semibold">{event.path}</span>
      </span>
      {isWrite && event.size != null && (
        <span className="text-emerald-500/70 text-[10px]">{formatBytes(event.size)}</span>
      )}
      {isError && event.error && (
        <span className="text-yellow-400/70 truncate max-w-[120px]" title={event.error}>{event.error}</span>
      )}
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  return `${(b / 1024).toFixed(1)}KB`;
}

// ── Run Card ──────────────────────────────────────────────────────────────────

function RunCard({ event }: { event: RunEvent & { _type: "run" } }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="ml-8 rounded-lg border border-border/40 overflow-hidden bg-[#0d0d0d] text-xs font-mono">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 border-b border-border/20 hover:bg-white/5 transition-colors text-left">
        {event.status === "running" ? <Loader2 className="w-3 h-3 text-amber-400 animate-spin shrink-0" />
          : event.status === "success" ? <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
          : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
        <TerminalIcon className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-slate-300 truncate flex-1">$ {event.command}</span>
        {event.exitCode != null && (
          <span className={cn("text-[10px]", event.status === "success" ? "text-green-400" : "text-red-400")}>
            exit {event.exitCode}
          </span>
        )}
        {open ? <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" />
               : <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-3 py-2 max-h-48 overflow-y-auto">
          {event.status === "running" ? (
            <span className="text-amber-400 animate-pulse">Running…</span>
          ) : (
            <pre className={cn("whitespace-pre-wrap break-all", event.status === "success" ? "text-slate-300" : "text-red-300")}>
              {event.output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Message Content ───────────────────────────────────────────────────────────

function MsgContent({ content, isAssistant, onApply, activeFilePath, projectId }: {
  content: string; isAssistant: boolean;
  onApply?: (code: string) => void; activeFilePath?: string; projectId: string;
}) {
  // Strip file-op blocks from rendered content so they don't show as raw text
  const cleaned = content
    .replace(/<<<WRITE:[^\n>]+>>>\n[\s\S]*?<<<END>>>/g, "")
    .replace(/<<<DELETE:[^\n>]+>>>/g, "")
    .trim();

  const parts = cleaned.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-1.5">
      {parts.map((p, i) => {
        if (p.startsWith("```")) {
          const lines = p.split("\n");
          const lang = lines[0].slice(3).trim().toLowerCase();
          const code = lines.slice(1, -1).join("\n");
          return (
            <CodeBlock key={i} lang={lang} code={code}
              showApply={isAssistant && !!onApply}
              onApply={onApply} activeFilePath={activeFilePath} projectId={projectId} />
          );
        }
        const rendered = p.split("\n").map((line, li) => {
          if (line.trim().startsWith("$ ")) {
            return (
              <span key={li} className="block font-mono text-xs bg-muted/50 rounded px-1.5 py-0.5 my-0.5 text-emerald-400">
                {line.trim()}
              </span>
            );
          }
          return <span key={li}>{line}{li < p.split("\n").length - 1 && "\n"}</span>;
        });
        return <p key={i} className="whitespace-pre-wrap leading-relaxed">{rendered}</p>;
      })}
    </div>
  );
}

// ── Code Block ────────────────────────────────────────────────────────────────

const SHELL_LANGS = new Set(["bash", "sh", "shell", "zsh", "console", "terminal", "cmd"]);

function CodeBlock({ lang, code, showApply, onApply, activeFilePath, projectId }: {
  lang: string; code: string; showApply: boolean;
  onApply?: (code: string) => void; activeFilePath?: string; projectId: string;
}) {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);
  const [run, setRun] = useState<{ status: "idle" | "running" | "success" | "error"; output?: string; exitCode?: number | null }>({ status: "idle" });
  const [outputOpen, setOutputOpen] = useState(true);
  const isShell = SHELL_LANGS.has(lang);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code).catch(() => undefined);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const handleApply = () => {
    if (!onApply) return;
    onApply(code); setApplied(true); setTimeout(() => setApplied(false), 2000);
  };

  const handleRun = async () => {
    if (run.status === "running") return;
    setRun({ status: "running" }); setOutputOpen(true);
    try {
      const res = await api.post<ApiResponse<Run>>(`/api/runs/${projectId}`, { command: code });
      const runId = res.data?.id;
      if (!runId) throw new Error("No run ID");
      let attempts = 0;
      const poll = async (): Promise<void> => {
        if (attempts++ > 40) { setRun({ status: "error", output: "Timed out." }); return; }
        const r = await api.get<ApiResponse<Run>>(`/api/runs/${projectId}/${runId}`);
        const row = r.data;
        if (!row || row.status === "queued" || row.status === "running") {
          await new Promise((x) => setTimeout(x, 800)); return poll();
        }
        setRun({ status: row.status === "success" ? "success" : "error", output: row.output ?? "(no output)", exitCode: row.exitCode });
      };
      await poll();
    } catch (err) { setRun({ status: "error", output: (err as Error).message }); }
  };

  return (
    <div className="mt-1.5 rounded-lg bg-background/60 overflow-hidden border border-border/30">
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-border/20">
        <div className="flex items-center gap-1.5">
          {isShell && <TerminalIcon className="w-3 h-3 text-muted-foreground" />}
          <span className="text-[10px] text-muted-foreground font-mono">{lang || "code"}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          {showApply && !isShell && (
            <button onClick={handleApply} disabled={!activeFilePath}
              className={cn(
                "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium",
                applied ? "bg-green-500/20 text-green-400"
                  : activeFilePath ? "hover:bg-primary/20 text-primary"
                  : "opacity-40 cursor-not-allowed text-muted-foreground",
              )}>
              <FileCode2 className="w-3 h-3" />
              <span>{applied ? "Applied!" : "Apply"}</span>
            </button>
          )}
          {isShell && (
            <button onClick={handleRun} disabled={run.status === "running"}
              className={cn(
                "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium",
                run.status === "running" ? "text-amber-400 opacity-70 cursor-not-allowed"
                  : "bg-primary/10 text-primary hover:bg-primary/20",
              )}>
              {run.status === "running"
                ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Running…</span></>
                : <><Play className="w-3 h-3" /><span>Run</span></>}
            </button>
          )}
        </div>
      </div>
      <pre className="p-2.5 text-xs overflow-x-auto font-mono"><code>{code}</code></pre>
      {run.status !== "idle" && (
        <div className="border-t border-border/20">
          <button onClick={() => setOutputOpen((v) => !v)}
            className="w-full flex items-center justify-between px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted/30">
            <div className="flex items-center gap-1.5">
              <div className={cn("w-1.5 h-1.5 rounded-full", {
                "bg-amber-400 animate-pulse": run.status === "running",
                "bg-green-400": run.status === "success",
                "bg-red-400": run.status === "error",
              })} />
              <span>{run.status === "running" ? "Running…"
                : run.status === "success" ? `Done${run.exitCode != null ? ` (exit ${run.exitCode})` : ""}`
                : `Error${run.exitCode != null ? ` (exit ${run.exitCode})` : ""}`}</span>
            </div>
            {outputOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {outputOpen && (
            <div className="bg-[#0d0d0d] px-2.5 py-2 max-h-40 overflow-y-auto">
              {run.status === "running"
                ? <span className="text-amber-400 animate-pulse text-xs font-mono">Running…</span>
                : <pre className={cn("text-xs whitespace-pre-wrap font-mono", run.status === "success" ? "text-slate-300" : "text-red-300")}>{run.output}</pre>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STARTERS = [
  "Create a hello world file for this project",
  "Add a README.md explaining the project",
  "Fix any bugs you can see in the current file",
  "Refactor this file to be cleaner",
];

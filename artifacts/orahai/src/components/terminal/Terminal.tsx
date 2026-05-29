import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Square, Trash2, Play } from "lucide-react";
import { api } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";
import type { ApiResponse, Run } from "@/types";

interface TerminalProps {
  projectId: string;
}

// ── ANSI → coloured spans ──────────────────────────────────────────────────
const ANSI_COLOURS: Record<number, string> = {
  30: "#555", 31: "#f87171", 32: "#4ade80", 33: "#facc15",
  34: "#60a5fa", 35: "#c084fc", 36: "#22d3ee", 37: "#d4d4d4",
  90: "#888", 91: "#fca5a5", 92: "#86efac", 93: "#fde68a",
};

function ansiToSpans(raw: string): React.ReactNode[] {
  const clean = raw.replace(/\r/g, "");
  if (!clean) return [];
  const parts = clean.split(/(\x1b\[[0-9;]*m)/);
  const nodes: React.ReactNode[] = [];
  let colour: string | null = null;
  let bold = false;
  let dim = false;
  let key = 0;
  for (const part of parts) {
    if (part.startsWith("\x1b[")) {
      const codes = part.slice(2, -1).split(";").map(Number);
      for (const code of codes) {
        if (code === 0) { colour = null; bold = false; dim = false; }
        else if (code === 1) bold = true;
        else if (code === 2) dim = true;
        else if (ANSI_COLOURS[code]) colour = ANSI_COLOURS[code];
      }
    } else if (part) {
      const style: React.CSSProperties = {};
      if (colour) style.color = colour;
      if (bold) style.fontWeight = "bold";
      if (dim) style.opacity = 0.5;
      nodes.push(<span key={key++} style={style}>{part}</span>);
    }
  }
  return nodes;
}

// ── Mobile detection ───────────────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

// ── Shared line-buffer helpers ─────────────────────────────────────────────
/** Append a raw output chunk (may contain \r\n) into the line array in-place */
function appendChunk(lines: string[], raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const chunks = normalized.split("\n");
  const next = lines.length ? [...lines] : [""];
  next[next.length - 1] = (next[next.length - 1] ?? "") + chunks[0];
  for (let i = 1; i < chunks.length; i++) next.push(chunks[i]);
  return next;
}

// ── Mobile terminal ────────────────────────────────────────────────────────
function MobileTerminal({ projectId }: TerminalProps) {
  const socket = useSocket();
  const WELCOME = ["\x1b[1;32mOrahAI Console\x1b[0m", "\x1b[2mType a command and tap ▶ Send.\x1b[0m", ""];
  const [lines, setLines] = useState<string[]>(WELCOME);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const atBottomRef = useRef(true);

  // Batched output: accumulate chunks in a ref, flush once per animation frame
  const pendingRef = useRef<string[]>([]);
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const chunks = pendingRef.current.splice(0);
    if (!chunks.length) return;
    setLines(prev => {
      let next = [...prev];
      for (const chunk of chunks) next = appendChunk(next, chunk);
      return next;
    });
  }, []);

  const pushChunk = useCallback((raw: string) => {
    pendingRef.current.push(raw);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flush);
    }
  }, [flush]);

  // Auto-scroll: only when already at the bottom
  useEffect(() => {
    const el = outputRef.current;
    if (!el || !atBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  const handleScroll = useCallback(() => {
    const el = outputRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    atBottomRef.current = nearBottom;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = outputRef.current;
    if (el) { el.scrollTop = el.scrollHeight; atBottomRef.current = true; }
  }, []);

  // Socket wiring
  useEffect(() => {
    if (!socket) return;
    socket.emit("workspace:join", { projectId });

    const onOutput = (data: { projectId: string; data: string }) => {
      if (data.projectId !== projectId) return;
      pushChunk(data.data);
    };

    const onStopped = (data: { projectId: string }) => {
      if (data.projectId !== projectId) return;
      setRunning(false);
      pushChunk("\n\x1b[2m[process exited]\x1b[0m\n");
    };

    socket.on("terminal:output", onOutput);
    socket.on("process:stopped", onStopped);
    return () => {
      socket.emit("workspace:leave", { projectId });
      socket.off("terminal:output", onOutput);
      socket.off("process:stopped", onStopped);
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [projectId, socket, pushChunk]);

  const sendCommand = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd) return;
    setInput("");
    pushChunk(`\x1b[2m$ ${cmd}\x1b[0m\n`);
    setRunning(true);
    atBottomRef.current = true;
    scrollToBottom();
    try {
      await api.post<ApiResponse<Run>>(`/api/runs/${projectId}`, { command: cmd });
    } catch {
      pushChunk("\x1b[31m[failed to start]\x1b[0m\n");
      setRunning(false);
    }
  }, [input, projectId, pushChunk, scrollToBottom]);

  const stopProcess = useCallback(async () => {
    try { await api.delete(`/api/runs/${projectId}/stop`); } catch { /* ignore */ }
    setRunning(false);
    pushChunk("\n\x1b[33m[stopped]\x1b[0m\n");
  }, [projectId, pushChunk]);

  const clearConsole = useCallback(() => {
    pendingRef.current = [];
    setLines(["", ""]);
  }, []);

  const runProject = useCallback(async () => {
    pushChunk("\x1b[2m$ run\x1b[0m\n");
    setRunning(true);
    atBottomRef.current = true;
    scrollToBottom();
    try {
      await api.post<ApiResponse<Run>>(`/api/runs/${projectId}`);
    } catch {
      pushChunk("\x1b[31m[failed to start]\x1b[0m\n");
      setRunning(false);
    }
  }, [projectId, pushChunk, scrollToBottom]);

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 h-9 bg-[#111] border-b border-border shrink-0">
        <div className="flex gap-1.5 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        <span className="text-xs text-muted-foreground font-mono shrink-0">Console</span>

        {running && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
            running
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Run / Stop toggle */}
          {running ? (
            <button
              onClick={stopProcess}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
            >
              <Square className="w-3 h-3" /> Stop
            </button>
          ) : (
            <button
              onClick={runProject}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
            >
              <Play className="w-3 h-3" /> Run
            </button>
          )}
          {/* Clear */}
          <button
            onClick={clearConsole}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Clear console"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Output */}
      <div
        ref={outputRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[12.5px] leading-[1.6] select-text"
        style={{ overscrollBehavior: "contain", wordBreak: "break-all" }}
      >
        {lines.map((line, i) => (
          <div key={i} className="min-h-[1em]">
            {ansiToSpans(line)}
          </div>
        ))}
        {/* Spacer so the last line isn't hidden behind the input bar */}
        <div className="h-1" />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-border bg-[#111] flex items-center gap-2 px-3 py-2">
        <span className="text-green-400 font-mono text-sm shrink-0 select-none">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") sendCommand(); }}
          placeholder="type a command…"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-transparent text-[13px] font-mono text-foreground outline-none placeholder:text-muted-foreground/30"
        />
        <button
          onClick={sendCommand}
          disabled={!input.trim()}
          className="shrink-0 p-1.5 rounded text-primary disabled:opacity-25 hover:bg-muted transition-colors"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Desktop terminal (xterm.js) ────────────────────────────────────────────
function DesktopTerminal({ projectId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<{ write: (s: string) => void; writeln: (s: string) => void; dispose: () => void } | null>(null);
  const socket = useSocket();
  const pendingRef = useRef(false);

  useEffect(() => {
    let destroyed = false;

    async function init() {
      if (!containerRef.current) return;
      const { Terminal: XTerm } = await import("xterm");
      const { FitAddon } = await import("xterm-addon-fit");
      const { WebLinksAddon } = await import("xterm-addon-web-links");
      if (destroyed || !containerRef.current) return;

      const term = new XTerm({
        theme: { background: "#0d0d0d", foreground: "#d4d4d4", cursor: "#ffffff" },
        fontFamily: '"JetBrains Mono", "Fira Code", Menlo, monospace',
        fontSize: 13,
        lineHeight: 1.5,
        cursorBlink: true,
        convertEol: true,
        scrollback: 10000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(containerRef.current);
      fitAddon.fit();
      xtermRef.current = term;

      term.writeln("\r\x1b[1;32mOrahAI Console\x1b[0m");
      term.writeln("\x1b[2mType a command and press Enter.\x1b[0m\r\n");
      term.write("$ ");

      let inputBuf = "";

      term.onKey(({ key, domEvent }) => {
        if (domEvent.keyCode === 13) {
          const cmd = inputBuf.trim();
          inputBuf = "";
          term.write("\r\n");
          if (cmd && !pendingRef.current) {
            pendingRef.current = true;
            api.post<ApiResponse<Run>>(`/api/runs/${projectId}`, { command: cmd })
              .catch(() => {
                term.write("\x1b[31mFailed to start\x1b[0m\r\n$ ");
                pendingRef.current = false;
              });
          } else if (!cmd) {
            term.write("$ ");
          }
        } else if (domEvent.keyCode === 8) {
          if (inputBuf.length > 0) { inputBuf = inputBuf.slice(0, -1); term.write("\b \b"); }
        } else if (domEvent.key.length === 1 && !pendingRef.current) {
          inputBuf += domEvent.key;
          term.write(key);
        }
      });

      const ro = new ResizeObserver(() => { try { fitAddon.fit(); } catch { /* ignore */ } });
      if (containerRef.current) ro.observe(containerRef.current);

      if (socket) {
        socket.emit("workspace:join", { projectId });

        const onOutput = (data: { projectId: string; data: string }) => {
          if (data.projectId === projectId) term.write(data.data);
        };
        const onStopped = (data: { projectId: string }) => {
          if (data.projectId === projectId) {
            pendingRef.current = false;
            term.write("\r\n$ ");
          }
        };

        socket.on("terminal:output", onOutput);
        socket.on("process:stopped", onStopped);

        return () => {
          ro.disconnect();
          socket.off("terminal:output", onOutput);
          socket.off("process:stopped", onStopped);
        };
      }

      return () => ro.disconnect();
    }

    init().catch(console.error);

    return () => {
      destroyed = true;
      xtermRef.current?.dispose();
      xtermRef.current = null;
      if (socket) socket.emit("workspace:leave", { projectId });
    };
  }, [projectId, socket]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 h-8 bg-muted/50 border-b border-border shrink-0">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        <span className="text-xs text-muted-foreground">Console</span>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  );
}

// ── Unified export ─────────────────────────────────────────────────────────
export function Terminal({ projectId }: TerminalProps) {
  const isMobile = useIsMobile();
  return isMobile
    ? <MobileTerminal projectId={projectId} />
    : <DesktopTerminal projectId={projectId} />;
}

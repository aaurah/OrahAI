import { useEffect, useRef, useState, useCallback } from "react";
import { Send, TerminalSquare } from "lucide-react";
import { api } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";
import type { ApiResponse, Run } from "@/types";

interface TerminalProps {
  projectId: string;
}

// ── ANSI stripping for mobile plain-text view ──────────────────────────────
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\r/g;
function stripAnsi(s: string) { return s.replace(ANSI_RE, ""); }

// ── Simple ANSI → colour spans for mobile ─────────────────────────────────
const ANSI_COLOURS: Record<number, string> = {
  30: "#555", 31: "#f87171", 32: "#4ade80", 33: "#facc15",
  34: "#60a5fa", 35: "#c084fc", 36: "#22d3ee", 37: "#d4d4d4",
  90: "#888", 91: "#fca5a5", 92: "#86efac", 93: "#fde68a",
};

function ansiToSpans(raw: string): React.ReactNode[] {
  const clean = raw.replace(/\r/g, "");
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
      if (dim) style.opacity = 0.6;
      nodes.push(<span key={key++} style={style}>{part}</span>);
    }
  }
  return nodes;
}

// ── Detect mobile ──────────────────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

// ── Mobile terminal ────────────────────────────────────────────────────────
function MobileTerminal({ projectId }: TerminalProps) {
  const socket = useSocket();
  const [lines, setLines] = useState<string[]>([
    "\x1b[1;32mOrahAI Shell\x1b[0m",
    "\x1b[2mType a command below and tap Send.\x1b[0m",
    "",
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
    }, 50);
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.emit("workspace:join", { projectId });

    const onOutput = (data: { projectId: string; data: string }) => {
      if (data.projectId !== projectId) return;
      // Normalize CRLF → LF, then split into lines
      const normalized = data.data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const chunks = normalized.split("\n");
      setLines(prev => {
        const next = [...prev];
        // Append first chunk to the last line (continuation), then push the rest
        next[next.length - 1] = (next[next.length - 1] ?? "") + chunks[0];
        for (let i = 1; i < chunks.length; i++) {
          next.push(chunks[i]);
        }
        return next;
      });
      scrollToBottom();
    };

    const onStopped = (data: { projectId: string }) => {
      if (data.projectId !== projectId) return;
      setPending(false);
      setLines(prev => [...prev, "\x1b[2m[process exited]\x1b[0m", ""]);
      scrollToBottom();
    };

    socket.on("terminal:output", onOutput);
    socket.on("process:stopped", onStopped);
    return () => {
      socket.emit("workspace:leave", { projectId });
      socket.off("terminal:output", onOutput);
      socket.off("process:stopped", onStopped);
    };
  }, [projectId, socket, scrollToBottom]);

  const sendCommand = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || pending) return;
    setInput("");
    setLines(prev => [...prev, `\x1b[2m$ ${cmd}\x1b[0m`]);
    setPending(true);
    scrollToBottom();
    try {
      await api.post<ApiResponse<Run>>(`/api/runs/${projectId}`, { command: cmd });
    } catch {
      setLines(prev => [...prev, "\x1b[31mFailed to start command\x1b[0m", ""]);
      setPending(false);
      scrollToBottom();
    }
  }, [input, pending, projectId, scrollToBottom]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") sendCommand();
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-8 bg-muted/50 border-b border-border shrink-0">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        <span className="text-xs text-muted-foreground">Console</span>
        {pending && <span className="ml-auto text-[10px] text-amber-400 animate-pulse">running…</span>}
      </div>

      {/* Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[13px] leading-relaxed select-text"
        style={{ overscrollBehavior: "contain" }}
      >
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all min-h-[1.2em]">
            {ansiToSpans(line)}
          </div>
        ))}
      </div>

      {/* Input bar — native input, works with all mobile keyboards + paste */}
      <div className="shrink-0 border-t border-border bg-[#111] flex items-center gap-2 px-3 py-2">
        <span className="text-green-400 font-mono text-sm shrink-0">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={pending}
          placeholder={pending ? "waiting for process…" : "type a command…"}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-transparent text-[13px] font-mono text-foreground outline-none placeholder:text-muted-foreground/40 disabled:opacity-50"
        />
        <button
          onClick={sendCommand}
          disabled={!input.trim() || pending}
          className="shrink-0 p-1.5 rounded text-primary disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted transition-colors"
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
  const xtermRef = useRef<unknown>(null);
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

      term.writeln("\r\x1b[1;32mOrahAI Shell\x1b[0m");
      term.writeln("\x1b[2mType a command and press Enter to run it.\x1b[0m\r\n");
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
                term.write("\x1b[31mFailed to start command\x1b[0m\r\n$ ");
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

      if (socket) {
        socket.emit("workspace:join", { projectId });

        socket.on("terminal:output", (data: { projectId: string; data: string }) => {
          if (data.projectId === projectId) term.write(data.data);
        });

        socket.on("process:stopped", (data: { projectId: string }) => {
          if (data.projectId === projectId) {
            pendingRef.current = false;
            term.write("\r\n$ ");
          }
        });
      }

      const ro = new ResizeObserver(() => fitAddon.fit());
      if (containerRef.current) ro.observe(containerRef.current);
      return () => ro.disconnect();
    }

    init().catch(console.error);

    return () => {
      destroyed = true;
      (xtermRef.current as { dispose?: () => void } | null)?.dispose?.();
      xtermRef.current = null;
      if (socket) {
        socket.emit("workspace:leave", { projectId });
        socket.off("terminal:output");
        socket.off("process:stopped");
      }
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
        <span className="text-xs text-muted-foreground">Shell</span>
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

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";
import type { ApiResponse, Run } from "@/types";

interface TerminalProps {
  projectId: string;
}

export function Terminal({ projectId }: TerminalProps) {
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
              .then(() => {
                // Output will arrive via socket terminal:output events.
                // Prompt is written when process:stopped fires (or after a brief delay for quick cmds).
              })
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
          if (data.projectId === projectId) {
            term.write(data.data);
          }
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

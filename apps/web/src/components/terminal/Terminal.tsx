"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";

interface TerminalProps {
  workspaceId: string;
}

export function Terminal({ workspaceId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<unknown>(null);
  const fitAddonRef = useRef<unknown>(null);
  const socket = useSocket();

  useEffect(() => {
    let destroyed = false;

    async function initTerminal() {
      if (!containerRef.current) return;

      const { Terminal: XTerm } = await import("xterm");
      const { FitAddon } = await import("xterm-addon-fit");
      const { WebLinksAddon } = await import("xterm-addon-web-links");

      if (destroyed || !containerRef.current) return;

      const term = new XTerm({
        theme: {
          background: "#0d0d0d",
          foreground: "#d4d4d4",
          cursor: "#ffffff",
          selectionBackground: "#264f78",
          black: "#1e1e1e",
          red: "#f44747",
          green: "#6a9955",
          yellow: "#d7ba7d",
          blue: "#569cd6",
          magenta: "#c586c0",
          cyan: "#4ec9b0",
          white: "#d4d4d4",
        },
        fontFamily: '"JetBrains Mono", "Fira Code", Menlo, monospace',
        fontSize: 13,
        lineHeight: 1.5,
        cursorBlink: true,
        convertEol: true,
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(containerRef.current);
      fitAddon.fit();

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Welcome message
      term.writeln("\r\x1b[1;32mOrahAI Terminal\x1b[0m");
      term.writeln("\x1b[2mType commands to interact with your workspace.\x1b[0m\r\n");

      // Handle user input
      let inputBuffer = "";
      term.onKey(({ key, domEvent }) => {
        if (domEvent.keyCode === 13) {
          // Enter
          const command = inputBuffer.trim();
          inputBuffer = "";
          term.write("\r\n");

          if (command) {
            term.write("\x1b[2m$ " + command + "\x1b[0m\r\n");

            api
              .post(`/workspaces/${workspaceId}/run`, { command })
              .then((res) => {
                const result = res.data as {
                  stdout?: string;
                  stderr?: string;
                  exitCode?: number;
                };
                if (result.stdout) {
                  term.write(result.stdout.replace(/\n/g, "\r\n"));
                }
                if (result.stderr) {
                  term.write("\x1b[31m" + result.stderr.replace(/\n/g, "\r\n") + "\x1b[0m");
                }
                if (result.exitCode !== 0) {
                  term.write(`\r\n\x1b[31mExit code: ${result.exitCode}\x1b[0m\r\n`);
                }
                term.write("\r\n$ ");
              })
              .catch(() => {
                term.write("\x1b[31mCommand failed\x1b[0m\r\n$ ");
              });
          } else {
            term.write("$ ");
          }
        } else if (domEvent.keyCode === 8) {
          // Backspace
          if (inputBuffer.length > 0) {
            inputBuffer = inputBuffer.slice(0, -1);
            term.write("\b \b");
          }
        } else if (domEvent.key.length === 1) {
          inputBuffer += domEvent.key;
          term.write(key);
        }
      });

      term.write("$ ");

      // Socket: receive real-time terminal output
      if (socket) {
        socket.emit("workspace:join", { workspaceId });
        socket.on(
          "terminal:output",
          (data: { workspaceId: string; data: string }) => {
            if (data.workspaceId === workspaceId) {
              term.write(data.data);
            }
          }
        );
      }

      // Resize observer for fit
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }

      return () => {
        resizeObserver.disconnect();
      };
    }

    initTerminal().catch(console.error);

    return () => {
      destroyed = true;
      if (xtermRef.current) {
        (xtermRef.current as { dispose: () => void }).dispose();
        xtermRef.current = null;
      }
      if (socket) {
        socket.emit("workspace:leave", { workspaceId });
        socket.off("terminal:output");
      }
    };
  }, [workspaceId, socket]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 h-8 bg-muted/50 border-b border-border shrink-0">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <div className="w-3 h-3 rounded-full bg-green-500/70" />
        </div>
        <span className="text-xs text-muted-foreground font-medium">Terminal</span>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  );
}

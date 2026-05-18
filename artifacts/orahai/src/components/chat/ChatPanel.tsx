import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Loader2, Sparkles, StopCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { API_BASE } from "@/lib/api";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";

interface ChatPanelProps {
  projectId: string;
  activeFilePath?: string;
  activeFileContent?: string;
}

export function ChatPanel({ projectId, activeFilePath, activeFileContent }: ChatPanelProps) {
  const [messages, setMessages] = useState<(ChatMessage & { pending?: boolean })[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api.get<{ data: ChatMessage[] }>(`/api/ai/chat/${projectId}`)
      .then((res) => setMessages(res.data ?? []))
      .catch(() => undefined);
  }, [projectId]);

  const scrollBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollBottom, [messages, scrollBottom]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");

    const userMsg: ChatMessage = {
      id: `temp-${crypto.randomUUID()}`, projectId, userId: null,
      role: "user", content: text, createdAt: new Date().toISOString(),
    };
    const assistantMsg: ChatMessage & { pending?: boolean } = {
      id: `temp-${crypto.randomUUID()}`, projectId, userId: null,
      role: "assistant", content: "", createdAt: new Date().toISOString(), pending: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    abortRef.current = new AbortController();

    try {
      const token = localStorage.getItem("orahai_token");
      const baseUrl = API_BASE || "";
      const res = await fetch(`${baseUrl}/api/ai/chat/${projectId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: text,
          filePath: activeFilePath,
          fileContext: activeFileContent?.slice(0, 8000),
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
            const evt = JSON.parse(line.slice(6)) as { type: string; content?: string };
            if (evt.type === "delta" && evt.content) {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content + evt.content } : m)
              );
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast({ title: "AI request failed", variant: "destructive" });
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, content: "Something went wrong. Please try again." } : m
        ));
      }
    } finally {
      setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, pending: false } : m));
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const clearHistory = async () => {
    if (!confirm("Clear chat history?")) return;
    try {
      await api.delete(`/api/ai/chat/${projectId}`);
      setMessages([]);
    } catch { toast({ title: "Failed to clear history", variant: "destructive" }); }
  };

  return (
    <div className="flex flex-col h-full bg-background">
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

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground pb-8">
            <Bot className="w-8 h-8 opacity-30" />
            <p className="text-sm text-center">
              Ask me about your code.<br />I have context of the open file.
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

        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex gap-2", msg.role === "user" && "flex-row-reverse")}>
            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs",
              msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {msg.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
            </div>
            <div className={cn("max-w-[85%] text-sm rounded-xl px-3 py-2",
              msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {(msg as { pending?: boolean }).pending && !msg.content ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <MsgContent content={msg.content} />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-2.5 border-t border-border">
        <form onSubmit={handleSubmit} className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Ask anything about your code…"
            rows={2}
            className="resize-none pr-9 text-sm"
            disabled={isStreaming}
          />
          <div className="absolute right-1.5 bottom-1.5">
            {isStreaming ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => abortRef.current?.abort()} className="w-7 h-7 p-0">
                <StopCircle className="w-3.5 h-3.5 text-destructive" />
              </Button>
            ) : (
              <Button type="submit" size="sm" className="w-7 h-7 p-0" disabled={!input.trim()}>
                <Send className="w-3 h-3" />
              </Button>
            )}
          </div>
        </form>
        <p className="text-[10px] text-muted-foreground mt-1">↵ send · ⇧↵ newline</p>
      </div>
    </div>
  );
}

function MsgContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-1.5">
      {parts.map((p, i) => {
        if (p.startsWith("```")) {
          const lines = p.split("\n");
          const lang = lines[0].slice(3).trim();
          const code = lines.slice(1, -1).join("\n");
          return (
            <pre key={i} className="mt-1.5 rounded-lg bg-background/60 p-2.5 text-xs overflow-x-auto font-mono">
              {lang && <div className="text-muted-foreground mb-1 text-[10px]">{lang}</div>}
              <code>{code}</code>
            </pre>
          );
        }
        return <p key={i} className="whitespace-pre-wrap leading-relaxed">{p}</p>;
      })}
    </div>
  );
}

const STARTERS = [
  "Explain what this file does",
  "Find bugs in my code",
  "Write tests for this",
  "Refactor for readability",
];

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Loader2, Sparkles, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

interface ChatPanelProps {
  projectId: string;
  conversationId?: string;
}

export function ChatPanel({ projectId, conversationId: initialConvId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConvId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const userMessage = input.trim();
    if (!userMessage || isStreaming) return;

    setInput("");

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, assistantMsg]);
    setIsStreaming(true);

    abortRef.current = new AbortController();

    try {
      const token = localStorage.getItem("orahai_token");
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/backend/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMessage,
          conversationId,
          projectId,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to get AI response");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          try {
            const event = JSON.parse(trimmed.slice(6)) as {
              type: string;
              content?: string;
              conversationId?: string;
            };

            if (event.type === "delta" && event.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: m.content + event.content }
                    : m
                )
              );
            } else if (event.type === "done" && event.conversationId) {
              setConversationId(event.conversationId);
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: "Sorry, something went wrong. Please try again." }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-border shrink-0">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="font-medium text-sm">AI Assistant</span>
        <div className="ml-auto flex items-center gap-1">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isStreaming ? "bg-amber-400 animate-pulse" : "bg-green-500"
          )} />
          <span className="text-xs text-muted-foreground">
            {isStreaming ? "Thinking…" : "Ready"}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
            <Bot className="w-10 h-10 opacity-30" />
            <div>
              <p className="text-sm font-medium">Ask me anything</p>
              <p className="text-xs mt-1 opacity-70">
                I can help you write, debug, and improve your code
              </p>
            </div>
            <div className="flex flex-col gap-1.5 w-full mt-4">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setInput(prompt)}
                  className="text-left text-xs px-3 py-2 rounded-lg border hover:bg-muted transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0">
        <form onSubmit={handleSubmit} className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the AI assistant…"
            rows={3}
            className="resize-none pr-10 text-sm"
            disabled={isStreaming}
          />
          <div className="absolute right-2 bottom-2">
            {isStreaming ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleStop}
                className="w-7 h-7 p-0"
              >
                <StopCircle className="w-4 h-4 text-destructive" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                className="w-7 h-7 p-0"
                disabled={!input.trim()}
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </form>
        <p className="text-xs text-muted-foreground mt-1.5">
          ↵ Send · ⇧↵ New line
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
          isUser ? "bg-primary" : "bg-muted"
        )}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-primary-foreground" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-foreground" />
        )}
      </div>

      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {message.content ? (
          <MarkdownContent content={message.content} />
        ) : (
          <Loader2 className="w-4 h-4 animate-spin" />
        )}
      </div>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  // Simple rendering — in production use react-markdown
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const lines = part.split("\n");
          const lang = lines[0].slice(3).trim();
          const code = lines.slice(1, -1).join("\n");
          return (
            <pre
              key={i}
              className="mt-2 p-3 rounded-lg bg-background/50 overflow-x-auto text-xs font-mono"
            >
              {lang && <div className="text-muted-foreground mb-1 text-xs">{lang}</div>}
              <code>{code}</code>
            </pre>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {part}
          </p>
        );
      })}
    </div>
  );
}

const STARTER_PROMPTS = [
  "Explain what this project does",
  "Help me add error handling",
  "Write unit tests for my code",
  "Optimize this for performance",
];

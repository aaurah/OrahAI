import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useSyncExternalStore } from "react";
import {
  Send, Bot, User, Loader2, Sparkles, StopCircle, Trash2,
  Copy, Check, Play, Terminal as TerminalIcon,
  ChevronDown, ChevronUp, ImagePlus, X, CheckCircle2, XCircle,
  FileCode2, FileX, AlertCircle,
  ThumbsUp, ThumbsDown, Volume2, VolumeX, Share2,
  Zap, Scale, Flame, Pencil, PlugZap, Link2,
  BookOpen, Wand2, PenLine,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { API_BASE, api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { ChatMessage, Run, ApiResponse } from "@/types";
import { MODEL_GROUPS, DEFAULT_MODEL, getModelShortName } from "@/lib/models";
import { chatStore } from "@/lib/chatStore";

// Maps a code-block language hint to a sensible default filename when no file is open
const LANG_TO_PATH: Record<string, string> = {
  env: ".env",
  dotenv: ".env",
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  nginx: "nginx.conf",
  gitignore: ".gitignore",
  dockerignore: ".dockerignore",
  "docker-compose": "docker-compose.yml",
};

// ── Agent Modes ───────────────────────────────────────────────────────────────

type AgentMode = "lite" | "economy" | "power";

const AGENT_MODES: { id: AgentMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "lite",    label: "Lite",    icon: <Zap   className="w-3 h-3" />, desc: "Fast, concise answers" },
  { id: "economy", label: "Economy", icon: <Scale  className="w-3 h-3" />, desc: "Balanced quality & speed" },
  { id: "power",   label: "Power",   icon: <Flame  className="w-3 h-3" />, desc: "Maximum depth & detail" },
];

export interface ChatPanelHandle {
  submit: (text: string) => void;
  getIsStreaming: () => boolean;
}

interface ChatPanelProps {
  projectId: string;
  activeFilePath?: string;
  activeFileContent?: string;
  onApplyCode?: (code: string) => void;
  onApplyToPath?: (code: string, path: string) => void;
  onFileChange?: (path: string, action: "write" | "delete") => void;
  onStreamingChange?: (streaming: boolean) => void;
  onRunInTerminal?: (cmd: string) => void;
  onTerminalOpen?: () => void;
  autoDevEnabled?: boolean;
  growthCount?: number;
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

interface McpCallEvent {
  id: string;
  serverName: string;
  toolName: string;
  status: "running" | "done" | "error";
  error?: string;
}

type ExploreEntry =
  | { kind: "step"; step: number; maxSteps?: number }
  | { kind: "file"; path: string; action: "write" | "delete" | "error"; error?: string }
  | { kind: "run"; id: string; command: string; status: "running" | "done" | "error" }
  | { kind: "mcp"; id: string; server: string; tool: string; status: "done" | "error" };

type ListItem =
  | (ChatMessage & { pending?: boolean; queued?: boolean; images?: AttachedImage[] })
  | (RunEvent & { _type: "run" })
  | (FileOpEvent & { _type: "fileop" })
  | (McpCallEvent & { _type: "mcp" });

interface QueuedEntry {
  text: string;
  imgs: AttachedImage[];
  displayId: string;
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel(
  { projectId, activeFilePath, activeFileContent, onApplyCode, onApplyToPath, onFileChange, onStreamingChange, onRunInTerminal, onTerminalOpen, autoDevEnabled, growthCount = 0 },
  ref,
) {
  // ── Global chat store — state survives navigation so streaming runs in background ──
  const _chatState = useSyncExternalStore(
    useCallback((fn) => chatStore.subscribe(projectId, fn), [projectId]),
    useCallback(() => chatStore.getSnapshot(projectId), [projectId]),
  );
  const items = _chatState.items as ListItem[];
  const isStreaming = _chatState.isStreaming;

  const setItems = useCallback(
    (updater: ListItem[] | ((prev: ListItem[]) => ListItem[])) => {
      chatStore.setItems(projectId, updater as unknown[] | ((prev: unknown[]) => unknown[]));
    },
    [projectId],
  );
  const setIsStreaming = useCallback(
    (streaming: boolean) => chatStore.setStreaming(projectId, streaming),
    [projectId],
  );

  const [input, setInput] = useState("");
  const [agentStep, setAgentStep] = useState(0);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [urlPreviews, setUrlPreviews] = useState<{ id: string; url: string }[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, "good" | "bad">>({});
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState<AgentMode>(() => {
    const saved = localStorage.getItem("orahai_agent_mode");
    return (["lite", "economy", "power"] as const).includes(saved as AgentMode)
      ? (saved as AgentMode)
      : "economy";
  });
  const [aiModel, setAiModel] = useState<string>(() => {
    return localStorage.getItem("orahai_ai_model") ?? DEFAULT_MODEL;
  });
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queueRef = useRef<QueuedEntry[]>([]);
  const abortedRef = useRef(false);
  const parallelAbortMap = useRef<Map<string, AbortController>>(new Map());
  const [parallelCount, setParallelCount] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [bgJobActive, setBgJobActive] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingQueuedId, setEditingQueuedId] = useState<string | null>(null);
  const [editQueuedText, setEditQueuedText] = useState("");
  const [exploreLog, setExploreLog] = useState<Record<string, ExploreEntry[]>>({});
  const [exploreOpen, setExploreOpen] = useState<Record<string, boolean>>({});
  const [autoResolvedModel, setAutoResolvedModel] = useState<string | null>(null);

  // ── AI Panel Mode ──────────────────────────────────────────────────────────
  type AiMode = "chat" | "explain" | "generate" | "complete";
  const [aiMode, setAiMode] = useState<AiMode>("chat");
  const [explainCustomInput, setExplainCustomInput] = useState("");

  // Fetch latest chat messages from the server
  const fetchMessages = useCallback(() => {
    api.get<{ data: ChatMessage[] }>(`/api/ai/chat/${projectId}`)
      .then((res) => setItems(res.data ?? []))
      .catch(() => undefined);
  }, [projectId, setItems]);

  useEffect(() => {
    // Skip initial fetch if background streaming has already populated this project
    if (chatStore.hasItems(projectId) || chatStore.getSnapshot(projectId).isStreaming) return;
    fetchMessages();
  }, [fetchMessages, projectId]);

  // On mount: check whether there is an in-flight background job for this project
  useEffect(() => {
    if (isStreaming) return; // already live-streaming — no need
    api.get<{ data: { active: boolean; startedAt: string | null } }>(`/api/ai/chat/${projectId}/status`)
      .then((res) => setBgJobActive(res.data?.active ?? false))
      .catch(() => undefined);
  }, [projectId, isStreaming]);

  // Poll for completion while a background job is active
  useEffect(() => {
    if (!bgJobActive || isStreaming) {
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
      return;
    }
    const tick = () => {
      fetchMessages();
      api.get<{ data: { active: boolean } }>(`/api/ai/chat/${projectId}/status`)
        .then((res) => {
          if (!res.data?.active) {
            setBgJobActive(false);
            fetchMessages(); // final fetch to get the completed message
          }
        })
        .catch(() => undefined);
    };
    pollTimerRef.current = setInterval(tick, 3000);
    return () => { if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; } };
  }, [bgJobActive, isStreaming, projectId, fetchMessages]);

  // Refetch messages (and check status) whenever the tab regains focus
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fetchMessages();
        if (!isStreaming) {
          api.get<{ data: { active: boolean } }>(`/api/ai/chat/${projectId}/status`)
            .then((res) => setBgJobActive(res.data?.active ?? false))
            .catch(() => undefined);
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [projectId, isStreaming, fetchMessages]);

  const scrollBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollBottom, [items, scrollBottom]);

  const addImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only image files are supported", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: `${file.name} must be under 10 MB`, variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setAttachedImages((prev) => {
        if (prev.length >= 10) {
          toast({ title: "Maximum 10 images per message", variant: "destructive" });
          return prev;
        }
        return [...prev, { dataUrl: e.target?.result as string, mimeType: file.type, name: file.name }];
      });
    };
    reader.readAsDataURL(file);
  };

  const handleImageFiles = (files: FileList | File[]) => {
    Array.from(files).forEach(addImageFile);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const imageItems = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith("image/"));
    imageItems.forEach((item) => { const f = item.getAsFile(); if (f) addImageFile(f); });
    if (!imageItems.length) {
      const text = e.clipboardData.getData("text/plain").trim();
      const matches = text.match(/https?:\/\/[^\s]+/g);
      if (matches) {
        matches.forEach(url => {
          setUrlPreviews(prev => prev.some(p => p.url === url) ? prev : [...prev, { id: crypto.randomUUID(), url }]);
        });
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const imageFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    imageFiles.forEach(addImageFile);
  };

  const removeImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  useImperativeHandle(ref, () => ({
    submit: (text: string) => {
      if (isStreaming) {
        const displayId = `queued-${crypto.randomUUID()}`;
        setItems((prev) => [...prev, {
          id: displayId, projectId, userId: null,
          role: "user" as const, content: text, createdAt: new Date().toISOString(), queued: true,
        }]);
        queueRef.current.push({ text, imgs: [], displayId });
        setQueueCount(queueRef.current.length);
      } else {
        void handleSubmitCore(text, [], null);
      }
    },
    getIsStreaming: () => isStreaming,
  }));

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text && !attachedImages.length) return;

    setInput("");
    const imgs = attachedImages;
    setAttachedImages([]);
    setUrlPreviews([]);

    if (isStreaming) {
      const displayId = `queued-${crypto.randomUUID()}`;
      setItems((prev) => [...prev, {
        id: displayId, projectId, userId: null,
        role: "user" as const, content: text || "(images)",
        createdAt: new Date().toISOString(),
        images: imgs.length ? imgs : undefined,
        queued: true,
      }]);
      queueRef.current.push({ text, imgs, displayId });
      setQueueCount(queueRef.current.length);
      return;
    }

    await handleSubmitCore(text, imgs, null);
  };

  const handleModeChange = (mode: AgentMode) => {
    setAgentMode(mode);
    localStorage.setItem("orahai_agent_mode", mode);
  };

  // Abort all active streams (primary + any parallel force-sends)
  const abortAll = () => {
    // Abort primary stream — check local ref first, then store (for background-started streams)
    const ctrl = abortRef.current ?? chatStore.getAbortController(projectId);
    ctrl?.abort();
    for (const c of parallelAbortMap.current.values()) c.abort();
  };

  // Force-send a specific queued message right now, in parallel with the current stream
  const forceQueue = (displayId: string) => {
    const idx = queueRef.current.findIndex((q) => q.displayId === displayId);
    if (idx === -1) return;
    const [entry] = queueRef.current.splice(idx, 1);
    setQueueCount(queueRef.current.length);
    setItems((prev) => prev.map((m) => "role" in m && m.id === entry.displayId ? { ...m, queued: false } : m));
    void handleSubmitCore(entry.text, entry.imgs, entry.displayId, true);
  };

  const handleSubmitCore = async (text: string, imgs: AttachedImage[], existingUserMsgId: string | null, parallel = false) => {
    if (!text && !imgs.length) return;

    const assistantId = `temp-${crypto.randomUUID()}`;
    const assistantMsg: ChatMessage & { pending?: boolean } = {
      id: assistantId, projectId, userId: null,
      role: "assistant", content: "", createdAt: new Date().toISOString(), pending: true,
    };
    const appendExplore = (entry: ExploreEntry) => {
      setExploreLog(prev => ({ ...prev, [assistantId]: [...(prev[assistantId] ?? []), entry] }));
      setExploreOpen(prev => (assistantId in prev ? prev : { ...prev, [assistantId]: true }));
    };
    const updateExploreRun = (runId: string, status: "done" | "error") => {
      setExploreLog(prev => ({
        ...prev,
        [assistantId]: (prev[assistantId] ?? []).map(e =>
          e.kind === "run" && e.id === runId ? { ...e, status } : e
        ),
      }));
    };

    if (existingUserMsgId) {
      // Queued message already shown — strip the queued badge and append assistant placeholder
      setItems((prev) => [
        ...prev.map((m) => "role" in m && m.id === existingUserMsgId ? { ...m, queued: false } : m),
        assistantMsg,
      ]);
    } else {
      const userMsg: ChatMessage & { images?: AttachedImage[] } = {
        id: `temp-${crypto.randomUUID()}`, projectId, userId: null,
        role: "user", content: text || "(images)", createdAt: new Date().toISOString(),
        images: imgs.length ? imgs : undefined,
      };
      setItems((prev) => [...prev, userMsg, assistantMsg]);
    }

    // Parallel streams track themselves separately — primary stream owns isStreaming
    const parallelKey = parallel ? `par-${crypto.randomUUID()}` : null;
    const myAbort = parallel ? new AbortController() : null;
    if (parallel && parallelKey && myAbort) {
      parallelAbortMap.current.set(parallelKey, myAbort);
      setParallelCount((c) => c + 1);
    } else {
      setIsStreaming(true);
      onStreamingChange?.(true);
      setAgentStep(1);
      abortedRef.current = false;
      abortRef.current = new AbortController();
      chatStore.setAbortController(projectId, abortRef.current);
      setAutoResolvedModel(null); // reset auto-resolved model on each new request
    }

    const signal = parallel ? myAbort!.signal : abortRef.current!.signal;

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
          message: text || "Please analyze these images.",
          filePath: activeFilePath,
          fileContext: activeFileContent?.slice(0, 8000),
          images: imgs.map((img) => ({ data: img.dataUrl.split(",")[1], mimeType: img.mimeType })),
          mode: agentMode,
          model: aiModel,
        }),
        signal,
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
              step?: number; maxSteps?: number;
              count?: number; serverName?: string; toolName?: string;
              from?: string; to?: string; reason?: string;
            };

            if (evt.type === "agent_step" && evt.step) {
              setAgentStep(evt.step);
              appendExplore({ kind: "step", step: evt.step, maxSteps: evt.maxSteps });

            } else if (evt.type === "delta" && evt.content) {
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
              appendExplore({ kind: "run", id: `run-${evt.idx}`, command: evt.command!, status: "running" });
              // Auto-open terminal so AI-triggered runs stream there
              onTerminalOpen?.();

            } else if (evt.type === "run_result") {
              const rid = `run-${evt.idx}-${assistantId}`;
              setItems((prev) => prev.map((item) =>
                "_type" in item && item._type === "run" && item.id === rid
                  ? { ...item, status: (evt.status ?? "error") as "success" | "error", output: evt.output, exitCode: evt.exitCode }
                  : item
              ));
              updateExploreRun(`run-${evt.idx}`, evt.exitCode === 0 ? "done" : "error");

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
              appendExplore({ kind: "file", path: evt.path, action: "write" });

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
              appendExplore({ kind: "file", path: evt.path, action: "delete" });

            } else if (evt.type === "file_op_error" && evt.path) {
              const fid = `fop-err-${evt.path}-${assistantId}`;
              setItems((prev) => {
                const exists = prev.some((i) => "_type" in i && i._type === "fileop" && i.id === fid);
                const newItem: FileOpEvent & { _type: "fileop" } = {
                  _type: "fileop", id: fid, path: evt.path!, action: "error", error: evt.error,
                };
                return exists ? prev : [...prev, newItem];
              });

            } else if (evt.type === "mcp_call_done" && evt.serverName && evt.toolName) {
              const mid = `mcp-${evt.serverName}-${evt.toolName}-${assistantId}`;
              setItems((prev) => {
                const existing = prev.find((i) => "_type" in i && i._type === "mcp" && i.id === mid);
                const newItem: McpCallEvent & { _type: "mcp" } = {
                  _type: "mcp", id: mid, serverName: evt.serverName!, toolName: evt.toolName!, status: "done",
                };
                if (existing) return prev.map(i => "_type" in i && i._type === "mcp" && i.id === mid ? newItem : i);
                return [...prev, newItem];
              });
              scrollBottom();
              appendExplore({ kind: "mcp", id: mid, server: evt.serverName!, tool: evt.toolName!, status: "done" });

            } else if (evt.type === "mcp_call_error" && evt.serverName && evt.toolName) {
              const mid = `mcp-err-${evt.serverName}-${evt.toolName}-${assistantId}`;
              setItems((prev) => {
                const existing = prev.find((i) => "_type" in i && i._type === "mcp" && i.id === mid);
                const newItem: McpCallEvent & { _type: "mcp" } = {
                  _type: "mcp", id: mid, serverName: evt.serverName!, toolName: evt.toolName!, status: "error", error: evt.error,
                };
                if (existing) return prev.map(i => "_type" in i && i._type === "mcp" && i.id === mid ? newItem : i);
                return [...prev, newItem];
              });
              scrollBottom();

            } else if (evt.type === "done") {
              fetchMessages();
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      const wasAborted = signal.aborted;
      if (wasAborted) {
        if (!parallel) abortedRef.current = true;
      } else {
        toast({ title: "AI request failed", variant: "destructive" });
        setItems((prev) => prev.map((m) =>
          "role" in m && m.id === assistantId ? { ...m, content: "Something went wrong. Please try again." } : m
        ));
      }
    } finally {
      setItems((prev) => prev.map((m) => "role" in m && m.id === assistantId ? { ...m, pending: false } : m));

      if (parallel) {
        // Parallel stream finished — clean up its abort controller
        if (parallelKey) parallelAbortMap.current.delete(parallelKey);
        setParallelCount((c) => Math.max(0, c - 1));
      } else {
        setAgentStep(0);
        abortRef.current = null;
        chatStore.setAbortController(projectId, null);

        if (abortedRef.current) {
          // Abort: also kill any parallel streams and clear queue
          for (const ctrl of parallelAbortMap.current.values()) ctrl.abort();
          parallelAbortMap.current.clear();
          setParallelCount(0);
          queueRef.current = [];
          setQueueCount(0);
          setItems((prev) => prev.filter((m) => !("queued" in m && (m as { queued?: boolean }).queued)));
          setIsStreaming(false);
          onStreamingChange?.(false);
        } else {
          const next = queueRef.current.shift();
          if (next) {
            setQueueCount(queueRef.current.length);
            void handleSubmitCore(next.text, next.imgs, next.displayId);
          } else {
            setQueueCount(0);
            setIsStreaming(false);
            onStreamingChange?.(false);
          }
        }
      }
    }
  };

  const copyMessage = async (id: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
  };

  const toggleFeedback = (id: string, value: "good" | "bad") => {
    setFeedback((prev) => ({ ...prev, [id]: prev[id] === value ? undefined as unknown as "good" | "bad" : value }));
  };

  const toggleSpeak = (id: string, content: string) => {
    if (!window.speechSynthesis) return;
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const plain = content.replace(/```[\s\S]*?```/g, "code block").replace(/[#*_`~>]/g, "").trim();
    const utt = new SpeechSynthesisUtterance(plain);
    utt.onend = () => setSpeakingId(null);
    utt.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utt);
  };

  const shareMessage = async (content: string) => {
    const plain = content.replace(/```[\s\S]*?```/g, "").replace(/[#*_`~>]/g, "").trim();
    if (navigator.share) {
      try { await navigator.share({ text: plain }); return; } catch { /* fall through */ }
    }
    await navigator.clipboard.writeText(plain);
    toast({ title: "Copied to clipboard" });
  };

  const deleteQueuedMsg = (id: string) => {
    setItems((prev) => prev.filter((m) => m.id !== id));
    queueRef.current = queueRef.current.filter((q) => q.displayId !== id);
    setQueueCount(queueRef.current.length);
  };

  const startEditQueuedMsg = (id: string, content: string) => {
    setEditingQueuedId(id);
    setEditQueuedText(content);
  };

  const saveQueuedEdit = (id: string) => {
    const newText = editQueuedText.trim();
    if (!newText) return;
    setItems((prev) => prev.map((m) => m.id === id ? { ...m, content: newText } : m));
    queueRef.current = queueRef.current.map((q) => q.displayId === id ? { ...q, text: newText } : q);
    setEditingQueuedId(null);
    setEditQueuedText("");
  };

  const cancelQueuedEdit = () => {
    setEditingQueuedId(null);
    setEditQueuedText("");
  };

  const clearHistory = async () => {
    if (!confirm("Clear chat history?")) return;
    try {
      await api.delete(`/api/ai/chat/${projectId}`);
      setItems([]);
    } catch { toast({ title: "Failed to clear history", variant: "destructive" }); }
  };

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-background" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-border shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-sm font-semibold">OrahAI</span>
        {activeFilePath && aiMode === "chat" && (
          <span className="text-xs text-muted-foreground truncate flex-1">· {activeFilePath}</span>
        )}
        <button onClick={clearHistory} className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Clear history">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* AI Mode tabs */}
      <div className="flex items-center border-b border-border shrink-0 bg-background">
        {([
          { id: "chat"     as const, icon: <Sparkles className="w-3 h-3" />,  label: "Chat"     },
          { id: "explain"  as const, icon: <BookOpen  className="w-3 h-3" />, label: "Explain"  },
          { id: "generate" as const, icon: <Wand2     className="w-3 h-3" />, label: "Generate" },
          { id: "complete" as const, icon: <PenLine   className="w-3 h-3" />, label: "Complete" },
        ]).map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => setAiMode(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              aiMode === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Background job banner — shown when AI is working after tab was closed */}
      {bgJobActive && !isStreaming && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-500/10 border-b border-sky-500/20 shrink-0">
          <Loader2 className="w-3 h-3 text-sky-400 animate-spin shrink-0" />
          <span className="text-[11px] text-sky-400 font-medium flex-1">
            AI is still working in the background…
          </span>
          <span className="text-[10px] text-sky-400/60">checking every 3s</span>
        </div>
      )}

      {/* Auto-develop active banner */}
      {autoDevEnabled && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-[11px] text-emerald-400 font-medium flex-1">
            🌱 Grow mode — AI is growing your project
          </span>
          {growthCount > 0 && (
            <span className="text-[11px] text-emerald-300 font-mono shrink-0">🍎 ×{growthCount}</span>
          )}
        </div>
      )}

      {/* Messages — hidden when not in chat mode */}
      <div className={cn("overflow-y-auto p-3 space-y-3 min-h-0", aiMode === "chat" ? "flex-1" : "hidden")}>
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
          if ("_type" in item && item._type === "mcp") {
            return <McpCallCard key={item.id} event={item as McpCallEvent & { _type: "mcp" }} />;
          }
          const msg = item as ChatMessage & { pending?: boolean; queued?: boolean; images?: AttachedImage[] };
          const isPending = !!(msg as { pending?: boolean }).pending;
          const isQueued = !!(msg as { queued?: boolean }).queued;
          const hasContent = !!msg.content && msg.content !== "(images)";
          return (
            <div key={msg.id} className={cn("flex gap-2 group/msg", msg.role === "user" && "flex-row-reverse")}>
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs",
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                isQueued && "opacity-50",
              )}>
                {msg.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
              </div>
              <div className="max-w-[85%] flex flex-col gap-1">
                {/* Queued message inline edit mode */}
                {isQueued && editingQueuedId === msg.id ? (
                  <div className="space-y-1.5">
                    <Textarea
                      value={editQueuedText}
                      onChange={(e) => setEditQueuedText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveQueuedEdit(msg.id); }
                        if (e.key === "Escape") cancelQueuedEdit();
                      }}
                      className="text-sm min-h-[60px] resize-none"
                      autoFocus
                    />
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={cancelQueuedEdit}
                        className="px-2.5 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        Cancel
                      </button>
                      <button onClick={() => saveQueuedEdit(msg.id)}
                        className="px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={cn(
                      "text-sm rounded-xl px-3 py-2 space-y-2",
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                      isQueued && "opacity-60",
                    )}>
                      {isQueued && (
                        <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide opacity-70 -mb-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          queued
                        </div>
                      )}
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {msg.images.map((img, i) => (
                            <img key={i} src={img.dataUrl} alt={img.name}
                              className="max-h-40 max-w-full rounded-lg object-contain" />
                          ))}
                        </div>
                      )}
                      {isPending ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground py-0.5">
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            <span>
                              {!msg.content
                                ? "Thinking…"
                                : agentStep > 1
                                  ? `Working… (step ${agentStep})`
                                  : "Coding…"}
                            </span>
                          </div>
                          {(exploreLog[msg.id]?.length ?? 0) > 0 && (
                            <div>
                              <button
                                onClick={() => setExploreOpen(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors group"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                                <span className="font-medium">Explore</span>
                                {exploreOpen[msg.id]
                                  ? <ChevronUp className="w-3 h-3" />
                                  : <ChevronDown className="w-3 h-3" />}
                                <span className="opacity-50">({exploreLog[msg.id]?.length})</span>
                              </button>
                              {exploreOpen[msg.id] && (
                                <div className="mt-1.5 ml-3 flex flex-col gap-0.5 max-h-36 overflow-y-auto pr-1">
                                  {exploreLog[msg.id]?.map((entry, i) => (
                                    <ExploreEntryRow key={i} entry={entry} />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : hasContent ? (
                        <>
                          <MsgContent
                            content={msg.content}
                            isAssistant={msg.role === "assistant"}
                            onApply={onApplyCode}
                            onApplyToPath={onApplyToPath}
                            activeFilePath={activeFilePath}
                            projectId={projectId}
                            onRunInTerminal={onRunInTerminal}
                          />
                          {msg.role === "assistant" && (exploreLog[msg.id]?.length ?? 0) > 0 && (
                            <div className="pt-1 border-t border-border/30">
                              <button
                                onClick={() => setExploreOpen(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Sparkles className="w-3 h-3 shrink-0 opacity-50" />
                                <span>{exploreLog[msg.id]?.length} action{(exploreLog[msg.id]?.length ?? 0) !== 1 ? "s" : ""} taken</span>
                                {exploreOpen[msg.id]
                                  ? <ChevronUp className="w-3 h-3" />
                                  : <ChevronDown className="w-3 h-3" />}
                              </button>
                              {exploreOpen[msg.id] && (
                                <div className="mt-1.5 ml-3 flex flex-col gap-0.5 max-h-36 overflow-y-auto pr-1">
                                  {exploreLog[msg.id]?.map((entry, i) => (
                                    <ExploreEntryRow key={i} entry={entry} />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                    {/* Action bar */}
                    {(hasContent || isQueued) && !isPending && (
                      <div className={cn(
                        "flex items-center gap-0.5",
                        msg.role === "user" ? "justify-end" : "justify-start",
                      )}>
                        {isQueued && (<>
                          {/* Edit queued */}
                          <button
                            onClick={() => startEditQueuedMsg(msg.id, msg.content)}
                            title="Edit"
                            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {/* Delete queued */}
                          <button
                            onClick={() => deleteQueuedMsg(msg.id)}
                            title="Remove from queue"
                            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>)}
                        {msg.role === "assistant" && (<>
                          {/* Thumbs up */}
                          <button
                            onClick={() => toggleFeedback(msg.id, "good")}
                            title="Good response"
                            className={cn(
                              "w-7 h-7 flex items-center justify-center rounded-md transition-colors",
                              feedback[msg.id] === "good"
                                ? "text-green-500 bg-green-500/10"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted",
                            )}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          {/* Thumbs down */}
                          <button
                            onClick={() => toggleFeedback(msg.id, "bad")}
                            title="Bad response"
                            className={cn(
                              "w-7 h-7 flex items-center justify-center rounded-md transition-colors",
                              feedback[msg.id] === "bad"
                                ? "text-red-400 bg-red-500/10"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted",
                            )}
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </>)}
                        {hasContent && (<>
                          {/* Copy */}
                          <button
                            onClick={() => copyMessage(msg.id, msg.content)}
                            title="Copy"
                            className={cn(
                              "w-7 h-7 flex items-center justify-center rounded-md transition-colors",
                              copiedId === msg.id
                                ? "text-green-500 bg-green-500/10"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted",
                            )}
                          >
                            {copiedId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </>)}
                        {msg.role === "assistant" && (<>
                          {/* Read aloud */}
                          <button
                            onClick={() => toggleSpeak(msg.id, msg.content)}
                            title={speakingId === msg.id ? "Stop reading" : "Read aloud"}
                            className={cn(
                              "w-7 h-7 flex items-center justify-center rounded-md transition-colors",
                              speakingId === msg.id
                                ? "text-primary bg-primary/10"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted",
                            )}
                          >
                            {speakingId === msg.id
                              ? <VolumeX className="w-3.5 h-3.5" />
                              : <Volume2 className="w-3.5 h-3.5" />}
                          </button>
                          {/* Share */}
                          <button
                            onClick={() => shareMessage(msg.content)}
                            title="Share"
                            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        </>)}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ── EXPLAIN MODE ─────────────────────────────────────────────────────── */}
      {aiMode === "explain" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          <div>
            <p className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Explain Code
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              AI analyzes and explains code. Select a quick action or paste custom code below.
            </p>
          </div>
          {activeFilePath && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
              <FileCode2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground font-mono truncate">{activeFilePath}</span>
            </div>
          )}
          <div className="space-y-1.5">
            {([
              { label: "Explain this file",       prompt: `Explain the code in ${activeFilePath ?? "the current file"} — what it does, how it works, and the key patterns used.` },
              { label: "Break down each function", prompt: `Go through each function in ${activeFilePath ?? "the current file"} and explain its purpose, parameters, and return value.` },
              { label: "Trace the logic flow",     prompt: `Trace the main logic flow in ${activeFilePath ?? "the current file"} step by step from entry point to output.` },
              { label: "Identify complex areas",   prompt: `Identify the most complex or hard-to-understand parts of ${activeFilePath ?? "this code"} and explain them clearly.` },
              { label: "Summarize the project",    prompt: "Give a high-level summary of what this project does, how it's structured, and the main technologies used." },
              { label: "Explain key concepts",     prompt: `What are the key programming concepts and patterns used in ${activeFilePath ?? "this project"}? Explain each one.` },
            ] as { label: string; prompt: string }[]).map(({ label, prompt }) => (
              <button key={label}
                onClick={() => { setAiMode("chat"); void handleSubmitCore(prompt, [], null); }}
                className="w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-lg border border-border/60 hover:bg-muted/40 hover:border-primary/30 transition-colors text-sm">
                <span className="text-primary/60 shrink-0">→</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Or paste custom code:</p>
            <textarea
              value={explainCustomInput}
              onChange={e => setExplainCustomInput(e.target.value)}
              className="w-full h-20 rounded-lg border border-border bg-muted/20 text-xs p-2.5 resize-none outline-none focus:border-primary/50 placeholder:text-muted-foreground/40 font-mono"
              placeholder="Paste any code here to explain…"
            />
            <button
              disabled={!explainCustomInput.trim()}
              onClick={() => {
                if (!explainCustomInput.trim()) return;
                const prompt = `Explain this code:\n\`\`\`\n${explainCustomInput}\n\`\`\``;
                setExplainCustomInput("");
                setAiMode("chat");
                void handleSubmitCore(prompt, [], null);
              }}
              className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              Explain this code
            </button>
          </div>
        </div>
      )}

      {/* ── GENERATE MODE ────────────────────────────────────────────────────── */}
      {aiMode === "generate" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          <div>
            <p className="text-sm font-semibold flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-primary" />
              Generate
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Generate code, tests, documentation, and more with one click.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([
              { label: "Unit tests",        icon: "🧪", prompt: `Write comprehensive unit tests for ${activeFilePath ?? "this project"}. Cover all edge cases.` },
              { label: "JSDoc comments",    icon: "📝", prompt: `Add detailed JSDoc/docstring comments to every function in ${activeFilePath ?? "the current file"}.` },
              { label: "README.md",         icon: "📋", prompt: "Generate a comprehensive README.md for this project with setup, features, and usage examples." },
              { label: "Optimize code",     icon: "⚡", prompt: `Optimize ${activeFilePath ?? "the current file"} for performance and efficiency. Show the improved version.` },
              { label: "Error handling",    icon: "🛡️", prompt: `Add comprehensive error handling and validation to ${activeFilePath ?? "the current file"}.` },
              { label: "TypeScript types",  icon: "🔷", prompt: `Add strong TypeScript types, interfaces, and generics to ${activeFilePath ?? "the current file"}.` },
              { label: "Security audit",    icon: "🔒", prompt: `Audit ${activeFilePath ?? "this project"} for security vulnerabilities and provide specific fixes.` },
              { label: "API docs",          icon: "🌐", prompt: `Generate full API documentation for all endpoints/functions in ${activeFilePath ?? "this file"}.` },
              { label: "Integration tests", icon: "🔗", prompt: `Write integration tests for ${activeFilePath ?? "this project"} testing how components work together.` },
              { label: "Refactor code",     icon: "♻️", prompt: `Refactor ${activeFilePath ?? "the current file"} to be cleaner, more maintainable, and follow best practices.` },
              { label: ".env template",     icon: "⚙️", prompt: "Create a .env.example file with all required environment variables, each with a description comment." },
              { label: "Docker setup",      icon: "🐳", prompt: "Create a production-ready Dockerfile and docker-compose.yml for this project." },
            ] as { label: string; icon: string; prompt: string }[]).map(({ label, icon, prompt }) => (
              <button key={label}
                onClick={() => { setAiMode("chat"); void handleSubmitCore(prompt, [], null); }}
                className="flex flex-col items-start gap-1.5 px-3 py-2.5 rounded-lg border border-border/60 hover:bg-muted/40 hover:border-primary/30 transition-colors text-left">
                <span className="text-base leading-none">{icon}</span>
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── COMPLETE MODE ────────────────────────────────────────────────────── */}
      {aiMode === "complete" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          <div>
            <p className="text-sm font-semibold flex items-center gap-2">
              <PenLine className="w-4 h-4 text-primary" />
              Complete & Extend
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              AI will complete, extend, or improve the current file.
            </p>
          </div>
          {activeFilePath && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
              <FileCode2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground font-mono truncate">{activeFilePath}</span>
            </div>
          )}
          <div className="space-y-1.5">
            {([
              { label: "Complete this file",    prompt: `Complete the code in ${activeFilePath ?? "the current file"} — fill in missing implementations, TODOs, and stubs.` },
              { label: "Add missing features",  prompt: `Analyze ${activeFilePath ?? "the current file"} and add the most important missing features or functionality.` },
              { label: "Extend functionality",  prompt: `Extend the code in ${activeFilePath ?? "the current file"} with additional useful functionality that enhances the project.` },
              { label: "Fix all bugs",          prompt: `Find and fix all bugs in ${activeFilePath ?? "the current file"}. Show each fix with a brief explanation.` },
              { label: "Add input validation",  prompt: `Add comprehensive input validation and sanitization to ${activeFilePath ?? "the current file"}.` },
              { label: "Make production-ready", prompt: `Make ${activeFilePath ?? "the current file"} production-ready — add error handling, logging, type safety, and security.` },
            ] as { label: string; prompt: string }[]).map(({ label, prompt }) => (
              <button key={label}
                onClick={() => { setAiMode("chat"); void handleSubmitCore(prompt, [], null); }}
                className="w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-lg border border-border/60 hover:bg-muted/40 hover:border-primary/30 transition-colors text-sm">
                <span className="text-primary/60 shrink-0">→</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Image preview strip */}
      {aiMode === "chat" && attachedImages.length > 0 && (
        <div className="px-2.5 pt-2 flex flex-wrap gap-2">
          {attachedImages.map((img, i) => (
            <div key={i} className="relative inline-flex flex-col items-center gap-0.5">
              <div className="relative">
                <img src={img.dataUrl} alt={img.name}
                  className="h-14 w-14 object-cover rounded-lg border border-border" />
                <button onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background border border-border flex items-center justify-center hover:bg-muted">
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
              <span className="text-xs text-muted-foreground truncate max-w-[56px]">{img.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* URL screenshot preview strip */}
      {aiMode === "chat" && urlPreviews.length > 0 && (
        <div className="px-2.5 pt-2 flex flex-col gap-2">
          {urlPreviews.map(({ id, url }) => (
            <div key={id} className="relative rounded-lg border border-border bg-muted/30 overflow-hidden flex gap-0">
              <div className="w-24 h-16 shrink-0 overflow-hidden bg-muted">
                <img
                  src={`https://image.thum.io/get/width/300/crop/400/${url}`}
                  alt="Page screenshot"
                  className="w-full h-full object-cover object-top"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </div>
              <div className="flex-1 min-w-0 px-2 py-1.5 flex flex-col justify-center">
                <div className="flex items-center gap-1 text-[10px] text-primary mb-0.5">
                  <Link2 className="w-3 h-3 shrink-0" />
                  <span className="truncate font-medium">Screenshot preview</span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{url}</p>
              </div>
              <button
                onClick={() => setUrlPreviews(prev => prev.filter(p => p.id !== id))}
                className="absolute top-1 right-1 w-4 h-4 rounded-full bg-background/80 border border-border flex items-center justify-center hover:bg-muted"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Queue tray — shown above input while messages are waiting */}
      {aiMode === "chat" && queueCount > 0 && (() => {
        const queuedMsgs = items.filter(
          (it): it is ChatMessage & { queued: true; images?: AttachedImage[] } =>
            "role" in it && !("_type" in it) && !!(it as { queued?: boolean }).queued
        );
        if (!queuedMsgs.length) return null;
        return (
          <div className="mx-2.5 mt-2 rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/15">
              <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                {queuedMsgs.length} queued
              </span>
              <button
                onClick={abortAll}
                className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
              >
                cancel all
              </button>
            </div>
            <div className="divide-y divide-amber-500/10 max-h-40 overflow-y-auto">
              {queuedMsgs.map((msg) => (
                <div key={msg.id} className="px-3 py-2">
                  {editingQueuedId === msg.id ? (
                    <div className="space-y-1.5">
                      <Textarea
                        value={editQueuedText}
                        onChange={(e) => setEditQueuedText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveQueuedEdit(msg.id); }
                          if (e.key === "Escape") cancelQueuedEdit();
                        }}
                        className="text-xs min-h-[48px] resize-none"
                        autoFocus
                      />
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={cancelQueuedEdit}
                          className="px-2 py-0.5 text-[10px] rounded-md text-muted-foreground hover:bg-muted transition-colors">
                          Cancel
                        </button>
                        <button onClick={() => saveQueuedEdit(msg.id)}
                          className="px-2 py-0.5 text-[10px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-xs text-foreground/80 line-clamp-2 break-words min-w-0">
                        {msg.content && msg.content !== "(images)" ? msg.content : (
                          <span className="italic text-muted-foreground">
                            {msg.images?.length ? `${msg.images.length} image${msg.images.length > 1 ? "s" : ""}` : "(empty)"}
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => forceQueue(msg.id)}
                          title="Send now (parallel)"
                          className="w-6 h-6 flex items-center justify-center rounded text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                        >
                          <Zap className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => startEditQueuedMsg(msg.id, msg.content === "(images)" ? "" : msg.content)}
                          title="Edit"
                          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deleteQueuedMsg(msg.id)}
                          title="Remove"
                          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Input — chat mode only */}
      {aiMode === "chat" && (<div className="p-2.5 border-t border-border shrink-0">
        {/* Mode selector */}
        <div className="flex items-center gap-1 mb-2">
          {AGENT_MODES.map((m) => {
            const active = agentMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                title={m.desc}
                onClick={() => handleModeChange(m.id)}
                disabled={isStreaming}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors disabled:opacity-40",
                  active
                    ? m.id === "lite"    ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                      : m.id === "power" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                      : "bg-primary/20 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent",
                )}
              >
                {m.icon}
                {m.label}
              </button>
            );
          })}
          {/* Model picker */}
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setModelPickerOpen(v => !v)}
              disabled={isStreaming}
              title="Change AI model"
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors disabled:opacity-40",
                modelPickerOpen
                  ? "border-primary/40 text-primary bg-primary/10"
                  : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              <Bot className="w-3 h-3" />
              <span className="max-w-[80px] truncate">{getModelShortName(aiModel)}</span>
              <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", modelPickerOpen && "rotate-180")} />
            </button>

            {modelPickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModelPickerOpen(false)} />
                <div className="absolute bottom-full right-0 mb-1.5 w-72 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="max-h-80 overflow-y-auto">
                    {MODEL_GROUPS.map(group => (
                      <div key={group.label}>
                        <div className="sticky top-0 px-3 py-1.5 bg-muted/60 backdrop-blur border-b border-border/40">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                        </div>
                        {group.models.map(model => (
                          <button
                            key={model.id}
                            onClick={() => {
                              setAiModel(model.id);
                              localStorage.setItem("orahai_ai_model", model.id);
                              setModelPickerOpen(false);
                            }}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left",
                              aiModel === model.id && "text-primary bg-primary/5",
                            )}
                          >
                            <span className="flex-1 font-medium">{model.name}</span>
                            {model.vision && (
                              <span className="text-[9px] text-sky-400 font-medium">Vision</span>
                            )}
                            {model.badge && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground font-medium border border-border/40">
                                {model.badge}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="relative">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); void handleSubmit(); } }}
            onPaste={handlePaste}
            placeholder={
              isStreaming
                ? "Type your next message — it will be queued…"
                : attachedImages.length
                ? "Describe what you want done with these images…"
                : "Ask me to edit files, fix bugs, add features…"
            }
            rows={2}
            enterKeyHint="send"
            className="resize-none pr-16 text-sm"
          />
          <div className="absolute right-1.5 bottom-1.5 flex items-center gap-0.5">
            <button type="button" onClick={() => fileInputRef.current?.click()}
              title="Attach image"
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <ImagePlus className="w-3.5 h-3.5" />
            </button>
            {isStreaming && (
              <>
                {parallelCount > 0 && (
                  <span className="text-[9px] font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded-full leading-none select-none">
                    +{parallelCount}
                  </span>
                )}
                <Button type="button" size="sm" variant="ghost"
                  onClick={abortAll}
                  title="Stop & clear queue"
                  className="w-7 h-7 p-0">
                  <StopCircle className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </>
            )}
            <Button
              type="submit"
              size="sm"
              title={isStreaming ? "Queue message" : "Send"}
              className="relative w-7 h-7 p-0"
              disabled={!input.trim() && !attachedImages.length}
            >
              <Send className="w-3 h-3" />
              {queueCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 bg-amber-500 rounded-full text-[8px] font-bold flex items-center justify-center text-white leading-none">
                  {queueCount}
                </span>
              )}
            </Button>
          </div>
        </form>
        <p className="text-[10px] text-muted-foreground mt-1">
          {queueCount > 0
            ? `${queueCount} message${queueCount > 1 ? "s" : ""} queued · stop to cancel all`
            : isStreaming
            ? "AI responding · send to queue · stop to abort"
            : "↵ newline · Ctrl+Enter or tap send · paste image"}
        </p>
      </div>)}

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { if (e.target.files?.length) handleImageFiles(e.target.files); e.target.value = ""; }} />

    </div>
  );
});

// ── Explore Entry Row ──────────────────────────────────────────────────────────

function ExploreEntryRow({ entry }: { entry: ExploreEntry }) {
  if (entry.kind === "step") {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Sparkles className="w-3 h-3 shrink-0 text-primary/60" />
        <span>Step {entry.step}{entry.maxSteps ? ` / ${entry.maxSteps}` : ""}</span>
      </div>
    );
  }
  if (entry.kind === "file") {
    const icon =
      entry.action === "write"  ? <FileCode2 className="w-3 h-3 shrink-0 text-green-400" /> :
      entry.action === "delete" ? <FileX     className="w-3 h-3 shrink-0 text-red-400" />   :
                                  <AlertCircle className="w-3 h-3 shrink-0 text-red-400" />;
    const label =
      entry.action === "write"  ? "Wrote" :
      entry.action === "delete" ? "Deleted" : "Error";
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
        {icon}
        <span className="shrink-0">{label}</span>
        <code className="font-mono text-[10px] truncate text-foreground/70">{entry.path}</code>
      </div>
    );
  }
  if (entry.kind === "run") {
    const icon =
      entry.status === "running" ? <Loader2      className="w-3 h-3 shrink-0 animate-spin text-amber-400" /> :
      entry.status === "done"    ? <CheckCircle2 className="w-3 h-3 shrink-0 text-green-400" />             :
                                   <XCircle      className="w-3 h-3 shrink-0 text-red-400" />;
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
        {icon}
        <code className="font-mono text-[10px] truncate text-foreground/70">{entry.command || "command"}</code>
      </div>
    );
  }
  if (entry.kind === "mcp") {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
        <PlugZap className="w-3 h-3 shrink-0 text-violet-400" />
        <span className="truncate"><span className="text-foreground/60">{entry.server}/</span>{entry.tool}</span>
      </div>
    );
  }
  return null;
}

// ── MCP Call Card ──────────────────────────────────────────────────────────────

function McpCallCard({ event }: { event: McpCallEvent & { _type: "mcp" } }) {
  const isDone  = event.status === "done";
  const isError = event.status === "error";
  return (
    <div className={cn(
      "ml-8 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono",
      isDone  && "bg-violet-950/30 border-violet-500/20 text-violet-300",
      isError && "bg-yellow-950/30 border-yellow-500/20 text-yellow-400",
      !isDone && !isError && "bg-muted/30 border-border text-muted-foreground",
    )}>
      {isDone  && <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
      {isError && <XCircle      className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
      {!isDone && !isError && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
      <PlugZap className="w-3 h-3 opacity-60 shrink-0" />
      <span className="flex-1 truncate">
        <span className="opacity-60">{event.serverName}/</span>
        <span className="font-semibold">{event.toolName}</span>
      </span>
      {isError && event.error && (
        <span className="text-yellow-400/70 truncate max-w-[140px]" title={event.error}>{event.error}</span>
      )}
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

// Detect a file path mentioned in a text chunk (e.g. `public/app.js`, - src/index.ts)
const FILE_PATH_RE = /`([\w.-]+(?:\/[\w./-]+)+\.\w+)`|([\w.-]+(?:\/[\w./-]+)+\.\w+)/g;
function extractLastFilePath(text: string): string | undefined {
  let last: string | undefined;
  let m: RegExpExecArray | null;
  FILE_PATH_RE.lastIndex = 0;
  while ((m = FILE_PATH_RE.exec(text)) !== null) {
    last = m[1] || m[2];
  }
  return last;
}

function MsgContent({ content, isAssistant, onApply, onApplyToPath, activeFilePath, projectId, onRunInTerminal }: {
  content: string; isAssistant: boolean;
  onApply?: (code: string) => void;
  onApplyToPath?: (code: string, path: string) => void;
  activeFilePath?: string; projectId: string;
  onRunInTerminal?: (cmd: string) => void;
}) {
  // Strip file-op blocks from rendered content so they don't show as raw text
  const cleaned = content
    .replace(/<<<WRITE:[^\n>]+>>>\n[\s\S]*?<<<END>>>/g, "")
    .replace(/<<<DELETE:[^\n>]+>>>/g, "")
    .trim();

  const parts = cleaned.split(/(```[\s\S]*?```)/g);

  // Track the last filename seen in text parts so code blocks can infer their target
  let lastSeenPath: string | undefined;

  return (
    <div className="space-y-1.5">
      {parts.map((p, i) => {
        if (p.startsWith("```")) {
          const lines = p.split("\n");
          const lang = lines[0].slice(3).trim().toLowerCase();
          const code = lines.slice(1, -1).join("\n");
          const inferredPath = lastSeenPath;
          return (
            <CodeBlock key={i} lang={lang} code={code}
              showApply={isAssistant && (!!onApply || !!onApplyToPath)}
              onApply={onApply} onApplyToPath={onApplyToPath}
              activeFilePath={activeFilePath} inferredPath={inferredPath}
              projectId={projectId}
              onRunInTerminal={onRunInTerminal} />
          );
        }
        // Update lastSeenPath from text before the next code block
        const pathInText = extractLastFilePath(p);
        if (pathInText) lastSeenPath = pathInText;

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

function CodeBlock({ lang, code, showApply, onApply, onApplyToPath, activeFilePath, inferredPath, projectId, onRunInTerminal }: {
  lang: string; code: string; showApply: boolean;
  onApply?: (code: string) => void;
  onApplyToPath?: (code: string, path: string) => void;
  activeFilePath?: string; inferredPath?: string; projectId: string;
  onRunInTerminal?: (cmd: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);
  const [sentToTerminal, setSentToTerminal] = useState(false);
  const [run, setRun] = useState<{ status: "idle" | "running" | "success" | "error"; output?: string; exitCode?: number | null }>({ status: "idle" });
  const [outputOpen, setOutputOpen] = useState(true);
  const [showPathInput, setShowPathInput] = useState(false);
  const [pathInputValue, setPathInputValue] = useState("");
  const isShell = SHELL_LANGS.has(lang);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code).catch(() => undefined);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const doApply = (path: string) => {
    if (!onApplyToPath) return;
    onApplyToPath(code, path);
    setApplied(true); setShowPathInput(false);
    setTimeout(() => setApplied(false), 2000);
  };

  const handleApply = () => {
    // Case 1: a file is already open in the editor — apply directly to it
    if (activeFilePath && onApply) {
      onApply(code); setApplied(true); setTimeout(() => setApplied(false), 2000);
      return;
    }
    // Case 2: inferred from surrounding message text
    if (inferredPath && onApplyToPath) {
      doApply(inferredPath); return;
    }
    // Case 3: infer target from language hint (e.g. env → .env)
    const langPath = LANG_TO_PATH[lang.toLowerCase()];
    if (langPath && onApplyToPath) {
      doApply(langPath); return;
    }
    // Case 4: ask the user to name the file inline
    setPathInputValue(langPath ?? "");
    setShowPathInput(true);
  };

  const handleRun = async () => {
    if (sentToTerminal) return;
    if (onRunInTerminal) {
      // Preferred: pipe to the live terminal panel
      onRunInTerminal(code);
      setSentToTerminal(true);
      setTimeout(() => setSentToTerminal(false), 3000);
      return;
    }
    // Fallback: inline execution (no terminal callback provided)
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
            <button onClick={handleApply}
              className={cn(
                "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium",
                applied ? "bg-green-500/20 text-green-400" : "hover:bg-primary/20 text-primary",
              )}>
              <FileCode2 className="w-3 h-3" />
              <span>{applied ? "Applied!" : "Apply"}</span>
            </button>
          )}
          {showPathInput && !applied && (
            <button onClick={() => setShowPathInput(false)}
              className="text-[10px] px-1 py-0.5 rounded hover:bg-muted/60 text-muted-foreground transition-colors">
              <X className="w-3 h-3" />
            </button>
          )}
          {isShell && (
            <button onClick={handleRun}
              disabled={sentToTerminal || (!onRunInTerminal && run.status === "running")}
              className={cn(
                "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium",
                sentToTerminal ? "text-green-400 opacity-80 cursor-default"
                  : run.status === "running" ? "text-amber-400 opacity-70 cursor-not-allowed"
                  : onRunInTerminal ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  : "bg-primary/10 text-primary hover:bg-primary/20",
              )}>
              {sentToTerminal
                ? <><Check className="w-3 h-3" /><span>Sent!</span></>
                : run.status === "running"
                ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Running…</span></>
                : onRunInTerminal
                ? <><TerminalIcon className="w-3 h-3" /><span>Run</span></>
                : <><Play className="w-3 h-3" /><span>Run</span></>}
            </button>
          )}
        </div>
      </div>
      {showPathInput && (
        <form
          className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/20 bg-muted/20"
          onSubmit={e => { e.preventDefault(); const p = pathInputValue.trim(); if (p) doApply(p); }}
        >
          <FileCode2 className="w-3 h-3 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={pathInputValue}
            onChange={e => setPathInputValue(e.target.value)}
            placeholder="e.g. src/app.py"
            className="flex-1 bg-transparent text-[11px] font-mono text-foreground placeholder:text-muted-foreground/60 outline-none min-w-0"
          />
          <button type="submit" disabled={!pathInputValue.trim()}
            className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground font-medium disabled:opacity-40 transition-opacity">
            Save
          </button>
        </form>
      )}
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

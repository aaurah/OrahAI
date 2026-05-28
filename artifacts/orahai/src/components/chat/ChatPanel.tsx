import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  Send, Bot, User, Loader2, Sparkles, StopCircle, Trash2,
  Copy, Check, Play, Terminal as TerminalIcon,
  ChevronDown, ChevronUp, ImagePlus, X, CheckCircle2, XCircle,
  FileCode2, FileX, AlertCircle,
  ThumbsUp, ThumbsDown, Volume2, VolumeX, Share2,
  Zap, Scale, Flame, Pencil, PlugZap, Cpu, DollarSign,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { API_BASE, api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { ChatMessage, Run, ApiResponse } from "@/types";
import { MODEL_GROUPS, DEFAULT_MODEL, getModelShortName, makeOllamaModelDef, makeOllamaRemoteModelDef, type ModelDef } from "@/lib/models";

// Models that may incur API costs — require a one-time-per-session confirmation
const isPaidModel = (model: string) =>
  model.startsWith("openai:") || model.startsWith("anthropic:");

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
  { projectId, activeFilePath, activeFileContent, onApplyCode, onApplyToPath, onFileChange, onStreamingChange, autoDevEnabled, growthCount = 0 },
  ref,
) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [agentStep, setAgentStep] = useState(0);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, "good" | "bad">>({});
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState<AgentMode>(() => {
    return (localStorage.getItem("orahai_agent_mode") as AgentMode | null) ?? "economy";
  });
  const [aiModel, setAiModel] = useState<string>(() => {
    return localStorage.getItem("orahai_ai_model") ?? DEFAULT_MODEL;
  });
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [liveOllamaModels, setLiveOllamaModels] = useState<ModelDef[]>([]);
  const [liveRemoteModels, setLiveRemoteModels] = useState<ModelDef[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queueRef = useRef<QueuedEntry[]>([]);
  const abortedRef = useRef(false);
  const parallelAbortMap = useRef<Map<string, AbortController>>(new Map());
  const [parallelCount, setParallelCount] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [paidConfirmOpen, setPaidConfirmOpen] = useState(false);
  const pendingPaidSubmit = useRef<{ text: string; imgs: AttachedImage[] } | null>(null);
  const confirmedPaidModels = useRef<Set<string>>(new Set());
  const [enabledPaidProviders, setEnabledPaidProviders] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("orahai_enabled_paid_providers") ?? "[]") as string[]); }
    catch { return new Set(); }
  });
  const [bgJobActive, setBgJobActive] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingQueuedId, setEditingQueuedId] = useState<string | null>(null);
  const [editQueuedText, setEditQueuedText] = useState("");

  // ── GPU VRAM Monitor ───────────────────────────────────────────────────────
  interface GpuModel {
    name: string;
    size_vram: number;
    size: number;
    expires_at: string;
  }
  const [gpuModels, setGpuModels] = useState<GpuModel[]>([]);
  const [gpuChipOpen, setGpuChipOpen] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);
  const gpuPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isOllamaModel = aiModel.startsWith("ollama:") || aiModel.startsWith("ollama-remote:");
  const ollamaEndpointForGpu = aiModel.startsWith("ollama-remote:") ? "remote" : "server";
  const currentModelName = aiModel.split(":").slice(1).join(":");

  const fetchGpuPs = useCallback(async () => {
    if (!isOllamaModel) { setGpuModels([]); return; }
    try {
      const data = await api.get<{ models: GpuModel[] }>(`/api/ai/ps?endpoint=${ollamaEndpointForGpu}`);
      setGpuModels(data.models ?? []);
    } catch { setGpuModels([]); }
  }, [isOllamaModel, ollamaEndpointForGpu]);

  useEffect(() => {
    if (!isOllamaModel) { setGpuModels([]); return; }
    void fetchGpuPs();
    gpuPollRef.current = setInterval(() => { void fetchGpuPs(); }, 20_000);
    return () => { if (gpuPollRef.current) clearInterval(gpuPollRef.current); };
  }, [isOllamaModel, fetchGpuPs]);

  async function handleKeepWarm() {
    setWarmingUp(true);
    try {
      await api.post("/api/ai/warmup", { model: currentModelName, endpoint: ollamaEndpointForGpu, keepAlive: "30m" });
      await fetchGpuPs();
      toast({ title: "Model kept warm for 30 minutes" });
    } catch {
      toast({ title: "Keep warm failed", variant: "destructive" });
    } finally { setWarmingUp(false); }
  }

  function formatVram(bytes: number): string {
    if (!bytes) return "";
    const gb = bytes / 1024 ** 3;
    return gb >= 1 ? `${gb.toFixed(1)}GB` : `${(bytes / 1024 ** 2).toFixed(0)}MB`;
  }

  function formatExpiry(expiresAt: string): string {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "expired";
    const m = Math.floor(ms / 60_000);
    const s = Math.floor((ms % 60_000) / 1_000);
    return m > 0 ? `${m}m` : `${s}s`;
  }

  const hotModel = gpuModels.find(m => m.name === currentModelName || m.name.startsWith(currentModelName.split(":")[0]));
  const isWarm = !!hotModel;

  // Fetch live Ollama models (both endpoints) when the model picker opens
  useEffect(() => {
    if (!modelPickerOpen) return;
    setOllamaLoading(true);
    Promise.all([
      api.get<{ models: Array<{ name: string }>; ollamaAvailable: boolean }>("/api/ai/models?endpoint=server"),
      api.get<{ models: Array<{ name: string }>; ollamaAvailable: boolean }>("/api/ai/models?endpoint=remote"),
    ])
      .then(([serverRes, remoteRes]) => {
        setLiveOllamaModels(
          serverRes.ollamaAvailable
            ? (serverRes.models ?? []).map(m => makeOllamaModelDef(m.name))
            : []
        );
        setLiveRemoteModels(
          remoteRes.ollamaAvailable
            ? (remoteRes.models ?? []).map(m => makeOllamaRemoteModelDef(m.name))
            : []
        );
      })
      .catch(() => { setLiveOllamaModels([]); setLiveRemoteModels([]); })
      .finally(() => setOllamaLoading(false));
  }, [modelPickerOpen]);

  // Fetch latest chat messages from the server
  const fetchMessages = useCallback(() => {
    api.get<{ data: ChatMessage[] }>(`/api/ai/chat/${projectId}`)
      .then((res) => setItems(res.data ?? []))
      .catch(() => undefined);
  }, [projectId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

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

    // Gate on paid model — skip if provider is toggled on globally
    const paidProviderEnabled = enabledPaidProviders.has(aiModel.split(":")[0]);
    if (isPaidModel(aiModel) && !paidProviderEnabled && !confirmedPaidModels.current.has(aiModel)) {
      pendingPaidSubmit.current = { text, imgs: attachedImages };
      setPaidConfirmOpen(true);
      return;
    }

    setInput("");
    const imgs = attachedImages;
    setAttachedImages([]);

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

  const confirmPaidSend = async () => {
    const pending = pendingPaidSubmit.current;
    if (!pending) return;
    pendingPaidSubmit.current = null;
    confirmedPaidModels.current.add(aiModel);
    setPaidConfirmOpen(false);

    setInput("");
    setAttachedImages([]);

    const { text, imgs } = pending;
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
  const togglePaidProvider = useCallback((provider: string) => {
    setEnabledPaidProviders(prev => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
        // If currently on this provider, fall back to default
        if (aiModel.startsWith(provider + ":")) {
          setAiModel(DEFAULT_MODEL);
          localStorage.setItem("orahai_ai_model", DEFAULT_MODEL);
        }
      } else {
        next.add(provider);
        // Pre-confirm every model from this provider so no dialog fires
        MODEL_GROUPS.find(g => g.provider === provider)?.models.forEach(m => {
          confirmedPaidModels.current.add(m.id);
        });
      }
      localStorage.setItem("orahai_enabled_paid_providers", JSON.stringify([...next]));
      return next;
    });
  }, [aiModel]);

  const abortAll = () => {
    abortRef.current?.abort();
    for (const ctrl of parallelAbortMap.current.values()) ctrl.abort();
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

            if (evt.type === "model_switch" && evt.to) {
              const label = evt.to.includes(":") ? evt.to.split(":")[1] : evt.to;
              const reasonLabel = evt.reason === "too_large" ? "request too large" : evt.reason === "daily_limit" ? "daily limit reached" : "rate limit";
              toast({ title: `⚡ Switched to ${label}`, description: `Auto-fallback (${reasonLabel})` });
              setAiModel(evt.to);
              localStorage.setItem("orahai_ai_model", evt.to);
              // Auto-confirm paid models that the server switched to — user saw the toast
              if (isPaidModel(evt.to)) confirmedPaidModels.current.add(evt.to);

            } else if (evt.type === "agent_step" && evt.step) {
              setAgentStep(evt.step);

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
                      ) : hasContent ? (
                        <MsgContent
                          content={msg.content}
                          isAssistant={msg.role === "assistant"}
                          onApply={onApplyCode}
                          onApplyToPath={onApplyToPath}
                          activeFilePath={activeFilePath}
                          projectId={projectId}
                        />
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

      {/* Image preview strip */}
      {attachedImages.length > 0 && (
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

      {/* Queue tray — shown above input while messages are waiting */}
      {queueCount > 0 && (() => {
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

      {/* Input */}
      <div className="p-2.5 border-t border-border">
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
          {/* GPU VRAM chip — only visible for Ollama models */}
          {isOllamaModel && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setGpuChipOpen(v => !v)}
                title={isWarm ? `Model loaded in VRAM · expires in ${formatExpiry(hotModel!.expires_at)}` : "Model not in VRAM — first response will be slower"}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all",
                  isWarm
                    ? "border-green-500/30 text-green-400 bg-green-500/10 hover:bg-green-500/20"
                    : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Cpu className="w-2.5 h-2.5" />
                {isWarm ? (
                  <>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span>{formatVram(hotModel!.size_vram)}</span>
                    <span className="text-green-500/70">·</span>
                    <span>{formatExpiry(hotModel!.expires_at)}</span>
                  </>
                ) : (
                  <span>Cold</span>
                )}
              </button>

              {gpuChipOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setGpuChipOpen(false)} />
                  <div className="absolute bottom-full right-0 mb-1.5 w-64 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Cpu className="w-3 h-3" /> VRAM Monitor
                      </span>
                      <button onClick={() => setGpuChipOpen(false)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Running models list */}
                    <div className="p-2 space-y-1.5 max-h-48 overflow-y-auto">
                      {gpuModels.length === 0 ? (
                        <div className="py-3 text-center text-xs text-muted-foreground">
                          No models loaded in VRAM
                          <p className="text-[10px] mt-1 text-muted-foreground/60">First request will load the model (~10–30s)</p>
                        </div>
                      ) : (
                        gpuModels.map(m => {
                          const isCurrent = m.name === currentModelName || m.name.startsWith(currentModelName.split(":")[0]);
                          return (
                            <div key={m.name} className={cn(
                              "rounded-lg px-2.5 py-2 border text-xs",
                              isCurrent ? "border-green-500/30 bg-green-500/5" : "border-border/40 bg-muted/20",
                            )}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-medium truncate text-[11px]">{m.name}</span>
                                {isCurrent && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/20 font-bold shrink-0">Active</span>}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                                <span title="VRAM used">{formatVram(m.size_vram)} VRAM</span>
                                <span title="Expires from VRAM">· evicts in {formatExpiry(m.expires_at)}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Keep Warm button */}
                    <div className="border-t border-border/40 p-2">
                      <button
                        onClick={() => { void handleKeepWarm(); setGpuChipOpen(false); }}
                        disabled={warmingUp || !isWarm}
                        className={cn(
                          "w-full flex items-center justify-center gap-1.5 text-[11px] font-medium rounded-lg px-3 py-1.5 transition-colors",
                          isWarm
                            ? "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20"
                            : "bg-muted text-muted-foreground cursor-not-allowed border border-border/40",
                        )}
                      >
                        {warmingUp
                          ? <><Loader2 className="w-3 h-3 animate-spin" /> Extending…</>
                          : <><Flame className="w-3 h-3" /> Keep Warm 30min</>
                        }
                      </button>
                      <p className="text-[9px] text-muted-foreground/60 text-center mt-1">
                        Prevents cold-start delays by keeping model in GPU memory
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Model picker */}
          <div className={cn("relative", !isOllamaModel && "ml-auto")}>
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
              <span className="max-w-[72px] truncate">{getModelShortName(aiModel)}</span>
              {isPaidModel(aiModel) && (
                <DollarSign className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              )}
              <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", modelPickerOpen && "rotate-180")} />
            </button>

            {modelPickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModelPickerOpen(false)} />
                <div className="absolute bottom-full right-0 mb-1.5 w-72 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="max-h-80 overflow-y-auto">
                    {/* Ollama Server models */}
                    {(liveOllamaModels.length > 0 || (ollamaLoading && liveOllamaModels.length === 0)) && (
                      <div>
                        <div className="sticky top-0 flex items-center justify-between px-3 py-1.5 bg-muted/60 backdrop-blur border-b border-border/40">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Ollama — Server</span>
                          {ollamaLoading && <span className="text-[8px] text-muted-foreground">Loading…</span>}
                        </div>
                        {liveOllamaModels.map(model => (
                          <button key={model.id}
                            onClick={() => { setAiModel(model.id); localStorage.setItem("orahai_ai_model", model.id); setModelPickerOpen(false); }}
                            className={cn("w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left", aiModel === model.id && "text-primary bg-primary/5")}>
                            <span className="flex-1 font-mono font-medium truncate">{model.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-medium shrink-0">Server</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Ollama Remote models */}
                    {(liveRemoteModels.length > 0) && (
                      <div>
                        <div className="sticky top-0 flex items-center justify-between px-3 py-1.5 bg-muted/60 backdrop-blur border-b border-border/40">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Ollama — Remote</span>
                        </div>
                        {liveRemoteModels.map(model => (
                          <button key={model.id}
                            onClick={() => { setAiModel(model.id); localStorage.setItem("orahai_ai_model", model.id); setModelPickerOpen(false); }}
                            className={cn("w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left", aiModel === model.id && "text-primary bg-primary/5")}>
                            <span className="flex-1 font-mono font-medium truncate">{model.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium shrink-0">Remote</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Static model groups (cloud + ollama catalog) */}
                    {MODEL_GROUPS.filter(g =>
                      g.provider !== "ollama" &&
                      (g.provider !== "openai" && g.provider !== "anthropic" || enabledPaidProviders.has(g.provider))
                    ).map(group => (
                      <div key={group.label}>
                        <div className="sticky top-0 flex items-center justify-between px-3 py-1.5 bg-muted/60 backdrop-blur border-b border-border/40">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                          {group.note && (
                            <span className="text-[8px] text-amber-500/90 font-medium truncate max-w-[110px]">{group.note}</span>
                          )}
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
                  {/* Footer: paid provider toggles + manage link */}
                  <div className="border-t border-border/40 px-3 pt-2 pb-1.5 space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-1 mb-1.5">Paid Providers</p>
                    {([
                      { provider: "openai",    label: "OpenAI",    sub: "via Replit proxy" },
                      { provider: "anthropic", label: "Anthropic", sub: "needs API key" },
                    ] as const).map(({ provider, label, sub }) => {
                      const on = enabledPaidProviders.has(provider);
                      return (
                        <button key={provider} type="button"
                          onClick={() => togglePaidProvider(provider)}
                          className="w-full flex items-center gap-2.5 px-1 py-1 rounded-lg hover:bg-muted/60 transition-colors"
                        >
                          {/* pill toggle */}
                          <div className={cn(
                            "w-8 h-4 rounded-full transition-colors relative shrink-0",
                            on ? "bg-amber-500" : "bg-muted-foreground/25",
                          )}>
                            <div className={cn(
                              "absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform",
                              on ? "translate-x-4" : "translate-x-0.5",
                            )} />
                          </div>
                          <span className={cn("flex-1 text-left text-xs font-medium", on ? "text-foreground" : "text-muted-foreground")}>
                            {label}
                          </span>
                          <DollarSign className="w-2.5 h-2.5 text-amber-400/70 shrink-0" />
                          <span className="text-[9px] text-muted-foreground/60 shrink-0">{sub}</span>
                        </button>
                      );
                    })}
                    <a
                      href="/ai-models"
                      onClick={() => setModelPickerOpen(false)}
                      className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors px-1 pt-1"
                    >
                      <Bot className="w-3 h-3" />
                      Manage models & pull new ones →
                    </a>
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
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { if (e.target.files?.length) handleImageFiles(e.target.files); e.target.value = ""; }} />

      {/* Paid model confirmation — Radix portals to body so nesting here is fine */}
      <AlertDialog open={paidConfirmOpen} onOpenChange={(open) => {
        if (!open) pendingPaidSubmit.current = null;
        setPaidConfirmOpen(open);
      }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-400" />
              Paid model
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{getModelShortName(aiModel)}</strong> may incur API costs.
              Send this message using it?
              <br />
              <span className="text-[11px] text-muted-foreground/70">
                You won&apos;t be asked again this session for this model.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPaidSend}>
              Send anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

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

function MsgContent({ content, isAssistant, onApply, onApplyToPath, activeFilePath, projectId }: {
  content: string; isAssistant: boolean;
  onApply?: (code: string) => void;
  onApplyToPath?: (code: string, path: string) => void;
  activeFilePath?: string; projectId: string;
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
              projectId={projectId} />
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

function CodeBlock({ lang, code, showApply, onApply, onApplyToPath, activeFilePath, inferredPath, projectId }: {
  lang: string; code: string; showApply: boolean;
  onApply?: (code: string) => void;
  onApplyToPath?: (code: string, path: string) => void;
  activeFilePath?: string; inferredPath?: string; projectId: string;
}) {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);
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

import { Router, type Response, type NextFunction } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { logger } from "../lib/logger";

const router = Router();

type OllamaEndpoint = "server" | "remote";

function ollamaBase(endpoint: OllamaEndpoint = "server"): string {
  if (endpoint === "remote") {
    const url = (process.env.OLLAMA_REMOTE_URL ?? "").replace(/\/$/, "");
    return url || "";
  }
  return (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
}

async function ollamaFetch(path: string, endpoint: OllamaEndpoint = "server", options: RequestInit = {}) {
  const base = ollamaBase(endpoint);
  if (!base) throw new Error("Remote Ollama URL not configured");
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  return res;
}

async function probeOllama(endpoint: OllamaEndpoint): Promise<{ available: boolean; version?: string; models?: string[] }> {
  try {
    const base = ollamaBase(endpoint);
    if (!base) return { available: false };
    const verRes = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(3000) });
    if (!verRes.ok) return { available: false };
    const ver = await verRes.json() as { version?: string };
    const listRes = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const listData = listRes.ok
      ? await listRes.json() as { models?: Array<{ name: string }> }
      : { models: [] };
    return {
      available: true,
      version: ver.version,
      models: (listData.models ?? []).map(m => m.name),
    };
  } catch {
    return { available: false };
  }
}

// ── GET /api/ai/providers ─────────────────────────────────────────────────────
router.get("/providers", requireAuth, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [serverProbe, remoteProbe] = await Promise.all([
      probeOllama("server"),
      probeOllama("remote"),
    ]);

    const groqKey = !!(process.env.GROQ_API_KEY);
    let groqModels: string[] = [];
    if (groqKey) {
      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          signal: AbortSignal.timeout(4000),
        });
        if (groqRes.ok) {
          const data = await groqRes.json() as { data?: Array<{ id: string }> };
          groqModels = (data.data ?? []).map(m => m.id).filter(id =>
            ["llama", "mixtral", "gemma", "deepseek", "qwen", "whisper"].some(prefix => id.includes(prefix))
          );
        }
      } catch { /* ignore */ }
    }

    const providers: Record<string, unknown> = {
      openai: {
        available: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
        models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"],
      },
      anthropic: {
        available: !!(process.env.ANTHROPIC_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY),
        models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
      },
      groq: {
        available: groqKey,
        models: groqModels.length ? groqModels : ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "meta-llama/llama-4-scout-17b-16e-instruct", "qwen/qwen3-32b"],
      },
      ollama: {
        available: serverProbe.available,
        version: serverProbe.version,
        models: serverProbe.models ?? [],
      },
      "ollama-remote": {
        available: remoteProbe.available,
        version: remoteProbe.version,
        models: remoteProbe.models ?? [],
        configured: !!ollamaBase("remote"),
        url: ollamaBase("remote") || null,
      },
    };

    res.set("Cache-Control", "no-store");
    res.json({ providers });
  } catch (err) { next(err); }
});

// ── GET /api/ai/models?endpoint=server|remote ────────────────────────────────
router.get("/models", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const endpoint: OllamaEndpoint = req.query.endpoint === "remote" ? "remote" : "server";
    try {
      const base = ollamaBase(endpoint);
      if (!base) { res.json({ models: [], ollamaAvailable: false, endpoint }); return; }
      const ollamaRes = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!ollamaRes.ok) { res.json({ models: [], ollamaAvailable: false, endpoint }); return; }
      const data = await ollamaRes.json() as {
        models?: Array<{ name: string; size: number; modified_at: string; details?: { parameter_size?: string; quantization_level?: string } }>;
      };
      res.json({ models: data.models ?? [], ollamaAvailable: true, endpoint });
    } catch {
      res.json({ models: [], ollamaAvailable: false, endpoint });
    }
  } catch (err) { next(err); }
});

// ── POST /api/ai/models/pull — SSE stream ─────────────────────────────────────
router.post("/models/pull", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { model, endpoint: ep } = req.body as { model?: string; endpoint?: string };
    const endpoint: OllamaEndpoint = ep === "remote" ? "remote" : "server";

    if (!model || typeof model !== "string" || model.trim().length === 0) {
      return next(createError("model is required", 400));
    }
    const modelName = model.trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_\-.:\/]*$/.test(modelName) || modelName.includes("..")) {
      return next(createError("Invalid model name", 400));
    }

    const base = ollamaBase(endpoint);
    if (!base) return next(createError("Remote Ollama URL not configured. Set OLLAMA_REMOTE_URL in secrets.", 400));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const send = (obj: object) => {
      try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* client gone */ }
    };

    try {
      const pullRes = await fetch(`${base}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName, stream: true }),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });

      if (!pullRes.ok || !pullRes.body) {
        send({ type: "error", error: `Ollama pull failed: ${pullRes.status}` });
        res.end();
        return;
      }

      const reader = pullRes.body.getReader();
      const dec = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = dec.decode(value, { stream: true }).split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const evt = JSON.parse(line) as {
              status?: string; completed?: number; total?: number;
              digest?: string; error?: string;
            };
            if (evt.error) {
              send({ type: "error", error: evt.error });
            } else {
              send({ type: "progress", status: evt.status, completed: evt.completed, total: evt.total, digest: evt.digest });
              if (evt.status === "success") {
                send({ type: "done", model: modelName, endpoint });
              }
            }
          } catch { /* skip */ }
        }
      }

      send({ type: "done", model: modelName, endpoint });
    } catch (pullErr) {
      logger.warn({ err: pullErr, modelName }, "Model pull error");
      send({ type: "error", error: (pullErr as Error).message ?? "Pull failed" });
    }

    res.end();
  } catch (err) { next(err); }
});

// ── DELETE /api/ai/models?name=...&endpoint=server|remote ────────────────────
router.delete("/models", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const modelName = String(req.query.name ?? "").trim();
    const endpoint: OllamaEndpoint = req.query.endpoint === "remote" ? "remote" : "server";

    if (!modelName || modelName.includes("..")) {
      return next(createError("Invalid model name", 400));
    }

    const delRes = await ollamaFetch("/api/delete", endpoint, {
      method: "DELETE",
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(10000),
    });

    if (!delRes.ok) {
      const body = await delRes.text();
      return next(createError(`Failed to delete model: ${body}`, delRes.status));
    }

    return res.json({ success: true, model: modelName, endpoint });
  } catch (err) { next(err); }
});

// ── GET /api/ai/ps?endpoint=server|remote — running models in VRAM ────────────
router.get("/ps", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const endpoint: OllamaEndpoint = req.query.endpoint === "remote" ? "remote" : "server";
  try {
    const psRes = await ollamaFetch("/api/ps", endpoint, { signal: AbortSignal.timeout(5000) });
    if (!psRes.ok) return next(createError(`Ollama ps failed: ${psRes.status}`, psRes.status));
    const data = await psRes.json();
    return res.json(data);
  } catch (err) { next(err); }
});

// ── POST /api/ai/warmup — extend model keep-alive in VRAM ────────────────────
router.post("/warmup", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { model, endpoint: ep, keepAlive = "30m" } = req.body as { model?: string; endpoint?: string; keepAlive?: string };
  const endpoint: OllamaEndpoint = ep === "remote" ? "remote" : "server";
  if (!model) return next(createError("model is required", 400));
  try {
    // Send a zero-token generate request with keep_alive to extend VRAM residency
    const warmRes = await ollamaFetch("/api/generate", endpoint, {
      method: "POST",
      body: JSON.stringify({ model, prompt: "", keep_alive: keepAlive, stream: false }),
      signal: AbortSignal.timeout(15000),
    });
    if (!warmRes.ok) {
      const txt = await warmRes.text();
      return next(createError(`Warmup failed: ${txt}`, warmRes.status));
    }
    return res.json({ ok: true, model, endpoint, keepAlive });
  } catch (err) { next(err); }
});

// ── POST /api/ai/models/cancel ────────────────────────────────────────────────
router.post("/models/cancel", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { model, endpoint: ep } = req.body as { model?: string; endpoint?: string };
    const endpoint: OllamaEndpoint = ep === "remote" ? "remote" : "server";
    await ollamaFetch("/api/cancel", endpoint, {
      method: "POST",
      body: JSON.stringify({ name: model }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* ignore */ }
  res.json({ ok: true });
});

export default router;

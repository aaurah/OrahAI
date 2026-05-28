import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { logger } from "../lib/logger";

const router = Router();

function ollamaBase(): string {
  return (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
}

async function ollamaFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ollamaBase()}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  return res;
}

// ── GET /api/ai/providers ─────────────────────────────────────────────────────
// Returns status of each configured AI provider.
router.get("/providers", requireAuth, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const providers: Record<string, { available: boolean; models?: string[] }> = {};

    // OpenAI / Replit AI Integration
    providers.openai = {
      available: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
      models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"],
    };

    // Anthropic
    providers.anthropic = {
      available: !!(process.env.ANTHROPIC_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY),
      models: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5"],
    };

    // Ollama (local)
    try {
      const ollamaRes = await ollamaFetch("/api/version", { signal: AbortSignal.timeout(3000) });
      if (ollamaRes.ok) {
        const ver = await ollamaRes.json() as { version?: string };
        const listRes = await ollamaFetch("/api/tags", { signal: AbortSignal.timeout(3000) });
        const listData = listRes.ok ? await listRes.json() as { models?: Array<{ name: string }> } : { models: [] };
        providers.ollama = {
          available: true,
          models: (listData.models ?? []).map((m) => m.name),
        };
        (providers.ollama as Record<string, unknown>).version = ver.version;
      } else {
        providers.ollama = { available: false };
      }
    } catch {
      providers.ollama = { available: false };
    }

    res.json({ providers });
  } catch (err) { next(err); }
});

// ── GET /api/ai/models ────────────────────────────────────────────────────────
// Returns all locally installed Ollama models.
router.get("/models", requireAuth, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const ollamaRes = await ollamaFetch("/api/tags", { signal: AbortSignal.timeout(5000) });
    if (!ollamaRes.ok) {
      return res.json({ models: [], ollamaAvailable: false });
    }
    const data = await ollamaRes.json() as {
      models?: Array<{ name: string; size: number; modified_at: string; details?: { parameter_size?: string; quantization_level?: string } }>;
    };
    return res.json({ models: data.models ?? [], ollamaAvailable: true });
  } catch {
    return res.json({ models: [], ollamaAvailable: false });
  }
});

// ── POST /api/ai/models/pull ──────────────────────────────────────────────────
// Starts pulling a model from Ollama registry. Streams progress via SSE.
router.post("/models/pull", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { model } = req.body as { model?: string };
    if (!model || typeof model !== "string" || model.trim().length === 0) {
      return next(createError("model is required", 400));
    }
    const modelName = model.trim();

    // Validate model name (alphanumeric, dashes, colons, dots — no path traversal)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_\-.:\/]*$/.test(modelName) || modelName.includes("..")) {
      return next(createError("Invalid model name", 400));
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const send = (obj: object) => {
      try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* client gone */ }
    };

    try {
      const pullRes = await fetch(`${ollamaBase()}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName, stream: true }),
        signal: AbortSignal.timeout(10 * 60 * 1000), // 10 min
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
              status?: string;
              completed?: number;
              total?: number;
              digest?: string;
              error?: string;
            };
            if (evt.error) {
              send({ type: "error", error: evt.error });
            } else {
              send({ type: "progress", status: evt.status, completed: evt.completed, total: evt.total, digest: evt.digest });
            }
          } catch { /* skip unparseable lines */ }
        }
      }

      send({ type: "done", model: modelName });
    } catch (pullErr) {
      logger.warn({ err: pullErr, modelName }, "Model pull error");
      send({ type: "error", error: (pullErr as Error).message ?? "Pull failed" });
    }

    res.end();
  } catch (err) { next(err); }
});

// ── DELETE /api/ai/models ─────────────────────────────────────────────────────
// Removes a locally installed Ollama model.
// Model name passed as query param (?name=llama3.2:1b) to avoid path conflicts
// with colons in model names (e.g. llama3.1:70b).
router.delete("/models", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const modelName = String(req.query.name ?? "").trim();
    if (!modelName || modelName.includes("..")) {
      return next(createError("Invalid model name", 400));
    }

    const delRes = await ollamaFetch("/api/delete", {
      method: "DELETE",
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(10000),
    });

    if (!delRes.ok) {
      const body = await delRes.text();
      return next(createError(`Failed to delete model: ${body}`, delRes.status));
    }

    return res.json({ success: true, model: modelName });
  } catch (err) { next(err); }
});

// ── POST /api/ai/models/cancel ────────────────────────────────────────────────
// Cancels an in-progress pull (best-effort).
router.post("/models/cancel", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { model } = req.body as { model?: string };
    await ollamaFetch("/api/cancel", {
      method: "POST",
      body: JSON.stringify({ name: model }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* ignore */ }
  res.json({ ok: true });
});

export default router;

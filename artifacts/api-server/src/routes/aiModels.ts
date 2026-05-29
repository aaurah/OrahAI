import { Router, type Response, type NextFunction } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { logger } from "../lib/logger";

const router = Router();

type OllamaEndpoint = "server" | "remote";

// Headers that bypass tunnel browser-warning pages (ngrok, localtunnel, Cloudflare Tunnel, etc.)
const TUNNEL_BYPASS_HEADERS: Record<string, string> = {
  "ngrok-skip-browser-warning": "true",
  "bypass-tunnel-reminder": "true",
  "user-agent": "OrahAI/1.0 (ollama-client)",
};

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
  const extraHeaders = endpoint === "remote" ? TUNNEL_BYPASS_HEADERS : {};
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...extraHeaders, ...(options.headers ?? {}) },
  });
  return res;
}

async function probeOllama(endpoint: OllamaEndpoint): Promise<{
  available: boolean; version?: string; models?: string[];
  error?: string; statusCode?: number;
}> {
  try {
    const base = ollamaBase(endpoint);
    if (!base) return { available: false, error: "URL not configured" };
    const extraHeaders = endpoint === "remote" ? TUNNEL_BYPASS_HEADERS : {};
    // Try /api/version — if non-JSON or non-2xx, the tunnel is showing a warning page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let verRes: any;
    try {
      verRes = await fetch(`${base}/api/version`, {
        headers: extraHeaders,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (fetchErr) {
      return { available: false, error: (fetchErr as Error).message ?? "Network error" };
    }
    if (!verRes.ok) {
      return { available: false, statusCode: verRes.status as number, error: `HTTP ${verRes.status} — tunnel may be showing a login/warning page` };
    }
    const contentType: string = verRes.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { available: false, error: "Got HTML instead of JSON — tunnel is intercepting the request (ngrok warning page?). The bypass headers were sent — try upgrading to ngrok paid or use Cloudflare Tunnel." };
    }
    const ver = await verRes.json() as { version?: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listRes: any = await fetch(`${base}/api/tags`, {
      headers: extraHeaders,
      signal: AbortSignal.timeout(10_000),
    });
    const listData = listRes.ok
      ? await listRes.json() as { models?: Array<{ name: string }> }
      : { models: [] };
    return {
      available: true,
      version: ver.version,
      models: (listData.models ?? []).map((m: { name: string }) => m.name),
    };
  } catch (err) {
    return { available: false, error: (err as Error).message ?? "Unknown error" };
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
      auto: {
        available: true,
        description: "Smart routing — picks the best available model for your task",
        models: ["auto"],
      },
      openai: {
        available: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
        models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o3-mini"],
      },
      anthropic: {
        available: !!(process.env.ANTHROPIC_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY),
        models: ["claude-opus-4-5", "claude-opus-4-8", "claude-sonnet-4-5", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
      },
      gemini: {
        available: !!(process.env.GOOGLE_API_KEY),
        configured: !!(process.env.GOOGLE_API_KEY),
        models: ["gemini-2.5-pro-preview-06-05", "gemini-2.5-flash-preview-05-20", "gemini-2.0-flash", "gemini-1.5-pro"],
        note: "Requires GOOGLE_API_KEY secret (aistudio.google.com/apikey)",
      },
      xai: {
        available: !!(process.env.XAI_API_KEY),
        configured: !!(process.env.XAI_API_KEY),
        models: ["grok-3", "grok-3-mini", "grok-2"],
        note: "Requires XAI_API_KEY secret (console.x.ai)",
      },
      perplexity: {
        available: !!(process.env.PERPLEXITY_API_KEY),
        configured: !!(process.env.PERPLEXITY_API_KEY),
        models: ["sonar-pro", "sonar", "sonar-reasoning-pro", "sonar-reasoning"],
        note: "Requires PERPLEXITY_API_KEY secret (perplexity.ai/api)",
      },
      deepseek: {
        available: !!(process.env.DEEPSEEK_API_KEY),
        configured: !!(process.env.DEEPSEEK_API_KEY),
        models: ["deepseek-chat", "deepseek-reasoner"],
        note: "Requires DEEPSEEK_API_KEY secret (platform.deepseek.com)",
      },
      groq: {
        available: groqKey,
        models: groqModels.length ? groqModels : [
          "llama-3.3-70b-versatile",
          "llama-3.1-8b-instant",
          "meta-llama/llama-4-scout-17b-16e-instruct",
          "meta-llama/llama-4-maverick-17b-128e-instruct",
          "qwen/qwen3-32b",
          "compound-beta",
          "compound-beta-mini",
        ],
        note: "Free API key at console.groq.com",
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
        error: remoteProbe.available ? undefined : remoteProbe.error,
        statusCode: remoteProbe.statusCode,
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

// ── GET /api/ai/remote-test — detailed connectivity diagnostic ────────────────
router.get("/remote-test", requireAuth, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const base = ollamaBase("remote");
    if (!base) {
      res.json({ ok: false, stage: "config", error: "OLLAMA_REMOTE_URL is not set in Replit Secrets." });
      return;
    }

    const steps: Array<{ step: string; ok: boolean; detail?: string }> = [];

    // Stage 1: DNS / network reach
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let verRes: any;
    try {
      verRes = await fetch(`${base}/api/version`, {
        headers: TUNNEL_BYPASS_HEADERS,
        signal: AbortSignal.timeout(10_000),
      });
      steps.push({ step: "network_reach", ok: true, detail: `HTTP ${verRes.status}` });
    } catch (err) {
      const msg = (err as Error).message ?? "Unknown error";
      steps.push({ step: "network_reach", ok: false, detail: msg });
      res.json({ ok: false, stage: "network", steps, hint: msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")
        ? "Cannot reach the remote URL. Make sure your tunnel is running and the URL is correct."
        : msg.includes("timeout") || msg.includes("AbortError")
          ? "Connection timed out after 10 s. The remote Ollama may be sleeping or on a slow network."
          : msg });
      return;
    }

    // Stage 2: HTTP status OK
    const statusCode = verRes.status as number;
    if (!verRes.ok) {
      steps.push({ step: "http_status", ok: false, detail: `HTTP ${statusCode}` });
      res.json({ ok: false, stage: "http", steps,
        hint: statusCode === 401 || statusCode === 403
          ? "Authentication required — your tunnel is protected. Ensure the tunnel has no password, or configure it to allow bypass headers."
          : statusCode === 404
            ? "Path not found. Make sure the URL is the base URL of Ollama (no path suffix needed)."
            : `Tunnel returned HTTP ${statusCode}. It may be showing a login/error page.` });
      return;
    }
    steps.push({ step: "http_status", ok: true, detail: `HTTP ${statusCode}` });

    // Stage 3: Content-Type check (tunnel warning pages return HTML)
    const ct: string = verRes.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      steps.push({ step: "content_type", ok: false, detail: `Content-Type: ${ct}` });
      res.json({ ok: false, stage: "content_type", steps,
        hint: "The server returned HTML instead of JSON — the tunnel is showing a browser warning page. The bypass header was sent but didn't work. Try ngrok paid or Cloudflare Tunnel (no interstitial)." });
      return;
    }
    steps.push({ step: "content_type", ok: true, detail: ct });

    // Stage 4: Parse JSON version
    let ver: { version?: string } = {};
    try {
      ver = await verRes.json() as { version?: string };
      steps.push({ step: "json_parse", ok: true, detail: `Ollama v${ver.version ?? "?"}` });
    } catch {
      steps.push({ step: "json_parse", ok: false, detail: "Invalid JSON in response" });
      res.json({ ok: false, stage: "json", steps, hint: "Connected but response was not valid JSON." });
      return;
    }

    // Stage 5: List models
    let models: string[] = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listRes: any = await fetch(`${base}/api/tags`, {
        headers: TUNNEL_BYPASS_HEADERS,
        signal: AbortSignal.timeout(10_000),
      });
      if (listRes.ok) {
        const data = await listRes.json() as { models?: Array<{ name: string }> };
        models = (data.models ?? []).map((m: { name: string }) => m.name);
      }
      steps.push({ step: "list_models", ok: true, detail: `${models.length} model(s)` });
    } catch {
      steps.push({ step: "list_models", ok: false, detail: "Could not list models" });
    }

    res.json({ ok: true, steps, version: ver.version, models,
      hint: models.length === 0
        ? "Connected! But no models are installed on the remote. Run `ollama pull llama3` (or any model) on that machine."
        : undefined });
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

import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import http from "http";
import { executeRun } from "./runner";
import { logger } from "./logger";

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// Active WS connections keyed by runId
const runSockets = new Map<string, Set<WebSocket>>();

wss.on("connection", (ws, req) => {
  const runId = new URL(req.url ?? "/", "ws://x").searchParams.get("runId");
  if (!runId) { ws.close(); return; }
  if (!runSockets.has(runId)) runSockets.set(runId, new Set());
  runSockets.get(runId)!.add(ws);
  ws.on("close", () => runSockets.get(runId)?.delete(ws));
});

function broadcast(runId: string, event: object) {
  const sockets = runSockets.get(runId);
  if (!sockets) return;
  const msg = JSON.stringify(event);
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

// ── POST /execute ─────────────────────────────────────────────────────────────
app.post("/execute", async (req, res) => {
  const { runId, projectId, command, language } = req.body as {
    runId: string; projectId: string; command: string; language: string;
  };

  if (!runId || !command) {
    return res.status(400).json({ error: "runId and command required" });
  }

  res.status(202).json({ runId, status: "queued" });

  // Notify API that run is now "running"
  await patchRun(runId, "running");

  broadcast(runId, { type: "status", status: "running" });

  try {
    const result = await executeRun({
      runId, projectId, command, language,
      onOutput: (chunk: string) => {
        broadcast(runId, { type: "output", data: chunk });
      },
    });

    await patchRun(runId, result.exitCode === 0 ? "success" : "error", {
      output: result.output,
      exitCode: result.exitCode,
    });

    broadcast(runId, { type: "done", exitCode: result.exitCode, status: result.exitCode === 0 ? "success" : "error" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await patchRun(runId, "error", { output: message, exitCode: 1 });
    broadcast(runId, { type: "done", exitCode: 1, status: "error", error: message });
  } finally {
    // Brief delay then clean up sockets
    setTimeout(() => runSockets.delete(runId), 5000);
  }
});

async function patchRun(runId: string, status: string, extra: Record<string, unknown> = {}) {
  const apiUrl = process.env.API_URL ?? "http://localhost:4000";
  try {
    await fetch(`${apiUrl}/api/runs/callback/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, status, ...extra }),
    });
  } catch (err) {
    logger.warn("Failed to patch run status:", err);
  }
}

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = parseInt(process.env.PORT ?? "5000", 10);
server.listen(PORT, () => logger.info(`Sandbox service on :${PORT}`));

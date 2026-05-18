import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { Server as SocketIOServer } from "socket.io";

import { config } from "./config";
import { logger } from "./utils/logger";
import { errorHandler } from "./middleware/errorHandler";
import { rateLimiter } from "./middleware/rateLimit";

import authRouter from "./routes/auth";
import projectsRouter from "./routes/projects";
import filesRouter from "./routes/files";
import workspacesRouter from "./routes/workspaces";
import aiRouter from "./routes/ai";
import deploymentsRouter from "./routes/deployments";
import adminRouter from "./routes/admin";
import webhooksRouter from "./routes/webhooks";
import { registerSocketHandlers } from "./socket/handlers";

async function bootstrap() {
  const app = express();
  const httpServer = http.createServer(app);

  // ── Socket.IO ──────────────────────────────────────────────────────────────
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.appUrl,
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  registerSocketHandlers(io);
  app.set("io", io);

  // ── Security ───────────────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin: [config.appUrl, "http://localhost:3000"],
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    })
  );

  // ── Body Parsing ───────────────────────────────────────────────────────────
  // Stripe webhooks need raw body — mount before json()
  app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // ── Logging ────────────────────────────────────────────────────────────────
  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.http(msg.trim()) },
      skip: (req) => req.url === "/health",
    })
  );

  // ── Rate limiting ──────────────────────────────────────────────────────────
  app.use("/api/", rateLimiter);

  // ── Health ─────────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: "0.1.0", env: config.nodeEnv });
  });

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use("/api/auth", authRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/workspaces", workspacesRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/deployments", deploymentsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/webhooks", webhooksRouter);

  // ── Error handler (must be last) ───────────────────────────────────────────
  app.use(errorHandler);

  // ── Start ──────────────────────────────────────────────────────────────────
  httpServer.listen(config.port, () => {
    logger.info(
      `OrahAI API listening on port ${config.port} [${config.nodeEnv}]`
    );
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully…`);
    httpServer.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

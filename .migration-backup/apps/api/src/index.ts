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

import authRouter       from "./routes/auth";
import workspacesRouter from "./routes/workspaces";
import projectsRouter   from "./routes/projects";
import filesRouter      from "./routes/files";
import runsRouter       from "./routes/runs";
import aiRouter         from "./routes/ai";
import { registerSocketHandlers } from "./socket/handlers";

async function bootstrap() {
  const app = express();
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: { origin: config.appUrl, credentials: true },
    transports: ["websocket", "polling"],
  });
  registerSocketHandlers(io);
  app.set("io", io);

  app.use(helmet({ crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: [config.appUrl, "http://localhost:3000"], credentials: true,
    methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    allowedHeaders: ["Content-Type","Authorization"] }));

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use(morgan("combined", { stream: { write: (m) => logger.http(m.trim()) }, skip: (r) => r.url === "/health" }));
  app.use("/api/", rateLimiter);

  app.get("/health", (_req, res) => res.json({ status: "ok", version: "0.1.0", env: config.nodeEnv }));

  app.use("/api/auth",       authRouter);
  app.use("/api/workspaces", workspacesRouter);
  app.use("/api/projects",   projectsRouter);
  app.use("/api/files",      filesRouter);
  app.use("/api/runs",       runsRouter);
  app.use("/api/ai",         aiRouter);

  app.use(errorHandler);

  httpServer.listen(config.port, () => {
    logger.info(`OrahAI API on :${config.port} [${config.nodeEnv}]`);
  });

  const shutdown = (sig: string) => {
    logger.info(`${sig} received, shutting down…`);
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

bootstrap().catch((err) => { console.error(err); process.exit(1); });

import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import app from "./app";
import { logger } from "./lib/logger";
import { runEmailNormalizationMigration } from "./lib/emailMigration";
import { runDomainsMigration } from "./lib/domainsMigration";
import { runMcpMigration } from "./lib/mcpMigration";
import { setIo } from "./lib/ioSingleton";
import { config } from "./lib/config";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

Promise.all([runEmailNormalizationMigration(), runDomainsMigration(), runMcpMigration()])
  .then(() => {
    const httpServer = createServer(app);

    const io = new Server(httpServer, {
      cors: { origin: "*", methods: ["GET", "POST"] },
      transports: ["websocket", "polling"],
    });

    setIo(io);

    io.use((socket, next) => {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("No token"));
      try {
        const payload = jwt.verify(token, config.auth.jwtSecret) as { sub?: string; id?: string };
        (socket as unknown as Record<string, unknown>).userId = payload.sub ?? payload.id ?? null;
        next();
      } catch {
        next(new Error("Invalid token"));
      }
    });

    io.on("connection", (socket) => {
      socket.on("workspace:join", (data: { projectId: string }) => {
        if (data?.projectId) socket.join(`project:${data.projectId}`);
      });
      socket.on("workspace:leave", (data: { projectId: string }) => {
        if (data?.projectId) socket.leave(`project:${data.projectId}`);
      });
    });

    httpServer.listen(port, (err?: Error) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Startup migration failed — aborting");
    process.exit(1);
  });

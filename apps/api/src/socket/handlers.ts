import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "@orahai/db";
import { config } from "../config";
import { logger } from "../utils/logger";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export function registerSocketHandlers(io: SocketIOServer): void {
  // Authenticate every socket connection
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token =
        (socket.handshake.auth.token as string) ??
        (socket.handshake.headers.authorization as string)?.replace("Bearer ", "");

      if (!token) return next(new Error("Authentication required"));

      const decoded = jwt.verify(token, config.auth.jwtSecret) as {
        sub: string;
      };

      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { id: true, deletedAt: true },
      });

      if (!user || user.deletedAt) {
        return next(new Error("User not found"));
      }

      socket.userId = user.id;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    logger.debug(`Socket connected: ${socket.id} (user: ${socket.userId})`);

    // Join user-specific room for notifications
    socket.join(`user:${socket.userId}`);

    // ── Workspace events ────────────────────────────────────────────────────

    socket.on(
      "workspace:join",
      async (data: { workspaceId: string }) => {
        const workspace = await prisma.workspace.findFirst({
          where: { id: data.workspaceId, userId: socket.userId! },
        });
        if (workspace) {
          socket.join(`workspace:${data.workspaceId}`);
          logger.debug(`Socket ${socket.id} joined workspace ${data.workspaceId}`);
        }
      }
    );

    socket.on(
      "workspace:leave",
      (data: { workspaceId: string }) => {
        socket.leave(`workspace:${data.workspaceId}`);
      }
    );

    // ── Terminal input from browser ─────────────────────────────────────────

    socket.on(
      "terminal:input",
      async (data: { workspaceId: string; input: string }) => {
        io.to(`workspace:${data.workspaceId}`).emit("terminal:output", {
          workspaceId: data.workspaceId,
          data: data.input,
          stream: "stdin",
        });
      }
    );

    // ── AI conversation events ──────────────────────────────────────────────

    socket.on(
      "conversation:join",
      (data: { conversationId: string }) => {
        socket.join(`conversation:${data.conversationId}`);
      }
    );

    socket.on(
      "conversation:leave",
      (data: { conversationId: string }) => {
        socket.leave(`conversation:${data.conversationId}`);
      }
    );

    // ── Disconnect ──────────────────────────────────────────────────────────

    socket.on("disconnect", () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });
}

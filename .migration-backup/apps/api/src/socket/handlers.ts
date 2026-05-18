import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "@orahai/db";
import { config } from "../config";
import { logger } from "../utils/logger";

interface JwtPayload { sub: string; email: string }

export function registerSocketHandlers(io: Server) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) { next(new Error("No token")); return; }
      const payload = jwt.verify(token, config.auth.jwtSecret) as JwtPayload;
      (socket as Socket & { userId: string }).userId = payload.sub;
      next();
    } catch { next(new Error("Invalid token")); }
  });

  io.on("connection", (socket) => {
    const userId = (socket as Socket & { userId: string }).userId;
    logger.info(`WS connected: ${socket.id} user=${userId}`);

    socket.on("workspace:join", async ({ projectId }: { projectId: string }) => {
      // Verify user has access via workspace membership or project ownership
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          deletedAt: null,
          OR: [
            { ownerId: userId },
            { workspace: { memberships: { some: { userId } } } },
          ],
        },
      });
      if (project) {
        socket.join(`project:${projectId}`);
        socket.emit("workspace:joined", { projectId });
      }
    });

    socket.on("workspace:leave", ({ projectId }: { projectId: string }) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on("disconnect", () => {
      logger.info(`WS disconnected: ${socket.id}`);
    });
  });
}

import { Request, Response, NextFunction } from "express";
import { prisma } from "@orahai/db";
import type { AuthenticatedRequest } from "./auth";

export function auditLog(action: string, resource: string) {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ) => {
    // Fire and forget — don't block the request
    const userId = req.user?.id;
    const resourceId =
      (req.params.id ??
        req.params.projectId ??
        req.params.workspaceId ??
        req.params.deploymentId) ||
      undefined;

    setImmediate(() => {
      prisma.auditLog
        .create({
          data: {
            userId,
            action,
            resource,
            resourceId,
            ipAddress:
              (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
              req.socket.remoteAddress ??
              null,
            userAgent: req.headers["user-agent"] ?? null,
            metadata: {
              method: req.method,
              path: req.path,
              body:
                req.method !== "GET"
                  ? sanitizeBody(req.body as Record<string, unknown>)
                  : undefined,
            },
          },
        })
        .catch(() => {
          // Non-fatal — don't interrupt request on audit failure
        });
    });

    next();
  };
}

function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const sensitive = new Set([
    "password",
    "passwordHash",
    "token",
    "secret",
    "key",
    "apiKey",
  ]);
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    sanitized[k] = sensitive.has(k.toLowerCase()) ? "[REDACTED]" : v;
  }
  return sanitized;
}

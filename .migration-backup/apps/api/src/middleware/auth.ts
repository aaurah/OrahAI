import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "@orahai/db";
import { config } from "../config";
import { createError } from "./errorHandler";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string };
}

interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(createError("No auth token provided", 401));
      return;
    }

    const token = header.slice(7);
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, config.auth.jwtSecret) as JwtPayload;
    } catch (err) {
      const expired = (err as Error).name === "TokenExpiredError";
      next(createError(expired ? "Token expired" : "Invalid token", 401));
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, deletedAt: true },
    });

    if (!user || user.deletedAt) {
      next(createError("User not found", 401));
      return;
    }

    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    next(err);
  }
}

/** Optional auth — attaches user if token present, does not block if absent */
export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) { next(); return; }
  try {
    const payload = jwt.verify(header.slice(7), config.auth.jwtSecret) as JwtPayload;
    req.user = { id: payload.sub, email: payload.email };
  } catch { /* ignore */ }
  next();
}

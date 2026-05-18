import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { config } from "../lib/config";
import { createError } from "./errorHandler";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; isAdmin: boolean; isFreeAccess: boolean };
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

    const [user] = await db
      .select({ id: users.id, email: users.email, isAdmin: users.isAdmin, isFreeAccess: users.isFreeAccess, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user || user.deletedAt) {
      next(createError("User not found", 401));
      return;
    }

    req.user = { id: user.id, email: user.email, isAdmin: user.isAdmin, isFreeAccess: user.isFreeAccess };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user?.isAdmin) {
    next(createError("Forbidden: admin access required", 403));
    return;
  }
  next();
}

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

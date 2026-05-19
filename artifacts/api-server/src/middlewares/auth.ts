import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db, users, apiKeys } from "@workspace/db";
import { eq } from "drizzle-orm";
import { config } from "../lib/config";
import { createError } from "./errorHandler";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; isAdmin: boolean; isFreeAccess: boolean };
}

interface JwtPayload {
  sub: string;
  email: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
}

function isPreviewToken(payload: JwtPayload): boolean {
  const { aud } = payload;
  if (!aud) return false;
  return Array.isArray(aud) ? aud.includes("preview") : aud === "preview";
}

async function resolveApiKey(raw: string): Promise<{ id: string; email: string; isAdmin: boolean; isFreeAccess: boolean } | null> {
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const now = new Date();

  const [row] = await db
    .select({
      keyId: apiKeys.id,
      userId: apiKeys.userId,
      revokedAt: apiKeys.revokedAt,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);

  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt < now) return null;

  // Update lastUsedAt asynchronously — don't block the request
  db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, row.keyId)).catch(() => {});

  const [user] = await db
    .select({ id: users.id, email: users.email, isAdmin: users.isAdmin, isFreeAccess: users.isFreeAccess, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);

  if (!user || user.deletedAt) return null;
  return { id: user.id, email: user.email, isAdmin: user.isAdmin, isFreeAccess: user.isFreeAccess };
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

    // API key path
    if (token.startsWith("orahai_sk_")) {
      const user = await resolveApiKey(token);
      if (!user) {
        next(createError("Invalid or revoked API key", 401));
        return;
      }
      req.user = user;
      next();
      return;
    }

    // JWT path
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, config.auth.jwtSecret) as JwtPayload;
    } catch (err) {
      const expired = (err as Error).name === "TokenExpiredError";
      next(createError(expired ? "Token expired" : "Invalid token", 401));
      return;
    }

    if (isPreviewToken(payload)) {
      next(createError("Preview tokens cannot be used for API access", 401));
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
    if (!isPreviewToken(payload)) {
      req.user = { id: payload.sub, email: payload.email, isAdmin: false, isFreeAccess: false };
    }
  } catch { /* ignore */ }
  next();
}

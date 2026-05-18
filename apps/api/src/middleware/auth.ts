import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "@orahai/db";
import { config } from "../config";
import { createError } from "./errorHandler";
import type { AuthUser } from "@orahai/types";

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    // Support both Bearer token and API key
    let token: string | undefined;
    let isApiKey = false;

    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (req.headers["x-api-key"]) {
      token = req.headers["x-api-key"] as string;
      isApiKey = true;
    }

    if (!token) {
      return next(createError("Authentication required", 401));
    }

    if (isApiKey) {
      // API key auth
      const user = await validateApiKey(token);
      if (!user) return next(createError("Invalid API key", 401));
      req.user = user;
      return next();
    }

    // JWT auth
    const decoded = jwt.verify(token, config.auth.jwtSecret) as {
      sub: string;
      email: string;
    };

    const dbUser = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        avatarUrl: true,
        role: true,
        plan: true,
        deletedAt: true,
      },
    });

    if (!dbUser || dbUser.deletedAt) {
      return next(createError("User not found or deactivated", 401));
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      username: dbUser.username,
      avatarUrl: dbUser.avatarUrl,
      role: dbUser.role as AuthUser["role"],
      plan: dbUser.plan as AuthUser["plan"],
    };

    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      next(createError("Invalid or expired token", 401));
    } else {
      next(err);
    }
  }
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      return next(createError("Authentication required", 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(createError("Insufficient permissions", 403));
    }
    next();
  };
}

async function validateApiKey(rawKey: string): Promise<AuthUser | null> {
  const bcrypt = await import("bcryptjs");

  // API keys are prefixed "oai_" and stored as hash
  const prefix = rawKey.slice(0, 8);

  const apiKeys = await prisma.apiKey.findMany({
    where: {
      keyPrefix: prefix,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          avatarUrl: true,
          role: true,
          plan: true,
          deletedAt: true,
        },
      },
    },
  });

  for (const apiKey of apiKeys) {
    const valid = await bcrypt.compare(rawKey, apiKey.keyHash);
    if (valid && !apiKey.user.deletedAt) {
      // Update last used
      await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      });

      return {
        id: apiKey.user.id,
        email: apiKey.user.email,
        name: apiKey.user.name,
        username: apiKey.user.username,
        avatarUrl: apiKey.user.avatarUrl,
        role: apiKey.user.role as AuthUser["role"],
        plan: apiKey.user.plan as AuthUser["plan"],
      };
    }
  }

  return null;
}

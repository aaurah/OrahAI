import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "@orahai/db";
import { config } from "../config";
import { createError } from "../middleware/errorHandler";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { authRateLimiter } from "../middleware/rateLimit";
import { auditLog } from "../middleware/audit";

const router = Router();

// ── Schemas ───────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, "Username may only contain letters, numbers, underscores, hyphens"),
  name: z.string().max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(128),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function signToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

function safeUser(user: {
  id: string;
  email: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
  role: string;
  plan: string;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
    role: user.role,
    plan: user.plan,
  };
}

// ── POST /api/auth/register ───────────────────────────────────────────────────

router.post(
  "/register",
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError("Validation error", 400, parsed.error.errors));
      }

      const { email, password, username, name } = parsed.data;

      const existing = await prisma.user.findFirst({
        where: { OR: [{ email }, { username }] },
      });

      if (existing) {
        const field = existing.email === email ? "email" : "username";
        return next(createError(`That ${field} is already in use`, 409));
      }

      const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);

      const user = await prisma.user.create({
        data: {
          email,
          username,
          name: name ?? null,
          passwordHash,
        },
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          avatarUrl: true,
          role: true,
          plan: true,
        },
      });

      const token = signToken(user.id, user.email);

      res.status(201).json({
        data: { user: safeUser(user), token },
        message: "Account created successfully",
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post(
  "/login",
  authRateLimiter,
  auditLog("auth.login", "user"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError("Validation error", 400, parsed.error.errors));
      }

      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          avatarUrl: true,
          role: true,
          plan: true,
          passwordHash: true,
          deletedAt: true,
        },
      });

      if (!user || user.deletedAt) {
        return next(createError("Invalid email or password", 401));
      }

      if (!user.passwordHash) {
        return next(
          createError("This account uses OAuth. Please sign in with your provider.", 401)
        );
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return next(createError("Invalid email or password", 401));
      }

      const token = signToken(user.id, user.email);

      const { passwordHash: _ph, deletedAt: _da, ...safeUserData } = user;
      void _ph;
      void _da;

      res.json({
        data: { user: safeUserData, token },
        message: "Logged in successfully",
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get(
  "/me",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          avatarUrl: true,
          bio: true,
          role: true,
          plan: true,
          createdAt: true,
          organizations: {
            include: {
              organization: {
                select: { id: true, name: true, slug: true, avatarUrl: true },
              },
            },
          },
        },
      });

      if (!user) return next(createError("User not found", 404));

      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /api/auth/me ────────────────────────────────────────────────────────

router.patch(
  "/me",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const updateSchema = z.object({
        name: z.string().max(100).optional(),
        bio: z.string().max(500).optional(),
        avatarUrl: z.string().url().optional(),
      });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError("Validation error", 400, parsed.error.errors));
      }

      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: parsed.data,
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          avatarUrl: true,
          bio: true,
          role: true,
          plan: true,
        },
      });

      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/change-password ────────────────────────────────────────────

router.post(
  "/change-password",
  requireAuth,
  authRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError("Validation error", 400, parsed.error.errors));
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { passwordHash: true },
      });

      if (!user?.passwordHash) {
        return next(createError("Password not set on this account", 400));
      }

      const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
      if (!valid) {
        return next(createError("Current password is incorrect", 401));
      }

      const newHash = await bcrypt.hash(parsed.data.newPassword, config.auth.bcryptRounds);
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { passwordHash: newHash },
      });

      res.json({ data: null, message: "Password changed successfully" });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/auth/api-keys ────────────────────────────────────────────────────

router.get(
  "/api-keys",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const keys = await prisma.apiKey.findMany({
        where: { userId: req.user!.id },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          lastUsedAt: true,
          expiresAt: true,
          scopes: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
      res.json({ data: keys });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/api-keys ───────────────────────────────────────────────────

router.post(
  "/api-keys",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(64),
        scopes: z.array(z.string()).default(["read", "write"]),
        expiresAt: z.string().datetime().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError("Validation error", 400, parsed.error.errors));
      }

      const { randomBytes } = await import("crypto");
      const raw = `oai_${randomBytes(32).toString("hex")}`;
      const prefix = raw.slice(0, 8);
      const hash = await bcrypt.hash(raw, 10);

      const apiKey = await prisma.apiKey.create({
        data: {
          userId: req.user!.id,
          name: parsed.data.name,
          keyHash: hash,
          keyPrefix: prefix,
          scopes: parsed.data.scopes,
          expiresAt: parsed.data.expiresAt
            ? new Date(parsed.data.expiresAt)
            : null,
        },
      });

      // Return raw key ONCE — never again
      res.status(201).json({
        data: {
          id: apiKey.id,
          name: apiKey.name,
          key: raw, // shown only on creation
          keyPrefix: prefix,
          scopes: apiKey.scopes,
          createdAt: apiKey.createdAt,
        },
        message: "Store this key securely — it will not be shown again.",
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/auth/api-keys/:id ─────────────────────────────────────────────

router.delete(
  "/api-keys/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const key = await prisma.apiKey.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
      });
      if (!key) return next(createError("API key not found", 404));

      await prisma.apiKey.delete({ where: { id: key.id } });
      res.json({ data: null, message: "API key revoked" });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

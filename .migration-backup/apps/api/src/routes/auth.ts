import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "@orahai/db";
import { config } from "../config";
import { createError } from "../middleware/errorHandler";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { authRateLimiter } from "../middleware/rateLimit";

const router = Router();

function signToken(userId: string, email: string) {
  return jwt.sign({ sub: userId, email }, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

function safeUser(u: { id: string; email: string; name: string | null; username: string; avatarUrl: string | null; bio: string | null }) {
  return { id: u.id, email: u.email, name: u.name, username: u.username, avatarUrl: u.avatarUrl, bio: u.bio };
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post("/register", authRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8).max(128),
        username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
        name: z.string().max(100).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const existing = await prisma.user.findFirst({
        where: { OR: [{ email: parsed.data.email }, { username: parsed.data.username }] },
      });
      if (existing) {
        const field = existing.email === parsed.data.email ? "email" : "username";
        return next(createError(`That ${field} is already in use`, 409));
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const user = await prisma.user.create({
        data: { email: parsed.data.email, username: parsed.data.username, name: parsed.data.name ?? null, passwordHash },
      });

      const token = signToken(user.id, user.email);
      res.status(201).json({ data: { user: safeUser(user), token } });
    } catch (err) { next(err); }
  });

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post("/login", authRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ email: z.string().email(), password: z.string() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      if (!user || user.deletedAt || !user.passwordHash)
        return next(createError("Invalid email or password", 401));

      const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!valid) return next(createError("Invalid email or password", 401));

      const token = signToken(user.id, user.email);
      res.json({ data: { user: safeUser(user), token } });
    } catch (err) { next(err); }
  });

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/me", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, email: true, name: true, username: true, avatarUrl: true, bio: true, createdAt: true,
          memberships: { include: { workspace: { select: { id: true, name: true, slug: true, avatarUrl: true } } } } },
      });
      if (!user) return next(createError("User not found", 404));
      res.json({ data: user });
    } catch (err) { next(err); }
  });

// ── PATCH /api/auth/me ────────────────────────────────────────────────────────
router.patch("/me", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ name: z.string().max(100).optional(), bio: z.string().max(500).optional(), avatarUrl: z.string().url().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));
      const user = await prisma.user.update({ where: { id: req.user!.id }, data: parsed.data });
      res.json({ data: safeUser(user) });
    } catch (err) { next(err); }
  });

// ── POST /api/auth/change-password ────────────────────────────────────────────
router.post("/change-password", requireAuth, authRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ currentPassword: z.string(), newPassword: z.string().min(8).max(128) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { passwordHash: true } });
      if (!user?.passwordHash) return next(createError("No password set on this account", 400));

      const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
      if (!valid) return next(createError("Current password is incorrect", 401));

      const hash = await bcrypt.hash(parsed.data.newPassword, 12);
      await prisma.user.update({ where: { id: req.user!.id }, data: { passwordHash: hash } });
      res.json({ data: null, message: "Password changed" });
    } catch (err) { next(err); }
  });

export default router;

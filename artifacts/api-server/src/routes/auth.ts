import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db, users } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { config } from "../lib/config";
import { createError } from "../middlewares/errorHandler";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { authRateLimiter } from "../middlewares/rateLimit";
import { cuid } from "../lib/cuid";

const router = Router();

function signToken(userId: string, email: string) {
  return jwt.sign({ sub: userId, email }, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

function safeUser(u: { id: string; email: string; name: string | null; username: string; avatarUrl: string | null; bio: string | null; isAdmin: boolean; isFreeAccess: boolean }) {
  return { id: u.id, email: u.email, name: u.name, username: u.username, avatarUrl: u.avatarUrl, bio: u.bio, isAdmin: u.isAdmin, isFreeAccess: u.isFreeAccess };
}

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

      const [existing] = await db
        .select({ id: users.id, email: users.email, username: users.username })
        .from(users)
        .where(or(eq(users.email, parsed.data.email), eq(users.username, parsed.data.username)))
        .limit(1);

      if (existing) {
        const field = existing.email === parsed.data.email ? "email" : "username";
        return next(createError(`That ${field} is already in use`, 409));
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const [user] = await db.insert(users).values({
        id: cuid(),
        email: parsed.data.email,
        username: parsed.data.username,
        name: parsed.data.name ?? null,
        passwordHash,
      }).returning();

      const token = signToken(user.id, user.email);
      res.status(201).json({ data: { user: safeUser(user), token } });
    } catch (err) { next(err); }
  });

router.post("/login", authRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ email: z.string().email(), password: z.string() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const [user] = await db.select({ id: users.id, email: users.email, name: users.name, username: users.username, avatarUrl: users.avatarUrl, bio: users.bio, isAdmin: users.isAdmin, isFreeAccess: users.isFreeAccess, passwordHash: users.passwordHash, deletedAt: users.deletedAt }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
      if (!user || user.deletedAt || !user.passwordHash)
        return next(createError("Invalid email or password", 401));

      const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!valid) return next(createError("Invalid email or password", 401));

      const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.toLowerCase().trim();
      if (initialAdminEmail && user.email.toLowerCase() === initialAdminEmail && !user.isAdmin) {
        await db.update(users).set({ isAdmin: true, updatedAt: new Date() }).where(eq(users.id, user.id));
        user.isAdmin = true;
      }

      const token = signToken(user.id, user.email);
      res.json({ data: { user: safeUser(user), token } });
    } catch (err) { next(err); }
  });

router.get("/me", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const [user] = await db
        .select({ id: users.id, email: users.email, name: users.name, username: users.username, avatarUrl: users.avatarUrl, bio: users.bio, isAdmin: users.isAdmin, isFreeAccess: users.isFreeAccess })
        .from(users)
        .where(eq(users.id, req.user!.id))
        .limit(1);
      if (!user) return next(createError("User not found", 404));
      res.json({ data: user });
    } catch (err) { next(err); }
  });

router.patch("/me", requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        name: z.string().max(100).optional(),
        bio: z.string().max(500).optional(),
        avatarUrl: z.string().url().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));
      const [user] = await db.update(users).set({ ...parsed.data, updatedAt: new Date() }).where(eq(users.id, req.user!.id)).returning();
      res.json({ data: safeUser(user) });
    } catch (err) { next(err); }
  });

router.post("/change-password", requireAuth, authRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ currentPassword: z.string(), newPassword: z.string().min(8).max(128) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, req.user!.id)).limit(1);
      if (!user?.passwordHash) return next(createError("No password set on this account", 400));

      const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
      if (!valid) return next(createError("Current password is incorrect", 401));

      const hash = await bcrypt.hash(parsed.data.newPassword, 12);
      await db.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, req.user!.id));
      res.json({ data: null, message: "Password changed" });
    } catch (err) { next(err); }
  });

router.post("/forgot-password", authRateLimiter, (_req: Request, res: Response) => {
  res.json({ data: null, message: "If that email exists, a password reset link has been sent." });
});

export default router;

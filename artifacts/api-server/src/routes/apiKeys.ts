import { Router, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db, apiKeys, users } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";

const router = Router();

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = "orahai_sk_" + crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 18); // "orahai_sk_" + first 8 hex chars
  return { raw, hash, prefix };
}

// ── List API keys for the current user ───────────────────────────────────────
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, req.user!.id))
      .orderBy(apiKeys.createdAt);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── Create a new API key ──────────────────────────────────────────────────────
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) {
      next(createError("Name is required", 400));
      return;
    }

    // Limit to 10 active keys per user
    const existing = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, req.user!.id), isNull(apiKeys.revokedAt)));
    if (existing.length >= 10) {
      next(createError("You can have at most 10 active API keys", 400));
      return;
    }

    const { raw, hash, prefix } = generateApiKey();
    const id = crypto.randomUUID();

    await db.insert(apiKeys).values({
      id,
      userId: req.user!.id,
      name: name.trim(),
      keyHash: hash,
      keyPrefix: prefix,
    });

    // Return the raw key once — never stored in DB
    res.status(201).json({ id, name: name.trim(), keyPrefix: prefix, key: raw, createdAt: new Date() });
  } catch (err) {
    next(err);
  }
});

// ── Revoke an API key ─────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const keyId = String(req.params.id);
    const [row] = await db
      .select({ id: apiKeys.id, userId: apiKeys.userId, revokedAt: apiKeys.revokedAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, keyId))
      .limit(1);

    if (!row) {
      next(createError("API key not found", 404));
      return;
    }
    if (row.userId !== req.user!.id) {
      next(createError("Forbidden", 403));
      return;
    }
    if (row.revokedAt) {
      next(createError("API key already revoked", 400));
      return;
    }

    await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, keyId));

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

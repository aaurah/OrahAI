import { Router, type Response, type NextFunction } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router = Router();

const CLAUDE_MODELS = [
  { id: "claude-opus-4-5",           name: "Claude Opus 4.5",   badge: "Powerful", vision: true },
  { id: "claude-sonnet-4-5",         name: "Claude Sonnet 4.5", badge: "Best",     vision: true },
  { id: "claude-sonnet-4-6",         name: "Claude Sonnet 4.6", badge: "New",      vision: true },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5",  badge: "Fast",     vision: false },
];

// ── GET /api/ai/providers ─────────────────────────────────────────────────────
router.get("/providers", requireAuth, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const available = !!(process.env.ANTHROPIC_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY);
    res.set("Cache-Control", "no-store");
    res.json({
      providers: {
        anthropic: {
          available,
          models: CLAUDE_MODELS.map(m => `anthropic:${m.id}`),
        },
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/ai/models — Claude model list ───────────────────────────────────
router.get("/models", requireAuth, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ models: CLAUDE_MODELS, provider: "anthropic" });
  } catch (err) { next(err); }
});

export default router;

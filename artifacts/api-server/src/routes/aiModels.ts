import { Router, type Response, type NextFunction } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router = Router();

const CLAUDE_MODELS = [
  { id: "claude-opus-4-5",           name: "Claude Opus 4.5",   badge: "Powerful", vision: true },
  { id: "claude-sonnet-4-5",         name: "Claude Sonnet 4.5", badge: "Best",     vision: true },
  { id: "claude-sonnet-4-6",         name: "Claude Sonnet 4.6", badge: "New",      vision: true },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5",  badge: "Fast",     vision: false },
];

const GITHUB_COPILOT_MODELS = [
  { id: "gpt-4o",      name: "GPT-4o",       badge: "Best",      vision: true  },
  { id: "gpt-4o-mini", name: "GPT-4o Mini",  badge: "Fast",      vision: true  },
  { id: "o3-mini",     name: "o3-mini",      badge: "Reasoning", vision: false },
  { id: "o1",          name: "o1",           badge: "Powerful",  vision: false },
  { id: "o1-mini",     name: "o1-mini",      badge: "Fast",      vision: false },
];

// ── GET /api/ai/providers ─────────────────────────────────────────────────────
router.get("/providers", requireAuth, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const anthropicAvailable = !!(process.env.ANTHROPIC_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY);
    const githubAvailable    = !!process.env.GITHUB_COPILOT_TOKEN;
    res.set("Cache-Control", "no-store");
    res.json({
      providers: {
        anthropic: {
          available: anthropicAvailable,
          models: CLAUDE_MODELS.map(m => `anthropic:${m.id}`),
        },
        github: {
          available: githubAvailable,
          models: GITHUB_COPILOT_MODELS.map(m => `github:${m.id}`),
        },
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/ai/models — full model list ─────────────────────────────────────
router.get("/models", requireAuth, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    res.json({
      models: [
        ...CLAUDE_MODELS.map(m => ({ ...m, provider: "anthropic" })),
        ...GITHUB_COPILOT_MODELS.map(m => ({ ...m, provider: "github" })),
      ],
    });
  } catch (err) { next(err); }
});

export default router;

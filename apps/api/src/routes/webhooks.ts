import { Router } from "express";

const router = Router();

// Phase 2 — Stripe webhook handling
router.post("/stripe", (_req, res) => {
  res.status(501).json({ error: "Billing not yet available (Phase 2)" });
});

export default router;

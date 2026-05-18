import { Router } from "express";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Phase 2 — not implemented yet
router.all("*", requireAuth, (_req, res) => {
  res.status(501).json({ error: "Deployments will be available in Phase 2" });
});

export default router;

import { Router } from "express";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/expo-url", requireAuth, (_req, res) => {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN ?? "";
  const expoUrl = domain ? `exp://${domain}` : null;
  res.json({ data: { expoUrl, domain } });
});

export default router;

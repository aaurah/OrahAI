import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

router.post("/login", (_req: Request, res: Response) => {
  res.status(501).json({ message: "Auth not yet implemented. Connect a database to enable login." });
});

router.post("/register", (_req: Request, res: Response) => {
  res.status(501).json({ message: "Auth not yet implemented. Connect a database to enable registration." });
});

router.post("/forgot-password", (_req: Request, res: Response) => {
  res.status(501).json({ message: "Password reset not yet implemented." });
});

router.get("/me", (_req: Request, res: Response) => {
  res.status(401).json({ message: "Not authenticated." });
});

export default router;

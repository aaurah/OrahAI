import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({ data: [] });
});

router.post("/", (_req: Request, res: Response) => {
  res.status(501).json({ message: "Workspaces not yet implemented." });
});

export default router;

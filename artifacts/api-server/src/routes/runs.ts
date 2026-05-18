import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

router.get("/:projectId", (_req: Request, res: Response) => {
  res.json({ data: [] });
});

router.post("/:projectId", (_req: Request, res: Response) => {
  res.status(501).json({ message: "Code execution not yet implemented." });
});

export default router;

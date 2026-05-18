import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

router.get("/:projectId", (req: Request, res: Response) => {
  res.json({ data: { flat: [], tree: [] } });
});

router.put("/:projectId", (_req: Request, res: Response) => {
  res.status(501).json({ message: "File storage not yet implemented." });
});

router.get("/:projectId/read", (_req: Request, res: Response) => {
  res.status(501).json({ message: "File storage not yet implemented." });
});

router.delete("/:projectId", (_req: Request, res: Response) => {
  res.status(501).json({ message: "File storage not yet implemented." });
});

export default router;

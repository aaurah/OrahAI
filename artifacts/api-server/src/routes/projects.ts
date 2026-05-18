import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({ data: [] });
});

router.post("/", (_req: Request, res: Response) => {
  res.status(501).json({ message: "Projects not yet implemented. Connect a database to create projects." });
});

router.get("/:id", (req: Request, res: Response) => {
  res.status(404).json({ message: `Project ${req.params.id} not found.` });
});

router.patch("/:id", (_req: Request, res: Response) => {
  res.status(501).json({ message: "Not yet implemented." });
});

router.delete("/:id", (_req: Request, res: Response) => {
  res.status(501).json({ message: "Not yet implemented." });
});

export default router;

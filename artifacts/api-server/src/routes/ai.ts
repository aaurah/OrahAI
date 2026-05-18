import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

router.get("/chat/:projectId", (_req: Request, res: Response) => {
  res.json({ data: [] });
});

router.post("/chat/:projectId", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write('data: {"type":"delta","content":"AI integration not yet configured. Connect an AI provider to enable chat."}\n\n');
  res.write('data: {"type":"done"}\n\n');
  res.end();
});

router.delete("/chat/:projectId", (_req: Request, res: Response) => {
  res.json({ data: null });
});

export default router;

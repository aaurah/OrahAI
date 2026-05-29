import { Router, type Response, type NextFunction } from "express";
import { db, notifications } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";

const router = Router();
router.use(requireAuth);

// GET /api/notifications
router.get("/", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await db.select()
      .from(notifications)
      .where(eq(notifications.userId, req.user!.id))
      .orderBy(sql`${notifications.createdAt} DESC`)
      .limit(50);

    const unreadCount = rows.filter(n => !n.isRead).length;
    res.json({ data: rows, unreadCount });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/read-all
router.patch("/read-all", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await db.execute(sql`
      UPDATE notifications SET is_read = true
      WHERE user_id = ${req.user!.id} AND is_read = false
    `);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params["id"]);
    const [row] = await db.select({ id: notifications.id, userId: notifications.userId })
      .from(notifications).where(eq(notifications.id, id)).limit(1);
    if (!row || row.userId !== req.user!.id) return next(createError("Not found", 404));
    await db.execute(sql`UPDATE notifications SET is_read = true WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/notifications/:id
router.delete("/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params["id"]);
    const [row] = await db.select({ id: notifications.id, userId: notifications.userId })
      .from(notifications).where(eq(notifications.id, id)).limit(1);
    if (!row || row.userId !== req.user!.id) return next(createError("Not found", 404));
    await db.execute(sql`DELETE FROM notifications WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;

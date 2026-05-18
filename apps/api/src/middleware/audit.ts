import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

/**
 * Audit middleware — Phase 2 will persist to DB.
 * For MVP we log to stdout only.
 */
export function auditLog(action: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    logger.info(`[audit] action=${action} ip=${req.ip} path=${req.path}`);
    next();
  };
}

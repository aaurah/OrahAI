import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

export function createError(message: string, statusCode = 500, details?: unknown): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.details = details;
  return err;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  if (statusCode >= 500) {
    logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  }
  res.status(statusCode).json({
    error: httpStatusText(statusCode),
    message: err.message,
    statusCode,
    ...(err.details ? { details: err.details } : {}),
  });
}

function httpStatusText(code: number): string {
  const map: Record<number, string> = {
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 409: "Conflict", 422: "Unprocessable Entity",
    429: "Too Many Requests", 500: "Internal Server Error",
  };
  return map[code] ?? "Error";
}

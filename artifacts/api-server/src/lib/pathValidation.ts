import { createError } from "../middlewares/errorHandler";

/**
 * Validates that a project-relative file path is safe to store and materialize.
 * Rejects empty strings, absolute paths, and any path containing `..` segments.
 * Throws a 400 HTTP error if the path is invalid.
 */
export function assertSafePath(p: string): void {
  if (!p || p.includes("..") || p.startsWith("/")) {
    throw createError("Invalid file path", 400);
  }
}

/**
 * Returns true if the path is safe; false otherwise.
 * Use this when you need a boolean check without throwing.
 */
export function isSafePath(p: string): boolean {
  return Boolean(p) && !p.includes("..") && !p.startsWith("/");
}

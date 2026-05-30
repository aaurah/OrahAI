import { createError } from "../middlewares/errorHandler";

// URL-decoded traversal sequences and null bytes in addition to literal `..`
const UNSAFE_PATH_RE = /\.\.|^\//;
const ENCODED_TRAVERSAL_RE = /%2e%2e|%2f|%5c/i;
const NULL_BYTE_RE = /\x00/;

/**
 * Validates that a project-relative file path is safe to store and materialize.
 * Rejects empty strings, absolute paths, `..` traversal segments (literal or
 * URL-encoded), and null bytes.
 * Throws a 400 HTTP error if the path is invalid.
 */
export function assertSafePath(p: string): void {
  if (!p || UNSAFE_PATH_RE.test(p) || ENCODED_TRAVERSAL_RE.test(p) || NULL_BYTE_RE.test(p)) {
    throw createError("Invalid file path", 400);
  }
}

/**
 * Returns true if the path is safe; false otherwise.
 */
export function isSafePath(p: string): boolean {
  return Boolean(p) && !UNSAFE_PATH_RE.test(p) && !ENCODED_TRAVERSAL_RE.test(p) && !NULL_BYTE_RE.test(p);
}

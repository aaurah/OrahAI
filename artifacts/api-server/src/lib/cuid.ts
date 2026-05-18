import { randomBytes } from "crypto";

export function cuid(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString("base64url").slice(0, 8);
  return `c${timestamp}${random}`;
}

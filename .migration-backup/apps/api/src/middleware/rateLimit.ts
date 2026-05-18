import rateLimit from "express-rate-limit";
import { config } from "../config";

export const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too Many Requests",
    message: "Rate limit exceeded. Please retry after a moment.",
    statusCode: 429,
  },
  skip: (req) => {
    // Skip rate limiting for internal health checks
    return req.ip === "127.0.0.1" && req.path === "/health";
  },
});

// Stricter limiter for auth endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too Many Requests",
    message: "Too many authentication attempts. Please wait 15 minutes.",
    statusCode: 429,
  },
});

// AI endpoint limiter (more expensive)
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too Many Requests",
    message: "AI request rate limit exceeded.",
    statusCode: 429,
  },
});

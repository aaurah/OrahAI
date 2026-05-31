import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler } from "./middlewares/errorHandler";
import { config } from "./lib/config";

const app: Express = express();

app.set("trust proxy", 1);

// ── Security headers ──────────────────────────────────────────────────────────
// Note: X-Frame-Options is NOT set here because /api/preview/* serves HTML that
// must be embeddable in an iframe (same-origin). preview.ts sets SAMEORIGIN itself.
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (config.nodeEnv === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  next();
});

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // server-to-server / curl
      const allowed = config.cors.origins;
      if (!allowed) return callback(null, true); // dev: allow all
      if (allowed.includes(origin)) return callback(null, true);
      callback(Object.assign(new Error("CORS policy violation"), { statusCode: 403 }));
    },
    credentials: true,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", router);
app.use(errorHandler);

export default app;

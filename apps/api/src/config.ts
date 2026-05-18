import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "4000", 10),
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  apiUrl: process.env.API_URL ?? "http://localhost:4000",
  aiServiceUrl: process.env.AI_SERVICE_URL ?? "http://localhost:8000",

  auth: {
    jwtSecret: process.env.JWT_SECRET ?? "change-me-dev-secret",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
    bcryptRounds: 12,
  },

  db: {
    url: process.env.DATABASE_URL ?? "",
  },

  redis: {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  },

  storage: {
    endpoint: process.env.STORAGE_ENDPOINT ?? "http://localhost:9000",
    accessKey: process.env.STORAGE_ACCESS_KEY ?? "minioadmin",
    secretKey: process.env.STORAGE_SECRET_KEY ?? "minioadmin",
    bucket: process.env.STORAGE_BUCKET ?? "orahai-workspaces",
    region: process.env.STORAGE_REGION ?? "us-east-1",
  },

  ai: {
    openaiKey: process.env.OPENAI_API_KEY ?? "",
    anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.AI_MODEL ?? "gpt-4o",
    serviceApiKey: process.env.AI_SERVICE_API_KEY ?? "internal-dev-key",
  },

  sandbox: {
    dockerSocket: process.env.DOCKER_SOCKET ?? "/var/run/docker.sock",
    image: process.env.SANDBOX_IMAGE ?? "orahai-sandbox:latest",
    cpuQuota: parseInt(process.env.SANDBOX_CPU_QUOTA ?? "50000", 10),
    memoryLimit: process.env.SANDBOX_MEMORY_LIMIT ?? "512m",
    network: process.env.SANDBOX_NETWORK ?? "orahai-sandbox-net",
    timeoutSeconds: parseInt(process.env.SANDBOX_TIMEOUT_SECONDS ?? "30", 10),
    baseDir: process.env.WORKSPACE_BASE_DIR ?? "/tmp/orahai-workspaces",
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    proPriceId: process.env.STRIPE_PRO_PRICE_ID ?? "",
    teamPriceId: process.env.STRIPE_TEAM_PRICE_ID ?? "",
  },

  email: {
    from: process.env.EMAIL_FROM ?? "noreply@orahai.dev",
    resendKey: process.env.RESEND_API_KEY ?? "",
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "100", 10),
  },
} as const;

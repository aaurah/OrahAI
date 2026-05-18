export const config = {
  nodeEnv:  process.env.NODE_ENV ?? "development",
  port:     parseInt(process.env.PORT ?? "4000", 10),
  appUrl:   process.env.APP_URL ?? "http://localhost:3000",

  auth: {
    jwtSecret:    process.env.JWT_SECRET ?? "dev-secret-change-me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  },

  sandboxUrl:          process.env.SANDBOX_URL ?? "http://localhost:5000",
  aiServiceUrl:        process.env.AI_SERVICE_URL ?? "http://localhost:8000",
  aiServiceInternalKey: process.env.AI_SERVICE_INTERNAL_KEY ?? "",
};

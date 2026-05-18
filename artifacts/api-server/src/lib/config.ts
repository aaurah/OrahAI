export const config = {
  nodeEnv:  process.env.NODE_ENV ?? "development",
  port:     parseInt(process.env.PORT ?? "8080", 10),

  auth: {
    jwtSecret:    process.env.JWT_SECRET ?? "dev-secret-change-me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  },

  sandboxUrl:          process.env.SANDBOX_URL ?? "",
  aiServiceUrl:        process.env.AI_SERVICE_URL ?? "",
  aiServiceInternalKey: process.env.AI_SERVICE_INTERNAL_KEY ?? "",
};

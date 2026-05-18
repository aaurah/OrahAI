export const config = {
  nodeEnv:  process.env.NODE_ENV ?? "development",
  port:     parseInt(process.env.PORT ?? "8080", 10),

  auth: {
    jwtSecret:    (() => {
      const secret = process.env.JWT_SECRET;
      if (!secret && process.env.NODE_ENV !== "test") {
        throw new Error("JWT_SECRET environment variable is required but was not set.");
      }
      return secret ?? "test-only-secret";
    })(),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  },

  sandboxUrl:          process.env.SANDBOX_URL ?? "",
  aiServiceUrl:        process.env.AI_SERVICE_URL ?? "",
  aiServiceInternalKey: process.env.AI_SERVICE_INTERNAL_KEY ?? "",

  github: {
    clientId:     process.env.GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    callbackUrl:  process.env.GITHUB_CALLBACK_URL ?? "",
  },
};

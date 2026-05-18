FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY packages/types/package*.json ./packages/types/
RUN npm ci --workspace=apps/web --workspace=packages/types
COPY packages/types/ ./packages/types/
COPY apps/web/ ./apps/web/
RUN npm run build --workspace=apps/web

FROM node:20-alpine AS runner
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
WORKDIR /app
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./public
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/db/package*.json ./packages/db/
COPY packages/types/package*.json ./packages/types/

RUN npm ci --workspace=apps/api --workspace=packages/db --workspace=packages/types

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN npm run build --workspace=packages/db
RUN npm run build --workspace=apps/api

FROM node:20-alpine AS runner

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 apiuser

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./

USER apiuser

EXPOSE 4000

CMD ["node", "dist/index.js"]

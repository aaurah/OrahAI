FROM node:20-alpine

# Add Python for multi-language support
RUN apk add --no-cache python3 py3-pip bash

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY dist/ ./dist/

# Sandboxed user — no root
RUN addgroup -S sandbox && adduser -S sandbox -G sandbox
USER sandbox

EXPOSE 5000
CMD ["node", "dist/index.js"]

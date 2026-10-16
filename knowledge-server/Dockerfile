# syntax=docker/dockerfile:1
FROM node:24-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:24-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Prepare writable directories for non-root user
RUN mkdir -p /app /var/lib/knowledge-server/transformers_cache /var/lib/knowledge-server/snapshots \
    && chown -R node:node /app /var/lib/knowledge-server

USER node

COPY --chown=node:node package*.json ./
RUN npm install --omit=dev --omit=optional

COPY --chown=node:node --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/main.js"]

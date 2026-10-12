# syntax=docker/dockerfile:1
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm config set strict-ssl false && npm install --ignore-scripts --omit=optional

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Run as non-root user
USER node

COPY --chown=node:node package*.json ./
RUN npm config set strict-ssl false && npm install --ignore-scripts --omit=dev --omit=optional

COPY --chown=node:node --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/main.js"]

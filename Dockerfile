# syntax=docker/dockerfile:1

# ---------- Stage 1: build client + server ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

COPY tsconfig.json ./
COPY client client
COPY server server

RUN npm run build --workspace=client \
 && npm run build --workspace=server

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/client/dist client/dist
COPY --from=build /app/server/dist server/dist

# Automation storage (data/automations.json). Persist it by mounting a volume at /app/data:
# docker-compose.yml does this for NAS deployments; on Railway attach a volume at /app/data.
# There is deliberately no VOLUME instruction here: Railway rejects Dockerfiles that use it.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/api/health" > /dev/null || exit 1

CMD ["node", "server/dist/index.js"]

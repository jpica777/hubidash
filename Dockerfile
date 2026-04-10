# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json* ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install ALL dependencies (including devDeps needed for build)
RUN npm ci --ignore-scripts

# Copy source
COPY client ./client
COPY server ./server
COPY tsconfig.json ./

# Build React SPA → /app/dist/
RUN npm run build -w client

# Compile server TypeScript → /app/server/dist/
RUN npm run build -w server

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy workspace manifests and install only production deps
COPY package.json package-lock.json* ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/dist ./server/dist

# Non-root user for security
RUN addgroup -S hubidash && adduser -S hubidash -G hubidash
USER hubidash

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server/dist/index.js"]

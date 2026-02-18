# ── Stage 1: Builder ──────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# 1) Copy workspace manifests + lockfile for deterministic install
COPY package.json package-lock.json ./
COPY apps/auction-service/package.json ./apps/auction-service/
COPY packages/shared/package.json ./packages/shared/

# 2) Install all deps (dev included – needed for nest build & tsc)
RUN npm ci

# 3) Copy source code
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/auction-service ./apps/auction-service

# 4) Build shared first (apps depend on it), then the app
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/auction-service

# 5) Prune devDependencies for a leaner runtime image
RUN npm prune --production

# ── Stage 2: Runtime ──────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Preserve monorepo layout so workspace symlinks keep working:
#   node_modules/@nettapu/shared  →  ../../packages/shared
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Shared package (symlink target)
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# App build output
COPY --from=builder /app/apps/auction-service/package.json ./apps/auction-service/
COPY --from=builder /app/apps/auction-service/dist ./apps/auction-service/dist

WORKDIR /app/apps/auction-service
EXPOSE 3001
CMD ["node", "dist/main.js"]

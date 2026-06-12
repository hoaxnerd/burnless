# ── Burnless Next.js App — Multi-stage Docker build ──────────────────────────
# Stage 1: Install dependencies
# Stage 2: Build the application
# Stage 3: Production runner (minimal image)
#
# Build:  docker build -t burnless-web .
# Run:    docker run -p 3000:3000 --env-file .env burnless-web

# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:24-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app

# Copy lockfile and workspace config first (better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/ai/package.json ./packages/ai/
COPY packages/engine/package.json ./packages/engine/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/ai/node_modules ./packages/ai/node_modules
COPY --from=deps /app/packages/engine/node_modules ./packages/engine/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules

# Copy all source
COPY . .

# Build needs env vars at build time for Next.js public vars
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_STANDALONE=true

# Next.js collects telemetry — disable in Docker builds
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# ── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application (standalone output)
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Copy workspace packages (needed at runtime for server-side imports)
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules

# Copy cron worker script
COPY --from=builder /app/scripts ./scripts

USER nextjs
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]

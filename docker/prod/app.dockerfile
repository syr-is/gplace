# syntax=docker/dockerfile:1
# Build context = gplace repo root.
#
# Pinned to node:20-alpine3.17 because Prisma 4.14's musl query engine
# (libquery_engine-linux-musl.so.node) is compiled against libssl 1.1.
# Alpine 3.18+ dropped the libssl1.1 apk package, so newer node:20-alpine
# images can't load the engine — manifests as
# "Error loading shared library libssl.so.1.1" during build/runtime.
# Alpine 3.17 still ships it.

# ---- Dependencies ----
FROM node:20-alpine3.17 AS deps

# git: one transitive dep (js-function-reflector via colorthief) is fetched by
# URL, so yarn install needs the git binary.
# libssl1.1: required by Prisma 4.14's musl query engine.
RUN apk add --no-cache git openssl libssl1.1

WORKDIR /app
COPY app/package.json app/yarn.lock ./
RUN yarn install --frozen-lockfile

# ---- Builder ----
FROM node:20-alpine3.17 AS builder

# libssl1.1 needed here too — SvelteKit's adapter-node "analyse" step imports
# server modules, instantiates PrismaClient, which loads the query engine.
RUN apk add --no-cache git openssl libssl1.1

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY app/ ./

# Generate Prisma client + zmodel-derived schema, then build the SvelteKit app.
# Vite SSR build can OOM on small VPS at default 2GB heap.
RUN npx zenstack generate \
    && npx prisma generate \
    && NODE_OPTIONS="--max-old-space-size=4096" yarn build

# ---- Production ----
FROM node:20-alpine3.17 AS production

ENV NODE_ENV=production
ENV PORT=5173

# openssl + libssl1.1 are needed at runtime by Prisma's query engine.
RUN apk add --no-cache openssl libssl1.1

WORKDIR /app

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 sveltekit

# Copy build artifacts, runtime node_modules, and the Prisma schema (needed by `prisma db push`).
COPY --from=builder --chown=sveltekit:nodejs /app/build ./build
COPY --from=builder --chown=sveltekit:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=sveltekit:nodejs /app/prisma ./prisma
COPY --from=builder --chown=sveltekit:nodejs /app/package.json ./

USER sveltekit

EXPOSE 5173

# Hit /login because / depends on board data (returns 500 before the first board is created
# during the documented bootstrap flow). /login is always reachable.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + process.env.PORT + '/login', (r) => {process.exit(r.statusCode < 500 ? 0 : 1)}).on('error', () => process.exit(1))" || exit 1

# `prisma db push --skip-generate` syncs the schema to the managed Postgres on boot.
# Skip-generate avoids writes to node_modules (incompatible with read-only FS).
# Direct .bin path avoids npx cache writes (also incompatible with read-only FS).
# This is additive-only by default; destructive schema changes need a manual --force-reset --accept-data-loss before redeploy.
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --skip-generate && HOST=0.0.0.0 PORT=${PORT:-5173} node build"]

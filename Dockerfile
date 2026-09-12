# syntax=docker/dockerfile:1.7
# Awwtomation — multi-stage build.
#
#   docker build --target runner -t awwtomation-web \
#     --build-arg NEXT_PUBLIC_APP_URL=https://app.example.com \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... .
#   docker build --target worker -t awwtomation-worker .
#
# NEXT_PUBLIC_* values are inlined into the JavaScript bundle at build time, so
# they are build args here, not runtime env. Everything else (DATABASE_URL,
# secrets…) is read at runtime from the container environment.
ARG NODE_VERSION=20

# ── base ──────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
# Prisma's query engine links against openssl; libc6-compat keeps the few
# glibc-built native modules working on musl.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── deps: full install (dev deps included — the build and the worker need them)
FROM base AS deps
COPY package.json package-lock.json ./
# postinstall runs `prisma generate`, which needs the schema present.
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ── builder: next build with standalone output ────────────────────────────────
FROM base AS builder
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
# Fail early: an image built without these renders a login page that cannot sign in.
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" && test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" && test -n "$NEXT_PUBLIC_APP_URL" \
  || (echo "ERROR: pass --build-arg NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY" && exit 1)
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` = prisma generate && next build. Regenerating here keeps the
# client in sync with the schema even if the deps layer was cached.
RUN npm run build

# ── runner: the web app (default target) ──────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
ARG GIT_COMMIT_SHA
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Belt and braces: file tracing normally copies the Prisma engine, but a
# missing .so.node only shows up as a 500 on first query.
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# ── worker: queue worker + Prisma CLI for migrations/seeds ────────────────────
# Runs the TypeScript source with tsx (a runtime dependency), so no separate
# compile step and the `@/` path alias keeps working. Also the image to use for
# one-off commands:  prisma migrate deploy, tsx prisma/seed.ts.
FROM base AS worker
ENV NODE_ENV=production
ARG GIT_COMMIT_SHA
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
RUN npx prisma generate
USER node
CMD ["./node_modules/.bin/tsx", "worker/index.ts"]

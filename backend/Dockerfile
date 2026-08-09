# CoreStudio backend — production image (Next.js standalone output).
# Build context is the REPO ROOT (npm workspaces need both package.jsons):
#   docker build -f backend/Dockerfile -t corestudio-backend .
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY admin/package.json ./admin/package.json
COPY backend/prisma ./backend/prisma
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY backend ./backend
RUN npx prisma generate --schema=backend/prisma/schema.prisma
# Dummy vars so the build's static analysis has something to read;
# real values come from the environment at runtime
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-time-placeholder"
RUN npm run build --workspace=backend

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# The standalone server always listens on $PORT (default 3000) regardless of
# the --port flag used elsewhere for `next dev`/`next start` — without this,
# it'd listen on 3000 inside the container while everything else expects 4000.
ENV PORT=4000
RUN addgroup -S app && adduser -S app -G app

# outputFileTracingRoot is the monorepo root (Turbopack needs node_modules/next
# resolvable from there), so backend/.next/standalone mirrors the full
# monorepo layout (backend/server.js, node_modules/, etc.) — same as admin.
COPY --from=builder /app/backend/.next/standalone/. ./
COPY --from=builder /app/backend/.next/static ./backend/.next/static
COPY --from=builder /app/backend/prisma ./backend/prisma
# Standalone's own node_modules only has what the *Next.js server* needs at
# runtime — too thin for the Prisma CLI (needed at boot for `prisma migrate
# deploy`), which pulls in more transitive deps than just prisma/@prisma
# (e.g. @prisma/config -> effect). Replace it with the full install instead
# of cherry-picking, since the full one is a strict superset.
RUN rm -rf ./node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY backend/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && chown -R app:app /app

USER app
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]

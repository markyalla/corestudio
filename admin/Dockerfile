# CoreStudio admin — production image (Next.js standalone output).
# Build context is the REPO ROOT (this app imports source from ../backend):
#   docker build -f admin/Dockerfile -t corestudio-admin .
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
COPY admin ./admin
RUN npx prisma generate --schema=backend/prisma/schema.prisma
# Dummy vars so the build's static analysis has something to read;
# real values come from the environment at runtime
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-time-placeholder"
ENV AUTH_URL="http://localhost:3000"
RUN npm run build --workspace=admin

# outputFileTracingRoot is the monorepo root, so admin/.next/standalone
# mirrors the full monorepo layout (admin/server.js, node_modules/, etc.)
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/admin/.next/standalone/. ./
COPY --from=builder /app/admin/.next/static ./admin/.next/static
COPY --from=builder /app/admin/public ./admin/public
RUN chown -R app:app /app

USER app
EXPOSE 3000
CMD ["node", "admin/server.js"]

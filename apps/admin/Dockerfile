# PARADA Admin (Next.js) — production image.
#
# Build from the REPOSITORY ROOT:
#   docker build -f apps/admin/Dockerfile -t parada-admin .
#
# API_BASE_URL is read at request time by the Next.js server (server-only,
# never bundled for the browser), so it is supplied at run time, not here.

# ---- build -----------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY scripts/ensure-expo-link.cjs scripts/
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/types/package.json packages/types/
COPY services/api/package.json services/api/
COPY services/vision/package.json services/vision/
RUN npm ci -w @parada/admin -w @parada/types -w @parada/config \
      --include-workspace-root --no-audit --no-fund

COPY packages/config packages/config
COPY packages/types packages/types
COPY apps/admin apps/admin

# NEXT_OUTPUT_STANDALONE=1 switches next.config.mjs to `output: "standalone"`
# (self-contained server + traced node_modules) for this image only.
ENV NEXT_OUTPUT_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx turbo run build --filter=@parada/admin

# ---- run -------------------------------------------------------------------
FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Standalone output keeps the monorepo layout: the server lives at
# apps/admin/server.js and expects .next/static and public beside it.
COPY --from=build /app/apps/admin/.next/standalone ./
COPY --from=build /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build /app/apps/admin/public ./apps/admin/public

EXPOSE 3000
USER node
WORKDIR /app/apps/admin
CMD ["node", "server.js"]

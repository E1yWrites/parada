# PARADA API — production image.
#
# Build from the REPOSITORY ROOT (npm workspaces need the root lockfile):
#   docker build -f services/api/Dockerfile -t parada-api .
#
# Runtime configuration comes only from the environment (see
# .env.online.example); nothing secret is baked into the image.
#
# Single stage on purpose: the runtime keeps the Prisma CLI so the same image
# can apply migrations (`npm run migrate:deploy -w @parada/database`) before
# the API starts. The install/build steps below are the ones verified on a
# Linux host for the capstone-online branch (see docs/how-to/deploy.md).

FROM node:20-bookworm-slim

# openssl: Prisma's query engine links against libssl.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install with only the manifests present so this layer is cached until a
# dependency changes. Every workspace manifest must exist for npm to resolve
# the lockfile, even the ones we do not install.
COPY package.json package-lock.json turbo.json ./
COPY scripts/ensure-expo-link.cjs scripts/
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/types/package.json packages/types/
COPY services/api/package.json services/api/
COPY services/vision/package.json services/vision/
RUN npm ci -w @parada/api -w @parada/database -w @parada/types -w @parada/config \
      --include-workspace-root --no-audit --no-fund

COPY packages/config packages/config
COPY packages/types packages/types
COPY packages/database packages/database
COPY services/api services/api

# prisma generate (inside @parada/database's build) runs here, on Linux, so the
# generated client matches the image's OS/OpenSSL.
RUN npx turbo run build --filter=@parada/api

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4100
EXPOSE 4100

USER node
# services/api is the working directory so a mounted .env (optional) is found;
# the platform-provided PORT is honoured by services/api/src/config/env.ts.
WORKDIR /app/services/api
CMD ["node", "dist/index.js"]

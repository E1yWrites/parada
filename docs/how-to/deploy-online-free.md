# How to deploy — ONLINE with free options

Goal: an evaluator anywhere can open Admin in a browser and use the mobile
app, against a production-like PostgreSQL, with Vision demonstrable —
without paying for hosting. Two routes; pick one.

| Route | Cost | Fit | Trade-offs |
|---|---|---|---|
| **1. One free cloud VM + `docker-compose.online.yml`** | ₱0 for the VM on an always-free tier; a domain is the only thing that may cost money | Closest to the LOCAL profile, keeps SSE and the API on one always-on process | You administer a Linux box; always-free capacity is small and can be reclaimed |
| **2. Free tiers of managed platforms** (web services + free Postgres) | ₱0 on free plans | Zero server administration, git-push deploys | Free web services sleep when idle (first request after sleep takes ~30–60 s and drops SSE until reconnect); free databases have small quotas or expire; plans change — verify each provider's current terms |

Free-tier terms quoted here are as understood at the time of writing
(2026). Confirm them on each provider's pricing page before relying on them
for a scheduled demonstration. Nothing below requires a specific vendor; the
application only needs a Node 20 server, a Next.js server, PostgreSQL 16 and
HTTPS.

Everything in this guide is an **operator action** on the operator's own
accounts — nothing here is created automatically and no credential lives in
the repository. Reference for variables/commands: [deploy.md](./deploy.md).

## Before either route

1. **Domain / hostnames.** Route 1 needs two DNS names (`api.…`, `admin.…`)
   pointing at the VM: a cheap domain (US$2–15/year) or a free dynamic-DNS
   subdomain (DuckDNS, FreeDNS) — Caddy issues Let's Encrypt certificates
   for either. Route 2 gives you `*.onrender.com`-style hostnames for free.
2. **SMTP.** Registration and password reset send real mail. A free
   transactional-mail plan (Brevo, Resend, Mailjet, etc.) or a Gmail account
   with an *app password* works with `MAIL_TRANSPORT=smtp`. Put the values in
   `SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM`.
3. **Secrets.** Generate `JWT_SECRET` and `CAMERA_API_KEY` once:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.
4. **Expo account** for the mobile build (`npx eas init`). EAS's free plan
   includes a limited number of cloud builds per month; `npx eas build --local`
   or `npx expo run:android --variant release` on a machine with the Android
   SDK avoids the quota.

## Route 1 — free cloud VM + Docker Compose

Providers with an always-free VM tier at the time of writing include Oracle
Cloud (Always Free compute: up to 4 Arm OCPUs / 24 GB RAM shared across
instances, or small x86 instances) and the trial credits of GCP/AWS/Azure
(time-limited, not "always free"). An Arm VM is fine: every image here is
multi-arch (`node`, `python`, `postgres`, `caddy`).

On the VM (Ubuntu 22.04/24.04):

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER && newgrp docker

# 2. Open 80/443 in the provider's firewall/security list AND on the VM
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable

# 3. Code + configuration
git clone <repo> parada && cd parada
cp .env.online.example .env.online
nano .env.online     # API_DOMAIN, ADMIN_DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD, DATABASE_URL (postgres:5432),
                     # JWT_SECRET, CAMERA_API_KEY, SMTP_*, MAIL_FROM, EXPO_PUBLIC_API_URL, CAMERA_*

# 4. Build + start: postgres -> migrate (prisma migrate deploy) -> api -> admin -> caddy
docker compose --env-file .env.online -f docker-compose.online.yml up -d --build
docker compose --env-file .env.online -f docker-compose.online.yml logs -f migrate api

# 5. First admin (deploy.md §4.3), inside the API container
docker compose --env-file .env.online -f docker-compose.online.yml exec -w /app/packages/database \
  -e PARADA_SEED_ADMIN_PASSWORD='<strong>' -e PARADA_SEED_USER_PASSWORD='<strong>' api npx ts-node src/seed/index.ts
```

Checks: `curl https://api.<domain>/health`, open `https://admin.<domain>`,
log in, Zones page. Caddy's log (`docker compose … logs caddy`) shows the
certificate issuance; if it fails, DNS is not pointing at the VM yet.

Memory: API ≈ 150 MB, Admin ≈ 150 MB, PostgreSQL ≈ 50 MB idle. The optional
`vision-demo` container (EasyOCR + CPU torch) needs ≈ 1.5–2 GB RAM and ~2 GB
disk; skip it on a 1 GB instance and demonstrate Vision from the on-site
host (hybrid) or with the Admin Simulator instead.

Updates: `git pull && docker compose --env-file .env.online -f docker-compose.online.yml up -d --build`
(the `migrate` service re-runs `prisma migrate deploy`; take
`docker compose … exec postgres pg_dump -U parada parada > backup.sql` first).

## Route 2 — free tiers of managed platforms

Split the four services across providers' free plans. Example combination
(any provider with the same capabilities is fine):

| Service | Free option (verify current terms) | Settings |
|---|---|---|
| PostgreSQL | Neon or Supabase free Postgres (≈0.5 GB), or the platform's own free database (Render's free Postgres expires after a period — check) | Copy the `postgresql://…?sslmode=require` URL into `DATABASE_URL` (append `&schema=public`) |
| API | Render free Web Service, Koyeb free instance, Fly.io small machine | Root directory: repo root. Build: `npm ci -w @parada/api -w @parada/database -w @parada/types -w @parada/config --include-workspace-root && npm run build -w @parada/api`. Pre-deploy/release command: `npm run migrate:deploy -w @parada/database`. Start: `cd services/api && node dist/index.js`. Health check path `/health`. Env: everything in the API section of `.env.online.example`; the platform injects `PORT`; set `TRUST_PROXY=1` |
| Admin | Same kind of free Web Service (a persistent Node process — **not** a serverless/edge platform: the SSE relay at `/api/realtime` and the API proxy are long-lived server routes) | Build: `npm ci -w @parada/admin -w @parada/types -w @parada/config --include-workspace-root && npm run build -w @parada/admin`. Start: `npm run start -w @parada/admin` (Next honours the platform's `PORT`). Env: `NODE_ENV=production`, `API_BASE_URL=https://<api hostname>` (or the platform's private URL) |
| Vision | Stays on-site (hybrid) — no cloud host needed | `PARADA_API_URL=https://<api hostname>`, `CAMERA_API_KEY` |

Both web services can also be deployed from the Dockerfiles
(`services/api/Dockerfile`, `apps/admin/Dockerfile`, context = repo root) if
the platform prefers images.

Free-plan behaviour to explain to evaluators:

- **Sleep on idle**: the first request after ~15 min idle takes 30–60 s;
  Admin's realtime stream reconnects and resyncs by itself, the mobile app
  retries. Warm both services a minute before a demo.
- **Ephemeral disk** is irrelevant (PARADA writes nothing to disk).
- **Single instance** is required anyway (in-memory rate limits/SSE hub), so
  the free plan's one-instance limit is not a constraint.
- **Database expiry/quota**: export with `pg_dump` before the free window
  ends; recreate and `prisma migrate deploy` + restore if needed.

## Mobile for either route

```bash
cd apps/mobile
npx eas init
npx eas env:create --scope project --name EXPO_PUBLIC_API_URL --value https://<api hostname> --visibility plaintext --environment preview
npx eas build --platform android --profile preview       # installable APK link to share with evaluators
```

Or locally without EAS quota: `EXPO_PUBLIC_API_URL=https://<api hostname> npx expo run:android --variant release`.

## Vision for either route

- Preferred: on-site host with a real camera (hybrid) —
  [deploy-local.md](./deploy-local.md) §2–§3 with
  `PARADA_API_URL=https://<api hostname>`.
- No camera available: replay a synthetic clip through the real pipeline
  from any machine with the venv:
  `CAMERA_SOURCE=file CAMERA_FILE_PATH=tests/fixtures/videos/clear_plate.mp4 CAMERA_IDENTIFIER=… CAMERA_ZONE_ID=… PARADA_API_URL=https://… CAMERA_API_KEY=… npm run camera -w @parada/vision -- run`
  (generate the clip once with `python tests/fixtures/generate_video.py`), or
  use Admin → Simulator, which drives the real occupancy pipeline as an
  ADMIN. Neither path fabricates OCR output.

## What remains manual (no repo can do these)

Creating the accounts, the domain/DNS records, the SMTP account, the Expo
project, pasting the environment values, and running the commands above.
Record the outcome in deploy.md §15.

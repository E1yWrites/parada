# How to deploy — PARADA deployment profiles and production runbook

PARADA is **one application** with three deployment profiles selected purely
by infrastructure and environment configuration. No business rule, domain
invariant, or security control differs between them: the same API, Admin,
Vision and Mobile code, the same Prisma migrations, the same HttpOnly-cookie
Admin auth and SecureStore mobile auth.

| Profile | Where things run | Guide |
|---|---|---|
| **LOCAL** (on-premise, the research architecture) | PostgreSQL, API, Admin and Vision on the facility LAN; phones on Wi-Fi; cameras over RTSP on the LAN. Optionally reachable from outside through a tunnel. | [deploy-local.md](./deploy-local.md) |
| **ONLINE** | API, Admin and PostgreSQL on remote hosts behind HTTPS; phones and evaluators anywhere. | [deploy-online-free.md](./deploy-online-free.md), [deploy-online-paid.md](./deploy-online-paid.md) |
| **HYBRID** (recommended for the capstone) | ONLINE API/Admin/DB **plus** Vision on the facility LAN posting events over HTTPS. Cameras and raw frames never leave the site. | §A.3 below + the online guides |

No `PARADA_DEPLOYMENT_MODE` variable exists on purpose: the existing
variables already separate the profiles cleanly (`NODE_ENV`, the URLs, and
`TRUST_PROXY`), so a mode switch would only duplicate them.

**Status.** Phase 15 (Deployment) is still PENDING in
[`docs/architecture/roadmap.md`](../architecture/roadmap.md): this branch
(`capstone-online`) makes every profile *deployable* and verifies the build,
migration and start-up path on Linux, but no hosting account, domain, DNS,
TLS certificate, production database, SMTP account, camera placement or EAS
project has been created — those are operator steps listed in each guide.
Never report a deployment as complete until §15 ("Deployment log") has been
filled in from a real run.

## A. The three profiles

### A.1 Local deployment (everything inside the facility)

```
Camera ──RTSP (LAN)──▶ Vision (LAN host) ──HTTP/HTTPS──▶ API (LAN host) ──▶ PostgreSQL (LAN host)
                                                            ▲            ▲
                                        phones on Wi-Fi ────┘            └──── Admin (Next.js, LAN host) ◀── browsers
```

- Configuration: [`.env.local.example`](../../.env.local.example).
- Nothing crosses the Internet. RTSP credentials, plates and occupancy stay
  on the LAN.
- The API binds `HOST=0.0.0.0` so phones reach it at the host's LAN address;
  `EXPO_PUBLIC_API_URL` is that address.
- `TRUST_PROXY` stays unset (no proxy in front of the API).
- To let an evaluator use the LAN deployment from outside, put a tunnel in
  front of the API and Admin (Cloudflare Tunnel, ngrok, Tailscale) — then
  set `TRUST_PROXY=1`. Details in [deploy-local.md](./deploy-local.md).

### A.2 Online deployment (API, Admin, DB remote)

```
phones ──HTTPS──▶ ┐
                  ├─▶ TLS edge ──▶ API (Node) ──▶ PostgreSQL
browsers ──HTTPS─▶ ┘      └────────▶ Admin (Next.js) ──HTTP (private)──▶ API
                              ▲
on-site Vision ──HTTPS + X-API-Key
```

- Configuration: [`.env.online.example`](../../.env.online.example).
- Four independently deployable services: API (Node production server),
  Admin (Next.js production server), PostgreSQL, Vision (Python process).
  Mobile is built separately with EAS. Dockerfiles exist for API, Admin and
  Vision; a Node/Python host without Docker works equally (§5–§7).
- `TRUST_PROXY` is set to the proxy hop count (normally `1`) because a TLS
  proxy or load balancer always sits in front online.
- Provider-neutral: any host that runs a Node 20 server, a Next.js server, a
  PostgreSQL 16 database and a persistent Python process. Provider examples
  live only in the guides.

### A.3 Hybrid deployment (recommended for the capstone demonstration)

```
              LOCAL FACILITY                         │            CLOUD
Camera ──RTSP──▶ Vision (on-site host) ──HTTPS + X-API-Key──▶ API ──▶ PostgreSQL
                  (real OCR, frames in memory only)  │            ▲
                                                     │   phones / Admin over HTTPS
```

- Privacy: the camera stream and every raw frame stay on the facility LAN.
  Only the normalized vision event (`sourceEventId`, `cameraIdentifier`,
  `eventType`, `detectedPlate`, `normalizedPlate`, `ocrConfidence`,
  `detectedAt`) crosses the Internet, authenticated with `CAMERA_API_KEY`
  over TLS. Plates and occupancy are then stored off-site — that is the
  trade-off compared with LOCAL, and it must be acceptable to the
  establishment.
- Vision configuration is the LOCAL vision section with
  `PARADA_API_URL=https://<api-domain>`. Nothing else changes; retries and
  `sourceEventId` idempotency behave exactly as on the LAN.

### A.4 Camera connectivity limitation

A cloud-hosted Vision process **cannot** reach cameras on a private
facility LAN. Two supported answers:

- **A (preferred): Vision stays on-site** and sends HTTPS events to the
  online API — the hybrid profile above.
- **B: a VPN** (site-to-site, or a mesh such as Tailscale/WireGuard) makes
  the camera subnet routable from the cloud host, and Vision runs there.

Never expose RTSP cameras directly to the public Internet, and never put
RTSP credentials anywhere but the vision runtime's environment.

### A.5 Raw image storage and retention

The release candidate stores **no camera frames**: Vision processes each
frame in memory and forwards only the normalized event; the API has no image
ingestion endpoint. The only binary data persisted is the optional user
avatar, stored as bytes in PostgreSQL (`user_avatars`). There is therefore
nothing to move to object storage in any profile, and no retention policy is
needed beyond the database's own backups. If frame retention is ever added
it must be a Vision-side, LOCAL-only concern with an explicit retention
window.

### A.6 Recommended capstone setup

1. ONLINE API + Admin + PostgreSQL on one host with
   `docker-compose.online.yml` (free VM or a small paid VPS — see the online
   guides), two DNS names, Caddy for automatic HTTPS.
2. Mobile built once with `EXPO_PUBLIC_API_URL=https://<api-domain>` (EAS
   `preview` profile → installable APK for evaluators).
3. Vision on-site (hybrid) against a real camera when available; otherwise
   the `vision-demo` compose profile replays a synthetic video through the
   real OCR pipeline, or an ADMIN uses the existing Simulator page
   (`/simulator`, backend `POST /simulator/run`) to drive the real occupancy
   pipeline. Neither fabricates OCR results in production code.
4. Keep the LOCAL profile runnable on the facility machine for the research
   demonstration — same commit, different `.env`.

---

# B. Runbook reference

## 1. Topology the code assumes (all profiles)

```
drivers' phones ──HTTPS──▶ reverse proxy ──▶ API (Node, :4100) ──▶ PostgreSQL
admin browsers ──HTTPS──▶ reverse proxy ──▶ Admin (Next.js, :3000) ──HTTP──▶ API
vision runtime (Python, one process per camera) ──X-API-Key──▶ API
```

Facts that constrain the layout (all from code, none optional):

- **One API process.** Rate limits and the SSE hub are in-memory and
  per-process (`services/api/src/http/rateLimit.ts`,
  `docs/api/README.md` "Scope limit"). Do not run the API replicated behind
  a load balancer.
- **TLS terminates in front of the API and Admin.** `services/api/src/index.ts`
  listens on plain HTTP; nothing in the repo configures TLS. The Admin
  session cookie is `secure` whenever `NODE_ENV=production`
  (`apps/admin/lib/auth.ts`), so an Admin served over plain HTTP in
  production cannot log in at all — this is intended.
- **The browser never talks to the API.** Admin pages call same-origin
  `/api/proxy/*` and `/api/realtime`; the Next.js server attaches the JWT
  from the HttpOnly cookie. Consequently the API has no CORS middleware and
  needs none. Mobile calls the API directly (native fetch, no CORS).
- **Vision never touches the database.** Its single downstream call is
  `POST /zones/:zoneId/events` with `X-API-Key` (`services/vision/app/api_client.py`).
  The camera runtime (`python -m app.camera.cli run`) is self-contained; the
  FastAPI `/detect` service on `:8001` is optional (manual/diagnostic use).
- **Reverse proxy requirements.** Forward `X-Forwarded-For` to the API and
  set `TRUST_PROXY` to the hop count (see §3); disable response buffering
  and set a read/idle timeout above 25 s on `/realtime/stream` (API) and
  `/api/realtime` (Admin) — the API sends an SSE heartbeat every 25 s
  (`services/api/src/routes/realtime.ts`).

## 2. Prerequisites

| Requirement | Evidence / notes |
|---|---|
| Node.js 20 LTS or newer, npm 9+ | `package.json` declares `packageManager: npm@9.2.0`; the release candidate was built and tested with Node 24.15.0 / npm 12.0.2 |
| Python 3.11 | `docs/how-to/run-and-test-locally.md`; the vision venv used for Phase 14 is 3.11.9 |
| PostgreSQL 16 or newer | `docker-compose.yml` uses `postgres:16-alpine`; development ran on embedded PostgreSQL 18.4. Only the default `plpgsql` extension is required (verified on a fully migrated database) |
| Outbound internet from the vision host, once | EasyOCR downloads `craft_mlt_25k.pth` + `english_g2.pth` (~94 MB) to `~/.EasyOCR/model` on first run; copy that directory instead if the host is offline |
| An SMTP account | `MAIL_TRANSPORT=console` is refused in production (`services/api/src/mail/mailer.ts`) |
| A TLS-terminating reverse proxy and a hostname for the API and for Admin | ONLINE/HYBRID: `deploy/Caddyfile` via compose, or the platform's edge. LOCAL: optional (tunnel) — see §1 and the guides |
| A process manager that captures stdout/stderr and restarts on exit | `docker-compose.online.yml` (restart policies + Docker logs) or systemd units as shown in [deploy-local.md](./deploy-local.md); a managed platform provides its own |

`prisma generate` compiles the client for the OS it runs on
(`packages/database/prisma/schema.prisma` sets no `binaryTargets`), so run
`npm ci && npm run build` **on the production host OS**, not on a Windows
workstation for a Linux server.

## 3. Environment variables

Names only. Never commit a `.env`; `.gitignore` already excludes every
`.env*` except `.env.example`. Generate secrets with
`node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.

### API (`services/api/.env` or the process environment)

| Variable | Required in production | Notes |
|---|---|---|
| `NODE_ENV` | yes, `production` | Turns on every production guard below |
| `DATABASE_URL` | yes | Production PostgreSQL; startup throws `Missing required environment variable: DATABASE_URL` without it |
| `JWT_SECRET` | yes | Long random secret; startup throws without it |
| `JWT_ISSUER`, `JWT_EXPIRES_IN` | no | Defaults `parada-api`, `1d` |
| `CAMERA_API_KEY` | yes | Startup throws `Missing required environment variable: CAMERA_API_KEY (required outside development).` when `NODE_ENV=production` and it is blank. Same value goes to every vision runtime |
| `MAIL_TRANSPORT` | yes, `smtp` | `console`/`memory` throw `MAIL_TRANSPORT=<x> is not allowed in production.` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | yes | `SMTP_HOST` and `MAIL_FROM` are mandatory for the smtp transport |
| `APP_NAME`, `MAIL_ORGANIZATION`, `MOBILE_APP_SCHEME` | no | Mail branding; `MOBILE_APP_SCHEME` must equal `apps/mobile/app.json` `scheme` (`parada`) |
| `PORT`, `HOST` | no | Defaults `4100`, `0.0.0.0` |
| `TRUST_PROXY` | yes when behind a reverse proxy | Hop count, normally `1`. Without it every client shares the proxy's address and therefore one 10-attempt/minute login budget |
| `OCR_PLATE_CONFIDENCE_THRESHOLD` | no | Default `0.5`; must equal the vision runtime's value |
| `AUTH_RATE_LIMIT`, `CAMERA_EVENT_RATE_LIMIT`, `ADMIN_RATE_LIMIT`, `REALTIME_MAX_CONNECTIONS_PER_USER`, `REALTIME_REPLAY_BUFFER_SIZE` | no | Defaults `10`, `300`, `120`, `5`, `500` per `services/api/.env.example` |

All three production guards were exercised against the built release
candidate (`NODE_ENV=production node services/api/dist/index.js` from a
directory with no `.env`): each missing value exits with code 1 and the
message above, before any port is opened.

### Admin (`apps/admin/.env.local` or the process environment)

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes, `production` (`next start` sets it) | Makes the session cookie `secure` |
| `API_BASE_URL` | yes | Server-only URL of the API as reachable **from the Admin server** (e.g. `http://127.0.0.1:4100` on the same host). Falls back to `http://localhost:4100` if unset — set it explicitly |
| `PORT` | no | `next start -p <port>`; default 3000 |

There is no `NEXT_PUBLIC_*` variable; the browser bundle contains no API URL
and no token.

### Vision (one environment per camera process)

Vision reads `os.environ` only (`services/vision/app/config.py`); there is no
dotenv loader. Use `services/vision/.env.example` as the template for a
systemd `EnvironmentFile=`, a container env, or `set -a; . ./.env; set +a`.

| Variable | Required | Notes |
|---|---|---|
| `PARADA_API_URL` | yes | API base URL as reachable from the vision host |
| `CAMERA_API_KEY` | yes | Must equal the API's value |
| `CAMERA_IDENTIFIER` | yes | Must equal the identifier registered in Admin → Cameras |
| `CAMERA_ZONE_ID` | yes for `run` | Zone id the camera is registered under; the API answers 409 if they disagree |
| `CAMERA_SOURCE` | yes | `usb` \| `rtsp` \| `file` |
| `CAMERA_DEVICE_INDEX` / `VIDEO_SOURCE` / `CAMERA_FILE_PATH` | one, per source | RTSP credentials may be embedded in `VIDEO_SOURCE`; they are redacted from logs and never stored |
| `OCR_PLATE_CONFIDENCE_THRESHOLD` | no | Must equal the API's value |
| `VISION_PROCESS_FPS`, `OBSERVATION_COOLDOWN_SECONDS`, `CAMERA_RECONNECT_DELAY_SECONDS`, `MAX_CONSECUTIVE_READ_FAILURES`, `MAX_FORWARD_ATTEMPTS`, `MAX_CAMERA_RECONNECTS` | no | Defaults `2`, `5`, `2`, `10`, `3`, `100` |

### Mobile (build-time only)

| Variable | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | yes | Public **HTTPS** URL of the API, baked into the bundle at build time (`apps/mobile/lib/api/client.ts`, `apps/mobile/src/lib/realtime.ts`). Android release builds block cleartext HTTP by default, so a plain `http://` URL produces an app that cannot log in |

`EXPO_PUBLIC_*` values ship inside the app; never put a secret there.

### Establishment, fees, guest policy, operating hours, coordinates

These are **not** environment variables. They live in the database
(`EstablishmentConfig`, `ParkingZone.navigationLat/Lng`) and are edited in
Admin → Settings and Admin → Zones after first login. Code defaults come
from `packages/config/src/index.ts` (`DEFAULT_PARKING_FEE`,
`DEFAULT_GUEST_POLICY`, `DEFAULT_VIOLATION_POLICIES`,
`DEFAULT_RESERVATION_WINDOW_MINUTES`). The LPU-Batangas campus zones,
cameras and navigation coordinates are in
`packages/database/src/seed/lpuBatangas.ts` (see §4.3 before using the seed
in production).

## 4. Database

### 4.1 Provision

Create an empty database and a role with `CREATE`/`ALTER` on the `public`
schema for migrations (Prisma also creates `_prisma_migrations`). Keep the
migration role separate from the runtime role if your policy requires it;
the runtime needs only DML on the application tables.

### 4.2 Migrate — `prisma migrate deploy` only

```bash
# on the deployment host, from the repository root, DATABASE_URL = production
npm ci
npm run build -w @parada/database            # prisma generate + tsc
(cd packages/database && npx prisma migrate status)   # lists pending migrations, applies nothing
pg_dump --format=custom --file=parada-pre-$(date +%Y%m%d%H%M).dump "$DATABASE_URL"   # always, before deploy
npm run migrate:deploy -w @parada/database            # prisma migrate deploy with DATABASE_URL from the environment
(cd packages/database && npx prisma migrate status)   # must print "Database schema is up to date!"
```

Never run `prisma db push`, `prisma migrate dev`, or `prisma migrate reset`
against a database holding real data. `db push` recreates the schema from
`schema.prisma`, which silently drops the constraints listed in §4.4.

There are 12 migrations (`packages/database/prisma/migrations`), applied in
timestamp order from `20260829141334_init` to `20260920090000_vehicle_primary`.
All are additive or backfilling; none drops a table or a column. The two
that touch existing rows are
`20260914120000_account_lifecycle_and_zone_navigation` (marks existing users
email-verified) and `20260920090000_vehicle_primary` (marks each user's most
recent ACTIVE vehicle primary). Both are idempotent for a fresh database.

### 4.3 First admin account

Registration through the API always creates a `USER`, and there is no
admin route that changes a role, so the first `ADMIN` is an operator step.
Two supported options:

1. **Seed** (`packages/database/src/seed/index.ts`) — creates the campus
   zones/slots/cameras from `lpuBatangas.ts` **plus** a demo admin
   (`admin@parada.local`), a demo driver (`driver@parada.local`) and demo
   vehicles. It refuses to run without `PARADA_SEED_ADMIN_PASSWORD` and
   `PARADA_SEED_USER_PASSWORD`. Run it directly with the production URL —
   the `npm run seed` script hard-codes the development URL:
   ```bash
   cd packages/database
   DATABASE_URL="<production>" PARADA_SEED_ADMIN_PASSWORD="<strong>" PARADA_SEED_USER_PASSWORD="<strong>" npx ts-node src/seed/index.ts
   ```
   Afterwards change the admin email/password from Admin → Account. Admin
   has no user-management mutations, so remove the demo driver with SQL
   before real users register — vehicles restrict user deletion, so delete
   them first:
   ```sql
   DELETE FROM vehicles WHERE "userId" = (SELECT id FROM users WHERE email = 'driver@parada.local');
   DELETE FROM users WHERE email = 'driver@parada.local';
   ```
2. **Promote a registered user** — register normally from the mobile app,
   verify the email, then `UPDATE users SET role = 'ADMIN' WHERE email =
   '<address>';` (roles are `USER`/`ADMIN`). Create zones and cameras in
   Admin afterwards.

### 4.4 Verify after migration

Run against the production database and confirm all rows exist:

```sql
SELECT conname FROM pg_constraint WHERE conname = 'parking_zones_occupied_in_bounds';
SELECT indexname FROM pg_indexes WHERE indexname IN (
  'parking_sessions_one_active_per_vehicle',
  'zone_assignments_one_active_per_vehicle',
  'vehicles_one_active_per_normalized_plate',
  'vehicles_one_primary_per_user');
SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at;
```

Expected: the CHECK constraint, all four partial unique indexes (the first
three are the integrity rules from `docs/database/model.md`; the fourth is
the later primary-vehicle rule from `20260920090000_vehicle_primary`), and 12 migration rows with `finished_at`
set and `rolled_back_at` null. This exact query set was run against a fully
migrated development database for the release candidate and returned all
five objects.

Then `curl -fsS https://<api-host>/health` must return
`{"data":{"status":"ok","database":"connected"}}` — the route executes
`SELECT 1` through Prisma, so it proves connectivity from the API process.

## 5. API

Without Docker (any Linux host, or a platform that runs `npm` build/start
commands — verified on Ubuntu/WSL for this branch):

```bash
npm ci -w @parada/api -w @parada/database -w @parada/types -w @parada/config --include-workspace-root
npm run build -w @parada/api      # builds @parada/config, types, database (prisma generate) first via turbo
npm run migrate:deploy -w @parada/database            # DATABASE_URL from the environment
cd services/api && NODE_ENV=production node dist/index.js   # under your process manager, env from §3
```

With Docker (`services/api/Dockerfile`, build context = repository root):

```bash
docker build -f services/api/Dockerfile -t parada-api .
docker run --env-file services/api/.env -p 4100:4100 parada-api
docker run --env-file services/api/.env -w /app parada-api npm run migrate:deploy -w @parada/database
```

The image has not been built in this repository's development environment
(no Docker available there); its `RUN` steps are the verified commands
above. `docker-compose.online.yml` wires API, Admin, PostgreSQL, Caddy and
the one-shot `migrate` service together.

- `dotenv/config` loads `.env` from the **current working directory**; run
  from `services/api` if you rely on a `.env` file, or inject the
  environment and omit the file.
- Startup order: `loadEnv()` (fails fast, §3) → `createApp()` (fails fast on
  mail transport) → `listen`. `SIGTERM`/`SIGINT` close the listener and
  disconnect Prisma before exit — a normal restart is clean.
- Request bodies are limited to Express's default 100 kB (`express.json()`);
  oversized bodies get 413 `PAYLOAD_TOO_LARGE`, malformed JSON 400. Unhandled
  errors return a generic `INTERNAL_ERROR` body and log the stack to stderr
  only.
- Auth: bearer JWT, verified with `JWT_SECRET`/`JWT_ISSUER`; logout writes
  the token's `jti` to `revoked_tokens`; password changes bump
  `users.tokenVersion` so older tokens stop verifying. Only an explicit 401
  clears credentials on any client.
- Camera ingress: `POST /zones/:zoneId/events` requires `X-API-Key`
  (timing-safe comparison), is rate-limited per camera identifier, and
  `(cameraId, sourceEventId)` is unique, so a retried event is absorbed,
  not double-counted.
- The `/simulator/*` routes stay mounted in production but require an
  ADMIN token; they drive the real pipeline and change real occupancy. Do
  not use them against production data.

## 6. Admin

Without Docker:

```bash
npm ci -w @parada/admin -w @parada/types -w @parada/config --include-workspace-root
npm run build -w @parada/admin                     # next build, needs @parada/types + config built
API_BASE_URL=http://127.0.0.1:4100 PORT=3000 npm run start -w @parada/admin   # under your process manager
```

With Docker (`apps/admin/Dockerfile`, multi-stage; `NEXT_OUTPUT_STANDALONE=1`
switches `next.config.mjs` to `output: "standalone"` for the image only —
`next start` is unchanged for the non-Docker path):

```bash
docker build -f apps/admin/Dockerfile -t parada-admin .
docker run -e API_BASE_URL=http://<api-host>:4100 -p 3000:3000 parada-admin
```

The standalone build (`.next/standalone/apps/admin/server.js`) was built and
served locally for this branch; the container image itself was not built
(no Docker in the development environment).

- Serve it only over HTTPS through the reverse proxy (§1). The cookie
  `parada_admin_token` is `HttpOnly; SameSite=Lax; Secure; Path=/`.
- `/api/proxy/[...path]` and `/api/realtime` confirm the session is ADMIN
  with the backend on every request (`/auth/me`); a backend 401 clears the
  cookie, a 403 or outage does not.
- Logout (`/api/auth/logout`) calls the API's `/auth/logout` (revocation)
  and clears the cookie even if the API is unreachable.
- Static assets are served by `next start` from `.next/`; there is no CDN
  or `basePath` configuration.

## 7. Vision

Identical for LOCAL and HYBRID; only `PARADA_API_URL` changes (LAN address vs
`https://<api-domain>`). A container image exists
(`services/vision/Dockerfile`, EasyOCR weights baked in; not built in the
development environment) — for RTSP it must run on a host that can reach the
camera LAN (`--network host` on-site), see §A.4.

Per camera host:

```bash
cd services/vision
npm run setup -w @parada/vision          # creates .venv and installs requirements.txt (pinned)
# inject the per-camera environment from §3, then:
npm run camera -w @parada/vision -- test  # opens the source, reads one frame, runs real OCR once
npm run camera -w @parada/vision -- run   # frame -> OCR -> POST /zones/:zoneId/events loop
```

- `test` proves the device/stream opens and the OCR model loads; it prints
  `Vision pipeline OK`. It does not prove a plate can be read at the
  installed angle/lighting — that needs a plate in view.
- `run` refuses to start without `CAMERA_ZONE_ID`; it retries the API up to
  `MAX_FORWARD_ATTEMPTS` times per event with the same `sourceEventId`,
  reconnects the source up to `MAX_CAMERA_RECONNECTS` times, and then stops
  cleanly (the process manager should restart it). It never fabricates a
  plate: `NO_DETECTION`/`OCR_FAILED` frames are not forwarded.
- One process per physical camera, each with its own `CAMERA_IDENTIFIER`
  and `CAMERA_ZONE_ID`. Register the camera in Admin → Cameras first (see
  [add-a-camera.md](./add-a-camera.md)).
- No physical camera has been validated against the release candidate. The
  Phase 14 USB probe (`docs/vision/phase14-evaluation.md`) covered
  connectivity only.

## 8. Mobile

Build-time configuration only; the same app serves every profile.

| Profile | `EXPO_PUBLIC_API_URL` |
|---|---|
| LOCAL | `http://<API host LAN address>:4100` (never `localhost`; the phone's localhost is the phone) |
| ONLINE / HYBRID | `https://<api-domain>` (Android release builds block cleartext HTTP) |

- `apps/mobile/eas.json` defines `development` (internal APK + iOS
  simulator), `preview` (internal APK for evaluators) and `production`
  (store build, `autoIncrement` of the version numbers) profiles.
  `apps/mobile/app.json` carries `android.versionCode` and `ios.buildNumber`
  (`appVersionSource: local`). No EAS project id, Apple or Google
  credentials are in the repo — `eas init` / `eas build` create or prompt
  for them on the operator's account.
- Supply the URL to the build, never hard-code it:
  ```bash
  cd apps/mobile
  npx eas init                                  # once, links the Expo account/project
  npx eas env:create --scope project --name EXPO_PUBLIC_API_URL --value https://<api-domain> --visibility plaintext --environment preview
  npx eas build --platform android --profile preview
  ```
  or set the variable in `apps/mobile/.env` on the build machine (the file
  is gitignored and is not uploaded to EAS).
- Do **not** run `npm run dev`/`npm run start` in `apps/mobile` on the build
  machine first: their `predev`/`prestart` hooks (`scripts/set-lan-ip.js`)
  overwrite `apps/mobile/.env` with the machine's LAN address.
- `npm run build -w @parada/mobile` only runs `expo export` (a JS bundle); it
  is a build-verification step, not an installable app.
- Verify a build by watching its first request: the login screen must call
  `<EXPO_PUBLIC_API_URL>/auth/login`.
- Runtime behaviour is unchanged in every profile: token in
  `expo-secure-store`, only a 401 invalidates it
  (`apps/mobile/lib/auth/session.ts`), SSE via `react-native-sse` to
  `<EXPO_PUBLIC_API_URL>/realtime/stream` with the bearer token, GPS
  navigation to the zone's configured coordinates.

## 9. SMTP

Any SMTP provider works (nodemailer). Set the `SMTP_*`/`MAIL_FROM`
variables, then verify with a real registration from the mobile app: the
6-digit verification code must arrive. A rejected SMTP send surfaces as a
500 `INTERNAL_ERROR` to the client and a stack trace in the API log; the
account still exists unverified and can request a new code once SMTP is
fixed. There is no outbound queue or retry — nothing is sent later
automatically.

## 10. Smoke tests (run after every deployment)

Record pass/fail for each line in the deployment log.

**Authentication**
- Admin login → dashboard renders; `parada_admin_token` cookie is HttpOnly/Secure; `document.cookie` in devtools shows nothing.
- Admin logout → `/` redirects to `/login`; the old cookie value is rejected (401 through `/api/proxy/auth/me`).
- Mobile register → code arrives by email → verify → login → home.
- Wrong password → 401; 11th attempt within a minute from one client → 429 while another client can still log in.

**Parking (mobile)**
- Primary Vehicle preselected; picker lists every ACTIVE vehicle.
- Recommended zone shown; "Reserve" creates a reservation for that zone.
- "Choose another zone" → pick a zone → reservation created for that zone.
- Cancel reservation → gone from Sessions and from Admin → Reservations.

**Entry**
- Vision log `event ... outcome=ok`; Admin → Cameras shows the event.
- Zone `occupiedCount` +1 in Admin → Zones and on the mobile zone list without reload (SSE).
- Registered plate → session appears under Admin → Sessions and on the mobile Home tab as the active session.
- Unregistered plate → guest session or anomaly per the guest policy; no user notification.
- Plate in the wrong zone → violation under Admin → Violations.

**Active session / exit**
- Background the app for a minute, foreground → state refetched, still correct.
- Exit event → session COMPLETED in Admin → Sessions, fee amount on the mobile Sessions tab and Payments screen, `SESSION_COMPLETED` notification on the driver's device.

**Guest**
- Admin → Guest admit → session → exit → fee; Admin → Analytics counts it; no notification row with a null user reaches a driver.

**Admin views**
- Zones, Cameras, Sessions, Reservations, Users (with per-user vehicle counts; there is no separate Vehicles page — `GET /admin/vehicles` feeds the Simulator page), Violations, Appeals, Analytics, Settings each load with data.
- Realtime: with Admin → Zones open, a camera event changes the occupancy figure without a reload; the browser's Network tab shows one pending `/api/realtime` stream.

## 11. Rollback and recovery

| Failure | Procedure |
|---|---|
| Bad API release | Stateless: stop the process, check out the previous release commit, `npm ci && npm run build -w @parada/api`, start. In-flight SSE clients reconnect and resync automatically. |
| Bad Admin release | Same: rebuild the previous commit with `npm run build -w @parada/admin` and restart `next start`. Sessions survive (cookie only holds the JWT). |
| Bad Vision release | Check out the previous commit on the camera host and restart the runtime; no state is kept in vision. |
| Migration failed midway | `prisma migrate deploy` runs each migration in a transaction where PostgreSQL allows it, so a failed migration leaves a row with `finished_at IS NULL`. Fix the cause, then `cd packages/database && npx prisma migrate resolve --rolled-back <migration_name>` and re-run `migrate deploy`. If the failure left partial DDL, restore the `pg_dump` taken in §4.2 first. |
| Need to undo a migration | Prisma has no down migrations. Restore the pre-migration dump (`pg_restore --clean --if-exists --dbname "$DATABASE_URL" <dump>`) and redeploy the previous API release; accept the loss of rows written since the dump. Never `migrate reset`. |
| Camera misbehaving | Admin → Cameras → set status **OFFLINE**. The API answers 409 `Camera '<id>' is offline and cannot accept events.` to that camera and the runtime logs `api rejected event status=409`; occupancy stops changing from it. Stop the runtime process at leisure. |
| SMTP outage | Fix the `SMTP_*` values and restart the API (env is read at startup). Users repeat the action; nothing is queued. |
| Vision cannot reach API | Runtime retries with the same `sourceEventId`, then logs `api unreachable` and continues with the next frame; nothing is double-counted when the API returns. If the API was down long, entries/exits during the outage are lost — reconcile occupancy in Admin → Zones. |
| API cannot reach the database | `/health` returns 500; Prisma logs `error` lines. Restore connectivity; the API needs no restart unless `DATABASE_URL` changed. |

## 12. Observability

What the release candidate emits, and where each failure class shows up:

| Failure | Where it is visible |
|---|---|
| API crash on start | stderr `[api] failed to start: <reason>` and exit code 1 |
| Unhandled API error | stderr `[api] unhandled error:` + stack (never sent to the client) |
| Database errors | Prisma client is created with `log: ["warn","error"]` (`packages/database/src/client.ts`); `/health` fails |
| Authentication failures, rate limiting | Not logged by the API. Use the reverse proxy access log (401/429 status codes) |
| Camera open/read failures, reconnects | Vision stdout `camera open failed`, `reconnecting camera=<id>`, `camera could not be opened after N attempts` |
| OCR model failure | Vision stdout `OCR model failed to load`; `/health` on `:8001` reports `modelLoaded: false` if the HTTP service runs |
| Vision → API forwarding | Vision stdout `api unreachable`, `api throttled event (429)`, `api event error status=<n>`, `api rejected event status=409 reason=<reason>` |
| Realtime disconnects | Client-side only: Admin's `useRealtime` hook resyncs on reconnect but renders no indicator; mobile exposes a realtime status to its screens. The API does not log them |
| Reservation / session / fee / notification failures | Domain rejections are 4xx responses (proxy access log); anything else is `[api] unhandled error` |

Secrets: the API never logs environment values; vision redacts RTSP URLs to
scheme/host/port. Point the process manager's stdout/stderr at a log sink
and keep the reverse proxy access log — request-level API logging is a
deferred improvement, not present in this release.

## 13. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Admin login "succeeds" but immediately returns to `/login` | Admin served over plain HTTP with `NODE_ENV=production`: the `Secure` cookie is dropped by the browser. Put it behind HTTPS. |
| Admin shows "Unable to reach the PARADA API." | `API_BASE_URL` wrong or the API is down; it is the server-side URL, not the public one. |
| Everyone gets 429 on login after a few attempts | `TRUST_PROXY` unset behind a proxy: all clients share the proxy's address. Set `TRUST_PROXY=1`. |
| Zone figures only update on reload; `/api/realtime` keeps reconnecting | Proxy buffering or idle timeout below 25 s on the SSE routes. |
| Mobile release build cannot log in but the dev build can | `EXPO_PUBLIC_API_URL` is `http://` (cleartext blocked) or was overwritten by `set-lan-ip.js`. Rebuild with the HTTPS URL. |
| Vision: `api rejected event status=409 reason=...` on every event | `CAMERA_ZONE_ID` does not match the zone the camera is registered under, gate direction mismatch, or the camera is OFFLINE in Admin. |
| Vision: every event gets 401 | `CAMERA_API_KEY` differs between the API and the runtime, or is blank on one side. |
| `prisma migrate deploy` errors with P3009 | An earlier migration failed; see §11 "Migration failed midway". |

## 14. Operational checks (daily / after any change)

- `GET /health` on the API returns `database: connected`.
- The Admin `/api/realtime` stream stays open (Network tab) and zone figures move without reload.
- Each vision runtime's latest log line is within the last minute
  (`heartbeat`-style `frames=` stats or `event ... outcome=ok`).
- Admin → Anomalies has no unexplained growth.
- Occupancy per zone in Admin → Zones matches a physical spot check.
- Verify the most recent `pg_dump` exists and restores to a scratch database.

## 15. Deployment log (fill in from a real run — never in advance)

| Item | Value |
|---|---|
| Deployment target (provider/hosts) | |
| Release commit | |
| Date / operator | |
| Migrations applied (`migrate status` output) | |
| Constraint query result (§4.4) | |
| Smoke test results (§10, pass/fail per line) | |
| Mobile build id / store status | |
| Cameras validated physically (identifier, source) | |

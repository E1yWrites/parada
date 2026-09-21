# How to set up PARADA (full local environment)

This is the in-depth, start-to-finish setup guide: cloning, installing,
configuring every workspace's environment variables, bootstrapping the
database, running every service, and resetting to a clean state. For the
short version see [run-and-test-locally.md](run-and-test-locally.md); for
production/online deployment see [deploy.md](deploy.md).

## 1. Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 18+ | everything (npm workspaces) |
| npm | 9+ | dependency install (`packageManager: npm@9.2.0`) |
| Python | 3.11 | `services/vision` only |
| Git | any | clone |

No PostgreSQL install and no Docker are required for local development.
`packages/database` runs an embedded PostgreSQL 18 cluster on port `5442`,
persisted under `packages/database/.embedded-pg/` (gitignored). Docker is only
used by the `capstone-online` deployment profiles (see
[deploy-online-free.md](deploy-online-free.md) /
[deploy-online-paid.md](deploy-online-paid.md)).

## 2. Clone and install

```bash
git clone <repo-url> parada-system
cd parada-system
npm install
```

`postinstall` runs `scripts/ensure-expo-link.cjs` automatically (links the
Expo config for `apps/mobile`).

## 3. Configure environment files

Every workspace has its own `.env`, copied from a checked-in `.env.example`.
**Never commit a real `.env` — only the `.example` templates are tracked.**

| Copy this | To this | Used by |
|---|---|---|
| [`.env.example`](../../.env.example) | `.env` (repo root) | shared dev defaults (`DATABASE_URL`, Postgres creds, ports) — read by `npm run dev` orchestration |
| [`services/api/.env.example`](../../services/api/.env.example) | `services/api/.env` | API (Express) |
| [`services/vision/.env.example`](../../services/vision/.env.example) | `services/vision/.env` | Vision/OCR camera runtime |
| [`apps/mobile/.env.example`](../../apps/mobile/.env.example) | `apps/mobile/.env` | Expo mobile app (`EXPO_PUBLIC_*` vars are bundled into the client — no secrets here) |
| `apps/admin` | reads `services/api`'s `API_BASE_URL` / root `.env` | Next.js admin — no separate admin `.env.example` exists; it uses the root file |

```bash
cp .env.example .env
cp services/api/.env.example services/api/.env
cp services/vision/.env.example services/vision/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Two more root-level templates exist for other run profiles — **do not use
these for plain local dev**, only for the scenarios they name:

- [`.env.local.example`](../../.env.local.example) — LOCAL/LAN profile (phones
  on the same network hit your machine's LAN IP; see
  [deploy-local.md](deploy-local.md)).
- [`.env.online.example`](../../.env.online.example) — ONLINE profile behind a
  real domain + Caddy (see [deploy-online-free.md](deploy-online-free.md) /
  [deploy-online-paid.md](deploy-online-paid.md)).

### Key variables to set for local dev

`services/api/.env`:

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://parada:changeme@127.0.0.1:5442/parada?schema=public` | must match the embedded Postgres cluster |
| `JWT_SECRET` | placeholder | replace with a long random string even in dev; generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `CAMERA_API_KEY` | empty | leave empty for trusted local dev; **required** once `NODE_ENV=production` — must match `services/vision`'s `CAMERA_API_KEY` |
| `MAIL_TRANSPORT` | `console` | dev default logs emails to stdout instead of sending; set `smtp` + `SMTP_*` to actually send |
| `OCR_PLATE_CONFIDENCE_THRESHOLD` | `0.5` | must match `services/vision`'s value — the API, not vision, makes the trust decision |

`services/vision/.env` — see
[add-a-camera.md](add-a-camera.md) for the full camera-source breakdown
(`CAMERA_SOURCE=usb|rtsp|file`, `CAMERA_IDENTIFIER`, `CAMERA_ZONE_ID`, etc.).
For a first run with no physical camera, the defaults
(`CAMERA_SOURCE="file"`, `CAMERA_FILE_PATH=""`) plus a generated fixture from
`services/vision/tests/fixtures/generate_video.py` are enough to exercise the
pipeline end-to-end.

`apps/mobile/.env`:

| Variable | Default | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.100:4100` | on a simulator, `http://localhost:4100` works; on a physical device, use your machine's LAN IP — see "Running on a physical mobile device" below |

### Seed account passwords (required)

The database seed **refuses to run** outside `NODE_ENV=test` unless these are
set — there is no built-in default admin/user password:

```bash
export PARADA_SEED_ADMIN_PASSWORD="<strong-admin-password>"
export PARADA_SEED_USER_PASSWORD="<strong-user-password>"
```

(PowerShell: `$env:PARADA_SEED_ADMIN_PASSWORD = "..."`.) Set these in your
shell before running any seed/reset command below — they are not read from
`.env` files by default (`dotenv/config` in the seed script only picks them up
if you also export them into `packages/database/.env`).

### Vision Python environment

```bash
npm run setup -w @parada/vision
```

This creates `services/vision/.venv` and installs OCR dependencies
(EasyOCR weights are cached under `~/.EasyOCR` on first run).

## 4. Bootstrap the database

```bash
npm run db:start                              # starts embedded Postgres on :5442 (background)
npm run db:prepare                            # start + apply pending migrations
npm run seed -w @parada/database              # upserts zones/cameras/users/vehicles/config
```

- `db:start` / `db:stop` are idempotent — safe to re-run.
- `seed` is an **upsert**, not a wipe: it creates the LPU-Batangas zone/camera
  layout and the two seed accounts (`admin@parada.local`,
  `driver@parada.local`) if missing, and updates them in place if they
  already exist. It does **not** clear parking sessions, violations,
  reservations, occupancy history, or notifications accumulated from prior
  runs. For that, see "Reset to a clean state" below.

## 5. Run the stack

```bash
npm run dev          # database + API + admin + mobile, orchestrated together
npm run dev:api       # API only (builds first, runs from services/api/dist)
npm run dev:admin     # admin only (Next.js dev server)
npm run dev:mobile    # mobile only (Expo, LAN mode)
```

The vision service is **not** started by `npm run dev` — run it separately:

```bash
npm run dev -w @parada/vision        # FastAPI on port 8001
npm run camera -w @parada/vision     # camera runtime CLI (USB / RTSP / video file)
```

### Ports

| Service | Port |
|---|---|
| API | `4100` |
| Admin web | `3000` |
| Vision/OCR service | `8001` |
| Expo / Metro bundler | `8082` |
| Embedded PostgreSQL | `5442` |

### Sign in

- Admin dashboard (`http://localhost:3000`): `admin@parada.local` /
  `PARADA_SEED_ADMIN_PASSWORD`.
- Mobile app: `driver@parada.local` / `PARADA_SEED_USER_PASSWORD`, with
  seeded vehicles `ABC-1234` (CAR) and `XYZ-5678` (MOTORCYCLE).

### Running on a physical mobile device

Point both of these at your machine's LAN address (not `localhost`):

```
# apps/mobile/.env
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4100
```

```
# apps/mobile/.env.local (gitignored, machine-personal)
REACT_NATIVE_PACKAGER_HOSTNAME=<your-LAN-IP>
```

On Windows, allow inbound `node.exe` on the **active** network profile for
that adapter — a Public-profile-only rule blocks a Private-profile adapter.
`npm run dev` warns at startup if `EXPO_PUBLIC_API_URL` is still loopback.

## 6. Reset the database to a clean state

Use this whenever you want to wipe **all** runtime data — every user,
vehicle, session, reservation, violation, notification, occupancy event and
zone/camera row — and start from the seed data only. This is destructive and
local-only; it targets the dev database on `:5442`, never a test or
production database.

```bash
npm run db:reset
```

This runs `prisma migrate reset --force` against the dev `DATABASE_URL`,
which:

1. Drops the `parada` database entirely.
2. Recreates it and re-applies every migration from scratch
   (`packages/database/prisma/migrations`).
3. Regenerates the Prisma client.
4. Automatically re-runs the seed (`packages/database/src/seed/index.ts`),
   recreating only zone `A` ("Main Loop"), its two gate cameras
   (`cam-a-main-gate`, `cam-a-north-gate`), the two seed accounts, their
   vehicles, and the establishment config singleton.

`PARADA_SEED_ADMIN_PASSWORD` / `PARADA_SEED_USER_PASSWORD` must already be
exported in your shell (step 3) or the auto-seed step fails and the database
is left migrated but empty of accounts — re-run `npm run seed -w
@parada/database` once the env vars are set.

Equivalent manual steps, if you need to reset without re-seeding
(`--skip-seed`), or reset the dedicated **test** databases instead of dev:

```bash
# dev DB, skip auto-seed
npm run db:reset -w @parada/database -- --skip-seed

# test DBs (parada_test, parada_test_api) — recreated, not reset in place
npm run db:test:setup -w @parada/database
```

## 7. Running tests

```bash
npm run db:start
npm run db:test:setup -w @parada/database   # creates parada_test + parada_test_api
npm run test                                 # all workspaces
```

- API and database suites run against **real PostgreSQL**, not mocks, and
  refuse to start unless `DATABASE_URL` points at a `_test` database — this
  is a safety check, not a suggestion (see
  [`packages/database/jest.setup.ts`](../../packages/database/jest.setup.ts) /
  [`services/api/jest.setup.ts`](../../services/api/jest.setup.ts)).
- Vision tests run under pytest in the service's virtualenv:
  ```bash
  npm run test -w @parada/vision
  ```
- Individual workspaces: `npm run test -w @parada/api`, `-w @parada/admin`,
  `-w @parada/mobile`, `-w @parada/database`, `-w @parada/types`.

## 8. Checks before committing

```bash
npm run typecheck
npm run lint
npm run build
```

All three must pass across workspaces.

## Troubleshooting

- **Seed throws `PARADA_SEED_ADMIN_PASSWORD must be set before seeding
  accounts`** — export both seed password env vars (step 3) before seeding
  or resetting; the seed refuses insecure defaults outside `NODE_ENV=test`.
- **`Refusing to run database tests against a non-test database`** —
  `DATABASE_URL` must point at `parada_test` / `parada_test_api`, never the
  dev `parada` database; run `npm run db:test:setup -w @parada/database`
  first.
- **Embedded Postgres already running** — `db:start` is idempotent and prints
  "already running and accepting queries" — this is not an error.
- **Two checkouts / worktrees can't share `:5442`** — one embedded Postgres
  cluster runs per port; a worktree and the main checkout cannot both run one
  at the same time.
- **Mobile app can't reach the API from a phone** — see "Running on a
  physical mobile device" above; `localhost` never resolves to your machine
  from a separate device.

## Where results are reported

Latest measured test counts and the Phase 14 OCR accuracy evaluation are in
the [top-level README](../../README.md#testing) and
[`docs/vision/phase14-evaluation.md`](../vision/phase14-evaluation.md). These
are unit/integration results — no on-device or deployment testing is implied
by a green `npm run test`.

# How to run and test locally

## Prerequisites

- Node.js 18+ and npm 9+
- Python 3.11 — only needed for the vision/OCR service
- No PostgreSQL install and no Docker required for development:
  `packages/database` runs an embedded PostgreSQL 18 cluster on port `5442`,
  persisted in `packages/database/.embedded-pg/`.

## First-time setup

```bash
npm install
```

Copy each package's `.env.example` to `.env` and fill in real values. Never
commit real secrets. When seeding the database, set unique credentials first:

```text
PARADA_SEED_ADMIN_PASSWORD=<strong-admin-password>
PARADA_SEED_USER_PASSWORD=<strong-user-password>
```

The seed refuses to run without these outside the test environment.

To set up the vision service's Python virtualenv:

```bash
npm run setup -w @parada/vision
```

## Running the stack

```bash
npm run dev          # database + API + admin + mobile
npm run dev:api      # API only
npm run dev:admin    # admin only (Next.js)
npm run dev:mobile   # mobile only (Expo LAN mode)
npm run db:prepare   # start database and apply pending migrations
npm run db:start     # start the embedded development database
npm run db:stop      # stop it cleanly
```

The vision service is **not** started by `npm run dev` — run it separately:

```bash
npm run dev -w @parada/vision      # FastAPI on port 8001
npm run camera -w @parada/vision   # camera runtime CLI (USB / RTSP / video file)
```

### Ports

| Service | Port |
|---|---|
| API | `4100` |
| Admin web | `3000` |
| Vision/OCR service | `8001` |
| Expo / Metro bundler | `8082` |
| Embedded PostgreSQL | `5442` |

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

## Running tests

Create the dedicated test databases once, then run the suites:

```bash
npm run db:start
npm run db:test:setup -w @parada/database   # creates parada_test + parada_test_api
npm run test                                 # all workspaces
```

- The API and database suites run against **real PostgreSQL**, not mocks, and
  refuse to start unless `DATABASE_URL` points at a test database.
- Vision tests run under pytest in the service's virtualenv:
  ```bash
  npm run test -w @parada/vision
  ```
- Individual workspaces: `npm run test -w @parada/api`, `-w @parada/admin`,
  `-w @parada/mobile`, `-w @parada/database`, `-w @parada/types`.

## Checks before committing

```bash
npm run typecheck
npm run lint
npm run build
```

All three must pass across workspaces. Lint reports warnings only (no
errors) as of the last full run.

## Where results are reported

Latest measured test counts and the Phase 14 OCR accuracy evaluation are in
the [top-level README](../../README.md#testing) and
[`docs/vision/phase14-evaluation.md`](../vision/phase14-evaluation.md). These
are unit/integration results — no on-device or deployment testing is implied
by a green `npm run test`.

# How to run and test locally

## Prerequisites

- Node.js 20.19.4+, 22.13+ or 24.3+ (`.nvmrc`: 24) and npm 9+. The mobile
  toolchain (React Native 0.86 / Metro 0.84) refuses Node 18
- Python 3.11 — only needed for the vision/OCR service
- No PostgreSQL install and no Docker required for development:
  `packages/database` runs an embedded PostgreSQL 18 cluster on port `5442`,
  persisted in `packages/database/.embedded-pg/`.

## First-time setup

```bash
npm install
```

```bash
cp services/api/.env.example services/api/.env      # then set JWT_SECRET
cp apps/admin/.env.example apps/admin/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Never commit real secrets. Which file each process reads, and the values for
every run case, are in [configure-environments.md](configure-environments.md).
When seeding the database, set unique credentials first:

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

No internet on the demo PC? On Windows, `run-offline.cmd` (repository root)
starts, simulates, tests and stops the whole stack offline after a one-time
`run-offline.cmd prepare` while online — see
[configure-environments.md §3.3](configure-environments.md#33-offline-one-windows-pc-no-internet).

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
`npm run dev` writes both values for you before Expo starts
(`apps/mobile/scripts/set-lan-ip.js`) and warns if `EXPO_PUBLIC_API_URL` is
still loopback. If it picks the wrong adapter, see
[configure-environments.md §3.2](configure-environments.md#32-local-development-with-a-physical-phone-same-wi-fi).

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
- Two vision tests send real OCR results into a running API. They are skipped
  unless `PARADA_TEST_API_URL`, `PARADA_TEST_ZONE_ID`,
  `PARADA_TEST_CAMERA_IDENTIFIER` (and `PARADA_TEST_CAMERA_API_KEY` when the
  API has a key) are set — see
  [configure-environments.md §3.4](configure-environments.md#34-automated-tests).
  Point them at a throwaway database: they create real events.

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

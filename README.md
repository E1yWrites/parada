# PARADA

A **mobile and web-based smart parking system** for zone-based occupancy detection using **OCR-assisted cameras**.

> Lyceum of the Philippines University–Batangas — BS Information Technology (Capstone)

## Overview

PARADA helps drivers find available parking and helps administrators monitor small-to-medium
parking facilities (approx. 50–100 spaces across multiple zones). Instead of installing dedicated
IoT sensors on every slot, PARADA uses **gate-based entry/exit counting** with standard cameras
and OCR-assisted processing to maintain **zone-level occupancy**.

**Authoritative metric:** zone-level availability (`available = capacity - occupied`).
Parking slots exist for layout / inventory / visual representation only and are not derived from
camera occupancy.

## Repository Structure

```
PARADA/
├── apps/
│   ├── mobile/     # Mobile app for drivers (React Native + Expo + TypeScript)
│   └── admin/      # Web admin dashboard (Next.js + TypeScript)
├── services/
│   ├── api/        # Backend API (Node.js + Express + TypeScript)
│   └── vision/     # Vision/OCR service (Python + FastAPI + OpenCV + EasyOCR)
├── packages/
│   ├── database/   # Prisma schema + DB access + embedded dev database
│   ├── types/      # Shared TypeScript types
│   └── config/     # Shared configuration
├── docs/           # Architecture, database, api, mobile, vision docs
├── docker-compose.yml
└── package.json    # npm workspaces + Turborepo
```

## Tech Stack

| Layer        | Technology                                          |
|--------------|-----------------------------------------------------|
| Mobile       | React Native + Expo + TypeScript                     |
| Admin Web    | Next.js + TypeScript + Tailwind CSS                  |
| Backend API  | Node.js + Express + TypeScript                       |
| Vision/OCR   | Python + FastAPI + OpenCV + EasyOCR                  |
| Database     | PostgreSQL + Prisma (embedded Postgres in dev)       |
| Realtime     | Server-Sent Events (API → admin relay / mobile)      |
| Monorepo     | npm workspaces + Turborepo                           |

## Data Flow

```
Camera → Vision/OCR → API → Domain → Database
Mobile  → API → Domain → Database
Admin   → Next.js proxy → API → Domain → Database
Realtime (SSE) → Admin + Mobile
```

The backend is the only authority on parking business meaning. Vision identifies observations and
forwards them over HTTP; it never touches Prisma or PostgreSQL. Mobile and admin never access the
database directly — admin reaches the API through a server-side proxy that keeps the JWT in an
HttpOnly cookie.

## Getting Started

Prerequisites:

- **Node.js 18+** and **npm 9+**
- **Python 3.11** — only for the vision/OCR service
- No PostgreSQL install and no Docker required: `packages/database` runs an **embedded PostgreSQL 18**
  cluster on port `5442`, with data persisted in `packages/database/.embedded-pg/`.

```bash
npm install
```

Copy the relevant `.env.example` to `.env` per package and fill in real values.
**Never commit real secrets.** See each package's `.env.example` for specifics.

When running the database seed, provide unique credentials for the seeded accounts:

```text
PARADA_SEED_ADMIN_PASSWORD=<strong-admin-password>
PARADA_SEED_USER_PASSWORD=<strong-user-password>
```

The seed refuses to run without these variables outside the test environment and never prints
their values.

To set up the vision service's Python virtualenv (creates `services/vision/.venv` and installs
`requirements.txt`):

```bash
npm run setup -w @parada/vision
```

## Development

```bash
npm run dev          # database + API + admin + mobile
npm run run          # alias for npm run dev
npm run dev:api      # API only (prepares the database, builds services/api, then starts it)
npm run dev:admin    # admin only (Next.js)
npm run dev:mobile   # mobile only (Expo LAN mode)
npm run db:prepare   # start database and apply pending migrations
npm run db:start     # start the embedded development database
npm run db:stop      # stop it cleanly when finished
npm run build        # build all workspaces
npm run lint         # lint all workspaces
npm run typecheck    # type check all workspaces
npm run test         # run tests in all workspaces
```

`npm run dev` starts the embedded database, applies any pending non-destructive migrations, then
runs the API, admin web app and Expo. The vision service is **not** started by this workflow — run
it on its own when you need it:

```bash
npm run dev -w @parada/vision      # FastAPI on port 8001
npm run camera -w @parada/vision   # camera runtime CLI (USB / RTSP / video file)
```

### Ports

| Service                  | Port   |
|--------------------------|--------|
| API                      | `4100` |
| Admin web                | `3000` |
| Vision/OCR service       | `8001` |
| Expo / Metro bundler     | `8082` |
| Embedded PostgreSQL      | `5442` |

Metro runs on **8082**, not Expo's default 8081, because on the primary Windows development machine
port 8081 is claimed by the Windows Host Network Service (`hns`, used by Docker Desktop / WSL2 port
proxying). It accepts the bind but never delivers connections, so Expo Go cannot reach the bundler
on 8081. If 8081 is free on your machine you can change the `--port` flag in
`apps/mobile/package.json`.

The API binds to `0.0.0.0` in development so LAN devices can reach it. The embedded database is
persistent and is never reset by the development workflow.

### Running on a physical device

`localhost` on a phone is the phone itself, so both of these must point at your machine's LAN
address. The API URL goes in `apps/mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4100
```

and the packager hostname in `apps/mobile/.env.local` (Expo SDK 57 refuses to load this
machine-personal variable from a non-`.local` env file; both files are gitignored):

```
REACT_NATIVE_PACKAGER_HOSTNAME=<your-LAN-IP>
```

`REACT_NATIVE_PACKAGER_HOSTNAME` matters on a multi-homed host: Expo guesses which interface to
advertise and can pick a VirtualBox, WSL or link-local adapter the phone cannot route to. Pin the
address that is on the phone's own subnet. `npm run dev` warns at startup when `EXPO_PUBLIC_API_URL`
is still loopback and prints the detected LAN addresses.

On Windows, also make sure the firewall allows inbound `node.exe` on the **active network profile**
for that adapter — a rule that only covers the Public profile will block a Private-profile adapter.

## Testing

Create the dedicated test databases once, then run the suites:

```bash
npm run db:start
npm run db:test:setup -w @parada/database   # creates parada_test + parada_test_api
npm run test                                 # all workspaces
```

The API and database suites run against **real PostgreSQL**, not mocks, and refuse to start unless
`DATABASE_URL` points at a test database. Vision tests run under pytest in the service's virtualenv.

Current state, as measured in Phase 14 (Phase 13 integration applied):

| Workspace | Suites | Tests |
|-----------|--------|-------|
| `@parada/types` | 1 | 9 passed |
| `@parada/database` | 1 | 49 passed |
| `@parada/api` | 17 | 267 passed |
| `@parada/admin` | 16 | 79 passed |
| `@parada/mobile` | 29 | 324 passed |
| `@parada/vision` (pytest) | — | 73 passed, 2 skipped |

`npm run typecheck`, `npm run lint` and `npm run build` all pass across the workspaces. Lint reports
warnings only (no errors). The two skipped vision tests are the opt-in live-API integration tests,
which require a running API and are skipped without one.

These are unit and integration results. **No on-device or deployment testing is claimed.** The
Phase 14 OCR accuracy evaluation (synthetic benchmark, per-condition results, end-to-end latency
and a live USB-camera connectivity probe — no plate was shown to the camera) is documented in
`docs/vision/phase14-evaluation.md`; it is a characterisation on synthetic data, not a
production accuracy claim.

## Phases

The project is developed in phases. **`docs/architecture/roadmap.md` is the single source of truth
for phase numbering and status.** Phases 0–14 are complete. Phase 15 (Deployment) is next,
followed by 16 (Documentation + Final Review).

## Documentation

See the `docs/` directory:

- `docs/how-to/` — task-oriented guides: [adding a camera](docs/how-to/add-a-camera.md),
  [adding a zone](docs/how-to/add-a-zone.md),
  [editing the database](docs/how-to/edit-the-database.md),
  [running and testing locally](docs/how-to/run-and-test-locally.md),
  [deploying](docs/how-to/deploy.md) — LOCAL / ONLINE / HYBRID profiles of the
  one application, with step-by-step guides for [local + tunnelling](docs/how-to/deploy-local.md),
  [online on free tiers](docs/how-to/deploy-online-free.md) and [online on a paid VPS](docs/how-to/deploy-online-paid.md)
  (Phase 15 is still pending: deployable and verified on Linux, not a record of a finished deployment)
- `docs/architecture/` — system architecture, decisions, and the phase roadmap
- `docs/database/` — schema and data model
- `docs/api/` — API reference, including the realtime (SSE) stream contract
- `docs/mobile/` — mobile app notes
- `docs/vision/` — camera / OCR processing
- `docs/security/` — Phase 15 threat model and release gates
- `services/vision/README.md` — vision service setup, camera sources, and troubleshooting

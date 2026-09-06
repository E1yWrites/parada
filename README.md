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
│   ├── api/        # Backend API (Node.js + TypeScript)
│   └── vision/     # Vision/OCR service (Python + FastAPI + OpenCV)
├── packages/
│   ├── database/   # Prisma schema + DB access
│   ├── types/      # Shared TypeScript types
│   └── config/     # Shared configuration
├── docs/           # Architecture, database, api, vision, testing, deployment docs
├── docker-compose.yml
└── package.json    # npm workspaces + Turborepo
```

## Tech Stack

| Layer        | Technology                                    |
|--------------|-----------------------------------------------|
| Mobile       | React Native + Expo + TypeScript               |
| Admin Web    | Next.js + TypeScript + Tailwind CSS            |
| Backend API  | Node.js + TypeScript                           |
| Database     | PostgreSQL + Prisma                            |
| Vision/OCR   | Python + FastAPI + OpenCV + EasyOCR            |
| Real-time    | Socket.IO                                      |
| Monorepo     | npm workspaces + Turborepo                     |

## Getting Started

Prerequisites: Node.js 18+, npm 9+, PostgreSQL (or Docker).

```bash
npm install
```

Copy the appropriate `.env.example` to `.env` per package and fill in real values.
Never commit real secrets. See each package's README for specifics.

## Development

`npm run dev` starts the existing embedded development database and applies any
pending non-destructive migrations. You can also prepare it separately:

```bash
npm run db:start
npm run db:migrate -w @parada/database
```

Start the current PARADA API, admin web app, and Expo mobile app together:

```bash
npm run dev          # database + API + admin + mobile
npm run run          # alias for npm run dev
npm run dev:api      # API only (builds services/api, then starts it)
npm run dev:admin    # admin only (Next.js on port 3000)
npm run dev:mobile   # mobile only (Expo LAN mode)
npm run db:prepare   # start database and apply pending migrations
npm run db:stop      # stop the embedded development database when finished
npm run build        # build all workspaces
npm run lint         # lint all workspaces
npm run typecheck    # type check all workspaces
npm run test         # run tests in all workspaces
```

The API listens on port `4000` and the admin web app on port `3000`. Expo/Metro
uses its normal development port, typically `8081`. For a physical device,
set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to an API URL reachable from
the phone, such as `http://<your-LAN-IP>:4000`; `localhost` on the phone is
the phone itself. The API binds to `0.0.0.0` in development so LAN devices can
reach it. The embedded database is persistent and is never reset by the
development workflow. The vision workspace is currently a placeholder and is
not started by the development workflow.

## Phases

The project is developed in phases (see `docs/architecture/roadmap.md`):

1. Project Infrastructure
2. Database
3. Backend Foundation
4. Authentication + Authorization
5. Parking Zones + Slots
6. Occupancy Model + Simulator
7. Admin Web Application
8. Mobile Application
9. OCR / Computer Vision
10. Real-Time Integration
11. Full System Integration
12. Testing + Accuracy Evaluation
13. Deployment
14. Documentation + Final Review

## Documentation

See the `docs/` directory:

- `docs/architecture/` — system architecture and decisions
- `docs/database/` — schema and data model
- `docs/api/` — API reference
- `docs/vision/` — camera / OCR processing
- `docs/testing/` — testing strategy + results
- `docs/deployment/` — deployment guide

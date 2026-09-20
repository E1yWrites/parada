# How to deploy

**Status: Phase 15 (Deployment) is PENDING** — see
[`docs/architecture/roadmap.md`](../architecture/roadmap.md). This guide
documents the build/run mechanics and the release gates already defined in
[`docs/security/phase15-threat-model.md`](../security/phase15-threat-model.md);
it is not a record of a completed production deployment, and no hosting
infrastructure, CI/CD pipeline, or process manager config exists in this
repo yet.

## What exists today

- `npm run build` — builds all workspaces (Turborepo).
- `npm run typecheck`, `npm run lint`, `npm run test` — must all pass before
  any release candidate.
- [`docker-compose.yml`](../../docker-compose.yml) — a standalone Postgres 16
  container as an alternative to the embedded dev database. It is not an
  application deployment manifest; the API, admin, and vision services have
  no container images defined in this repo.

## What's required, not yet built here

These are the **release gates** from the Phase 15 threat model — treat them
as a checklist, not as already satisfied:

1. Set non-default production `DATABASE_URL`, `JWT_SECRET`, and
   `CAMERA_API_KEY`. Production startup must fail when required secrets are
   absent (already enforced in code — see
   [`services/api/src/config/env.ts`](../../services/api/src/config/env.ts)
   — but the actual secret values/provisioning are a deployment task).
2. Keep camera ingress (`POST /zones/:id/events`) behind TLS and a network
   policy in addition to the `X-API-Key` check.
3. Run the full database, API, admin, mobile, types, and vision suites in CI
   with isolated test data — no CI config exists in this repo yet.
4. Review `npm audit --workspaces --omit=dev` advisories package-by-package;
   do not force-upgrade without upgrade-specific regression runs.
5. Confirm payment callbacks are server-authoritative and idempotent before
   enabling payment in production.

## Environment variables to set for any non-local environment

See each package's `.env.example` for the full list
(`.env.example`, `services/api/.env.example`, `apps/admin/.env.example`,
`apps/mobile/.env.example`, `packages/database/.env.example`). At minimum:

| Variable | Where | Notes |
|---|---|---|
| `DATABASE_URL` | API | point at a real PostgreSQL instance, not the embedded dev DB |
| `JWT_SECRET` | API | long random secret, never committed |
| `CAMERA_API_KEY` | API + vision | shared secret for camera ingestion; production rejects a missing effective key |
| `MAIL_TRANSPORT=smtp` + `SMTP_*` | API | `console` transport is development-only |
| `API_BASE_URL` | Admin | server-only; never exposed to the browser |
| `EXPO_PUBLIC_API_URL` | Mobile | must be reachable from end-user devices, not `localhost` |

Admin auth stays HttpOnly-cookie-based and mobile auth stays in SecureStore
in every environment — do not change either to satisfy a deployment
constraint without updating
[`docs/security/phase15-threat-model.md`](../security/phase15-threat-model.md).

## Camera credentials in production

RTSP credentials and `CAMERA_API_KEY` live only in the vision runtime's
environment — never in the database, an API response, or a log. See
[`services/vision/README.md`](../../services/vision/README.md) ("Security")
and [add-a-camera.md](./add-a-camera.md).

## Before claiming a deployment is done

Do not report a deployment as complete without: a passing CI run of every
workspace's suite against isolated data, the release gates above actually
verified in the target environment (not just present in code), and updating
`docs/architecture/roadmap.md`'s Phase 15 status. Per this project's rules,
never claim deployment or infrastructure verification that wasn't actually
performed.

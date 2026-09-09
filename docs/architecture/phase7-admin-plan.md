# Phase 7 — Admin Operations Center: Implementation Plan & Status

## Scope
A secure admin operations web application layered on the existing parada
services API. Every screen talks to the real `services/api` PostgreSQL-backed
pipeline through the Next.js proxy route.

> **Superseded in Phase 12.** This phase shipped with React Query polling and
> assumed no WebSocket/SSE transport. Admin now also holds a Server-Sent Events
> connection through the same-origin relay at `apps/admin/app/api/realtime/route.ts`,
> which invalidates the affected React Query keys as events arrive. See
> `docs/api/README.md` → “Realtime (Server-Sent Events)”.

## Status
Phase 7 is **complete**. Work was done as *audit → preserve → repair →*
*complete → verify*, never as a from-scratch rebuild.

## Architecture
```
Browser ── HttpOnly parada_admin_token cookie ──► Next.js (apps/admin)
                                                     │  /api/auth/* + /api/proxy/*
                                                     ▼
                                              services/api (Express)
                                                     ▼
                              PostgreSQL (embedded pg 18 on :5442)
```

- JWT stored in a `HttpOnly` cookie; never in `localStorage`.
- Next route handlers expose `/api/auth/*` and `/api/proxy/*`; the browser only
  talks to the Next origin.
- Driver (`USER`) accounts are rejected with `403 Forbidden`; unauthenticated
  requests get `401` and the UI redirects to `/login`.

## Admin Routes
| Path | Purpose |
| --- | --- |
| `/login` | Session sign-in form (ADMIN only) |
| `/` | Live dashboard (zones, active sessions, alerts) |
| `/dashboard` | Redirect → `/` |
| `/zones` | Zone occupancy, capacity, low-availability badges |
| `/cameras` | Camera registry with status |
| `/sessions` | Active + historical parking sessions (plate identity, duration) |
| `/vehicles` | Registered vehicles |
| `/anomalies` | UNREGISTERED_PLATE anomalies |
| `/history` | Event history feed |
| `/notifications` | ZONE_FULL / ZONE_LOW_AVAILABILITY alerts, mark read / mark all |
| `/reservations` | Admin-wide reservation monitoring and cancellation |
| `/violations` | Establishment-defined violation review and status updates |
| `/appeals` | Appeal review and ADMIN status transitions |
| `/analytics` | Persisted occupancy, session, fee, reservation, and violation aggregates |
| `/settings` | Establishment fee, guest, zone-default, and violation configuration |
| `/guest-admit` | ADMIN-only guest admission override through the authoritative occupancy pipeline |
| `/simulator` | Deterministic scenario runner (ADMIN only) |

## Auth
- `services/api` holds the source of truth for credentials/roles; sessions
  revoke server-side on logout (verified through the proxy).
- Dev credentials: `admin@parada.local / AdminPass123!`,
  `driver@parada.local / DriverPass123!` (secrets never committed;
  `services/api/.env` + `apps/admin/.env.local` are gitignored).

## Simulator
- `POST /simulator/run` reaches the real pipeline behind `requireRole("ADMIN")`;
  all events persist with `source = SIMULATOR` and deterministic
  `sourceEventId`s. `GET /simulator/status` reports run stats and the supported
  scenarios.
- Verified E2E: SINGLE_ENTRY, SINGLE_EXIT, FILL_ZONE, UNKNOWN_VEHICLE,
  DUPLICATE_EVENT, COMPLETE_PARKING_LIFECYCLE, PLUS overflow rejection →
  ZONE_FULL + ZONE_LOW_AVAILABILITY notifications, UNREGISTERED_PLATE
  anomaly, and genuine `409 CONFLICT` (active-session constraint, duplicate
  `sourceEventId`) surfaced instead of masked.

## Tests
- Verification counts are refreshed at the end of the Phase 7 implementation;
  focused admin coverage includes guest admission, guest sessions, settings,
  notifications, login, auth provider, shell authorization, simulator, and API
  client requests.

## Known Limitations
- No real browser automation in this environment; UI rendering verified via
  jsdom tests + code review (headless curl of HTML/scripts only).
- Session data reflects the live dev database (zones A 4/20, B 20/20 FULL,
  C 0/10) — reset by re-running `db:seed`.
- Low-availability badge uses a fixed occupancy threshold; not yet tunable
  from the UI.
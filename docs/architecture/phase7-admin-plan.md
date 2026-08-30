# Phase 7 — Admin Web Application: Implementation Plan

> **Status: IMPLEMENTED (commit `feat(phase7)`).** This document is the approved
> plan for Phase 7. The admin web application described below has been built in
> `apps/admin` against the **existing** API contract. The backend remains
> authoritative for auth, authorization, occupancy, matching, sessions, cameras,
> anomalies, notifications, and history. Selected additive admin endpoints
> (`/admin/dashboard`, `/admin/cameras`, `/admin/notifications*`,
> `/admin/anomalies`, `/admin/zones`, `/admin/sessions` filters) were added to
> `services/api` to support the dashboard without duplicating logic.

---

## 1. Current Admin App State

`apps/admin` is an **empty stub**. It contains only a `package.json`:

- `name: "@parada/admin"`, version `0.1.0`, private.
- `scripts` are placeholders that print to stdout and exit zero:
  - `build`: `echo "(admin) no build yet"`
  - `dev`: no-op
  - `lint` / `typecheck`: `echo "... ok"`
  - `test`: `echo "(admin) no tests yet"`

There is **no** Next.js, no `tsconfig`, no Tailwind config, no `src/`, no
`app/` directory, no dependencies, no env config, and no `.env.example`.

The Turbo pipeline (`turbo.json`) wires `build`, `dev`, `lint`, `typecheck`,
`test` for every workspace, so the admin package is already registered in the
monorepo and will participate once real scripts/deps are added.

**Conclusion:** the stub is **not** implementation-ready. Phase 7 must scaffold
the full Next.js + TypeScript + Tailwind foundation.

---

## 2. Existing Frontend Dependencies

None. The admin package has zero runtime/dev dependencies.

What is **available to depend on** (from the shared monorepo):

| Package | Contents | Reuse in admin |
|---------|----------|----------------|
| `@parada/types` | Shared domain types (`Role`, `ParkingZone`, `Vehicle`, `Camera`, `ParkingSession`, `Notification`, etc.). **API-client and browser safe** (pure types). | Yes — domain types for API responses. |
| `@parada/config` | `ZONE_OCCUPANCY_LOW_THRESHOLD = 0.2`, `DEFAULT_LIMIT = 20`, `APP_NAME`. Browser safe. | Yes — status thresholds, list defaults. |
| `@parada/database` | Prisma client + Node runtime code. **Server-only — MUST NOT import into the browser.** | No — never imported by admin components/server. |
| `@parada/api` | Express server. Server-only. | No — the admin app consumes the API over HTTP, it does not import it. |

**Key boundary:** `@parada/types` and `@parada/config` are safe to share with
the browser. `@parada/database` and `@parada/api` must **never** be imported into
admin code (Next.js server routes operate via HTTP to the API, not by importing
the API app).

---

## 3. Backend Endpoints Available

Consumed over HTTP. Auth is a **Bearer JWT** (`Authorization: Bearer <token>`),
stateless HS256, server-side revocation via `revoked_tokens`. Every response is
wrapped in `{ "data": <payload> }`; errors are `{ "error": { code, message, details? } }`.

### Public (no auth)
| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | DB connectivity. |

### Auth
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/auth/login` | — | Returns `{ data: { user, token } }`. |
| POST | `/auth/logout` | JWT | Revokes `jti`, returns 204. |
| GET | `/auth/me` | JWT | Returns `PublicUser` (no passwordHash). |

`register` exists but is **not** an admin concern — admins are seeded, not
provisioned through the UI.

### Zones / Occupancy (public — no auth required at current routing)
| Method | Path | Notes |
|--------|------|-------|
| GET | `/zones` | ACTIVE zones only: `[{ id, name, code, capacity, occupiedCount, availableCount }]`. |
| GET | `/zones/:zoneId/occupancy` | `{ zoneId, name, code, capacity, occupiedCount, availableCount, status }`. |

Note: `/zones` returns only `status === "ACTIVE"` zones and does **not** include
`description` or zone `status`. For admin monitoring of inactive zones, a gap
exists (see §19).

### Vehicles / Sessions (JWT, owner-scoped)
| Method | Path | Notes |
|--------|------|-------|
| GET | `/vehicles` | Own active vehicles. |
| POST | `/vehicles` | Register own vehicle. |
| GET | `/vehicles/:id` | Own vehicle. |
| GET | `/sessions` | Own sessions (enriched: zone, vehicle, entry/exit events). |
| GET | `/sessions/active` | Own active session or `null`. |
| GET | `/sessions/:id` | Own session or 404. |

These are **user-scoped**, not admin-scoped. Admin uses `/admin/*` instead.

### Admin (JWT + `requireRole("ADMIN")` — 403 for USER)
| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/sessions` | All sessions, enriched (user.id/name/email, zone, vehicle, entry/exit events), ordered `enteredAt desc`. No `userId` filter/pagination. |
| GET | `/admin/users` | `[{ id, name, email, role, status, createdAt, _count: { vehicles, sessions } }]`. No passwordHash. |
| GET | `/admin/zones/:zoneId/history` | Query `from`/`to` (ISO) + `limit` (1..1000, default 100). Returns `{ zone, from, to, limit, entries: [{ id, occurredAt, occupiedCount, availableCount }] }`. |

### Simulator (JWT + `requireRole("ADMIN")`)
| Method | Path | Notes |
|--------|------|-------|
| POST | `/simulator/run` | 201. Body: `{ scenario, zoneId?, vehicleIds?, unknownPlate?, fillTo? }`. |
| POST | `/simulator/scenario` | 200. Same body. |
| GET | `/simulator/status` | In-memory `{ runs, eventsProcessed, lastRunAt, scenarios[] }`. |

Scenarios: `SINGLE_ENTRY`, `SINGLE_EXIT`, `MULTIPLE_ENTRIES`, `MULTIPLE_EXITS`,
`FILL_ZONE`, `UNKNOWN_VEHICLE`, `DUPLICATE_EVENT`, `COMPLETE_PARKING_LIFECYCLE`.
Because the simulator mutates real occupancy, it is strictly ADMIN-gated.

---

## 4. Backend Endpoints Missing for the Desired Dashboard

The approved dashboard sections (Dashboard, Cameras, Notifications, Anomalies)
require data the current API does not expose. Classification uses the A–D scale:

| Desired screen/data | Endpoint | Status | Class |
|--------------------|----------|--------|-------|
| Dashboard summary (totals, low/full zones, active sessions, recent events/anomalies) | aggregate | **missing** | **B — small addition** |
| Camera listing + online/offline | `GET /admin/cameras` | **missing** | **B — small addition** |
| Notifications listing + unread/read | `GET /admin/notifications`, `PATCH .../read` | **missing** | **B — small addition** |
| Anomalies listing + resolve | `GET /admin/anomalies` | **missing** | **B — small addition** |
| Zone "status" (ACTIVE/INACTIVE + description) | extend `GET /zones` or add `GET /admin/zones` | missing subset | **B — small addition** |
| Per-slot occupancy | — | not part of architecture | **D — out of scope** |
| Camera video feed / streaming | — | not in system | **D — out of scope** |
| Real-time WebSocket updates | — | Phase 10 | **C — future phase** |
| Push notifications | — | Phase 8/10 | **C — future phase** |
| User-management mutations (create/disable) | — | no domain requirement | **D — not required** |

Everything else (zones occupancy, admin sessions, admin users, zone history,
simulator) is **Class A** — the frontend can consume it directly.

The four Class-B additions are **small, read-mostly** admin endpoints that reuse
existing Prisma models. They are the recommended backend scope for Phase 7.

---

## 5. Recommended Admin Information Architecture

```
PARADA ADMIN
├── Login (unauthenticated entry)
└── App shell (JWT + role=ADMIN guard)
    ├── Dashboard            # facility-wide "right now"
    ├── Zones                # zone-level monitoring
    ├── Cameras              # camera registry + status
    ├── Sessions             # active + completed, search/filter
    ├── Users                # account registry + vehicle count
    ├── Notifications        # operational alerts
    ├── Anomalies            # suspicious / unresolved events
    ├── History              # per-zone occupancy trends
    ├── Simulator            # ADMIN-only demo/demo controls
    └── Account              # profile + logout
```

Only sections backed by real endpoints are shown. The dashboard aggregates
existing data via one new endpoint (§19) rather than computing occupancy in
React. Normal `USER` accounts never see the app shell; the backend still enforces
403 on every admin/simulator route.

---

## 6. Proposed Routes / Pages

Next.js App Router. Client-side role gate wraps the layout.

| Route | Section | Data source |
|-------|---------|-------------|
| `/login` | Auth | `POST /auth/login` → `GET /auth/me` |
| `/` | Dashboard | `GET /admin/dashboard` (agg) |
| `/zones` | Zones | `GET /zones` (+ `GET /zones/:id/occupancy`) |
| `/zones/[id]` | Zone detail | occupancy + `GET /admin/zones/:id/history` |
| `/cameras` | Cameras | `GET /admin/cameras` |
| `/sessions` | Sessions | `GET /admin/sessions` (+ detail route) |
| `/sessions/[id]` | Session detail | `GET /admin/sessions` → find local |
| `/users` | Users | `GET /admin/users` |
| `/notifications` | Notifications | `GET /admin/notifications` |
| `/anomalies` | Anomalies | `GET /admin/anomalies` |
| `/history` | History | `GET /admin/zones/:id/history` (zone + range selector) |
| `/simulator` | Simulator | `GET /simulator/status`, `POST /simulator/run` |
| `/account` | Account | `GET /auth/me`, `POST /auth/logout` |

---

## 7. Authentication Strategy

- **Flow:** `POST /auth/login` → store returned token → `GET /auth/me` → if
  `role !== "ADMIN"` deny access to the app with an explicit "admin access
  required" message → else render app shell.
- **Token storage:** the JWT is short-lived (default `1d`) and the backend
  supports server-side revocation (logout is real invalidation). Given the
  operational context, store the token in an **HttpOnly cookie** set by a Next.js
  route handler / server action that proxies login/logout, OR in-memory
  client-side only. **Do not** persist a long-lived JWT to `localStorage` without
  justification. The recommended approach:
  - A Next.js server route (`/api/auth/login`, `/api/auth/logout`, `/api/auth/me`)
    holds the token **in an HttpOnly, SameSite cookie** and calls the backend
    with it. This keeps the JWT out of JavaScript-accessible storage and lets
    the server attach `Authorization` on proxied calls.
  - The client never reads the raw token; it only reads `GET /auth/me` for the
    user object.
- **Role gate:** the frontend hides admin navigation for non-admins, but this is
  UX only. The backend `requireRole("ADMIN")` on `/admin/*` and `/simulator/*`
  is the authoritative control (returns 403 for `USER`).
- **Logout:** call `POST /auth/logout` (revokes the `jti`) then clear the cookie.

---

## 8. API Client Strategy

A single typed client layer, `lib/api`:

- One module per resource with typed functions that call the backend and unwrap
  the `{ data }` envelope, returning `ApiError` objects with the backend's
  `code`/`message` for consistent UI error rendering.
- Auth header/token handled centrally (cookie-based; the server route attaches
  `Authorization: Bearer`).
- Central error normalization: map `401` → session-expired redirect to `/login`;
  `403` → role error; `404` → not-found UI; `409`/`422`/`400` → inline field or
  banner messages.
- Response shapes typed from `@parada/types` where the shape matches; otherwise
  define narrow response interfaces in `lib/api` (e.g. admin session DTO).
- No business logic in components: components receive data/status via the client
  layer's hooks; occupancy-derived values only from backend fields.

---

## 9. State / Data-Fetching Strategy

- Use **TanStack Query** (React Query) as the data layer. Rationale: server-cache
  with `staleTime`, `refetchInterval` for live-ish reading, `invalidateQueries`
  after simulator runs, deduplication of parallel calls, and per-key loading/
  error states — matches an operational dashboard without introducing a global
  store.
- **No global state for domain data.** Auth session (from `GET /auth/me`) is
  the only globally relevant piece; keep it in a small React context fed by the
  server route.
- Dashboard numbers are derived **only** from `GET /admin/dashboard` (backend
  authoritative), never recomputed from frontend raw state.
- Polling: dashboard + zones + notifications poll at a modest interval (e.g.
  `refetchInterval: 15000–30000ms`) rather than real-time sockets (out of scope
  until Phase 10). Avoid stale numbers by keying queries on the endpoint.
- Empty/loading/error states are first-class per query.

---

## 10. Dashboard Data Model

New backend endpoint `GET /admin/dashboard` returns a single authoritative
payload (no separate client aggregation):

```
{
  totalZones, totalCapacity, totalOccupied, totalAvailable,
  zones: [ { zone, occupied, available, occupancyPct, status } ],
  lowZones: [ zone... ],        // available/capacity <= 0.2
  fullZones: [ zone... ],       // occupied === capacity
  activeSessions: number,
  onlineCameras, offlineCameras,
  recentEvents: [ { id, zone, eventType, detectedAt, source } ],
  recentAnomalies: [ { id, anomalyType, zone, createdAt, resolved } ],
  recentNotifications: [ { id, type, zone, message, read, createdAt } ]
}
```

Status derivation is **backend-owned** (mirrors `ZONE_OCCUPANCY_LOW_THRESHOLD`):
`LOW` when `(capacity - occupied) / capacity <= 0.2`, `FULL` when
`occupied >= capacity`, else `AVAILABLE`. The frontend displays these derived
statuses but does not recompute authoritative occupancy in React.

---

## 11. Zone Monitoring Design

- Card/table per zone showing: name/code, capacity, occupied, available,
  occupancy percentage, status, entry camera, exit camera.
- Semantic status with **text + icon + color** (not color-only):
  - `AVAILABLE` (green), `LOW AVAILABILITY` (amber), `FULL` (red),
    `OFFLINE/UNAVAILABLE` (neutral/grey) when zone `status != ACTIVE`.
- **No per-slot visualization.** Zone-level occupancy only (approved architecture).
- Occupancy percentage = `occupied / capacity` computed from backend fields for
  display (not a separate data source).
- Detail page reuses `/zones/:id/occupancy` and links to `/history` for that zone.

---

## 12. Camera Monitoring Design

- `GET /admin/cameras` table: identifier, zone, gate type (ENTRY/EXIT/BIDIRECTIONAL),
  online/offline status, name/location.
- **No fake video.** There is no video streaming in the system; display status,
  not frames. Where activity is shown, it reflects real `OccupancyEvent` history,
  and simulator-authored events are explicitly labeled `SIMULATION / DEMO`
  (backend `source` field distinguishes `CAMERA` vs `SIMULATOR`).
- Clearly label that camera feed / streaming is not part of Phase 7.

---

## 13. Session Management Design

- List (from `GET /admin/sessions`) with the conceptual chain:
  user → vehicle → license plate → zone → entry time → exit time → duration → status.
- Filters/toggles for `ACTIVE` vs `COMPLETED`. Backend currently returns all
  sessions with no query filters; filtering is **client-side** in Phase 7 unless
  the backend adds `status`/`zoneId`/`plate` query params (see §19 — recommended
  small extension), to avoid pulling the full table on every poll.
- Detail view shows the full session chain plus linked entry/exit `OccupancyEvent`
  times.
- **Never expose** password hashes, JWT/revoked-token internals, or API keys.
  The admin user endpoint already omits `passwordHash`; the client must not
  render any such fields.

---

## 14. User Management Design

- Table from `GET /admin/users`: user, email, role, status, registered-vehicle
  count, session count, `createdAt`.
- **Read-only.** No user-create/disable mutations (backend has no such endpoint
  and no capstone domain requirement). Class **D**.
- No password or security fields rendered.

---

## 15. Notification Design

- New `GET /admin/notifications` returns ADMIN-targeted notifications
  (`targetRole = "ADMIN"`): unread/read state, timestamp, zone, type
  (`ZONE_FULL` / `ZONE_LOW_AVAILABILITY`), message, and occupancy context.
- New `PATCH /admin/notifications/:id/read` (and/or
  `POST /admin/notifications/read-all`) to mark read.
- Read state lives in the DB (`Notification.read`) — **no fake client state**.
- No push notifications (Phase 10 / mobile scope).

---

## 16. Anomaly Design

- New `GET /admin/anomalies` lists `OccupancyAnomaly` records: anomaly type
  (`UNREGISTERED_PLATE`, `LOW_CONFIDENCE_PLATE`, `EXIT_WITHOUT_ACTIVE_SESSION`),
  zone, camera, detected plate, description, `resolved` flag, `createdAt`.
- (Optional) `PATCH /admin/anomalies/:id/resolve` so maintainers can mark
  reviewed events as resolved — distinguishing NORMAL from SUSPICIOUS/UNRESOLVED.
- **No fabricated mock data**; only DB-backed records.
- Physical occupancy is already updated by the engine; the anomaly is an audit
  record, not a state the frontend invents.

---

## 17. Occupancy History Design

- Use existing `GET /admin/zones/:zoneId/history` directly: zone selector +
  time-range (`from`/`to`) + `limit`.
- Render occupancy trend (occupied & available over time) and availability
  history. **No `Report` entity** — render from `OccupancyHistory`.
- Do not invent analytics the stored data cannot support (there is no built-in
  downsampling; keep to the `limit` cap and client-side range selection).

---

## 18. Simulator UI Design

- Gated behind ADMIN only (route + backend 403).
- Controls for each scenario: Single Entry, Single Exit, Multiple Entries,
  Multiple Exits, Fill Zone, Unknown Vehicle, Duplicate Event, Complete Lifecycle,
  with the required inputs (zone, vehicleIds, fillTo, unknownPlate) per scenario.
- **Prominent `SIMULATION / DEMO` labeling** — never presented as real camera
  activity. Backend `source = SIMULATOR` keeps it distinguishable.
- After a run, `GET /simulator/status` and `invalidataQueries` for dashboard,
  zones, sessions, notifications, anomalies so all views stay consistent.
- Uses `POST /simulator/run`.

---

## 19. Required Backend Additions

Minimal, read-mostly admin endpoints reusing existing Prisma models. All are
Class B (small additions), admin-gated. Grouped into two tiers:

**Tier 1 (required for the approved dashboard sections):**
- `GET /admin/dashboard` — authoritative facility summary (§10).
- `GET /admin/cameras` — camera registry + status (§12).
- `GET /admin/notifications` — ADMIN notifications (unread/read) (§15).
- `PATCH /admin/notifications/:id/read` (mark-read) (§15) — small mutation,
  genuine domain need (admins act on alerts).
- `GET /admin/anomalies` — anomaly listing (§16).
- `GET /admin/zones` or extend `GET /zones` to include `status`/`description`
  and allow admin to see INACTIVE zones (§3 gap).

**Tier 2 (optional, improve UX over large data):**
- Query params on `GET /admin/sessions`: `status`/`zoneId`/`plate`/`pagination`
  so the admin can filter server-side instead of client-side over the full table.

**Not required (Class D):** user-management mutations, camera/zone management
mutations, per-slot endpoints. Do not modify the Prisma schema for frontend
convenience; all Tier-1 additions read/write existing tables only.

---

## 20. Required Frontend Dependencies

Runtime:
- `next` (App Router), `react`, `react-dom`
- `@tanstack/react-query`
- `tailwindcss`, `postcss`, `autoprefixer` (via `@tailwindcss/postcss` or classic
  config)
- `@parada/types`, `@parada/config` (workspace)

Dev:
- `typescript`, `@types/react`, `@types/react-dom`, `@types/node`
- `eslint`, `eslint-config-next`
- Testing: `jest`, `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `jsdom`, `ts-jest` (or Vitest if preferred —
  align to repo's existing Jest usage)

Iconography: a small icon set (e.g. `lucide-react`) or inline SVG — decide at
implementation to keep dependencies lean. Use a date utility only if needed
(e.g. `date-fns`) for formatting history ranges; avoid large date libs otherwise.

---

## 21. Testing Strategy

Backend tests (16 existing across app/simulator/vision + DB) must keep passing —
this plan adds no backend schema change and only additive admin endpoints whose
behavior is covered by new API tests.

Admin testing tiers:
- **API client tests** — typed client functions unwrap `{ data }` and normalize
  errors; mock `fetch`.
- **Auth tests** — login handler, invalid credentials, role!=ADMIN rejection,
  expired/revoked token → redirect.
- **Role/route protection tests** — a `USER` hitting an admin fetch gets 403 →
  denied UI; rendering-level route guards.
- **Dashboard data tests** — component renders the single authoritative payload;
  status text/icon mapping verified (AVAILABLE / LOW / FULL / OFFLINE).
- **Loading states** — each query shows a loading placeholder.
- **Error states** — 4xx/5xx render the backend message + retry.
- **Empty states** — no zones / no sessions / no notifications render an
  appropriate empty message, not a broken table.
- **Component tests** — zones, sessions, users, notifications, anomalies,
  history, simulator form validation.

CI/verification: `turbo typecheck`, `turbo lint`, `turbo build`, and `turbo test`
must all pass; confirm the 84 existing tests (17 DB + 67 API) remain green.

---

## 22. Implementation Phases (within Phase 7)

Phase 7 implementation, delivered in increments:

1. **Scaffold** — Next.js App Router + TS + Tailwind, wire into `turbo.json`
   tasks, add deps, `.env.example` (`NEXT_PUBLIC_API_URL`), base layout.
2. **Auth foundation** — server route proxy for login/logout/me, HttpOnly cookie,
   role gate, `/login` + `/account` pages, role-route tests.
3. **API client + query layer** — typed client, TanStack Query provider,
   polling, error/loading/empty primitives; API-client tests.
4. **Tier-1 backend endpoints** (`/admin/dashboard`, `/admin/cameras`,
   `/admin/notifications` + mark-read, `/admin/anomalies`) + API tests.
5. **Dashboard + zones**, **sessions + users**.
6. **Notifications + anomalies + history**.
7. **Simulator UI** (ADMIN-gated, SIMULATION/DEMO labeled).
8. **Responsive polish, accessibility pass, build/lint/typecheck/test green.**

---

## 23. Potential Architectural Risks

- **CORS / origin:** the API currently has no CORS middleware. If the admin is
  served from a different origin/port than the API, add permissive-but-scoped CORS
  or route all calls through Next.js server (recommended) to avoid CORS entirely.
- **Token security:** storing a long-lived JWT in `localStorage` risks XSS theft.
  Mitigated by HttpOnly cookie proxy (§7).
- **Data size:** `/admin/sessions` and `/admin/users` return unbounded rows; client
  filtering can degrade. Add pagination/filter params (Tier 2) if data grows.
- **Polling staleness:** over-weighting client polling can cause stale dashboard
  numbers. Use backend-authoritative dashboard payload + invalidate on mutations,
  and modest `refetchInterval` (no WebSockets until Phase 10).
- **Boundary violations:** importing `@parada/database`/`@parada/api` into the
  Next.js browser bundle would bloat it and leak server code. Enforce the shared-package
  boundary with the API-client-only rule.
- **Shared-type drift:** the enriched admin session/user DTOs don't exactly match
  plain `@parada/types` models; keep narrow DTOs in the client and consider
  adding them to `@parada/types` only if useful cross-package.
- **Node version:** environment runs Node 24 but `.nvmrc` pins 18; Next.js and
  build tooling should target Node 18+ compatibility to avoid CI drift.

---

## 24. Explicitly Out of Scope (Phase 7)

- Mobile application (`apps/mobile`) — Phase 8.
- Real OCR / YOLO / PaddleOCR — Phase 9.
- Physical camera integration and any camera video streaming / fake live feeds.
- Real-time WebSockets / Socket.IO live updates — Phase 10.
- Push notifications.
- Payment / billing.
- In-app navigation (drivers) — mobile app.
- Slot-level computer-vision occupancy (zone-level is authoritative).
- Per-slot occupancy visualization.
- User/camera/zone management **mutations** (no backend / no domain requirement).
- Server-side report entity / advanced analytics not supported by stored data.

---

## Summary of Backend Work Entering Implementation

Only Tier-1 additions (all additive, admin-gated, existing tables): 
`GET /admin/dashboard`, `GET /admin/cameras`, `GET /admin/notifications`,
`PATCH /admin/notifications/:id/read`, `GET /admin/anomalies`, and a zones-list
extension to expose `status`/`description`. No Prisma schema changes. All existing
84 tests must remain green and new admin endpoints covered by API tests.

# PARADA API

Backend HTTP API (`services/api`). Node.js + Express + TypeScript, backed by the
`@parada/database` Prisma client.

## Running

```bash
cp .env.example .env   # set DATABASE_URL, PORT, NODE_ENV, JWT_SECRET
npm run build
npm start              # or: npm run dev
```

Health check: `GET /health` returns `{ "data": { "status": "ok", "database": "connected" } }`.

### Local Development (no Docker/root)

The repo ships an **embedded PostgreSQL 18** dev instance so the full stack runs
without Docker or a system Postgres:

```bash
# packages/database
npm run db:start      # embedded Postgres on :5432 (background, pid in .embedded-pg/)
npm run db:migrate    # apply schema migrations to the dev DB
npm run seed          # seed dev users/zones/cameras/vehicles

# root of the API service
cp .env.example .env  # set DATABASE_URL, JWT_SECRET (see below)
npm start             # API on :4000
```

Then start the Admin app (`apps/admin`, Next.js) which proxies API calls through
its own server route. Stop the dev DB with `npm run db:stop`.

> The dev data lives in `packages/database/.embedded-pg/` (gitignored). Deleting
> that directory resets the local database; `npm run db:migrate` + `npm run seed`
> recreate it.

## Response & Error Conventions

- Success: `{ "data": <payload> }`
- Error: `{ "error": { "code", "message", "details? } }`

Error codes map to HTTP status:

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `BAD_REQUEST` | Malformed/missing/invalid input |
| 401 | `UNAUTHORIZED` | Not authenticated or invalid/expired/revoked token |
| 403 | `FORBIDDEN` | Insufficient role (USER vs ADMIN) |
| 404 | `NOT_FOUND` | Unknown zone/camera/route/resource |
| 409 | `CONFLICT` | Idempotency/full/empty/zone-mismatch/duplicate/forbidden status transition |
| 422 | `UNPROCESSABLE` | Semantically invalid payload (e.g. weak password) |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded (includes `Retry-After` header) |
| 500 | `INTERNAL` | Unexpected error |

## Authentication

Stateless JWT (HS256) with server-side revocation for logout. Token payload:

```json
{ "sub": "<userId>", "jti": "<uuid>", "role": "USER|ADMIN" }
```

- `jti` (JWT ID) is a unique token identifier used for revocation.
- On logout, the `jti` is stored in `revoked_tokens` table; subsequent requests with that token are rejected (401).
- Token expiry configured via `JWT_EXPIRES_IN` (default `1d`).

### Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Create account (USER role only) |
| POST | `/auth/login` | No | Verify credentials, return JWT |
| POST | `/auth/logout` | Yes | Revoke current token server-side |
| GET | `/auth/me` | Yes | Return current user profile |

#### `POST /auth/register`

```json
{ "name": "John Doe", "email": "john@example.com", "password": "Password123!" }
```

- Password min 8 characters.
- Returns `{ user: PublicUser, token: string }`.
- Role is always `USER` (ADMIN granted only via seed/admin action).

#### `POST /auth/login`

```json
{ "email": "john@example.com", "password": "Password123!" }
```

- Generic error message prevents user enumeration.
- Returns `{ user: PublicUser, token: string }`.

#### `POST /auth/logout`

Requires `Authorization: Bearer <token>`. Revokes the token's `jti`. Returns `204`.

#### `GET /auth/me`

Requires `Authorization: Bearer <token>`. Returns `PublicUser` (no `passwordHash`).

### Making Authenticated Requests

Include the JWT in the `Authorization` header:

```
Authorization: Bearer <token>
```

## Authorization

### Roles

- `USER` — Default role. Can manage own vehicles, view own sessions.
- `ADMIN` — Can access admin endpoints (`/admin/*`), view all sessions/users.

### Ownership Enforcement

- `GET /vehicles`, `POST /vehicles`, `GET /vehicles/:id` — scoped to authenticated user's `userId`.
- `GET /sessions`, `GET /sessions/active`, `GET /sessions/:id` — scoped to authenticated user's `userId`.
- Client-supplied `userId` is **ignored**; ownership derived from token.
- Admin endpoints (`/admin/sessions`, `/admin/users`) require `ADMIN` role (403 for USER).

## Endpoints

### `GET /zones`
Public; active zones with live occupancy and a derived availability summary
(consumed by the mobile app map/list without extra round-trips):
```
{ "data": [ { "id","name","code","capacity","occupiedCount","availableCount","status","availability" } ] }
```
`availability` = `AVAILABLE` | `LOW_AVAILABILITY` | `FULL` | `OFFLINE`
(fraction free <= `ZONE_OCCUPANCY_LOW_THRESHOLD`, default 0.2, => `LOW_AVAILABILITY`;
`occupiedCount >= capacity` => `FULL`; `status != ACTIVE` => `OFFLINE`).

### `GET /zones/:zoneId/occupancy`
Live occupancy for one zone (same payload fields as `/zones`, including `availability`).

### `POST /zones/:zoneId/events`
The **camera input boundary** — a gate camera / vision service reports a
detected vehicle behavior. Runs the full occupancy transition in one transaction.

Authentication: when `CAMERA_API_KEY` is configured, the request must include
`X-API-Key: <CAMERA_API_KEY>` (401 otherwise). Not set = open (trusted local
dev only). See `docs/vision/architecture.md`.

Request body (the **normalized vision event contract**):
```jsonc
{
  "cameraIdentifier": "cam-a-entry",   // required, unique camera identifier
  "sourceEventId": "evt-0001",          // required, client-supplied idempotency key
  "eventType": "ENTRY" | "EXIT",        // required, gate direction
  "detectedPlate": "ABC-1234",          // optional, raw plate from OCR
  "ocrConfidence": 0.96,                // optional, 0..1
  "detectedAt": "2026-08-29T10:00:00Z"  // optional, defaults to now
}
```

Camera validations (in order):
1. Zone exists (404).
2. Camera exists (404).
3. Camera belongs to the zone (409).
4. Camera is ONLINE (409 if OFFLINE).
5. Direction compatible — `ENTRY` camera accepts only ENTRY, `EXIT` camera only
   EXIT, `BIDIRECTIONAL` accepts both (409 on mismatch).

Behavior (single `$transaction`):
1. Bounds-check: entry when full -> 409; exit when empty -> 409.
2. Update `parking_zone.occupiedCount`, insert `occupancy_event` + `occupancy_history`.
3. Normalize the plate (`ABC-1234` -> `ABC1234`) and match registered vehicles:
   - exactly one match **and** OCR confidence at/above `OCR_PLATE_CONFIDENCE_THRESHOLD` -> link vehicle; on ENTRY open an `ACTIVE` session, on EXIT close it (sets `exitEventId`, `exitedAt`, `durationSeconds`, `status=COMPLETED`).
   - no match, ambiguous (multiple-owner), **or confidence below threshold** -> record event with `plateMatched=false`, **no session**. Physical occupancy is still updated. Unknown/low-confidence ENTRYs and EXITs without an ACTIVE session are recorded as `OccupancyAnomaly` for admin review (no fabricated session).
4. Idempotency: duplicate `(cameraId, sourceEventId)` -> 409 (`P2002` mapped to `CONFLICT`).

Returns `201` with the created `occupancy_event`.

## Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `CAMERA_API_KEY` | *(unset)* | Shared key the vision service sends via `X-API-Key`. Unset = open (dev only). |
| `OCR_PLATE_CONFIDENCE_THRESHOLD` | `0.5` | Minimum OCR confidence to trust a plate as vehicle identity. |

## Anomalies

`OccupancyAnomaly` records pipeline mismatches for admin review without
fabricating data:
- `UNREGISTERED_PLATE` — valid physical ENTRY, unknown plate.
- `LOW_CONFIDENCE_PLATE` — plate below the confidence threshold.
- `EXIT_WITHOUT_ACTIVE_SESSION` — valid EXIT, no matching ACTIVE session.

Occupancy is updated in all of these cases; only the vehicle identity/session
is `null`/absent.


### `GET /vehicles` (auth required)
List authenticated user's registered vehicles.

### `POST /vehicles` (auth required)
Register a new vehicle for the authenticated user.
```json
{ "plateNumber": "ABC-1234", "vehicleType": "CAR" }
```
- `plateNumber` normalized (uppercase, alphanumeric only).
- Duplicate plate for same user -> 422.

### `GET /vehicles/:id` (auth required)
Get a specific vehicle (only if owned by authenticated user).

### `GET /sessions` (auth required)
List authenticated user's parking sessions (with zone, vehicle, entry/exit events).

### `GET /sessions/active` (auth required)
Get authenticated user's currently active session, or `null`.

### `GET /sessions/:id` (auth required)
Get a specific session (only if owned by authenticated user).

### `GET /admin/sessions` (ADMIN required)
List all parking sessions across all users with user, zone, vehicle, events.

### `GET /admin/users` (ADMIN required)
List all users with vehicle/session counts (no password hashes).

### `GET /admin/zones/:zoneId/history` (ADMIN required)
Time-filtered occupancy history for a single zone. Uses the existing
`OccupancyHistory` snapshots written on every occupancy transition.

| Query | Default | Meaning |
|-------|---------|---------|
| `from` | — | ISO date; include history at/after this time (400 if invalid) |
| `to` | — | ISO date; include history at/before this time (400 if invalid) |
| `limit` | `100` | Integer 1..1000 (400 otherwise) |

Returns:
```jsonc
{
  "data": {
    "zone": { "id","name","code","capacity" },
    "from": "<iso>|null", "to": "<iso>|null", "limit": 100,
    "entries": [ { "id","occurredAt","occupiedCount","availableCount" } ]
  }
}
```

## Admin API (ADMIN role only)

Every route below is mounted behind `requireRole("ADMIN")` — `401` when
unauthenticated, `403` for `USER` roles. The Admin web app (`apps/admin`)
authenticates through the Next.js proxy route (`/api/auth/*`, `/api/proxy/*`)
using the JWT stored in the `HttpOnly` `parada_admin_token` cookie.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/dashboard` | Facility summary + zone overview + recent activity/anomalies/notifications |
| GET | `/admin/zones` | All zones with live occupancy + assigned gate cameras |
| GET | `/admin/cameras` | All cameras with zone and recent events |
| GET | `/admin/sessions` | All parking sessions (user, zone, vehicle, duration) |
| GET | `/admin/users` | All users with vehicle/session counts (no hashes) |
| GET | `/admin/vehicles` | All registered vehicles with owners |
| GET | `/admin/notifications` | ADMIN-targeted notifications + `unreadCount` |
| PATCH | `/admin/notifications/:id/read` | Mark one notification read (`200` + the updated notification) |
| GET | `/admin/anomalies` | Occupancy anomalies for admin review |

### `GET /admin/dashboard`

One-shot rendering payload for the dashboard:

```jsonc
{
  "data": {
    "summary": { "totalZones","totalCapacity","totalOccupied","totalAvailable",
                 "occupancyPct","activeSessions","onlineCameras","offlineCameras" },
    "zones": [ { "id","name","code","description","capacity","occupiedCount",
                 "availableCount","occupancyPct","status","availability" } ],
    "recentEvents": [ { "id","zoneId","eventType","detectedPlate","source","detectedAt" } ],
    "recentAnomalies": [ /* latest anomalies */ ],
    "recentNotifications": [ /* latest ADMIN notifications */ ]
  }
}
```

### `GET /admin/zones`

Includes `cameras` (id + status) plus `entryCamera` / `exitCamera` gate objects,
so the zone detail view can render gate direction and camera health without an
extra round-trip.

### `PATCH /admin/notifications/:id/read`

Sets `read = true` on one notification. Returns `204`.

## Driver Endpoints (auth required)

All are scoped to the authenticated user; ownership comes from the token and a
client-supplied user id is never trusted.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/zones/recommendation` | Least-occupied suitable zone, or `{ recommendedZone: null }`. Public. A recommendation is NOT an assignment. |
| GET | `/zones/establishment` | Navigation destination; `null` until an admin configures one. |
| POST | `/assignments` | Accept a zone (`{zoneId, vehicleId}`). One ACTIVE assignment per vehicle; expired ones are released automatically. |
| GET | `/assignments`, `/assignments/:id` | The user's assignments. |
| POST | `/reservations` | Hold a zone (`{zoneId, vehicleId, startAt?, endAt?}`). Reservations are serialized per zone (PostgreSQL advisory lock) and refused when capacity plus existing holds would be exceeded; overlapping duplicates for the same user/vehicle/zone return `409 CONFLICT`, non-overlapping windows are allowed. |
| GET | `/reservations`, `/reservations/:id` | The user's reservations; window-expired ones are flipped to EXPIRED lazily. |
| PATCH | `/reservations/:id/cancel` | Cancel an own reservation. |
| POST | `/sessions/entry` | User-initiated entry (`{vehicleId, zoneId, enteredAt?}`). |
| POST | `/sessions/:id/exit` | User-initiated exit; computes and persists the fee. |
| GET | `/violations` | The user's own establishment violations. |
| POST | `/violations/:id/appeal` | Dispute an own violation (`{reason}`). One appeal per violation, only while PENDING. |
| GET | `/notifications` | The user's own alerts (`?unread=true`, `?limit=`). Returns `{notifications, unreadCount}`. |
| PATCH | `/notifications/:id/read` | Mark one of the user's own notifications read. |

### Fees

The first `baseDurationHours` (default 2h) costs a flat `baseFee` (default
₱20); every started additional hour adds `additionalFeePerHour` (default ₱10).
So 2h00 → ₱20, 2h01 → ₱30, 3h00 → ₱30, 3h01 → ₱40. Both exit paths — the
camera pipeline and the user-initiated one — persist a `ParkingFee`. Guest
sessions are charged under the same policy with a null `userId`.

### Violations

Establishment-defined parking violations, not law enforcement. A wrong-zone
entry is a warning on the first offence; once a vehicle has exhausted its
warning allowance the next one issues a `WRONG_ZONE` violation with the
configured fine and notifies the driver.

## Rate Limiting

All limits are per fixed window unless otherwise noted, enforced
in-memory, and scoped to the resource that actually needs protection. They are
**per-process**: scale-out to multiple API instances requires a shared, distributed
limiter (e.g. Redis) — single-instance deployments are fully protected today.

| Scope | Shared key | Default | Window |
|-------|-----------|---------|--------|
| Auth (register + login) | All credential attempts (IP-agnostic) | 10 | 1 min |
| Camera event ingestion | Trusted `cameraIdentifier` from the body (falls back to client IP) | 300 | 1 min |
| Admin mutations (POST/PATCH/PUT/DELETE) | Authenticated admin user id (`ADMIN` role only) | 120 | 1 min |

- Responses over the limit are `429 TOO_MANY_REQUESTS` and include a `Retry-After`
  header (seconds).
- A `429` is **not** an authentication failure: session tokens remain valid and
  callers can keep performing reads (admin reads are not throttled).
- Overrides per environment: `AUTH_RATE_LIMIT`, `CAMERA_EVENT_RATE_LIMIT`,
  `ADMIN_RATE_LIMIT` (requests/minute). Tests inject tighter per-app limits.

## Additional Admin Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET/PUT | `/admin/config` | Establishment settings (fees, guest policy, zone defaults, violation fines, location). |
| GET | `/admin/reservations` | All reservations with their owners. |
| PATCH | `/admin/reservations/:id/cancel` | Cancel any reservation not already terminal. |
| GET | `/admin/violations` | All violations with user, vehicle, zone, session and appeal. |
| PATCH | `/admin/violations/:id/status` | Set a violation status. Enforced as a state machine: a PENDING violation may only be dismissed (DISMISSED); terminal states (APPROVED-UPHELD, DISMISSED, FINE_PAID) can never be reopened, and `FINE_PAID` is reserved for the (future) payment flow. Invalid enum values are `400`, disallowed transitions `409`. The acting identity always comes from the token, never the body. |
| GET | `/admin/appeals` | All appeals with their violations. |
| PATCH | `/admin/appeals/:id/status` | `APPROVED` dismisses the violation, `REJECTED` upholds it; the driver is notified either way. |
| GET | `/admin/analytics` | Occupancy, sessions, revenue, peak hour over `?from`/`?to`. |
| POST | `/admin/guest-admit` | Admit a guest against policy. Auditable; the acting admin comes from the token. |

## Occupancy Simulator (ADMIN only)

The **simulator control plane** is a deterministic development/ops tool for
exercising the real occupancy pipeline. It is **not computer vision** — real OCR
is integrated separately (Phase 9). Every simulated event is a
`NormalizedVisionEvent` submitted through `OccupancyService.processEvent(..., "SIMULATOR")`;
it **never modifies** `occupiedCount`, sessions, events, or history directly.

Because the simulator can artificially change parking occupancy, all routes are
`ADMIN`-only (401 unauthenticated, 403 for `USER`).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/simulator/run` | Run a scenario (returns `201`) |
| POST | `/simulator/scenario` | Run a scenario (returns `200`) |
| GET | `/simulator/status` | In-memory run stats + supported scenarios |

`POST /simulator/run` body:
```jsonc
{
  "scenario": "SINGLE_ENTRY",   // required, one of the scenarios below
  "zoneId": "z_...",            // optional, defaults to first zone
  "vehicleIds": ["v_...", ...], // optional, registered vehicles to use
  "unknownPlate": "XXX-9999",   // optional, plate for UNKNOWN_VEHICLE
  "fillTo": 12                  // optional, target occupancy for FILL_ZONE
}
```

**Scenarios (deterministic, reproducible):**

| Scenario | Behavior |
|----------|----------|
| `SINGLE_ENTRY` | One registered vehicle enters. |
| `SINGLE_EXIT` | One registered vehicle exits (closes its `ACTIVE` session). |
| `MULTIPLE_ENTRIES` | Each provided vehicle enters. |
| `MULTIPLE_EXITS` | Each provided vehicle exits. |
| `FILL_ZONE` | Fills the zone to capacity (registered vehicles first, then unknown plates). |
| `UNKNOWN_VEHICLE` | A non-registered plate enters; occupancy updates, no fake vehicle/user/session, an `OccupancyAnomaly` is recorded. |
| `DUPLICATE_EVENT` | Submits the same `(cameraId, sourceEventId)` twice; the duplicate is rejected (409). |
| `COMPLETE_PARKING_LIFECYCLE` | ENTRY → ACTIVE session → EXIT → `COMPLETED` session with `durationSeconds`. |

Sources are recorded as `SIMULATOR` (never `CAMERA`/`MANUAL`). A real camera
event and a simulated event are therefore distinguishable in the audit trail.

### Occupancy notifications

While processing any event (including simulated ones), the pipeline generates
**ADMIN-targeted** operational notifications **on state transitions only** (no
spam while a zone stays in the same state):

- `ZONE_FULL` — the zone first becomes full (`occupiedCount == capacity`).
- `ZONE_LOW_AVAILABILITY` — availability first drops to
  `availableCount/capacity <= ZONE_OCCUPANCY_LOW_THRESHOLD` (default `0.2`).

A zone that drains and refills beyond a threshold is treated as a fresh
transition and emits again. `capacity <= 0` zones never notify. Notifications are
created inside the same transaction as the occupancy change.

## Tests

`npm test` runs `jest` against the dedicated `parada_test_api` database (the
`jest.setup.ts` guard refuses to run against any other DB). `@parada/database`
tests use their own `parada_test` DB so the two suites can run in parallel under
Turborepo without clobbering each other.

Both test databases run on the canonical local Postgres port (`5432`). With the
embedded dev DB running, provision them once:

```bash
npm run db:test:setup -w @parada/database   # create + migrate parada_test & parada_test_api
npx turbo test
```

`db:test:setup` is idempotent — safe to re-run. The integration suites wipe the
`parada_test*` tables at start, so the seeded dev data in `parada` is never touched.

## Development Credentials

Seeded dev accounts (passwords are development-only, never use in production):

| Email | Password | Role |
|-------|----------|------|
| `admin@parada.local` | `AdminPass123!` | ADMIN |
| `driver@parada.local` | `DriverPass123!` | USER |

Pre-registered vehicles:
- `driver@parada.local`: `ABC-1234` (CAR), `XYZ-5678` (MOTORCYCLE)
- `admin@parada.local`: `MNO-9999` (VAN)
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

All commands run from the repo root:

```bash
npm run db:start                          # embedded Postgres on :5442 (background, pid in .embedded-pg/)
npm run db:migrate -w @parada/database    # apply schema migrations to the dev DB
npm run seed       -w @parada/database    # seed dev users/zones/cameras/vehicles

cp services/api/.env.example services/api/.env   # set DATABASE_URL, JWT_SECRET (see below)
npm run dev:api                           # builds and starts the API on :4100
```

`npm run dev` starts the database, API, admin and Expo together; `npm run dev:api`
is the API-only path.

Then start the Admin app (`npm run dev:admin`), which proxies API calls through
its own server route. Stop the dev DB with `npm run db:stop`.

> The dev data lives in `packages/database/.embedded-pg/` (gitignored). Deleting
> that directory resets the local database; `npm run db:migrate -w @parada/database`
> + `npm run seed -w @parada/database` recreate it.

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
{ "sub": "<userId>", "jti": "<uuid>", "role": "USER|ADMIN", "tv": 0 }
```

- `jti` (JWT ID) is a unique token identifier used for revocation.
- On logout, the `jti` is stored in `revoked_tokens` table; subsequent requests with that token are rejected (401).
- `tv` is the account's `tokenVersion` at issue time. A password change or
  reset increments it, so every token issued before the change is rejected
  (401) on its next request; the change/reset response carries a fresh token.
- Every authenticated request also re-checks that the account still exists
  and is `ACTIVE`.
- Token expiry configured via `JWT_EXPIRES_IN` (default `1d`).

### Account verification and recovery

Registration creates the account **unverified** and mails a 6-digit code
(10-minute expiry, single use, 5 wrong guesses burn it, 60 s resend
cooldown). Login answers `403 EMAIL_NOT_VERIFIED` until the code is confirmed;
its `details` carry `{ email, verification }` so a client can resume the
verification step without registering again (a fresh code is issued on that
login when the cooldown allows). Password reset uses a 256-bit hex token
(30-minute expiry, single use) delivered as `parada://reset-password?token=…`.
Only an HMAC-SHA256 of each secret is stored (`verification_tokens`); the
plaintext exists only in the outbound mail. Mail goes through the transport
configured by `MAIL_TRANSPORT` / `SMTP_*` (see `.env.example`); production
refuses to start without SMTP, development can print mail to stdout, and the
test suites use an in-memory transport.

### Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Create account (USER role only), mail verification code. **No token.** |
| POST | `/auth/verify-email` | No | `{email, code}` — confirm the code; the account becomes usable |
| POST | `/auth/resend-verification` | No | `{email}` — generic `202`; new code only for unverified accounts, 60 s cooldown (`429` with `resendAvailableAt`) |
| POST | `/auth/login` | No | Verify credentials, return JWT (`403 EMAIL_NOT_VERIFIED` while unverified) |
| POST | `/auth/forgot-password` | No | `{email}` — generic `202`; mails a single-use 30-minute reset token when the account exists |
| POST | `/auth/reset-password` | No | `{token, newPassword}` — consumes the token, invalidates every session |
| POST | `/auth/logout` | Yes | Revoke current token server-side |
| GET | `/auth/me` | Yes | Return current user profile |
| PATCH | `/auth/me` | Yes | `{name?, username?}` — username unique (case-insensitive), `null` clears it |
| POST | `/auth/password` | Yes | `{currentPassword, newPassword, confirmPassword?}` — returns `{user, token}`; every other session is invalidated |
| POST | `/auth/me/email` | Yes | `{email}` — start an email change; code mailed to the NEW address; `pendingEmail` recorded, current email stays authoritative |
| POST | `/auth/me/email/confirm` | Yes | `{code}` — the new address becomes `email` (409 if taken meanwhile) |
| DELETE | `/auth/me/email` | Yes | Cancel a pending email change |
| POST | `/auth/me/phone` | Yes | `{phone}` — start a phone change (code mailed to the verified email; there is no SMS provider); `{phone: null}` clears it immediately |
| POST | `/auth/me/phone/confirm` | Yes | `{code}` — apply the pending phone |
| PUT | `/auth/me/avatar` | Yes | Raw image bytes as the body (JPEG/PNG/WebP sniffed from magic bytes, ≤ 2 MB) |
| DELETE | `/auth/me/avatar` | Yes | Remove the profile picture |
| GET | `/users/:id/avatar` | Yes | The picture (owner or ADMIN only); `ETag`, `Cache-Control: private` |

All unauthenticated credential endpoints share one rate-limit bucket
(`AUTH_RATE_LIMIT`, default 10/min per IP). Responses never include
`passwordHash`; passwords, codes and tokens are never logged.

#### `POST /auth/register`

```json
{ "name": "John Doe", "email": "john@example.com", "password": "Password123!" }
```

- Password 8–128 characters; email validated and lower-cased; name 2–80 characters.
- Returns `{ user: AuthUser, verification: { expiresAt, resendAvailableAt } }` — **no token** until `/auth/verify-email` succeeds.
- Role is always `USER` (ADMIN granted only via seed/admin action).

#### `POST /auth/login`

```json
{ "email": "john@example.com", "password": "Password123!" }
```

- Generic error message prevents user enumeration.
- Returns `{ user: AuthUser, token: string }`; `AuthUser` carries `username`,
  `phone`, `emailVerifiedAt`, `pendingEmail`, `pendingPhone` and
  `avatarUpdatedAt` (null when no picture is stored).

#### `POST /auth/logout`

Requires `Authorization: Bearer <token>`. Revokes the token's `jti`. Returns `204`.

#### Zone navigation coordinates

`GET /zones`, `GET /zones/recommendation` and every admin zone payload carry
`navigationLat` / `navigationLng` — the zone's own Directions target, set by an
admin through `POST /admin/zones` / `PATCH /admin/zones/:id` (both or neither;
validated server-side to -90..90 / -180..180, `400` for a lone value, `422`
for an out-of-range one). Both are `null` until configured; the API never
infers a point and clients disable Directions for such a zone.

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

- `GET /vehicles`, `POST /vehicles`, `GET|PATCH|DELETE /vehicles/:id` — scoped to authenticated user's `userId`.
- `PATCH /auth/me`, `/auth/me/*`, `PATCH /assignments/:id/cancel` — always the token's own user; no target id is accepted.
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
  "cameraIdentifier": "cam-a-main-gate",   // required, unique camera identifier
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
| `MAIL_TRANSPORT` | `smtp` when `SMTP_HOST` is set, else `console` | `smtp` = any SMTP-compatible provider via `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM` (**required in production**; startup fails otherwise). `console` prints mail to stdout (development only). `memory` is the test transport (never valid in production). |
| `APP_NAME` | `PARADA` | Product name used in verification / reset mail. |
| `MAIL_ORGANIZATION` | `LPU-Batangas Main Campus` | Establishment named in mail headers/footers. Templates live in `services/api/src/mail/templates.ts` (plain text + branded HTML). |
| `MOBILE_APP_SCHEME` | `parada` | Deep-link scheme in the password-reset mail (must match `apps/mobile/app.json` `scheme`). |
| `AUTH_RATE_LIMIT` | `10` | Credential endpoints per minute per IP (register, login, verify, resend, forgot, reset share one bucket). Raise for shared/NAT egress. |
| `TRUST_PROXY` | *(unset)* | Express `trust proxy` setting: a hop count (`1` behind one TLS reverse proxy), `true`/`false`, or a comma-separated address/subnet list. Unset = `X-Forwarded-For` is ignored. Required behind a reverse proxy, or every client shares the proxy's address and one `AUTH_RATE_LIMIT` budget. |

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
{ "plateNumber": "ABC-1234", "vehicleType": "CAR", "make": "Toyota", "model": "Vios", "color": "Red" }
```
- `plateNumber` normalized (uppercase, alphanumeric only; 2–12 characters).
- `make` / `model` / `color` are optional descriptive fields (never identity).
- Duplicate ACTIVE plate for same user -> 422; plate ACTIVE on another account -> 409
  (database partial unique index `vehicles_one_active_per_normalized_plate`).
- Re-registering a plate this user previously unregistered reactivates the
  same row (history stays linked).

### `GET /vehicles/:id` (auth required)
Get a specific vehicle (only if owned by authenticated user and ACTIVE).

### `PATCH /vehicles/:id` (auth required)
Edit `plateNumber`, `vehicleType`, `make`, `model`, `color` (all optional;
`null` clears a descriptive field). A **plate** change is refused with `409`
(`details.reason` = `ACTIVE_SESSION` / `ACTIVE_ASSIGNMENT` /
`ACTIVE_RESERVATION`) while the vehicle is parked, assigned or reserved,
because the plate is what the gate camera matches.

### `DELETE /vehicles/:id` (auth required)
Unregister: the row becomes `INACTIVE` and is never deleted — sessions,
violations and fees keep pointing at it. Refused with the same `409` reasons
while the vehicle is in use. An INACTIVE vehicle is not listed, cannot be
assigned/reserved/entered, and is no longer matched by the camera pipeline
(the plate reads as unregistered).

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
| POST | `/admin/zones` | Create a zone (unique `code`; duplicate is `409`) |
| PATCH | `/admin/zones/:id` | Update a zone (capacity may not drop below occupancy + protecting reservations) |
| GET | `/admin/zones/:id/slots` | Physical slot inventory for a zone (layout only, never occupancy) |
| POST | `/admin/zones/:id/slots` | Replace a zone's physical slot inventory (`201`) |
| POST | `/admin/cameras` | Register a gate camera (immutable `identifier`, zone, gate direction) |
| PATCH | `/admin/cameras/:id` | Update a camera's zone, direction or `ONLINE`/`OFFLINE` status |

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

Sets `read = true` on one notification. Returns `200` with the updated
notification (including its zone), or `404` if the id is unknown.

## Driver Endpoints (auth required)

All are scoped to the authenticated user; ownership comes from the token and a
client-supplied user id is never trusted.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/zones/recommendation` | Least-occupied suitable zone, or `{ recommendedZone: null }`. Public. A recommendation is NOT an assignment. |
| GET | `/zones/establishment` | Navigation destination; `null` until an admin configures one. |
| POST | `/assignments` | Accept a zone (`{zoneId, vehicleId}`). One ACTIVE assignment per vehicle; expired ones are released automatically. |
| GET | `/assignments`, `/assignments/:id` | The user's assignments. |
| PATCH | `/assignments/:id/cancel` | Release an accepted recommendation **before entry**. Only the owner, only while `ACTIVE` and unexpired, and only while the vehicle has no ACTIVE parking session (`409` otherwise). The row stays as history with status `CANCELLED`; nothing about occupancy, reservations or sessions changes, and the vehicle may be assigned again immediately. Publishes `ASSIGNMENT_CANCELLED`. |
| POST | `/reservations` | Hold a zone (`{zoneId, vehicleId, startAt?, endAt?}`). Reservations are serialized per zone (PostgreSQL advisory lock) and refused when capacity plus existing holds would be exceeded; overlapping duplicates for the same user/vehicle/zone return `409 CONFLICT`, non-overlapping windows are allowed. A hold protects a space only until the holder arrives: a successful entry (camera or `POST /sessions/entry`) flips it to `ACTIVE`, and an `ACTIVE` reservation no longer counts against capacity because the vehicle is now in `occupiedCount` (Phase 13). |
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

## Realtime (Server-Sent Events)

Phase 12. Authoritative backend changes are pushed to connected Admin and Mobile
clients over Server-Sent Events. **Realtime is delivery only** — the database and
domain layer stay authoritative, an event is published only *after* its
transaction has committed, and no client ever creates parking state from an
event. A rolled-back mutation publishes nothing.

```
Camera/Vision → API → Domain → DB COMMIT → RealtimeHub → Admin / Mobile
```

### `GET /realtime/stream` (auth required)

Mounted behind the shared auth middleware: no token or an invalid token is
`401`. Responds `200 text/event-stream` and holds the connection open.

Frames are standard SSE. Every domain event carries the hub's sequence number on
the `id:` line, which is what both `EventSource` implementations echo back as
`Last-Event-ID` when they reconnect:

```
id: 42
event: ZONE_OCCUPANCY_UPDATED
data: {"type":"ZONE_OCCUPANCY_UPDATED","occurredAt":"2026-09-09T08:15:00.000Z","seq":42,"payload":{ ... }}
```

A `: heartbeat` comment is sent every 25s to keep intermediaries from closing an
idle connection. A user is capped at **5 concurrent connections**; over the cap
the server writes an `event: ERROR` frame and closes that one connection.

### Event envelope

| Field | Meaning |
|-------|---------|
| `type` | Discriminant; also the SSE `event:` name |
| `seq` | Hub-assigned, strictly increasing. **The only ordering key.** |
| `occurredAt` | ISO wall clock, for display. **Not** an ordering key — two events can share a millisecond |
| `payload` | Per-type body; the same shapes the REST endpoints already return |

Only the hub assigns `seq`, so no route can mint an ordering position. The shared
types are in `packages/types/src/realtime.ts` (`RealtimeEventInput` is what a
producer publishes, `RealtimeEvent` is what a client receives); `isRealtimeEvent`
is the runtime guard clients apply to every decoded frame.

### Events and audience

| Event | Audience | Published from |
|-------|----------|----------------|
| `ZONE_OCCUPANCY_UPDATED` | PUBLIC | `POST /zones/:zoneId/events` (camera/vision), `POST /sessions/entry`, `POST /sessions/:id/exit`, `POST /admin/guest-admit`, `POST /simulator/run`, `PATCH /admin/zones/:id` (capacity/status edits) |
| `PARKING_SESSION_STARTED` | owner | `POST /sessions/entry`, camera ENTRY for a registered vehicle (Phase 13) |
| `PARKING_SESSION_COMPLETED` | owner | `POST /sessions/:id/exit`, camera EXIT for a registered vehicle (Phase 13) |
| `RESERVATION_CREATED` | owner | `POST /reservations` |
| `RESERVATION_CANCELLED` | owner | `PATCH /reservations/:id/cancel`, `PATCH /admin/reservations/:id/cancel` |
| `ASSIGNMENT_CREATED` | owner | `POST /assignments` |
| `ASSIGNMENT_CANCELLED` | owner | `PATCH /assignments/:id/cancel` |
| `VIOLATION_CREATED` | owner | camera pipeline (wrong-zone violation) |
| `GUEST_ADMISSION_ISSUE` | ADMIN | camera pipeline, `POST /admin/guest-admit` |
| `NOTIFICATION_CREATED` | owner, or ADMIN for operational alerts | `POST /violations/:id/appeal`, `PATCH /admin/appeals/:id/status`, every `Notification` the occupancy pipeline writes (`ZONE_FULL`, `ZONE_LOW_AVAILABILITY`, `GUEST_ADMISSION_ISSUE`, `WRONG_ZONE_WARNING`, `VIOLATION_ISSUED` — Phase 13) |

Authorization is enforced per connection, on delivery **and on replay**:

- An `ADMIN` connection receives every event (the operations dashboard).
- A `USER` connection receives PUBLIC events and events addressed to their own
  user id — never another user's, and never an ADMIN-scoped event.

There is no slot-level event: occupancy is zone-level only.

### Reconnect and missed-event recovery

On reconnect a client presents its cursor as the `Last-Event-ID` header (browsers
and `react-native-sse` do this automatically) or as `?lastEventId=`. A malformed
cursor is treated as no cursor rather than failing the stream.

The hub keeps a **bounded in-memory buffer of the most recent 500 events** and
replays the ones after that cursor, re-authorized against the reconnecting
client. Replay is served from memory — never from the database.

When the cursor has aged out of the buffer the hub cannot honour it, and says so
instead of implying continuity:

```
event: SYNC
data: {"reason":"GAP","sinceSeq":0,"headSeq":712}
```

A `SYNC` frame carries **no parking state**. It is the client's signal to refetch
authoritative state over REST. Clients also refetch core queries on any reconnect
as a safety net.

### Stale and out-of-order protection

`seq` only ever moves forward, so a client that has acted on `seq = N` drops any
frame at or below `N` — stale, duplicated, or arriving out of order. Clients keep
this cursor across reconnects and only ever call React Query's
`invalidateQueries` in response to an event; they never write event payloads into
the cache, so an out-of-order frame can never revert fresher server state in the
UI.

### Auth failure boundary

A realtime transport failure is **not** an authentication failure. `EventSource`
surfaces every timeout, DNS, TLS and `429` through the same error callback with
no status attached, so neither client clears its query cache, clears the admin
cookie, nor invalidates the mobile token on a stream error. Only an explicit
`401` from the existing REST clients invalidates credentials.

### Admin transport

The admin browser cannot send a bearer token (the JWT is in an `HttpOnly`
cookie), so it connects to the same-origin relay `GET /api/realtime`
(`apps/admin/app/api/realtime/route.ts`). That route reads the cookie
server-side, confirms the session is `ADMIN` (`403` otherwise), opens the
bearer-authenticated upstream connection, forwards `Last-Event-ID`, and streams
the body straight through. The JWT never reaches browser JavaScript. Mobile
connects to `/realtime/stream` directly with the bearer token it already holds.

### Scope limit

The sequence counter and replay buffer are **per API process**. A single instance
is correct; behind a load balancer each instance would keep its own counter and a
client reconnecting to a different instance receives a `SYNC` gap (safe — it
refetches). Shared sequencing across instances is not implemented.

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
is integrated separately (Phase 11, `services/vision`). Every simulated event is a
`NormalizedVisionEvent` submitted through `OccupancyService.processEvent(..., "SIMULATOR")`;
it **never modifies** `occupiedCount`, sessions, events, or history directly.

Because the simulator can artificially change parking occupancy, all routes are
`ADMIN`-only (401 unauthenticated, 403 for `USER`).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/simulator/run` | Run a scenario (returns `201`) |
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

Both test databases run on the embedded dev cluster's port (`5442`). With the
embedded dev DB running, provision them once:

```bash
npm run db:test:setup -w @parada/database   # create + migrate parada_test & parada_test_api
npm run test                                # all workspaces (turbo)
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

Seeded zones and gate cameras (LPU-Batangas Main Campus, Capitol Site — data in
`packages/database/src/seed/lpuBatangas.ts`; coordinates are installer notes
only, zones carry no geometry):

| Zone | Code | Capacity | Cameras (all `BIDIRECTIONAL`, `ONLINE`) |
|------|------|---------:|------------------------------------------|
| Main Loop | `A` | 30 | `cam-a-main-gate` (P. Herrera cor. Doña Aurelia), `cam-a-north-gate` (Doña Aurelia) |

The establishment navigation destination is the main gate,
`13.76447, 121.06462` (`EstablishmentConfig.location`).
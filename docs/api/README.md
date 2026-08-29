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
| 409 | `CONFLICT` | Idempotency/full/empty/zone-mismatch/duplicate |
| 422 | `UNPROCESSABLE` | Semantically invalid payload (e.g. weak password) |
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
Active zones with live occupancy:
```
{ "data": [ { "id","name","code","capacity","occupiedCount","availableCount" } ] }
```

### `GET /zones/:zoneId/occupancy`
Live occupancy for one zone.

### `POST /zones/:zoneId/events`
The **camera input boundary** — a gate camera reports a detected vehicle behavior.
Runs the full occupancy transition in one DB transaction.

Request body:
```jsonc
{
  "cameraIdentifier": "cam-a-entry",   // required, unique camera identifier
  "sourceEventId": "evt-0001",          // required, client-supplied idempotency key
  "eventType": "ENTRY" | "EXIT",        // required
  "detectedPlate": "ABC-1234",          // optional, from OCR
  "ocrConfidence": 0.96,                // optional, 0..1
  "detectedAt": "2026-08-29T10:00:00Z"  // optional, defaults to now
}
```

Behavior (single `$transaction`):
1. Validate zone exists (404) and camera exists in that zone (404/409).
2. Bounds-check: entry when full -> 409; exit when empty -> 409.
3. Update `parking_zone.occupiedCount`, insert `occupancy_event` + `occupancy_history`.
4. Match the normalized plate against registered `vehicle`s:
   - exactly one match -> link vehicle; on ENTRY open an `ACTIVE` session, on EXIT close it (sets `exitEventId`, `exitedAt`, `durationSeconds`, `status=COMPLETED`).
   - no match (or ambiguous multiple-owner plate) -> record event with `plateMatched=false`, **no session**.
5. Idempotency: duplicate `(cameraId, sourceEventId)` -> 409 (`P2002` mapped to `CONFLICT`).

Returns `201` with the created `occupancy_event`.

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

## Tests

`npm test` runs `jest` against the dedicated `parada_test_api` database (the
`jest.setup.ts` guard refuses to run against any other DB). `@parada/database`
tests use their own `parada_test` DB so the two suites can run in parallel under
Turborepo without clobbering each other.

## Development Credentials

Seeded dev accounts (passwords are development-only, never use in production):

| Email | Password | Role |
|-------|----------|------|
| `admin@parada.local` | `AdminPass123!` | ADMIN |
| `driver@parada.local` | `DriverPass123!` | USER |

Pre-registered vehicles:
- `driver@parada.local`: `ABC-1234` (CAR), `XYZ-5678` (MOTORCYCLE)
- `admin@parada.local`: `MNO-9999` (VAN)
# PARADA API

Backend HTTP API (`services/api`). Node.js + Express + TypeScript, backed by the
`@parada/database` Prisma client. Deferred to Phase 4: `/auth` and authorization
guards. All routes below are currently unauthenticated.

## Running

```bash
cp .env.example .env   # set DATABASE_URL, PORT, NODE_ENV
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
| 401 | `UNAUTHORIZED` | Not authenticated (Phase 4) |
| 403 | `FORBIDDEN` | Insufficient role (Phase 4) |
| 404 | `NOT_FOUND` | Unknown zone/camera/route |
| 409 | `CONFLICT` | Idempotency/full/empty/zone-mismatch |
| 422 | `UNPROCESSABLE` | Semantically invalid payload |
| 500 | `INTERNAL` | Unexpected error |

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

## Tests

`npm test` runs `jest` against the dedicated `parada_test_api` database (the
`jest.setup.ts` guard refuses to run against any other DB). `@parada/database`
tests use their own `parada_test` DB so the two suites can run in parallel under
Turborepo without clobbering each other.

# PARADA Database Model

Authoritative data model for the PostgreSQL database. Prisma schema lives in
`packages/database/prisma/schema.prisma` and is the source of truth.

## Entities (9)

| Entity | Purpose |
|--------|---------|
| `User` | Mobile drivers + admins. Single table; `role` enum `USER / ADMIN`. |
| `Vehicle` | A user-owned vehicle; the primary identity for OCR/plate workflows. License plate is the OCR key. |
| `ParkingZone` | A physical parking area with fixed `capacity`. |
| `ParkingSlot` | **Physical inventory / layout only.** NOT camera-derived occupancy. |
| `Camera` | A standard camera at a zone gate (ENTRY / EXIT / BIDIRECTIONAL). |
| `OccupancyEvent` | The critical single write-point for occupancy changes (ENTRY/EXIT). |
| `OccupancyHistory` | Immutable snapshot of zone occupancy state over time (analytics/audit). |
| `ParkingSession` | **Vehicle-identified** parking presence (a real session exists only for a registered vehicle). |
| `Notification` | Minimal admin + driver alerts (zone full / low availability). |

No `Report` table — reports are generated dynamically from `OccupancyHistory`.

## Key Design Decisions

### Zone-level occupancy is authoritative
`availableCount = capacity - occupiedCount`. `availableCount` is **derived** and never stored.

### `occupiedCount` is cached on the zone
Stored for O(1) reads on mobile/admin, kept consistent transactionally. Bounded by a
database `CHECK` constraint:

```
CHECK ("occupiedCount" >= 0 AND "occupiedCount" <= "capacity")
```

This prevents negative and over-capacity occupancy at the database level.

### ParkingSlots are not live occupancy
`ParkingSlot.status` reflects **physical inventory** status (`ACTIVE/INACTIVE`), never
camera-derived occupancy. Per-slot state is intentionally out of scope (approved decision).

### Idempotency
`OccupancyEvent` has a unique constraint on `(cameraId, sourceEventId)`. A camera re-sending
the same event (same source id) is rejected. Distinct events are never silently dropped.

### Transactional consistency
Every occupancy change runs in a single DB transaction in the backend (Phase 3):
validate -> bounds-check -> update zone -> insert event -> insert history -> create/close session.

### Deletion strategy (RESTRICT)
All historical child records (`occupancy_events`, `occupancy_history`, `parking_sessions`,
`notifications`, `cameras`, `parking_slots`) reference the zone with `onDelete: Restrict`.
Deleting a zone is blocked while it has history, so analytics data is never destroyed.
Zones are deactivated via `status = INACTIVE`, not hard-deleted.

### Vehicle identity & plate normalization
Vehicles are registered by users; the **normalized license plate** is the OCR match key.
`normalizePlate()` uppercases and strips non-alphanumeric characters (e.g. `ABC-1234` → `ABC1234`),
which is **flexible/length-preserving** so raw OCR reads still match. `normalizedPlate` is **unique per
user** (`@@unique([userId, normalizedPlate])`), so two users may register the same physical plate,
but a single user cannot register it twice.

### Vehicle-identified sessions
`ParkingSession` is tied to a registered vehicle and its owner:
- `userId` + `vehicleId` are **NOT NULL** (identity is required).
- Lifecycle: ENTRY → `ACTIVE` → EXIT → `COMPLETED`.
- `entryEventId` unique (one session per entry); `exitEventId` nullable + unique; `durationSeconds` computed on exit.
- A database **partial unique index** enforces at most one `ACTIVE` session per vehicle:
  ```
  CREATE UNIQUE INDEX parking_sessions_one_active_per_vehicle
  ON parking_sessions("vehicleId") WHERE status = 'ACTIVE';
  ```

### Unknown / unregistered vehicle
When a detected plate does **not** match a registered vehicle, an `OccupancyEvent` is recorded
(with `detectedPlate`, `normalizedPlate`, `ocrConfidence`, `plateMatched = false`) so occupancy counts
stay correct, but **no `ParkingSession` is created** (a session requires a real vehicle identity).
`OccupancyEvent.vehicleId` is nullable (`onDelete: SetNull`).

## Important Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| `users` | unique `email` | auth lookup |
| `vehicles` | unique `(userId, normalizedPlate)`; `(normalizedPlate)`, `(userId)` | plate match per user |
| `parking_zones` | unique `code`, unique `name` | lookups, dedup |
| `parking_slots` | unique `(zoneId, slotCode)` | slot inventory per zone |
| `cameras` | unique `identifier`; `zoneId` | camera identity + per-zone |
| `occupancy_events` | `(zoneId, detectedAt)`, `(eventType)`, `(vehicleId)`, unique `(cameraId, sourceEventId)` | dedup + history queries |
| `occupancy_history` | `(zoneId, occurredAt)` | analytics/reports/time ranges |
| `parking_sessions` | `(zoneId, status)`, `(vehicleId, status)`, `(userId)`, `(enteredAt)` | active session counts, session history |
| `parking_sessions` | partial unique `(vehicleId)` where `status='ACTIVE'` | one active session per vehicle |
| `notifications` | `(targetRole, read)`, `(createdAt)` | alert fetching |

## Migrations

- `20260829141334_init` — initial schema (8 entities + enums + constraints + indexes).
- `20260829143014_add_vehicle_and_session_identity` — additive: `Vehicle`, `VehicleType`/`VehicleStatus` enums, `OccupancyEvent` plate fields, `ParkingSession.userId/vehicleId` (NOT NULL), one-active-session-per-vehicle partial unique index.
- `20260829151408_add_revoked_token` — `RevokedToken` table for server-side JWT logout revocation (`jti`).
- `20260830002352_add_occupancy_anomaly` — `OccupancyAnomaly` entity (unknown plate / low confidence / exit without session) indexed by `anomalyType` and `resolved`.

Use `prisma migrate dev` for development, `prisma migrate deploy` for environments.
`db push` is not the permanent strategy.

## Local Development Database

When running without Docker, `@parada/database` provides an **embedded
PostgreSQL 18** dev instance (no root/system Postgres required):

```bash
npm run db:start   -w @parada/database   # start on :5432 (background)
npm run db:stop    -w @parada/database   # stop it (reads .embedded-pg/server.pid)
npm run db:migrate -w @parada/database   # apply migrations to the dev DB
npm run seed       -w @parada/database   # seed dev data (dev credentials only)
npm run db:test:setup -w @parada/database  # create + migrate parada_test(_api) for jest
```

Data persists in `packages/database/.embedded-pg/` (gitignored). The dev instance
uses the same defaults as Docker Compose (`tcp://parada:changeme@127.0.0.1:5432`),
so configs swap between the two unchanged.

## Seed Data (dev only — fake data)

- Zones: `A` (20), `B` (20), `C` (10)
- Slots: `A01`–`A20`, `B01`–`B20`, `C01`–`C10`
- Cameras: Entry + Exit per zone (6 total)
- Users: `admin@parada.local` (ADMIN), `driver@parada.local` (USER)
  (argon2id-hashed passwords — dev-only, never reuse in production)
- Vehicles: 3 registered — driver owns `ABC-1234` (CAR) + `XYZ-5678` (MOTORCYCLE); admin owns
  `MNO-9999` (VAN) — demonstrates multiple vehicles per user.

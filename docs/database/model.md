# PARADA Database Model

Authoritative data model for the PostgreSQL database. Prisma schema lives in
`packages/database/prisma/schema.prisma` and is the source of truth.

## Entities (18)

| Entity | Purpose |
|--------|---------|
| `User` | Mobile drivers + admins. Single table; `role` enum `USER / ADMIN`. |
| `Vehicle` | A user-owned vehicle; the primary identity for OCR/plate workflows. License plate is the OCR key. |
| `ParkingZone` | A physical parking area with fixed `capacity`. |
| `ParkingSlot` | **Physical inventory / layout only.** NOT camera-derived occupancy. |
| `Camera` | A standard camera at a zone gate (ENTRY / EXIT / BIDIRECTIONAL). |
| `OccupancyEvent` | The critical single write-point for occupancy changes (ENTRY/EXIT). |
| `OccupancyAnomaly` | Pipeline mismatches recorded for admin review instead of fabricated data. |
| `OccupancyHistory` | Immutable snapshot of zone occupancy state over time (analytics/audit). |
| `ParkingSession` | Parking presence from entry to exit. Vehicle-identified for registered drivers; account-less for admitted guests. |
| `GuestSession` | Guest/walk-in admission record wrapping a `ParkingSession`. |
| `ParkingFee` | The fee computed and persisted when a session completes. |
| `Reservation` | A capacity-protecting hold on a zone for a window. |
| `ZoneAssignment` | A driver accepting a zone. Not a reservation and not a session. |
| `Violation` | Establishment-defined violation (e.g. wrong zone), with its status state machine. |
| `ViolationAppeal` | A driver's dispute of one violation, reviewed by an admin. |
| `Notification` | Admin + driver alerts (zone state, violations, appeal outcomes). |
| `EstablishmentConfig` | Single-row establishment settings: fees, guest policy, zone defaults, violation fines, location. |
| `RevokedToken` | `jti` values revoked at logout, for server-side JWT invalidation. |
| `UserAvatar` | One profile picture per user (client-resized JPEG/PNG/WebP bytes, ≤ 2 MB) kept in the database so the single-instance deployment needs no file volume. |
| `VerificationToken` | One-time secrets: registration / email-change / phone-change 6-digit codes and password-reset tokens. Only an HMAC of the secret is stored; single use (`consumedAt`), expiring, attempt-limited. |

No `Report` table — reports are generated dynamically from `OccupancyHistory`.

**Recommendation ≠ Assignment ≠ Reservation ≠ Session.** These are four distinct
records with distinct lifecycles and are never collapsed into one another.

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

### Sessions and identity
`ParkingSession` is tied to a registered vehicle and its owner for driver sessions:
- `userId` + `vehicleId` are **nullable**. They are always set for a registered
  session; they are null only for account-less GUEST sessions (walk-ins admitted
  under the establishment guest policy), which are wrapped by a `GuestSession`
  row. `ParkingFee.userId` mirrors the same nullability.
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
| `vehicles` | partial unique `(normalizedPlate)` where `status='ACTIVE'` | one active vehicle per physical plate |
| `parking_zones` | unique `code`, unique `name` | lookups, dedup |
| `parking_slots` | unique `(zoneId, slotCode)` | slot inventory per zone |
| `cameras` | unique `identifier`; `zoneId` | camera identity + per-zone |
| `occupancy_events` | `(zoneId, detectedAt)`, `(eventType)`, `(vehicleId)`, unique `(cameraId, sourceEventId)` | dedup + history queries |
| `occupancy_history` | `(zoneId, occurredAt)` | analytics/reports/time ranges |
| `parking_sessions` | `(zoneId, status)`, `(vehicleId, status)`, `(userId)`, `(enteredAt)` | active session counts, session history |
| `parking_sessions` | partial unique `(vehicleId)` where `status='ACTIVE'` | one active session per vehicle |
| `notifications` | `(targetRole, read)`, `(createdAt)` | alert fetching |
| `zone_assignments` | partial unique `(vehicleId)` where `status='ACTIVE'` | one active assignment per vehicle |

## Migrations

- `20260829141334_init` — initial schema (8 entities + enums + constraints + indexes).
- `20260829143014_add_vehicle_and_session_identity` — additive: `Vehicle`, `VehicleType`/`VehicleStatus` enums, `OccupancyEvent` plate fields, `ParkingSession.userId/vehicleId` (NOT NULL), one-active-session-per-vehicle partial unique index.
- `20260829151408_add_revoked_token` — `RevokedToken` table for server-side JWT logout revocation (`jti`).
- `20260830002352_add_occupancy_anomaly` — `OccupancyAnomaly` entity (unknown plate / low confidence / exit without session) indexed by `anomalyType` and `resolved`.
- `20260904091734_add_phase1_shared_contracts` — `EstablishmentConfig`, `Reservation`, `ZoneAssignment`, `Violation`, `ViolationAppeal`, `ParkingFee` and `GuestSession` tables plus their relations.
- `20260904100000_add_notification_user_id` — `Notification.userId`, so a notification can target one driver rather than only a role.
- `20260904115711_guest_session_accountless` — drops `NOT NULL` from `parking_sessions.userId`/`vehicleId` for account-less guest sessions.
- `20260905093000_add_establishment_location` — establishment latitude/longitude for GPS navigation.
- `20260906120000_fees_guests_and_integrity_indexes` — `parking_fees.userId` made nullable for guest fees; partial unique indexes `vehicles_one_active_per_normalized_plate` and `zone_assignments_one_active_per_vehicle`.
- `20260914120000_account_lifecycle_and_zone_navigation` — `ZoneAssignmentStatus.CANCELLED` (driver release before entry, kept as history); `users.username` (unique), `phone`, `emailVerifiedAt` (existing rows backfilled as verified), `pendingEmail`, `pendingPhone`, `passwordChangedAt`, `tokenVersion`; `user_avatars`; `verification_tokens` + `VerificationPurpose` enum; `vehicles.make/model/color`; `parking_zones.navigationLat/navigationLng` (per-zone Directions target, null until an admin configures it).

- `20260918090000_session_completed_notification` — `NotificationType.SESSION_COMPLETED`, so a
  driver is told their session closed and what the fee was.

Use `prisma migrate dev` for development, `prisma migrate deploy` for environments.

### Constraints that live only in migration SQL

Four integrity rules cannot be expressed in the Prisma schema language: Prisma has no
`CHECK` support, and `@@unique` has no `WHERE` clause. They exist **only** in the migration
SQL above, so any schema-first path — `prisma db push`, or recreating a database from
`schema.prisma` instead of replaying migrations — produces a database that looks correct,
passes typechecking, and silently permits data the application treats as impossible.

| Constraint | Introduced in | Protects |
| --- | --- | --- |
| `parking_zones_occupied_in_bounds` (CHECK) | `20260829141334_init` | `0 <= occupiedCount <= capacity`; the last line of defence behind the atomic occupancy update |
| `parking_sessions_one_active_per_vehicle` | `20260829143014_add_vehicle_and_session_identity` | One ACTIVE session per vehicle under concurrent gate events |
| `vehicles_one_active_per_normalized_plate` | `20260906120000_fees_guests_and_integrity_indexes` | One ACTIVE registration per plate across all users |
| `zone_assignments_one_active_per_vehicle` | `20260906120000_fees_guests_and_integrity_indexes` | One ACTIVE assignment per vehicle; the domain pre-check alone is racy |

Rules for any environment holding real data:

- Apply schema changes with `prisma migrate deploy`. Never `prisma db push`.
- After migrating, verify all four are present before serving traffic:

  ```sql
  SELECT conname FROM pg_constraint WHERE conname = 'parking_zones_occupied_in_bounds';
  SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexdef LIKE '%WHERE%';
  ```

  The second query must return exactly the three partial unique indexes above.
- `packages/database/src/database.test.ts` asserts all four at the database level. Those
  cases are the only thing that fails if one is dropped — the API's own tests pass either
  way, because the domain layer pre-checks the same rules before writing.

## Local Development Database

When running without Docker, `@parada/database` provides an **embedded
PostgreSQL 18** dev instance (no root/system Postgres required):

```bash
npm run db:start   -w @parada/database   # start on :5442 (background)
npm run db:stop    -w @parada/database   # stop it (reads .embedded-pg/server.pid)
npm run db:migrate -w @parada/database   # apply migrations to the dev DB
npm run seed       -w @parada/database   # seed dev data (dev credentials only)
npm run db:test:setup -w @parada/database  # create + migrate parada_test(_api) for jest
```

Data persists in `packages/database/.embedded-pg/` (gitignored). The dev instance
uses the same defaults as Docker Compose (`postgresql://parada:changeme@127.0.0.1:5442`),
so configs swap between the two unchanged. Port `5442` is deliberate: the default
`5432` collides with a system Postgres on the primary Windows development machine.

## Seed Data (dev only — fake data)

- Zones: `A` (20), `B` (20), `C` (10)
- Slots: `A01`–`A20`, `B01`–`B20`, `C01`–`C10`
- Cameras: Entry + Exit per zone (6 total)
- Users: `admin@parada.local` (ADMIN), `driver@parada.local` (USER)
  (argon2id-hashed passwords — dev-only, never reuse in production)
- Vehicles: 3 registered — driver owns `ABC-1234` (CAR) + `XYZ-5678` (MOTORCYCLE); admin owns
  `MNO-9999` (VAN) — demonstrates multiple vehicles per user.

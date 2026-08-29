# PARADA Database Model

Authoritative data model for the PostgreSQL database. Prisma schema lives in
`packages/database/prisma/schema.prisma` and is the source of truth.

## Entities (8)

| Entity | Purpose |
|--------|---------|
| `User` | Mobile drivers + admins. Single table; `role` enum `USER / ADMIN`. |
| `ParkingZone` | A physical parking area with fixed `capacity`. |
| `ParkingSlot` | **Physical inventory / layout only.** NOT camera-derived occupancy. |
| `Camera` | A standard camera at a zone gate (ENTRY / EXIT / BIDIRECTIONAL). |
| `OccupancyEvent` | The critical single write-point for occupancy changes (ENTRY/EXIT). |
| `OccupancyHistory` | Immutable snapshot of zone occupancy state over time (analytics/audit). |
| `ParkingSession` | ANONYMOUS parking presence (no vehicle/plate/identity, no ANPR). |
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

### Anonymous sessions
`ParkingSession` has NO vehicle identity. Lifecycle: ENTRY -> ACTIVE -> EXIT -> COMPLETED.
`entryEventId` unique (one session per entry), `exitEventId` nullable + unique.
`durationSeconds` computed on exit.

## Important Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| `users` | unique `email` | auth lookup |
| `parking_zones` | unique `code`, unique `name` | lookups, dedup |
| `parking_slots` | unique `(zoneId, slotCode)` | slot inventory per zone |
| `cameras` | unique `identifier`; `zoneId` | camera identity + per-zone |
| `occupancy_events` | `(zoneId, detectedAt)`, `(eventType)`, unique `(cameraId, sourceEventId)` | dedup + history queries |
| `occupancy_history` | `(zoneId, occurredAt)` | analytics/reports/time ranges |
| `parking_sessions` | `(zoneId, status)`, `(enteredAt)` | active session counts, session history |
| `notifications` | `(targetRole, read)`, `(createdAt)` | alert fetching |

## Migrations

- `20260829141334_init` — initial schema (all 8 entities + enums + constraints + indexes).

Use `prisma migrate dev` for development, `prisma migrate deploy` for environments.
`db push` is not the permanent strategy.

## Seed Data (dev only — fake data)

- Zones: `A` (20), `B` (20), `C` (10)
- Slots: `A01`–`A20`, `B01`–`B20`, `C01`–`C10`
- Cameras: Entry + Exit per zone (6 total)
- Users: `admin@parada.local` (ADMIN), `driver@parada.local` (USER)
  (placeholder password hashes — real hashing added in Phase 4)

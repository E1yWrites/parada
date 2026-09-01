# PARADA Development Roadmap

Project developed incrementally (agile). Each phase: objective -> files -> dependencies ->
assumptions -> clarifications -> implement -> test -> fix -> typecheck -> lint -> build ->
document -> STOP.

| Phase | Title | Status |
|-------|-------|--------|
| 0 | Requirements + Architecture | DONE |
| 1 | Project Infrastructure | DONE |
| 2 | Database | DONE |
| 3 | Backend Foundation | DONE |
| 4 | Authentication + Authorization | DONE |
| 5 | Vision/OCR Integration Foundation | DONE |
| 6 | Occupancy Model + Simulator | DONE |
| 7 | Admin Web Application | DONE |
| 8 | Mobile Application | PENDING |
| 9 | OCR / Computer Vision (real model) | PENDING |
| 10 | Real-Time Integration | PENDING |
| 11 | Full System Integration | PENDING |
| 12 | Testing + Accuracy Evaluation | PENDING |
| 13 | Deployment | PENDING |
| 14 | Documentation + Final Review | PENDING |

## Architecture Decisions (ADR)

Key decisions from Phase 0 (user-approved [USER CLARIFICATION]):

1. **Gate-based entry/exit counting** for zone occupancy.
2. **Zone-level availability is the authoritative metric.** Slots are layout/inventory/visual only.
3. **Vehicle identity IS required** [USER CLARIFICATION, architecture correction]: users register
   vehicles; the license plate is the primary OCR identity. Unknown/unregistered plates record an
   OccupancyEvent only (no session). `ParkingSession.userId/vehicleId` NOT NULL; `normalizedPlate`
   unique per user; a partial unique index prevents multiple ACTIVE sessions per vehicle.
   (Replaced the earlier, uncommitted "anonymous events" decision.)
4. **Navigation** = GPS to facility + internal zone guidance.
5. **Notifications** = admin + driver alerts.
6. **Roles** = User + Admin only.

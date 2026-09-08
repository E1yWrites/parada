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
| 6 | Guest Admission + Reservations + Zone Assignment Integration | DONE |
| 7 | Admin Web Application | DONE |
| 8 | Mobile Application | DONE |
| 9.1-9.8 | Mobile integration, recommendation, assignment, reservation, GPS navigation, current-parking state, cache transitions, UX polish | DONE |
| 9.9 | Mobile visual redesign (light theme) | DONE |
| 10 | Admin Web UI overhaul | DONE |
| 10.1 | System audit remediation (occupancy atomicity, camera-exit fees, assignment expiry, plate identity, reservation capacity, violations/appeals, driver notifications) | DONE |
| 11 | OCR / Computer Vision (real model) | DONE |
| 12 | Real-Time Integration | PENDING |
| 13 | Full System Integration | PENDING |
| 14 | Testing + Accuracy Evaluation | PENDING |
| 15 | Deployment | PENDING |
| 16 | Documentation + Final Review | PENDING |

## Architecture Decisions (ADR)

Key decisions from Phase 0 (user-approved [USER CLARIFICATION]):

1. **Gate-based entry/exit counting** for zone occupancy.
2. **Zone-level availability is the authoritative metric.** Slots are layout/inventory/visual only.
3. **Vehicle identity is required for registered sessions**: users register vehicles; the license
   plate is the primary OCR identity. Unknown/unregistered plates become guest candidates and, when
   the establishment guest policy admits them, receive account-less `GuestSession`/
   `ParkingSession` records. Registered sessions always resolve to a real user and vehicle;
   `normalizedPlate` is unique per user and a partial unique index prevents multiple ACTIVE sessions
   per vehicle.
   (Replaced the earlier, uncommitted "anonymous events" decision.)
4. **Navigation** = GPS to facility + internal zone guidance.
5. **Notifications** = admin + driver alerts.
6. **Roles** = User + Admin only.

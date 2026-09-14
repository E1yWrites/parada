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
| 11A | Administrative configuration (zones, capacity, physical-slot inventory, gate cameras) | DONE |
| 11C | Physical camera provisioning + vision connectivity (USB / RTSP / video file) | DONE |
| 11D | Mobile runtime migration to Expo SDK 57 (`expo@~57.0.22`, RN 0.86.3, React 19.2) | DONE |
| 12 | Real-Time Integration (SSE) | DONE |
| 13 | Full System Integration (end-to-end audit + integration-defect fixes + cross-layer regression) | DONE |
| 14 | Testing + Accuracy Evaluation (synthetic OCR benchmark, condition study, E2E latency, USB probe, full regression — `docs/vision/phase14-evaluation.md`) | DONE |
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

Added in later phases:

7. **Realtime transport = Server-Sent Events** (Phase 12), not WebSockets. Delivery is
   one-directional (backend → clients) and rides the existing bearer/cookie auth, so SSE
   avoids a second auth path and a socket server. Realtime is **delivery only**: the
   database and domain layer stay authoritative, clients never create parking state from
   an event, and every event is published only after its transaction has committed.

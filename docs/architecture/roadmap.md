# PARADA Development Roadmap

Project developed incrementally (agile). Each phase: objective -> files -> dependencies ->
assumptions -> clarifications -> implement -> test -> fix -> typecheck -> lint -> build ->
document -> STOP.

| Phase | Title | Status |
|-------|-------|--------|
| 0 | Requirements + Architecture | DONE |
| 1 | Project Infrastructure | DONE |
| 2 | Database | DONE |
| 3 | Backend Foundation | PENDING |
| 4 | Authentication + Authorization | PENDING |
| 5 | Parking Zones + Slots | PENDING |
| 6 | Occupancy Model + Simulator | PENDING |
| 7 | Admin Web Application | PENDING |
| 8 | Mobile Application | PENDING |
| 9 | OCR / Computer Vision | PENDING |
| 10 | Real-Time Integration | PENDING |
| 11 | Full System Integration | PENDING |
| 12 | Testing + Accuracy Evaluation | PENDING |
| 13 | Deployment | PENDING |
| 14 | Documentation + Final Review | PENDING |

## Architecture Decisions (ADR)

Key decisions from Phase 0 (user-approved [USER CLARIFICATION]):

1. **Gate-based entry/exit counting** for zone occupancy.
2. **Zone-level availability is the authoritative metric.** Slots are layout/inventory/visual only.
3. **Anonymous events; no vehicle ID** — parking sessions are not tied to vehicle identity.
4. **Navigation** = GPS to facility + internal zone guidance.
5. **Notifications** = admin + driver alerts.
6. **Roles** = User + Admin only.

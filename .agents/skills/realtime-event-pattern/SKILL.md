---
name: realtime-event-pattern
description: Convention for publishing RealtimeHub events from services/api routes, established in Phase 12 Tasks 5-7 (ZONE_OCCUPANCY_UPDATED, RESERVATION_CREATED/CANCELLED). Use when adding a new realtime event type or wiring realtimeHub into a new route.
---

# Realtime event publishing pattern

This is the pattern established across Phase 12 Tasks 5-7 for publishing domain events to `RealtimeHub`. Follow
it for any new event type instead of re-deriving the approach.

## The pattern

1. **Thread `realtimeHub` as an optional parameter** through the route factory (`reservationsRouter(deps)`,
   `adminRouter(deps)`, etc.), then wire it in `app.ts` where the router is constructed.
2. **Publish only after the domain-service call resolves** (POST-COMMIT rule). Never publish before the write
   commits — a client must never see a realtime event for a state change that didn't actually happen.
3. **No domain-service logic changes.** Events are published at the route layer only. The domain/service layer
   stays unaware of realtime concerns — this preserves "Backend/domain/database are authoritative" and keeps
   realtime as a route-layer concern, not a business-logic one.
4. **Scope events to the resource owner, not the acting user.** For admin-initiated actions (e.g. admin-cancel
   a reservation), the event scope's `userId` is the reservation owner's ID, not the admin's. Getting this wrong
   means the wrong client receives (or fails to receive) the event. This is a correctness bug, not a style
   choice — verify it explicitly in tests.
5. **Test-first:** write the failing test asserting the event was published with the correct scope before
   implementing, then implement, then verify full regression + typecheck pass with zero errors.

## Reference implementations

- `services/api/src/routes/reservations.ts` — RESERVATION_CREATED / RESERVATION_CANCELLED (user-initiated)
- `services/api/src/routes/admin.ts` — RESERVATION_CANCELLED (admin-initiated, scoped to owner not admin)
- `services/api/src/routes/events.ts` — ZONE_OCCUPANCY_UPDATED

## When adding a new event type

- Reuse the existing `RealtimeHub.publish()` interface — do not add a second publishing mechanism.
- Confirm the audience/scope field before writing any implementation code; get this wrong and the test-first
  step will pass while shipping a real authorization/visibility bug (event delivered to the wrong user).

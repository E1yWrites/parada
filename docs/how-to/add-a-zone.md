# How to add a zone

Zones are the authoritative unit of parking availability in PARADA.
`available = capacity - occupied`. Parking slots (if configured) are layout /
inventory only and never change this calculation.

## Steps (Admin)

1. Sign in to the admin dashboard and open **Zones** (`/zones`).
2. Click **New zone** (`CreateZoneForm` in
   [`apps/admin/app/(app)/zones/page.tsx`](../../apps/admin/app/(app)/zones/page.tsx))
   and fill in:
   - **Name** — e.g. `Zone A`.
   - **Code** — short identifier drivers see on the gate and in the mobile
     app, e.g. `A`.
   - **Description** — optional wayfinding text shown to drivers.
   - **Capacity** — the authoritative availability number for this zone.
   - **Navigation latitude / longitude** — optional; drivers' in-app
     Directions stay disabled until both are set.
3. Submit. This calls `POST /admin/zones`, creating the zone as `ACTIVE`.

Equivalent API call:

```bash
curl -X POST http://localhost:4100/admin/zones \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin session cookie>" \
  -d '{"name":"Zone A","code":"A","capacity":50,"status":"ACTIVE"}'
```

## After creating the zone

- Register at least one gate camera for the zone — see
  [add-a-camera.md](./add-a-camera.md). A zone with no cameras never gets
  occupancy events.
- If the establishment uses physical-slot inventory for layout/visual
  purposes, configure it from the zone detail page
  (`apps/admin/app/(app)/zones/[id]/page.tsx`). Slots are display-only and
  never override the zone's `capacity`-based availability.

## Deactivating instead of deleting

There is no zone delete in the admin UI. Use the **Deactivate** toggle on the
zone list instead:

- A deactivated zone stops being offered as a destination and stops accepting
  new reservations/assignments.
- Existing sessions, reservations, fees, and history for that zone are **not**
  deleted.

## Common mistakes

- Setting **Capacity** to the physical slot count rather than the intended
  authoritative occupancy ceiling — slots are inventory/visual only, capacity
  is what drives `available`.
- Forgetting to register a camera afterwards, so occupancy never updates from
  `capacity` even though the zone exists.

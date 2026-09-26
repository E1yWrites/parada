# UI mockups

Static HTML mockups of the two PARADA front ends, drawn from the current source.
Open either file in a browser. Images are embedded; fonts (Google Fonts) and
icons (Ionicons / Lucide from jsDelivr) load from the internet.

| File | What it shows | Based on |
| --- | --- | --- |
| `mobile-driver-flow.html` | Six driver screens in phone frames: Sign in → Home (idle) → Park → Home (parked) → Sessions → Account | `apps/mobile` components and `src/theme` tokens (dark register) |
| `admin-console.html` | Five console views in browser frames: Sign in → Dashboard → Zones (new zone form open) → Cameras → Violations | `apps/admin` pages, `AppShell`, `globals.css` tokens (dark register) |

## What is real and what is sample

- Layout, copy, colours, type and corner geometry follow the source files.
- Zone `A` "Main Loop" (capacity 30), cameras `cam-a-main-gate` / `cam-a-north-gate`,
  the `admin@parada.local` / `driver@parada.local` accounts and plates
  `ABC-1234`, `XYZ-5678`, `MNO-9999` come from the dev seed
  (`packages/database/src/seed`).
- Violation types, descriptions and fines come from `DEFAULT_VIOLATION_POLICIES`
  (`packages/config`). Session fees follow `DEFAULT_PARKING_FEE`.
- Sample only: occupancy (18 of 30), sessions, gate events, alerts, the
  occupancy trend line and violation records. The seed creates none of these.

These are review references, not screenshots of a running build. Re-check them
against the app after UI changes.

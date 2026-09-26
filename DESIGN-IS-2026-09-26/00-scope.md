# Design audit scope — 2026-09-26

Method: Dieter Rams' ten principles, each scored 0–3 with cited evidence. Mobile and web are scored separately because they are separate designs with separate token sets.

## Audited surfaces

### A. Mobile driver app (`apps/mobile`, Expo / React Native)
- Tabs: Home `app/(tabs)/parking.tsx`, Park `park.tsx`, Sessions `sessions.tsx`, Account `account.tsx`
- Auth: `app/login.tsx`
- Components they render: `src/components/*`
- Tokens: `src/theme/*` (dark register primary, light counterpart)
- State audited: `main` at `46b4d80` plus the tab-polish changes (PR #8, merged)

### B. Admin operations console (`apps/admin`, Next.js)
- Shell: `components/AppShell.tsx`
- Pages: Dashboard `app/(app)/page.tsx`, Zones, Cameras, Violations, `app/login/page.tsx`
- Primitives: `components/ui/*`
- Tokens: `app/globals.css`, `tailwind.config.ts`

## Primary users and tasks
- **Mobile — driver** (LPU Batangas student, staff or visitor with a registered plate). Primary task: find a zone with space, then assign or reserve it. Secondary: see the current parking state and past sessions.
- **Admin — facility operator**. Primary task: watch live occupancy and camera health, and act on problems (zones, cameras, violations).

## Constraints
- Capstone project; stack fixed (Expo SDK 57 / RN 0.86, Next 15, Express API, Prisma).
- Domain rules are authoritative: zone-based occupancy, Recommendation ≠ Assignment ≠ Reservation ≠ Session, GPS for navigation only, Vision observes and the backend decides.
- Brand: PARADA logo and mascot; existing token worlds (mobile warm-sunset navy/orange, admin graphite/orange).

## Input materials
- Source code (no running instance; visual facts are inferred from source)
- `docs/mockups/mobile-driver-flow.html`, `docs/mockups/admin-console.html`
- Designer handoff for the mobile tab polish (Downloads `*.dc.html`, README)

## Not measured
- No live screenshots, runtime contrast sampling or device time-to-interactive. Where evidence is inferred from source, it is marked so.

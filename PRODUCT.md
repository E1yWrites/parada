# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Root record covers the shared product. `apps/admin` is the web surface; `apps/mobile/PRODUCT.md` overrides the platform for the Expo app.)

## Users

- **Drivers** (primary, mobile): students, staff and visitors arriving at a small-to-medium parking facility (~50–100 spaces across several zones) at Lyceum of the Philippines University–Batangas. Situation: in or near the car, one-handed, often in a hurry, sometimes in bright daylight. Job: know which zone has space before driving in, hold a zone, get to it, and see their session, fees and any violation.
- **Administrators / operations staff** (primary, admin web): a small team monitoring the facility from a desk. Job: keep zone and camera configuration accurate (capacities, gate cameras, fees, guest policy, navigation destination), watch live occupancy, review sessions, reservations, violations, appeals and anomalies.
- **Capstone panel / defense audience** (confirmed by the owner): the product is demonstrated projected on a screen; both surfaces must read clearly at a distance and explain themselves without narration.

## Product Purpose

PARADA is a mobile and web smart-parking system for zone-based occupancy. Instead of a sensor per slot, it counts vehicles at zone gates with standard cameras and OCR-assisted plate reading, and keeps **zone-level availability** (`available = capacity − occupied`) as the single authoritative metric. Success: drivers stop circling the lot, and operators can trust and configure the facility from one console.

## Positioning

Gate-based counting with OCR-assisted cameras gives live zone availability without per-slot hardware. Slots exist only as layout/inventory; nothing in the UI may imply per-slot detection. The backend is the only authority on parking meaning; Vision reports observations, clients render backend state.

## Operating Context

- Facility flow: Camera → Vision/OCR → API → Domain → PostgreSQL. Mobile and Admin talk only to the API (Admin through a Next.js proxy with an HttpOnly cookie).
- Realtime: Server-Sent Events push occupancy and notification changes to both clients; polling remains as fallback.
- Driver flow: onboarding → register → verify email (6-digit code) → first sign-in → first-run tutorial that asks for the driver's vehicle (primary by default) → **Now** tab (the one current thing) → **Zones** (choose a zone, then Go now = assignment or Reserve = hold; vehicle choice shows the primary) → navigate (GPS hand-off to the platform maps app) → session (in-app pop-ups when it starts and ends) → **History** (7-day and month charts, past sessions and reservations); notifications, vehicles, payments and violations/appeals live off **Account**.
- Admin flow: dashboard → zones/cameras/settings configuration → sessions, reservations, users, violations, appeals, anomalies, notifications, history, analytics; simulator and guest admission are operator tools.

## Capabilities and Constraints

- Roles: USER and ADMIN; authorization is enforced by the backend. Admin auth is an HttpOnly cookie; mobile stores its token in SecureStore.
- Domain vocabulary (must stay distinct in UI): **Recommendation** (suggestion only) ≠ **Assignment** (backend-confirmed zone for a vehicle) ≠ **Reservation** (capacity hold with a window) ≠ **Session** (actual parking, camera-driven).
- Zone availability states: AVAILABLE, LOW_AVAILABILITY, FULL, OFFLINE. Session: ACTIVE, COMPLETED. Reservation: PENDING, CONFIRMED, ACTIVE, EXPIRED, CANCELLED. Violation: PENDING, APPEALED, UPHELD, DISMISSED, FINE_PAID.
- GPS is navigation only; the app never invents a destination (the establishment location is admin-configured and may be null).
- Guests: unregistered plates may be admitted under an audited admin override; guest sessions show as "GUEST".
- Currency is Philippine peso (₱). Timestamps are shown in the device locale.
- Stack: Expo SDK 58 / React Native 0.88 (Expo Router, React Query, Ionicons, Inter via expo-google-fonts, expo-blur, react-native-svg); Next.js 16 + Tailwind 4 + lucide-react (Inter and JetBrains Mono via next/font). No new native modules may be added casually; no dependency downgrades.
- Tests pin many test IDs, labels and copy strings across both apps; UI work preserves them.
- Brand assets: the PARADA wordmark/logo and the Lottie mascot sprite frames exist and are used unmodified.
- The driver app has no OS push notifications; in-app pop-ups are driven by the realtime stream.

## Brand Commitments

- Name: **PARADA** (set in caps in wordmarks). Voice: plain, direct, reassuring; short sentences; never scolding drivers.
- Mobile direction (2026-11-24, owner): **"Clear"** — Apple-like, clean and simple, glassmorphism over a moving wave grid, modern graphs, seamless animations, light and dark tuned separately, Lottie kept (onboarding slide 1, sign-in, the idle Now card, the first-run tutorial and the parked/ended pop-ups). Ink-black/white action button, PARADA orange for data and accents. Earlier directions (electric blue, "The Attendant" navy/gold, Rams-strict) are superseded on mobile.
- Admin direction (2026-11-25, owner): **"Console"** — a monochrome zinc console (inset floating sidebar, soft panels, tick meters) with logo orange `#F7931A` only for live data and the one filled action; uniform corners, Inter + JetBrains Mono; realtime pop-ups for actionable events. Comps: Design canvas, board A approved.
- `DESIGN.md` is the source for tokens and component rules; the code wins where they disagree.

## Evidence on Hand

- Real screens and flows in `apps/mobile` and `apps/admin`; API contracts in `packages/types` and `services/api`.
- Phase 14 evaluation numbers (OCR accuracy, latency) exist in `docs/vision/phase14-evaluation.md`; they may be cited but never rounded up or restated as deployment claims.
- Absent: customer testimonials, pricing, uptime figures, third-party integrations. Do not fabricate.

## Product Principles

1. Backend truth first: every number, state and label on screen comes from the API; the UI never derives business state.
2. Zone-level honesty: availability is per zone; slots are layout only.
3. One clear next action per screen for drivers; dense, scannable, safe-to-edit screens for operators.
4. Keep the four parking concepts visibly distinct.
5. Degrade gracefully: partial failures show what is still known, with a retry.

## Accessibility & Inclusion

- Mobile: 44pt minimum touch targets, dynamic type up to 1.8× on body text, status conveyed by icon + text + color, Reduce Motion and Reduce Transparency respected.
- Admin: keyboard-operable navigation and forms, visible focus rings, WCAG AA text contrast on white, `aria-current`, `aria-expanded`, `role="alert"` for errors.

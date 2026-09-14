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
- Driver flow: onboarding → sign in → Parking tab (current state, recommendation, zones) → assign or reserve a zone → navigate (GPS hand-off to the platform maps app) → session → history; notifications and violations/appeals live off the Account tab.
- Admin flow: dashboard → zones/cameras/settings configuration → sessions, reservations, users, violations, appeals, anomalies, notifications, history, analytics; simulator and guest admission are operator tools.

## Capabilities and Constraints

- Roles: USER and ADMIN; authorization is enforced by the backend. Admin auth is an HttpOnly cookie; mobile stores its token in SecureStore.
- Domain vocabulary (must stay distinct in UI): **Recommendation** (suggestion only) ≠ **Assignment** (backend-confirmed zone for a vehicle) ≠ **Reservation** (capacity hold with a window) ≠ **Session** (actual parking, camera-driven).
- Zone availability states: AVAILABLE, LOW_AVAILABILITY, FULL, OFFLINE. Session: ACTIVE, COMPLETED. Reservation: PENDING, CONFIRMED, ACTIVE, EXPIRED, CANCELLED. Violation: PENDING, APPEALED, UPHELD, DISMISSED, FINE_PAID.
- GPS is navigation only; the app never invents a destination (the establishment location is admin-configured and may be null).
- Guests: unregistered plates may be admitted under an audited admin override; guest sessions show as "GUEST".
- Currency is Philippine peso (₱). Timestamps are shown in the device locale.
- Stack: Expo SDK 57 / React Native 0.86 (Expo Router, React Query, Ionicons, Nunito + JetBrains Mono via expo-google-fonts, expo-blur); Next.js 14 + Tailwind 3 + lucide-react (Nunito via next/font). No new native modules may be added casually; no dependency downgrades.
- Tests pin many test IDs, labels and copy strings across both apps; UI work preserves them.
- Undecided: no brand mark/logo asset exists yet; no raster illustrations exist.

## Brand Commitments

- Name: **PARADA** (set in caps in wordmarks). Voice: plain, direct, reassuring; short sentences; never scolding drivers.
- Accent decision (2026-09-14, owner): move from cardinal red to an **electric blue** primary on clean light surfaces, with coral for alerts/danger, mint/green for available/success, amber for low availability/pending. Red is no longer the brand color.
- Visual language pinned by the owner's brief: soft, modern, friendly SaaS; rounded cards; light surfaces; controlled whitespace; strong type hierarchy; subtle gradients; soft shadows; colorful status accents; large rounded hero sections; expressive icons; polished empty/loading/error states; purposeful micro-interactions. A dark, orange-accented freight-app screenshot was supplied as *style* reference only; its content, layout and branding are not to be copied.

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

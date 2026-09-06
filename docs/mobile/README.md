# PARADA Mobile Application

User-facing driver app (Phase 8). React Native + **Expo SDK 53** + TypeScript,
with **Expo Router** (file-based navigation) and **TanStack Query** for data
caching. Talks to the `services/api` backend over HTTPS/HTTP.

## Stack

| Concern | Choice |
|---------|--------|
| Framework | Expo SDK 53 (`expo@~53.0.27`) |
| React / React Native | `react@19.0.0` / `react-native@0.79.6` |
| Navigation | `expo-router@~5.1.11` (typed, file-based tabs) |
| Data layer | `@tanstack/react-query@^5` on the `lib/api/client.ts` fetch wrapper |
| Auth storage | `expo-secure-store` (JWT in Keychain/Keystore) |
| Fonts | `@expo-google-fonts/*` (Inter, Space Grotesk, JetBrains Mono) |
| Styling | Design tokens in `src/theme` (no styling library) |
| Tests | `jest-expo` + `@testing-library/react-native` (RNTL v13) |
| Lint / types | `eslint-config-expo` (legacy `.eslintrc.js`) / `tsc --noEmit` |

## Getting started

```bash
# One-time monorepo install links the SDK into the root node_modules
# (see "Monorepo notes" below). Re-run after any clean/install:
npm install

# mobile env — copy the template, then pick the right base URL
cd apps/mobile
cp .env.example .env
#   iOS Simulator / web:   EXPO_PUBLIC_API_URL=http://localhost:4000
#   Android Emulator:      EXPO_PUBLIC_API_URL=http://10.0.2.2:4000
#   Physical device:       EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000

# backend must be running first (see docs/api/README.md) — then:
npx expo start        # scan QR / press i / press a
```

The seeded dev account is `driver@parada.local / DriverPass123!` (USER).
Registration creates USER accounts inline (`app/register.tsx`).

## Structure

```
apps/mobile
├── index.js                 # custom entry (explicit require.context("./app"))
├── app/                     # expo-router routes
│   ├── _layout.tsx          # root providers + fonts + ThemeProvider + SessionProvider
│   ├── login.tsx / register.tsx
│   └── (tabs)/              # parking · sessions · vehicles · account
├── src/
│   ├── components/          # Screen, Text, Button, Card, StatusBadge, banners…
│   ├── hooks/               # useNow (live elapsed clock), reduced-motion
│   ├── providers/           # AppProviders, SessionProvider (auth bootstrap + /sessions/active)
│   ├── theme/               # colors/typography/spacing/radii/shadows tokens
│   └── test/utils.tsx       # renderWithProviders / renderWithAppProviders
├── lib/
│   ├── api/client.ts        # typed API client + envelope/error handling
│   ├── auth/session.ts      # secure-store token + global auth-invalidation bus
│   ├── format.ts            # plate normalization + duration/date/type formatting
│   ├── query.ts             # react-query factory + query keys
│   ├── assignment.ts        # active-assignment & active-vehicle helpers (shared)
│   ├── location.ts          # expo-location wrapper: foreground permission + one-shot position
│   └── navigation.ts        # establishment destination, platform URL builders, Linking launch
├── __tests__/               # 19 suites / 257 tests (jest-expo + RNTL)
└── jest.config.js, jest.setup.ts, __mocks__/
```

### Screens

| Route | Purpose |
|-------|---------|
| `/login`, `/register` | Auth flows; store JWT in secure-store |
| `/(tabs)/parking` | Live zones (public `GET /zones` with availability badges) + active-session banner + recommended-zone card (`GET /zones/recommendation` with an explicit "Accept Recommendation" → `POST /assignments` flow when no session is active) + manual zone assignment: select a zone on the grid → pick a registered vehicle → `POST /assignments`, confirmed only from the backend response, full/offline zones and already-assigned vehicles blocked, refresh of zone/recommendation/assignment data on success + zone reservations: select a zone → pick a registered vehicle → explicit "Reserve" → `POST /reservations` (backend-held zone capacity, arrival window from config), backend-confirmed display only, `GET /reservations` list with status badges and timestamps, two-tap explicit cancel via `PATCH /reservations/:id/cancel`, full-zone/network/conflict errors mapped to friendly messages + actual navigation (Phase 9.5): the confirmed-assignment card shows a "Navigate to assigned zone" action that reads the device GPS (foreground `expo-location` permission + one-shot position, no background tracking/persistence), resolves the establishment destination from public `GET /zones/establishment`, and launches the platform maps app (Apple Maps `maps://`, Google navigation `google.navigation:`, `geo:` fallback); missing permission, unavailable location, no configured destination, or no maps app all degrade to friendly in-app messages |
| `/(tabs)/parking` current state (Phase 9.6) | Single authoritative "current parking" section on top, ordered by backend semantics: active session (`GET /sessions/active`, strongest state) → active assignment (`GET /assignments`, ACTIVE + not past `expiresAt`) → valid reservation (`GET /reservations`, PENDING/CONFIRMED/ACTIVE) → explicit empty state when nothing is current. Assignment and reservation are always rendered as distinct cards, never merged/reconciled; an active session suppresses suggestion flows and shows its assignment only as a context line. The confirmed-assignment card was moved out of `ZoneAssignmentPanel` (which now shows a lightweight hint and hides the assign form) to eliminate the previous duplicate rendering, and the recommendation card is hidden whenever any current state exists or is still loading. Session, assignment and reservation cards each offer GPS navigation (Phase 9.5 `NavigateButton`, hidden while the establishment is loading, disabled without a destination), friendly error states keep `active-session-error`, and partial failures show what is known plus a pull-to-refresh note |
| Mobile integration / E2E regression (Phase 9.7) | Closes the two real integration defects found during the audit. (1) Recommendation → assignment transition: `POST /assignments` and `POST /reservations` mutation results (backend-confirmed) are now written into their canonical list caches via `upsertAssignment`/`upsertReservation` on `onSuccess`, so the screen's current-state derivation sees the confirmed assignment/reservation in the same commit — eliminating the transient window where the recommendation claimed "Your assignment" while the current-state section still showed "No active parking". Invalidations still refetch in `onSettled`, replacing the cache with the full server list (never optimistic). (2) The reservation panel's duplicate `reservation-confirmed` card (create result + list entry after refetch) was removed — the list is the single source of truth. Four screen-level regression tests assert the transitions (no empty-state contradiction, recommendation unmount at confirmation, no duplicate submission while pending, exactly one assignment card, no duplicate reservation card). Mobile suite: 19 suites / 255 tests |
| Mobile final polish (Phase 9.8) | UX/accessibility/responsiveness audit on top of Phase 8–9.7. Loading presented once (`NavigateButton` no longer duplicates "Getting your location…" — the button title + spinner now carry the state alone, with a regression test pinning single presentation); the vehicles header loading placeholder is now "Loading…" like sessions; the account degraded-cache "RETRY" got the 44pt touch-target baseline; `CurrentParkingState` and `ActiveSessionBanner` header rows anchor label + status badge to the top so badges never float mid-row; `ReservationCard`'s confirm row wraps on narrow screens and both `ReservationCard`/`ZoneCard` zone names now wrap to 2 lines instead of hard-clipping; validation/network error texts (Input, login, register) are announced via `accessibilityRole="alert"` surfaced through the `Text` primitive. Mobile suite: 19 suites / 257 tests |
| `/(tabs)/sessions` | Session history (`GET /sessions`) |
| `/(tabs)/vehicles` | My vehicles; add (`GET|POST /vehicles`) |
| `/(tabs)/account` | Profile (`GET /auth/me`) + logout |

### API client & auth failures

`lib/api/client.ts` wraps `fetch`, unwraps the `{ data }` / `{ error }` envelope
(the `data` key is authoritative even when its value is `null`, e.g.
`sessions/active` with no active session) and throws `ApiError(code, message, status)`.
The `SessionProvider` subscribes to `lib/auth/session.ts`'s invalidation bus:
only an explicit `401` clears the stored token globally (single logout point) and
the router redirects to `/login`. Network failures and timeouts are never treated
as revocation — the token is preserved and the app degrades to the signed-out
state, so a valid session survives a transient backend outage. Expired or
server-revoked tokens therefore cannot leave the app in a half-authenticated state.

## Verification

```bash
npm run typecheck          # tsc --noEmit
npm run lint               # eslint .
npm test                   # jest --runInBand --forceExit
npm run build              # expo export --platform ios --platform android (Hermes bytecode)
```

All gates are wired into Turborepo (`npx turbo typecheck lint test`).

> `--forceExit` is intentionally pinned in the test script: react-test-renderer
> keeps open handles from RN timers under this stack and would otherwise leave
> the jest process hanging in CI.

## Monorepo notes (why the bits are the way they are)

- **Dual npm tree.** `apps/admin` pins React 18 while Expo SDK 53 needs React 19,
  so npm keeps the SDK tree inside `apps/mobile/node_modules` and nests a few
  packages under `node_modules/expo/node_modules/`. The root `postinstall`
  (`scripts/ensure-expo-link.cjs`) bridges the gaps with idempotent symlinks:
  `node_modules/expo` and `node_modules/react-native` at the repo root, plus
  nested SDK packages lifted into `apps/mobile/node_modules`. After any
  `npm install`/`ci`/`dedupe`, re-run it (`node scripts/ensure-expo-link.cjs`);
  avoid `npm dedupe` (it has deleted these links).
- **Custom entry** (`index.js`). The default `expo-router/entry` resolves routes
  via the virtual `expo-router/_ctx` module driven by
  `process.env.EXPO_ROUTER_APP_ROOT`; in this workspace that env value never
  reaches Metro's transform, breaking bundling. The custom entry uses an
  explicit `require.context("./app")` instead (see
  <https://docs.expo.dev/router/reference/troubleshooting/>).
- **tsconfig paths.** `@/*` maps to the app root (`@/lib/...`, `@/components/...`).
  Do **not** add `react` (or `react/jsx-runtime`) to `paths`: jest-expo copies
  tsconfig paths into `moduleNameMapper`, and mapping `react` to a `.d.ts` breaks
  Jest parsing. The React 19 (local `@types/react`) vs 18 (root) boundary in
  shared test utils is typed through `ComponentProps<typeof QueryClientProvider>["children"]`.

## Environment

`EXPO_PUBLIC_API_URL` is the only variable (see `.env.example`). `EXPO_PUBLIC_*`
values are client-visible; never put `CAMERA_API_KEY`, JWT secrets, or database
credentials here.
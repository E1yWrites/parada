# PARADA Mobile Application

User-facing driver app (Phase 8). React Native + **Expo SDK 57** + TypeScript,
with **Expo Router** (file-based navigation) and **TanStack Query** for data
caching. Talks to the `services/api` backend over HTTPS/HTTP.

## Stack

| Concern | Choice |
|---------|--------|
| Framework | Expo SDK 57 (`expo@~57.0.22`; Phase 11D) |
| React / React Native | `react@19.2.3` / `react-native@0.86.3` |
| Navigation | `expo-router@~57.0.21` (typed, file-based tabs) |
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
#   iOS Simulator / web:   EXPO_PUBLIC_API_URL=http://localhost:4100
#   Android Emulator:      EXPO_PUBLIC_API_URL=http://10.0.2.2:4100
#   Physical device:       EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4100

# backend must be running first (see docs/api/README.md) — then, from the repo root:
npm run dev:mobile    # Expo on port 8082 (LAN); scan QR / press i / press a
```

The seeded dev account is `driver@parada.local / DriverPass123!` (USER, already
verified). Registration (`app/register.tsx`) creates an **unverified** USER
account: the API mails a 6-digit code (with `MAIL_TRANSPORT=console` it is
printed on the API's stdout), `app/verify-email.tsx` confirms it, and only then
does login succeed. A user who closes the app before verifying just signs in
again — the API answers `EMAIL_NOT_VERIFIED` and the app resumes verification.

## Structure

```
apps/mobile
├── index.js                 # custom entry (explicit require.context("./app"))
├── app/                     # expo-router routes
│   ├── _layout.tsx          # root providers + fonts + ThemeProvider + SessionProvider
│   ├── index.tsx            # "/" → Redirect to /(tabs)/parking (auth gate lives in (tabs)/_layout)
│   ├── login.tsx / register.tsx
│   └── (tabs)/              # parking · sessions · vehicles · account
├── src/
│   ├── components/          # Screen, Text, Button, Card, StatusBadge, banners…
│   ├── hooks/               # useNow (live elapsed clock), reduced-motion
│   ├── lib/realtime.ts      # SSE client (react-native-sse): cache invalidation on events
│   ├── providers/           # AppProviders, SessionProvider (auth bootstrap + /sessions/active)
│   ├── theme/               # colors/typography/spacing/radii/shadows tokens
│   └── test/utils.tsx       # renderWithProviders / renderWithAppProviders
├── lib/
│   ├── api/client.ts        # typed API client + envelope/error handling
│   ├── auth/session.ts      # secure-store token + global auth-invalidation bus
│   ├── format.ts            # plate normalization + duration/date/type formatting
│   ├── query.ts             # react-query factory + query keys
│   ├── assignment.ts        # active-assignment & active-vehicle helpers (shared)
│   ├── avatar.ts            # expo-image-picker (gallery/camera, square crop) + expo-image-manipulator (512px JPEG)
│   ├── onboarding.ts        # first-installation flag (marker file in the document directory)
│   ├── location.ts          # expo-location wrapper: foreground permission + one-shot position
│   └── navigation.ts        # per-zone destination (navigationLat/Lng), platform URL builders, Linking launch
├── __tests__/               # 28 suites / 321 tests (jest-expo + RNTL)
└── jest.config.js, jest.setup.ts, __mocks__/
```

### Screens

| Route | Purpose |
|-------|---------|
| `/` | `app/index.tsx` — one startup decision, one redirect: restored session → `/(tabs)/parking`; first installation → `/onboarding`; otherwise → `/login`. Required: without a root `index`, Expo Router resolves `/` (what Expo Go launches with) to the generated `+not-found` "Unmatched Route" |
| `/onboarding` | Existing three-slide intro. Skip / Get started record completion in `lib/onboarding.ts` (a marker file in the app's document directory — per installation, deliberately not SecureStore because the iOS keychain survives reinstalls). Still reachable from Login via "How PARADA works" |
| `/login`, `/register` | Auth flows; store JWT in secure-store. Register never receives a token: it routes to `/verify-email`. Login handles `EMAIL_NOT_VERIFIED` by resuming verification and links to `/forgot-password` |
| `/verify-email` | 6-digit code entry, resend with the server's cooldown (`resendAvailableAt` / 429), invalid/expired messages from the API; success returns to `/login?notice=verified` |
| `/forgot-password`, `/reset-password` | Generic "if an account exists" request; the reset screen takes the token from the `parada://reset-password?token=…` deep link or pasted from the email, validates locally, and returns to login on success |
| `/account/profile` | Name/username (`PATCH /auth/me`), email change (`POST /auth/me/email` → code sent to the NEW address → `…/confirm`; current email stays authoritative until then), phone change (code sent to the verified email) or clear |
| `/account/password` | Current + new + confirm → `POST /auth/password`; the fresh token the server returns replaces the stored one so this device stays signed in while every other session is invalidated |
| `/vehicles/[id]` | Edit plate / type / make / model / color (`PATCH /vehicles/:id`) and unregister (`DELETE /vehicles/:id`, confirmed with a native alert). Domain refusals (parked / assigned / reserved) are shown verbatim from the API |
| `/(tabs)/parking` | Live zones (public `GET /zones` with availability badges) + active-session banner + recommended-zone card (`GET /zones/recommendation` with an explicit "Accept Recommendation" → `POST /assignments` flow when no session is active) + manual zone assignment: select a zone on the grid → pick a registered vehicle → `POST /assignments`, confirmed only from the backend response, full/offline zones and already-assigned vehicles blocked, refresh of zone/recommendation/assignment data on success + zone reservations: select a zone → pick a registered vehicle → explicit "Reserve" → `POST /reservations` (backend-held zone capacity, arrival window from config), backend-confirmed display only, `GET /reservations` list with status badges and timestamps, two-tap explicit cancel via `PATCH /reservations/:id/cancel`, full-zone/network/conflict errors mapped to friendly messages + actual navigation (Phase 9.5): the confirmed-assignment card shows a "Navigate to assigned zone" action that reads the device GPS (foreground `expo-location` permission + one-shot position, no background tracking/persistence), resolves the establishment destination from public `GET /zones/establishment`, and launches the platform maps app (Apple Maps `maps://`, Google navigation `google.navigation:`, `geo:` fallback); missing permission, unavailable location, no configured destination, or no maps app all degrade to friendly in-app messages |
| `/(tabs)/parking` current state (Phase 9.6) | Single authoritative "current parking" section on top, ordered by backend semantics: active session (`GET /sessions/active`, strongest state) → active assignment (`GET /assignments`, ACTIVE + not past `expiresAt`) → valid reservation (`GET /reservations`, PENDING/CONFIRMED/ACTIVE) → explicit empty state when nothing is current. Assignment and reservation are always rendered as distinct cards, never merged/reconciled; an active session suppresses suggestion flows and shows its assignment only as a context line. The confirmed-assignment card was moved out of `ZoneAssignmentPanel` (which now shows a lightweight hint and hides the assign form) to eliminate the previous duplicate rendering, and the recommendation card is hidden whenever any current state exists or is still loading. Session, assignment and reservation cards each offer GPS navigation (Phase 9.5 `NavigateButton`, hidden while the establishment is loading, disabled without a destination), friendly error states keep `active-session-error`, and partial failures show what is known plus a pull-to-refresh note |
| Mobile integration / E2E regression (Phase 9.7) | Closes the two real integration defects found during the audit. (1) Recommendation → assignment transition: `POST /assignments` and `POST /reservations` mutation results (backend-confirmed) are now written into their canonical list caches via `upsertAssignment`/`upsertReservation` on `onSuccess`, so the screen's current-state derivation sees the confirmed assignment/reservation in the same commit — eliminating the transient window where the recommendation claimed "Your assignment" while the current-state section still showed "No active parking". Invalidations still refetch in `onSettled`, replacing the cache with the full server list (never optimistic). (2) The reservation panel's duplicate `reservation-confirmed` card (create result + list entry after refetch) was removed — the list is the single source of truth. Four screen-level regression tests assert the transitions (no empty-state contradiction, recommendation unmount at confirmation, no duplicate submission while pending, exactly one assignment card, no duplicate reservation card). Mobile suite: 19 suites / 255 tests at the time |
| Mobile final polish (Phase 9.8) | UX/accessibility/responsiveness audit on top of Phase 8–9.7. Loading presented once (`NavigateButton` no longer duplicates "Getting your location…" — the button title + spinner now carry the state alone, with a regression test pinning single presentation); the vehicles header loading placeholder is now "Loading…" like sessions; the account degraded-cache "RETRY" got the 44pt touch-target baseline; `CurrentParkingState` and `ActiveSessionBanner` header rows anchor label + status badge to the top so badges never float mid-row; `ReservationCard`'s confirm row wraps on narrow screens and both `ReservationCard`/`ZoneCard` zone names now wrap to 2 lines instead of hard-clipping; validation/network error texts (Input, login, register) are announced via `accessibilityRole="alert"` surfaced through the `Text` primitive. Mobile suite: 20 suites / 267 tests at the time |
| `/(tabs)/sessions` | Session history (`GET /sessions`) |
| `/(tabs)/vehicles` | My vehicles; add with optional make/model/color (`GET|POST /vehicles`); tap a card to edit/unregister |
| `/(tabs)/account` | Profile (`GET /auth/me`) with profile picture (`AvatarEditor`: gallery / camera / remove; the image is centre-cropped, resized to 512 px and JPEG-compressed on device before `PUT /auth/me/avatar`), links to edit profile / change password, logout |
| Directions (remediation) | Every Directions action (session, assignment, reservation cards, zone detail) resolves the destination from **that zone's** admin-configured `navigationLat`/`navigationLng` (`lib/navigation.ts#resolveZoneDestination`) and opens Apple Maps (`maps://`) on iOS / Google Maps (`google.navigation:`) on Android at exactly those coordinates. No name search, no campus centre, no inference: a zone without coordinates shows a disabled action with "Navigation coordinates for this zone haven't been configured yet." |
| Assignment cancellation (remediation) | The current-state assignment card offers "Cancel assignment" → `PATCH /assignments/:id/cancel` (backend-enforced: owner only, before entry). The server response replaces the cache entry (status `CANCELLED`), then assignments and zones are refetched; the recommendation becomes available again |

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

### Realtime (Phase 12)

`src/lib/realtime.ts` opens one authenticated SSE connection to
`GET /realtime/stream` using the same bearer token the REST client already sends
(no proxy is needed here — unlike Admin, the token is not `HttpOnly`). It is
mounted once in `src/providers/AppProviders.tsx`.

The hook only ever calls React Query's `invalidateQueries` for the keys an event
affects; it never writes an event payload into the cache, so the next fetch always
reads authoritative server state. It tracks the hub's `seq` and drops any frame at
or below the last one it acted on — stale, duplicated, or out of order — and keeps
that cursor across reconnects. `react-native-sse` re-sends the last event id as
`Last-Event-ID`, so the backend replays what the device missed; a `SYNC` frame
means the gap was too large to replay and the core queries are refetched instead.

A realtime transport error is **not** an auth failure: it never calls
`notifyAuthInvalidated`. Only an explicit `401` from the REST client clears the
stored token. See `docs/api/README.md` → “Realtime (Server-Sent Events)”.

## Verification

```bash
npm run typecheck          # tsc --noEmit
npm run lint               # eslint .
npm test                   # jest --runInBand --forceExit (32 suites / 366 tests after the pre-audit remediation)
npm run build              # expo export --platform ios --platform android (Hermes bytecode)
```

All gates are wired into Turborepo (`npx turbo typecheck lint test`).

> `--forceExit` is intentionally pinned in the test script: react-test-renderer
> keeps open handles from RN timers under this stack and would otherwise leave
> the jest process hanging in CI.

## Monorepo notes (why the bits are the way they are)

- **Dual npm tree.** `apps/admin` pins React 18 while Expo SDK 57 needs React 19,
  so npm keeps the SDK tree inside `apps/mobile/node_modules` and nests a few
  packages under `node_modules/expo/node_modules/`. The root `postinstall`
  (`scripts/ensure-expo-link.cjs`) bridges the gaps with idempotent symlinks:
  `node_modules/expo` and `node_modules/react-native` at the repo root, plus
  nested SDK packages lifted into `apps/mobile/node_modules`. After any
  `npm install`/`ci`/`dedupe`, re-run it (`node scripts/ensure-expo-link.cjs`);
  avoid `npm dedupe` (it has deleted these links).
- **Custom entry** (`index.js`). It imports `@expo/metro-runtime` first, exactly like
  `expo-router/entry`, because that runtime installs the `window.location` polyfill
  expo-router's dev views (Sitemap / Unmatched Route) read. The default `expo-router/entry` resolves routes
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
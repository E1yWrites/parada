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
│   └── query.ts             # react-query factory + query keys
├── __tests__/               # 8 suites / 52 tests (jest-expo + RNTL)
└── jest.config.js, jest.setup.ts, __mocks__/
```

### Screens

| Route | Purpose |
|-------|---------|
| `/login`, `/register` | Auth flows; store JWT in secure-store |
| `/(tabs)/parking` | Live zones (public `GET /zones` with availability badges) + active-session banner |
| `/(tabs)/sessions` | Session history (`GET /sessions`) |
| `/(tabs)/vehicles` | My vehicles; add/remove (`GET|POST|DELETE /vehicles`) |
| `/(tabs)/account` | Profile (`GET /auth/me`) + logout |

### API client & auth failures

`lib/api/client.ts` wraps `fetch`, unwraps the `{ data }` / `{ error }` envelope
and throws `ApiError(code, message, status)`. The `SessionProvider` subscribes to
`lib/auth/session.ts`'s invalidation bus: whenever a request returns `401` the
stored token is cleared globally (single logout point) and the router redirects
to `/login`. Expired or server-revoked tokens therefore cannot leave the app in
a half-authenticated state.

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
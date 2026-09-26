# PARADA redesign plan — mobile driver app + admin operations console

Source: `03-verdict.md` (mobile 10/30, admin 11/30 → REDESIGN) and `04-handoff-prompt.md`.
Branch at planning time: `feat/mobile-ui-polish` @ `b2da80b`. Nothing in this plan has been implemented.

Priority order for every decision: **#6 Honest → #4 Understandable → #10 As little design as possible.**

Each phase below is self-contained: it can be run in a fresh chat with only this file, the audit folder and the repo. Every phase ends with AUDIT → IMPLEMENT → TEST → TYPECHECK/LINT/BUILD → REVIEW DIFF → REPORT → STOP (CLAUDE.md). No commits without approval.

---

## Phase 0 — Discovery results (done during planning; re-verify line numbers before editing)

### 0.1 Corrections to the handoff brief (evidence overrides the brief)

| # | Brief said | Source says | Consequence |
|---|---|---|---|
| C1 | "Park now" should say it **holds** a zone | An Assignment does **not** protect capacity. Only a Reservation does (`services/api/src/domain/reservation.ts:42-46` "A reservation PROTECTS capacity"; `assignment.ts` has no capacity count, only a 15-min `expiresAt` at `:97`). What an Assignment *does*: it sets the zone the car is expected in. The **camera** entry path (the real one) admits a car that enters another zone but records a `WRONG_ZONE_WARNING` anomaly and notifies the driver (`services/api/src/domain/occupancy.ts:505-543`); once the vehicle has `WRONG_ZONE_WARNINGS_BEFORE_VIOLATION = 1` prior warning, the next wrong-zone entry becomes a `WRONG_ZONE` violation with a fine (`violations.ts:76-105`). The fine is establishment-configurable (`config.ts:250` `resolveViolationFine`; default ₱100 at `packages/config/src/index.ts:34`), so copy never hard-codes the amount. Only the manual entry route refuses with 409 (`sessions.ts:100-108`); no camera refuses a car. | The word "hold" is reserved for Reservation. Assignment copy = "Go to Zone X — no space is kept. Entering another zone gets a wrong-zone warning, then a fine." |
| C2 | "Reserve for later" needs a backend change or must become "Reserve now" | Backend already accepts a caller `startAt` (`routes/reservations.ts:28`, `reservation.ts:192`); only the mobile client hard-codes `new Date()` (`ReservationPanel.tsx:37`). | "Reserve for later" can become true in UI only (start-time presets). No backend work. |
| C3 | Tests pin strings like "Park now" and "Suggestion only…" | Grep of `apps/mobile/__tests__` finds **no** test pinning "Park now", "Reserve for later", "Suggestion only", "You're all set" or "Live". Tests pin **testIDs** (e.g. `assignment-submit` ×26, `reservation-create` ×18, `accept-recommendation` ×20). Text pins that do matter: `recommendation.test.tsx:138` ("Recommended Zone B. 12 spaces available…" a11y label), admin `cameras-page.test.tsx:61` (`"Online"`), admin `app-shell.test.tsx` (`"Logout"`, `/parking operations/i` button). | Keep testIDs stable where a behaviour survives; change text pins deliberately with a replacement assertion. |
| C4 | "Live Alerts" needs a backend filter | An unresolved filter already exists: `GET /admin/anomalies?resolved=false` (`services/api/src/routes/admin.ts:622-626`). The dashboard aggregate (`admin.ts:311-345`) returns resolved + unresolved. | Admin "Needs attention" uses the existing endpoint. The aggregate is renamed "Recent alerts". No backend work required. |

### 0.2 Allowed APIs (exist today — use only these)

Mobile
- `useRealtime(): { status: RealtimeStatus }` — `apps/mobile/src/lib/realtime.ts:14,54`. `RealtimeStatus = "CONNECTED" | "DISCONNECTED" | "RECONNECTING" | "ERROR"`. Currently the return value is thrown away in `src/providers/AppProviders.tsx:9-11`.
- `api.createAssignment(input)`, `api.assignments`, `api.createReservation(input: CreateReservationInput)`, `api.reservations`, `api.recommendedZone` (see `ZoneAssignmentPanel.tsx:34-37`, `ParkingRecommendation.tsx:65-73`). `CreateReservationInput` accepts `startAt?` / `endAt?` — confirm in `packages/types` before use.
- `queryKeys.*` — `apps/mobile/src/lib/query.ts`.
- `DEFAULT_RESERVATION_WINDOW_MINUTES = 15` — `packages/config/src/index.ts:21` (server may override via `ConfigService.getReservationWindowMinutes()`; UI must read the window from the returned reservation's `startAt`/`endAt`, never assume 15).
- Assignment window: from the returned `expiresAt` (`assignment.ts:97`), never hard-coded.
- Existing zone detail route: `apps/mobile/app/zones/[id].tsx`.
- `NavigateButton`, `StateComponents` (Loading/Error/Empty), `FormAlert`, `Button` (loading/disabled), `ChoiceChip`, `SegmentedControl`, `VehicleSelection` (provider + chips).

Admin
- `useRealtime(): { status }` — `apps/admin/lib/realtime.ts:12,40`; return value discarded in `components/providers/providers.tsx:10-12`.
- React Query `dataUpdatedAt` on the dashboard query (for "Updated hh:mm").
- `GET /admin/anomalies?resolved=false` (`admin.ts:622`), appeals page data (`app/(app)/appeals/page.tsx` — read its query before reuse).
- `ANOMALY_LABEL` map already exists in `components/ui/Badge.tsx:153-162` — reuse, do not duplicate.
- Zone config camera status is `ONLINE | OFFLINE` set by an admin (`services/api/src/domain/zoneConfig.ts:26`). It is **not** health.
- `QueryBoundary`, `State` (Loading/Error/Empty), `DataTable`, `PageHeader`, `Badge`, `Button`, theme provider.

### 0.3 Anti-patterns (do not do)
- No camera heartbeat, "last seen", uptime or pipeline health in UI — the backend has none.
- No "Recommended for you" — the pick is global least-occupied ratio (`services/api/src/domain/zones.ts:106-120`).
- No hard-coded "15 minutes" — derive from returned timestamps.
- No new dependency for a date picker — use preset chips (`ChoiceChip`).
- No Prisma/DB access from mobile or admin.
- No feature flags keeping old and new screens alive.
- Do not change backend contracts in this redesign. Backend needs go to the Backend Task list (end of file).

### 0.4 Baseline (run at the start of Phase 1 and record exact counts)
```bash
npm test -w @parada/mobile
```
```bash
npm test -w @parada/admin
```
```bash
npx turbo run typecheck lint build --filter=@parada/mobile --filter=@parada/admin
```
Record pass/fail counts per suite in the Phase 1 report. Known pre-existing noise is listed in memory `parada-phase-11d-sdk57`.

---

## Deliverable A — Information architecture (new)

### A.1 Mobile tab map — one home per concept

| Tab (label) | Route file (kept) | Owns | Does NOT show |
|---|---|---|---|
| **Now** | `app/(tabs)/parking.tsx` | The one current thing, by precedence: Active Session → Active Reservation → Active Assignment → Idle. Its actions (Navigate, Cancel). Notification bell (single entry point). Connection line. | Zone list, history, recommendation card |
| **Zones** | `app/(tabs)/park.tsx` | Zone list with availability, "Least busy" marker, zone choice → decision panel: **Go to this zone** (Assignment) or **Reserve a space** (Reservation with start preset). | Current session/reservation cards, reservation list |
| **History** | `app/(tabs)/sessions.tsx` | Past sessions and past/cancelled/expired reservations, read-only. | Any create/cancel control for a live item |
| **Account** | `app/(tabs)/account.tsx` | Vehicles, Payments & fees, Violations, Edit profile, Change password, Appearance, Sign out. | Static "Status", "Sign-in", about text, role pill, second notifications entry |

Rules
- Route file names stay (deep links, `routeTree.test.tsx`, `navigation.test.tsx`); only titles/labels change.
- `VehicleSelectionProvider` moves to `app/(tabs)/_layout.tsx` — one selection shared by Now and Zones (removes the two providers at `parking.tsx:108`, `park.tsx:71`).
- Reservation display: exactly **one** component (`CurrentPlanCard`, Now) for live items and one row type (`HistoryRow`, History) for past items.
- No copy anywhere refers to a control on another tab. A cross-tab move is a button that navigates ("Find a zone" → Zones).

### A.2 Admin navigation — always visible, no collapsible groups

Group headings are plain labels (not buttons). Every link is in the tab order at all times.

| Heading | Links (route) |
|---|---|
| Monitor | Dashboard `/` · Zones `/zones` · Cameras `/cameras` · Sessions `/sessions` (was "Vehicles") · Reservations `/reservations` |
| Act | Violations `/violations` · Appeals `/appeals` · Anomalies `/anomalies` · Guest admission `/guest-admit` |
| Records | Users `/users` · History `/history` · Analytics `/analytics` · Notifications `/notifications` |
| System | Simulator `/simulator` · Settings `/settings` |

- Account leaves the nav. The header has **one** identity chip (name + role) that opens a menu with Account and **Log out** (the only logout).
- One active indicator (background + `aria-current`); drop the dot.
- The drawer (mobile width) reuses the same list; label it `aria-label="Primary"` only once (the drawer copy becomes `aria-label="Primary (menu)"` or the desktop nav is `hidden` from AT while the drawer is open).

---

## Deliverable B — Primary flows (low fidelity, side by side)

### B.1 Driver: find zone → reserve or go → navigate → gate entry → session

```
CURRENT                                         NEW
───────────────────────────────────────────     ───────────────────────────────────────────
Home                                            Now (idle)
 "Live zone availability…" (unbound)              "Nothing planned."  [Find a zone]
 Recommendation card "Recommended for you"        conn line: "Live" | "Reconnecting…" | "Updated 10:42"
  "Suggestion only - does not reserve a spot"          │
  [Reserve Recommended Zone]  [Choose Another]         ▼
   (creates a RESERVATION)                        Zones
        │                                          list: Zone B  12 of 40 free  [Least busy]
        ▼                                                Zone A   3 of 30 free
Park tab                                          tap zone → decision panel (same screen)
 5 heading levels                                  Vehicle: [ABC 123] [XYZ 789]
 [Park now | Reserve for later]                    ┌ Go to Zone B ───────────────────────┐
 [Assign to Zone]  → Assignment                    │ Enter through Zone B's gate before   │
   "You're all set in Zone B!"                     │ 10:57. No space is kept for you.     │
   "See it under Current parking above"  (✗ tab)   │ Entering another zone gets a wrong-  │
 Reserve → startAt = now (✗ "later")               │ zone warning, then a fine. [Go here] │
   "Reserved Zone B for you!"                      └──────────────────────────────────────┘
                                                   ┌ Reserve a space ────────────────────┐
Sessions tab                                       │ Arrive: (Now) (In 30 min) (In 1 h)   │
 My reservations (live, cancellable)               │ A space is kept from 11:12 to 11:27. │
 "Switch to Reserve above…" (✗ tab)                │                        [Reserve]    │
 Session history                                   └──────────────────────────────────────┘
                                                        │ success → switch to Now tab
Home "Current parking"                                  ▼
 Stamp "ZONE ASSIGNED" + Badge (duplicate)        Now (plan)
 [Navigate] [Cancel assignment]                    "Reserved · Zone B · ABC 123"
                                                   "Space kept 11:12 – 11:27"
                                                   [Navigate]  [Cancel reservation]
                                                        │ Navigate opens maps (GPS = navigation only)
                                                        ▼
                                                  Gate camera records entry (backend)
                                                        │ SSE PARKING_SESSION_STARTED → invalidate
                                                        ▼
                                                  Now (session)
                                                   "Parked · Zone B · since 11:14"
                                                   elapsed (visual), fee rule
                                                        │ exit camera → PARKING_SESSION_COMPLETED
                                                        ▼
                                                  History row + fee notification
```

Rule: no screen says "parked", "all set" or shows a session before the backend returns an ACTIVE session.

### B.2 Operator: detect → act → confirm

```
CURRENT                                         NEW
───────────────────────────────────────────     ───────────────────────────────────────────
Dashboard                                       Dashboard
 "Live facility state" (hard-coded green)         header: "Live" only if CONNECTED, else
 4 stat cards + "Camera Status: n online"                 "Reconnecting…" / "Updated 10:42"
 "Live Alerts" (resolved + unresolved mixed)      ┌ Needs attention ─────────────────────┐
 Zones table: text+count+bar+badge per row        │ 3 unresolved anomalies  → /anomalies │
 "Gate cameras — Vision pipeline health"          │ 2 pending appeals       → /appeals   │
 Nav: Zones/Cameras/Violations collapsed          │ Zone C full             → /zones/C   │
        │                                          │ (empty: "Nothing needs attention.")  │
        ▼                                          └──────────────────────────────────────┘
Expand group → find page                          Zones: 1 row = name · "28 / 40" · bar
Act (Disable / Dismiss) — no success message      Cameras: "4 of 5 enabled" (admin setting)
                                                  Recent alerts (resolved shown as Resolved)
                                                        │ click item
                                                        ▼
                                                  Page (always in nav) → row action
                                                   "Dismiss violation for ABC 123"
                                                        │ backend confirms
                                                        ▼
                                                  Inline success (role=status):
                                                   "Violation for ABC 123 dismissed."
                                                  List refetches; count on dashboard drops
```

---

## Deliverable C — Copy table (old → new, tied to backend behaviour)

Pluralise every count with a single helper (`plural(n, "space")`) — fixes "1 spaces", "1 zones".

### C.1 Mobile

| Where (current) | Old | New | Backend behaviour it describes |
|---|---|---|---|
| Tab bar `_layout.tsx` | Home / Park / Sessions / Account | Now / Zones / History / Account | IA A.1 |
| `parking.tsx:33` | "Hey {first}, let's find your spot." | "Hi, {first}" (title only) | none — greeting |
| `parking.tsx:111` | "Live zone availability from the gate cameras" | Connection line: CONNECTED → "Live"; RECONNECTING/DISCONNECTED/ERROR → "Reconnecting…" + "Updated {hh:mm}" (last successful zones fetch) | `useRealtime().status`, React Query `dataUpdatedAt` |
| `CurrentParkingState.tsx:68` | "No active parking" | "Nothing planned." + button "Find a zone" | no session, reservation or assignment returned |
| `CurrentParkingState.tsx:91,122` | "Checking your parking state…" | "Loading…" | loading |
| `CurrentParkingState.tsx:52` | "We couldn't load your current parking status." | keep | fetch error |
| `CurrentParkingState.tsx:215` | "SESSION STARTED" | "Parked since {time}" | ACTIVE session (`enteredAt` from gate camera) |
| `CurrentParkingState.tsx:222` | "SESSION FEE" | "Fee so far" if backend returns a running fee; else "Fee is set at exit" | read the session payload in Phase 3 — do not compute fees client-side |
| `CurrentParkingState.tsx:297` + Badge | Stamp "ZONE ASSIGNED" + Badge | one label: "Going to {zone}" | ACTIVE assignment |
| `:289` | "Valid until {datetime}" | "Enter by {time}. No space is kept." | `expiresAt`; assignment does not protect capacity |
| `:333,336` | "Cancel assignment" | "Cancel" (a11y: "Cancel plan to go to {zone}") | `DELETE` assignment → CANCELLED |
| `:372` + Badge | "RESERVED" + Badge | one label: "Reserved" | reservation PENDING/CONFIRMED |
| `:366` | "Start {dt}. End {dt}." | "Space kept {start} – {end}" | `startAt`/`endAt` window protects capacity |
| `:246,322,395` | "Navigate to parking" / "Navigate to assigned zone" | "Navigate" (a11y: "Navigate to {zone} in Maps") | opens external maps; GPS navigation only |
| `ParkingRecommendation.tsx:130` | "Recommended for you" | removed from Now. On Zones, tag "Least busy" on the returned zone | global lowest occupied/capacity ratio (`zones.ts:106-120`) |
| `:134` | "Suggestion only - does not reserve a spot" | removed (tag carries no action) | — |
| `:171` | "Finding the best zone…" | removed | — |
| `:243` | "Reserve Recommended Zone" | removed (one reserve path, in Zones) | — |
| `:186` | "No suitable parking zone is currently available." | Zones empty: "Every active zone is full." / "No zones are open." | all ACTIVE zones FULL / none ACTIVE |
| `park.tsx:74` | "Pick a zone from live gate-camera availability" | removed (connection line covers it) | — |
| `park.tsx:87` | "Updated every 30 seconds" | removed (connection line) | — |
| `park.tsx:82` | "{n} of {m} zones open" | "{n} of {m} zones open" with plural helper | zones with status ACTIVE and not FULL |
| `park.tsx:128-129` | "Park your vehicle" / "Pick how you'd like to use the selected zone" | panel title "{zone name}" | — |
| `park.tsx:139` | "Park now" | "Go to this zone" | creates Assignment |
| new (Go panel body) | — | "Enter by {time}. No space is kept for you. Entering another zone gets a wrong-zone warning, then a fine." | `expiresAt`; camera path `WRONG_ZONE_WARNING` then `WRONG_ZONE` violation (`occupancy.ts:505-543`); fine amount configurable, never hard-coded |
| `park.tsx:145` | "Reserve for later" | "Reserve a space" | creates Reservation (capacity protected) |
| `ZoneAssignmentPanel.tsx:68` | "Assign to Zone" | "Go here" | Assignment |
| `:107` | "You're all set in {zone}!" | "Going to {zone}. Enter by {time}." then switch to Now | Assignment ACTIVE; no session yet |
| `:115` | "See it under Current parking above" | removed | — |
| `:96` | "This vehicle already has an assigned zone." | "This car already has a plan. Cancel it on Now first." + button "Open Now" | 409 active assignment |
| `:93` | "This zone is no longer available. Please choose another zone." | "{zone} can't take this car right now. Choose another zone." | 409 CONFLICT |
| `ReservationPanel.tsx:106-107` | "Reserve a spot" / "Hold a zone for your arrival with a reservation" | "Reserve a space" / "Arrive:" [Now] [In 30 min] [In 1 hour] + "A space is kept from {start} to {end}." | `startAt` = now + preset; `endAt` from server window |
| `:101` | "Reserved {zone} for you!" | "Reserved. Space kept {start} – {end}." | CONFIRMED/PENDING reservation returned |
| `:78` | "This zone is no longer available for reservation…" | "{zone} has no free space for that time. Try another time or zone." | 409 capacity/overlap |
| `ReservationList.tsx:33` | "My reservations" / "Status from the parking service" | History section "Reservations" | past reservations |
| `ReservationList.tsx:52` | "Switch to Reserve above to hold a spot for your arrival." | "No reservations yet." | — |
| `sessions.tsx:38-39` | "Sessions" / "Every gate entry and exit for your plates" | "History" / "Parking sessions and past reservations" | — |
| `sessions.tsx:107` | "Your parking journey starts here." | removed (empty state title is enough) | — |
| `account.tsx:40` | "Your profile, alerts and app details" | removed | — |
| `account.tsx:143-155` | "Status", "Sign-in — Kept securely on this device", about text, role pill | removed | static |
| `account.tsx:126` | "Notifications" row | removed (bell on Now) | — |
| `account.tsx:160,165` | "Sign Out" / "Sign out" | "Sign out" (one casing) | clears SecureStore token |
| `StatusBadge.tsx:82` | APPEALED → "Under review" | "Under appeal" (match admin) | violation APPEALED |
| paid status | "Paid" | "Fine paid" (match admin) | violation PAID |
| `ActiveSessionBanner.tsx:89`, `SessionCard.tsx:29` | "GUEST" / "guest" | "Guest" | guest session |
| availability low | "Low" | "Few spaces" (both apps) | LOW_AVAILABILITY |
| `login.tsx:64` | "…live zone availability" | "Sign in to find and reserve parking." | — |
| `login.tsx:102,105` | "Sign In" / "Sign in" | "Sign in" | — |

### C.2 Admin

| Where | Old | New | Backend behaviour |
|---|---|---|---|
| `AppShell.tsx:357` | "Live facility state" (hard-coded) | CONNECTED: "Live"; else "Reconnecting…" · "Updated {hh:mm}" | `useRealtime().status`, `dataUpdatedAt` |
| `AppShell.tsx:71` | "Vehicles" | "Sessions" | `/sessions` |
| `AppShell.tsx:250,375` / `:253,378` | "Administrator" ×2, logout ×2 | one chip "{name} · Admin", menu: Account, Log out | cookie logout |
| `page.tsx:185` | "Real-time parking management overview" | removed (connection indicator says it) | 30 s poll + partial SSE |
| `page.tsx:203,219,226` | Total Occupancy / Active Vehicles / Available Spaces | "Occupied" / "Parked now" / "Free spaces" | aggregate counts |
| `page.tsx:234` | "Camera Status — n online" | "Cameras enabled: {n} of {m}" | admin `ONLINE/OFFLINE` switch |
| `page.tsx:382-406` | "Gate cameras — Vision pipeline health", Online/Offline, Wifi icons | removed (duplicate) | — |
| `page.tsx:163,251` | "Live Alerts" | "Recent alerts"; each resolved item labelled "Resolved" | latest 8 anomalies + 8 notifications (`admin.ts:311-345`) |
| `page.tsx:261` | "No active alerts." | "No recent alerts." | — |
| new | — | "Needs attention" / "Nothing needs attention." | `/admin/anomalies?resolved=false`, pending appeals, FULL zones |
| `page.tsx:270` | raw `anomalyType` | `ANOMALY_LABEL[type]` | — |
| `page.tsx:294` | "Authoritative zone-level availability" | removed | — |
| `admin.ts:358` via page | "{n} zones reporting" | "{n} active zones" computed client-side from zones list with status ACTIVE; backend fix listed B3 | — |
| `page.tsx:352,367` | "ENTRY" / `ev.source` raw | "Entry" / "Exit"; source → "Camera" / "Simulator" / "Manual" (map; unknown → "Other") | event type/source enums — read the enum in `packages/types` |
| `cameras/page.tsx:165-166` | "Online (operational)" / "Offline (disabled)" | "Enabled" / "Disabled" | admin switch; UI label only, enum unchanged |
| `cameras/page.tsx:105` | "Direction and operational status are backend-authoritative." | removed | — |
| `cameras/page.tsx:20,154` | "Bidirectional" | "Entry and exit" | BIDIRECTIONAL |
| `cameras/page.tsx:331` | ENTRY/EXIT raw | "Entry" / "Exit" | — |
| entry/exit icons | DoorClosed = entry, DoorOpen = exit | `LogIn` = entry, `LogOut` = exit (lucide) or text only | — |
| `zones/page.tsx:72,249` | "…authoritative…" copy | "Capacity sets how many cars this zone accepts." | capacity drives availability |
| `Badge.tsx:45` zone | "Offline" | "Inactive" | zone INACTIVE |
| `violations/page.tsx:43` | `WRONG_ZONE` raw | "Wrong zone" (label map beside `ANOMALY_LABEL`) | violation type |
| Row actions | "Edit" / "Disable" / "Dismiss" | visible text same; `aria-label` "Edit camera CAM-A01" etc. | — |
| `login/page.tsx:115` | "Sessions are kept in an HttpOnly cookie…" | removed | — |
| success (new) | none | "{Thing} saved." / "Camera CAM-A01 disabled." / "Violation for ABC 123 dismissed." in `role="status"` | after 2xx |

Test-pinned text that changes (update deliberately, with replacement assertion): admin `cameras-page.test.tsx:61` "Online" → "Enabled"; admin `app-shell.test.tsx` "Logout" → "Log out" and `/parking operations/i` button → heading; mobile `recommendation.test.tsx:138` label (component removed from Now; move assertion to Zones "Least busy").

---

## Deliverable D — States checklist per screen

Legend: ✔ required, with the primitive to use. Focus = visible focus on every interactive element (admin `focus-visible` ring; mobile pressed + a11y state). Disabled = `accessibilityState.disabled` / `disabled` + reason text where it isn't obvious.

| Screen | Empty | Loading | Error | Success | Focus | Disabled |
|---|---|---|---|---|---|---|
| M Now | "Nothing planned." + Find a zone (`EmptyState`, mascot allowed) | `LoadingState` "Loading…" | `ErrorState` + Retry | card shows new state; cancel → "Cancelled." `FormAlert` notice | Navigate, Cancel, bell | Cancel while pending (`Button loading`) |
| M Zones | "No zones are open." / "Every active zone is full." | `LoadingState` | `ErrorState` + Retry | after Go/Reserve: `FormAlert` + auto-switch to Now | zone radios (`checked`), vehicle chips, presets, actions | action disabled until zone + vehicle; reason line "Choose a car first."; full zone: "Go here"/"Reserve" disabled with "Zone full" |
| M History | "No parking sessions yet." | `LoadingState` | `ErrorState` + Retry | n/a (read-only) | rows if pressable | n/a |
| M Account | n/a | profile `LoadingState` | `ErrorState` + Retry (keep `account-cache-retry`) | appearance change applies; sign-out → login | all rows, radios | sign-out while pending |
| M Login | n/a | button "Signing in…" | `FormAlert` error (keep EMAIL_NOT_VERIFIED path) | notices at `login.tsx:18,20` | inputs, links (44pt hit area) | submit while pending |
| A Shell | n/a | "Loading operations console…" | "Admin access required" / "Forbidden" (keep) | n/a | skip link, nav, identity menu, drawer (focus trap, Escape, return focus) | n/a |
| A Dashboard | per panel: "Nothing needs attention.", "No recent alerts.", "No zones configured yet.", "No recent parking events." — **fix** `isEmpty={!data}` to per-panel empty arrays | `QueryBoundary` | `QueryBoundary` + Retry | n/a | zone rows as links, alert links | n/a |
| A Zones | keep "No parking zones yet." | `QueryBoundary` | `QueryBoundary`; form error inline | "Zone {name} saved." / "…deactivated." `role=status` | form, row actions; return focus to trigger after form close | Activate/Deactivate pending (`aria-busy`) |
| A Cameras | keep "No cameras configured." | `QueryBoundary` | same | "Camera {id} saved/enabled/disabled." | same | same |
| A Violations | "No violations." | `QueryBoundary` | same | "Violation for {plate} dismissed." | row actions with context labels | pending |
| A Login | n/a | "Signing in…" | inline error (keep strings in `login.test.tsx`) | redirect | inputs, button | pending |

Add `Button` `loading` prop + `aria-busy` in admin (`components/ui/Button.tsx`).

---

## Deliverable E — Token changes (single source)

### E.1 Contrast fixes — ratios computed with WCAG 2.x from token values (script: scratchpad `contrast.js`; soft tints composited over `surface`/`card`)

| App / theme | Pair | Now | Change | New |
|---|---|---|---|---|
| M dark | ghost-button text `primary` on surface / elevated | 4.17 / 3.58 | use `primaryDeep` #FFA364 | 5.69 / 4.89 |
| M light | ghost-button text `primary` on white | 2.00 | use `primaryDeep` #8A5A00 | 5.93 (white), 4.97 (elevated), 5.44 (background) |
| M dark | placeholder `faint` on surface / elevated | 3.58 / 3.07 | placeholders use `muted` #C7BBAE | ≥5.10 |
| M light | placeholder `faint` on white | 3.17 | placeholders use `muted` #565C7A | 5.49 on elevated (higher on white) |
| M dark | `danger` on dangerSoft | 3.83 | new token `dangerInk` #FFA197 (dark); light `dangerInk` = `danger` | 4.69 (light 5.54 already passes) |
| M dark | `info` on infoSoft | 3.74 | new token `infoInk` #A5C2FF (dark); light = `info` | 4.74 (light 5.57) |
| M light | disabled text | 2.16 | exempt (WCAG 1.4.3 incidental); keep, but pair with `accessibilityState.disabled` | — |
| A dark | `brand-dark` text on `brand-soft` | 4.48 | pill/active-nav text uses `brand` | 6.95 |
| A light | `brand-dark` #C2410C on `brand-soft` | 4.44 | `--brand-dark` light → 178 58 10 (#B23A0A) | 5.14 (card 5.90, paper 5.37) |
| A dark / light | placeholder `faint` | 3.36 / 3.05 | placeholders use `muted` | 4.99 / 5.46 |
| A dark | focus ring `brand/0.35` vs card | 1.99 | 2px solid `brand` ring + 2px offset in `paper` | 7.34 (card), 8.09 (paper) |
| A light | focus ring vs card | 1.33 | 2px solid `brand-dark` (#B23A0A) ring | 5.90 (card), 5.37 (paper) |
| A light | `btn-primary` hover: on-accent on brand-dark | 3.80 | new `--brand-hover` light 232 131 15 (#E8830F) | 7.21 (dark theme hover stays 5.53) |
| A light | `btn-success` hover: on-accent on success | 3.23 | hover text → `text-paper` | 5.46 |

Fix the false claim comment at `apps/mobile/src/theme/colors.ts:13` to match reality after the change. `faint` stays only for non-text (dividers, disabled icons) — grep every `faint` text usage.

### E.2 Mobile off-scale removals
- Spacing: 3 → 4, 5 → 4, 6 → 8, 10 → 8 or 12 (nearest; prefer the smaller where it is inner padding). Sites: `PlateChip.tsx:51-57`, `Stamp.tsx:62`, `StatusBadge.tsx:208-214`, `account.tsx:320`.
- Font sizes: 12 → 11 (`CapacityBar.tsx:78`, micro label), 14 → 15 (`ChoiceChip.tsx:88`), 16 → 17 (`Input.tsx:221`). Off-scale line heights 13/16 → ramp values.
- Radii literals 7, 6, 4, 2 → `radii.sm` or `radii.cut`.
- `glass.ts:30-38`: delete the `hero` preset (GlassCard leaves routine screens); re-derive `chrome` from `tokens.background` / `tokens.border` so no navy/gold literal remains.

### E.3 Cut rule — decision
**Buttons, cards, panels, inputs: cut (one sharp top-right corner, `radii.cut`). Chips, badges, tab bar, avatars: pill (`radii.full`).** This matches the rule header (`radii.ts:4-9`, "the primary action carries the same cut"). Fix the contradicting comment on `full` (`radii.ts:22` → "Pills: chips, badges, tab bar, avatars"). SegmentedControl = cut container, pill-free segments. Apply to the ~15 violators listed in E-M-V6. Admin: replace every literal `rounded-tr-[3px]` with `rounded-tr-control-cut`; same rule set.

### E.4 Admin type and spacing tokens (`tailwind.config.ts`)
- `fontSize`: `micro 11px/16px`, `xs 12px/16px`, `sm 14px/20px`, `base 16px/24px`, `lg 18px/28px`, `xl 20px/28px`, `2xl 24px/32px`, `3xl 30px/36px`, `display 48px/1`.
  Mapping: `text-[10.5px]`, `[11px]`, `[11.5px]` → `text-micro`; `[12px]` → `text-xs`; `[15px]` → `text-base`; `[1.75rem]` → `text-3xl`.
- Spacing: 4px grid only. Ban half steps `0.5`, `1.5`, `2.5`, `3.5` in page/components (nearest full step). Arbitrary sizes (26, 34, 36, 40, 44, 72, 168 px) → theme `spacing` keys only where they are real sizes (`44` = `touch`), otherwise nearest step.
- **Keep** both light-theme blocks. `globals.css:46-73` (`[data-theme="light"]`) serves the no-flash script; `:79-101` (`prefers-color-scheme: light`) covers a light-mode user whose script did not run. They are not redundant. Any light-theme token change (E.1) must be made in **both** blocks — add a test that parses both and asserts they are identical.
- Remove `parada-drift` (`globals.css:147-172`), `bg-white`, black shadows in light mode; theme the select chevron (`globals.css:227`).
- Guard (add to verification): `rg "text-\[\d|rounded-tr-\[|\b(p|m|gap|space-[xy])-?[xy]?-(0\.5|1\.5|2\.5|3\.5)\b" apps/admin/app apps/admin/components` returns nothing.

---

## Implementation phases

### Phase 1 — Tokens and contrast (no layout change)
**What:** apply Deliverable E exactly. Add `dangerInk`/`infoInk` to `ColorTokens` (both palettes) and switch soft-pill text in `StatusBadge.tsx`/`Stamp.tsx`; switch ghost `Button` text to `primaryDeep`; placeholders to `muted` (`Input.tsx`); off-scale values; cut rule; `glass.ts`. Admin: `globals.css` vars, `tailwind.config.ts` fontSize + focus shadow → ring, button hover rules, arbitrary-literal replacement.
**Docs/refs:** `colors.ts:74-133`, `spacing.ts:7-29`, `typography.ts:62-90`, `radii.ts`, `globals.css:16-101,193-214`, `tailwind.config.ts:66`.
**Tests to add:** mobile `theme.contrast.test.ts` — computes the ratios in E.1 from the token objects and asserts ≥4.5 (text) / ≥3 (focus); admin `tokens.contrast.test.ts` parsing the CSS vars in `globals.css`. Assert no off-scale spacing literals with a source grep test only if one already exists in the repo; otherwise put the grep in the verification checklist.
**Verify:** both suites green (same counts as baseline + new tests); typecheck/lint/build; guard grep in E.4 empty.
**Don't:** change hues beyond the table; touch layout or copy.

### Phase 2 — Honest status plumbing (both apps)
**What:**
- Mobile: `RealtimeConnection` stores `status` in a new `RealtimeStatusContext` (`src/providers/RealtimeStatusProvider.tsx`); `useRealtimeStatus()` returns `status` (default `"DISCONNECTED"` when signed out). New `ConnectionLine` component: CONNECTED → "Live"; otherwise "Reconnecting…" + "Updated {hh:mm}" from the zones query `dataUpdatedAt`. `accessibilityLiveRegion="polite"` on transitions only.
- Admin: same context in `components/providers/providers.tsx`; `ConnectionIndicator` replaces the hard-coded dot at `AppShell.tsx:353-357` (green dot only when CONNECTED, `role="status"`).
- Admin camera wording (C.2) and "Recent alerts" rename; removal of duplicate "Gate cameras" card.
**Tests to add:** mobile `realtimeStatus.test.tsx` (each status → text; unmount on sign-out → "DISCONNECTED"); admin `connection-indicator.test.tsx` (CONNECTED shows "Live", RECONNECTING never shows "Live"); update `cameras-page.test.tsx:61` "Online" → "Enabled" with an added assertion that no "online"/"health" text renders; dashboard test (none exists today) `dashboard-page.test.tsx` asserting "Recent alerts" and resolved items labelled "Resolved".
**Don't:** touch the SSE lifecycle, auth invalidation or `notifyAuthInvalidated` — only expose status. A transport error must never log the user out.

### Phase 3 — Mobile Now tab (replaces Home)
**What:**
- Move `VehicleSelectionProvider` to `app/(tabs)/_layout.tsx`; remove the two local providers.
- New `CurrentPlanCard` (one component) rendering, by precedence, Session → Reservation → Assignment → Idle, reusing the existing queries and the backend-confirmed cache writes. Keep testIDs `current-state-empty`, `current-state-loading`, `current-state-navigate`, `assignment-current`, `reservation-current`, `active-banner*`, `active-session-error*` on the equivalent elements.
- Remove `ParkingRecommendation` from Now, the mascot callout, `GradientMesh`/`GlassCard` wash. Tab labels per A.1.
- Copy per C.1 rows for Now.
**Tests:** keep `currentState.test.tsx`, `activeSession.test.tsx`, `vehicleSelection.test.tsx` green; add `now.test.tsx`: precedence (session beats reservation beats assignment), idle shows "Find a zone" which navigates to Zones, no "Live" when status ≠ CONNECTED, one label per state (no Stamp+Badge pair), vehicle chosen on Now is selected on Zones.
**Don't:** show "Parked" before the backend returns an ACTIVE session; compute fees client-side.

### Phase 4 — Mobile Zones tab (replaces Park)
**What:** zone list (existing `ZoneCard` minus "Selected for…" row `ZoneCard.tsx:118`, no nested button in radio — details via long-press or separate row link to `zones/[id]`), "Least busy" tag from `api.recommendedZone`, decision panel with two actions and start presets (`Now`, `In 30 min`, `In 1 hour` → `startAt`; never send `endAt`). Error mapping shared by one `mapParkingError()` (dedupe `ZoneAssignmentPanel`/`ReservationPanel`). On success write the confirmed entity to the cache (existing pattern) and navigate to Now.
Keep testIDs `assignment-submit`, `assignment-vehicle-*`, `assignment-error`, `assignment-already-assigned`, `assignment-zone-full`, `reservation-create`, `reservation-vehicle*`, `reservation-error`, `reservation-confirmed*`, `zone-*`, `parking-action-reserve`.
**Tests:** keep `park.test.tsx`, `zoneAssignment.test.tsx`, `reservation.test.tsx` green (update only text they pin); add: preset "In 30 min" sends `startAt` ≈ now+30 min and no `endAt`; confirmation shows window from response, not a constant; "Go to this zone" copy states no space is kept; full zone disables both actions; "Least busy" tag on the recommended zone only; no string references another tab.
**Don't:** add a date-picker dependency; call the Assignment a hold or reservation.

### Phase 5 — Mobile History, Account, decoration, accessibility
**What:** History = sessions + past reservations (read-only `HistoryRow`); live reservation cancel moves to Now. Account removals (C.1). Delete mesh/glass on routine screens; mascot only in onboarding + Empty/Error. `accessibilityRole="header"` on titles/section headers; live regions (availability line, plan-state change — not the per-second timer; announce elapsed at minute granularity only if at all); `SegmentedControl` min height 44; login links 44pt hit area (`hitSlop`); radios use `checked`; `app.json` `userInterfaceStyle: "automatic"`; `usePrefersReducedMotion` subscribes to `AccessibilityInfo` change events.
**Tests:** `sessions.test.tsx` updated for History; `account.test.tsx` asserts removed rows absent and `account-role` testID removed deliberately (replace assertion); add header-role and 44pt tests to `primitives.test.tsx`; `gradientMesh.test.tsx`/`glassCard.test.tsx` stay until Phase 8.
**Don't:** delete components yet (Phase 8).

### Phase 6 — Admin shell
**What:** flat nav per A.2 (remove `collapsible`, `aria-expanded` toggles become `<h2>` headings), one identity menu + one "Log out", skip link "Skip to content" → `#main`, drawer focus trap + Escape + focus return, single active indicator, `<main>`/`<header>` landmarks on login.
**Tests:** update `app-shell.test.tsx` (no group buttons; Zones/Cameras/Violations links present on first render; exactly one "Log out"; skip link first focusable); `login.test.tsx` adds landmark assertion.
**Don't:** touch auth-provider or the HttpOnly cookie flow.

### Phase 7 — Admin Dashboard, Zones, Cameras, Violations
**What:** Needs-attention panel (existing endpoints only); one figure component (keep `MetricCard`, delete use of `StatCard`/`StatPanel`; no `NumberTicker` tween); one shared `OccupancyBar` in `components/ui/`; zone row = name · count · bar (+ status text only when not Available); human labels; row `aria-label`s with context; `Button loading` + `aria-busy`; success `role="status"` after every mutation; per-panel empty states; focus return after form close.
**Tests:** `zones-page.test.tsx`, `cameras-page.test.tsx` updated; add `violations-page.test.tsx` (label map, dismiss success message); `dashboard-page.test.tsx` extended (needs-attention empty + populated, no raw enum text rendered).
**Don't:** add health, uptime or "last seen" for cameras.

### Phase 8 — Cutover, deletion and final verification
Delete a component only when all three hold: (1) `rg` finds zero imports; (2) every behaviour its tests covered is asserted by a replacement test (list the mapping in the report); (3) both suites + typecheck/lint/build are green.

Deletion list: `ParkingRecommendation.tsx` (if Zones uses the query directly), `ReservationList.tsx`, `ReservationCard.tsx` (live), duplicate reservation block inside `CurrentParkingState.tsx`, `MascotCallout` uses on tabs, `GradientMesh.tsx` + `gradientMesh.test.tsx` if unused, `GlassCard.tsx` + `glassCard.test.tsx` if unused, `glass.ts` `hero`; admin `StatCard`, `StatPanel`, the page-local `OccupancyBar` copies (`page.tsx:28-37`, `zones/page.tsx:17-26`), `parada-drift`, duplicate logo plate markup.

No feature flag at any point: each phase replaces the screen it touches.

**Final verification checklist**
- `rg -i "live|online|health|real-time|recommended for you|all set|park now|for later" apps/mobile/app apps/mobile/src apps/admin/app apps/admin/components` — every remaining hit is bound to CONNECTED status or is a code identifier.
- `rg "above|below|other tab|Current parking|Switch to" apps/mobile/src apps/mobile/app` — no cross-tab copy.
- E.4 guard grep empty; `rg "#1[0-9A-F]{5}|rgba\(22, 27, 46" apps/mobile/src/theme/glass.ts` empty.
- Suites: mobile, admin (exact counts vs Phase 0 baseline), typecheck/lint/build.
- Manual (label as not automated): one device run of Now/Zones in light + dark + System; admin in both themes with keyboard only. Report which were actually performed.

---

## Backend tasks (separate — not part of this redesign; do not fake in UI)

| ID | Need | Why | Until then UI does |
|---|---|---|---|
| B1 | Camera heartbeat (vision → API `lastSeenAt`, stale threshold) | "online"/health requires measurement | Shows Enabled/Disabled only |
| B2 | Dashboard aggregate: separate unresolved anomalies / unread notifications | "Live Alerts" mixes resolved | Uses `/admin/anomalies?resolved=false` + "Recent alerts" label |
| B3 | "zones reporting" counts INACTIVE zones (`admin.ts:358`) | wrong count | Client counts ACTIVE zones from the zones list |
| B4 | Reservation `startAt` bounds (reject past / far-future) | `reservation.ts:192` accepts any valid date | UI offers presets only (Now, +30 min, +1 h) |
| B5 | Settled during planning review — no backend task. Camera path warns, then fines (`occupancy.ts:505-543`, `violations.ts:76-105`); manual path refuses (`sessions.ts:104`). | — | Copy: "Entering another zone gets a wrong-zone warning, then a fine." (no hard-coded amount) |
| B6 | Running session fee in session payload (if absent) | "Fee so far" | Shows "Fee is set at exit" |

---

## Preserve checklist (verify at every phase review)
Mobile tokens (hues), state primitives, Button loading/disabled, a11y props asserted in `__tests__`, backend-confirmed cache writes (`ParkingRecommendation.tsx`, `ZoneAssignmentPanel.tsx`, `ReservationPanel.tsx` patterns), SSE invalidation tables, reduced-motion gating, SecureStore session, admin HttpOnly auth, theme provider no-flash script, QueryBoundary/State, DataTable caption + `th scope`, PARADA logo, mascot (onboarding + empty/error only), cut shape.

---

## Implementation log

### Phases 1–3 (2026-09-26, branch `feat/rams-redesign`, uncommitted at time of writing)

Deviations from the plan above, with reasons:

- **E.1 ink values are stricter than the table.** The table's `dangerInk` #FFA197 / `infoInk` #A5C2FF pass on `surface` but fail on `surfaceElevated` (4.08 / 4.17). Shipped: a full `*Ink` set that passes on `background`, `surface` and `surfaceElevated` — dark `primaryInk` #FDB69B, `dangerInk` #FFB2AA, `successInk` #62E39B, `warningInk` #FFC65C, `infoInk` #B2CCFF; light `primaryInk` #805A1F, `warningInk` #874A00, others equal to the base hue. `inkColor()` maps a status hue to its ink; asserted in `apps/mobile/__tests__/themeContrast.test.tsx`.
- **Admin `text-brand-dark` replaced everywhere by `text-brand-ink`** (dark = brand, light = #B23A0A) rather than only on soft fills; `--brand-dark` stays for fills/hover.
- **Deferred to Phases 6/7:** admin half-step spacing (61 uses) — it changes layout, and those screens are rebuilt there.
- **Decoration (owner approved removal, done in its own commit after Phases 1–3):** mobile `GradientMesh` deleted (Screen, FullScreenLoading); routine `GlassCard`s replaced by `Card` (Now card, least-busy card, session banner, zone and violation detail); mascot callouts removed from Now/Zones/Sessions and the panels (`MascotCallout` deleted), success callouts replaced by plain `FormAlert` notices ("Assigned to {zone}. Enter by {time}. No space is kept for you." / "Reserved {zone}. Space kept {start} – {end}."). Glass stays on onboarding and the tab-bar chrome; the mascot stays in onboarding and empty/error illustrations (incl. the idle "Nothing planned" card). Admin: background washes + `parada-drift` removed (and the login's inlined copy of them); card shadows are theme variables, warm and light on paper. Guarded by `apps/mobile/__tests__/decoration.test.tsx` and `apps/admin/__tests__/tokens-contrast.test.ts`.
- **Phases 1–3 landed as one commit (`b39a2dc`)**, not one per phase; splitting it would need a force-push.
- **Admin logo plate keeps `bg-white`** — it is the logo's own ground, not a theme surface.
- **Least-busy card stays on Now (idle) until Phase 4** moves it to Zones; removing it in Phase 3 would drop the one-tap reserve path for a phase. Its copy is fixed now ("Least busy zone", "Reserve a space in {zone}", "See all zones").
- **Sessions → History rename moves to Phase 5**, when that tab becomes history-only; renaming earlier would label live reservations as history.
- **Now card keeps assignment and reservation side by side** when both exist (both carry live actions; hiding one hides a cancel path). Session still takes over the card.
- **Navigate buttons read "Navigate to {zone}"** (visible and spoken) instead of a bare "Navigate" — `NavigateButton` has no separate accessibility-label prop, and adding one was unnecessary.
- **"Cancel assignment" wording kept** (names the domain object).
- **Admin connection states:** "Live" / "Reconnecting…" / "Not live"; the dashboard shows "Updated hh:mm:ss" from its own query.

### Phase 4 — Zones tab

- Shipped as planned: "Go to this zone" / "Reserve a space" segments; assignment terms shown before submit ("No space is kept for you. Entering another zone gets a wrong-zone warning, then a fine.", one constant in `lib/assignment.ts`); arrival presets Now / In 30 min / In 1 hour send `startAt` only; one error mapper `lib/parkingErrors.ts`; "Least busy" tag on the backend's pick; the details link is a sibling of the zone radio (no nested control); zone radios expose `checked`; the "Selected for…" row and the "Park your vehicle" heading level are gone; the least-busy card left Now.
- **Deviation:** success does not auto-switch tabs. The panel shows the backend-confirmed notice plus an "Open Now" button — a navigating button, not cross-tab copy — so the driver is never moved without asking.
- `ParkingRecommendation` is now unused by the app; it and `recommendation.test.tsx` are deleted in Phase 8 per the cutover rule.

### Phase 5 — History, Account, accessibility

- Sessions tab renamed **History** (tab, title, subtitle); it now shows completed sessions and past (EXPIRED / CANCELLED) reservations only. The active-session banner and live reservations left it; `ReservationCard` is read-only.
- The live reservation is cancelled on Now. **Deliberate asymmetry:** reservation cancel asks once more ("The kept space is released"), assignment cancel does not — an assignment keeps nothing, a reservation gives up a space that may not be free again. Driver cancel of an ACTIVE (consumed) reservation is still offered because the backend allows it (`reservation.ts` `cancel()` rejects only CANCELLED/EXPIRED).
- Account: removed the static Status row, Sign-in row, about text and the Notifications row (one entry point: the bell on Now); the role pill shows only for ADMIN; "Sign out" casing unified. Phone and App version stay (real data).
- Accessibility: screen and section titles are headers; the connection line is a polite live region (the per-second timer is not); segments are 44pt; login links have 44pt tap areas; radio chips and zone/appearance radios expose `checked`; `app.json` `userInterfaceStyle: "automatic"`; reduced motion follows OS changes live.
- Not done (not in the plan's scope): a visible focus style for keyboard focus on mobile Pressables (E-M-V5) — noted for later.

### Phase 6 — Admin shell

- Navigation is flat and always visible: Monitor (Dashboard, Zones, Cameras, Sessions, Reservations), Act (Violations, Appeals, Anomalies, Guest admission), Records (Users, History, Analytics, Notifications), System (Simulator, Settings). Group names are `<h2>` headings labelling their lists; no toggles. `/sessions` is "Sessions" everywhere. One active indicator (the pill + `aria-current`).
- **Deviation:** instead of an identity *menu*, the header has one identity link to `/account` ("Account: {name}, administrator") and one visible "Log out" button. Same outcome (one identity, one logout) without building a popup menu that would need its own focus management. The sidebar footer (second identity + second logout) and the header bell (second route to Notifications) are gone.
- Skip link "Skip to content" → `#main`; the drawer is a modal dialog ("Menu") with focus on open, Tab trapped inside, Escape to close and focus returned to the opener; its nav is labelled "Primary (menu)". Login has `<main>` and `<aside>` landmarks and no HttpOnly footnote.

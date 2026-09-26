# Evidence — consolidated from five evidence passes

Source reading only, on `feat/mobile-ui-polish` (clean tree, same content as `main` after PR #8). Nothing was rendered. Contrast ratios were computed with the WCAG 2.x formula from token values; soft tints were composited over their ground first. Anchors (E-M… mobile, E-W… web/admin) are cited by the scorecard. I spot-checked E-M6.2, E-M6.3, E-W6.1, E-W6.2 and E-M9.3 against source myself.

---

## A. Mobile driver app (`apps/mobile`)

### Structure
- **E-M-S1 Interactive counts.**
  - Home idle, 2 vehicles: 5 controls plus 4 tabs.
  - Park: 2 per zone (radio card plus details chevron), then 2 segments, 1..V vehicle chips and 1 submit.
  - Sessions: R cancel buttons.
  - Account: 10 controls.
  - Login: 7 controls.
  - Sources: `app/(tabs)/_layout.tsx:88-106`, `ZoneCard.tsx:59,79`, `account.tsx:92-158`, `login.tsx:74-125`.
- **E-M-S2 Nesting.** About 12–13 host levels on Home, Park and Sessions. Example: `Screen.tsx:98` → `CurrentParkingState.tsx:216`.
- **E-M-S3 Repeated patterns.**
  - Notifications have 2 entry points (`parking.tsx:114`, `account.tsx:124`). The "9+" badge logic is duplicated (`IconButton.tsx:50`, `account.tsx:256`).
  - The active-session hero appears on 2 tabs.
  - Reservation display has 3 implementations: `CurrentParkingState.tsx:360-403`, `ParkingRecommendation.tsx:139-169`, `ReservationCard.tsx:47-105`.
  - Selected-zone summary and error mapping are duplicated between `ZoneAssignmentPanel` and `ReservationPanel`.
  - Home and Park build the same 4-query set (`parking.tsx:34-62`, `park.tsx:37-63`).
  - A Stamp and a Badge state the same status in one header row (`CurrentParkingState.tsx:297-298, 372-373`).
  - Two separate `VehicleSelectionProvider`s, so the vehicle choice is not shared between tabs (`parking.tsx:108`, `park.tsx:71`).
  - Assignment cancel takes 1 tap; reservation cancel takes 2 (`CurrentParkingState.tsx:330`, `ReservationCard.tsx:79`).
- **E-M-S4 Dead props.** 0 unused locals (`tsc --noUnusedLocals`). 13 optional props on 9 components are never passed, e.g. `GlassCard.onPress/accent`, `IconButton.tone`, `CapacityBar.compact`, `IconTile.color/filled`.
- **E-M-S5 Removable elements.**
  - GradientMesh on every Screen (`Screen.tsx:99,134`).
  - GlassCard double wash and blur (`GlassCard.tsx:40-49`).
  - The mascot appears 5+ times (callouts on Home, Park and Sessions; the banner; the empty state; every Empty/Error illustration).
  - Park stacks 5 heading levels before the action (`park.tsx:72-131` → panel header).
  - The "Selected for…" row repeats the selected border (`ZoneCard.tsx:118`).
  - The "Recommended" stamp repeats the header (`ParkingRecommendation.tsx:199`).
  - Static Account rows: about text, Status, Sign-in, role pill (`account.tsx:143-155`).

### Visual
- **E-M-V1 Spacing.**
  - Scale: [2,4,8,12,16,20,24,32,40] (`spacing.ts:7-26`).
  - Off-scale values come from token arithmetic: 3, 5, 6 and 10 (`PlateChip.tsx:51-57`, `Stamp.tsx:62`, `StatusBadge.tsx:208-214`, `account.tsx:320`).
- **E-M-V2 Type.**
  - Scale: [11,13,15,17,18,20,30,40].
  - Off-scale font sizes: 12 (`CapacityBar.tsx:78`), 14 (`ChoiceChip.tsx:88`), 16 (`Input.tsx:221`).
  - Off-scale line heights: 13 and 16.
- **E-M-V3 Colour.**
  - 22 unique dark values and 21 light.
  - `glass.ts:30-38` dark values are the retired navy/gold palette (rgba(22,27,46), rgba(242,169,59)). They do not match the current #273248 / #FC7643.
- **E-M-V4 Contrast (dark).**
  - muted is ≥5.10 everywhere.
  - faint (placeholders) is 3.07–4.10, **fail**.
  - `primary` as ghost-button text: 4.17 on surface and 3.58 on elevated, **fail**. In light it is **1.68–2.00**.
  - danger on dangerSoft 3.82 and info on infoSoft 3.73, **fail**.
  - Light disabled text is 2.16.
  - The comment at `colors.ts:13` claims every text token is ≥4.5:1; the figures above contradict it.
- **E-M-V5 States.**
  - Present: loading, error, empty (`StateComponents.tsx:13,30,70`), disabled (`Button.tsx:62-103`), success (FormAlert notice, mascot confirmations).
  - Focus: only `Input` shows a focus style. Pressable, Button, Chip and Segmented have none.
- **E-M-V6 Shape rule** (the top-right "cut", `radii.ts:4-22`).
  - About 15 elements break it: SegmentedControl, the ErrorState button, elapsedRow, windowBox ×2, selectedRow, the degraded banner, NotificationRow, and others.
  - The rule contradicts itself: buttons are "cut" at `radii.ts:10` but "pills" at `radii.ts:22`.
  - Non-token radii: 7, 6, 4 and 2.

### Copy and honesty
- **E-M6.1 "Live" claims are unconditional.**
  - Where: "Live zone availability from the gate cameras" (`parking.tsx:110`), "live gate-camera availability" (`park.tsx:74`), "live zone availability" (`login.tsx:64`).
  - The realtime connection status is discarded (`src/providers/AppProviders.tsx:9`).
  - "Updated every 30 seconds" (`park.tsx:87`) contradicts "live" two lines earlier.
- **E-M6.2 "Reserve for later" always reserves now.**
  - Label: `park.tsx:145`. Behaviour: `startAt: new Date().toISOString()` (`ReservationPanel.tsx:37`).
  - There is no time picker, and the window is 15 min (`packages/config/src/index.ts:21`). *Verified.*
- **E-M6.3 "Park now" creates an Assignment, not a parking session.**
  - Label: `park.tsx:139`. Behaviour: `ZoneAssignmentPanel.tsx:65`.
  - The success copy "You're all set in {zone}!" (`ZoneAssignmentPanel.tsx:107`) reads as if the car is parked.
  - This contradicts Assignment ≠ Session; a session starts only when the gate camera records entry.
- **E-M6.4 "Recommended for you" / "Finding the best zone…" / "check today's recommendation"** (`ParkingRecommendation.tsx:130,171`, `CurrentParkingState.tsx:141`).
  - The pick is global: the lowest occupied/capacity ratio (`services/api/src/domain/zones.ts:106-120`, *verified*).
  - It is not personal and not daily.
- **E-M6.5 "Suggestion only - does not reserve a spot"** (`ParkingRecommendation.tsx:134`) sits on the same card as the primary button "Reserve Recommended Zone" (`:243`).
- **E-M6.6 Copy pointing at controls on another tab.**
  - "Switch to Reserve above" is shown on Sessions (`ReservationList.tsx:52`), but the switch is on Park.
  - "See it under Current parking above" and "Cancel it from Current parking" are on Park (`ZoneAssignmentPanel.tsx:115,123`), but that section is on Home.
  - The Home subtitle promises zone availability, but Home shows no zone list.
  - The Sessions subtitle "Every gate entry and exit" sits over reservations too.
- **E-M6.7 Account about text.** "Camera gate signs in select zones accept your registered plates automatically" (`account.tsx:153-154`): unclear, and there is no gate hardware.
- **E-M6.8 Pluralisation.** "1 spaces available" (`ZoneAssignmentPanel.tsx:142`, `ReservationPanel.tsx:127`); "1 of 1 zones open" (`park.tsx:82`).
- **E-M6.9 Inconsistent labels.**
  - A violation under appeal is "Under review" on mobile but "Under appeal" in admin.
  - Paid is "Paid" on mobile but "Fine paid" in admin.
  - The guest fallback is "guest" in one place and "GUEST" elsewhere.
  - Low availability is "Low" on mobile but "Low availability" in admin.
- **E-M6.10 Dark patterns.** None found. Cancel paths exist, fees are shown, and "Signs out your other devices" is disclosed.

### Weight and friction
- **E-M9.1 Bundle size.** The Hermes bundle is 3.63 MB (Android) and 3.32 MB (iOS), uncompressed. The export is stale (dated Sep 21, before HEAD).
- **E-M9.2 Network.**
  - Home idle issues 5–7 queries on mount, plus an SSE stream.
  - Polling runs at 15 s + 30 s + 30 s, about 8 requests a minute.
  - Every return to the foreground refetches (`lib/query.ts:23-25`, `AppProviders.tsx:34-40`).
- **E-M9.3 Dark mode.**
  - `app.json:7` has `"userInterfaceStyle": "light"`, so the "System" appearance cannot follow OS dark mode. *Verified.*
  - Choosing Dark explicitly works.
- **E-M9.4 Idle loops.** 2–4 per screen (mesh, mascot float, live-dot pulse). All are gated on reduced motion, but the setting is read once with no change listener (`usePrefersReducedMotion.ts:9`).

### Accessibility
- **E-M-A1 Coverage.** Roles, labels and states are good: Button, IconButton, ChoiceChip, ZoneCard radio and appearance radios, and tests assert them.
- **E-M-A2 Gaps.**
  - No `accessibilityRole="header"` on titles or section headers.
  - No live regions, although the timer ticks and availability refreshes.
  - A button is nested inside a radio (`ZoneCard.tsx:59-87`).
  - SegmentedControl is 40pt tall (`SegmentedControl.tsx:66`).
  - Login links are inline text about 18pt tall (`login.tsx:113-136`).
  - Radios use `selected` rather than `checked`.

---

## B. Admin operations console (`apps/admin`)

### Structure
- **E-W-S1 Interactive counts.**
  - Shell: 12 controls by default, 24 fully expanded.
  - Dashboard: 4 + Z. Zones: 1 + 2Z (+8 with the form open). Cameras: 1 + 2C (+8). Violations: P. Login: 3.
- **E-W-S2 Collapsed navigation.** Parking Operations, Management, Analytics and System start collapsed (`AppShell.tsx:155-163`). Zones, Cameras and Violations are hidden and can't be tabbed to until their group is expanded, even while you are on that page.
- **E-W-S3 Repeated patterns.**
  - Logout appears twice at the same time (`AppShell.tsx:253`, `:378`).
  - Notifications have 2 routes: the nav item and the bell.
  - Admin identity is shown twice.
  - OccupancyBar is copied verbatim (`page.tsx:28-37`, `zones/page.tsx:17-26`).
  - Three near-duplicate figure components: StatCard, MetricCard, StatPanel.
  - Camera status appears twice on the dashboard (`page.tsx:233-239`, `:380-415`).
  - Each zone row and zone card shows occupancy 4 ways (text, count, bar, badge).
  - The logo plate markup has 3 copies.
  - The active nav item has 3 indicators (pill, dot, colour).
- **E-W-S4 Dead props.**
  - 0 unused locals in scope.
  - Props never passed: `NumberTicker.durationMs/className`, `DataTable.emptyTitle/emptyMessage` (and the DataTable empty branch is unreachable behind QueryBoundary), `ErrorState.title`, `LoadingState.label`.
- **E-W-S5 Removable elements.**
  - The "Live facility state" dot.
  - The header identity chip and the duplicate logout.
  - The duplicate "Gate cameras" card.
  - StatPanel icon badges and NumberTicker tweens.
  - Login's decorative brand column and the HttpOnly footnote.
  - Scene squares in empty states.
  - Arrows on the zone cards.

### Visual
- **E-W-V1 Spacing.** No spacing tokens; Tailwind defaults, including half-steps 2/6/10/14 (42 uses). Arbitrary sizes: 26, 34, 36, 40, 44, 72 and 168 px.
- **E-W-V2 Type.** No type tokens. The effective ramp is [10.5, 11, 11.5, 12, 14, 15, 16, 18, 20, 24, 28, 30, 48], including arbitrary `text-[10.5px]`, `[11px]`, `[11.5px]`, `[12px]`, `[15px]` and `[1.75rem]`.
- **E-W-V3 Colour.**
  - 20–21 unique values per theme.
  - `info` is aliased to `brand`.
  - The light theme block is duplicated (`globals.css:46-73` and `:79-101`).
  - Hard-coded values: `bg-white`, an unthemed select chevron (`globals.css:227`), and black shadows used in light mode.
- **E-W-V4 Contrast.**
  - muted is ≥4.99.
  - faint (placeholders) is 3.02–3.70, **fail**.
  - brand-dark on brand-soft (info pill, active nav, soft plate chip): **4.48** in dark and **4.44** in light, **fail**.
  - The focus ring against the card is **2.0:1** in dark and **1.33:1** in light, **fail** (3:1 needed).
  - Dashboard zone-row focus is about 1.1:1.
  - Light hover states: btn-primary **3.80** and btn-success **3.23**, **fail**.
- **E-W-V5 States.**
  - Loading, error and empty come through QueryBoundary. Disabled and focus-visible exist.
  - Success (SavedNote) exists only on zone detail and settings; it is missing on the dashboard, zones list, cameras and violations.
  - Button has no loading or aria-busy state.
  - The dashboard `isEmpty={!data}` never shows an empty state for a dataset that is present but empty.
- **E-W-V6 Shape rule.** About 15 elements break the cut-corner rule: alerts, the segmented control, nav links, icon buttons, tiles and slot rows. The cut is written as a literal `rounded-tr-[3px]` five times instead of the token.

### Copy and honesty
- **E-W6.1 "Live facility state" with a green pulsing dot is hard-coded** (`AppShell.tsx:353-357`, *verified*). The realtime status is ignored (`providers.tsx:11`).
- **E-W6.2 Camera "online" is an admin switch, not a health signal.**
  - Where: "Camera Status — gate cameras online", "Vision pipeline health", Wifi/WifiOff icons (`page.tsx:234-236, 383, 393-406`).
  - Behaviour: ONLINE/OFFLINE is a switch the admin sets (`services/api/src/domain/zoneConfig.ts:26`, *verified*).
  - There is no heartbeat, so a dead camera still shows as online.
- **E-W6.3 "Live Alerts" / "No active alerts."** (`page.tsx:251,261`) show the latest 8 anomalies plus the latest 8 notifications whether resolved or read (`services/api/src/routes/admin.ts:311-345`).
- **E-W6.4 "Real-time parking management overview"** (`page.tsx:185`): the dashboard polls every 30 s, SSE covers only some events, and notifications can be up to 30 s late.
- **E-W6.5 "{n} zones reporting"** counts every zone, including INACTIVE ones (`admin.ts:358`), and reads "1 zones reporting".
- **E-W6.6 Raw values shown to operators.**
  - `WRONG_ZONE` (`violations/page.tsx:43`); `ANOMALY_LABEL` exists but is not used (`page.tsx:270`).
  - `ev.source` (`page.tsx:367`) and `ENTRY/EXIT` (`cameras/page.tsx:331`).
  - "authoritative" and "backend-authoritative" in page copy (`page.tsx:294`, `zones/page.tsx:249`, `cameras/page.tsx:105`).
  - "Sessions are kept in an HttpOnly cookie…" (`login/page.tsx:115`).
- **E-W6.7 Naming mismatches.**
  - The nav label "Vehicles" goes to `/sessions` (`AppShell.tsx:71`); the dashboard calls the same route "Sessions" (`page.tsx:342`).
  - "Offline" means a deactivated zone and collides with camera offline (`Badge.tsx:45`).
  - "Bidirectional" is jargon.
  - Entry uses a DoorClosed icon and exit uses DoorOpen.
- **E-W6.8 Dark patterns.** None. Dismiss is one click with no confirm, while zone and camera disable use `window.confirm`: inconsistent, not deceptive.

### Weight and friction
- **E-W9.1 Bundle size.** Only a dev build exists (10.4 MB, eval-source-map). Production initial JS is **not measured**. Dependencies are lean: next, react, react-query, lucide-react.
- **E-W9.2 Network.** On mount: `me` + SSE + 1 aggregate dashboard query polling every 30 s. `refetchOnWindowFocus` is false.
- **E-W9.3 Dark mode.** Honoured: a no-flash script, `prefers-color-scheme` with a live listener, and a persisted choice (`theme-provider.tsx:15-72`).
- **E-W9.4 Idle loops.** 2: `parada-drift` and the header pulse. Both are gated by a global reduced-motion rule (`globals.css:335-343`).

### Accessibility
- **E-W-A1 Landmarks.** The shell has header, main, aside and nav. **No skip link.** **The login page has no landmarks.** When the drawer opens, a second nav is also labelled "Primary".
- **E-W-A2 Keyboard.**
  - Everything is reachable once groups are expanded.
  - The drawer has no focus trap, no Escape and no focus return.
  - Forms lose focus on open and close because the trigger unmounts (`zones:251`, `cameras:362`).
- **E-W-A3 Names.**
  - Row actions "Edit", "Disable" and "Dismiss" have no row context.
  - The zone card `aria-label` overrides its content.
  - Anomaly vs notification in the alert feed is shown by icon and colour only.

---

## Known gaps (both surfaces)
- No rendered screenshots, device runs or time-to-interactive measurements.
- The mobile bundle size comes from a stale export. The admin production bundle is unmeasured.
- Screens reached from the audited ones were not audited: notifications, zone detail, payments, vehicles, admin account.

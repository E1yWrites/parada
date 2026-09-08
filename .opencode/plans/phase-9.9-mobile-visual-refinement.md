# PARADA Mobile — Phase 9.9: Visual Refinement + Layout Safety

Status: PLAN (user approved implementation; blocked on edit permissions)
Branch baseline: `wip/phase8-9.6` @ `a6737ba` (working tree clean)

## Scope
Visual-only pass over `apps/mobile`. No feature changes, no backend/database work, no git changes.
Preserves: Phase 9.7 cache semantics (`upsertAssignment`, `upsertReservation`), GPS behavior, guest
sessions, 401-only auth invalidation, all existing `testID`s/accessibility contracts,
`maxFontSizeMultiplier` 1.3 cap.

## 1. Dependencies (`apps/mobile/package.json`)
- Add `@expo-google-fonts/nunito` (`^0.2.3`).
- Remove `@expo-google-fonts/inter` + `@expo-google-fonts/space-grotesk` (unused after swap).
- Keep `@expo-google-fonts/jetbrains-mono`. Then `npm install` (drives `postinstall` re-link).

## 2. Design system (`apps/mobile/src/theme/`)
- `colors.ts`: semantic rename + light flip.
  - `background #EEEBE3` (off-white), `surface #FFFFFF`, `surfaceElevated #F5F2EA`
  - `foreground #171E19` (charcoal), `muted #5F6F69` (gray-green, ~5.5:1 on white), `border rgba(183,198,194,0.35)`
  - `primary #CA0013` (was `orange`), `danger #A90E18` (was `burntOrange` for destructive), keep `danger` for errors
  - `success #2E7D5B`, `warning #B47A1F`, `info #5F6F69`, `highlight #B47A1F` (was `gold`)
  - `onAccent #FFFFFF` (white on red CTA)
- `typography.ts`: Nunito + JetBrains Mono.
  - Import `Nunito_400Regular, 500Medium, 600SemiBold, 700Bold, 800ExtraBold, 900Black`; keep
    `JetBrainsMono_400Regular / 500Medium / 700Bold`.
  - `fonts`: `heading: Nunito_900Black`, `headingMedium: Nunito_800ExtraBold`,
    `heading500: Nunito_700Bold`, `headingRegular: Nunito_600SemiBold`, `body: Nunito_400Regular`,
    `bodyMedium: Nunito_500Medium`, `bodySemi: Nunito_600SemiBold`, `bodyBold: Nunito_700Bold`,
    `mono/monoRegular/monoBold` unchanged.
  - `fontAssets`: all six Nunito weights + 3 JetBrains Mono weights (name = constant identifier).
  - `fontSizes`: `display 34`, `hero 32`, `title 19`, `section 20`, `body 15`, `caption 12`, `micro 10`, `monoValue 18`.
  - `lineHeights`: `display 40`, `hero 40`, `title 26`, `section 26`, `body 22`, `caption 16`, `micro 12`, `monoValue 24`.
- `radii.ts`: `sm 10, md 16, lg 24, xl 32, full 999`.
- `shadows.ts`: `ShadowPreset = "card" | "pill" | "none"`. `card`: `shadowColor #000`, offset `{0,8}`,
  opacity 0.08, radius 18, elevation 3. `pill`: offset `{0,12}`, opacity 0.12, radius 24, elevation 8.
  `none` unchanged. Drop `glowOrange`/`glowGold`.
- NEW `layout.ts` (exported via `index.ts`):
  - `FLOATING_TAB_BAR_HEIGHT = 64`, `FLOATING_TAB_BAR_MARGIN = 10`, `FLOATING_TAB_BAR_RADIUS = 32`,
    `FLOATING_TAB_BAR_SIDE = 16`, `tabClearance = 116` (bottom padding so content never hides behind pill).

## 3. Root shell
- `apps/mobile/app.json`: `userInterfaceStyle: "light"`.
- `apps/mobile/app/_layout.tsx`: `<StatusBar style="dark" />`; `contentStyle` uses new `colors.background`.

## 4. Floating pill tab bar (`app/(tabs)/_layout.tsx`)
- `useSafeAreaInsets()`; `tabBarStyle`: `position "absolute"`, `bottom: insets.bottom + FLOATING_TAB_BAR_MARGIN`,
  `left/right: FLOATING_TAB_BAR_SIDE`, `height: FLOATING_TAB_BAR_HEIGHT`, `borderRadius: FLOATING_TAB_BAR_RADIUS`,
  `backgroundColor "#171E19"`, no top border, `paddingTop: 8`, `...shadows.pill`.
- `tabBarActiveTintColor "#FFFFFF"`, `tabBarInactiveTintColor "rgba(183,198,194,0.9)"`.
- `tabBarLabelStyle`: `fontFamily: fonts.headingRegular (600)`, `fontSize: 11`, `fontWeight` via font.
- Icons: keep filled/outline toggle; wrap each in a container; focus-aware (active renders a small
  4px red dot under icon for playful accent; inactive no dot). Icon size 24.
- Keep `tabBarHideOnKeyboard: true`; keep tab titles + `tabBarAccessibilityLabel`s; `sceneStyle` off-white.

## 5. Shared components
- `Card.tsx`: radius `radii.lg`; border `colors.border`; soft `shadows.card`. Remove accent left-border;
  when `accent` provided render small 4×32 rounded capsule (top-left) with accent color.
- `Button.tsx`: radius `radii.md`; `primary` = `colors.primary` bg + `onAccent` text; `secondary` =
  white bg + `colors.border` + charcoal; `danger` = white bg + `colors.danger` border/text. minHeight 44;
  remove fixed `minWidth: 128`; text wraps (`textAlign: center`, flexShrink 1). Keep spinner + label layout.
- `Text.tsx`: use new `fonts`/`fontSizes` tiers. `plate` color → `colors.primary`. Keep `maxFontSizeMultiplier` 1.3.
- `Input.tsx`: radius `radii.md`, white bg, border `colors.border`, error border `colors.danger`, focus ring
  `colors.primary`. Error text wraps; keep `accessibilityRole="alert"`.
- `Screen.tsx`: padding unchanged; ScrollView `contentContainerStyle` gains `paddingBottom: layout.tabClearance`.
  RefreshControl `tintColor/colors` → `colors.primary`.
- `SectionHeader.tsx`: title uses `section` tier; text group `flex:1` + `minWidth:0`.
- `StatusBadge.tsx`: pill; color map → Available/Confirmed `success`, Low/Pending/Assigned `warning`,
  Full `danger`, Active/Assigned-session `primary`, Offline/Completed/Expired/Cancelled/Revoked `muted`.
- `Metric.tsx`: value mono, allow wrap/flexShrink.
- `CapacityBar.tsx`: track `surfaceElevated`, fill prop color, label `muted`.
- `StateComponents.tsx`: `LoadingState` spinner `colors.primary`; `ErrorState` icon in soft rounded
  container (56px, radius 20, `surfaceElevated`), text danger; `EmptyState` icon container + muted.
- `FullScreenLoading.tsx`: bg off-white, spinner primary.

## 6. Card / panel components
- `ZoneCard.tsx`: header title-group `flex:1 minWidth:0`; badge `flexShrink:0`; zone name
  `numberOfLines={2}`; metrics row `flexWrap: wrap` with gap; selected values → `primary`/`highlight` per
  existing accent roles; silent-fail text colors → `success`; isFull → `danger`.
- `ReservationCard.tsx`: structured layout: zone name (flex, wrap) + badge; plate row; times stack;
  confirm row wraps; cancel button full-width + right-aligned text. Keep `reservation-r1` testIDs.
- `SessionCard.tsx`: grouped layout — header Vehicle/Zone/Status, time group (Entry/Duration) with wrap,
  fee (`highlight`), GUEST plate for guested sessions. Keep session testIDs.
- `ActiveSessionBanner.tsx`: hero radius `radii.xl`; zone name hero tier wrap `numberOfLines={2}`;
  elapsed `display` (34) mono; badge + pulsing dot in header with gap + flexShrink. Reduced-motion preserved.
- `CurrentParkingState.tsx`: visually polish the three states (empty / reservation / assignment) as hero
  cards (radius `radii.xl`); keep testIDs + precedence + NavigateButton wiring.
- `ParkingRecommendation.tsx`: chips radius `md`, selected `primary` bg + `onAccent`; summary card title
  wrap; keep `assignment-*`/`recommendation-*` testIDs; button label wraps (long plate+zone).
- `ZoneAssignmentPanel.tsx`: same chip treatment + long-title wrap; keep `assignment-*` testIDs.
- `ReservationPanel.tsx`: same + time/date rows clean; keep `reservation-*` testIDs.
- `NavigateButton.tsx`: 44pt target preserved; primary red; denied/unavailable messages danger, wrap.

## 7. Screens
- `parking.tsx`: `const columns = width >= 520 ? 2 : 1;` via `useWindowDimensions` + FlatList `numColumns`
  (or manual layout); wide → 2 columns with gap, narrow → 1 column. Keeps zone testIDs.
- `vehicles.tsx`: FlatList `contentContainerStyle` bottom padding = `tabClearance`; VehicleCard row
  plate-group `flex:1 minWidth:0`, meta shrink; Add form chips wrap; errors wrap; buttons full width.
- `sessions.tsx`: same list padding; SessionCard groups wrap.
- `account.tsx`: profile row (avatar 44 circle primary bg, name flex wrap, email wrap, RolePill shrink);
  InfoRow value shrink; degraded retry button keeps 44pt target; danger sign-out.
- `login.tsx` / `register.tsx`: keyboard-safe; brand car icon `colors.primary`; error `alert` wraps;
  primary button full width. Logic untouched.

## 8. Tests — NEW `apps/mobile/__tests__/layoutSafety.test.tsx`
- ZoneCard with very long zone name: full name text present, `numberOfLines` == 2 on name.
- Button with long title (e.g. "Reserve ABC-1234-XG in Riverside Commercial Market South Wing Reserved
  Zone Alpha"): full text present, role `button`, flattened minHeight >= 44.
- ReservationCard with long zone + long plate + long dates: all content present.
- SessionCard with long zone: text present, GUEST path intact.
- Input long error: full text, `accessibilityRole` alert.
- Tab bar renders 4 tabs with labels + accessibility labels.
- Existing 19 test files must remain green.

## 9. Verification (sequential; do not claim success on skip/fail)
1. `npm test -w @parada/mobile -- --runInBand --forceExit`
2. `npm run typecheck -w @parada/mobile`
3. `npm run lint -w @parada/mobile`
4. `npm run build -w @parada/mobile`
5. `npm run typecheck` / `npm run lint` / `npm test` at root

## 10. Deliverable
Final report using the exact `PHASE 9.9 COMPLETE — MOBILE UI VISUAL REFINEMENT` structure. Physical-device
verification reported honestly as NOT performed. Then HARD STOP — no commits/pushes, no backend/admin work.

## Notes
- `app/admin` unaffected (verified: no `expo-google-fonts` imports there).
- Only `shadows.ts` referenced the removed glow presets; only `Card` uses `shadows.card`.
- No `#000000` UI surfaces; shadows use low-opacity black (allowed).
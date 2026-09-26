# /make-plan handoff — REDESIGN

````
/make-plan Redesign the PARADA driver app (apps/mobile: Home, Park, Sessions, Account tabs + login) and admin operations console (apps/admin: shell, Dashboard, Zones, Cameras, Violations, login). Current design failed a Dieter Rams audit at 10/30 (mobile) and 11/30 (admin), with critical gaps in principles #4 understandable (1/3 both), #6 honest (1/3 both), #2 useful (admin 1/3) and #10 as little design as possible (0/3 both).

Verdict paragraph:
> Mobile scored 10/30 and admin 11/30. Both are below 20, so the rule gives REDESIGN. The redesign target is information architecture and honesty, not the brand. Both apps have solid tokens, state components and domain-correct API flows, but the screens say more than the system does and repeat themselves.

Why redesign and not refine: both totals are under 20. The failures sit on load-bearing principles #4 and #6, and they are structural: mobile scatters each concept across tabs with copy pointing to controls on other tabs, and admin claims "live" and "health" states the system does not measure.

Project rules that override design wishes (from CLAUDE.md):
- Zone-based parking. Recommendation ≠ Assignment ≠ Reservation ≠ Session.
- A session starts only when a gate camera records entry.
- GPS is for navigation only.
- The backend is authoritative. Mobile and admin never access the database.
- Never fake OCR, confidence, hardware state or accuracy.
- Preserve HttpOnly admin auth and mobile SecureStore.
- Work only on the requested scope. Add regression tests for every behaviour change. No commits without approval.

Preserve from the current design:
- Mobile tokens: apps/mobile/src/theme/colors.ts:74-133 (warm-sunset dark and light palettes), spacing.ts:7-29 (4pt scale, 44pt touch target), typography.ts:62-90 (Space Grotesk / Inter / JetBrains Mono ramp), radii.ts (after the cut rule is settled).
- Admin tokens: apps/admin/app/globals.css:16-101 (graphite and warm-paper themes, orange as the single accent) and the theme provider with its no-flash script (components/providers/theme-provider.tsx).
- State primitives: mobile StateComponents.tsx (Loading/Error/Empty), FormAlert.tsx, Button loading/disabled; admin QueryBoundary.tsx and State.tsx.
- Accessibility already in place: mobile roles, labels and states on Button, IconButton, ChoiceChip, ZoneCard and the appearance radios (asserted in apps/mobile/__tests__); admin focus-visible classes, DataTable caption and th scope, and aria-expanded on nav groups.
- Domain-correct data flows: backend-confirmed mutations written to the query cache (ParkingRecommendation.tsx, ZoneAssignmentPanel.tsx, ReservationPanel.tsx), SSE invalidation (mobile src/lib/realtime.ts, admin lib/realtime.ts), and reduced-motion gating.
- Brand: the PARADA logo, the mascot (limited to onboarding and empty/error states) and the top-right "cut" shape.

Discard:
- Scattering one concept across tabs. Reservations appear in CurrentParkingState.tsx:360-403, ParkingRecommendation.tsx:139-169 and ReservationCard.tsx:47-105 (Sessions). Copy points to other tabs: ReservationList.tsx:52, ZoneAssignmentPanel.tsx:115,123. Caused failures on #2 and #4.
- Unconditional "Live" and "health" claims: hard-coded green dot at apps/admin/components/AppShell.tsx:353-357; camera "online / Vision pipeline health" at apps/admin/app/(app)/page.tsx:234-236,383,393-406 (really an admin on/off switch, services/api/src/domain/zoneConfig.ts:26); "Live zone availability" at apps/mobile/app/(tabs)/parking.tsx:110 and park.tsx:74 while the connection status is discarded (AppProviders.tsx:9, admin providers.tsx:11). Caused failure on #6.
- Action labels that promise a different domain effect: "Park now" creates an Assignment (park.tsx:139 → ZoneAssignmentPanel.tsx:65, success copy "You're all set" at :107); "Reserve for later" always starts now (ReservationPanel.tsx:37). Caused failures on #4 and #6.
- Ambient decoration on every routine screen: GradientMesh (Screen.tsx:99,134), GlassCard double wash plus blur (GlassCard.tsx:40-49), a mascot callout on every tab, admin parada-drift (globals.css:147-172). Caused failures on #5, #7 and #10.
- Duplicated affordances: admin logout ×2 (AppShell.tsx:253,378), camera status ×2 (page.tsx:233-239 and :380-415), occupancy shown 4 ways per zone row (page.tsx:315-326), 3 figure components (StatCard, MetricCard, StatPanel), a copied OccupancyBar (page.tsx:28-37, zones/page.tsx:17-26); mobile Stamp plus Badge stating the same status (CurrentParkingState.tsx:297-298). Caused failure on #10.

Top moves from the audit:
1. #6 Honest (both):
   - Bind every "Live" indicator to the real realtime connection status (mobile AppProviders.tsx:9, admin providers.tsx:11). Show "Reconnecting…" or "Updated hh:mm" when disconnected.
   - Rename camera ONLINE/OFFLINE to Enabled/Disabled and remove the "online" and "pipeline health" framing (page.tsx:234-236,383) until a heartbeat exists.
   - Filter Live Alerts to unresolved items, or rename it "Recent alerts" (services/api/src/routes/admin.ts:311-345).
2. #4 Understandable + #6 Honest (mobile). Make every action label match its domain effect:
   - "Park now" (park.tsx:139): say it holds a zone and that parking starts at the gate.
   - "Reserve for later" (ReservationPanel.tsx:37): add a start time, or say "Reserve now (15-minute hold)".
   - "Recommended for you" (services/api/src/domain/zones.ts:106-120 picks the least-occupied zone): call it "Least busy zone".
   - Remove every cross-tab pointer (ReservationList.tsx:52, ZoneAssignmentPanel.tsx:115,123).
3. #2 Useful + #4 Understandable (information architecture):
   - Mobile: Home shows what is happening now (session, assignment or reservation, with its actions). Park chooses a zone and holds or reserves it. Sessions is history only. Share one vehicle selection (parking.tsx:108 and park.tsx:71 each create a provider).
   - Admin: keep Zones, Cameras and Violations always visible (AppShell.tsx:155-163 collapses them). Use one name for /sessions (nav "Vehicles" at AppShell.tsx:71 vs "Sessions" at page.tsx:342). Show human labels instead of raw enums (violations/page.tsx:43, page.tsx:270,367, cameras/page.tsx:331).
4. #10 As little design + #5 Unobtrusive:
   - Mobile: remove the mesh and glass washes from routine screens. Keep the mascot for onboarding and empty/error states only. Remove the duplicate stamp/badge pairs, the ZoneCard "Selected for…" row (ZoneCard.tsx:118) and the static Account rows (account.tsx:143-155).
   - Admin: one logout, one identity chip, no duplicate camera card, occupancy once per row (count and bar), one figure component.
5. #3 Aesthetic + #8 Thorough:
   - Tokens: add admin type and spacing tokens and remove the text-[10.5px], [11px], [11.5px], [12px], [15px] and [1.75rem] literals. Remove the mobile off-scale arithmetic values (3/5/6/10 spacing; 12/14/16 font sizes). Settle the cut rule (radii.ts:10 vs :22 contradict each other) and apply it everywhere. Replace the stale navy/gold values in glass.ts:30-38.
   - Contrast: mobile ghost-button text uses primary at 1.68–4.17:1 (switch to primaryDeep); soft-tint pills (danger 3.82, info 3.73, admin brand-dark 4.44–4.48) must reach ≥4.5:1; admin focus ring (2.0 dark, 1.33 light) must reach ≥3:1; placeholders must reach ≥4.5:1; admin light hover states (3.80 and 3.23) must pass.
   - Admin: add a skip link, landmarks on login and success feedback on every mutation.
   - Mobile: add accessibilityRole="header", live regions for the timer and availability, SegmentedControl at 44pt (SegmentedControl.tsx:66), and app.json userInterfaceStyle "automatic" (currently "light" at app.json:7, which blocks the System dark mode).

Redesign principles in priority order:
1. #6 Honest — every status, badge and label maps 1:1 to measured backend state; nothing says "live" or "online" unless the system knows it.
2. #4 Understandable — a first-time driver can name what every primary button will do in domain terms (hold, reserve, navigate, cancel), and an operator can find every operational page without expanding the navigation.
3. #10 As little design as possible — one place per concept, one representation per figure, and decoration only where it carries meaning.

Deliverables for the plan:
- New information architecture for both apps (not derived from the old one): a mobile tab map with one home per concept, and an admin navigation list with the pages that are always visible.
- New primary flows, low-fidelity and labelled, compared side by side with the current ones: driver find zone → hold or reserve → navigate → gate entry → session; operator detect a problem → act → confirm.
- A copy table: every user-facing string on the audited screens, old and new, each tied to the backend behaviour it describes.
- States checklist per screen: empty, loading, error, success, focus, disabled.
- Token changes consolidated in one place: admin type and spacing tokens, mobile off-scale removals, the cut-rule decision, and contrast fixes with the new ratios.
- Migration path: the order of changes that keeps existing mobile and admin tests green, and which tests to add. Tests currently pin strings such as "Park now", "Suggestion only - does not reserve a spot" and testIDs.
- Cutover criteria: when the old screens and components (for example the three reservation displays, StatCard/MetricCard/StatPanel and the duplicate OccupancyBar) are deleted.

Anti-patterns to guard against:
- Porting the old tab structure under new styling.
- Keeping old and new screens behind a flag indefinitely.
- Following a trend (glass, blobs, mascots everywhere) instead of the principles above.
- Treating the Preserve list as optional. The tokens, state primitives, accessibility props and domain-correct mutation/cache flows must survive.
- Inventing backend capability, such as a camera heartbeat, in the UI. If the design needs it, list it as a separate backend task. Do not fake it.
````

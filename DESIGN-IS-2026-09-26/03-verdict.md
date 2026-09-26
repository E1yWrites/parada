# Verdict: REDESIGN (both surfaces)

**Mobile scored 10/30 and admin 11/30. Both are below 20, so the rule gives REDESIGN. The redesign target is information architecture and honesty, not the brand. Both apps have solid tokens, state components and domain-correct API flows, but the screens say more than the system does and repeat themselves.**

## Why REDESIGN and not REFINE
- Both totals are under the 20-point threshold.
- The weak scores are concentrated on #4 understandable and #6 honest, which are load-bearing.
- The mobile tab structure scatters one concept across tabs: reservations show on Home, Park and Sessions, and the copy points to controls on other tabs. That is structural, so a refine pass would keep patching it.
- The admin "health" and "live" claims describe things the system does not measure. That needs a decision about what the console can honestly show, not a restyle.
- Not driven by the size of the codebase or by one ugly screen.
- Mobile #9 scored 0, which also blocks REFINE, but #9 is not load-bearing and is not why the verdict is REDESIGN.

## Highest-leverage moves

1. **#6 Honest (both).**
   - Bind every "Live" indicator to the real realtime connection status. Mobile drops it at `AppProviders.tsx:9`, admin at `providers.tsx:11`. Show "Reconnecting…" or "Updated hh:mm" when disconnected.
   - Rename camera ONLINE/OFFLINE to Enabled/Disabled and remove the "online" and "pipeline health" framing (`page.tsx:234-236, 383`) until a heartbeat exists.
   - Filter Live Alerts to unresolved items, or rename it "Recent alerts" (`admin.ts:311-345`).
   - Evidence: E-M6.1, E-W6.1–E-W6.4.
2. **#4 Understandable + #6 Honest (mobile).**
   - Make every action label match its domain effect:
     - "Park now": reword it to say it holds a zone, and that parking starts at the gate (`park.tsx:139`, `ZoneAssignmentPanel.tsx:107`).
     - "Reserve for later": either add a start time or say "Reserve now (15-minute hold)" (`ReservationPanel.tsx:37`).
     - "Recommended for you": call it "Least busy zone" (`zones.ts:106-120`).
   - Remove every cross-tab pointer (`ReservationList.tsx:52`, `ZoneAssignmentPanel.tsx:115,123`).
   - Evidence: E-M6.2–E-M6.6.
3. **#2 Useful + #4 Understandable (both IA).**
   - Mobile: one place per concept. Home is "what's happening now" (session, assignment or reservation, with its actions). Park is "choose a zone and hold or reserve it". Sessions is history only. Share one vehicle selection across tabs (`parking.tsx:108`, `park.tsx:71`).
   - Admin: keep Zones, Cameras and Violations visible, not collapsed (`AppShell.tsx:155-163`). Use one name for `/sessions`. Show human labels instead of enums (`violations/page.tsx:43`, `page.tsx:270,367`).
4. **#10 As little design + #5 Unobtrusive (both).**
   - Mobile: remove the ambient mesh and glass washes from routine screens. Keep the mascot for onboarding and empty or error states only. Drop the duplicate stamp/badge pairs, the "Selected for…" row and the static Account rows.
   - Admin: one logout and one identity chip. Remove the duplicate camera card. Show occupancy once per row (count plus bar). Merge StatCard, MetricCard and StatPanel into one component.
   - Evidence: E-M-S5, E-W-S3, E-W-S5.
5. **#3 Aesthetic + #8 Thorough (both).**
   - Admin: add type and spacing tokens; remove the `text-[…]` literals.
   - Mobile: remove the off-scale arithmetic values. Settle the cut-corner rule (radii.ts contradicts itself), then apply it everywhere. Fix `glass.ts`.
   - Contrast:
     - Ghost-button text: use primaryDeep.
     - Soft-tint pills: ≥4.5:1.
     - Focus ring: ≥3:1.
     - Placeholders: ≥4.5:1.
   - Admin: add a skip link and landmarks on login, and success feedback on every mutation.
   - Mobile: add header roles and live regions, a 44pt segmented control, and `userInterfaceStyle: "automatic"`.
   - Evidence: E-M-V4, E-W-V4, E-W-V5, E-M-A2, E-W-A1, E-M9.3.

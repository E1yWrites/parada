# Scorecard

Each principle is scored 0–3 against the anchors in the audit method. When I was unsure between two scores, I took the lower one. Where a principle has several instances, I scored the worst one. Mobile and admin are scored separately.

## A. Mobile driver app — 10 / 30

1. **Good design is innovative — 1/3**
   - Evidence: a standard four-tab parking app with a gate-pass metaphor, a mascot and cut corners (E-M-S5, E-M-V6).
   - Justification: the visual identity is distinctive, but the flow is the familiar find-zone/reserve pattern with minor variation. No pattern improves on peer apps.
2. **Good design makes a product useful — 2/3**
   - Evidence: Park reaches Assign in about 2 taps (E-M-S1). But there are 5 heading levels before the action, the vehicle choice is not shared between tabs, and reservations show on 2 tabs (E-M-S3, E-M-S5).
   - Justification: the primary task completes, but the surrounding screens add steps and cross-tab searching. It is not an outright detour.
3. **Good design is aesthetic — 1/3**
   - Evidence: off-scale spacing (3, 5, 6, 10) and type (12, 14, 16) (E-M-V1, E-M-V2); about 15 breaks of the cut rule, which also contradicts itself (E-M-V6); stale glass tokens (E-M-V3).
   - Justification: a system is visible, but there are far more than 2 inconsistencies.
4. **Good design makes a product understandable — 1/3**
   - Evidence: "Park now" makes an assignment (E-M6.3); "Reserve for later" reserves now (E-M6.2); "Suggestion only" sits beside "Reserve" (E-M6.5); copy points to controls on other tabs (E-M6.6).
   - Justification: three or more primary controls are unclear, but the main action can still be found.
5. **Good design is unobtrusive — 1/3**
   - Evidence: an animated mesh on every screen, double-wash glass cards, the mascot 5+ times, the same status stated twice (E-M-S5, E-M-S3, E-M9.4).
   - Justification: decoration competes with the parking data on every tab. It is not merely quiet chrome.
6. **Good design is honest — 1/3**
   - Evidence: "Live" is shown even when the realtime connection is down (E-M6.1); "Reserve for later" (E-M6.2); "You're all set" implies parking (E-M6.3); "Recommended for you" and "today's" are neither personal nor daily (E-M6.4). No dark pattern (E-M6.10).
   - Justification: two or more inflations, but no deceptive flow as the anchor defines it (forced continuity, hidden cost, fake scarcity).
7. **Good design is long-lasting — 1/3**
   - Evidence: blurred glass cards (`GlassCard.tsx:40-49`), ambient animated gradient blobs (`GradientMesh.tsx`), Duolingo-style mascot callouts (`MascotCallout.tsx:22`).
   - Justification: two or three recognisable trend markers.
8. **Good design is thorough down to the last detail — 2/3**
   - Evidence: loading, error, empty, disabled and success are all present (E-M-V5). Focus is shown only on inputs, there are no header roles or live regions (E-M-A2), and light disabled text is 2.16:1 (E-M-V4).
   - Justification: one state (focus) is missing and a few details are rough. Not two or three missing states.
9. **Good design is environmentally friendly — 0/3**
   - Evidence: the system dark mode is blocked by `app.json:7` (E-M9.3); the bundle is about 3.3–3.6 MB (E-M9.1); about 8 polling requests a minute when idle (E-M9.2).
   - Justification: the anchor's 0 includes "dark mode ignored", and the System setting cannot follow the OS.
10. **Good design is as little design as possible — 0/3**
    - Evidence: more than 10 removable elements (mesh, washes, 5+ mascots, duplicate stamps, the selected row, 5 stacked headings, static Account rows) and duplicated affordances (E-M-S5, E-M-S3).
    - Justification: the count is well past the 3–5 band. Duplication is the dominant pattern, so the lower score applies.

**Mobile total: 1+2+1+1+1+1+1+2+0+0 = 10/30**

## B. Admin operations console — 11 / 30

1. **Good design is innovative — 1/3**
   - Evidence: a conventional sidebar console. The asymmetric hero stat is the only departure (`page.tsx:195-241`).
   - Justification: a small variation on a standard admin template.
2. **Good design makes a product useful — 1/3**
   - Evidence: Zones, Cameras and Violations are hidden in nav groups that start collapsed (E-W-S2). Camera health, the operator's core monitoring job, is not actually measured (E-W6.2). Live Alerts is not filtered to active items (E-W6.3).
   - Justification: the primary monitoring and action tasks need unnecessary detours, and one of them is not truly supported.
3. **Good design is aesthetic — 1/3**
   - Evidence: no type or spacing tokens and 13 distinct text sizes (E-W-V1, E-W-V2); about 15 breaks of the cut rule and literal cut values (E-W-V6); the light theme is duplicated and there are hard-coded colours (E-W-V3).
   - Justification: the colour system holds, but there are far more than 2 inconsistencies.
4. **Good design makes a product understandable — 1/3**
   - Evidence: "Vehicles" and "Sessions" name the same route; raw enums (WRONG_ZONE, ENTRY, source); "Bidirectional"; "Offline" means two different things; "authoritative" jargon (E-W6.6, E-W6.7).
   - Justification: three or more labels are unclear and jargon is present.
5. **Good design is unobtrusive — 2/3**
   - Evidence: a graphite background with orange kept for the one accent. There is a drift animation and a pulse (E-W9.4), and identity and logout are duplicated (E-W-S3).
   - Justification: the chrome is visible and somewhat redundant but quiet. Content stays the focus.
6. **Good design is honest — 1/3**
   - Evidence: "Live facility state" is hard-coded green (E-W6.1); camera "online / pipeline health" is an admin switch (E-W6.2); "Live Alerts" is unfiltered (E-W6.3); "Real-time" (E-W6.4); "zones reporting" (E-W6.5).
   - Justification: several inflations. The camera one is operationally misleading, but none matches the anchor's deceptive-flow categories.
7. **Good design is long-lasting — 2/3**
   - Evidence: a restrained graphite console in neutral type. One dated marker: the ambient drifting radial wash (`globals.css:147-172`).
   - Justification: one trend marker.
8. **Good design is thorough down to the last detail — 1/3**
   - Evidence: success feedback is missing on 4 of 5 screens; the focus ring is 2.0 and 1.33:1 and zone-row focus is invisible; buttons have no loading state; the dashboard empty-state logic never shows (E-W-V5, E-W-V4).
   - Justification: success is missing and focus is effectively broken, so two states fall short.
9. **Good design is environmentally friendly — 1/3**
   - Evidence: dark mode is honoured and motion is gated (E-W9.3, E-W9.4). The production initial JS is unmeasured; only a 10.4 MB dev build exists (E-W9.1).
   - Justification: without a measured size under 500 KB, the 2 cannot be confirmed. Tie-breaker to the lower score. Re-measure with `next build`.
10. **Good design is as little design as possible — 0/3**
    - Evidence: duplicated affordances (2 logouts, 2 notification routes, 2 identity chips, camera status twice, occupancy 4 ways per row, 3 figure components) plus decorative extras (E-W-S3, E-W-S5).
    - Justification: duplication dominates the dashboard and zone surfaces, well past 5 removable items.

**Admin total: 1+1+1+1+2+1+2+1+1+0 = 11/30**

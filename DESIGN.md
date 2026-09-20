---
name: PARADA
description: Two purpose-built surfaces, one ecosystem — a warm-navy driver app led by its own gate-attendant mascot, and a graphite operations console led by the logo's own orange cut.
colors:
  mobile-ink-navy: "#0E1220"
  mobile-panel-navy: "#161B2E"
  mobile-raised-navy: "#1F2640"
  mobile-foreground: "#F1F3FA"
  mobile-muted: "#A9AFC6"
  mobile-badge-gold: "#F2A93B"
  mobile-badge-gold-deep: "#D98C1E"
  mobile-azure-active: "#5B93F7"
  mobile-barrier-red: "#F0524A"
  mobile-signal-green: "#3DDC84"
  mobile-amber-warning: "#FF9F3F"
  mobile-light-paper: "#F3F5FC"
  mobile-light-ink: "#10142A"
  admin-graphite-paper: "#121316"
  admin-graphite-card: "#1B1D22"
  admin-charcoal: "#F5F4F2"
  admin-muted: "#90949E"
  admin-brand-orange: "#F7931A"
  admin-brand-orange-deep: "#EA580C"
  admin-signal-green: "#3DDC84"
  admin-warning-yellow: "#FFD600"
  admin-danger-red: "#F0524A"
  admin-light-paper: "#F5F2EC"
  admin-light-brand-deep: "#C2410C"
typography:
  display:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: "44px"
    letterSpacing: "-0.8px"
  hero:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: "36px"
    letterSpacing: "-0.6px"
  title:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "26px"
    letterSpacing: "-0.3px"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "22px"
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
  micro:
    fontFamily: "Inter, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: "14px"
    letterSpacing: "0.8px"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
rounded:
  mobile-sm: "10px"
  mobile-md: "14px"
  mobile-lg: "20px"
  mobile-xl: "28px"
  mobile-cut: "3px"
  mobile-full: "999px"
  admin-panel: "1.25rem"
  admin-panel-cut: "0.1875rem"
  admin-control: "0.75rem"
  admin-control-cut: "0.125rem"
  admin-chip: "0.5rem"
spacing:
  xs: "2px"
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  xl2: "20px"
  xl3: "24px"
  xl4: "32px"
  xl5: "40px"
components:
  mobile-button-primary:
    backgroundColor: "{colors.mobile-badge-gold}"
    textColor: "#15111C"
    typography: "{typography.body}"
    rounded: "{rounded.mobile-md}"
    padding: "12px 20px"
    height: "48px"
  mobile-button-primary-pressed:
    backgroundColor: "{colors.mobile-badge-gold-deep}"
    textColor: "#15111C"
  mobile-card:
    backgroundColor: "{colors.mobile-panel-navy}"
    textColor: "{colors.mobile-foreground}"
    rounded: "{rounded.mobile-lg}"
    padding: "16px"
  mobile-zone-tile-selected:
    backgroundColor: "{colors.mobile-badge-gold}"
    textColor: "{colors.mobile-foreground}"
    rounded: "{rounded.mobile-lg}"
  mobile-plate-chip:
    backgroundColor: "{colors.mobile-foreground}"
    textColor: "{colors.mobile-ink-navy}"
    typography: "{typography.mono}"
    rounded: "{rounded.mobile-sm}"
    padding: "5px 10px"
  admin-button-primary:
    backgroundColor: "{colors.admin-brand-orange}"
    textColor: "#0F0A05"
    typography: "{typography.body}"
    rounded: "{rounded.admin-control}"
    padding: "12px 20px"
    height: "44px"
  admin-button-primary-hover:
    backgroundColor: "{colors.admin-brand-orange-deep}"
    textColor: "#0F0A05"
  admin-card:
    backgroundColor: "{colors.admin-graphite-card}"
    textColor: "{colors.admin-charcoal}"
    rounded: "{rounded.admin-panel}"
    padding: "20px"
  admin-stat-panel-hero:
    backgroundColor: "{colors.admin-graphite-card}"
    textColor: "{colors.admin-charcoal}"
    rounded: "{rounded.admin-panel}"
    padding: "24px"
---

# Design System: PARADA

## Overview

**Creative North Star: "One Ecosystem, Two Purpose-Built Rooms"**

PARADA is a zone-based campus parking system with two surfaces that deliberately do not share a palette: a driver app (Expo/React Native) built around its own canonical mascot — a gate-attendant dog in a navy uniform with a gold badge — and an operations console (Next.js) built around the PARADA wordmark's own black-ink-and-orange-cut geometry. The driver app is **"The Attendant"**: a warm, deep-navy world lit by badge-gold, azure and barrier-red, because a driver meets PARADA through its mascot, outdoors, one-handed, wanting reassurance. The admin is **"The Control Room"**: a true-neutral graphite world lit by a single restrained orange accent, because an operator meets PARADA through the logo, at a desk, for hours, wanting instant status legibility over personality. Both refuse the category defaults (map-with-pins-plus-slot-grid on mobile; wall-of-identical-stat-cards on admin) and both refuse a shared color story — consistency comes from typography, the cut-corner geometry, interaction quality and domain language, not from hex codes.

The driver surface leads with a horizontal, swipeable zone rail (never a generic wrapping grid) and a mascot that appears at empty/first-time/confirmation moments only — never behind content, never competing with the selector. The admin surface is a registry: every editable record is a bounded graphite panel with a header rule and hairline seams, status communicated by icon+label+tint rather than a color-only accent bar.

**Key Characteristics:**
- Mobile: deep navy grounds (`#0E1220`), badge-gold (`#F2A93B`) as the one brand accent, azure (`#5B93F7`) for "active/yours right now", barrier-red for danger/full, signal-green for available.
- Admin: true-neutral graphite grounds (`#121316`, zero hue tint — deliberately cooler than mobile's navy), PARADA orange (`#F7931A`, the logo's own hue) as the one brand accent.
- Shared typography across both surfaces: Space Grotesk (display/heading), Inter (body/UI), JetBrains Mono (plates, zone codes, timestamps, ids — never labels or prose).
- Shared geometry: the "PARADA cut" — three soft corners, one sharp corner (top-right) on every card/panel/button/input on both surfaces, echoing the logo's own diagonal cut. Chips, pills, tab bars and avatars stay full-round.
- The canonical mascot (a real, fixed image asset — never redrawn, recolored, or distorted) is mobile-only, used selectively at empty/error/onboarding/greeting moments.
- Both themes (System/Light/Dark) are independently tuned per surface; light is never a literal inversion of dark.

## Colors

Two palettes, one grammar: a near-neutral or near-navy dark ground, one restrained brand accent, and status hues that read by icon+label first, color second.

### Mobile — "The Attendant"

- **Badge Gold** (`mobile-badge-gold`, #F2A93B): the mascot's own badge color. The one filled action per screen, the selected zone-rail tile, the caret/selection color. `mobile-badge-gold-deep` (#D98C1E dark / #8A5A00 light) is the pressed state and the only text-safe variant — raw badge-gold fails AA as text on either surface.
- **Azure Active** (`mobile-azure-active`, #5B93F7 dark / #1D4ED8 light): "active/assigned/yours right now" — the mascot's own P-sign blue. Reserved for state, never used as a second brand accent.
- **Barrier Red** (`mobile-barrier-red`, #F0524A dark / #B3261E light): danger, full, offline — the mascot's barrier-stripe red.
- **Signal Green** (`mobile-signal-green`, #3DDC84 dark / #146C43 light): available, confirmed, success.
- **Amber Warning** (`mobile-amber-warning`, #FF9F3F dark / #8A4B00 light): low-availability/pending — deliberately more orange than badge-gold so a warning never reads as "tap here."
- **Ink Navy** (`mobile-ink-navy` / `mobile-light-paper`): app ground. Dark is warm-leaning navy (R<G<B but never OLED-black); light is a cool blue-white paper, not an inversion.
- **Panel / Raised Navy**: card and nested-surface steps, one lightness step apart, dark register only (light uses `#FFFFFF` / a light tint instead of a parallel navy ramp).

### Admin — "The Control Room"

- **Brand Orange** (`admin-brand-orange`, #F7931A dark / same hue, `admin-light-brand-deep` #C2410C for light-mode text): the logo's own color, not the mascot's. The one filled action per screen or form; everywhere else is outlined, ghost or a tinted pill (**The One Filled Button Rule**, unchanged from the incumbent system).
- **Graphite Paper** (`admin-graphite-paper`, #121316): true-neutral dark ground — zero hue tint, deliberately cooler than mobile's navy so status color reads against a hue-neutral field instead of competing with a tinted one. Light register (`admin-light-paper`, #F5F2EC) stays warm paper, kept asymmetric to dark's cool neutral rather than inverted.
- **Success / Warning / Danger**: green #3DDC84, yellow #FFD600, red #F0524A (dark); deepened per-theme equivalents in light, each independently verified ≥4.5:1 as text.
- **Data hues** (`data-1..4`): ordered chart/series colors, orange/green/blue/yellow — never reused for status pills.

### Named Rules
**The Two-Palette Rule.** Mobile and admin never share a literal hex for their primary brand accent. Mobile's badge-gold comes from the mascot; admin's orange comes from the logo. Both may share status semantics (green=available, red=danger) without being required to.

**The Stamp Rule** (both surfaces). A status is never color alone: every pill, badge and alert row carries an icon or dot plus a label. A bare color bar (e.g. a `border-l-4` accent strip with nothing else) is a defect, not a shortcut.

## Typography

**Display Font:** Space Grotesk (with system sans-serif fallback)
**Body Font:** Inter (with system sans-serif fallback)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, monospace)

**Character:** A geometric, slightly technical display face (echoing the logo's angular cut) paired with a humanist, highly legible body face; JetBrains Mono strictly for anything that is literally data — plates, zone codes, camera ids, timestamps — never for labels or prose. Shared verbatim across both surfaces; only the size scale and color pairing differ.

### Hierarchy
- **Display** (700, 40px, 44px, -0.8px, tabular): mobile hero numbers only (elapsed clock, free-space count). Admin's equivalent is the dashboard hero stat figure (900-weight via Tailwind's font-black, 48px/`text-5xl`, tabular, now animated with an odometer-style settle via `NumberTicker`).
- **Hero** (600, 30px, 36px, -0.6px): mobile screen titles. Admin page titles run 900 at 24-28px, -0.02em tracking.
- **Title** (600, 20px, 26px, -0.3px): mobile card titles (zone name, vehicle, session).
- **Body** (400, 15px, 22px): mobile running text and button labels. Admin body is 14px (`text-sm`).
- **Caption** (500, 13px, 18px): descriptions, timestamps, hints. Admin equivalent is 12px muted.
- **Micro** (700, 11px, 14px, +0.8px, uppercase): field labels, data-value labels, table column headers.
- **Mono** (500, 13px, 18px, tabular): zone codes, camera ids, occupancy figures, timestamps in tables.

### Named Rules
**The Mono-Is-Data Rule.** JetBrains Mono appears only on identifiers and machine values. Never on labels, headings, or prose.

**The Tabular Figures Rule.** Every number that can change sets in tabular numerals. Admin's dashboard hero figures additionally settle into place via a short digit tween (`NumberTicker`, ~650ms, eased, skipped under Reduce Motion) rather than instantly jumping — adapted from Calamansi UI's odometer number-ticker concept, reimplemented dependency-free.

## Layout

**Mobile** is a single column on a 4pt grid (2/4/8/12/16/20/24/32/40, `spacing.*`). Screen padding 16-20px; every tappable control ≥44pt. The Park screen's zone selector is a horizontal, swipeable, snap-scrolling rail of compact zone tiles (208pt wide) — never a wrapping grid of full-size cards — with a live "X of Y zones open" summary computed from real zone data above it. A floating pill tab bar sits over content on a frosted navy/gold-rimmed (dark) or white (light) chrome.

**Admin** is a 240px sidebar rail (drawer below `lg`) with a single active-position marker that slides between rows (`translateY` + CSS transition, measured off the active link's real layout box), a sticky 64px header, and a main column capped at 88rem. The dashboard opens with an asymmetric stat composition — one hero figure spanning two rows, three companion figures beside it — never a uniform grid. Tables are dense: sticky header, hairline row seams, hover tint, no zebra striping.

## Elevation & Depth

**Mobile**: hybrid, shadow-light. Ink-tinted offset shadows at panel level only (dark: pure black shadow since a near-black ground makes tinted shadows invisible; light: navy-ink-tinted, matching `mobile-light-ink`). Frost (blur + tint overlay) is limited to the tab bar chrome and hero/pass cards, both falling back to flat color under Reduce Transparency. An ambient two-blob gradient mesh drifts and breathes slowly (~24s/leg) behind screen content — frozen under Reduce Motion.

**Admin**: near-flat, tonal. White-on-graphite panels with hairline seams; depth comes from the raised-surface step, not stacked shadows. `card` / `card-hover` shadow tokens exist for tappable panels only. A slow ambient radial-wash drift (`parada-drift`, 28s) sits behind the page ground, mirroring mobile's GradientMesh — frozen under `prefers-reduced-motion`.

### Named Rules
**The Panel-Level Shadow Rule.** Only the outermost surface casts a shadow (or frost); nested rows, chips and pills never do.

## Shapes

Both surfaces share the **PARADA cut**: three soft corners plus one sharp corner (top-right), echoing the logo's diagonal cut geometry — drawn as real per-corner-radius geometry (SVG path) where a platform can't express it natively (e.g. the mobile mascot's own body shape). Mobile's scale: chips/tracks 10px, buttons/inputs 14px, cards 20px, hero surfaces 28px, tab bar/pills fully round. Admin's scale: chip 8px, control 12px, panel 20px, all mirroring the same three-soft-one-sharp rule at a slightly tighter ratio for desktop density.

## Components

### Buttons (both surfaces)
Confident, one loud voice per surface. Mobile: badge-gold fill, dark-ink text, 48pt tall, spring-bounce on press (scale to 0.96 on press-in, bouncy overshoot back to 1 via the `springPlayful` motion token — not a flat opacity dim). Admin: orange fill, dark-ink text, 44px tall, hover deepens to `admin-brand-orange-deep`.

### Cards
Mobile: navy panel, PARADA-cut corners, spring-bounce on press (same token as buttons) for every tappable card — vehicles, sessions, zones. Admin: graphite panel, PARADA-cut corners, `card-hover` shadow lift on hover only.

### Zone selector (mobile signature)
A horizontal rail of compact zone tiles (plate-chip code, availability badge, 2-line zone name cap, available-count metric, occupancy bar) replacing the retired icon-in-tile / wrap-grid pattern. Selected tile: badge-gold border + soft gold fill + a checkmark row naming the selection explicitly (never color alone). Full/offline tiles are disabled with an explicit reason line, matching backend `status`/`availability`/`availableCount` exactly — no fabricated slot-level occupancy.

### Mascot (mobile signature)
The canonical PARADA mascot — a fixed, unmodified image asset (never redrawn, recolored, stretched, or distorted) — bounces in on mount (`springPlayful`, skipped under Reduce Motion) at empty/error/onboarding/first-greeting moments only. Never rendered behind content, never on the same surface as the zone selector competing for attention.

### Stat panel (admin signature)
One hero figure (2-row span, its own occupancy track) plus companion figures, replacing a uniform stat-card grid. Numeric values animate via `NumberTicker` on change.

### Navigation
Mobile: floating frosted pill tab bar, gold active tint, gold-soft pill behind the active icon. Admin: sidebar with a single sliding active-position marker (no per-row background paint); groups collapse/expand with a rotating chevron.

## Do's and Don'ts

### Do:
- **Do** keep mobile and admin's brand-accent hue distinct (badge-gold vs. logo-orange) even while sharing status semantics.
- **Do** draw the PARADA cut (three soft corners, one sharp) on every card/panel/button/input on both surfaces.
- **Do** pair every status with an icon or label, never color alone — including alert-feed rows (no bare `border-l-4` accent strips).
- **Do** compute any "X of Y" summary language from real query data; never fabricate availability, occupancy, or slot-level state the backend doesn't report.
- **Do** use the canonical mascot image unmodified, and only at empty/error/onboarding/greeting/confirmation moments.
- **Do** animate live operational numbers (admin hero stats) with a settle/tween, not an instant jump — and always gate it behind Reduce Motion.

### Don't:
- **Don't** default a zone/item selector to a generic wrapping vertical card grid — use the horizontal rail (mobile) or the asymmetric stat composition (admin).
- **Don't** let the mascot appear behind content or compete with the primary selector on screen.
- **Don't** invert light mode from dark mode on either surface; both registers are independently tuned.
- **Don't** reuse Calamansi UI's own signature geometry (the squircle) or its Persuade-mode effects (3D pointer-tilt glare) in PARADA's Operate-mode admin — borrow interaction quality, not their brand mark.
- **Don't** add a second filled accent-colored button to the same form or screen.

---
name: PARADA
description: Two purpose-built surfaces, one ecosystem — an Apple-like glass driver app ("Clear") over a moving wave grid, introduced by its mascot, Lottie, and a graphite operations console led by the logo's own orange. Both follow Rams — honest status, one clear action, as little design as possible.
colors:
  mobile-light-background: "#E9ECF2"
  mobile-light-surface: "#FFFFFF"
  mobile-light-surface-elevated: "#EEF0F5"
  mobile-light-foreground: "#111318"
  mobile-light-muted: "#545A68"
  mobile-light-primary: "#111318"
  mobile-light-primary-deep: "#B23C0C"
  mobile-light-primary-ink: "#9A3410"
  mobile-light-danger: "#C4112B"
  mobile-light-success: "#11713A"
  mobile-light-warning: "#9E4F00"
  mobile-light-info: "#0A60CC"
  mobile-light-on-accent: "#FFFFFF"
  mobile-dark-background: "#07080C"
  mobile-dark-surface: "#15171E"
  mobile-dark-surface-elevated: "#1F222B"
  mobile-dark-foreground: "#F4F5F7"
  mobile-dark-muted: "#A6ACBA"
  mobile-dark-primary: "#F4F5F7"
  mobile-dark-primary-deep: "#FF9A6B"
  mobile-dark-primary-ink: "#FFB08F"
  mobile-dark-danger: "#FF6B6B"
  mobile-dark-success: "#4ADE80"
  mobile-dark-warning: "#FFB340"
  mobile-dark-info: "#7FB2FF"
  mobile-dark-on-accent: "#07080C"
  mobile-accent-orange: "#FC7643"
  admin-dark-paper: "#0B0B0C"
  admin-dark-card: "#141416"
  admin-dark-raised: "#1C1C1F"
  admin-dark-charcoal: "#F4F4F5"
  admin-dark-muted: "#A1A1AA"
  admin-dark-line: "#27272A"
  admin-dark-brand: "#F7931A"
  admin-dark-brand-hover: "#EA580C"
  admin-dark-brand-ink: "#F7931A"
  admin-dark-success: "#3DDC84"
  admin-dark-warning: "#FFD600"
  admin-dark-danger: "#F0524A"
  admin-light-paper: "#F4F4F5"
  admin-light-card: "#FFFFFF"
  admin-light-raised: "#F4F4F5"
  admin-light-charcoal: "#0A0A0B"
  admin-light-muted: "#52525B"
  admin-light-line: "#E4E4E7"
  admin-light-brand: "#F7931A"
  admin-light-brand-hover: "#E8830F"
  admin-light-brand-ink: "#B23A0A"
  admin-light-success: "#177047"
  admin-light-warning: "#8A6A00"
  admin-light-danger: "#C22A26"
  admin-on-accent: "#0F0A05"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "48px"
    fontWeight: 700
    lineHeight: "52px"
    letterSpacing: "-1.4px"
  hero:
    fontFamily: "Inter, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: "41px"
    letterSpacing: "-0.9px"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "26px"
    letterSpacing: "-0.3px"
  section:
    fontFamily: "Inter, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "24px"
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
    fontFamily: "Inter, sans-serif (tabular figures)"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "18px"
  mono-value:
    fontFamily: "Inter, sans-serif (tabular figures)"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "24px"
  admin-page-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  admin-figure:
    fontFamily: "Inter, sans-serif (tabular figures)"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: "1"
  admin-micro:
    fontFamily: "Inter, sans-serif"
    fontSize: "11px"
    lineHeight: "16px"
rounded:
  mobile-sm: "10px"
  mobile-md: "16px"
  mobile-lg: "22px"
  mobile-xl: "30px"
  mobile-full: "999px"
  mobile-tab-bar: "32px"
  admin-panel: "1rem"
  admin-control: "0.6875rem"
  admin-chip: "0.4375rem"
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
  touch-target: "44px"
components:
  mobile-button-primary:
    backgroundColor: "{colors.mobile-light-primary}"
    textColor: "{colors.mobile-light-on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.mobile-md}"
    height: "48px"
  mobile-button-primary-pressed:
    backgroundColor: "{colors.mobile-light-primary-deep}"
    textColor: "{colors.mobile-light-on-accent}"
  mobile-card:
    backgroundColor: "rgba(255, 255, 255, 0.82)"
    textColor: "{colors.mobile-light-foreground}"
    rounded: "{rounded.mobile-lg}"
    padding: "16px"
  mobile-glass-card:
    backgroundColor: "blur + rgba(255, 255, 255, 0.62)"
    rounded: "{rounded.mobile-xl}"
  mobile-zone-tile-selected:
    backgroundColor: "rgba(252, 118, 67, 0.16)"
    borderColor: "{colors.mobile-light-primary}"
    rounded: "{rounded.mobile-lg}"
    width: "208px"
  mobile-plate-chip:
    backgroundColor: "{colors.mobile-light-foreground}"
    typography: "{typography.mono-value}"
    rounded: "{rounded.mobile-sm}"
    padding: "4px 8px"
  mobile-lottie:
    width: "56–132px"
  admin-button-primary:
    backgroundColor: "{colors.admin-dark-brand}"
    textColor: "{colors.admin-on-accent}"
    rounded: "{rounded.admin-control}"
    padding: "0 20px"
    height: "44px"
  admin-button-primary-hover:
    backgroundColor: "{colors.admin-dark-brand-hover}"
    textColor: "{colors.admin-on-accent}"
  admin-card:
    backgroundColor: "{colors.admin-dark-card}"
    textColor: "{colors.admin-dark-charcoal}"
    rounded: "{rounded.admin-panel}"
  admin-metric-card:
    textColor: "{colors.admin-dark-charcoal}"
    typography: "{typography.admin-figure}"
    padding: "16px 20px"
  admin-lottie:
    width: "168px"
---

# Design System: PARADA

This file describes the design as it is in the code. Token values come from `apps/mobile/src/theme/*` and from `apps/admin/app/globals.css` + `apps/admin/tailwind.config.ts`. If they disagree with this file, the code is right and this file needs updating.

## Overview

**Creative North Star: "One Ecosystem, Two Purpose-Built Rooms"**

PARADA is a zone-based campus parking system with two surfaces that deliberately do not share a palette. The driver app (Expo/React Native) is **"Clear"** (owner direction, 24 Nov 2026): Apple-like, clean and simple — frosted glass over a slowly moving wave grid, an ink-black (light) or white (dark) action button, PARADA orange for data and accents, modern charts and seamless motion, introduced by its mascot, Lottie — because a driver meets PARADA outdoors, one-handed, wanting to know where to park. The admin console (Next.js) is **"Console"** (redesign approved 25 Nov 2026): a monochrome zinc console with the logo's orange only on live data and the one filled action — because an operator sits at a desk for hours and needs status to read instantly.

Since the Rams redesign (September 2026) both surfaces follow three rules above everything else:

1. **Honest.** Say only what the backend knows. "Live" only while the realtime stream is connected. Cameras are "enabled", not "online". An assignment keeps no space; only a reservation does.
2. **One clear action.** Each screen shows the one current thing and its action. Idle screens say so plainly and offer one way forward.
3. **As little design as possible.** On admin: one ambient fog ground with glass panels over it (owner request, 26 Nov 2026), and no counting numbers. On mobile, Clear allows exactly one ambient element — the wave grid ground, which exists so the glass has something to blur — and freezes it under Reduce Motion. Lottie appears only in her listed places.

**Key characteristics**
- Mobile: tabs **Now / Zones / History / Account**. Light ground `#E9ECF2`, dark ground `#07080C`; ink button (`#111318` light / `#F4F5F7` dark); PARADA orange `#FC7643` for data, text-safe `#B23C0C` / `#FF9A6B`.
- Admin: flat, always-visible navigation; dashboard led by **Needs attention**. Dark ground `#121316`, light ground `#F5F2EC`, accent `#F7931A` in both.
- Type: mobile is **Inter only** (tabular figures for plates, codes and numbers); admin is Inter for everything plus JetBrains Mono for data.
- Shape: mobile uses uniform continuous corners (the cut is retired there); admin also uses uniform corners since its 25 Nov 2026 redesign (the cut is retired on both).
- System / Light / Dark on both surfaces, each theme tuned separately; light is never an inversion of dark.

## Colors

Two palettes, one grammar: a tinted ground, one brand accent, and status hues that are always paired with an icon or label.

### Mobile — "Clear" (`apps/mobile/src/theme/colors.ts`)

| Role | Token | Light | Dark |
|---|---|---|---|
| Ground (under the wave grid) | `background` | `#E9ECF2` cool paper | `#07080C` near-black |
| Card / input | `surface` | `#FFFFFF` (cards at 82%) | `#15171E` |
| Nested surface | `surfaceElevated` | `#EEF0F5` | `#1F222B` |
| Text | `foreground` | `#111318` ink | `#F4F5F7` |
| Secondary text | `muted` | `#545A68` | `#A6ACBA` |
| The one filled action (ink button) | `primary` | `#111318` | `#F4F5F7` |
| Text on `primary` | `onAccent` | `#FFFFFF` | `#07080C` |
| Text-safe orange: active tab, links, emphasis, pressed button | `primaryDeep` | `#B23C0C` | `#FF9A6B` |
| Orange wash: selected rows, active-tab pill | `primarySoft` | orange 16% | orange 18% |
| Danger, full | `danger` | `#C4112B` | `#FF6B6B` |
| Available, confirmed | `success` | `#11713A` | `#4ADE80` |
| Low availability, pending | `warning` | `#9E4F00` | `#FFB340` |
| "Yours" — held space, primary vehicle, assignment | `info` | `#0A60CC` | `#7FB2FF` |
| Chart series (first = PARADA orange) | `data` | `#B23C0C`, … | `#FC7643`, … |

- **`primary` is ink, not orange.** Since Clear the filled button is near-black in light and near-white in dark; orange moved to `primaryDeep`, `primarySoft` and `data[0]`. `onAccent` on `primary` is tested ≥4.5:1 in both themes.
- **Text safety.** `foreground`, `muted`, `primaryDeep` and every `*Ink` token clear 4.5:1 on `background`, `surface` and `surfaceElevated` in both themes; `__tests__/themeContrast.test.tsx` asserts it. `faint` (~3:1) is for dividers and decorative icons only.
- **Soft fills and ink.** Every status has a `*Soft` fill and a matching `*Ink` text colour; text on a soft fill uses `inkColor()`.
- **Data hues** (`data`, four ordered colours) are for charts only, never for status. The wave grid draws blue (far) to orange (near) as decoration, never as information.

### Admin — "Console" (`apps/admin/app/globals.css`, redesign approved 25 Nov 2026)

Monochrome zinc graphite / white. Orange appears only on live data (the facility occupancy meter, the current hour in the trend, the unread badge) and on the one filled action.

| Role | Tailwind | Dark | Light |
|---|---|---|---|
| Ground | `paper` | `#0B0B0C` | `#F4F4F5` |
| Panel | `card` | `#141416` | `#FFFFFF` |
| Nested row | `raised` | `#1C1C1F` | `#F4F4F5` |
| Text | `charcoal` | `#F4F4F5` | `#0A0A0B` |
| Secondary text | `muted` | `#A1A1AA` | `#52525B` |
| Hairline | `line` | `#27272A` | `#E4E4E7` |
| Tick meter (empty / filled) | `--tick` / `--tick-fill` | `#2C2C31` / `#D4D4D8` | `#E4E4E7` / `#3F3F46` |
| Brand fill (the one filled action) | `brand` | `#F7931A` | `#F7931A` |
| Brand text / icon | `brand-ink` | `#F7931A` | `#B23A0A` |
| Primary hover fill | `brand-hover` | `#EA580C` | `#E8830F` |
| Focus ring | `focus` | `#F7931A` | `#B23A0A` |
| Success / Warning / Danger | `success` / `warning` / `danger` | `#3DDC84` / `#FFD600` / `#F0524A` | `#177047` / `#8A6A00` / `#C22A26` |

- Every colour is an RGB channel variable (`--paper: 18 19 22`) so Tailwind opacity modifiers work. `[data-theme]` on `<html>` picks the theme; without it, `prefers-color-scheme` decides.
- The light values appear twice in `globals.css` — under `[data-theme="light"]` and inside `@media (prefers-color-scheme: light)` as the no-JS fallback. This is on purpose: edit both. A test asserts they match.
- Raw brand orange is only ~2.3:1 as text on light paper, so light-mode brand text, links and the focus ring use `brand-ink` `#B23A0A`.

### Named rules
**The Two-Palette Rule.** Mobile and admin never share a literal hex for their brand accent (mobile orange `#FC7643`, text `#B23C0C` / `#FF9A6B`; admin `#F7931A`). Both accents are orange, so grounds and materials do the separating: frosted glass over a wave grid on mobile, flat zinc graphite or white on admin. Status meanings (green = available, red = full/danger) may be shared.

**The Stamp Rule** (both surfaces). A status is never colour alone: every pill, badge and alert row carries an icon or dot plus a label. A bare colour bar is a defect.

## Typography

**Mobile:** Inter only (400/500/600/700) through `@expo-google-fonts/inter` — the closest open face to SF Pro. **Admin:** Inter (headings, body, figures) and JetBrains Mono (data), through `next/font/google` as `--font-sans` and `--font-mono`; Tailwind's `font-display` maps to Inter.

### Mobile ramp (`Text` variants)
- **Display** — Inter 700, 48/52, −1.4, tabular: big numbers only (elapsed clock, 7-day total, session duration, fine).
- **Hero** — Inter 700, 34/41, −0.9: large screen titles.
- **Title** — Inter 600, 20/26, −0.3: card and sheet titles.
- **Section** — Inter 600, 17/24: section headers.
- **Body** — Inter 400, 15/22; **bodySemi** — Inter 600.
- **Caption** — Inter 500, 13/18: hints, timestamps, status lines.
- **Micro** — Inter 700, 11/14, +0.8: field labels, badge text.
- **mono / monoBold / plate** — Inter 600/700 with tabular figures (plates +1.5 tracking). The token names stay `mono*` so call sites didn't change; mobile has no monospace face any more.

### Admin ramp
- **Page title** — Inter 600, 24px (`text-2xl`), −0.02em.
- **Figure** (`MetricCard`) — Inter 600, 30px, −0.025em, line-height 1.
- **Column headers and group labels** — 12px (`text-xs`) semibold, muted, sentence case (no tracked capitals).
- **Body** — Inter 14px (`text-sm`); secondary text 12px (`text-xs`), muted.
- **Micro** — 11/16 (`text-micro`), for column headers and small labels.
- A `display` size (48px) exists in the Tailwind config, but no screen uses it.
- Arbitrary `text-[Npx]` sizes are not allowed; a test fails on them.

### Named rules
**The Mono-Is-Data Rule** (admin). JetBrains Mono appears only on identifiers and machine values — plates, zone codes, camera ids, timestamps. On mobile the same values use Inter with tabular figures.

**The Tabular Figures Rule.** Every number that can change sets in tabular numerals (admin sets `tabular-nums` on `body`). Numbers update in place — no animated count.

## Layout

**Mobile.** One column on a 4pt grid (`spacing`: 2/4/8/12/16/20/24/32/40). Screen side padding is 20pt. Every tappable control is at least 44pt (`touchTarget`). Four tabs:

- **Now** — the one current thing: an active session, a reservation or an assigned zone, each with its actions. When nothing is current: a **"Nothing planned"** card with Lottie and one **Find a zone** button. Cancelling a reservation asks once more (it releases a kept space); cancelling an assignment is one tap (an assignment keeps nothing). The notifications bell sits in the header.
- **Zones** — a live "X of Y zones open" line, a **Least busy now · Choose** card, then a vertical list of zone rows (name, code, free count, parked/held/free bar, Details). **Tapping a zone opens the zone sheet** (`ZoneActionSheet`): zone name and counts, a two-way switch — **Go to this zone** (an assignment; states that no space is kept and that another zone gets a warning, then a fine) or **Reserve a space** (arrival Now / In 30 min / In 1 hour; sends only `startAt`) — the vehicle, and the one finishing button at the bottom. Go now is two taps: the zone, then the button. The sheet closes by ✕, backdrop or Back, and disappears on its own once a plan exists.
- **History** — on top, **parking activity**: the last 7 days as tappable bars (tap a day to read it; today in orange) and the current month as a heat calendar (darker = longer), both from the driver's own `/sessions`. Then past reservations and completed sessions, read-only.
- **Account** — appearance (System / Light / Dark), My Vehicles, Payments & Fees, Edit profile, Change password, Violations, Sign out. The role pill shows only for ADMIN.
- **Vehicles** (from Account) — a **Selected for parking** glass card naming the primary plate, then each vehicle with a **primary radio** (tap to make it primary). The add form has a **Make this my primary vehicle** switch — on and locked for a driver's first vehicle (the server makes it primary), free for later ones (create, then `POST /vehicles/:id/primary`).
- **Zones vehicle choice** — "Parking with ABC 1234 · Primary"; **Change** picks another vehicle for that one plan only.
- **First-run tutorial** (`app/tutorial.tsx`) — after a new driver's first sign-in with no active vehicle (once per account per install): Lottie greets → the plate is read under a gate-camera frame → a zone card with Go now / Reserve → **Add your vehicle** with the primary switch → "You're set" (Primary · Selected for parking) → optional second vehicle → Start parking. "I'll add it later" is always offered.
- **Verify email** — six code boxes over one real field (paste and autofill work), red boxes and a shake on a wrong code, "Codes expire after 10 minutes", resend after a 60s countdown.

Scroll content clears the floating tab bar with `tabClearance(insets.bottom)`, never a fixed number; pushed (`back`) screens don't reserve tab-bar space. Now and Zones show the connection state under the title: **"Live"** only while the realtime stream is connected, otherwise **"Reconnecting…"** or **"Not live"** plus **"Updated hh:mm"**, announced through a polite live region.

**Admin.** A floating 256px sidebar panel (`w-64`, inset 12px, rounded) from `lg` up and a modal drawer below it; a sticky header on the ground holding the connection pill, the notification bell (unread count from `/admin/notifications`), a theme toggle, the identity link and Log out; a main column capped at 88rem. Navigation groups are headings, never collapsible:

- **Monitor**, **Act**, **Records**, **System** — every page is always visible and reachable by Tab. Parked vehicles live under "Sessions" (not "Vehicles"). Account lives in the header's identity link, next to the one Log out.

The dashboard reads top to bottom in the order an operator acts:
1. **Needs attention** — open anomalies (`?resolved=false`), appeals awaiting a decision, full zones; each row a link; "Nothing needs attention." when clear.
2. **Facility strip** — four figures on one panel separated by seams, each with a tick meter: Occupied (orange, live), Parked now, Free spaces, Cameras enabled (one tick per camera).
3. **Occupancy · last 24 hours** (one bar per hour, the current hour orange) beside **Activity** — recent anomalies, notifications and gate events merged newest first (resolved items marked).
4. **Zones** — one row per zone: code chip, name, tick meter, count, and a badge only when not Available.

Tables are dense: sticky header, hairline row seams, hover tint, no zebra striping. Every mutation shows a success message. Row actions are named with their row ("Edit camera CAM-A01").

## Elevation & Depth

**Mobile — Clear.** Every `Screen` paints the **wave grid** (`WaveGrid`): two soft monochrome light fields and a perspective grid of sine lines in the ground's own grays (light: white far → gray `#8A919E` near; dark: `#1E222B` far → gray `#6B7280` near) that swell toward the viewer and slide one wavelength on a seamless loop, over static rails converging to the horizon. It is `quiet` (75% light / 80% dark) behind app screens and `vivid` on onboarding, sign-in and the tutorial, where a scrim (`scrimFrom`) fades it back to the ground behind copy and the horizon sits below links. It **answers touch**: any touch on a screen, a button or card press, and the zone sheet opening call `pulseWaves()`, which swells the near lines and brightens the field, then settles on a spring. Decorative, hidden from assistive tech, frozen under Reduce Motion; built with core `Animated` (native driver) and `react-native-svg`.
- **Glass.** `GlassCard` = real blur (`expo-blur`, `glass.ts`) + tint + a specular top edge, on hero cards, sheets, pop-ups and the tab bar. `Card` = a translucent row (82% surface, bright hairline edge, soft long shadow) without per-card blur.
- **Android:** cards and `GlassCard` are opaque — an elevation shadow shows through a translucent fill as a grey box, and Android blur would need a `BlurTargetView` the screens don't provide yet.
- **Reduce Transparency:** frost falls back to a flat surface.
- Shadows at panel level only (`shadows.ts`).

**Admin.** Glass over the fog (owner request, 26 Nov 2026): `.card`, the sidebar and the `lg` header use the `glass` utility — the card fill at `--glass-alpha` (58% dark / 60% light), a 20px backdrop blur with 150% saturation, and a top-edge sheen (`--glass-edge`). Floating layers (`.float-panel`: pop-ups, the drawer) use the more opaque `--glass-float-alpha` (84% / 86%). Panels fall back to solid where `backdrop-filter` is unsupported or `prefers-reduced-transparency` is set. Muted text stays ≥5.9:1 over the brightest fog behind glass. Nested rows stay solid `raised`. Only floating layers lift (`.float-panel`: pop-ups, the drawer) with a theme-aware shadow — black on graphite, a zinc ink on white, never black on light. The page ground (`.parada-background`) is one flat colour, with one ambient layer over it (owner request, 26 Nov 2026): `ShaderBackground`, a fixed WebGL canvas behind the content. It slowly drifts wave-and-fbm fog (a port of the 21st.dev "Waves" recipe). Its palette comes from the `--fog-*` tokens: a blue ramp (dark: navy `7 10 17` → steel `28 44 70`; light: blue-grey `208 219 233` → near-white) with brand orange blended in at 16% (dark) / 12% (light) along the middle wave edge. The header (from `lg`) and every `PageHeader` sit on their own `card` panels so nothing reads as floating on the fog; header controls use `raised` with a `line` hover. It renders at half resolution and 30fps, pauses while the tab is hidden, shows one still frame under `prefers-reduced-motion`, and leaves the flat ground showing if WebGL is unavailable.

**The Panel-Level Shadow Rule.** Only the outermost surface casts a shadow (or frost); nested rows, chips and pills never do.

## Shapes

- **Mobile — Clear** (`radii.ts`): uniform continuous corners; the cut is retired. Chips, tracks and the plate chip 10; buttons and inputs 16; cards and grouped lists 22; hero cards, sheets and pop-ups 30. Chips, badges, stamps, avatars and the tab bar (radius 32) are full pills.
- **Admin**: uniform corners; the PARADA cut was retired in the 25 Nov 2026 redesign.
- **Admin** (`borderRadius`): panel 1rem; control (buttons, inputs) 0.6875rem; chip 0.4375rem. Status pills are full-round.

## Components

### Buttons
One filled button per screen or form (**The One Filled Button Rule**).
- **Mobile** (`Button`): primary / secondary / danger / ghost; 48pt tall (44pt small); radius 16. Primary is the ink fill (`primary`) with `onAccent` text, orange `primaryDeep` when pressed. Press scales to 0.96 and springs back. `loading` shows a busy state and blocks presses.
- **Admin** (`.btn-*`): primary / secondary / ghost / success / danger; 44px tall (the small size too, so every control meets the touch-target rule). Primary is a `brand` fill with `on-accent` text, `brand-hover` on hover, `active:scale-[0.98]`. `Button` takes `loading` and sets `aria-busy`.

### Cards and panels
- **Mobile** `Card`: translucent surface (opaque on Android), bright hairline, radius 22, 16pt padding; tappable cards spring on press. `GlassCard`: blur + tint + specular edge, radius 30, for hero cards, sheets and pop-ups.
- **Admin** `.card`: `card` fill, a faint `line` border, panel radius, no shadow. `SectionHeader` is a title and optional description, no rule beneath. `SavedNote` is the inline "Saved." confirmation beside a form's action.

### Status pills, stamps and bars
- **Mobile** `StatusBadge` / `Stamp`: full pills on a `*Soft` fill with `*Ink` text and an icon — "Available" (checkmark), "Few spaces" (alert), "Full" (ban). `CapacityBar` is a stacked bar: parked fill, then a blue **held** segment for reservation holds (`heldSpaces` = capacity − occupied − available, all from `/zones`), label "10 parked · 2 held of 30"; it grows in on mount. `ParkingActivity` draws History's day bars and month calendar.
- **Admin** `Badge`: tinted pills with a glyph or a status dot; the dot pulses only for a live state. `TickMeter` is the one meter: a fixed count of segments (24 by default) shows a percentage, so it never reads as one segment per space; `OccupancyBar` wraps it for zones (red only when FULL) on the dashboard, zones and analytics.

### Zone tile (mobile)
`ZoneCard` in the Zones rail: plate-chip zone code, status badge, zone name (two lines max), free-space count and a capacity bar, plus a separate **Details** link. Selected tile: `primary` border on a `primarySoft` fill; screen readers hear it as checked, and the action panel below names the chosen zone. A full zone shows "No spaces available" and cannot be chosen. Values come straight from the backend (`status`, `availability`, `availableCount`) — no invented slot-level occupancy.

### Plate chip (mobile)
`PlateChip`: Inter Bold with tabular figures on a `foreground` (ink, text in `background`) or `primarySoft` (soft, text in `primaryInk`) fill, radius 10, tracking +1; it shrinks rather than pushing a sibling badge off its row.

### Needs attention + facility strip (admin)
`NeedsAttention` lists only things an operator can act on, each row a link to where to act. `FacilityStrip` holds `MetricCard`s — the only figure component in the console. A `MetricCard` shows a label, the figure (tinted red, amber or green only when the value itself means that) and an optional detail line that wraps rather than clips. Cameras read **enabled / disabled**: `ONLINE`/`OFFLINE` is an admin switch, not a heartbeat.

### Navigation
- **Mobile**: a floating glass capsule tab bar (64pt tall, 16pt side margin); the active tab is orange `primaryDeep` with a `primarySoft` pill behind its icon.

### Pop-ups (mobile)
`PopupProvider`, mounted above the whole stack, turns realtime events into in-app pop-ups (the app has no OS push; `expo-notifications` isn't installed). Events older than 10 minutes never pop.
- **Banner** — `NOTIFICATION_CREATED` (except the session fee, which the ended sheet covers): a glass card drops in at the top with the server's own message; tap opens Notifications; hides after 6s; `accessibilityRole="alert"`.
- **You're parked** sheet — `PARKING_SESSION_STARTED`: Lottie, zone, entry time, plate.
- **Session ended** sheet — `PARKING_SESSION_COMPLETED`: check mark, duration, the server's fee, entry → exit times, Lottie.
- **Toast** — confirms the driver's own action (reservation cancelled, vehicle added, primary changed); top of the screen, 3.5s, polite live region.
- **Admin pop-ups** (`components/Toaster.tsx`), fed by `subscribeRealtimeEvents` in `lib/realtime.ts` (every accepted, de-duplicated SSE event, after its queries are invalidated). Top right under the header; at most 3, the rest fold into “+N more in notifications”; events older than 10 minutes never pop.
  - **Critical, stays until dismissed** (`role="alert"`): a zone full (`NOTIFICATION_CREATED` · `ZONE_FULL`) and a denied guest (`GUEST_ADMISSION_ISSUE`, `admitted: false`). The first action is the one filled button.
  - **Info, hides after 8s** (`role="status"`, paused while hovered or focused, a countdown bar): `ZONE_LOW_AVAILABILITY`, `VIOLATION_APPEAL_SUBMITTED`, `VIOLATION_CREATED`.
  - Never pops: occupancy updates, entries and exits, reservations, assignments, violation updates — they update figures in place. The guest payload carries no plate, so no plate is shown.
- **Admin**: a sidebar with one sliding active-position pill (measured from the active link, and measured again on resize); no per-row background paint. A **Skip to content** link is the first Tab stop. Below `lg` the sidebar is a modal drawer: focus stays inside, Escape closes it, and focus returns to the menu button.

### Empty, loading and error states
- **Mobile** `EmptyState` / `ErrorState`: a plain icon on a soft disc (`Illustration`, hidden from screen readers), a title, one line of explanation and at most one action. `LoadingState` always carries a text label.
- **Admin** full-page gates (API unreachable — announced as an alert, with Retry; signed out; forbidden) sit in one centred `card` panel (`GatePanel`), and the full-page spinner is a compact `card` pill with its label, so no message floats on the fog.
- **Admin** `QueryBoundary` renders `LoadingState` (skeleton rows with a label), `ErrorState` (with Retry) or `EmptyState` (one icon badge on a soft disc — a clock on History, a bell on Notifications; no satellite chips).

### Forms
Inputs are at least 44px tall with a visible label ; mobile one-time codes use `CodeInput`. On admin, opening a form moves focus to its first field; closing it returns focus to the button that opened it. Mobile radios expose `checked`; segmented controls are 44pt tall.

## Lottie (mascot)

Lottie is PARADA's mascot: a cream poodle in a navy parking-officer cap with a gold P-badge and whistle. Her frames are cut from the owner's 6×3 sprite sheet (magenta background keyed out) — fixed images, never redrawn, recolored or stretched. Four poses ship, all on one 319 × 312 canvas aligned on the cap, so a pose change never shifts her: **calm** (rest), **blink** (eyes closed), **ears** (ears up), **excited** (ears up, sparkles, whistle swung aside).

**Where — these places only:**

| Surface | Place | Greeting beside her | Size |
|---|---|---|---|
| Mobile | Onboarding slide 1 only | "Hi, I'm Lottie." | 132pt |
| Mobile | Login, between the logo and "Welcome back" | "Lottie's on duty." | 112pt |
| Mobile | Now tab, "Nothing planned" card — only while there is no session, reservation or assigned zone | none | 96pt |
| Mobile | First-run tutorial (greets on step 1, stays small above the vehicle form) | none | 120 / 72pt |
| Mobile | "You're parked" and "Session ended" pop-up sheets (owner-confirmed 24 Nov 2026) | none | 88 / 56pt |
| Admin | Login brand panel (`lg` and wider) | "Lottie's on duty." | 168px |

- **Motion:** rises in once on mount, floats gently (4pt over a 4.8s cycle), blinks every 4.2s for 140ms. Under Reduce Motion / `prefers-reduced-motion`: no rise, no float, no blink.
- **Tap (mobile only):** ears → excited → calm, about 1.2s; blinking pauses during the reaction. It still works under Reduce Motion (a pose change, not movement). Admin Lottie is not clickable, so Tab still goes straight to the sign-in form.
- **Accessibility:** decorative — hidden from screen readers. Her name lives only in the visible greeting text.
- **Sizing:** every frame gets an explicit width and height, and the figure clips to its own box. (Stretching the frames with absolute insets alone drew them at their natural 319pt on iOS, over the text.) Keep her at 168 or smaller — the source frames are 319px and blur beyond that.
- **Files:** `apps/mobile/src/components/Lottie.tsx` with `apps/mobile/assets/lottie/` (4 frames); `apps/admin/components/Lottie.tsx` with `apps/admin/public/lottie/` (calm, blink). `apps/mobile/__tests__/decoration.test.tsx` fails if she is added to any other mobile file.

## Motion

- **Mobile — Clear**: one authored moment per screen. Principles in use: squash and stretch on buttons (wider and flatter under the thumb, a slight stretch on release); anticipation and follow-through on the zone sheet (starts small and low, overshoots, settles; slides down before it unmounts); staging (backdrop dims everything but the decision); secondary action (the wave grid swells on touch); slow-in/slow-out springs; snappy 140–220ms timing. UX laws: Hick (two choices in the sheet), Fitts (full-width finishing button in the thumb zone, 44pt+ targets), Jakob (a standard bottom sheet), frequency of use (Go now is the default). The wave grid loop is the one ambient motion. Onboarding and the tutorial carry **one stage across their beats** (pins rise into a hold card that becomes a plate pass; the plate slides under a camera frame that becomes a zone card) on a spring driven by the step. Capacity and History bars grow in; pop-up sheets spring up; banners and toasts drop in; a wrong verification code shakes the boxes. Press feedback 120ms with a press-release spring. Under Reduce Motion every loop, spring and grow stops (values jump to their end state), followed live; the resend countdown keeps counting because it is information.
- **Admin**: one authored moment, the realtime arrival. A pop-up swings in on a shallow arc and settles (`toast-in`, 420ms), and a critical one rings its icon once. It exits faster, back the way it came (`toast-out`, 160ms); it leaves the accessibility tree at once and the DOM after the exit. The header bell winds up and rings (`bell-ring`), and its badge squashes and stretches (`badge-pop`), only when the unread count rises, never on first load. Supporting feedback: the gate ticker icon slides in from its direction (`gate-in` / `gate-out`); buttons squash on press (wider, flatter, 75ms); the sidebar pill overshoots slightly as it follows the route; the empty-state badge settles onto its disc (`settle-in`). Also `fade-in` (220ms) for content, `saved-fade` for the "Saved." note, `pulse-dot` for a live status dot, and `lottie-float` on the login panel. A global `prefers-reduced-motion` rule cuts every animation and transition to near zero.
- Admin: nothing moves just to look alive except the one `ShaderBackground` fog; no counting numbers. Mobile: the wave grid is the one ambient exception; still no counting numbers.

## Accessibility

- Text contrast ≥4.5:1 in both themes on both surfaces, asserted by tests. Focus rings ≥3:1 (admin: a solid 2px ring with a paper-coloured gap).
- Every control ≥44pt/px. Every status has an icon or label, not colour alone.
- Mobile: screen titles and section titles are headers; the connection line is a polite live region; `userInterfaceStyle: "automatic"`, so System follows the OS.
- Admin: skip link, login landmarks, a modal drawer with focus trap and focus return, forms that move focus in and back.
- Decorative art (Lottie, illustrations) is hidden from screen readers.

## Language

The copy says what the backend actually does:

- **Assignment ≠ Reservation.** "Go to this zone" keeps no space; "Reserve a space" does. Never "Park now", "Reserve for later" or "You're all set".
- **Wrong zone:** a warning first, then a fine. The establishment sets the fine, so no amount appears in the copy.
- **Least busy**, never "Recommended for you" — the pick is the backend's least-occupied zone, not a personal one.
- **Cameras enabled / disabled**, never online / offline. **Activity** / "recent", never "Live alerts".
- Enum values are shown with human labels (`apps/admin/lib/labels.ts`), never raw constants.

## Do's and Don'ts

### Do
- **Do** keep mobile's and admin's brand accents as separate hex values, even while sharing status meanings.
- **Do** keep admin orange for live data and the one filled action; everything else is zinc.
- **Do** pair every status with an icon or label — never colour alone.
- **Do** compute every "X of Y" line from real query data; never invent availability, occupancy or slot-level state.
- **Do** let live numbers update in place with the time they were last updated, and say "Live" only while the realtime stream is actually connected.
- **Do** use Lottie's frames unmodified, only in the places listed under Lottie, and name her only in visible greeting text.
- **Do** keep copy legible over the wave grid: push the horizon below links or fade it with `scrimFrom`.
- **Do** read tokens from the theme (`useColors()` on mobile, Tailwind token classes on admin) — never hard-code a hex in a component.

### Don't
- **Don't** default a zone selector to a wrapping vertical card grid — use the horizontal rail.
- **Don't** lay admin figures out as a grid of same-size stat cards, or animate them with a counting tween — use `MetricCard`s in one facility strip.
- **Don't** add ambient decoration on admin beyond `ShaderBackground`. On mobile, add none beyond the wave grid, and don't put real blur on routine `Card`s.
- **Don't** put Lottie in empty or error states, behind content, or on Zones, History or Account.
- **Don't** claim a state the backend doesn't report — no "online" cameras, no "Live" while reconnecting, no kept space for an assignment.
- **Don't** invert light mode from dark mode; each register is tuned on its own.
- **Don't** collapse admin navigation groups or hide pages behind toggles.
- **Don't** add a second filled accent-coloured button to the same form or screen.
- **Don't** reuse Calamansi UI's signature geometry (the squircle) or its 3D pointer-tilt glare — borrow interaction quality, not their brand mark.

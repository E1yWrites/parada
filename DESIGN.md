---
name: PARADA
description: Two purpose-built surfaces, one ecosystem — a warm navy-and-sunset driver app introduced by its mascot, Lottie, and a graphite operations console led by the logo's own orange. Both follow Rams — honest status, one clear action, as little design as possible.
colors:
  mobile-dark-background: "#273248"
  mobile-dark-surface: "#2F3B54"
  mobile-dark-surface-elevated: "#38455F"
  mobile-dark-foreground: "#FFEBD2"
  mobile-dark-muted: "#C7BBAE"
  mobile-dark-primary: "#FC7643"
  mobile-dark-primary-deep: "#FFA364"
  mobile-dark-primary-ink: "#FDB69B"
  mobile-dark-danger: "#FF8478"
  mobile-dark-success: "#3DDC84"
  mobile-dark-warning: "#FFC65C"
  mobile-dark-info: "#82ACFF"
  mobile-light-background: "#F3F5FC"
  mobile-light-surface: "#FFFFFF"
  mobile-light-surface-elevated: "#E7EBF7"
  mobile-light-foreground: "#10142A"
  mobile-light-muted: "#565C7A"
  mobile-light-primary: "#F2A93B"
  mobile-light-primary-deep: "#8A5A00"
  mobile-light-primary-ink: "#805A1F"
  mobile-light-danger: "#B3261E"
  mobile-light-success: "#146C43"
  mobile-light-warning: "#8A4B00"
  mobile-light-info: "#1D4ED8"
  mobile-on-accent: "#15111C"
  admin-dark-paper: "#121316"
  admin-dark-card: "#1B1D22"
  admin-dark-raised: "#23262C"
  admin-dark-charcoal: "#F5F4F2"
  admin-dark-muted: "#90949E"
  admin-dark-line: "#24262D"
  admin-dark-brand: "#F7931A"
  admin-dark-brand-hover: "#EA580C"
  admin-dark-brand-ink: "#F7931A"
  admin-dark-success: "#3DDC84"
  admin-dark-warning: "#FFD600"
  admin-dark-danger: "#F0524A"
  admin-light-paper: "#F5F2EC"
  admin-light-card: "#FFFDF9"
  admin-light-raised: "#F1EBE0"
  admin-light-charcoal: "#181310"
  admin-light-muted: "#655D53"
  admin-light-line: "#E4DDCF"
  admin-light-brand: "#F7931A"
  admin-light-brand-hover: "#E8830F"
  admin-light-brand-ink: "#B23A0A"
  admin-light-success: "#177047"
  admin-light-warning: "#8A6A00"
  admin-light-danger: "#C22A26"
  admin-on-accent: "#0F0A05"
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
    fontWeight: 700
    lineHeight: "36px"
    letterSpacing: "-0.6px"
  title:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "26px"
    letterSpacing: "-0.3px"
  section:
    fontFamily: "Space Grotesk, sans-serif"
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
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
  mono-value:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "24px"
  admin-page-title:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "30px"
    fontWeight: 900
    letterSpacing: "-0.02em"
  admin-figure:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "30px"
    fontWeight: 900
    lineHeight: "1"
  admin-micro:
    fontFamily: "Inter, sans-serif"
    fontSize: "11px"
    lineHeight: "16px"
rounded:
  mobile-sm: "10px"
  mobile-md: "14px"
  mobile-lg: "20px"
  mobile-xl: "28px"
  mobile-cut: "3px"
  mobile-full: "999px"
  mobile-tab-bar: "32px"
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
  touch-target: "44px"
components:
  mobile-button-primary:
    backgroundColor: "{colors.mobile-dark-primary}"
    textColor: "{colors.mobile-on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.mobile-md}"
    height: "48px"
  mobile-button-primary-pressed:
    backgroundColor: "{colors.mobile-dark-primary-deep}"
    textColor: "{colors.mobile-on-accent}"
  mobile-card:
    backgroundColor: "{colors.mobile-dark-surface}"
    textColor: "{colors.mobile-dark-foreground}"
    rounded: "{rounded.mobile-lg}"
    padding: "16px"
  mobile-zone-tile-selected:
    backgroundColor: "rgba(252, 118, 67, 0.18)"
    borderColor: "{colors.mobile-dark-primary}"
    rounded: "{rounded.mobile-lg}"
    width: "208px"
  mobile-plate-chip:
    backgroundColor: "{colors.mobile-dark-foreground}"
    typography: "{typography.mono-value}"
    rounded: "{rounded.mobile-sm}"
    padding: "4px 8px"
  mobile-lottie:
    width: "96–160px"
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

PARADA is a zone-based campus parking system with two surfaces that deliberately do not share a palette. The driver app (Expo/React Native) is **"The Attendant"**: a warm navy ground with a sunset-orange accent in dark mode, a cool paper with badge gold in light mode, introduced by its mascot, Lottie — because a driver meets PARADA outdoors, one-handed, wanting to know where to park. The admin console (Next.js) is **"The Control Room"**: a true-neutral graphite ground with the logo's own orange as its one accent — because an operator sits at a desk for hours and needs status to read instantly.

Since the Rams redesign (September 2026) both surfaces follow three rules above everything else:

1. **Honest.** Say only what the backend knows. "Live" only while the realtime stream is connected. Cameras are "enabled", not "online". An assignment keeps no space; only a reservation does.
2. **One clear action.** Each screen shows the one current thing and its action. Idle screens say so plainly and offer one way forward.
3. **As little design as possible.** No ambient animation, no decorative glass on routine cards, no counting numbers. Decoration appears only where it carries meaning — and Lottie only in her four places.

**Key characteristics**
- Mobile: tabs **Now / Zones / History / Account**. Dark ground `#273248`, accent `#FC7643`; light ground `#F3F5FC`, accent `#F2A93B`.
- Admin: flat, always-visible navigation; dashboard led by **Needs attention**. Dark ground `#121316`, light ground `#F5F2EC`, accent `#F7931A` in both.
- Shared type: Space Grotesk (headings), Inter (body/UI), JetBrains Mono (plates, zone codes, timestamps, ids — data only).
- Shared shape: the **PARADA cut** — three soft corners, one sharp corner top-right — on every card, panel, button and input.
- System / Light / Dark on both surfaces, each theme tuned separately; light is never an inversion of dark.

## Colors

Two palettes, one grammar: a tinted ground, one brand accent, and status hues that are always paired with an icon or label.

### Mobile — "The Attendant" (`apps/mobile/src/theme/colors.ts`)

| Role | Token | Dark | Light |
|---|---|---|---|
| Ground | `background` | `#273248` warm navy | `#F3F5FC` cool paper |
| Card / input | `surface` | `#2F3B54` | `#FFFFFF` |
| Nested surface | `surfaceElevated` | `#38455F` | `#E7EBF7` |
| Text | `foreground` | `#FFEBD2` cream | `#10142A` ink |
| Secondary text | `muted` | `#C7BBAE` | `#565C7A` |
| Brand / the one filled action | `primary` | `#FC7643` sunset orange | `#F2A93B` badge gold |
| Pressed / text-safe brand | `primaryDeep` | `#FFA364` | `#8A5A00` |
| Danger, full | `danger` | `#FF8478` | `#B3261E` |
| Available, confirmed | `success` | `#3DDC84` | `#146C43` |
| Low availability, pending | `warning` | `#FFC65C` | `#8A4B00` |
| Active, "yours right now" | `info` | `#82ACFF` | `#1D4ED8` |
| Text on accent fills | `onAccent` | `#15111C` | `#15111C` |

- **Text safety.** `foreground`, `muted`, `primaryDeep` and every `*Ink` token clear 4.5:1 on `background`, `surface` and `surfaceElevated` in both themes; `__tests__/themeContrast.test.ts` asserts it. `faint` (~3:1) is for dividers and decorative icons only — never text or placeholders.
- **Soft fills and ink.** Every status has a `*Soft` fill (chips, selected rows) and a matching `*Ink` text colour (`primaryInk`, `dangerInk`, `successInk`, `warningInk`, `infoInk`). A status hue on its own soft fill fails contrast, so text on a soft fill always uses `inkColor()`.
- **Data hues** (`data`, four ordered colours) are for charts only, never for status.

### Admin — "The Control Room" (`apps/admin/app/globals.css`)

| Role | Tailwind | Dark | Light |
|---|---|---|---|
| Ground | `paper` | `#121316` graphite | `#F5F2EC` warm paper |
| Panel | `card` | `#1B1D22` | `#FFFDF9` |
| Nested row | `raised` | `#23262C` | `#F1EBE0` |
| Text | `charcoal` | `#F5F4F2` | `#181310` |
| Secondary text | `muted` | `#90949E` | `#655D53` |
| Hairline | `line` | `#24262D` | `#E4DDCF` |
| Brand fill (the one filled action) | `brand` | `#F7931A` | `#F7931A` |
| Brand text / icon | `brand-ink` | `#F7931A` | `#B23A0A` |
| Primary hover fill | `brand-hover` | `#EA580C` | `#E8830F` |
| Focus ring | `focus` | `#F7931A` | `#B23A0A` |
| Success / Warning / Danger | `success` / `warning` / `danger` | `#3DDC84` / `#FFD600` / `#F0524A` | `#177047` / `#8A6A00` / `#C22A26` |

- Every colour is an RGB channel variable (`--paper: 18 19 22`) so Tailwind opacity modifiers work. `[data-theme]` on `<html>` picks the theme; without it, `prefers-color-scheme` decides.
- The light values appear twice in `globals.css` — under `[data-theme="light"]` and inside `@media (prefers-color-scheme: light)` as the no-JS fallback. This is on purpose: edit both. A test asserts they match.
- Raw brand orange is only ~2.3:1 as text on light paper, so light-mode brand text, links and the focus ring use `brand-ink` `#B23A0A`.

### Named rules
**The Two-Palette Rule.** Mobile and admin never share a literal hex for their brand accent (mobile `#FC7643` / `#F2A93B`, admin `#F7931A`). In dark mode both accents are orange, so the grounds do the separating: warm navy on mobile, hue-neutral graphite on admin. Status meanings (green = available, red = full/danger) may be shared.

**The Stamp Rule** (both surfaces). A status is never colour alone: every pill, badge and alert row carries an icon or dot plus a label. A bare colour bar is a defect.

## Typography

**Display font:** Space Grotesk (500/600/700) · **Body font:** Inter (400/500/600/700) · **Data font:** JetBrains Mono (400/500/700). Mobile loads them through `@expo-google-fonts`; admin through `next/font/google` as `--font-display`, `--font-sans` and `--font-mono`.

### Mobile ramp (`Text` variants)
- **Display** — Space Grotesk 700, 40/44, −0.8: big numbers only (elapsed session clock, outstanding balance, violation fine).
- **Hero** — Space Grotesk 700, 30/36, −0.6: screen titles.
- **Title** — Space Grotesk 600, 20/26, −0.3: card titles (zone, vehicle, session).
- **Section** — Space Grotesk 600, 17/24: section headers.
- **Body** — Inter 400, 15/22; **bodySemi** — Inter 600, for emphasis and greetings.
- **Caption** — Inter 500, 13/18: hints, timestamps, status lines.
- **Micro** — Inter 700, 11/14, +0.8: field labels, badge text.
- **Mono** — JetBrains Mono 500, 13/18; **mono value** — 700, 18/24, for plates.

Space Grotesk has no 900 cut, so hierarchy on mobile comes from size, not weight.

### Admin ramp
- **Page title** — Space Grotesk 900 (`font-black`), 30px (`text-3xl`), −0.02em.
- **Figure** (`MetricCard`) — Space Grotesk 900, 30px, line-height 1.
- **Body** — Inter 14px (`text-sm`); secondary text 12px (`text-xs`), muted.
- **Micro** — 11/16 (`text-micro`), for column headers and small labels.
- A `display` size (48px) exists in the Tailwind config, but no screen uses it.
- Arbitrary `text-[Npx]` sizes are not allowed; a test fails on them.

### Named rules
**The Mono-Is-Data Rule.** JetBrains Mono appears only on identifiers and machine values — plates, zone codes, camera ids, timestamps. Never on labels, headings or prose.

**The Tabular Figures Rule.** Every number that can change sets in tabular numerals (admin sets `tabular-nums` on `body`). Numbers update in place — no animated count.

## Layout

**Mobile.** One column on a 4pt grid (`spacing`: 2/4/8/12/16/20/24/32/40). Screen side padding is 20pt. Every tappable control is at least 44pt (`touchTarget`). Four tabs:

- **Now** — the one current thing: an active session, a reservation or an assigned zone, each with its actions. When nothing is current: a **"Nothing planned"** card with Lottie and one **Find a zone** button. Cancelling a reservation asks once more (it releases a kept space); cancelling an assignment is one tap (an assignment keeps nothing). The notifications bell sits in the header.
- **Zones** — a live "X of Y zones open" line, then a horizontal, swipeable, snap-scrolling rail of zone tiles (208pt wide) — never a wrapping grid. The backend's least-occupied zone is tagged **Least busy**. Choosing a tile shows two plain actions below: **Go to this zone** (an assignment — it states before submit that no space is kept, and that entering another zone gets a wrong-zone warning, then a fine) and **Reserve a space** (arrival Now / In 30 min / In 1 hour; sends only `startAt`).
- **History** — completed sessions and past reservations, read-only.
- **Account** — appearance (System / Light / Dark), My Vehicles, Payments & Fees, Edit profile, Change password, Violations, Sign out. The role pill shows only for ADMIN.

Scroll content clears the floating tab bar with `tabClearance(insets.bottom)`, never a fixed number. Every tab header shows the connection state under the title: **"Live"** only while the realtime stream is connected, otherwise **"Reconnecting…"** or **"Not live"** plus **"Updated hh:mm"**, announced through a polite live region.

**Admin.** A 240px sidebar (`w-60`) from `lg` up and a modal drawer below it, a sticky header, and a main column capped at 88rem. Navigation groups are headings, never collapsible:

- **Monitor**, **Act**, **Records**, **System** — every page is always visible and reachable by Tab. Parked vehicles live under "Sessions" (not "Vehicles"). Account lives in the header's identity link, next to the one Log out.

The dashboard reads top to bottom in the order an operator acts:
1. **Needs attention** — open anomalies (`?resolved=false`), appeals awaiting a decision, full zones; each row a link; "Nothing needs attention." when clear.
2. **Facility strip** — four figures on one panel separated by seams: Occupied, Parked now, Free spaces, Cameras enabled.
3. **Occupancy trend** (last 24 hours) beside **Recent alerts** (resolved items marked).
4. **Zones** — one row per zone, occupancy shown once, as a bar with its percentage.
5. **Recent gate events** — with readable event labels.

Tables are dense: sticky header, hairline row seams, hover tint, no zebra striping. Every mutation shows a success message. Row actions are named with their row ("Edit camera CAM-A01").

## Elevation & Depth

**Mobile.** Shadows at panel level only (`apps/mobile/src/theme/shadows.ts`): a black offset shadow in dark mode (a tinted one disappears on navy), a faint ink-tinted one in light mode. Frost (blur plus tint, `glass.ts`) is used in exactly two places — the floating tab bar and the onboarding hero card — and both fall back to a flat colour under Reduce Transparency. Routine cards are plain panels. Screens paint a flat background.

**Admin.** Near-flat and tonal: panels on the ground with hairline seams, depth from the `card` → `raised` step. The `card` shadow is theme-aware — black on graphite, a faint warm ink on light paper, never black on light. `card-hover` lifts tappable panels only. The page ground (`.parada-background`) is one flat colour.

**The Panel-Level Shadow Rule.** Only the outermost surface casts a shadow (or frost); nested rows, chips and pills never do.

## Shapes

Both surfaces share the **PARADA cut**: three soft corners plus one sharp corner (top-right), echoing the logo's diagonal cut. Nothing uses a plain uniform rounded rectangle.

- **Mobile** (`radii.ts`): chips, tracks and the plate chip 10; buttons and inputs 14; cards 20; hero cards and sheets 28; the sharp corner 3. Chips, badges, stamps, avatars and the tab bar (radius 32) are full pills. Buttons are cut, never pills.
- **Admin** (`borderRadius`): panel 1.25rem with a 0.1875rem cut; control (buttons, inputs) 0.75rem with a 0.125rem cut; chip 0.5rem. Status pills are full-round.

## Components

### Buttons
One filled button per screen or form (**The One Filled Button Rule**).
- **Mobile** (`Button`): primary / secondary / danger / ghost; 48pt tall (44pt small); cut corners. Primary is a `primary` fill with `onAccent` text, `primaryDeep` when pressed. Press scales to 0.96 and springs back. `loading` shows a busy state and blocks presses.
- **Admin** (`.btn-*`): primary / secondary / ghost / success / danger; 44px tall (36px small); cut corners. Primary is a `brand` fill with `on-accent` text, `brand-hover` on hover, `active:scale-[0.98]`. `Button` takes `loading` and sets `aria-busy`.

### Cards and panels
- **Mobile** `Card`: `surface` fill, hairline border, radius 20 with the cut, 16pt padding; tappable cards spring on press like buttons. `GlassCard` is used only on onboarding.
- **Admin** `.card`: `card` fill, `line` border, panel radius with the cut, theme-aware shadow. `SectionHeader` gives each panel a title rule. `SavedNote` is the inline "Saved." confirmation beside a form's action.

### Status pills, stamps and bars
- **Mobile** `StatusBadge` / `Stamp`: full pills on a `*Soft` fill with `*Ink` text and an icon — "Available" (checkmark), "Few spaces" (alert), "Full" (ban). `CapacityBar` shows occupancy.
- **Admin** `Badge`: tinted pills with a glyph or a status dot; the dot pulses only for a live state. `OccupancyBar` is the one occupancy bar, shared by the dashboard and the zone pages.

### Zone tile (mobile)
`ZoneCard` in the Zones rail: plate-chip zone code, status badge, zone name (two lines max), free-space count and a capacity bar, plus a separate **Details** link. Selected tile: `primary` border on a `primarySoft` fill; screen readers hear it as checked, and the action panel below names the chosen zone. A full zone shows "No spaces available" and cannot be chosen. Values come straight from the backend (`status`, `availability`, `availableCount`) — no invented slot-level occupancy.

### Plate chip (mobile)
`PlateChip`: JetBrains Mono on a `foreground` (ink) or `primarySoft` (soft) fill, radius 10, tracking +1. Plates are always shown in mono.

### Needs attention + facility strip (admin)
`NeedsAttention` lists only things an operator can act on, each row a link to where to act. `FacilityStrip` holds `MetricCard`s — the only figure component in the console. A `MetricCard` shows a label, the figure (tinted red, amber or green only when the value itself means that) and an optional detail line that wraps rather than clips. Cameras read **enabled / disabled**: `ONLINE`/`OFFLINE` is an admin switch, not a heartbeat.

### Navigation
- **Mobile**: a floating pill tab bar (64pt tall, 16pt side margin) on frosted chrome; the active tab is `primaryDeep` with a `primarySoft` pill behind its icon.
- **Admin**: a sidebar with one sliding active-position pill (measured from the active link, and measured again on resize); no per-row background paint. A **Skip to content** link is the first Tab stop. Below `lg` the sidebar is a modal drawer: focus stays inside, Escape closes it, and focus returns to the menu button.

### Empty, loading and error states
- **Mobile** `EmptyState` / `ErrorState`: a plain icon on a soft disc (`Illustration`, hidden from screen readers), a title, one line of explanation and at most one action. `LoadingState` always carries a text label.
- **Admin** `QueryBoundary` renders `LoadingState` (skeleton rows with a label), `ErrorState` (with Retry) or `EmptyState` (an icon scene — a clock on History, a bell on Notifications).

### Forms
Inputs are at least 44px tall, with cut corners and a visible label. On admin, opening a form moves focus to its first field; closing it returns focus to the button that opened it. Mobile radios expose `checked`; segmented controls are 44pt tall.

## Lottie (mascot)

Lottie is PARADA's mascot: a cream poodle in a navy parking-officer cap with a gold P-badge and whistle. Her frames are cut from the owner's 6×3 sprite sheet (magenta background keyed out) — fixed images, never redrawn, recolored or stretched. Four poses ship, all on one 319 × 312 canvas aligned on the cap, so a pose change never shifts her: **calm** (rest), **blink** (eyes closed), **ears** (ears up), **excited** (ears up, sparkles, whistle swung aside).

**Where — these places only:**

| Surface | Place | Greeting beside her | Size |
|---|---|---|---|
| Mobile | Onboarding slide 1 (slides 2–3 keep their topic icons) | "Hi, I'm Lottie." | 160pt |
| Mobile | Login, between the logo and "Welcome back" | "Lottie's on duty." | 112pt |
| Mobile | Now tab, "Nothing planned" card — only while there is no session, reservation or assigned zone | none | 96pt |
| Admin | Login brand panel (`lg` and wider) | "Lottie's on duty." | 168px |

- **Motion:** rises in once on mount, floats gently (4pt over a 4.8s cycle), blinks every 4.2s for 140ms. Under Reduce Motion / `prefers-reduced-motion`: no rise, no float, no blink.
- **Tap (mobile only):** ears → excited → calm, about 1.2s; blinking pauses during the reaction. It still works under Reduce Motion (a pose change, not movement). Admin Lottie is not clickable, so Tab still goes straight to the sign-in form.
- **Accessibility:** decorative — hidden from screen readers. Her name lives only in the visible greeting text.
- **Sizing:** every frame gets an explicit width and height, and the figure clips to its own box. (Stretching the frames with absolute insets alone drew them at their natural 319pt on iOS, over the text.) Keep her at 168 or smaller — the source frames are 319px and blur beyond that.
- **Files:** `apps/mobile/src/components/Lottie.tsx` with `apps/mobile/assets/lottie/` (4 frames); `apps/admin/components/Lottie.tsx` with `apps/admin/public/lottie/` (calm, blink). `apps/mobile/__tests__/decoration.test.tsx` fails if she is added to any other mobile screen.

## Motion

- **Mobile** (`motion.ts`): press feedback 120ms, reveals 220ms, one ease-out curve. Springs for press release (`springPlayful`) and the pass card's stamp landing (`spring`). Onboarding cards fade and slide in when the slide changes. Loops and springs are skipped under Reduce Motion, and the setting is followed live if the user changes it while the app runs.
- **Admin**: `fade-in` (220ms) for content, `saved-fade` for the "Saved." note, `pulse-dot` for a live status dot, `lottie-float` on the login panel. A global `prefers-reduced-motion` rule cuts every animation and transition to near zero.
- Nothing moves just to look alive: no ambient backgrounds, no counting numbers.

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
- **Cameras enabled / disabled**, never online / offline. **Recent alerts**, not "Live alerts".
- Enum values are shown with human labels (`apps/admin/lib/labels.ts`), never raw constants.

## Do's and Don'ts

### Do
- **Do** keep mobile's and admin's brand accents as separate hex values, even while sharing status meanings.
- **Do** draw the PARADA cut on every card, panel, button and input on both surfaces.
- **Do** pair every status with an icon or label — never colour alone.
- **Do** compute every "X of Y" line from real query data; never invent availability, occupancy or slot-level state.
- **Do** let live numbers update in place with the time they were last updated, and say "Live" only while the realtime stream is actually connected.
- **Do** use Lottie's frames unmodified, only in the four places listed under Lottie, and name her only in visible greeting text.
- **Do** read tokens from the theme (`useColors()` on mobile, Tailwind token classes on admin) — never hard-code a hex in a component.

### Don't
- **Don't** default a zone selector to a wrapping vertical card grid — use the horizontal rail.
- **Don't** lay admin figures out as a grid of same-size stat cards, or animate them with a counting tween — use `MetricCard`s in one facility strip.
- **Don't** add ambient decoration: moving backgrounds, gradient meshes, glass on routine cards.
- **Don't** put Lottie in empty or error states, behind content, or on any screen where the driver is mid-task (Zones, History, Account, an active session, reservation or assignment).
- **Don't** claim a state the backend doesn't report — no "online" cameras, no "Live" while reconnecting, no kept space for an assignment.
- **Don't** invert light mode from dark mode; each register is tuned on its own.
- **Don't** collapse admin navigation groups or hide pages behind toggles.
- **Don't** add a second filled accent-coloured button to the same form or screen.
- **Don't** reuse Calamansi UI's signature geometry (the squircle) or its 3D pointer-tilt glare — borrow interaction quality, not their brand mark.

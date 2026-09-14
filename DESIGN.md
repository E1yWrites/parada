---
name: PARADA
description: Your plate is your gate pass. Slate ink on a cool off-white ground, one electric-blue action, one tinted family per parking state.
colors:
  ground: "#F4F6FB"
  surface: "#FFFFFF"
  raised: "#EEF2FA"
  ink: "#0F1B2D"
  slate: "#5B6B82"
  hairline: "#E3E8F1"
  hairline-alpha: "rgba(15, 27, 45, 0.08)"
  electric-blue: "#1E5EFF"
  electric-blue-deep: "#1546C9"
  electric-blue-soft: "#E8EFFF"
  coral: "#D9342F"
  coral-soft: "#FDE9E8"
  mint: "#0B7F4F"
  mint-soft: "#E1F6EC"
  mint-bright: "#17B978"
  amber: "#A35F04"
  amber-soft: "#FFF3DB"
  amber-bright: "#F5A524"
  on-accent: "#FFFFFF"
typography:
  display:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 900
    lineHeight: "44px"
    letterSpacing: "-0.8px"
  hero:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 900
    lineHeight: "36px"
    letterSpacing: "-0.6px"
  title:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: "26px"
    letterSpacing: "-0.3px"
  section:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 800
    lineHeight: "24px"
  body:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "22px"
  caption:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
  micro:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: "14px"
    letterSpacing: "0.8px"
  plate:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "24px"
    letterSpacing: "1.5px"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
rounded:
  plate: "6px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  tab-bar: "32px"
  full: "999px"
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
  button-primary:
    backgroundColor: "{colors.electric-blue}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "48px"
  button-primary-pressed:
    backgroundColor: "{colors.electric-blue-deep}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "48px"
  button-secondary-pressed:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.coral}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "48px"
  button-danger-pressed:
    backgroundColor: "{colors.coral-soft}"
    textColor: "{colors.coral}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.electric-blue}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "48px"
  button-ghost-pressed:
    backgroundColor: "{colors.electric-blue-soft}"
    textColor: "{colors.electric-blue}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  card-tinted:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  pass-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  input-disabled:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.slate}"
  status-pill:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.slate}"
    typography: "{typography.micro}"
    rounded: "{rounded.full}"
    padding: "5px 12px"
  status-pill-available:
    backgroundColor: "{colors.mint-soft}"
    textColor: "{colors.mint}"
  status-pill-low:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber}"
  status-pill-full:
    backgroundColor: "{colors.coral-soft}"
    textColor: "{colors.coral}"
  status-pill-active:
    backgroundColor: "{colors.electric-blue-soft}"
    textColor: "{colors.electric-blue-deep}"
  plate-chip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-accent}"
    typography: "{typography.mono}"
    rounded: "{rounded.plate}"
    padding: "5px 10px"
  plate-chip-soft:
    backgroundColor: "{colors.electric-blue-soft}"
    textColor: "{colors.electric-blue-deep}"
    typography: "{typography.mono}"
    rounded: "{rounded.plate}"
    padding: "5px 10px"
  choice-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  choice-chip-selected:
    backgroundColor: "{colors.electric-blue}"
    textColor: "{colors.on-accent}"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.slate}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  nav-item-active:
    backgroundColor: "{colors.electric-blue-soft}"
    textColor: "{colors.electric-blue-deep}"
---

# Design System: PARADA

## Overview

**Creative North Star: "The Campus Gate Pass"**

PARADA is a zone-based campus parking system with two surfaces in one world: a driver app (Expo/React Native) and an operations console (Next.js). The world is a laminated gate pass: a white card on a cool blue-grey ground, slate ink for everything that is read, one electric-blue action, and the driver's plate set in monospace like the literal thing painted on the gate. Parking state is never inferred from color alone; it is a stamp (icon + label + tinted band) that the backend confirms.

The driver surface leads with one large rounded pass card that states the current state (parked / assigned / reserved / none), and zones read as gate lanes with live counts. The admin surface is a registry, not a dashboard: every editable record is a bounded white panel with a header rule, hairline seams inside, and its save action alone at the end. Both refuse the category defaults (map-with-pins plus slot grid; wall of same-size metric cards; glassy marketing shell).

The build landed darker than the direction contract asked for. The contract named coral #F04E4E, mint #12A66A, amber #E59A0B and radii 12/16/24/32; the shipped status tokens are #D9342F, #0B7F4F, #A35F04, chosen so every status color reaches 4.5:1 as text on white; mobile radii follow the contract (12/16/24/32) while admin keeps 20px panels / 14px controls. This file records the build.

**Key Characteristics:**
- Slate ink (#0F1B2D) on cool off-white (#F4F6FB); pure white surfaces; blue-tinted raised surface for tracks and chips.
- Electric blue is the single brand accent and the one filled action per screen or form.
- Four status families (blue active, mint available, amber low/pending, coral full/danger), each a full-strength text color plus a soft fill, always paired with an icon or dot and a label.
- Nunito 900/800 for headings and hero numbers, Nunito 400-700 for UI; JetBrains Mono strictly for plates, zone codes, camera ids and timestamps.
- Soft ink-tinted offset shadows at panel level only; hairline seams inside panels; frosted chrome limited to the mobile tab bar and pass cards.
- Tabular numerals everywhere; a designed ghost track under every capacity bar.

## Colors

A cool, low-chroma neutral world with one saturated blue and three deep, text-safe status hues; soft tints carry fills, full-strength hues carry text and icons.

### Primary
- **Electric Blue** (`electric-blue`): the brand, the one filled button on a screen or form, the selected choice chip, the active session/assignment status, the link tint, the caret and selection color, the hero wash behind the pass card. Used sparingly so it always means "act here" or "yours right now".
- **Electric Blue Deep** (`electric-blue-deep`): pressed/hover state of the filled button; the text color inside blue-soft pills and soft plate chips.
- **Electric Blue Soft** (`electric-blue-soft`): the tint for active pills, the admin sidebar's active nav pill, selected rows, and the soft plate chip.

### Secondary (status families)
- **Mint** (`mint`, soft `mint-soft`, bright `mint-bright`): available / success / confirmed / online / resolved / dismissed. `mint-bright` is admin-only and used for bar fills and the live-pulse dot, never for text.
- **Amber** (`amber`, soft `amber-soft`, bright `amber-bright`): low availability / pending / warning; also the fee highlight on mobile (same token). `amber-bright` is admin-only bar fill, never text.
- **Coral** (`coral`, soft `coral-soft`): full / danger / violation issued / upheld / open anomaly; the outlined destructive button's text and border.

### Neutral
- **Ground** (`ground`): app and page background. Admin lays two fixed radial washes over it (blue at top-right, mint at bottom-left, ≤10% alpha).
- **Surface** (`surface`): cards, panels, inputs, sidebar rail, sticky table header.
- **Raised** (`raised`): blue-tinted nested surface for capacity tracks, tinted cards, icon tiles, disabled inputs, hover rows, neutral pills.
- **Ink** (`ink`): all primary text; the ink plate chip fill; the shadow tint.
- **Slate** (`slate`): captions, labels, muted status (offline, expired, completed, revoked), inactive nav.
- **Hairline** (`hairline` on admin, `hairline-alpha` on mobile): 1px borders, seams between panel rows, table row dividers, the track border under capacity bars.
- **On Accent** (`on-accent`): text and icons on blue or ink fills.

### Named Rules
**The One Filled Button Rule.** Exactly one filled electric-blue button per screen (mobile) or per form/panel (admin). Every other action is outlined, ghost, or a tinted pill; a second filled blue button on the same surface is a defect.

**The Stamp Rule.** A status is never color alone. Every status pill, badge, and pass-card stamp carries an icon or a dot plus a label, in the family's full-strength hue on its soft fill. Bright variants (`mint-bright`, `amber-bright`) fill bars and dots only.

**The Isolated Destructive Rule.** Destructive actions (Deactivate, Revoke, Delete, Sign out) are outlined coral on white, never filled, and sit apart from the primary action rather than beside it.

## Typography

**Display Font:** Nunito (with system-ui, sans-serif)
**Body Font:** Nunito (with system-ui, sans-serif)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, Menlo, monospace)

**Character:** A friendly rounded grotesque set heavy at the top of the ramp and light in running text, with a strict monospace reserved for data that is literally printed on a gate or a plate. Steps are deliberately far apart (40 / 30 / 20 / 17 / 15 / 13 / 11) so hierarchy reads from across a room.

### Hierarchy
- **Display** (900, 40px, 44px, -0.8px, tabular): hero numbers only: the elapsed clock, the free-space count. Admin's equivalent is the facility-strip figure (900, 28px, leading-none, tracking-tight).
- **Hero** (900, 30px, 36px, -0.6px): screen titles and the pass card's zone name. Admin page titles are 900 at 28px (30px from `sm`), -0.02em.
- **Title** (800, 20px, 26px, -0.3px): card titles (zone name on a lane card, vehicle, session).
- **Section** (800, 17px, 24px): section headers on mobile; admin panel headers are 900 at 16px, tracking-tight.
- **Body** (400 / 600 for `bodySemi`, 15px, 22px): running text and button labels (600). Admin body is 14px (`text-sm`); inputs are 15px at 500.
- **Caption** (500, 13px, 18px, slate): descriptions under titles, timestamps in prose, hints; admin equivalent is 12px slate.
- **Micro** (700, 11px, 14px, +0.8px, UPPERCASE, slate): field labels, data-value labels ("ENTERED", "PARKING FEE"), table column headers, admin nav group labels (11px, +0.08em). Sits above a value or a control, never above a heading.
- **Plate** (JetBrains Mono 700, 18px, 24px, +1.5px, tabular): plate numbers and mono inputs.
- **Mono** (JetBrains Mono 500, 13px, 18px, tabular): zone codes in plate chips, camera ids, occupancy figures, timestamps in tables. Admin plate chips are 12px 700 with +0.08em.

### Named Rules
**The Mono-Is-Data Rule.** JetBrains Mono appears only on identifiers and machine values: plates, zone codes, camera ids, timestamps, counts. Never on labels, headings, or prose.

**The No-Eyebrow Rule.** Headings carry their own weight. Nothing sits above a page title, section header, or panel header. A micro uppercase label may sit above a value, a field, or a column, and the pass card's stamp (icon + micro label in a status hue) may sit above the zone name because it is the card's state, not an introduction.

**The Tabular Figures Rule.** Every number that can change sets in tabular numerals so counters tick in place and columns align.

## Layout

Mobile is a single column on a 4pt grid (2 / 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40). Screen padding is 16px; card padding is 16px, pass-card padding 20px; every tappable control is at least 44pt tall (buttons 48pt, inputs 52pt outer). Zone lane cards run 2-up on wide phones and 1-up on narrow ones. A floating pill tab bar (64px tall, 16px side margin, 10px above the safe-area inset, 32px radius) sits over content; scroll surfaces pad their bottom by `inset + 10 + 64 + 24` so nothing hides behind it.

Admin is a 240px white sidebar rail (`lg` and up; a 288px drawer with a charcoal/40 blurred scrim below `lg`), a sticky 64px header strip (white at 85% with backdrop blur, hairline underneath), and a main column capped at 88rem with 16px padding (24px from `sm`) and 24-32px vertical padding. Page header: title left, one-sentence description under it, actions right, 24px below. The dashboard opens with a single facility strip (one panel, figures separated by seams, 2 columns then 4 at `lg`) rather than a card grid. Tables are dense: header cells 10px/16px padding, body cells 12px/16px, sticky header, hairline row seams, hover tint, no zebra.

## Elevation & Depth

Hybrid, shadow-light. Depth is mostly tonal: white panels on the cool ground, a blue-tinted raised surface for nested tracks and chips, hairline seams inside panels. Shadows are soft, offset, low-opacity, and tinted with ink so cards sit on the ground rather than floating grey. They appear at panel level only; rows, chips, pills and nested surfaces never carry a shadow. The filled primary button and the selected choice chip carry a blue-tinted glow instead of an ink shadow, which is the only place a control casts one. Frost (blur + white overlay) is limited to the mobile tab bar chrome and the pass/hero cards, and both fall back to flat white under Reduce Transparency.

### Shadow Vocabulary
- **Card / panel** (mobile: ink at 7%, offset 0 8, blur 20, Android elevation 3; admin: `0 8px 24px -8px rgba(15,27,45,0.08), 0 1px 2px rgba(15,27,45,0.04)`): every white card and registry panel at rest.
- **Card hover** (admin only: `0 14px 32px -10px rgba(15,27,45,0.14), 0 1px 2px rgba(15,27,45,0.04)`): tappable panels on hover, 200ms.
- **Pill chrome** (mobile: ink at 14%, offset 0 12, blur 28, elevation 10): the floating tab bar only.
- **Primary glow** (mobile: blue at 28%, offset 0 8, blur 16; admin: `0 8px 18px -8px rgba(30,94,255,0.55)`): the one filled button; selected choice chip uses blue at 22%, offset 0 6, blur 12.
- **Focus ring** (admin: `0 0 0 3px rgba(30,94,255,0.25)`; mobile input focus: blue at 18%, blur 6, no offset): keyboard focus and focused inputs.

### Named Rules
**The Panel-Level Shadow Rule.** Only the outermost white surface casts a shadow. Inside it, depth is drawn with hairlines and the raised tint.

## Shapes

Soft and rounded, with larger surfaces earning larger corners: plate chips 6px (the one near-square shape, so a code reads as a stamped plate), chips and tracks 12px, buttons, inputs, choice chips and nav items 16px, cards 24px, pass cards and sheets 32px, the tab bar pill 32px, pills and bars fully round. Borders are 1px hairlines on cards and 1.5px on inputs and choice chips. Admin mirrors the scale as panel 20px (`1.25rem`), control 14px (`0.875rem`), chip 8px (`0.5rem`). The card's optional stamp mark is a 28x4px rounded bar in a status color above the content; the pass card's blue wash is a 260px circle at 16% bleeding off the top-right corner, clipped by the card.

## Components

### Buttons
Confident, quiet, one loud voice per surface.
- **Shape:** rounded control corners (14px); 48pt tall on mobile (44pt for `sm`), 44px on admin (36px for `sm`); 20px horizontal padding, 8px icon gap; label in Nunito 600 15px (admin 700 14px).
- **Primary:** electric-blue fill, white text, blue glow; pressed goes deep blue and scales to 0.98 (admin hover deep blue, active scale 0.98, 150ms).
- **Secondary:** white fill, ink text, hairline border; pressed/hover goes raised.
- **Danger:** white fill, coral text, coral border at 30-35%; pressed/hover goes coral-soft. Never filled.
- **Ghost:** transparent, blue text; pressed/hover goes blue-soft. Admin adds **Success** (mint-soft fill, mint text, hover inverts to mint fill) for confirm-type row actions.
- **Focus / Disabled:** admin focus ring `0 0 0 3px` blue at 25%; disabled at 50% opacity on both surfaces; loading shows a spinner in the label color.

### Chips
- **Plate chip:** identifiers only. Ink fill with white JetBrains Mono, 6px corners (admin 8px), +1px tracking (admin +0.08em); `soft` tone is blue-soft with deep-blue text for secondary rows. The same chip everywhere a zone code, plate, or camera id appears.
- **Choice chip (mobile):** pick-one, all options stay present; 44pt, 14px corners, white with 1.5px hairline; selected is struck forward as blue fill, white text, check icon, blue glow.
- **Segmented filter (admin):** white container with hairline and 4px padding, 14px corners; items 34px tall, slate 700 12px; pressed item is blue-soft with deep-blue text.

### Status pills
- **Style:** fully round, soft fill of the family, full-strength text of the family, 700 at 11-13px, icon 12-14px (admin 14px lucide glyph or a 6px dot) with 4-6px gap; 12px horizontal padding (admin 10px, 26px min height).
- **Families:** available/success mint; low/pending amber; full/danger coral; active/assigned/unread blue; offline/expired/completed/revoked/read neutral (raised + slate). Live states (active session, unread) pulse their dot at 2s.

### Cards / Containers
- **Corner Style:** 24px for mobile cards (20px admin panels); 32px for the pass card.
- **Background:** white; `tinted` variant is raised with no border and no shadow for nested content.
- **Shadow Strategy:** card shadow at rest (see Elevation); admin `card-hover` lifts on hover.
- **Border:** 1px hairline.
- **Internal Padding:** 16px (mobile), 20px on the pass card; admin panel header is 20px/16px with a hairline seam below and a 900 16px title with a 12px slate description.
- **Pass card (mobile signature):** GlassCard at 32px with white frost (blur 50, white overlay 72%) over a status-colored wash (blue for assigned/parked, mint for reserved/recommended); a stamp row (`Stamp` pill: icon + micro label on the status tint, status badge on the right), the zone name at hero size, the plate in `plate` mono, a validity line, and one primary action. The stamp lands with a spring (friction 6, tension 120) from 0.92 to 1; reduced motion skips the spring.
- **Facility strip (admin signature):** one panel holding 2-4 figures (label 700 12px slate, value 900 28px, detail 600 12px) separated by seams, not a row of metric cards.

### Inputs / Fields
- **Style:** micro uppercase label above (slate; blue while focused; coral on error), white field with 1.5px hairline, 16px corners, 16px horizontal padding, 500 weight at 15-16px; mono variant uses the `plate` face for plate entry. Admin selects add a slate chevron; textareas are 128px min.
- **Focus:** border goes blue with a blue glow (mobile) or the 3px blue focus ring (admin); caret and selection are blue.
- **Error / Disabled:** coral border with an alert icon and coral caption (`role=alert`); disabled sits on raised with slate text. Hint text is a slate caption below.

### Navigation
- **Mobile:** floating frosted pill (blur 70, white at 82%, 6% ink hairline, pill shadow), 64px tall, 32px radius; four tabs with 11px labels, blue active tint, slate inactive, blue-soft 10px-radius pill behind the active icon.
- **Admin:** white sidebar rail with the PARADA mark (blue 40px tile with white glyph, 900 wordmark at +0.12em); groups labelled in micro uppercase slate, "Parking Operations" collapsed by default with a rotating chevron; items 40px tall, 14px corners, slate 600 text; active item is blue-soft with deep-blue text, blue icon and a 6px blue dot. Sign out sits in the footer and hovers to coral-soft.

### Capacity bar
A designed ghost track: 8px tall, fully round, raised fill with a hairline border, and a status-colored fill (mint-bright / amber-bright / coral / slate on admin; caller-supplied status token on mobile) whose width is clamped but whose numbers are never altered. Mobile shows "OCCUPANCY" micro label and `occupied of capacity · %` in mono beside it; remaining capacity is drawn as deliberately as the used part.

## Do's and Don'ts

### Do:
- **Do** put exactly one filled electric-blue button on a screen or form; make every other action outlined, ghost, or a pill.
- **Do** set every plate, zone code, camera id, timestamp and count in JetBrains Mono with tabular numerals, and wrap identifiers in the plate chip.
- **Do** pair every status with an icon or dot plus a label on the family's soft fill; use `mint-bright` and `amber-bright` for bar fills and dots only.
- **Do** keep destructive actions outlined coral on white and spaced apart from the primary action.
- **Do** draw the empty part of every capacity bar as a bordered raised track, and show the numbers next to it.
- **Do** cast shadows at panel level only (card shadow at rest, hover lift on admin); separate rows inside a panel with 1px hairlines.
- **Do** keep controls at 44pt or taller, and provide a flat white fallback for every frosted surface and a static fallback for every spring or pulse under reduced motion/transparency.

### Don't:
- **Don't** place a kicker or eyebrow above any heading, page title, section header or panel header; micro uppercase labels belong above values, fields and columns only, and the pass card's stamp is the only sanctioned label above a hero line.
- **Don't** fill a destructive button with coral, or place two filled buttons in one form.
- **Don't** use Nunito for identifiers or JetBrains Mono for labels and prose.
- **Don't** signal state with color alone, or use a status hue outside its family (blue means active/yours, mint available, amber low/pending, coral full/danger).
- **Don't** lay out the dashboard as a grid of same-size metric cards, or the parking screen as a map with pins plus a slot grid.
- **Don't** add shadows to rows, chips, pills or nested surfaces, or frost anything other than the tab bar and pass/hero cards.
- **Don't** zebra-stripe tables or replace the sticky hairline header with a filled band.

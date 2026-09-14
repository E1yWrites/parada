---
version: 1
slug: "apps-mobile"
primary_target: "apps/mobile"
related_targets: []
---

# Surface brief — apps/mobile (driver app)

Scope: whole Expo app (onboarding, auth, Parking, zone detail, Vehicles, Sessions, Account, notifications, violations). Visitor mode: Operate (onboarding leans Persuade but inherits the world).

Audience/job: drivers, one-handed, outdoors; know where there is space, hold/assign a zone, navigate, see session/fees/violations. Proof/content: live backend zone counts, backend-confirmed states. Constraints: preserve test IDs and copy, SecureStore auth, no new native modules, 44pt targets, Reduce Motion/Transparency.

## Direction contract

THESIS: Your plate is your gate pass. The Parking screen leads with one large rounded pass card that states the driver's current parking state (parked / assigned / reserved / none) as a stamped status, and zones read as gate lanes with live counts. Refuses the category default of a map with pins plus a slot grid and the dashboard-of-metric-cards.

OWN-WORLD: Electric blue (#1E5EFF family) as the single brand accent on a cool off-white ground (#F4F6FB) with pure-white cards; coral (#F04E4E) for danger, mint-green (#12A66A) for available/success, amber (#E59A0B) for low/pending, slate ink (#0F1B2D) for text. Nunito (900 display, 700/600 UI, 400 body) + JetBrains Mono only for plates, codes and timestamps. Radii 12/16/24/32; soft offset shadows (0,8,24 @ 8–10%); subtle blue-tinted radial washes behind hero surfaces; status chips as tinted pills with icon+text; square zone-code plate chips; capacity bars with a designed ghost track and tabular numerals. One filled primary button per screen; destructive actions outlined and spaced apart. No eyebrows above headings.

STORY: "I can see where there is space, I hold a lane, I go." The driver understands at a glance whether they are parked/assigned/reserved, believes the counts are live (updated caption + realtime), and acts on one clear primary button.

FIRST VIEWPORT (Parking tab, 390×844): greeting row (small avatar chip + "Parking" title + bell) → the pass card (full width, radius 32, white with blue wash, 1.25:1 aspect) showing state stamp, zone name at hero size, plate in mono, elapsed/valid-until, and one blue primary action (Navigate) → "Zones" section with 2-up lane cards on wide phones / 1-up on narrow, each with code plate chip, availability chip, count bar. Floating pill tab bar stays; it is the blue-tinted frosted chrome.

FORM: Campus gate pass / ID card — candidate 6 of 7 on the ordered list, seed key 95c9f724 (assigned). Raises: hardware-bench (one primary key), console (isolated destructive actions, hairline seams), seven-segment (designed empty track, fixed numeral slots), quote-grammar (literal plate chips), cathode gauze (all vehicles present, chosen one struck forward), cloud edge (color on bands, ink text).

Signature interaction: the pass card's stamp appears with a short spring-scale (0.92→1) when state resolves; live elapsed counter ticks in place; reduced motion disables the spring.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

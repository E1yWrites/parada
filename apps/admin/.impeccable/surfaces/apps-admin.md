---
version: 1
slug: "apps-admin"
primary_target: "apps/admin"
related_targets: []
---

# Surface brief — apps/admin (operations console)

Scope: whole Next.js admin (login, shell, dashboard, zones, zone detail, cameras, sessions, reservations, users, violations, appeals, guest admission, notifications, anomalies, history, analytics, simulator, settings, account). Visitor mode: Operate.

Audience/job: a small operations team at a desk; keep zone/camera/fee/guest/location configuration accurate (owner's priority), monitor live occupancy, review records. Proof/content: backend records. Constraints: Tailwind 3 global classes, lucide icons, test-pinned labels (e.g. "Parking Operations" nav group collapsed by default), keyboard/focus, HttpOnly auth.

## Direction contract

THESIS: A registry, not a dashboard. Configuration panels are the product: every editable record is a clearly bounded white panel with a header rule, hairline seams inside, and its save action alone at the end. Refuses the wall-of-metric-cards dashboard and the glassy marketing shell.

OWN-WORLD: Same electric-blue world as mobile: ground #F4F6FB, white panels, ink #0F1B2D, muted slate #5B6B82, blue #1E5EFF primary, coral/mint/amber statuses. Nunito throughout; tabular numerals; mono for identifiers (plates, camera ids, zone codes) only. Panel radius 20, inner rows separated by 1px seams, shadow only at panel level (0,8,24 @ 6%). Sidebar is a white rail with blue active pill; page titles carry no eyebrow. Tables are dense (py-2.5), sticky header, zebra-free, hover tint. Filled blue button appears once per form.

STORY: The operator sees the facility state in one strip, opens the record they need, edits inside a bounded panel, and sees confirmation next to the action; destructive toggles are isolated.

FIRST VIEWPORT (dashboard, 1440×900): white sidebar rail (240px) with PARADA mark → header strip with live indicator → a single facility strip (capacity/occupied/available/active sessions as inline figures, not four cards) → zone lane table/grid with count bars and camera status → two panels (recent activity, alerts). Zones page: panel list with capacity bars and an isolated Deactivate action; New zone opens an inline panel.

FORM: Registry panels inside the gate-pass world — candidate 6 of 7, seed key 95c9f724 (assigned). Raises: hardware-bench (one primary per form), console (hairline seams, destructive isolation), seven-segment (fixed-slot numerals), quote-grammar (code plate chips), cloud edge (color only on status bands).

Signature interaction: saving a panel shows an inline "Saved" check that fades along the panel's header rule; nav active pill slides between items (reduced-motion safe).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["public/classic/index.html"]
---

Scope: the Owl Compass planner screen (React at `/`, plain JS at `/classic`, same design). Mode: operate.
Audience: Temple undergrads around Spring 2027 registration, phone or laptop. Job: pick GenEd + major electives by the skills they want, get a rule-checked plan.

## Direction contract
THESIS: The category-standard three-column planner (filters, results, plan), clean and calm, with Temple tabling-season pop held to three moves. Refuses the generic gray course-search look and refuses flyer-wall clutter.
OWN-WORLD: White ground and ink #161616, gray panels; a Solar-Yellow #FFE600 header band; each GenEd area owns one photocopy-bright paper color used only as a 4px row edge, its label chip, and its tab; Temple cherry #9D2235 for primary actions and focus. Bold condensed poster grotesk for headings only, plain legible UI sans for everything else.
STORY: The student types a goal in their own words, sees it turned into weighted skills, scans real courses per requirement with the catalog sentence that proves each skill, and builds a plan the Bulletin rules check as they go.
FIRST VIEWPORT: Yellow header band with name, goal input + "Find courses", major select. Left rail: skill weights (0-3 dots, live re-rank) and filters (Spring 2027 only). Center: results grouped by GenEd area, each row with area edge color, code + title, credits, skill dots, one-line summary, evidence quote, Spring 2027 sections, tear-off tab button. Right: "My plan" tray of collected tabs, progress n of 11, rule checks with hairline Bulletin citations.
FORM: Fused direction: canon structure + Tabling Wall pop (assigned direction rank 6, user-requested mix of assigned + canon). Seed key 7a2bacf2. Signature interaction: the tear-off tab (perforated tab tears off and drops into the plan tray; reduced motion = instant).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

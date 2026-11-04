# Tasks — Owl Compass

**About:** Team 22's Temple AI Build Challenge entry. GenEd courses and major electives ranked by the skills a student wants, with Bulletin-cited rule checks. Prod: https://owl-compass.vercel.app

## Active
- **P1 / Due Tue Nov 3** — Checkup 2 email to shiv.hiremath@temple.edu: the prototype link plus the AI tools list:
  - Claude Code (Opus 5.5) to build it
  - Claude Opus 5.5 to tag skills
  - Claude Sonnet 5.5 for live goal reading and explanations (switched from Haiku 5.5 on Nov 3 after a side-by-side test)
  - Claude chat for the problem statement
- **P1** — Team decides: React (`/`) or plain (`/classic`); delete the other.
- **P2** — Audit 40 random skill tags by hand to get a tag-accuracy number for the Responsible AI slide.
- **P2** — Impeccable finish: send the screenshots in `.impeccable/review/` to the finish reviewer, then write DESIGN.md.
- **P3** — Electrical Engineering technical electives are unverified (the Bulletin doesn't list them); ask ECE.
- **P3** — Some GenEds exclude certain majors ("Field of Study Restrictions" in the description, e.g. ECE 0832 for CS and EE). The ranking ignores this; it's mostly hidden today by the CS and EE waivers.

## Resolved
- 2026-11-03 — Live seats: each Spring 2027 course card has a "Live seats & times" toggle that calls `/api/sections`, which reads Temple's public Banner class search (CRN, times, room, instructor, seats, waitlist; open sections first; 60 s CDN cache). If Banner fails, the card shows the scraped times. Checked in both versions, live and with Banner forced to fail. Also: "Filled up last spring" label (98%+ of seats taken at the end of Spring 2026, 86 of 276 courses; `scrape.py --last-spring`), and a shareable Sheet of the fill rates for teammates (`exports/spring-2026-fill-rates.csv`).
- 2026-11-03 — Skills a student sets by hand now win over Claude's picks, and the "We heard" box names the skills Claude set. This came from Ethan asking whether auto-picked skills were intended.
  - A new goal keeps hand-set skills, even one clicked while the goal is being read; "Clear skills" lets the goal pick again.
  - New mocked check 16/16 on both pages, locally and live; the earlier 16 still pass; one real live search shows the new line.
- 2026-11-03 — Final code check: 9 of 10 findings fixed, checked locally and live, and pushed.
  - A second Enter while a goal is being read no longer starts another paid AI call.
  - A major change keeps the GenEd picks on screen and re-ranks only the electives.
  - AI calls share a 25 s deadline, so a stuck call ends in "AI is busy" before Vercel's 30 s cutoff.
  - Claude sees only GenEds that can show; ENG 0812 (ESL) never could.
  - A code Claude lists twice keeps its best fit, and the React page reads the current skills and Spring filter when a reply lands.
  - `scrape.py --schedule` replaces the major subjects' sections instead of merging them.
  - Skipped: logic shared by `/` and `/classic` stays duplicated until the team picks one.
- 2026-11-03 — The goal now ranks courses itself, so skills are optional. Ethan reported that "I want to do AI" showed nothing once skills were empty, and that clicking skills overrode the goal.
  - `/api/interpret` returns which courses are about the goal (fit), ranked above skill matches.
  - Switched Haiku 5.5 to Sonnet 5.5 after a side-by-side test. Judged precision on 12 goals went from 41% to 66% relevant, and from 25% to 4% irrelevant.
  - Cross-listed and Honors copies collapse to one row (`tools/twins.py`).
  - Required Writing and IH courses always show.
  - Electives have real Spring 2027 data (`scrape.py --schedule`) and follow the Spring filter.
  - Reload no longer wipes the plan, and errors read clearly.
  - Two adversarial QA and review rounds; deployed, verified live, and pushed to GitHub.
- 2026-11-02 — First draft: scraper (Bulletin + Spring 2027 schedule), 482 courses tagged by Opus 5.5 with verbatim-quote check (4 tags dropped), Haiku endpoints, two front ends, rule tests (4 pass), deployed.

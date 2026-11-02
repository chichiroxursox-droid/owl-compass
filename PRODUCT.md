# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Two front ends over one shared core, at Ethan's request ("build both", 2026-11-02): a Next.js 15 + React 19 app at `/`, and a plain HTML/CSS/JS version at `/classic` in the Claim Check style (no build step). Both read the same `public/data/*.json`, share the ranking and GenEd-rule modules in `public/core/` and the stylesheet `public/owl.css`, and call the same two API routes on Vercel (team chiethan). The data pipeline is Python scripts in `tools/` (requests + BeautifulSoup) plus a Node script that tags courses with the Anthropic SDK.

## Users

- **Primary:** Temple undergraduates choosing GenEd courses and major electives, especially first-year, undeclared, transfer and first-generation students, on a phone or laptop around registration (Spring 2027 registration runs in November). Their job: find courses that count for what they still need and that build skills they actually care about.
- **Secondary:** academic advisors, whose limited time goes to routine "what counts for what" questions.
- **Evaluators right now:** judges at the Temple AI Build Challenge (demo Fri Nov 6, 2026; a 3–4 minute talk) and Team 22 itself.

## Product Purpose

Owl Compass reorganizes Temple's GenEd and major-elective catalog around the skills each course builds. A student names their major and what they want to get better at, in their own words or by picking skills, and sees:
- real courses for each requirement they still need
- the skills each course builds, with the catalog sentence that shows it
- when each course is offered next
- a plan that checks the GenEd rules as they go

Success means students choose courses on purpose instead of by time slot, waste fewer credits, and arrive at advising with a plan.

## Positioning

The Bulletin and the Class Schedule are organized by requirement code and section number; Owl Compass is organized by what you learn. Every skill tag carries a quote from the official course description, every rule cites the Bulletin, and the advisor keeps the final word.

## Operating Context

- Public data only: the Temple Undergraduate Bulletin (course descriptions, GenEd rules, major requirements) and Temple's public Class Schedule. Each snapshot is dated and every course links back to its official page.
- AI:
  - Claude Opus 5.5 tags each course once, adding its skills, an evidence quote and a plain-language summary, which the team can review.
  - Claude Haiku 5.5 runs live, turning a student's goal into a skill profile and explaining the picks.
  - Ordinary code, not AI, ranks courses and enforces the requirement rules.
- No accounts, no student records, no DARS (Temple's degree audit tool). A plan lives only in that browser.
- Rate My Professors: a link out per instructor; no RMP data is copied into the app.

## Capabilities and Constraints

- Majors in the first draft: Management Information Systems (BBA), Marketing (BBA), Electrical Engineering (BSEE), Computer Science (BS), and Undeclared / exploring.
- About 16 concrete skills, grouped under the NACE (National Association of Colleges and Employers) career-readiness competencies.
- GenEd rules are enforced in code, each with its Bulletin citation (see `public/data/areas.json`).
- Out of scope for now: transfer, AP and test credit (including CCP equivalencies), DARS, difficulty ratings, other majors.
- Course evaluation results (Student Feedback Forms) aren't public and no difficulty data exists, so none is shown.

## Brand Commitments

- Name: **Owl Compass**.
- A student project for Temple students, not an official Temple University tool; the footer says so. Temple's logo and wordmark are not used.

## Evidence on Hand

- Team 22's Checkup 1 problem statement (sent Oct 30, 2026).
- Kickoff slides with judging weights and required deck slides (`../laundry-radar/Temple-AI-Build-Challenge-kickoff-slides.pdf`).
- The data snapshot in `public/data/` (sources and dates in `meta.json`).
- Absent, and not to be invented: student survey results for this idea (the team is gathering input this week), usage numbers, advisor endorsements, testimonials. Tag-accuracy figures exist only once the tag audit has run.

## Product Principles

1. Skills first, codes second. Lead with what a student will be able to do; requirement codes are labels, not the organizing idea.
2. Prove every claim. Each skill tag shows the catalog sentence it came from; each rule links to the Bulletin.
3. AI interprets and explains; code decides what counts. Ranking and requirement checks are deterministic and testable.
4. The advisor has the final word. Owl Compass prepares a student for advising and never replaces it.
5. Nothing personal is kept. Only the goal text leaves the browser, and it isn't stored.

## Accessibility & Inclusion

Works on a phone from 360 px wide; every control reachable by keyboard; color is never the only signal; WCAG AA contrast; plain-language copy written for first-generation students; reduced motion respected.

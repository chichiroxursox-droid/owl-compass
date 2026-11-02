# Owl Compass

**Pick GenEds on purpose.** A Temple student types what they want to get better at ("UX design and presenting"), picks a major, and sees real GenEd courses and major electives ranked by the skills they build. Every skill tag quotes the official catalog, Spring 2027 sections are shown, and a plan tray checks the Bulletin's GenEd rules as you add courses.

Team 22 · Temple AI Build Challenge (Student Success and Wellbeing track). A student project, not an official Temple tool.

## Two versions, same app
- `/` is the React / Next.js version (`app/page.tsx`).
- `/classic` is plain HTML + JavaScript (`public/classic/`).

Both share the course data (`public/data/`), the ranking and rule logic (`public/core/compass.mjs`, with tests), the stylesheet (`public/owl.css`) and the two AI endpoints.

## Where AI is used, and where it isn't
| Step | Who does it |
|---|---|
| Tag each course with skills, quoting its description (once, offline) | Claude Opus 5.5, `tools/tag_skills.mjs`. A tag whose quote isn't found word for word in the description is thrown out. |
| Turn a student's goal into weighted skills (live) | Claude Haiku 5.5, `app/api/interpret` |
| Explain "why this fits you" for the top picks (live) | Claude Haiku 5.5, `app/api/explain`. Only course codes we sent it can come back. |
| Rank courses and check GenEd rules | Plain code, not AI (`public/core/compass.mjs`, `npm test`) |

## Data (public sources only)
- The Temple Undergraduate Bulletin 2026–27: GenEd area lists, course descriptions and major requirements.
- Temple's public Spring 2027 class schedule.

`python3 tools/scrape.py` refreshes the data, and then `node --env-file=.env tools/tag_skills.mjs` re-tags it (about $5). Rate My Professors is only linked, never copied. No student data is stored; a plan stays in your own browser.

## Run it
`npm install`, put `ANTHROPIC_API_KEY=...` in `.env`, then `npm run dev`.

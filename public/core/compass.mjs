// Shared core for both front ends (React at /, plain JS at /classic). No dependencies, no DOM.

// Score = sum over the student's weighted skills of the course's tag strength (1-3).
// weights: { skillId: 1|2|3 }
export function score(course, weights) {
  let s = 0;
  for (const t of course.skills) s += (weights[t.id] || 0) * t.strength;
  return s;
}

// 0-3 dots: a fixed ramp relative to the best possible match for these weights.
export function dots(course, weights) {
  const max = Object.values(weights).reduce((a, w) => a + w * 3, 0) || 1;
  const r = score(course, weights) / max;
  return r === 0 ? 0 : r < 0.2 ? 1 : r < 0.4 ? 2 : 3;
}

// Copies of one course (cross-listings, Honors versions) share a "twin" id written by tools/twins.py.
/** @param {any} c */
export const copyKey = (c) => c.twin || c.code;
// A GenEd title several departments teach differently (World Society in Literature & Film) still shows once.
/** @param {any} c */
const titleKey = (c) => (c.area ? c.area + "|" + c.title.toLowerCase().replace(/&/g, "and").replace(/^honors:?\s*/, "").replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "") : c.code);

// fit: { code: 2-3 }, how squarely a course is about the student's goal (from /api/interpret).
// The goal reader names one copy of a course; every copy gets the best fit any copy got.
/** @param {any[]} courses @param {Record<string, number>} fit @returns {Record<string, number>} */
export function spreadFit(courses, fit) {
  /** @type {Record<string, number>} */
  const best = {};
  for (const c of courses) if (fit[c.code]) best[copyKey(c)] = Math.max(best[copyKey(c)] || 0, fit[c.code]);
  return Object.fromEntries(courses.filter((c) => best[copyKey(c)]).map((c) => [c.code, best[copyKey(c)]]));
}

// Re-reading the same goal for a new major changes only the elective picks. The GenEd picks on screen stay rather
// than reshuffle with the model's run-to-run variation.
/** @param {any[]} courses @param {Record<string, number>} shown @param {Record<string, number>} fresh @returns {Record<string, number>} */
export function rereadFit(courses, shown, fresh) {
  const gen = new Set(courses.filter((c) => c.area).map((c) => c.code));
  return Object.fromEntries([...Object.entries(shown).filter(([k]) => gen.has(k)), ...Object.entries(fresh).filter(([k]) => !gen.has(k))]);
}

// Courses about the goal first, then by skill score: fit x 100 beats any skill score (max 4 tags x 3 x 3 = 36).
// keepAll: show score-0 courses too.
/** @param {any[]} list @param {Record<string, number>} weights @param {Record<string, number>} fit @param {number} per @param {boolean} [keepAll] */
function top(list, weights, fit, per, keepAll = false) {
  // The copy a student can most likely take: offered Spring 2027, then open to all (not Honors), then the twin id's copy.
  const pref = (/** @type {any} */ c) => (c.spring ? 4 : 0) + (c.honors || /^honors/i.test(c.title) ? 0 : 2) + (c.code === c.twin ? 1 : 0);
  // Copies are tagged separately, so a course scores as its best copy, shown as its most takeable copy.
  /** @type {Map<string, {c: any, s: number}>} */
  const copies = new Map();
  for (const c of list) {
    const s = (fit[c.code] || 0) * 100 + score(c, weights), g = copies.get(copyKey(c));
    if (!g) copies.set(copyKey(c), { c, s });
    else { g.s = Math.max(g.s, s); if (pref(c) > pref(g.c)) g.c = c; }
  }
  // Different courses sharing a title (World Society in Literature & Film) show once, as the one that matches best.
  /** @type {Map<string, {c: any, s: number}>} */
  const titles = new Map();
  for (const x of copies.values()) {
    const y = titles.get(titleKey(x.c));
    if (!y || x.s > y.s || (x.s === y.s && pref(x.c) > pref(y.c))) titles.set(titleKey(x.c), x);
  }
  return [...titles.values()]
    .filter((x) => keepAll || x.s > 0)
    .sort((x, y) => y.s - x.s || pref(y.c) - pref(x.c))
    .slice(0, per)
    .map((x) => x.c);
}

// The GenEd courses that can show (also what /api/interpret shows Claude). A fixed area (Writing, IH I, IH II) names
// the one course everyone takes, so its other courses (ENG 0812, the ESL version) never show.
/** @param {any[]} courses @param {any[]} areas @returns {any[]} */
export function genEdPool(courses, areas) {
  const fixed = Object.fromEntries(areas.filter((a) => a.fixed).map((a) => [a.id, a.fixed]));
  return courses.filter((c) => c.area && (!fixed[c.area] || copyKey(c) === fixed[c.area] || c.code === fixed[c.area]));
}

// Top courses per GenEd area, honoring "Offered Spring 2027" and the major's waivers. A fixed area's course shows
// whatever the goal or skills.
/** @param {any[]} courses @param {any[]} areas @param {Record<string, number>} weights @param {{springOnly?: boolean, waives?: string[], per?: number, fit?: Record<string, number>}} [opts] @returns {Record<string, any>} */
export function rankByArea(courses, areas, weights, { springOnly = false, waives = [], per = 4, fit = {} } = {}) {
  const pool = genEdPool(courses, areas);
  const out = {};
  for (const a of areas) {
    const list = pool.filter((c) => c.area === a.id && (!springOnly || c.spring));
    out[a.id] = waives.includes(a.id)
      ? { waived: true, courses: [] }
      : { waived: false, courses: a.fixed ? top(list, {}, {}, 1, true) : top(list, weights, fit, per) };
  }
  return out;
}

// The courses a major's elective list draws from (also what /api/interpret shows Claude for that major).
/** @param {any[]} courses @param {any} major @returns {any[]} */
export function majorPool(courses, major) {
  if (!major?.electiveSubjects?.length) return [];
  const list = major.electiveList ? new Set(major.electiveList) : null;
  return courses.filter((c) => !c.area && major.electiveSubjects.includes(c.subject) && (!list || list.has(c.code)));
}

/** @param {any[]} courses @param {any} major @param {Record<string, number>} weights @param {{per?: number, fit?: Record<string, number>, springOnly?: boolean}} [opts] @returns {any[]} */
export function rankElectives(courses, major, weights, { per = 6, fit = {}, springOnly = false } = {}) {
  return top(majorPool(courses, major).filter((c) => !springOnly || c.spring), weights, fit, per);
}

// Check a plan against the Bulletin's GenEd rules. plan: [{ code, area, subject }]
// Returns { filled: {areaId: n}, done, total, issues: [{ rule, message, codes }] }
/** @param {any[]} plan @param {any[]} areas @param {string[]} [waives] */
export function checkPlan(plan, areas, waives = []) {
  const filled = {};
  const issues = [];
  const breadth = new Set(areas.filter((a) => a.kind === "breadth").map((a) => a.id));
  for (const p of plan) if (p.area) filled[p.area] = (filled[p.area] || 0) + 1;
  for (const a of areas) {
    if ((filled[a.id] || 0) > a.slots) {
      issues.push({ rule: "one-area", message: `${a.short} needs only ${a.slots === 1 ? "one course" : `${a.slots} courses`}; the extra won't count toward another area.`, codes: plan.filter((p) => p.area === a.id).map((p) => p.code) });
    }
    if (waives.includes(a.id) && filled[a.id]) {
      issues.push({ rule: "waived", message: `Your major already covers ${a.short}, so this course won't be needed for GenEd.`, codes: plan.filter((p) => p.area === a.id).map((p) => p.code) });
    }
  }
  const byDept = {};
  for (const p of plan) if (breadth.has(p.area)) (byDept[p.subject] ||= []).push(p.code);
  for (const [dept, codes] of Object.entries(byDept)) {
    if (codes.length > 2) issues.push({ rule: "dept-limit", message: `${codes.length} Breadth courses from ${dept}; only two from one department count.`, codes });
  }
  const need = areas.filter((a) => !waives.includes(a.id));
  const total = need.reduce((n, a) => n + a.slots, 0);
  const done = need.reduce((n, a) => n + Math.min(filled[a.id] || 0, a.slots), 0);
  return { filled, done, total, issues };
}

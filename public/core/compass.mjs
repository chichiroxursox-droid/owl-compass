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

// Top courses per GenEd area, honoring "Offered Spring 2027" and the major's waivers.
/** @param {any[]} courses @param {any[]} areas @param {Record<string, number>} weights @param {{springOnly?: boolean, waives?: string[], per?: number}} [opts] @returns {Record<string, any>} */
export function rankByArea(courses, areas, weights, { springOnly = false, waives = [], per = 4 } = {}) {
  const out = {};
  for (const a of areas) {
    if (waives.includes(a.id)) { out[a.id] = { waived: true, courses: [] }; continue; }
    out[a.id] = {
      waived: false,
      courses: courses
        .filter((c) => c.area === a.id && (!springOnly || c.spring))
        .map((c) => ({ c, s: score(c, weights) }))
        .filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s || (y.c.spring ? 1 : 0) - (x.c.spring ? 1 : 0))
        .slice(0, per)
        .map((x) => x.c),
    };
  }
  return out;
}

/** @param {any[]} courses @param {any} major @param {Record<string, number>} weights @param {number} [per] @returns {any[]} */
export function rankElectives(courses, major, weights, per = 6) {
  if (!major?.electiveSubjects?.length) return [];
  const list = major.electiveList ? new Set(major.electiveList) : null;
  return courses
    .filter((c) => !c.area && major.electiveSubjects.includes(c.subject) && (!list || list.has(c.code)))
    .map((c) => ({ c, s: score(c, weights) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, per)
    .map((x) => x.c);
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

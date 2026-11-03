import { rankByArea, rankElectives, rereadFit, checkPlan, dots } from "/core/compass.mjs";

const RMP = (name) => `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(name + " Temple University")}`;
const RULE_URL = "https://bulletin.temple.edu/undergraduate/general-education/";
const EXAMPLES = ["I want to get into UX design and get better at presenting", "Pre-law: I need to argue and write well", "I want to understand people and data for marketing"];
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "") ?? d; } catch { return d; } };
// Escape anything from data/API before it goes into an HTML string.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// fit: code -> 2-3, how squarely a course is about the goal (from /api/interpret)
// asked: the goal as submitted; a major change re-reads this, not the box. readFor: the goal the shown reading belongs to.
const S = { data: null, goal: "", asked: "", readFor: "", skillsFrom: "hand", majorId: "undeclared", weights: {}, fit: {}, springOnly: true, plan: [], readBack: "", reasons: {}, busy: false, error: "", tearing: "" };
const app = document.getElementById("app");
let $rail, $main, $tray, $goal, $btn, $major;
let seq = 0; // only the latest search may update the page
let heard = ""; // the reading last rendered, so only a new one scrolls into view

Promise.all(["courses", "skills", "rules", "majors"].map((f) => fetch(`/data/${f}.json`).then((r) => r.json()))).then(([c, s, r, m]) => {
  S.data = { courses: c.courses, skills: s.skills, areas: r.areas, rules: r.rules, majors: m.majors, source: r.edition, term: c.term, scraped: c.scraped_at };
  S.plan = load("oc-plan", []);
  S.majorId = load("oc-major", "undeclared");
  init();
});

const derived = () => {
  const { data, weights, fit, springOnly } = S;
  const major = data.majors.find((m) => m.id === S.majorId);
  const waives = major?.waives || [];
  const hasWeights = Object.values(weights).some(Boolean);
  const hasGoal = Object.keys(fit).length > 0;
  const active = hasWeights || hasGoal;
  const ranked = active ? rankByArea(data.courses, data.areas, weights, { springOnly, waives, fit }) : {};
  // The same ranking without the Spring filter, so a note can say when the filter hides what matches.
  const rankedAll = active && springOnly ? rankByArea(data.courses, data.areas, weights, { waives, fit }) : ranked;
  const electives = active ? rankElectives(data.courses, major, weights, { fit, springOnly }) : [];
  const check = checkPlan(S.plan.filter((p) => p.area), data.areas, waives);
  return { major, waives, hasWeights, hasGoal, active, ranked, rankedAll, electives, check };
};

function init() {
  const { data } = S;
  app.innerHTML = `
    <header class="band"><div class="band-in">
      <h1 class="brand">Owl Compass<small>GenEd by the skills you want</small></h1>
      <form class="goal">
        <label class="sr" for="goal">What do you want to get better at?</label>
        <input id="goal" maxlength="400" placeholder="What do you want to get better at? e.g. presenting, data, design…">
        <button class="btn">Find courses</button>
      </form>
      <label class="sr" for="major">Your major</label>
      <select id="major" class="major">${data.majors.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")}</select>
    </div></header>
    <div class="shell">
      <aside class="rail" aria-label="Skills and filters"></aside>
      <main class="main"></main>
      <aside class="tray" aria-label="My plan"></aside>
    </div>
    <footer class="foot">Student project by Temple AI Build Challenge Team 22 · not an official Temple University tool. Data: ${esc(data.source)} and the public Spring 2027 class schedule (as of ${esc(data.scraped)}). Skill tags written by Claude from each course's official description; hover a tag to see the sentence it came from. Your goal text is sent to Claude to read it and is never stored. <a href="/">React version</a></footer>`;
  $rail = app.querySelector(".rail"); $main = app.querySelector(".main"); $tray = app.querySelector(".tray");
  $goal = app.querySelector("#goal"); $btn = app.querySelector(".goal .btn"); $major = app.querySelector("#major");
  $major.value = S.majorId;
  $goal.addEventListener("input", () => { S.goal = $goal.value; });
  app.querySelector(".goal").addEventListener("submit", (e) => { e.preventDefault(); find(); });
  $major.addEventListener("change", () => { S.majorId = $major.value; render(); if (S.asked) find(S.asked, S.majorId, true); });
  $rail.addEventListener("click", onRailClick);
  $rail.addEventListener("change", (e) => { if (e.target.matches("[data-spring]")) { S.springOnly = e.target.checked; render(); } });
  $main.addEventListener("click", onMainClick);
  // Removing a plan item removes the focused button, so focus moves to the plan's heading.
  $tray.addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { S.plan = S.plan.filter((p) => p.code !== b.dataset.rm); render(); $tray.querySelector("#plan-h")?.focus(); } });
  render();
}

function onRailClick(e) {
  const b = e.target.closest("[data-w]");
  if (b) {
    const [id, w] = [b.dataset.id, +b.dataset.w];
    S.weights = { ...S.weights, [id]: S.weights[id] === w ? w - 1 : w }; S.skillsFrom = "hand";
    return render();
  }
  if (e.target.closest("[data-clear]")) { S.weights = {}; S.skillsFrom = "hand"; render(); $rail.querySelector(".weight button")?.focus(); }
}

function onMainClick(e) {
  const ex = e.target.closest("[data-example]");
  if (ex) { e.preventDefault(); find(ex.dataset.example); return $goal.focus(); }
  if (e.target.closest("[data-clear-goal]")) return clearGoal();
  const t = e.target.closest("[data-take]");
  if (t) take(S.data.courses.find((c) => c.code === t.dataset.take));
}

// reread: the same goal for a newly chosen major. It keeps the box as typed, and when the shown reading is of this
// goal it keeps the skills (the student may have changed them) and the GenEd picks; a newer goal gets its own.
async function find(text = S.goal, mid = S.majorId, reread = false) {
  // A second press while the same goal is being read does nothing; each read is a paid AI call.
  if (!text.trim() || (S.busy && !reread && text === S.asked)) return;
  const keep = reread && S.readFor === text;
  const n = ++seq;
  if (!reread) { S.goal = text; $goal.value = text; }
  S.asked = text; S.busy = true; S.error = ""; S.reasons = {}; render();
  try {
    const r = await fetch("/api/interpret", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal: text, major: mid }), signal: AbortSignal.timeout(30000) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (n !== seq) return;
    if (!r?.ok || !j?.weights) throw new Error(j?.error || "Couldn't reach the AI. Check your connection, or pick skills by hand.");
    const f = keep ? rereadFit(S.data.courses, S.fit, j.fit || {}) : j.fit || {}, w = keep ? S.weights : j.weights;
    if (!keep) { S.weights = w; S.skillsFrom = "goal"; }
    S.fit = f; S.readBack = j.readBack; S.readFor = text;
    // Explain only courses about the goal: the top one per area (not the required ones) and the top major electives.
    const m = S.data.majors.find((x) => x.id === mid);
    const tops = [...Object.values(rankByArea(S.data.courses, S.data.areas.filter((a) => !a.fixed), w, { springOnly: S.springOnly, waives: m?.waives || [], per: 1, fit: f })).flatMap((a) => a.courses), ...rankElectives(S.data.courses, m, w, { per: 2, fit: f, springOnly: S.springOnly })];
    const codes = tops.filter((c) => f[c.code]).sort((a, b) => f[b.code] - f[a.code]).map((c) => c.code).slice(0, 10);
    if (codes.length) fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal: text, codes }) })
      .then((x) => x.json()).then((x) => { if (n === seq) { S.reasons = x.reasons || {}; render(); } }).catch(() => {});
  } catch (e) { if (n === seq) S.error = e.message; }
  finally { if (n === seq) { S.busy = false; render(); } }
}

function clearGoal() { seq++; S.fit = {}; S.readBack = ""; S.readFor = ""; S.reasons = {}; S.asked = ""; S.error = ""; S.busy = false; render(); $goal.focus(); }

function take(c) {
  if (S.plan.some((p) => p.code === c.code)) { S.plan = S.plan.filter((p) => p.code !== c.code); return render(); }
  S.tearing = c.code; render();
  setTimeout(() => { if (!S.plan.some((p) => p.code === c.code)) S.plan = [...S.plan, c]; S.tearing = ""; render(); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420);
}

const dotsHtml = (n) => [1, 2, 3].map((i) => `<i${i <= n ? ' class="f"' : ""}></i>`).join("");

function row(c) {
  const d = dots(c, S.weights);
  const f = S.fit[c.code] || 0;
  const taken = S.plan.some((p) => p.code === c.code);
  const top = c.skills.find((s) => S.weights[s.id]) || c.skills[0];
  const skillById = Object.fromEntries(S.data.skills.map((s) => [s.id, s]));
  const sp = c.spring;
  return `<article class="row"><div>
    <div class="row-top"><span class="code">${esc(c.code)}</span><h3 class="title"><a href="${esc(c.url)}" target="_blank" rel="noreferrer">${esc(c.title)}</a></h3>${f ? `<span class="fit">About your goal</span>` : ""}</div>
    <div class="facts">
      <span class="num">${esc(c.credits)} credits</span>
      ${sp ? `<span>Spring 2027 · <span class="num">${esc(sp.sections)}</span> section${sp.sections > 1 ? "s" : ""}${sp.online ? `, ${esc(sp.online)} online` : ""}</span>` : `<span class="no">Not on the Spring 2027 schedule</span>`}
      ${sp?.instructors[0] ? `<a href="${esc(RMP(sp.instructors[0]))}" target="_blank" rel="noreferrer">Look up ${esc(sp.instructors[0])} on Rate My Professors</a>` : ""}
    </div>
    <p class="summary">${esc(c.summary)}</p>
    ${S.reasons[c.code] ? `<p class="why"><span class="sr">Why for you, written by AI: </span>${esc(S.reasons[c.code])}</p>` : ""}
    <div class="tags">${c.skills.map((s) => `<span class="tag${S.weights[s.id] ? " on" : ""}" title="${esc(`From the catalog: "${s.evidence}"`)}">${esc(skillById[s.id]?.label)}<span class="dots" aria-label="strength ${s.strength} of 3">${dotsHtml(s.strength)}</span></span>`).join("")}</div>
    ${top ? `<p class="quote">Catalog: <q>${esc(top.evidence)}</q></p>` : ""}
  </div>
  <div class="match">
    <button class="tab${S.tearing === c.code ? " tearing" : ""}" style="--tab: var(--a-${esc(c.area || "el")})" aria-pressed="${taken}" data-take="${esc(c.code)}" data-f="take-${esc(c.code)}" aria-label="${taken ? "Remove" : "Add"} ${esc(c.code)} ${taken ? "from" : "to"} plan">
      <span class="vert">${taken ? "In plan" : "Take a tab"}</span><span>${esc(c.code)}</span>
    </button>
    <span>Skills <span class="dots" aria-label="skill match ${d} of 3">${dotsHtml(d)}</span></span>
  </div></article>`;
}

function render() {
  const { data } = S;
  const { major, waives, hasWeights, hasGoal, active, ranked, rankedAll, electives, check } = derived();
  const f = document.activeElement?.dataset?.f; // keep keyboard focus across re-renders
  const ruleQuote = (id) => data.rules.find((r) => r.id === id)?.quote;
  // Said only once a reading has landed; `all` is the same list without the Spring filter.
  const offGoal = (list, all) => (S.readFor && !S.busy && !list.some((c) => S.fit[c.code])
    ? `<p class="note">${all?.some((c) => S.fit[c.code]) ? "The courses here about your goal aren't on the Spring 2027 schedule. Turn off “Offered Spring 2027” to see them." : "Nothing here is about your goal, so these are ranked by your skills."}</p>` : "");

  $btn.classList.toggle("busy", S.busy); $btn.textContent = S.busy ? "Reading…" : "Find courses";

  $rail.innerHTML = `
    <h2 class="h">Your skills</h2>
    <p class="note">${S.readBack && hasWeights && S.skillsFrom === "goal" ? `Your goal set these. Change them to re-order${hasGoal ? "; courses about your goal stay on top" : ""}.` : "Set how much each matters. Courses re-rank as you go."}</p>
    ${data.skills.map((s) => `<div class="skill"><label id="sk-${esc(s.id)}" title="${esc(s.hint)}">${esc(s.label)}</label>
      <span class="weight" role="group" aria-labelledby="sk-${esc(s.id)}">${[1, 2, 3].map((w) => `<button data-id="${esc(s.id)}" data-w="${w}" data-f="w-${esc(s.id)}-${w}" aria-pressed="${(S.weights[s.id] || 0) >= w}" aria-label="${esc(s.label)}: ${w} of 3"><span></span></button>`).join("")}</span></div>`).join("")}
    <h3 class="h">Filters</h3>
    <label class="check"><input type="checkbox" data-spring data-f="spring"${S.springOnly ? " checked" : ""}>Offered Spring 2027</label>
    ${hasWeights ? `<button class="btn ghost" style="margin-top: 8px" data-clear data-f="clear">Clear skills</button>` : ""}`;

  let main = "";
  if (S.error) main += `<p class="readback err" role="alert">${esc(S.error)}</p>`;
  if (S.readBack) main += `<div class="readback" aria-live="polite"><b>We heard</b><span>${esc(S.readBack)}</span><button class="link" data-clear-goal data-f="clear-goal">Clear goal</button></div>`;
  if (!active) {
    main += `<div class="empty"><h2>Pick GenEds on purpose</h2>
      <p>Temple organizes GenEd by requirement code. Owl Compass sorts the same ${data.courses.length} courses by what you'll actually learn. Tell it a goal above, or set skills on the left.</p>
      <p>Try: ${EXAMPLES.map((x, i) => `<span>${i ? " · " : ""}<a href="#" data-example="${esc(x)}">${esc(x)}</a></span>`).join("")}</p></div>`;
  } else {
    main += data.areas.map((a) => {
      const r = ranked[a.id], all = rankedAll[a.id]?.courses;
      return `<section class="area" aria-labelledby="h-${esc(a.id)}"><div class="area-head">
        <span class="chip" style="background: var(--a-${esc(a.id)})">${esc(a.id.toUpperCase())}</span>
        <h2 id="h-${esc(a.id)}">${esc(a.name)}</h2><span class="meta">${a.slots === 2 ? "2 courses" : "1 course"}</span></div>
        ${r?.waived ? `<p class="note">Covered by your major. ${esc(major?.waiverNote)}</p>`
          : r?.courses.length ? (a.fixed ? `<p class="note">Required of every student, whatever your goal.</p>` : offGoal(r.courses, all)) + r.courses.map(row).join("")
          : `<p class="note">${S.springOnly && all?.length ? "No Spring 2027 course here matches yet. Turn off “Offered Spring 2027” to see more." : `No course here matches ${S.readFor ? "your goal or skills" : "these skills"} yet.`}</p>`}
      </section>`;
    }).join("");
    if (electives.length) main += `<section class="area" aria-labelledby="h-el"><div class="area-head"><span class="chip" style="background: var(--a-el)">MAJOR</span><h2 id="h-el">Electives in your major</h2></div>
      <p class="note">${esc(major?.electiveNote)}</p>${offGoal(electives)}${electives.map(row).join("")}</section>`;
  }
  $main.innerHTML = main;

  const rm = (p) => `<div class="slot full"><button aria-label="Remove ${esc(p.code)}" data-rm="${esc(p.code)}" data-f="rm-${esc(p.code)}">×</button><b>${esc(p.code)}</b>${esc(p.title)}</div>`;
  const slots = data.areas.flatMap((a) => Array.from({ length: a.slots }, (_, i) => {
    const inArea = S.plan.filter((p) => p.area === a.id)[i];
    if (waives.includes(a.id)) return `<div class="slot waived"><b>${esc(a.short)}</b>Covered by major</div>`;
    return inArea ? rm(inArea).replace('class="slot full"', `class="slot full" style="--tab: var(--a-${esc(a.id)})"`) : `<div class="slot"><b>${esc(a.short)}</b>Open</div>`;
  })).join("");
  // Planned courses that don't fill a slot: in an area the major covers, or past the area's slots.
  const extra = S.plan.filter((p) => p.area && (waives.includes(p.area) || S.plan.filter((x) => x.area === p.area).indexOf(p) >= (data.areas.find((a) => a.id === p.area)?.slots ?? 1)));
  const mine = S.plan.filter((p) => !p.area);
  $tray.innerHTML = `
    <h2 class="h" id="plan-h" tabindex="-1">My plan</h2>
    <div class="progress"><strong class="num">${esc(check.done)}</strong><span>of ${esc(check.total)} GenEd courses planned</span></div>
    <div class="slots">${slots}</div>
    ${extra.length ? `<h3 class="h">Not counted toward GenEd</h3>${extra.map(rm).join("")}` : ""}
    ${mine.length ? `<h3 class="h">Major electives</h3>${mine.map(rm).join("")}` : ""}
    <h3 class="h">Rule check</h3>
    ${check.issues.length ? check.issues.map((i) => `<p class="issue">${esc(i.message)}<cite>Bulletin: “${esc(ruleQuote(i.rule === "waived" ? "one-area" : i.rule))}” <a href="${RULE_URL}" target="_blank" rel="noreferrer">Source</a></cite></p>`).join("") : `<p class="allgood">No rule problems so far.</p>`}
    <p class="note">Owl Compass helps you prepare. Your advisor and DARS have the final word.</p>`;

  if (f) app.querySelector(`[data-f="${f}"]`)?.focus();
  // On a phone the skills list sits above the results, so bring a new reading (or an error) into view.
  if ((S.error || S.readBack) !== heard) {
    heard = S.error || S.readBack;
    if (heard && matchMedia("(max-width: 760px)").matches) app.querySelector(".readback")?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  // Runs only after the data and saved plan have loaded (init renders first), so it can't overwrite them with an empty plan.
  try { localStorage.setItem("oc-plan", JSON.stringify(S.plan)); localStorage.setItem("oc-major", JSON.stringify(S.majorId)); } catch {}
}

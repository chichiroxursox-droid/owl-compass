import { rankByArea, rankElectives, checkPlan, dots } from "/core/compass.mjs";

const RMP = (name) => `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(name + " Temple University")}`;
const RULE_URL = "https://bulletin.temple.edu/undergraduate/general-education/";
const EXAMPLES = ["I want to get into UX design and get better at presenting", "Pre-law: I need to argue and write well", "I want to understand people and data for marketing"];
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "") ?? d; } catch { return d; } };
// Escape anything from data/API before it goes into an HTML string.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const S = { data: null, goal: "", majorId: "undeclared", weights: {}, springOnly: true, plan: [], readBack: "", reasons: {}, busy: false, error: "", tearing: "" };
const app = document.getElementById("app");
let $rail, $main, $tray, $goal, $btn, $major;

Promise.all(["courses", "skills", "rules", "majors"].map((f) => fetch(`/data/${f}.json`).then((r) => r.json()))).then(([c, s, r, m]) => {
  S.data = { courses: c.courses, skills: s.skills, areas: r.areas, rules: r.rules, majors: m.majors, source: r.edition, term: c.term, scraped: c.scraped_at };
  S.plan = load("oc-plan", []);
  S.majorId = load("oc-major", "undeclared");
  init();
});

const derived = () => {
  const { data, weights, springOnly } = S;
  const major = data.majors.find((m) => m.id === S.majorId);
  const waives = major?.waives || [];
  const hasWeights = Object.values(weights).some(Boolean);
  const ranked = hasWeights ? rankByArea(data.courses, data.areas, weights, { springOnly, waives }) : {};
  const electives = hasWeights ? rankElectives(data.courses, major, weights) : [];
  const check = checkPlan(S.plan.filter((p) => p.area), data.areas, waives);
  return { major, waives, hasWeights, ranked, electives, check };
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
  $major.addEventListener("change", () => { S.majorId = $major.value; render(); });
  $rail.addEventListener("click", onRailClick);
  $rail.addEventListener("change", (e) => { if (e.target.matches("[data-spring]")) { S.springOnly = e.target.checked; render(); } });
  $main.addEventListener("click", onMainClick);
  $tray.addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { S.plan = S.plan.filter((p) => p.code !== b.dataset.rm); render(); } });
  render();
}

function onRailClick(e) {
  const b = e.target.closest("[data-w]");
  if (b) {
    const [id, w] = [b.dataset.id, +b.dataset.w];
    S.weights = { ...S.weights, [id]: S.weights[id] === w ? w - 1 : w };
    return render();
  }
  if (e.target.closest("[data-clear]")) { S.weights = {}; S.readBack = ""; S.reasons = {}; render(); }
}

function onMainClick(e) {
  const ex = e.target.closest("[data-example]");
  if (ex) { e.preventDefault(); return find(ex.dataset.example); }
  const t = e.target.closest("[data-take]");
  if (t) take(S.data.courses.find((c) => c.code === t.dataset.take));
}

async function find(text = S.goal) {
  if (!text.trim()) return;
  S.goal = text; $goal.value = text; S.busy = true; S.error = ""; S.reasons = {}; render();
  const { major, waives } = derived();
  try {
    const r = await fetch("/api/interpret", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal: text, major: major?.name }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    S.weights = j.weights; S.readBack = j.readBack;
    const picks = rankByArea(S.data.courses, S.data.areas, j.weights, { springOnly: S.springOnly, waives, per: 1 });
    const codes = Object.values(picks).flatMap((a) => a.courses.map((c) => c.code)).slice(0, 10);
    fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal: text, codes }) })
      .then((x) => x.json()).then((x) => { S.reasons = x.reasons || {}; render(); }).catch(() => {});
  } catch (e) { S.error = e.message || "Something went wrong. Pick skills on the left instead."; }
  finally { S.busy = false; render(); }
}

function take(c) {
  if (S.plan.some((p) => p.code === c.code)) { S.plan = S.plan.filter((p) => p.code !== c.code); return render(); }
  S.tearing = c.code; render();
  setTimeout(() => { S.plan = [...S.plan, c]; S.tearing = ""; render(); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420);
}

const dotsHtml = (n) => [1, 2, 3].map((i) => `<i${i <= n ? ' class="f"' : ""}></i>`).join("");

function row(c) {
  const d = dots(c, S.weights);
  const taken = S.plan.some((p) => p.code === c.code);
  const top = c.skills.find((s) => S.weights[s.id]) || c.skills[0];
  const skillById = Object.fromEntries(S.data.skills.map((s) => [s.id, s]));
  const sp = c.spring;
  return `<article class="row"><div>
    <div class="row-top"><span class="code">${esc(c.code)}</span><h3 class="title"><a href="${esc(c.url)}" target="_blank" rel="noreferrer">${esc(c.title)}</a></h3></div>
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
    <span>Match <span class="dots" aria-label="match ${d} of 3">${dotsHtml(d)}</span></span>
  </div></article>`;
}

function render() {
  const { data } = S;
  const { major, waives, hasWeights, ranked, electives, check } = derived();
  const f = document.activeElement?.dataset?.f; // keep keyboard focus across re-renders
  const ruleQuote = (id) => data.rules.find((r) => r.id === id)?.quote;

  $btn.disabled = S.busy; $btn.textContent = S.busy ? "Reading…" : "Find courses";

  $rail.innerHTML = `
    <h2 class="h">Your skills</h2>
    <p class="note">Set how much each matters. Courses re-rank as you go.</p>
    ${data.skills.map((s) => `<div class="skill"><label id="sk-${esc(s.id)}" title="${esc(s.hint)}">${esc(s.label)}</label>
      <span class="weight" role="group" aria-labelledby="sk-${esc(s.id)}">${[1, 2, 3].map((w) => `<button data-id="${esc(s.id)}" data-w="${w}" data-f="w-${esc(s.id)}-${w}" aria-pressed="${(S.weights[s.id] || 0) >= w}" aria-label="${esc(s.label)}: ${w} of 3"><span></span></button>`).join("")}</span></div>`).join("")}
    <h3 class="h">Filters</h3>
    <label class="check"><input type="checkbox" data-spring data-f="spring"${S.springOnly ? " checked" : ""}>Offered Spring 2027</label>
    ${hasWeights ? `<button class="btn ghost" style="margin-top: 8px" data-clear data-f="clear">Clear skills</button>` : ""}`;

  let main = "";
  if (S.error) main += `<p class="readback err" role="alert">${esc(S.error)}</p>`;
  if (S.readBack) main += `<div class="readback" aria-live="polite"><b>We heard</b><span>${esc(S.readBack)}</span></div>`;
  if (!hasWeights) {
    main += `<div class="empty"><h2>Pick GenEds on purpose</h2>
      <p>Temple organizes GenEd by requirement code. Owl Compass sorts the same ${data.courses.length} courses by what you'll actually learn. Tell it a goal above, or set skills on the left.</p>
      <p>Try: ${EXAMPLES.map((x, i) => `<span>${i ? " · " : ""}<a href="#" data-example="${esc(x)}">${esc(x)}</a></span>`).join("")}</p></div>`;
  } else {
    main += data.areas.map((a) => {
      const r = ranked[a.id];
      return `<section class="area" aria-labelledby="h-${esc(a.id)}"><div class="area-head">
        <span class="chip" style="background: var(--a-${esc(a.id)})">${esc(a.id.toUpperCase())}</span>
        <h2 id="h-${esc(a.id)}">${esc(a.name)}</h2><span class="meta">${a.slots === 2 ? "2 courses" : "1 course"}</span></div>
        ${r?.waived ? `<p class="note">Covered by your major. ${esc(major?.waiverNote)}</p>`
          : r?.courses.length ? r.courses.map(row).join("")
          : `<p class="note">No ${S.springOnly ? "Spring 2027 " : ""}course here matches these skills yet. ${S.springOnly ? "Try turning off the Spring filter." : ""}</p>`}
      </section>`;
    }).join("");
    if (electives.length) main += `<section class="area" aria-labelledby="h-el"><div class="area-head"><span class="chip" style="background: var(--a-el)">MAJOR</span><h2 id="h-el">Electives in your major</h2></div>
      <p class="note">${esc(major?.electiveNote)}</p>${electives.map(row).join("")}</section>`;
  }
  $main.innerHTML = main;

  const rm = (p) => `<div class="slot full"><button aria-label="Remove ${esc(p.code)}" data-rm="${esc(p.code)}" data-f="rm-${esc(p.code)}">×</button><b>${esc(p.code)}</b>${esc(p.title)}</div>`;
  const slots = data.areas.flatMap((a) => Array.from({ length: a.slots }, (_, i) => {
    const inArea = S.plan.filter((p) => p.area === a.id)[i];
    if (waives.includes(a.id)) return `<div class="slot waived"><b>${esc(a.short)}</b>Covered by major</div>`;
    return inArea ? rm(inArea).replace('class="slot full"', `class="slot full" style="--tab: var(--a-${esc(a.id)})"`) : `<div class="slot"><b>${esc(a.short)}</b>Open</div>`;
  })).join("");
  const extra = S.plan.filter((p) => !p.area);
  $tray.innerHTML = `
    <h2 class="h">My plan</h2>
    <div class="progress"><strong class="num">${esc(check.done)}</strong><span>of ${esc(check.total)} GenEd courses planned</span></div>
    <div class="slots">${slots}</div>
    ${extra.length ? `<h3 class="h">Major electives</h3>${extra.map(rm).join("")}` : ""}
    <h3 class="h">Rule check</h3>
    ${check.issues.length ? check.issues.map((i) => `<p class="issue">${esc(i.message)}<cite>Bulletin: “${esc(ruleQuote(i.rule === "waived" ? "one-area" : i.rule))}” <a href="${RULE_URL}" target="_blank" rel="noreferrer">Source</a></cite></p>`).join("") : `<p class="allgood">No rule problems so far.</p>`}
    <p class="note">Owl Compass helps you prepare. Your advisor and DARS have the final word.</p>`;

  if (f) app.querySelector(`[data-f="${f}"]`)?.focus();
  try { localStorage.setItem("oc-plan", JSON.stringify(S.plan)); localStorage.setItem("oc-major", JSON.stringify(S.majorId)); } catch {}
}

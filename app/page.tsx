"use client";
import { useEffect, useMemo, useRef, useState } from "react";
// Shared plain-JS core (also used by /classic)
import { rankByArea, rankElectives, rereadFit, checkPlan, dots } from "../public/core/compass.mjs";

type Skill = { id: string; label: string; hint: string };
type Course = {
  code: string; title: string; credits: string; area: string | null; subject: string; summary: string; url: string;
  skills: { id: string; strength: number; evidence: string }[];
  spring: null | { sections: number; open: number; online: number; instructors: string[]; times: string[] };
  lastFull: number | null; // % of seats taken at the end of Spring 2026
};
type Area = { id: string; name: string; short: string; slots: number; kind: string; fixed?: string };
type Major = { id: string; name: string; waives: string[]; waiverNote: string; electiveNote: string; electiveSubjects: string[]; electiveList?: string[]; url: string };
type Data = { skills: Skill[]; courses: Course[]; areas: Area[]; rules: { id: string; quote: string }[]; majors: Major[]; source: string; term: string; scraped: string };

const RMP = (name: string) => `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(name + " Temple University")}`;
// ponytail: 98% flags about a third of courses; 90% flagged half, so the label stopped meaning anything
const FILLED = 98;
const RULE_URL = "https://bulletin.temple.edu/undergraduate/general-education/";
const EXAMPLES = ["I want to get into UX design and get better at presenting", "Pre-law: I need to argue and write well", "I want to understand people and data for marketing"];
const load = (k: string, d: unknown) => { try { return JSON.parse(localStorage.getItem(k) || "") ?? d; } catch { return d; } };

type Section = { crn: string; sec: string; method: string; who: string[]; when: string[]; seats: number; max: number; wait: number };

// Live seats from /api/sections, fetched the first time the card is opened; the scraped times if Banner fails.
function Seats({ c, scraped }: { c: Course; scraped: string }) {
  const [live, setLive] = useState<Section[] | "loading" | "failed" | null>(null);
  const open = () => {
    if (live) return;
    setLive("loading");
    fetch(`/api/sections?course=${encodeURIComponent(c.code)}`).then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setLive(j.sections)).catch(() => setLive("failed"));
  };
  return (
    <details className="seats" onToggle={(e) => (e.currentTarget.open ? open() : undefined)}>
      <summary>Live seats &amp; times</summary>
      {live === "loading" && <p className="note">Checking Temple’s class schedule…</p>}
      {live === "failed" && <p className="note">Live seats are unavailable right now. Times as of {scraped}: {c.spring?.times.join(", ") || "none listed"}.</p>}
      {Array.isArray(live) && (live.length ? <ul>{live.map((s) => (
        <li key={s.crn}>
          <span className="num">{s.sec}</span> · {s.when.join("; ") || s.method}{s.who.length ? ` · ${s.who.join(", ")}` : ""}
          {" · "}<b className={s.seats > 0 ? "" : "no"}>{s.seats > 0 ? `${s.seats} of ${s.max} seats open` : `Full${s.wait ? `, ${s.wait} waitlisted` : ""}`}</b>
          <span className="crn"> CRN {s.crn}</span>
        </li>))}</ul> : <p className="note">No Spring 2027 sections right now.</p>)}
    </details>
  );
}

export default function Page() {
  const [data, setData] = useState<Data | null>(null);
  const [goal, setGoal] = useState("");
  const [majorId, setMajorId] = useState("undeclared");
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [fit, setFit] = useState<Record<string, number>>({}); // code -> 2-3: how squarely it is about the goal
  const [asked, setAsked] = useState(""); // the goal as submitted; a major change re-reads this, not the box
  const [readFor, setReadFor] = useState(""); // the goal the shown reading belongs to
  const [skillsFrom, setSkillsFrom] = useState<"goal" | "hand">("hand");
  const [springOnly, setSpringOnly] = useState(true);
  const [plan, setPlan] = useState<Course[]>([]);
  const [readBack, setReadBack] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tearing, setTearing] = useState("");
  const seq = useRef(0); // only the latest search may update the page
  // What find() reads once its reply lands: the state as it is then, not as it was when the search began.
  const live = useRef({ weights, springOnly, fit, skillsFrom });
  useEffect(() => { live.current = { weights, springOnly, fit, skillsFrom }; });

  useEffect(() => {
    Promise.all(["courses", "skills", "rules", "majors"].map((f) => fetch(`/data/${f}.json`).then((r) => r.json()))).then(([c, s, r, m]) => {
      setData({ courses: c.courses, skills: s.skills, areas: r.areas, rules: r.rules, majors: m.majors, source: r.edition, term: c.term, scraped: c.scraped_at });
      setPlan(load("oc-plan", []));
      setMajorId(load("oc-major", "undeclared"));
    });
  }, []);
  // Save only once the saved plan has been loaded, or the first render would overwrite it with an empty one.
  useEffect(() => { if (!data) return; try { localStorage.setItem("oc-plan", JSON.stringify(plan)); localStorage.setItem("oc-major", JSON.stringify(majorId)); } catch {} }, [data, plan, majorId]);
  // On a phone the skills list sits above the results, so bring the reading (or the error) into view.
  useEffect(() => { if ((readBack || error) && matchMedia("(max-width: 760px)").matches) document.querySelector(".readback")?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }, [readBack, error]);

  const major = data?.majors.find((m) => m.id === majorId);
  const waives = useMemo(() => major?.waives || [], [major]);
  const hasWeights = Object.values(weights).some(Boolean);
  const hasGoal = Object.keys(fit).length > 0;
  const active = hasWeights || hasGoal;
  const ranked = useMemo(() => (data && active ? rankByArea(data.courses, data.areas, weights, { springOnly, waives, fit }) : {}), [data, weights, springOnly, waives, active, fit]);
  // The same ranking without the Spring filter, so a note can say when the filter hides what matches.
  const rankedAll = useMemo(() => (data && active && springOnly ? rankByArea(data.courses, data.areas, weights, { waives, fit }) : ranked), [data, weights, springOnly, waives, active, fit, ranked]);
  const electives: Course[] = useMemo(() => (data && active ? rankElectives(data.courses, major, weights, { fit, springOnly }) : []), [data, major, weights, active, fit, springOnly]);
  const check = useMemo(() => (data ? checkPlan(plan.filter((p) => p.area), data.areas, waives) : null), [data, plan, waives]);

  // reread: the same goal for a newly chosen major. It keeps the box as typed, and when the shown reading is of this
  // goal it keeps the skills (the student may have changed them) and the GenEd picks; a newer goal gets its own.
  async function find(text = goal, mid = majorId, reread = false) {
    // A second press while the same goal is being read does nothing; each read is a paid AI call.
    if (!text.trim() || (busy && !reread && text === asked)) return;
    const keep = reread && readFor === text;
    const n = ++seq.current;
    if (!reread) setGoal(text);
    setAsked(text); setBusy(true); setError(""); setReasons({});
    try {
      const r = await fetch("/api/interpret", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal: text, major: mid }), signal: AbortSignal.timeout(30000) }).catch(() => null);
      const j = await r?.json().catch(() => null);
      if (n !== seq.current) return;
      if (!r?.ok || !j?.weights) throw new Error(j?.error || "Couldn't reach the AI. Check your connection, or pick skills by hand.");
      const now = live.current;
      // Skills set by hand win over the goal's picks; with none set, the goal's picks fill them.
      const mine = keep || (now.skillsFrom === "hand" && Object.values(now.weights).some(Boolean));
      const f: Record<string, number> = keep ? rereadFit(data!.courses, now.fit, j.fit || {}) : j.fit || {}, w = mine ? now.weights : j.weights;
      if (!mine) { setWeights(w); setSkillsFrom("goal"); }
      setFit(f); setReadBack(j.readBack); setReadFor(text);
      // Explain only courses about the goal: the top one per area (not the required ones) and the top major electives.
      const m = data!.majors.find((x) => x.id === mid);
      const tops = [...Object.values(rankByArea(data!.courses, data!.areas.filter((a) => !a.fixed), w, { springOnly: now.springOnly, waives: m?.waives || [], per: 1, fit: f })).flatMap((a: any) => a.courses as Course[]), ...rankElectives(data!.courses, m, w, { per: 2, fit: f, springOnly: now.springOnly })];
      const codes = tops.filter((c) => f[c.code]).sort((a, b) => f[b.code] - f[a.code]).map((c) => c.code).slice(0, 10);
      if (codes.length) fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal: text, codes }) })
        .then((x) => x.json()).then((x) => n === seq.current && setReasons(x.reasons || {})).catch(() => {});
    } catch (e: any) { if (n === seq.current) setError(e.message); }
    finally { if (n === seq.current) setBusy(false); }
  }

  function clearGoal() { seq.current++; setFit({}); setReadBack(""); setReadFor(""); setReasons({}); setAsked(""); setError(""); setBusy(false); document.getElementById("goal")?.focus(); }
  // Removing a plan item removes the focused button, so focus moves to the plan's heading.
  function drop(code: string) { setPlan(plan.filter((p) => p.code !== code)); document.getElementById("plan-h")?.focus(); }

  function take(c: Course) {
    if (plan.some((p) => p.code === c.code)) { setPlan(plan.filter((p) => p.code !== c.code)); return; }
    setTearing(c.code);
    setTimeout(() => { setPlan((p) => (p.some((x) => x.code === c.code) ? p : [...p, c])); setTearing(""); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420);
  }

  if (!data) return <div className="main"><div className="skeleton" /><div className="skeleton" /></div>;
  const skillById = Object.fromEntries(data.skills.map((s) => [s.id, s]));
  // The chosen skills, most important first, as "A, B, and C".
  const picked = new Intl.ListFormat("en").format(data.skills.filter((s) => weights[s.id]).sort((a, b) => weights[b.id] - weights[a.id]).map((s) => s.label));
  const areaById = Object.fromEntries(data.areas.map((a) => [a.id, a]));
  const ruleQuote = (id: string) => data.rules.find((r) => r.id === id)?.quote;

  // Said only once a reading has landed; `all` is the same list without the Spring filter.
  const offGoal = (list: Course[], all?: Course[]) => readFor && !busy && !list.some((c) => fit[c.code]) && (
    <p className="note">{all?.some((c) => fit[c.code]) ? "The courses here about your goal aren't on the Spring 2027 schedule. Turn off “Offered Spring 2027” to see them." : "Nothing here is about your goal, so these are ranked by your skills."}</p>
  );
  // Planned courses that don't fill a slot: in an area the major covers, or past the area's slots.
  const extra = plan.filter((p) => p.area && (waives.includes(p.area) || plan.filter((x) => x.area === p.area).indexOf(p) >= (areaById[p.area]?.slots ?? 1)));
  const row = (c: Course) => {
    const d = dots(c, weights);
    const f = fit[c.code] || 0;
    const taken = plan.some((p) => p.code === c.code);
    const top = c.skills.find((s) => weights[s.id]) || c.skills[0];
    return (
      <article className="row" key={c.code}>
        <div>
          <div className="row-top">
            <span className="code">{c.code}</span>
            <h3 className="title"><a href={c.url} target="_blank" rel="noreferrer">{c.title}</a></h3>
            {f > 0 && <span className="fit">About your goal</span>}
          </div>
          <div className="facts">
            <span className="num">{c.credits} credits</span>
            {c.spring ? <span>Spring 2027 · <span className="num">{c.spring.sections}</span> section{c.spring.sections > 1 ? "s" : ""}{c.spring.online ? `, ${c.spring.online} online` : ""}</span> : <span className="no">Not on the Spring 2027 schedule</span>}
            {(c.lastFull ?? 0) >= FILLED && <span className="no" title={`${c.lastFull}% of seats were taken by the end of Spring 2026`}>Filled up last spring</span>}
            {c.spring?.instructors[0] && <a href={RMP(c.spring.instructors[0])} target="_blank" rel="noreferrer">Look up {c.spring.instructors[0]} on Rate My Professors</a>}
          </div>
          {c.spring && <Seats c={c} scraped={data!.scraped} />}
          <p className="summary">{c.summary}</p>
          {reasons[c.code] && <p className="why"><span className="sr">Why for you, written by AI: </span>{reasons[c.code]}</p>}
          <div className="tags">{c.skills.map((s) => (
            <span key={s.id} className={`tag${weights[s.id] ? " on" : ""}`} title={`From the catalog: "${s.evidence}"`}>
              {skillById[s.id]?.label}<span className="dots" aria-label={`strength ${s.strength} of 3`}>{[1, 2, 3].map((i) => <i key={i} className={i <= s.strength ? "f" : ""} />)}</span>
            </span>))}</div>
          {top && <p className="quote">Catalog: <q>{top.evidence}</q></p>}
        </div>
        <div className="match">
          <button className={`tab${tearing === c.code ? " tearing" : ""}`} style={{ "--tab": `var(--a-${c.area || "el"})` } as React.CSSProperties} aria-pressed={taken} onClick={() => take(c)} aria-label={`${taken ? "Remove" : "Add"} ${c.code} ${taken ? "from" : "to"} plan`}>
            <span className="vert">{taken ? "In plan" : "Take a tab"}</span><span>{c.code}</span>
          </button>
          <span>Skills <span className="dots" aria-label={`skill match ${d} of 3`}>{[1, 2, 3].map((i) => <i key={i} className={i <= d ? "f" : ""} />)}</span></span>
        </div>
      </article>
    );
  };

  return (
    <>
      <header className="band">
        <div className="band-in">
          <h1 className="brand">Owl Compass<small>GenEd by the skills you want</small></h1>
          <form className="goal" onSubmit={(e) => { e.preventDefault(); find(); }}>
            <label className="sr" htmlFor="goal">What do you want to get better at?</label>
            <input id="goal" value={goal} maxLength={400} onChange={(e) => setGoal(e.target.value)} placeholder="What do you want to get better at? e.g. presenting, data, design…" />
            <button className={`btn${busy ? " busy" : ""}`}>{busy ? "Reading…" : "Find courses"}</button>
          </form>
          <label className="sr" htmlFor="major">Your major</label>
          <select id="major" className="major" value={majorId} onChange={(e) => { setMajorId(e.target.value); if (asked) find(asked, e.target.value, true); }}>
            {data.majors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </header>

      <div className="shell">
        <aside className="rail" aria-label="Skills and filters">
          <h2 className="h">Your skills</h2>
          <p className="note">{readBack && hasWeights && skillsFrom === "goal" ? `Your goal set these. Change them to re-order${hasGoal ? "; courses about your goal stay on top" : ""}.` : "Set how much each matters. Courses re-rank as you go."}</p>
          {data.skills.map((s) => (
            <div className="skill" key={s.id}>
              <label id={`sk-${s.id}`} title={s.hint}>{s.label}</label>
              <span className="weight" role="group" aria-labelledby={`sk-${s.id}`}>
                {[1, 2, 3].map((w) => (
                  <button key={w} aria-pressed={(weights[s.id] || 0) >= w} aria-label={`${s.label}: ${w} of 3`} onClick={() => { setWeights({ ...weights, [s.id]: weights[s.id] === w ? w - 1 : w }); setSkillsFrom("hand"); }}><span /></button>
                ))}
              </span>
            </div>
          ))}
          <h3 className="h">Filters</h3>
          <label className="check"><input type="checkbox" checked={springOnly} onChange={(e) => setSpringOnly(e.target.checked)} />Offered Spring 2027</label>
          {hasWeights && <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => { setWeights({}); setSkillsFrom("hand"); document.querySelector<HTMLButtonElement>(".weight button")?.focus(); }}>Clear skills</button>}
        </aside>

        <main className="main">
          {error && <p className="readback err" role="alert">{error}</p>}
          {readBack && <div className="readback" aria-live="polite"><b>We heard</b><span>{readBack}{hasWeights && <span className="note">{skillsFrom === "goal" ? `We set ${picked} from your goal as a starting point. Change them under “Your skills” if they don't fit.` : "Your skills stay as you set them, even for a new goal. Use “Clear skills” to let the goal pick."}</span>}</span><button className="link" onClick={clearGoal}>Clear goal</button></div>}
          {!active ? (
            <div className="empty">
              <h2>Pick GenEds on purpose</h2>
              <p>Temple organizes GenEd by requirement code. Owl Compass sorts the same {data.courses.length} courses by what you'll actually learn. Tell it a goal above, or set skills on the left.</p>
              <p>Try: {EXAMPLES.map((x, i) => <span key={x}>{i ? " · " : ""}<a href="#" onClick={(e) => { e.preventDefault(); find(x); document.getElementById("goal")?.focus(); }}>{x}</a></span>)}</p>
            </div>
          ) : (
            <>
              {data.areas.map((a) => {
                const r = (ranked as any)[a.id], all = (rankedAll as any)[a.id]?.courses as Course[] | undefined;
                return (
                  <section className="area" key={a.id} aria-labelledby={`h-${a.id}`}>
                    <div className="area-head">
                      <span className="chip" style={{ background: `var(--a-${a.id})` }}>{a.id.toUpperCase()}</span>
                      <h2 id={`h-${a.id}`}>{a.name}</h2>
                      <span className="meta">{a.slots === 2 ? "2 courses" : "1 course"}</span>
                    </div>
                    {r?.waived ? <p className="note">Covered by your major. {major?.waiverNote}</p>
                      : r?.courses.length ? <>{a.fixed ? <p className="note">Required of every student, whatever your goal.</p> : offGoal(r.courses, all)}{r.courses.map(row)}</>
                      : <p className="note">{springOnly && all?.length ? "No Spring 2027 course here matches yet. Turn off “Offered Spring 2027” to see more." : `No course here matches ${readFor ? "your goal or skills" : "these skills"} yet.`}</p>}
                  </section>
                );
              })}
              {electives.length > 0 && (
                <section className="area" aria-labelledby="h-el">
                  <div className="area-head"><span className="chip" style={{ background: "var(--a-el)" }}>MAJOR</span><h2 id="h-el">Electives in your major</h2></div>
                  <p className="note">{major?.electiveNote}</p>
                  {offGoal(electives)}
                  {electives.map(row)}
                </section>
              )}
            </>
          )}
        </main>

        <aside className="tray" aria-label="My plan">
          <h2 className="h" id="plan-h" tabIndex={-1}>My plan</h2>
          <div className="progress"><strong className="num">{check?.done}</strong><span>of {check?.total} GenEd courses planned</span></div>
          <div className="slots">
            {data.areas.flatMap((a) => Array.from({ length: a.slots }, (_, i) => {
              const inArea = plan.filter((p) => p.area === a.id)[i];
              if (waives.includes(a.id)) return <div className="slot waived" key={a.id + i}><b>{a.short}</b>Covered by major</div>;
              return inArea ? (
                <div className="slot full" key={a.id + i} style={{ "--tab": `var(--a-${a.id})` } as React.CSSProperties}>
                  <button aria-label={`Remove ${inArea.code}`} onClick={() => drop(inArea.code)}>×</button>
                  <b>{inArea.code}</b>{inArea.title}
                </div>
              ) : <div className="slot" key={a.id + i}><b>{a.short}</b>Open</div>;
            }))}
          </div>
          {extra.length > 0 && <><h3 className="h">Not counted toward GenEd</h3>{extra.map((p) => <div className="slot full" key={p.code}><button aria-label={`Remove ${p.code}`} onClick={() => drop(p.code)}>×</button><b>{p.code}</b>{p.title}</div>)}</>}
          {plan.filter((p) => !p.area).length > 0 && <><h3 className="h">Major electives</h3>{plan.filter((p) => !p.area).map((p) => <div className="slot full" key={p.code}><button aria-label={`Remove ${p.code}`} onClick={() => drop(p.code)}>×</button><b>{p.code}</b>{p.title}</div>)}</>}
          <h3 className="h">Rule check</h3>
          {check?.issues.length ? check.issues.map((i: any) => (
            <p className="issue" key={i.rule + i.codes.join()}>{i.message}<cite>Bulletin: “{ruleQuote(i.rule === "waived" ? "one-area" : i.rule)}” <a href={RULE_URL} target="_blank" rel="noreferrer">Source</a></cite></p>
          )) : <p className="allgood">No rule problems so far.</p>}
          <p className="note">Owl Compass helps you prepare. Your advisor and DARS have the final word.</p>
        </aside>
      </div>

      <footer className="foot">
        Student project by Temple AI Build Challenge Team 22 · not an official Temple University tool. Data: {data.source} and the public Spring 2027 class schedule (as of {data.scraped}). Skill tags written by Claude from each course's official description; hover a tag to see the sentence it came from. Your goal text is sent to Claude to read it and is never stored. <a href="/classic">Plain-HTML version</a>
      </footer>
    </>
  );
}

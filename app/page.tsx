"use client";
import { useEffect, useMemo, useState } from "react";
// Shared plain-JS core (also used by /classic)
import { rankByArea, rankElectives, checkPlan, dots } from "../public/core/compass.mjs";

type Skill = { id: string; label: string; hint: string };
type Course = {
  code: string; title: string; credits: string; area: string | null; subject: string; summary: string; url: string;
  skills: { id: string; strength: number; evidence: string }[];
  spring: null | { sections: number; open: number; online: number; instructors: string[]; times: string[] };
};
type Area = { id: string; name: string; short: string; slots: number; kind: string };
type Major = { id: string; name: string; waives: string[]; waiverNote: string; electiveNote: string; electiveSubjects: string[]; electiveList?: string[]; url: string };
type Data = { skills: Skill[]; courses: Course[]; areas: Area[]; rules: { id: string; quote: string }[]; majors: Major[]; source: string; term: string; scraped: string };

const RMP = (name: string) => `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(name + " Temple University")}`;
const RULE_URL = "https://bulletin.temple.edu/undergraduate/general-education/";
const EXAMPLES = ["I want to get into UX design and get better at presenting", "Pre-law: I need to argue and write well", "I want to understand people and data for marketing"];
const load = (k: string, d: unknown) => { try { return JSON.parse(localStorage.getItem(k) || "") ?? d; } catch { return d; } };

export default function Page() {
  const [data, setData] = useState<Data | null>(null);
  const [goal, setGoal] = useState("");
  const [majorId, setMajorId] = useState("undeclared");
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [springOnly, setSpringOnly] = useState(true);
  const [plan, setPlan] = useState<Course[]>([]);
  const [readBack, setReadBack] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tearing, setTearing] = useState("");

  useEffect(() => {
    Promise.all(["courses", "skills", "rules", "majors"].map((f) => fetch(`/data/${f}.json`).then((r) => r.json()))).then(([c, s, r, m]) => {
      setData({ courses: c.courses, skills: s.skills, areas: r.areas, rules: r.rules, majors: m.majors, source: r.edition, term: c.term, scraped: c.scraped_at });
      setPlan(load("oc-plan", []));
      setMajorId(load("oc-major", "undeclared"));
    });
  }, []);
  useEffect(() => { try { localStorage.setItem("oc-plan", JSON.stringify(plan)); localStorage.setItem("oc-major", JSON.stringify(majorId)); } catch {} }, [plan, majorId]);

  const major = data?.majors.find((m) => m.id === majorId);
  const waives = major?.waives || [];
  const hasWeights = Object.values(weights).some(Boolean);
  const ranked = useMemo(() => (data && hasWeights ? rankByArea(data.courses, data.areas, weights, { springOnly, waives }) : {}), [data, weights, springOnly, waives, hasWeights]);
  const electives: Course[] = useMemo(() => (data && hasWeights ? rankElectives(data.courses, major, weights) : []), [data, major, weights, hasWeights]);
  const check = useMemo(() => (data ? checkPlan(plan.filter((p) => p.area), data.areas, waives) : null), [data, plan, waives]);

  async function find(text = goal) {
    if (!text.trim()) return;
    setGoal(text); setBusy(true); setError(""); setReasons({});
    try {
      const r = await fetch("/api/interpret", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal: text, major: major?.name }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setWeights(j.weights); setReadBack(j.readBack);
      const picks = rankByArea(data!.courses, data!.areas, j.weights, { springOnly, waives, per: 1 });
      const codes = Object.values(picks).flatMap((a: any) => a.courses.map((c: Course) => c.code)).slice(0, 10);
      fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal: text, codes }) })
        .then((x) => x.json()).then((x) => setReasons(x.reasons || {})).catch(() => {});
    } catch (e: any) { setError(e.message || "Something went wrong. Pick skills on the left instead."); }
    finally { setBusy(false); }
  }

  function take(c: Course) {
    if (plan.some((p) => p.code === c.code)) { setPlan(plan.filter((p) => p.code !== c.code)); return; }
    setTearing(c.code);
    setTimeout(() => { setPlan((p) => [...p, c]); setTearing(""); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420);
  }

  if (!data) return <div className="main"><div className="skeleton" /><div className="skeleton" /></div>;
  const skillById = Object.fromEntries(data.skills.map((s) => [s.id, s]));
  const areaById = Object.fromEntries(data.areas.map((a) => [a.id, a]));
  const ruleQuote = (id: string) => data.rules.find((r) => r.id === id)?.quote;

  const row = (c: Course) => {
    const d = dots(c, weights);
    const taken = plan.some((p) => p.code === c.code);
    const top = c.skills.find((s) => weights[s.id]) || c.skills[0];
    return (
      <article className="row" key={c.code}>
        <div>
          <div className="row-top">
            <span className="code">{c.code}</span>
            <h3 className="title"><a href={c.url} target="_blank" rel="noreferrer">{c.title}</a></h3>
          </div>
          <div className="facts">
            <span className="num">{c.credits} credits</span>
            {c.spring ? <span>Spring 2027 · <span className="num">{c.spring.sections}</span> section{c.spring.sections > 1 ? "s" : ""}{c.spring.online ? `, ${c.spring.online} online` : ""}</span> : <span className="no">Not on the Spring 2027 schedule</span>}
            {c.spring?.instructors[0] && <a href={RMP(c.spring.instructors[0])} target="_blank" rel="noreferrer">Look up {c.spring.instructors[0]} on Rate My Professors</a>}
          </div>
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
          <span>Match <span className="dots" aria-label={`match ${d} of 3`}>{[1, 2, 3].map((i) => <i key={i} className={i <= d ? "f" : ""} />)}</span></span>
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
            <button className="btn" disabled={busy}>{busy ? "Reading…" : "Find courses"}</button>
          </form>
          <label className="sr" htmlFor="major">Your major</label>
          <select id="major" className="major" value={majorId} onChange={(e) => setMajorId(e.target.value)}>
            {data.majors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </header>

      <div className="shell">
        <aside className="rail" aria-label="Skills and filters">
          <h2 className="h">Your skills</h2>
          <p className="note">Set how much each matters. Courses re-rank as you go.</p>
          {data.skills.map((s) => (
            <div className="skill" key={s.id}>
              <label id={`sk-${s.id}`} title={s.hint}>{s.label}</label>
              <span className="weight" role="group" aria-labelledby={`sk-${s.id}`}>
                {[1, 2, 3].map((w) => (
                  <button key={w} aria-pressed={(weights[s.id] || 0) >= w} aria-label={`${s.label}: ${w} of 3`} onClick={() => setWeights({ ...weights, [s.id]: weights[s.id] === w ? w - 1 : w })}><span /></button>
                ))}
              </span>
            </div>
          ))}
          <h3 className="h">Filters</h3>
          <label className="check"><input type="checkbox" checked={springOnly} onChange={(e) => setSpringOnly(e.target.checked)} />Offered Spring 2027</label>
          {hasWeights && <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => { setWeights({}); setReadBack(""); setReasons({}); }}>Clear skills</button>}
        </aside>

        <main className="main">
          {error && <p className="readback err" role="alert">{error}</p>}
          {readBack && <div className="readback" aria-live="polite"><b>We heard</b><span>{readBack}</span></div>}
          {!hasWeights ? (
            <div className="empty">
              <h2>Pick GenEds on purpose</h2>
              <p>Temple organizes GenEd by requirement code. Owl Compass sorts the same {data.courses.length} courses by what you'll actually learn. Tell it a goal above, or set skills on the left.</p>
              <p>Try: {EXAMPLES.map((x, i) => <span key={x}>{i ? " · " : ""}<a href="#" onClick={(e) => { e.preventDefault(); find(x); }}>{x}</a></span>)}</p>
            </div>
          ) : (
            <>
              {data.areas.map((a) => {
                const r = (ranked as any)[a.id];
                return (
                  <section className="area" key={a.id} aria-labelledby={`h-${a.id}`}>
                    <div className="area-head">
                      <span className="chip" style={{ background: `var(--a-${a.id})` }}>{a.id.toUpperCase()}</span>
                      <h2 id={`h-${a.id}`}>{a.name}</h2>
                      <span className="meta">{a.slots === 2 ? "2 courses" : "1 course"}</span>
                    </div>
                    {r?.waived ? <p className="note">Covered by your major. {major?.waiverNote}</p>
                      : r?.courses.length ? r.courses.map(row)
                      : <p className="note">No {springOnly ? "Spring 2027 " : ""}course here matches these skills yet. {springOnly && "Try turning off the Spring filter."}</p>}
                  </section>
                );
              })}
              {electives.length > 0 && (
                <section className="area" aria-labelledby="h-el">
                  <div className="area-head"><span className="chip" style={{ background: "var(--a-el)" }}>MAJOR</span><h2 id="h-el">Electives in your major</h2></div>
                  <p className="note">{major?.electiveNote}</p>
                  {electives.map(row)}
                </section>
              )}
            </>
          )}
        </main>

        <aside className="tray" aria-label="My plan">
          <h2 className="h">My plan</h2>
          <div className="progress"><strong className="num">{check?.done}</strong><span>of {check?.total} GenEd courses planned</span></div>
          <div className="slots">
            {data.areas.flatMap((a) => Array.from({ length: a.slots }, (_, i) => {
              const inArea = plan.filter((p) => p.area === a.id)[i];
              if (waives.includes(a.id)) return <div className="slot waived" key={a.id + i}><b>{a.short}</b>Covered by major</div>;
              return inArea ? (
                <div className="slot full" key={a.id + i} style={{ "--tab": `var(--a-${a.id})` } as React.CSSProperties}>
                  <button aria-label={`Remove ${inArea.code}`} onClick={() => setPlan(plan.filter((p) => p.code !== inArea.code))}>×</button>
                  <b>{inArea.code}</b>{inArea.title}
                </div>
              ) : <div className="slot" key={a.id + i}><b>{a.short}</b>Open</div>;
            }))}
          </div>
          {plan.filter((p) => !p.area).length > 0 && <><h3 className="h">Major electives</h3>{plan.filter((p) => !p.area).map((p) => <div className="slot full" key={p.code}><button aria-label={`Remove ${p.code}`} onClick={() => setPlan(plan.filter((x) => x.code !== p.code))}>×</button><b>{p.code}</b>{p.title}</div>)}</>}
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

// Tag every course in .tmp/raw.json with skills (Claude Opus 5.5) and write public/data/courses.json.
// Each tag must quote the official description; tags whose quote isn't found verbatim are dropped.
// Run: node --env-file=.env tools/tag_skills.mjs   (~$5, a few minutes; cached in .tmp/tags.json)
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import fs from "node:fs";

const raw = JSON.parse(fs.readFileSync(".tmp/raw.json", "utf8"));
const { skills } = JSON.parse(fs.readFileSync("public/data/skills.json", "utf8"));
const majors = JSON.parse(fs.readFileSync("public/data/majors.json", "utf8")).majors;
const CACHE = ".tmp/tags.json";
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
const AREA_OF_ATTR = { GW: "gw", GQ: "gq", GY: "gy", GZ: "gz", GA: "ga", GB: "gb", GD: "gd", GG: "gg", GS: "gs", GU: "gu" };

// Which courses: every GenEd course (08xx/09xx with a G attribute) + elective pools for the 4 majors.
const required = new Set(majors.flatMap((m) => m.required || []));
const pick = Object.values(raw.courses).filter((c) => {
  const num = +c.code.split(" ")[1];
  const gened = /^0[89]/.test(c.code.split(" ")[1]) && c.attributes.some((a) => AREA_OF_ATTR[a]);
  const subj = c.code.split(" ")[0];
  const elective = majors.some((m) => m.electiveSubjects?.includes(subj)) && num >= 2000 && num < 5000 && !required.has(c.code);
  return (gened || elective) && c.description.length > 40;
});
console.log(`${pick.length} courses to tag`);

const Tags = z.object({
  courses: z.array(z.object({
    code: z.string(),
    summary: z.string().describe("One plain sentence, max 22 words, starting with a verb, saying what a student will do in this course. Only facts from the description."),
    skills: z.array(z.object({
      id: z.enum(skills.map((s) => s.id)),
      strength: z.number().int().min(1).max(3).describe("3 = central to the course, 2 = clearly practiced, 1 = touched on"),
      evidence: z.string().describe("A short phrase copied EXACTLY, character for character, from the description that shows this skill"),
    })).describe("2 to 4 skills, strongest first"),
  })),
});

const SYSTEM = `You tag university course descriptions with skills for a student course planner.
Skill list (use only these ids):
${skills.map((s) => `- ${s.id}: ${s.label} — ${s.hint}`).join("\n")}
Rules: tag only what the description itself supports; every evidence string must be an exact substring of that course's description (copy it, don't paraphrase); prefer 2-3 skills; never invent workload, difficulty or outcomes the text doesn't state.`;

const client = new Anthropic();
const todo = pick.filter((c) => !cache[c.code]);
const BATCH = 15;
const batches = [];
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

async function run(batch) {
  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "low", format: zodOutputFormat(Tags) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: batch.map((c) => `### ${c.code}: ${c.title}\n${c.description}`).join("\n\n") }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`no output (${res.stop_reason})`);
  for (const t of res.parsed_output.courses) cache[t.code] = t;
  fs.writeFileSync(CACHE, JSON.stringify(cache));
}

// ponytail: fixed concurrency of 6, SDK retries handle 429s
for (let i = 0; i < batches.length; i += 6) {
  await Promise.all(batches.slice(i, i + 6).map((b) => run(b).catch((e) => console.error("batch failed:", e.message))));
  console.log(`tagged ${Math.min(i + 6, batches.length)}/${batches.length} batches`);
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
let dropped = 0;
const courses = pick.map((c) => {
  const t = cache[c.code];
  const desc = norm(c.description);
  const tags = (t?.skills || []).filter((s) => {
    const ok = s.evidence && desc.includes(norm(s.evidence));
    if (!ok) dropped++;
    return ok;
  });
  const area = c.attributes.map((a) => AREA_OF_ATTR[a]).find(Boolean) || null;
  const sched = raw.schedule?.[c.code];
  return {
    code: c.code, title: c.title, credits: c.credits, area,
    honors: /^09/.test(c.code.split(" ")[1]),
    wi: c.attributes.includes("WI"),
    subject: c.code.split(" ")[0],
    description: c.description, prereq: c.prereq,
    summary: t?.summary || "", skills: tags,
    spring: sched ? { sections: sched.sections, open: sched.open, online: sched.online, instructors: sched.instructors.slice(0, 8), times: sched.times } : null,
    url: `${c.url}#:~:text=${encodeURIComponent(c.code)}`,
  };
}).filter((c) => c.skills.length);

fs.writeFileSync("public/data/courses.json", JSON.stringify({
  scraped_at: raw.scraped_at, term: "Spring 2027", count: courses.length, courses,
}));
console.log(`wrote ${courses.length} courses; dropped ${dropped} tags whose quote wasn't in the description`);

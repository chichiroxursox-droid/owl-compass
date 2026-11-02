import { test } from "node:test";
import assert from "node:assert/strict";
import { score, dots, rankByArea, checkPlan } from "./compass.mjs";

const areas = [
  { id: "gw", short: "Writing", slots: 1, kind: "foundation" },
  { id: "ga", short: "Arts", slots: 1, kind: "breadth" },
  { id: "gb", short: "Human Behavior", slots: 1, kind: "breadth" },
  { id: "gs", short: "Science & Tech", slots: 2, kind: "breadth" },
];
const c = (code, area, skills, spring = null) => ({ code, area, subject: code.split(" ")[0], skills, spring });

test("score and dots follow the weights", () => {
  const x = c("ART 0801", "ga", [{ id: "visual", strength: 3 }, { id: "speaking", strength: 1 }]);
  assert.equal(score(x, { visual: 3 }), 9);
  assert.equal(dots(x, { visual: 3 }), 3);
  assert.equal(dots(x, { coding: 3 }), 0);
});

test("ranking respects waivers and spring filter", () => {
  const list = [c("ART 0801", "ga", [{ id: "visual", strength: 3 }], { sections: 2 }), c("ART 0802", "ga", [{ id: "visual", strength: 1 }])];
  const r = rankByArea(list, areas, { visual: 2 }, { springOnly: true, waives: ["gs"] });
  assert.deepEqual(r.ga.courses.map((x) => x.code), ["ART 0801"]);
  assert.equal(r.gs.waived, true);
});

test("department limit counts Breadth only, foundation excluded", () => {
  const plan = [
    { code: "PSY 0801", area: "ga", subject: "PSY" }, { code: "PSY 0802", area: "gb", subject: "PSY" },
    { code: "PSY 0803", area: "gs", subject: "PSY" }, { code: "PSY 0804", area: "gw", subject: "PSY" },
  ];
  const r = checkPlan(plan, areas);
  assert.equal(r.issues.filter((i) => i.rule === "dept-limit").length, 1);
  assert.equal(r.issues[0].codes.length, 3);
});

test("overfilled area and waived area are flagged; progress counts", () => {
  const plan = [{ code: "A 0801", area: "ga", subject: "A" }, { code: "B 0801", area: "ga", subject: "B" }, { code: "C 0801", area: "gs", subject: "C" }];
  const r = checkPlan(plan, areas, ["gs"]);
  assert.ok(r.issues.some((i) => i.rule === "one-area"));
  assert.ok(r.issues.some((i) => i.rule === "waived"));
  assert.equal(r.total, 3);
  assert.equal(r.done, 1);
});

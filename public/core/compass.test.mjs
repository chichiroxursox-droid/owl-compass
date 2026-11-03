import { test } from "node:test";
import assert from "node:assert/strict";
import { score, dots, rankByArea, rankElectives, spreadFit, checkPlan } from "./compass.mjs";

const areas = [
  { id: "gw", short: "Writing", slots: 1, kind: "foundation" },
  { id: "ga", short: "Arts", slots: 1, kind: "breadth" },
  { id: "gb", short: "Human Behavior", slots: 1, kind: "breadth" },
  { id: "gs", short: "Science & Tech", slots: 2, kind: "breadth" },
];
const c = (code, area, skills, spring = null, title = code, honors = false, twin = undefined) => ({ code, area, title, honors, twin, subject: code.split(" ")[0], skills, spring });

test("courses about the goal come first, and show even with no skills set", () => {
  const list = [
    c("BIO 0801", "gs", [{ id: "science", strength: 3 }]),
    c("CIS 0835", "gs", [{ id: "tech-society", strength: 2 }]),
    c("PHYS 0801", "gs", [{ id: "science", strength: 1 }]),
  ];
  const fit = { "CIS 0835": 1 };
  assert.deepEqual(rankByArea(list, areas, { science: 3 }, { fit }).gs.courses.map((x) => x.code), ["CIS 0835", "BIO 0801", "PHYS 0801"]);
  assert.deepEqual(rankByArea(list, areas, {}, { fit }).gs.courses.map((x) => x.code), ["CIS 0835"]);
});

test("a required area shows its one course, whatever the skills or goal", () => {
  const list = [c("ENG 0802", "gw", [{ id: "writing", strength: 3 }], { sections: 9 }), c("ENG 0812", "gw", [{ id: "global", strength: 3 }], { sections: 2 }), c("ART 0801", "ga", [{ id: "ethics", strength: 2 }])];
  const r = rankByArea(list, [{ ...areas[0], fixed: "ENG 0802" }, areas[1]], { global: 3 }, { fit: { "ENG 0812": 3 } });
  assert.deepEqual(r.gw.courses.map((x) => x.code), ["ENG 0802"]);
  assert.deepEqual(r.ga.courses, []);
});

test("copies of a course show once, scored as the best copy and shown as the most takeable one", () => {
  const sk = [{ id: "science", strength: 2 }];
  const list = [
    c("BIOE 0944", "gs", sk, { sections: 1 }, "Honors Bionic Human: Body and Machine", true, "ENGR 0844"),
    c("BIOE 0844", "gs", sk, null, "The Bionic Human", false, "ENGR 0844"),
    c("ENGR 0844", "gs", sk, { sections: 2 }, "The Bionic Human", false, "ENGR 0844"),
    c("ART 0801", "ga", sk, null, "The Bionic Human"),
  ];
  const r = rankByArea(list, areas, { science: 1 });
  assert.deepEqual(r.gs.courses.map((x) => x.code), ["ENGR 0844"]);
  assert.deepEqual(r.ga.courses.map((x) => x.code), ["ART 0801"]);
  // Copies are tagged separately: the course still shows when only its Honors copy matches, as the open copy.
  const tagged = [c("ARCH 0875", "gb", [{ id: "visual", strength: 2 }], { sections: 4 }, "Architecture", false, "ARCH 0875"), c("ARCH 0975", "gb", [{ id: "visual", strength: 3 }, { id: "speaking", strength: 3 }], { sections: 1 }, "Honors Architecture: Physical Dimensions", true, "ARCH 0875"),
    c("ART 0899", "gb", [{ id: "speaking", strength: 2 }], { sections: 1 })];
  assert.deepEqual(rankByArea(tagged, areas, { speaking: 3 }).gb.courses.map((x) => x.code), ["ARCH 0875", "ART 0899"]);
});

test("a goal fit reaches a course's copies, but not a same-title course from another department", () => {
  const t = "World Society in Literature & Film";
  const list = [c("ART 0822", "gb", [], null, "Photo", false, "ART 0822"), c("SSWU 0922", "gb", [], null, "Honors: Photo", true, "ART 0822"), c("SPAN 0868", "gg", [], { sections: 1 }, t), c("GER 0868", "gg", [], { sections: 3 }, t)];
  const fit = spreadFit(list, { "SSWU 0922": 2, "SPAN 0868": 3 });
  assert.deepEqual(fit, { "ART 0822": 2, "SSWU 0922": 2, "SPAN 0868": 3 });
  // Same-title offerings show once, as the one about the goal.
  assert.deepEqual(rankByArea(list, [{ id: "gg", slots: 1 }], {}, { fit }).gg.courses.map((x) => x.code), ["SPAN 0868"]);
});

test("major electives use the major's subjects, the goal fit and the Spring filter", () => {
  const major = { electiveSubjects: ["CIS"] };
  const list = [c("CIS 3203", null, [{ id: "coding", strength: 1 }], { sections: 4 }), c("CIS 3301", null, [{ id: "coding", strength: 3 }]), c("MATH 3001", null, [{ id: "coding", strength: 3 }])];
  assert.deepEqual(rankElectives(list, major, { coding: 1 }, { fit: { "CIS 3203": 3 } }).map((x) => x.code), ["CIS 3203", "CIS 3301"]);
  assert.deepEqual(rankElectives(list, major, { coding: 1 }, { springOnly: true }).map((x) => x.code), ["CIS 3203"]);
});

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

# Marks copies of one course with a shared "twin" id in public/data/courses.json, so a course shows once.
# Copies share an area and course number (Honors adds 100: 0822 / 0922) and either the same title (cross-listings)
# or the same department (Honors versions, some with their own subtitle). Different courses can share an area and
# number (ARTH 0813 and THTR 0813), and "World Society in Literature & Film" is a different culture in each
# department, so only same-department links reach those. A major course links only to its Honors copy (same department
# and title), since generic titles like "Special Topics" are different courses.
# Run after tools/tag_skills.mjs: python3 tools/twins.py
import json
import re
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "public/data/courses.json"
data = json.loads(P.read_text())
cs = data["courses"]

norm = lambda t: re.sub(r"[^a-z0-9]", "", re.sub(r"^the\s+", "", re.sub(r"^honors:?\s*", "", t.lower().replace("&", "and"))))
num = lambda c: re.sub(r"^09", "08", c["code"].split()[1])
per_dept = lambda c: "world society in literature" in c["title"].lower()

parent = {c["code"]: c["code"] for c in cs}
def root(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x

buckets = {}
for c in cs:
    if c["area"]:
        buckets.setdefault((c["area"], num(c)), []).append(c)
for group in buckets.values():
    for i, a in enumerate(group):
        for b in group[i + 1:]:
            if a["subject"] == b["subject"] or (not per_dept(a) and not per_dept(b) and norm(a["title"]) == norm(b["title"])):
                parent[root(a["code"])] = root(b["code"])

honors = lambda c: c["honors"] or c["title"].lower().startswith("honors")  # some Honors copies lack the flag
majors = [c for c in cs if not c["area"]]
for a in majors:
    if honors(a):
        for b in majors:
            if b is not a and b["subject"] == a["subject"] and norm(b["title"]) == norm(a["title"]):
                parent[root(a["code"])] = root(b["code"])

# The id is the copy a student would most likely take: offered Spring 2027, not Honors, then the lowest code.
groups = {}
for c in cs:
    groups.setdefault(root(c["code"]), []).append(c)
for members in groups.values():
    best = min(members, key=lambda c: (not c["spring"], honors(c), c["code"]))["code"]
    for c in members:
        if len(members) > 1:
            c["twin"] = best
        else:
            c.pop("twin", None)

P.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
multi = [m for m in groups.values() if len(m) > 1]
print(f"{len(multi)} courses have copies ({sum(map(len, multi))} codes); {len(groups)} distinct courses in all")

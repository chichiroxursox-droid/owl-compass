"""Scrape Temple's public catalog + Spring 2027 class schedule into .tmp/raw.json.

Sources (robots-allowed, ~1 req/s):
  - Bulletin GenEd area pages: course lists per area
  - Bulletin /courses/<subj>/ pages: title, credits, description, attributes
  - Banner 9 public class search: Spring 2027 sections per GenEd attribute
Run: python3 tools/scrape.py   (about 3-5 minutes)
"""
import html, json, re, time, uuid
from pathlib import Path
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / ".tmp" / "raw.json"
UA = {"User-Agent": "OwlCompass/0.1 (Temple student project; ethan.hauger@temple.edu)"}
BULLETIN = "https://bulletin.temple.edu"
AREAS = ["gw", "gq", "gy-gz", "ga", "gb", "gd", "gg", "gs", "gu"]
MAJOR_SUBJECTS = ["mis", "mktg", "cis", "ece"]  # elective pools for the 4 majors
BANNER = "https://prd-xereg.temple.edu/StudentRegistrationSsb/ssb/"
TERM = "202703"  # Spring 2027
ATTRS = ["GW", "GQ", "GY", "GZ", "GA", "GB", "GD", "GG", "GS", "GU"]

s = requests.Session()
s.headers.update(UA)


def get(url):
    time.sleep(1)  # ponytail: fixed 1 req/s politeness, no adaptive backoff
    r = s.get(url, timeout=30)
    r.raise_for_status()
    return r.text


def clean(t):
    return re.sub(r"\s+", " ", html.unescape(t or "").replace("\xa0", " ")).strip()


def area_lists():
    """{code like 'NSCI 0817': area slug} from the 9 area pages (cross-lists share one course)."""
    out = {}
    for a in AREAS:
        soup = BeautifulSoup(get(f"{BULLETIN}/undergraduate/general-education/{a}/"), "lxml")
        for link in soup.select("a.bubblelink.code"):
            code = clean(link.get_text())
            if re.match(r"^[A-Z&]+ 0[89]\d\d$", code):
                out[code] = a
    return out


def subject_courses(subj):
    try:
        soup = BeautifulSoup(get(f"{BULLETIN}/courses/{subj.lower()}/"), "lxml")
    except requests.HTTPError:
        return {}
    out = {}
    for block in soup.select("div.courseblock"):
        title = clean(block.select_one("p.courseblocktitle").get_text())
        m = re.match(r"^([A-Z&]+ \d{4})\.\s*(.+?)\.\s*([\d.]+(?: to [\d.]+)?) Credit Hours?", title)
        if not m:
            continue
        desc_el = block.select_one("div.courseblockdesc")
        attrs, prereq = [], ""
        for part in block.select("p.courseblockpart"):
            label = clean(part.find("strong").get_text()) if part.find("strong") else ""
            text = clean(part.get_text()).replace(label, "", 1).strip()
            if label.startswith("Course Attributes"):
                attrs = re.findall(r"\b[A-Z]{2}\b", text)
            elif label.startswith("Pre-requisites") or label.startswith("Prerequisite"):
                prereq = text
        out[m.group(1)] = {
            "code": m.group(1), "title": m.group(2), "credits": m.group(3),
            "description": clean(desc_el.get_text()) if desc_el else "",
            "attributes": attrs, "prereq": prereq[:400],
            "url": f"{BULLETIN}/courses/{subj.lower()}/",
        }
    return out


def schedule():
    """{subject+number: {sections, open, online, instructors, times}} for Spring 2027 GenEd sections."""
    out = {}
    for attr in ATTRS:
        sess = requests.Session(); sess.headers.update(UA)  # fresh session per attribute (verified to work)
        sid = uuid.uuid4().hex[:12]
        sess.get(BANNER + "classSearch/getTerms?searchTerm=&offset=1&max=10", timeout=30)
        sess.post(BANNER + "term/search?mode=search", data={"term": TERM, "studyPath": "", "studyPathText": "",
                  "startDatepicker": "", "endDatepicker": "", "uniqueSessionId": sid}, timeout=30)
        offset, total = 0, 1
        while offset < total:
            time.sleep(1)
            r = sess.get(BANNER + "searchResults/searchResults", params={
                "txt_term": TERM, "txt_attribute": attr, "startDatepicker": "", "endDatepicker": "",
                "uniqueSessionId": sid, "pageOffset": offset, "pageMaxSize": 100,
                "sortColumn": "subjectDescription", "sortDirection": "asc"},
                headers={"X-Requested-With": "XMLHttpRequest", "Accept": "application/json"}, timeout=60).json()
            total = r.get("totalCount") or 0
            for sec in r.get("data") or []:
                key = f"{sec['subject']} {sec['courseNumber']}"
                c = out.setdefault(key, {"sections": 0, "open": 0, "online": 0, "instructors": [], "times": []})
                c["sections"] += 1
                c["open"] += 1 if sec.get("openSection") else 0
                if "online" in (sec.get("instructionalMethodDescription") or "").lower():
                    c["online"] += 1
                for f in sec.get("faculty") or []:
                    n = f.get("displayName")
                    if n and n not in c["instructors"]:
                        c["instructors"].append(n)
                for mf in sec.get("meetingsFaculty") or []:
                    mt = mf.get("meetingTime") or {}
                    days = "".join(d[0].upper() if d not in ("thursday", "sunday") else {"thursday": "R", "sunday": "U"}[d]
                                   for d in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] if mt.get(d))
                    if days and mt.get("beginTime"):
                        t = f"{days} {mt['beginTime']}-{mt['endTime']}"
                        if t not in c["times"] and len(c["times"]) < 6:
                            c["times"].append(t)
            offset += 100
        print(f"schedule {attr}: {total} sections")
    return out


if __name__ == "__main__":
    lists = area_lists()
    print(f"{len(lists)} GenEd codes across areas")
    subjects = sorted({c.split()[0] for c in lists} | {s.upper() for s in MAJOR_SUBJECTS})
    courses = {}
    for subj in subjects:
        courses.update(subject_courses(subj))
        print(f"  {subj}: {len(courses)} courses so far")
    OUT.parent.mkdir(exist_ok=True)
    raw = {"scraped_at": time.strftime("%Y-%m-%d"), "term": TERM, "area_lists": lists, "courses": courses}
    OUT.write_text(json.dumps(raw))  # save before the schedule step so a Banner failure keeps the catalog
    raw["schedule"] = schedule()
    OUT.write_text(json.dumps(raw))
    print("wrote", OUT)

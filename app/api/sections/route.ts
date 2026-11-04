// GET ?course=CIS%201051 -> {sections: [...], asOf}. Live Spring 2027 seats from Temple's public Banner class search
// (the same two calls tools/scrape.py makes, no login). The cards fall back to the scraped snapshot if this fails.
export const maxDuration = 30;

const BANNER = "https://prd-xereg.temple.edu/StudentRegistrationSsb/ssb/";
const TERM = "202703"; // Spring 2027
const UA = { "User-Agent": "OwlCompass/0.1 (Temple student project; ethan.hauger@temple.edu)" };
const DAYS = [["monday", "M"], ["tuesday", "T"], ["wednesday", "W"], ["thursday", "R"], ["friday", "F"], ["saturday", "S"], ["sunday", "U"]];
const clock = (t: string) => `${+t.slice(0, 2) % 12 || 12}:${t.slice(2)}${+t.slice(0, 2) < 12 ? "am" : "pm"}`;

type Meeting = { beginTime?: string; endTime?: string; buildingDescription?: string; room?: string } & Record<string, unknown>;
type Sec = {
  courseReferenceNumber: string; sequenceNumber: string; seatsAvailable: number; maximumEnrollment: number; waitCount: number;
  instructionalMethodDescription?: string; faculty?: { displayName?: string }[]; meetingsFaculty?: { meetingTime?: Meeting }[];
};

export async function GET(req: Request) {
  const course = new URL(req.url).searchParams.get("course") ?? "";
  const m = course.match(/^([A-Z&]{2,4}) (\d{4})$/);
  if (!m) return Response.json({ error: "Bad course code." }, { status: 400 });
  try {
    // Banner ties the chosen term to a session cookie, so carry it from the first call to the second.
    const signal = AbortSignal.timeout(12_000);
    const sid = crypto.randomUUID().slice(0, 12);
    const term = await fetch(BANNER + "term/search?mode=search", {
      method: "POST", signal, headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ term: TERM, uniqueSessionId: sid }),
    });
    const cookie = term.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const q = new URLSearchParams({ txt_term: TERM, txt_subject: m[1], txt_courseNumber: m[2], uniqueSessionId: sid, pageOffset: "0", pageMaxSize: "500" });
    const res = await fetch(BANNER + "searchResults/searchResults?" + q, { signal, headers: { ...UA, cookie, Accept: "application/json", "X-Requested-With": "XMLHttpRequest" } });
    const data: Sec[] = (await res.json()).data ?? [];
    const sections = data.map((s) => ({
      crn: s.courseReferenceNumber, sec: s.sequenceNumber, method: s.instructionalMethodDescription ?? "",
      who: (s.faculty ?? []).map((f) => f.displayName).filter(Boolean),
      when: (s.meetingsFaculty ?? []).flatMap(({ meetingTime: t }) => {
        const days = DAYS.filter(([d]) => t?.[d]).map(([, l]) => l).join("");
        return t?.beginTime && t.endTime && days ? [`${days} ${clock(t.beginTime)}–${clock(t.endTime)}${t.buildingDescription ? ` · ${t.buildingDescription} ${t.room ?? ""}`.trimEnd() : ""}`] : [];
      }),
      seats: s.seatsAvailable, max: s.maximumEnrollment, wait: s.waitCount,
    })).sort((a, b) => +(b.seats > 0) - +(a.seats > 0)); // open sections first (ENG 0802 has 100+, most full)
    // ponytail: 60 s CDN cache per course so a demo room opening the same card hits Banner once a minute
    return Response.json({ sections, asOf: new Date().toISOString() }, { headers: { "Cache-Control": "public, s-maxage=60" } });
  } catch (e) {
    console.error("sections failed:", (e as Error)?.name);
    return Response.json({ error: "Live seats are unavailable right now." }, { status: 502 });
  }
}

// Lance data gateway. Checks the device passcode, then forwards the
// PostgREST request with the service role key. Only Lance's own tables pass.
// Staff calendar saves go through here too: the gateway adds the staff code
// on the server, so Lance's website never carries it. /upcoming returns the
// next week of staff calendar events plus the regular service times.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TABLES = new Set([
  "lance_chats", "lance_projects", "lance_notifications", "lance_memory",
  "lance_profile", "lance_sessions", "lance_conversations", "lance_tasks",
  "lance_pinned", "brain_notes", "diane_queue",
]);
const STAFF_RPCS = new Set(["staff_event_save", "staff_note_save"]);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, prefer, x-lance-key, x-client-info",
  "Access-Control-Expose-Headers": "content-range",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

// Regular services (Pacific time): weekday 0 = Sunday.
const SERVICES = [
  { dow: 0, start: "09:00", title: "Sunday morning service" },
  { dow: 0, start: "17:00", title: "Sunday evening service" },
  { dow: 3, start: "19:00", title: "Wednesday service" },
];

let keyHash: string | null = null;
let keyLoaded = 0;
async function currentHash(): Promise<string | null> {
  if (keyHash && Date.now() - keyLoaded < 60_000) return keyHash;
  const r = await fetch(`${SB_URL}/rest/v1/lance_keys?id=eq.pastor&select=key_hash`, { headers: svc });
  const rows = r.ok ? await r.json() : [];
  keyHash = rows[0]?.key_hash ?? null;
  keyLoaded = Date.now();
  return keyHash;
}
async function staffCode(): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/staff_access?id=eq.1&select=access_code`, { headers: svc });
  const rows = r.ok ? await r.json() : [];
  return rows[0]?.access_code ?? null;
}
async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function pacificToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dow = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();

async function upcoming(days: number) {
  const today = pacificToday();
  const end = addDays(today, days);
  const sel = "select=title,category,event_date,start_time,location,repeat_weekly,repeat_until";
  const [oneOff, weekly] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/staff_calendar?${sel}&event_date=gte.${today}&event_date=lte.${end}&repeat_weekly=is.false&limit=200`, { headers: svc }).then(r => r.ok ? r.json() : []),
    fetch(`${SB_URL}/rest/v1/staff_calendar?${sel}&repeat_weekly=is.true&event_date=lte.${end}&limit=200`, { headers: svc }).then(r => r.ok ? r.json() : []),
  ]);
  const out: { date: string; start: string; title: string; cat: string; loc: string }[] = [];
  const push = (date: string, e: any) => out.push({ date, start: (e.start_time || "").slice(0, 5), title: e.title, cat: e.category || "Other", loc: e.location || "" });
  for (const e of oneOff) push(e.event_date, e);
  for (const e of weekly) {
    for (let i = 0; i <= days; i++) {
      const d = addDays(today, i);
      if (d < e.event_date) continue;
      if (e.repeat_until && d > e.repeat_until) continue;
      if (dow(d) === dow(e.event_date)) push(d, e);
    }
  }
  for (let i = 0; i <= days; i++) {
    const d = addDays(today, i);
    for (const s of SERVICES) {
      if (dow(d) !== s.dow) continue;
      const covered = out.some(e => e.date === d && e.cat === "Service" && e.start === s.start);
      if (!covered) out.push({ date: d, start: s.start, title: s.title, cat: "Service", loc: "" });
    }
  }
  out.sort((a, b) => (a.date + (a.start || "00:00")).localeCompare(b.date + (b.start || "00:00")));
  return { today, events: out };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const given = (req.headers.get("x-lance-key") || "").trim().toLowerCase();
  const want = await currentHash();
  if (!given || !want || !sameText(await sha256(given), want)) {
    await new Promise(r => setTimeout(r, 1200));
    return json(401, { error: "locked", message: "Lance needs the unlock passcode on this device." });
  }

  const url = new URL(req.url);
  const parts = url.pathname.split("/lance-db/");
  const table = (parts[1] || "").replace(/\/+$/, "");
  if (table === "check") return json(200, { ok: true });

  if (table === "upcoming") {
    const days = Math.min(14, Math.max(1, Number(url.searchParams.get("days")) || 7));
    try { return json(200, await upcoming(days)); } catch (e) { return json(500, { error: String(e) }); }
  }

  if (table.startsWith("rpc/")) {
    const fn = table.slice(4);
    if (!STAFF_RPCS.has(fn) || req.method !== "POST") return json(404, { error: "unknown_function" });
    let input: any = {};
    try { input = await req.json(); } catch { return json(400, { error: "bad_body" }); }
    const code = await staffCode();
    if (!code) return json(500, { error: "no_staff_code" });
    const up = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { ...svc, "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: code, p: input.p ?? {} }),
    });
    return new Response(await up.text(), { status: up.status, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  if (!TABLES.has(table)) return json(404, { error: "unknown_table" });

  const headers: Record<string, string> = { ...svc, "Content-Type": "application/json" };
  const prefer = req.headers.get("prefer");
  if (prefer) headers["Prefer"] = prefer;

  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.text();
  const upstream = await fetch(`${SB_URL}/rest/v1/${table}${url.search}`, { method: req.method, headers, body });
  const out = await upstream.text();
  const h: Record<string, string> = { ...CORS, "Content-Type": upstream.headers.get("content-type") || "application/json" };
  const cr = upstream.headers.get("content-range");
  if (cr) h["Content-Range"] = cr;
  return new Response(out, { status: upstream.status, headers: h });
});

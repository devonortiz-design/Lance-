import { SUPABASE_URL, SB_HEADERS, SESSION_ID, DB_URL } from "./config";

async function sbGet(table, params = "") {
  const r = await fetch(`${DB_URL}/${table}?${params}`, { headers: SB_HEADERS });
  return r.ok ? r.json() : [];
}

async function sbPost(table, data, extra = {}) {
  await fetch(`${DB_URL}/${table}`, {
    method: "POST",
    headers: { ...SB_HEADERS, ...extra },
    body: JSON.stringify(data),
  });
}

async function sbUpsert(table, data) {
  await fetch(`${DB_URL}/${table}`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(data),
  });
}

export async function loadMemory() {
  return sbGet("lance_memory", "active=eq.true&order=confidence.desc,updated_at.desc&limit=250");
}

export async function loadProfile() {
  return sbGet("lance_profile", "active=eq.true&order=domain.asc,confidence.desc");
}

export async function loadRecentSessions() {
  return sbGet("lance_sessions", "summary=not.is.null&order=created_at.desc&limit=25");
}

export async function saveMessage(role, content, lane = "general") {
  await sbPost("lance_conversations", { session_id: SESSION_ID, role, content, lane });
}

export async function saveMemoryFact(category, fact, confidence, sourceSession) {
  await sbPost("lance_memory", { category, fact, confidence, source_session: sourceSession, active: true });
}

export async function saveProfileFact(domain, key, value, confidence = 4) {
  await sbUpsert("lance_profile", { domain, key, value, confidence, active: true });
}

export async function saveSession(lane, summary, messageCount) {
  await sbPost(
    "lance_sessions",
    { id: SESSION_ID, lane, summary, message_count: messageCount },
    { "Prefer": "resolution=merge-duplicates" }
  );
}

export function parseMemoryTags(text) {
  const tags = [];
  const memRe = /\[MEMORY:\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(\d)\s*\]/gi;
  let m;
  while ((m = memRe.exec(text)) !== null) {
    tags.push({ type: "memory", category: m[1].trim().toLowerCase(), fact: m[2].trim(), confidence: parseInt(m[3]) });
  }
  const profRe = /\[PROFILE:\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(\d)\s*\]/gi;
  while ((m = profRe.exec(text)) !== null) {
    tags.push({ type: "profile", domain: m[1].trim().toLowerCase(), key: m[2].trim().toLowerCase().replace(/\s+/g,"_"), value: m[3].trim(), confidence: parseInt(m[4]) });
  }
  return tags;
}

export function stripMemoryTags(t) {
  return t.replace(/\[MEMORY:[^\]]+\]/gi, "").replace(/\[PROFILE:[^\]]+\]/gi, "").replace(/\[FLYER:[^\]]+\]/gi, "").replace(/\[TEXT:[^\]]+\]/gi, "").replace(/\[VIDEO:[^\]]+\]/gi, "").replace(/\[TASK:[^\]]+\]/gi, "").replace(/\[STAFF_EVENT:[^\]]+\]/gi, "").replace(/\[STAFF_NOTE:[^\]]+\]/gi, "").replace(/\[BRAIN:[^\]]+\]/gi, "").trim();
}

export function parseVideoTag(text) {
  const re = /\[VIDEO:\s*([^\]]+)\]/i;
  const m = re.exec(text);
  if (!m) return null;
  const fields = {};
  m[1].split("|").forEach(pair => {
    const eq = pair.indexOf("=");
    if (eq === -1) return;
    const key = pair.slice(0, eq).trim().toLowerCase();
    const val = pair.slice(eq + 1).trim();
    fields[key] = val;
  });
  if (!fields.url) return null;
  return {
    url: fields.url,
    prompt: fields.prompt || "",
    clip: fields.clip || "",
    fps: fields.fps || "",
  };
}

export function parseSmsTag(text) {
  const re = /\[TEXT:\s*([^\]]+)\]/i;
  const m = re.exec(text);
  if (!m) return null;
  const fields = {};
  m[1].split("|").forEach(pair => {
    const eq = pair.indexOf("=");
    if (eq === -1) return;
    const key = pair.slice(0, eq).trim().toLowerCase();
    const val = pair.slice(eq + 1).trim();
    fields[key] = val;
  });
  return {
    message: fields.message || "",
    sendAt: fields.sendat || "",
  };
}

export function parseFlyerTag(text) {
  const re = /\[FLYER:\s*([^\]]+)\]/i;
  const m = re.exec(text);
  if (!m) return null;
  const fields = {};
  m[1].split("|").forEach(pair => {
    const eq = pair.indexOf("=");
    if (eq === -1) return;
    const key = pair.slice(0, eq).trim().toLowerCase();
    const val = pair.slice(eq + 1).trim();
    fields[key] = val;
  });
  return {
    title: fields.title || "Event",
    subtitle: fields.subtitle || "",
    date: fields.date || "",
    time: fields.time || "",
    location: fields.location || "",
    verse: fields.verse || "",
    verseRef: fields.verseref || fields.verse_ref || "",
    template: fields.template || "event",
    brand: fields.brand || "church",
  };
}


export function parseTaskTag(text) {
  const re = /\[TASK:\s*([^\]]+)\]/i;
  const m = re.exec(text);
  if (!m) return null;
  const fields = {};
  m[1].split("|").forEach(pair => {
    const eq = pair.indexOf("=");
    if (eq === -1) return;
    const key = pair.slice(0, eq).trim().toLowerCase();
    const val = pair.slice(eq + 1).trim();
    fields[key] = val;
  });
  return { title: fields.title || "", due: fields.due || "", category: fields.category || "" };
}

export function parseStaffEventTags(text) {
  const re = /\[STAFF_EVENT:\s*([^\]]+)\]/gi;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const fields = {};
    m[1].split("|").forEach(pair => {
      const eq = pair.indexOf("=");
      if (eq === -1) return;
      const key = pair.slice(0, eq).trim().toLowerCase();
      const val = pair.slice(eq + 1).trim();
      fields[key] = val;
    });
    out.push({
      title: fields.title || "",
      date: fields.date || "",
      start: fields.start || "",
      end: fields.end || "",
      location: fields.location || "",
      category: fields.category || "Other",
      repeat: fields.repeat || "",
      until: fields.until || "",
      notes: fields.notes || "",
    });
  }
  return out;
}

export function parseStaffNoteTags(text) {
  const re = /\[STAFF_NOTE:\s*([^\]]+)\]/gi;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const fields = {};
    m[1].split("|").forEach(pair => {
      const eq = pair.indexOf("=");
      if (eq === -1) return;
      const key = pair.slice(0, eq).trim().toLowerCase();
      const val = pair.slice(eq + 1).trim();
      fields[key] = val;
    });
    out.push({ text: fields.text || "" });
  }
  return out;
}

// The gateway adds the staff calendar code on the server.
export async function saveStaffEvent(ev) {
  const r = await fetch(`${DB_URL}/rpc/staff_event_save`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify({ p: ev }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `HTTP ${r.status}`); }
  return r.json();
}

export async function saveStaffNote(note) {
  const r = await fetch(`${DB_URL}/rpc/staff_note_save`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify({ p: note }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `HTTP ${r.status}`); }
  return r.json();
}

export async function saveTask(title, due, category) {
  return sbPost("lance_tasks", { title, due_date: due || null, category: category || null, status: "open" });
}

export async function loadOpenTasks() {
  return sbGet("lance_tasks", "status=eq.open&order=due_date.asc.nullslast,created_at.asc&limit=50");
}

export async function completeTask(id) {
  await fetch(`${DB_URL}/lance_tasks?id=eq.${id}`, {
    method: "PATCH",
    headers: SB_HEADERS,
    body: JSON.stringify({ status: "done", completed_at: new Date().toISOString() }),
  });
}

export async function deleteTask(id) {
  await fetch(`${DB_URL}/lance_tasks?id=eq.${id}`, {
    method: "DELETE",
    headers: SB_HEADERS,
  });
}
// ─── Second Brain notebook (brain_notes) ─────────────────────────────
// Shared with the Second Brain page on claude.ai. Lance reads pinned and
// recent entries before answering and saves new ones from [BRAIN: ...] tags.
const BRAIN_BOOKS = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"];
const BRAIN_NAMES = {};
BRAIN_BOOKS.forEach(b => { BRAIN_NAMES[b.toLowerCase()] = b; });
Object.assign(BRAIN_NAMES, { psalm: "Psalms", ps: "Psalms", prov: "Proverbs", gen: "Genesis", ex: "Exodus", rom: "Romans", matt: "Matthew", rev: "Revelation", heb: "Hebrews", eph: "Ephesians", phil: "Philippians", col: "Colossians", gal: "Galatians", isa: "Isaiah", jer: "Jeremiah", deut: "Deuteronomy", eccl: "Ecclesiastes", jas: "James" });
const BRAIN_REF_RE = new RegExp("\\b(" + Object.keys(BRAIN_NAMES).sort((a, b) => b.length - a.length).map(s => s.replace(/ /g, "\\s+")).join("|") + ")\\.?\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?)?\\b", "gi");

export function parseScriptureRefs(text) {
  const out = []; const seen = new Set(); let m;
  BRAIN_REF_RE.lastIndex = 0;
  while ((m = BRAIN_REF_RE.exec(text || ""))) {
    const book = BRAIN_NAMES[m[1].toLowerCase().replace(/\s+/g, " ")];
    if (!book) continue;
    const r = book + " " + m[2] + (m[3] ? ":" + m[3] + (m[4] ? "-" + m[4] : "") : "");
    if (!seen.has(r)) { seen.add(r); out.push(r); }
  }
  return out;
}

export async function loadBrainNotes() {
  const cols = "select=id,title,body,kind,tags,refs,pinned,done,example,updated_at";
  const [pinned, recent] = await Promise.all([
    sbGet("brain_notes", `${cols}&id=not.like.pray-*&pinned=eq.true&order=updated_at.desc&limit=8`),
    sbGet("brain_notes", `${cols}&id=not.like.pray-*&order=updated_at.desc&limit=10`),
  ]);
  const seen = new Set(); const out = [];
  for (const n of [...(Array.isArray(pinned) ? pinned : []), ...(Array.isArray(recent) ? recent : [])]) {
    if (!seen.has(n.id)) { seen.add(n.id); out.push(n); }
  }
  return out;
}

// ─── Notebook lookup for the current question ──────────────────────
// The prompt only carries short previews of recent notes. Before each answer,
// Lance searches the WHOLE notebook for notes tied to what Pastor just said
// (a Claude artifact link, a Scripture reference, or the topic words) and
// reads the best matches in full, however old they are.
const ARTIFACT_RE = /claude\.ai\/(?:code\/)?artifact\/([A-Za-z0-9_-]{8,})/gi;
const STOP = new Set("the and for that this with from have what your about into them they their there then than when where which while would could should will just like want need make made does did done been being were was are is it its it's you yours our ours his her him she he we me my mine can cant can't not dont don't yes no okay ok please thanks thank lance pastor note notes notebook save saved see now still also some any all one two get got let lets let's tell show read open look find more much very really here".split(" "));

export function extractArtifactIds(text) {
  const out = []; let m;
  ARTIFACT_RE.lastIndex = 0;
  while ((m = ARTIFACT_RE.exec(text || ""))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

function lookupTerms(text) {
  const clean = String(text || "").replace(/https?:\/\/\S+/gi, " ").replace(ARTIFACT_RE, " ").toLowerCase();
  const words = clean.match(/[a-z][a-z'-]{3,}/g) || [];
  const out = [];
  for (const w of words) {
    const t = w.replace(/'s$/, "").replace(/['-]/g, "");
    if (t.length < 4 || STOP.has(t) || out.includes(t)) continue;
    out.push(t);
  }
  return out.slice(0, 8);
}

// Lance reads whole notebook entries only when Pastor points at the notebook:
// an artifact link, or words like "my notes" or "second brain". A Scripture
// reference or a topic word alone never pulls an entry into the answer.
const NOTEBOOK_INTENT = /\b(note ?book|second brain|my notes?|in my notes|i saved|i wrote down|i jotted|did i save|what did i (?:save|write)|from my (?:notes?|notebook))\b/i;

export async function findRelevantNotes(text, limit = 3) {
  const ids = extractArtifactIds(text);
  if (!ids.length && !NOTEBOOK_INTENT.test(text || "")) return [];
  const refs = parseScriptureRefs(text).map(r => r.replace(/:.*$/, "")); // book + chapter
  const terms = lookupTerms(text);
  if (!ids.length && !refs.length && !terms.length) return [];

  const pats = [...ids, ...refs, ...terms].map(p => p.replace(/[",()*\\]/g, " ").trim()).filter(Boolean);
  const ors = [];
  for (const p of pats) { ors.push(`title.ilike."*${p}*"`, `body.ilike."*${p}*"`); }
  const cols = "select=id,title,body,kind,tags,refs,pinned,done,example,updated_at";
  let rows = [];
  try {
    rows = await sbGet("brain_notes", `${cols}&example=is.false&id=not.like.pray-*&or=(${encodeURIComponent(ors.join(","))})&order=updated_at.desc&limit=40`);
  } catch { return []; }
  if (!Array.isArray(rows)) return [];

  const scored = rows.map(n => {
    const hay = ((n.title || "") + "\n" + (n.body || "") + "\n" + (n.tags || []).join(" ") + "\n" + (n.refs || []).join(" ")).toLowerCase();
    const title = (n.title || "").toLowerCase();
    let s = 0;
    for (const id of ids) if (hay.includes(id.toLowerCase())) s += 100;
    for (const r of refs) if (hay.includes(r.toLowerCase())) s += 6;
    for (const t of terms) { if (title.includes(t)) s += 3; else if (hay.includes(t)) s += 1; }
    return { n, s };
  });
  // A link or a Scripture match always counts; topic words need at least two hits.
  return scored
    .filter(x => x.s >= 2)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => ({ ...x.n, full: true }));
}

const BRAIN_KINDS = ["sermon", "study", "idea", "task", "prayer"];
export function parseBrainTags(text) {
  const re = /\[BRAIN:\s*([^\]]+)\]/gi;
  const out = []; let m;
  while ((m = re.exec(text || "")) !== null) {
    const raw = m[1];
    const bodyAt = raw.search(/\|\s*body\s*=/i);
    const head = bodyAt === -1 ? raw : raw.slice(0, bodyAt);
    const body = bodyAt === -1 ? "" : raw.slice(bodyAt).replace(/^\|\s*body\s*=/i, "").trim();
    const f = {};
    head.split("|").forEach(pair => {
      const eq = pair.indexOf("=");
      if (eq === -1) return;
      f[pair.slice(0, eq).trim().toLowerCase()] = pair.slice(eq + 1).trim();
    });
    const title = (f.title || "").slice(0, 200);
    if (!title && !body) continue;
    const kind = BRAIN_KINDS.includes((f.kind || "").toLowerCase()) ? f.kind.toLowerCase() : "idea";
    const tags = (f.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    out.push({ title, body, kind, tags, refs: parseScriptureRefs(title + "\n" + body), pinned: /^(true|yes)$/i.test(f.pinned || ""), source: "lance" });
  }
  return out;
}

export async function saveBrainNote(note) {
  const r = await fetch(`${DB_URL}/brain_notes`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify(note),
  });
  if (!r.ok) throw new Error(`Notebook save failed (${r.status})`);
  return r.json();
}

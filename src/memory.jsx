import { SUPABASE_URL, SB_HEADERS, SESSION_ID } from "./config";

async function sbGet(table, params = "") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: SB_HEADERS });
  return r.ok ? r.json() : [];
}

async function sbPost(table, data, extra = {}) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...SB_HEADERS, ...extra },
    body: JSON.stringify(data),
  });
}

async function sbUpsert(table, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
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
  return t.replace(/\[MEMORY:[^\]]+\]/gi, "").replace(/\[PROFILE:[^\]]+\]/gi, "").replace(/\[FLYER:[^\]]+\]/gi, "").replace(/\[TEXT:[^\]]+\]/gi, "").replace(/\[EMAIL:[^\]]+\]/gi, "").replace(/\[CALENDAR:[^\]]+\]/gi, "").replace(/\[VIDEO:[^\]]+\]/gi, "").trim();
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

export function parseCalendarTag(text) {
  const re = /\[CALENDAR:\s*([^\]]+)\]/i;
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
  return { title: fields.title || "", start: fields.start || "", end: fields.end || "", location: fields.location || "", description: fields.description || "" };
}

export function parseEmailTag(text) {
  const re = /\[EMAIL:\s*([^\]]+)\]/i;
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
  return { to: fields.to || "", subject: fields.subject || "", body: fields.body || "" };
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

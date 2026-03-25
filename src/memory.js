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

export async function loadMemory() {
  return sbGet("lance_memory", "active=eq.true&order=confidence.desc,updated_at.desc&limit=40");
}

export async function loadRecentSessions() {
  return sbGet("lance_sessions", "summary=not.is.null&order=created_at.desc&limit=5");
}

export async function saveMessage(role, content, lane = "general") {
  await sbPost("lance_conversations", { session_id: SESSION_ID, role, content, lane });
}

export async function saveMemoryFact(category, fact, confidence, sourceSession) {
  await sbPost("lance_memory", { category, fact, confidence, source_session: sourceSession, active: true });
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
  const re = /\[MEMORY:\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(\d)\s*\]/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    tags.push({ category: m[1].trim().toLowerCase(), fact: m[2].trim(), confidence: parseInt(m[3]) });
  }
  return tags;
}

export function stripMemoryTags(t) {
  return t.replace(/\[MEMORY:[^\]]+\]/gi, "").trim();
}

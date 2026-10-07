export const SUPABASE_URL = "https://dtqmzdteomgjresjfrog.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0cW16ZHRlb21nanJlc2pmcm9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTU1NDYsImV4cCI6MjA4NzQ5MTU0Nn0.C6PQfoGgx4Y6g0f26qlI6WwAaY46Mde6SUmMIUfBjSw";
export const VOICE_URL   = `${SUPABASE_URL}/functions/v1/lance-tts`;
export const DOCX_URL    = `${SUPABASE_URL}/functions/v1/lance-docx`;
export const SEARCH_URL  = `${SUPABASE_URL}/functions/v1/lance-search`;
export const MODEL       = "claude-sonnet-4-5";
export const STAFF_CALENDAR_CODE = "victory2026"; // must match public.staff_access on Supabase; update here if Pastor changes it on the calendar page
export const SESSION_ID  = crypto.randomUUID();
// Lance's own tables are locked. Every read and write goes through the
// lance-db gateway, which checks the passcode saved on this device.
export const DB_URL = `${SUPABASE_URL}/functions/v1/lance-db`;
const KEY_STORE = "lance_unlock_key";
export function getLanceKey() {
  try { return localStorage.getItem(KEY_STORE) || ""; } catch { return ""; }
}
export const SB_HEADERS  = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer": "return=representation",
  "x-lance-key": getLanceKey(),
};
export function setLanceKey(k) {
  const v = (k || "").trim().toLowerCase();
  SB_HEADERS["x-lance-key"] = v;
  try { v ? localStorage.setItem(KEY_STORE, v) : localStorage.removeItem(KEY_STORE); } catch {}
}
// "ok" when the passcode opens the gateway, "locked" when refused, "offline" when unreachable.
export async function checkLanceKey(k) {
  try {
    const r = await fetch(`${DB_URL}/check`, { headers: { ...SB_HEADERS, "x-lance-key": (k || "").trim().toLowerCase() } });
    if (r.ok) return "ok";
    return r.status === 401 ? "locked" : "offline";
  } catch { return "offline"; }
}

// Lance's ears. Takes a short recording of Pastor speaking (WAV from the app),
// sends it to ElevenLabs speech-to-text, and returns the words.
// Only requests carrying Lance's unlock passcode get through.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-lance-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

let keyHash: string | null = null, keyAt = 0;
async function wantHash() {
  if (keyHash && Date.now() - keyAt < 60_000) return keyHash;
  const r = await fetch(`${SB_URL}/rest/v1/lance_keys?id=eq.pastor&select=key_hash`, { headers: svc });
  const rows = r.ok ? await r.json() : [];
  keyHash = rows[0]?.key_hash ?? null; keyAt = Date.now();
  return keyHash;
}
async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

let elKey: string | null = null, elAt = 0;
async function elevenKey() {
  if (elKey && Date.now() - elAt < 5 * 60_000) return elKey;
  let k = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
  if (!k) {
    const r = await fetch(`${SB_URL}/rest/v1/app_secrets?id=eq.elevenlabs&select=value`, { headers: svc });
    const rows = r.ok ? await r.json() : [];
    k = rows[0]?.value ?? "";
  }
  elKey = k; elAt = Date.now();
  return k;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const given = (req.headers.get("x-lance-key") || "").trim().toLowerCase();
  const want = await wantHash();
  if (!given || !want || !same(await sha256(given), want)) {
    await new Promise(r => setTimeout(r, 1200));
    return json(401, { error: "locked" });
  }

  const key = await elevenKey();
  if (!key) return json(500, { error: "no_voice_key" });

  try {
    const audio = await req.arrayBuffer();
    if (audio.byteLength < 2000) return json(200, { text: "" });
    const type = req.headers.get("content-type") || "audio/wav";
    const ext = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("webm") ? "webm" : type.includes("mpeg") ? "mp3" : "wav";

    const form = new FormData();
    form.append("model_id", "scribe_v1");
    form.append("language_code", "eng");
    form.append("tag_audio_events", "false");
    form.append("file", new Blob([audio], { type }), `speech.${ext}`);

    const t0 = Date.now();
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
    const txt = await res.text();
    if (!res.ok) {
      console.error("stt error", res.status, txt.slice(0, 300));
      elKey = null;
      return json(502, { error: "stt_failed", status: res.status, detail: txt.slice(0, 300) });
    }
    const data = JSON.parse(txt);
    const text = String(data.text || "").replace(/\s+/g, " ").trim();
    return json(200, { text, ms: Date.now() - t0 });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});

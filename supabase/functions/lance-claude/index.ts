// Lance's connection to Claude. Only requests carrying Lance's unlock
// passcode get through. The Anthropic key lives in the project's secrets.
// When the app asks for stream:true, the reply flows back word by word
// (server-sent events) so Lance can start talking before he finishes thinking.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-lance-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

let keyHash: string | null = null, keyAt = 0;
async function wantHash() {
  if (keyHash && Date.now() - keyAt < 60_000) return keyHash;
  const r = await fetch(`${SB_URL}/rest/v1/lance_keys?id=eq.pastor&select=key_hash`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: { message: "Method not allowed" } });

  const given = (req.headers.get("x-lance-key") || "").trim().toLowerCase();
  const want = await wantHash();
  if (!given || !want || !same(await sha256(given), want)) {
    await new Promise(r => setTimeout(r, 1200));
    return json(401, { error: { message: "Lance needs his unlock passcode." } });
  }
  if (!ANTHROPIC_KEY) return json(500, { error: { message: "Claude isn't set up on the server." } });

  try {
    const body = await req.json();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    if (body && body.stream === true && res.ok && res.body) {
      return new Response(res.body, {
        status: 200,
        headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }
    const data = await res.json();
    return json(res.status, data);
  } catch (e) {
    return json(500, { error: { message: String(e) } });
  }
});

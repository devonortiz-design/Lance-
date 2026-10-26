import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-lance-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Key and voice come from the locked app_secrets table (service role only):
//   id 'elevenlabs'       -> API key
//   id 'elevenlabs_voice' -> voice id
// Env secrets ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID override when set.
// Uses ElevenLabs' Flash model, their fastest, so Lance starts talking sooner.
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb'; // George, British male (free-tier premade voice)
let cache: { key: string; voice: string; at: number } | null = null;

async function getConfig() {
  if (cache && Date.now() - cache.at < 5 * 60 * 1000) return cache;
  let key = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
  let voice = Deno.env.get('ELEVENLABS_VOICE_ID') ?? '';
  try {
    const r = await fetch(`${SB_URL}/rest/v1/app_secrets?id=in.(elevenlabs,elevenlabs_voice)&select=id,value`, {
      headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
    });
    if (r.ok) {
      for (const row of await r.json()) {
        if (row.id === 'elevenlabs' && !key) key = row.value;
        if (row.id === 'elevenlabs_voice' && !voice) voice = row.value;
      }
    }
  } catch (_) { /* fall through */ }
  cache = { key, voice: voice || DEFAULT_VOICE, at: Date.now() };
  return cache;
}

const fallback = (error: string, status = 0) => new Response(JSON.stringify({ error, status, fallback: true }), {
  status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }
});

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const { text } = await req.json();
    if (!text) return new Response('Missing text', { status: 400, headers: CORS });
    const { key, voice } = await getConfig();
    if (!key) return fallback('ElevenLabs key not set.');
    const clean = text
      .replace(/#{1,6} /g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/^[-*] /gm, '')
      .replace(/\[(MEMORY|PROFILE|FLYER|TEXT|VIDEO|TASK|STAFF_EVENT|STAFF_NOTE|BRAIN):[^\]]+\]/gi, '')
      .trim()
      .slice(0, 2500);

    if (!clean) return new Response('Empty text after cleaning', { status: 400, headers: CORS });

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': key },
      body: JSON.stringify({
        text: clean,
        model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.4, use_speaker_boost: true }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('ElevenLabs error:', res.status, errText);
      cache = null; // re-read config next time in case the key or voice changed
      return fallback(errText, res.status);
    }

    const audio = await res.arrayBuffer();
    if (audio.byteLength < 100) return fallback('Empty audio returned');

    return new Response(audio, { headers: { ...CORS, 'Content-Type': 'audio/mpeg' } });
  } catch(e) {
    console.error('lance-tts exception:', e);
    return fallback(String(e));
  }
});

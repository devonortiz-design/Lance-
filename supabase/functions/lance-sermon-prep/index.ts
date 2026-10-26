import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
// The key lives only in the project's secrets. Never type a key into this file.
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!ANTHROPIC_KEY) return new Response(JSON.stringify({ error: "Claude isn't set up on the server." }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const { reference, text, topic } = await req.json();
    const subject = reference || topic || text || 'not specified';

    const prompt = `You are Lance, sermon prep assistant for Pastor Devon Ortiz, senior pastor of Victory Baptist Church Fremont CA.

Pastor's standards:
- KJV only, quoted word for word with the KJV's own punctuation. Never write "(KJV)".
- Christocentric -- Christ must be at the center of every sermon
- Expository with cultural depth
- Bryan Chapell fallen condition focus: identify the human brokenness the text addresses, then show Christ as the answer
- Greek and Hebrew word studies with Strong's numbers and transliterations
- Historical and cultural background: ancient Near East, Second Temple Judaism, Greco-Roman world, honor/shame culture
- Cross-references always
- Active voice, direct sentences, no filler. No em dashes. No semicolons in your own wording.
- Outside Scripture quotes, never use these words: can, may, just, that, it, very, really, actually, certainly, probably, basically, could, maybe, however, hence, furthermore, moreover, powerful, imagine, realm, unlock, discover, illuminate, unveil, pivotal, intricate, testament, landscape.
- Verify every verse and every claim yourself. If you cannot confirm a claim, leave it out. Never ask Pastor to check a reference.
- Output only the prep document. No note to Pastor, no questions, no offers at the end.

Bible reference or topic: ${subject}

Produce a complete sermon prep framework:

# SERMON PREP: ${subject}

## THE TEXT
[Quote the passage in full from KJV]

## GREEK / HEBREW WORD STUDIES
[Key words with Strong's numbers, transliterations, definitions, usage]

## HISTORICAL & CULTURAL BACKGROUND
[Ancient Near East, Second Temple Judaism, Greco-Roman context, honor/shame dynamics]

## FALLEN CONDITION FOCUS
[What human brokenness does this text address? Be specific and pastoral.]

## CHRISTOCENTRIC CONNECTION
[How does this text point to Christ? Typology, fulfillment, redemptive thread]

## CROSS-REFERENCES
[5-8 supporting passages with brief notes]

## STRUCTURAL OUTLINE
[3-4 point expository outline with sub-points, all flowing from the text]

## ILLUSTRATIVE ANGLES
[2-3 angles for illustration -- cultural, contemporary, personal]

## APPLICATION
[Specific, actionable application points for the congregation]`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    const content = data.content?.[0]?.text || data.error?.message || 'Error generating sermon prep';
    return new Response(JSON.stringify({ content }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SB_URL = 'https://dtqmzdteomgjresjfrog.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0cW16ZHRlb21nanJlc2pmcm9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTU1NDYsImV4cCI6MjA4NzQ5MTU0Nn0.C6PQfoGgx4Y6g0f26qlI6WwAaY46Mde6SUmMIUfBjSw';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const today = new Date().toISOString().split('T')[0];

    // Check cache first
    const cacheRes = await fetch(`${SB_URL}/rest/v1/devotions_cache?date=eq.${today}&select=content`, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
    });
    const cache = await cacheRes.json();
    if (cache.length > 0) {
      return new Response(JSON.stringify({ content: cache[0].content, cached: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const prompt = `You are Lance, devotional writer for Pastor Devon Ortiz.

Write a daily devotion for ${dayName}. Pastor's standards:
- KJV only
- Christocentric — always point to Christ
- Expository depth with pastoral warmth
- Direct sentences, active voice, no filler
- Practical and personally applicable
- Written for Pastor Devon himself — a pastor, professor, and leader

Structure:
# Daily Devotion — ${dayName}

## [Title]

**Text:** [KJV passage — 1-5 verses]

[3-4 paragraphs of expository reflection. Go deep. Cultural background, word studies where relevant, Christocentric application. Write like Bryan Chapell meets Charles Spurgeon.]

**Reflection:** [One penetrating question for Pastor to sit with today]

**Prayer:** [A pastoral prayer in first person, 3-4 sentences]`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    const content = data.content?.[0]?.text || '';

    // Cache it
    await fetch(`${SB_URL}/rest/v1/devotions_cache`, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ date: today, content })
    });

    return new Response(JSON.stringify({ content, cached: false }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});

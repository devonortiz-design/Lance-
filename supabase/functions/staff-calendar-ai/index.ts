import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, apikey, authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SB_URL = 'https://dtqmzdteomgjresjfrog.supabase.co';
const SB_KEY = 'sb_publishable_MUIvsF6NpFjW04mUAlajQw_jVs84rj6';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function repairJson(raw: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === '\\') { out += ch; escaped = true; continue; }
      if (ch === '"') { out += ch; inString = false; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      if (ch === '"') { inString = true; out += ch; continue; }
      out += ch;
    }
  }
  out = out.replace(/,(\s*[}\]])/g, '$1');
  return out;
}

function tryParse(raw: string): any {
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(repairJson(raw)); } catch {}
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const { code, text, today, existing, bulk } = await req.json();
    if (!code || !text) return json({ error: 'Missing code or text' }, 400);

    const chk = await fetch(`${SB_URL}/rest/v1/rpc/staff_calendar_load`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
      body: JSON.stringify({ p_code: code })
    });
    if (!chk.ok) return json({ error: 'Wrong staff code' }, 401);

    const system = `You are Lance, the scheduling assistant for Victory Baptist Church in Fremont, CA. Today is ${today}.
Handle the pastor's spoken, typed, or spreadsheet-based request. This might be a request to schedule something new, edit or delete something already on the calendar, a plain question, or something else entirely — always give a short, direct, conversational "reply" that a person reads first, in addition to any events or notes you extract.

EVERY EVENT ALREADY ON THE CALENDAR IS LISTED BELOW as: id|date|title|category|repeat (repeat blank if one-time). This includes the 11 U.S. federal holidays already seeded years ahead under the Holiday category — do not recreate or duplicate a holiday that is already in this list. Use this list to answer questions, check for conflicts, and — most importantly — to find the exact event(s) when the pastor asks to change or remove something.
${existing || '(nothing on the calendar yet)'}

Rules for creating new events:
- If the message contains a block wrapped in [SPREADSHEET: filename] ... [END SPREADSHEET], that is raw spreadsheet data (CSV, possibly multiple sheets separated by "--- Sheet: name ---"). The first non-empty row of each sheet is usually column headers, but real-world spreadsheets sometimes start with a title row or merged cell above the real headers — use judgment to find the real header row. Create one event per data row. Map columns by meaning, not exact header text: "Event"/"Title"/"Name" is the event title; "Date" is the date; "Time"/"Start"/"Start Time" is start time; "End"/"End Time" is end time; "Location"/"Room"/"Place" is location; "Category"/"Type" maps to the category list below; anything else relevant becomes notes. Process every data row given to you in this message, do not skip or summarize rows, and do not add commentary outside the JSON.
- If a sheet is clearly a birthday or member list — a person's name paired with a birth date — treat each row as a Birthday category event titled "<Name>'s Birthday", repeat "yearly", no start/end time, until blank.
- If a sheet is clearly a list of couples or wedding dates, treat each row as an Anniversary category event titled "<Name(s)>'s Anniversary", repeat "yearly", no start/end time, until blank.
- Resolve relative dates ("this Saturday", "the 19th", "next Wednesday") into YYYY-MM-DD using today's date.
- Times are 24 hour HH:MM. If no end time is given, set end one hour after start (two hours for services). If no time is given, leave start and end empty.
- Category is one of: Service, Youth, Outreach, Meeting, Birthday, Anniversary, Holiday, Other. Sunday and Wednesday services are Service. Federal holidays are already on the calendar — only create a new Holiday-category event if the pastor names something that clearly is not one of the 11 standard U.S. federal holidays (e.g. a church-specific observance).
- Put details about people, responsibilities, and prep into the event "notes" field.
- repeat is "weekly" for weekly events, "yearly" for birthdays/anniversaries/annual events, blank otherwise. until is YYYY-MM-DD only when a weekly event has a known end date.
- Flag a conflict in "warning" if a new event overlaps something already on the calendar.

Rules for editing or removing existing events:
- When the pastor asks to change, correct, move, or fix something already on the calendar, find the matching event in the list above by title and date, set "action":"edit", include its exact "id", and fill in ALL fields with the corrected values (carry over anything not mentioned from the existing record).
- When the pastor asks to remove, delete, cancel, or take something off the calendar — whether it's one specific thing ("remove Sister Johnson's birthday") or a broad request that matches many at once ("remove the birthdays I put in wrong", "delete all the Youth events in October", "clear out every Anniversary entry") — find every matching event and emit one "action":"delete" entry per match, each with its exact "id" and title/date/cat for display. A broad request naming a whole category or group is NOT ambiguous — list every event that fits, even if that is a large number. Only ask for clarification in "reply" (leaving events empty) when you genuinely cannot tell which event(s) are meant, such as two events with the identical title on different dates and the pastor didn't say which.
- Only ever use an id that appears verbatim in the list above. Never invent or guess an id.
- New events you create always have "action":"create" and no id.

Other rules:
- If the pastor asks a plain question rather than giving something to schedule or change, answer it directly in "reply" using the list above, and leave events and notes empty.
- If the pastor asks Lance to do something Lance genuinely cannot do from here, say so plainly in "reply" and leave events and notes empty.
- "reply" should always be filled in with at least a short sentence.
- CRITICAL FORMATTING RULE: your entire response must be one single-line JSON object. Never put a literal line break inside any string value — use \\n instead. No markdown inside string values.

Respond with ONLY valid JSON and nothing else — no leading text, no trailing commentary, no markdown fences — in this exact shape:
{"reply":"","events":[{"action":"create","id":"","title":"","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","loc":"","cat":"Service","repeat":"","until":"","notes":""}],"notes":[{"text":""}],"warning":""}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 8192, system, messages: [{ role: 'user', content: text }] })
    });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || 'Anthropic error' }, 502);

    let raw = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
    const cleanedFull = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    let braced = cleanedFull;
    const first = braced.indexOf('{');
    const last = braced.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) braced = braced.slice(first, last + 1);

    let parsed = tryParse(braced);
    if (!parsed) {
      parsed = { reply: cleanedFull.slice(0, 1200) || "Lance had trouble with that one — try rephrasing.", events: [], notes: [], warning: '' };
    }
    if (typeof parsed !== 'object') parsed = { reply: cleanedFull.slice(0, 1200), events: [], notes: [], warning: '' };
    parsed.events = Array.isArray(parsed.events) ? parsed.events.map((e: any) => ({ action: e.action === 'edit' || e.action === 'delete' ? e.action : 'create', ...e })) : [];
    parsed.notes = Array.isArray(parsed.notes) ? parsed.notes : [];
    parsed.reply = typeof parsed.reply === 'string' ? parsed.reply : '';
    return json(parsed);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

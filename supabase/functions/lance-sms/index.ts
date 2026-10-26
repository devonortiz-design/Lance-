import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Set these once Pastor provides Twilio credentials, via Supabase Edge Function secrets.
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_FROM = Deno.env.get('TWILIO_FROM_NUMBER') ?? '';
const PASTOR_PHONE = Deno.env.get('PASTOR_PHONE_NUMBER') ?? '';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const { message, to } = await req.json();
    if (!message) return new Response(JSON.stringify({ error: 'Missing message' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    if (!TWILIO_SID || !TWILIO_AUTH || !TWILIO_FROM) {
      return new Response(JSON.stringify({
        error: 'Twilio not configured yet. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, and PASTOR_PHONE_NUMBER as Edge Function secrets.',
        configured: false
      }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const destination = to || PASTOR_PHONE;
    if (!destination) {
      return new Response(JSON.stringify({ error: 'No destination phone number set', configured: false }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const auth = btoa(`${TWILIO_SID}:${TWILIO_AUTH}`);
    const body = new URLSearchParams({ To: destination, From: TWILIO_FROM, Body: String(message).slice(0, 1500) });

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.message || 'Twilio send failed', twilioError: data }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, sid: data.sid }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('lance-sms error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});

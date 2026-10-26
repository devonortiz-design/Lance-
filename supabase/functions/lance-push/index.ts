// Lance push notifications. Routes (all POST):
//   /subscribe  passcode  save this device
//   /test       passcode  send a test push now
//   /send       passcode or cron token  body {title, body, url}
//   /dispatch   cron token  send due rows from lance_notifications where channel = 'push'
import webpush from "npm:web-push@3.6.7";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, prefer, x-lance-key, x-cron-token, x-client-info",
  "Access-Control-Max-Age": "86400",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function secret(id: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets?id=eq.${id}&select=value`, { headers: svc });
  const rows = r.ok ? await r.json() : [];
  return rows[0]?.value ?? null;
}
async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function passcodeOk(req: Request) {
  const given = (req.headers.get("x-lance-key") || "").trim().toLowerCase();
  if (!given) return false;
  const r = await fetch(`${SB_URL}/rest/v1/lance_keys?id=eq.pastor&select=key_hash`, { headers: svc });
  const rows = r.ok ? await r.json() : [];
  const want = rows[0]?.key_hash;
  return !!want && same(await sha256(given), want);
}
async function cronOk(req: Request) {
  const given = req.headers.get("x-cron-token") || "";
  const want = await secret("push_cron_token");
  return !!given && !!want && same(given, want);
}

let ready = false;
async function init() {
  if (ready) return;
  const pub = await secret("vapid_public"), priv = await secret("vapid_private");
  if (!pub || !priv) throw new Error("vapid keys missing");
  webpush.setVapidDetails("mailto:pastor@vbcfremont.org", pub, priv);
  ready = true;
}

async function pushAll(payload: { title: string; body: string; url?: string }) {
  await init();
  const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions?select=*`, { headers: svc });
  const subs: any[] = r.ok ? await r.json() : [];
  let sent = 0, failed = 0, lastErr = "";
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: payload.title, body: payload.body, url: payload.url || "/" }),
        { TTL: 3600, urgency: "high" },
      );
      sent++;
      await fetch(`${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
        method: "PATCH", headers: { ...svc, "Content-Type": "application/json" },
        body: JSON.stringify({ last_ok_at: new Date().toISOString() }),
      });
    } catch (e: any) {
      failed++;
      lastErr = `${e?.statusCode || ""} ${e?.body || e?.message || e}`.slice(0, 200);
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await fetch(`${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE", headers: svc });
      }
    }
  }
  return { devices: subs.length, sent, failed, error: lastErr };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "post_only" });
  const path = new URL(req.url).pathname.split("/lance-push")[1]?.replace(/\/+$/, "") || "";
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  try {
    if (path === "/subscribe") {
      if (!(await passcodeOk(req))) return json(401, { error: "locked" });
      const sub = body.subscription;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return json(400, { error: "bad_subscription" });
      const up = await fetch(`${SB_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
        method: "POST",
        headers: { ...svc, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device: String(body.device || "").slice(0, 120) }),
      });
      return up.ok ? json(200, { ok: true }) : json(500, { error: "save_failed" });
    }
    if (path === "/test") {
      if (!(await passcodeOk(req))) return json(401, { error: "locked" });
      return json(200, await pushAll({ title: "Lance", body: "Notifications are on, Pastor.", url: "/" }));
    }
    if (path === "/send") {
      if (!(await passcodeOk(req)) && !(await cronOk(req))) return json(401, { error: "locked" });
      if (!body.title || !body.body) return json(400, { error: "title_and_body_required" });
      return json(200, await pushAll({ title: String(body.title).slice(0, 80), body: String(body.body).slice(0, 300), url: body.url }));
    }
    if (path === "/dispatch") {
      if (!(await cronOk(req))) return json(401, { error: "locked" });
      const now = new Date().toISOString();
      const r = await fetch(`${SB_URL}/rest/v1/lance_notifications?channel=eq.push&sent=eq.false&send_at=lte.${encodeURIComponent(now)}&select=*&order=send_at.asc&limit=20`, { headers: svc });
      const rows: any[] = r.ok ? await r.json() : [];
      const out: any[] = [];
      for (const n of rows) {
        const res = await pushAll({ title: n.title || "Lance", body: n.message, url: n.url || "/" });
        await fetch(`${SB_URL}/rest/v1/lance_notifications?id=eq.${n.id}`, {
          method: "PATCH", headers: { ...svc, "Content-Type": "application/json" },
          body: JSON.stringify({ sent: res.sent > 0, sent_at: new Date().toISOString(), error: res.sent > 0 ? null : (res.error || "no devices") }),
        });
        out.push({ id: n.id, ...res });
      }
      return json(200, { processed: out.length, results: out });
    }
    return json(404, { error: "unknown_route" });
  } catch (e) {
    return json(500, { error: String((e as any)?.message || e) });
  }
});

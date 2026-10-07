// VBC Books gateway. Checks the bookkeeping passcode, then reads and writes
// the church's bookkeeping tables with the service role. Nothing else passes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-books-key, x-client-info",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const INCOME = ["Tithes & Offerings", "Love Gifts", "Missions (Incoming)", "Events Income", "Transfer In", "Deposit", "Other Income"];
const EXPENSE = ["Facility / Rent", "Payroll", "Staff Payments", "Honorariums", "Ministry Expenses", "Missions (Outgoing)", "Eating Out", "Events", "Gas", "Reimbursements", "Transfer Out", "Personal Expenses", "Insurance", "Subscriptions", "Other Expense"];

let keyHash: string | null = null, keyAt = 0;
async function wantHash() {
  if (keyHash && Date.now() - keyAt < 60_000) return keyHash;
  const r = await fetch(`${SB_URL}/rest/v1/lance_keys?id=eq.books&select=key_hash`, { headers: svc });
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
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...svc, "Content-Type": "application/json", ...(init.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`Database error ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const norm = (s: string) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
const keyOf = (t: { date: string; amount: number | string; type: string; description: string }) =>
  `${t.date}|${Number(t.amount).toFixed(2)}|${t.type}|${norm(t.description)}`;

async function categorize(rows: { id: string; description: string; amount: number; date: string }[]) {
  const out = new Map<string, { category: string; review: boolean }>();
  for (let i = 0; i < rows.length; i += 40) {
    const batch = rows.slice(i, i + 40);
    try {
      const r = await fetch(`${SB_URL}/functions/v1/categorize-transactions`, {
        method: "POST", headers: { ...svc, "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: batch }),
      });
      const res = r.ok ? await r.json() : [];
      if (Array.isArray(res)) for (const c of res) out.set(String(c.id), { category: c.category, review: !!c.review });
    } catch { /* left for review below */ }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const given = (req.headers.get("x-books-key") || "").trim().toLowerCase();
  const want = await wantHash();
  if (!given || !want || !same(await sha256(given), want)) {
    await new Promise(r => setTimeout(r, 1200));
    return json(401, { error: "locked", message: "That passcode didn't match." });
  }

  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { error: "Send a JSON body." }); }

  try {
    switch (body.action) {
      case "check":
        return json(200, { ok: true, categories: { income: INCOME, expense: EXPENSE } });

      case "list": {
        const from = isDate(body.from) ? body.from : "1900-01-01";
        const to = isDate(body.to) ? body.to : "2999-12-31";
        const rows = await rest(`vbc_transactions?select=id,date,type,category,amount,description,review&date=gte.${from}&date=lte.${to}&order=date.desc,created_at.desc&limit=10000`);
        return json(200, { rows });
      }

      case "range": {
        const rows = await rest(`vbc_transactions?select=date&order=date.asc&limit=1`);
        const last = await rest(`vbc_transactions?select=date&order=date.desc&limit=1`);
        return json(200, { first: rows[0]?.date ?? null, last: last[0]?.date ?? null });
      }

      case "preview":
      case "import": {
        const incoming = Array.isArray(body.rows) ? body.rows : [];
        const clean = incoming
          .map((r: any) => ({ date: r.date, amount: Number(r.amount), description: String(r.description || "").slice(0, 500) }))
          .filter((r: any) => isDate(r.date) && isFinite(r.amount) && r.amount !== 0)
          .map((r: any) => ({ ...r, type: r.amount > 0 ? "Income" : "Expense" }));
        if (!clean.length) return json(200, { added: 0, duplicates: 0, newRows: [] });
        const dates = clean.map((r: any) => r.date).sort();
        const existing = await rest(`vbc_transactions?select=date,amount,type,description&date=gte.${dates[0]}&date=lte.${dates[dates.length - 1]}&limit=10000`);
        const seen = new Map<string, number>();
        for (const e of existing) { const k = keyOf(e); seen.set(k, (seen.get(k) || 0) + 1); }
        const fresh: any[] = [];
        for (const r of clean) {
          const k = keyOf({ ...r, amount: Math.abs(r.amount) });
          const n = seen.get(k) || 0;
          if (n > 0) seen.set(k, n - 1); else fresh.push(r);
        }
        if (body.action === "preview") return json(200, { added: fresh.length, duplicates: clean.length - fresh.length, newRows: fresh.slice(0, 500) });

        const withIds = fresh.map((r, i) => ({ ...r, id: String(i) }));
        const cats = await categorize(withIds.map(r => ({ id: r.id, description: r.description, amount: r.amount, date: r.date })));
        const rows = withIds.map(r => {
          const c = cats.get(r.id);
          const list = r.type === "Income" ? INCOME : EXPENSE;
          const ok = c && list.includes(c.category);
          return { date: r.date, type: r.type, category: ok ? c!.category : (r.type === "Income" ? "Other Income" : "Other Expense"), amount: Math.abs(r.amount), description: r.description, review: ok ? c!.review : true };
        });
        for (let i = 0; i < rows.length; i += 500) {
          await rest("vbc_transactions", { method: "POST", body: JSON.stringify(rows.slice(i, i + 500)), headers: { Prefer: "return=minimal" } });
        }
        return json(200, { added: rows.length, duplicates: clean.length - rows.length, flagged: rows.filter(r => r.review).length });
      }

      case "update": {
        const id = String(body.id || "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: "Missing transaction id." });
        const patch: Record<string, unknown> = {};
        if (typeof body.category === "string") {
          const isInc = INCOME.includes(body.category), isExp = EXPENSE.includes(body.category);
          if (!isInc && !isExp) return json(400, { error: "Pick a category from the list." });
          patch.category = body.category; patch.type = isInc ? "Income" : "Expense";
        }
        if (typeof body.review === "boolean") patch.review = body.review;
        if (!Object.keys(patch).length) return json(400, { error: "Nothing to change." });
        const out = await rest(`vbc_transactions?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch), headers: { Prefer: "return=representation" } });
        return json(200, { row: out[0] ?? null });
      }

      case "delete": {
        const id = String(body.id || "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: "Missing transaction id." });
        await rest(`vbc_transactions?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
        return json(200, { ok: true });
      }

      case "summary": {
        const month = String(body.month || "");
        if (!/^\d{4}-\d{2}$/.test(month)) return json(400, { error: "Pick a month." });
        const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
        if (!apiKey) return json(500, { error: "The summary writer isn't set up on the server." });
        const [y, m] = month.split("-").map(Number);
        const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        const startPrior = new Date(Date.UTC(y, m - 4, 1)).toISOString().slice(0, 10);
        const rows = await rest(`vbc_transactions?select=date,type,category,amount&date=gte.${startPrior}&date=lte.${end}&limit=20000`);
        const label = (yy: number, mm: number) => new Date(Date.UTC(yy, mm - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
        const tally = (ym: string) => {
          const t = { income: 0, expenses: 0, transfersIn: 0, transfersOut: 0, flagged: 0, byCategory: {} as Record<string, number> };
          for (const r of rows.filter((r: any) => r.date.startsWith(ym))) {
            const a = Number(r.amount);
            if (r.category === "Transfer In") t.transfersIn += a;
            else if (r.category === "Transfer Out") t.transfersOut += a;
            else { if (r.type === "Income") t.income += a; else t.expenses += a; t.byCategory[`${r.type}: ${r.category}`] = (t.byCategory[`${r.type}: ${r.category}`] || 0) + a; }
          }
          const round = (n: number) => Math.round(n * 100) / 100;
          return { income: round(t.income), expenses: round(t.expenses), net: round(t.income - t.expenses), transfersIn: round(t.transfersIn), transfersOut: round(t.transfersOut),
            byCategory: Object.fromEntries(Object.entries(t.byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round(v)])) };
        };
        const thisMonth = tally(month);
        if (!thisMonth.income && !thisMonth.expenses) return json(200, { summary: "No transactions recorded for this month yet." });
        const prior: Record<string, unknown> = {};
        for (let k = 1; k <= 3; k++) {
          const d = new Date(Date.UTC(y, m - 1 - k, 1));
          const ym = d.toISOString().slice(0, 7);
          const t = tally(ym);
          if (t.income || t.expenses) prior[label(d.getUTCFullYear(), d.getUTCMonth() + 1)] = { income: t.income, expenses: t.expenses, net: t.net };
        }
        const prompt = `You write the monthly financial summary that Victory Baptist Church in Newark, California gives its deacons and church board.

Month: ${label(y, m)}
This month's figures (transfers between the church's own accounts are excluded from income and expenses):
${JSON.stringify(thisMonth, null, 2)}

Prior months available for comparison (only these; anything not listed is unknown):
${Object.keys(prior).length ? JSON.stringify(prior, null, 2) : "None on record."}

Write three short paragraphs of plain prose: what came in, what went out, and the net result with anything the board should notice. Compare only against the prior months listed above, and say nothing about trends, history, or averages beyond them. State figures exactly as given, rounded to whole dollars. Do not guess at causes. No headings, no bullet points, no markdown, no greeting, no sign-off. Close with one plain sentence on stewardship.`;
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
        });
        const d = await r.json().catch(() => ({}));
        const text = d?.content?.[0]?.text?.trim();
        if (!r.ok || !text) return json(502, { error: "The summary writer didn't answer. Try again in a minute." });
        return json(200, { summary: text.replace(/^#+\s.*\n+/gm, "").replace(/\*\*/g, "").trim() });
      }

      default:
        return json(400, { error: "Unknown action." });
    }
  } catch (e) {
    return json(500, { error: String((e as Error).message || e) });
  }
});

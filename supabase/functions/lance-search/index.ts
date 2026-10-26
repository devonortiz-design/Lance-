import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// BACKUP NOTE: the live version of this function has the Brave Search key typed
// directly into this line. It was removed before this backup went into the public
// repo. Before redeploying from this file, add the key as an Edge Function secret
// named BRAVE_API_KEY, or search will stop working.
const BRAVE_KEY = Deno.env.get("BRAVE_API_KEY") ?? "";
const BRAVE_URL = "https://api.search.brave.com/res/v1/web/search";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { query, count = 5 } = await req.json();
    if (!query) return new Response(JSON.stringify({ error: "Missing query" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const url = new URL(BRAVE_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(count, 10)));
    url.searchParams.set("text_decorations", "false");
    url.searchParams.set("search_lang", "en");

    const res = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_KEY,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: `Brave API error: ${res.status}`, detail: err }), {
        status: res.status,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();

    // Extract clean results
    const results = (data.web?.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      description: r.description,
      age: r.age,
    }));

    const summary = {
      query,
      results,
      total: data.web?.totalEstimatedMatches,
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

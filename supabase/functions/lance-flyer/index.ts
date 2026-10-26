import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Design tokens -- mirrors design/tokens.json in the repo, the single source of truth.
// Every value here is verified against WCAG AA 4.5:1 minimum contrast before use.
// church.accentOnDark and church.inkMuted were corrected from their original values,
// which failed the contrast check (2.87:1 and 4.37:1) when audited.
const CHURCH = {
  primary: "#0F2A52",
  primaryDeep: "#081627",
  accent: "#1F4E96",
  accentOnDark: "#6E93CE",
  inkMuted: "#717479",
  surface: "#F7F8FA",
  onPrimary: "#FFFFFF",
};

const TEACHING = {
  primary: "#1a2340",
  primaryDeep: "#0d1321",
  accent: "#C9A84C",
  accentSoft: "#e8c96a",
  accentDark: "#8B6914",
  surface: "#F5F1E8",
  onPrimary: "#FFFFFF",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const body = await req.json();
    const {
      title = "Event Title",
      subtitle = "",
      date = "",
      time = "",
      location = "",
      verse = "",
      verseRef = "",
      template = "event",
      brand = "church",
      filename = "lance-design",
    } = body;

    const c = brand === "teaching" ? TEACHING : CHURCH;
    const d = { title, subtitle, date, time, location, verse, verseRef };

    let svg: string;
    switch (template) {
      case "social":   svg = socialSquare(d, c, brand); break;
      case "series":   svg = seriesGraphic(d, c, brand); break;
      case "banner":   svg = socialBanner(d, c, brand); break;
      case "bulletin": svg = bulletinCover(d, c, brand); break;
      case "badge":    svg = nameBadge(d, c, brand); break;
      default:         svg = announcementFlyer(d, c, brand);
    }

    const name = (String(filename)).replace(/\.svg$/, "") + ".svg";
    return new Response(svg, {
      headers: { ...CORS, "Content-Type": "image/svg+xml", "Content-Disposition": `attachment; filename="${name}"` },
    });
  } catch (e) {
    console.error("lance-flyer error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

type Colors = typeof CHURCH & Partial<typeof TEACHING>;
type FlyerData = { title: string; subtitle: string; date: string; time: string; location: string; verse: string; verseRef: string };

function esc(s: string): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/—/g, "--").replace(/–/g, "-")
    .replace(/‘/g, "'").replace(/’/g, "'")
    .replace(/“/g, '"').replace(/”/g, '"');
}

function wrapText(text: string, maxChars: number): string[] {
  const words = esc(text).split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur.trim()); cur = w; }
    else { cur = (cur + " " + w).trim(); }
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

function brandMark(cx: number, cy: number, r: number, color: string, opacity = 1): string {
  return `<g opacity="${opacity}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${Math.max(1.5, r / 40)}"/>
    <path d="M${cx - r * 0.55} ${cy + r * 0.12} Q${cx} ${cy + r * 0.42} ${cx + r * 0.55} ${cy + r * 0.12}" stroke="${color}" stroke-width="${Math.max(1.5, r / 40)}" fill="none" stroke-linecap="round"/>
  </g>`;
}

function announcementFlyer(d: FlyerData, c: Colors, brand: string): string {
  const W = 1080, H = 1350;
  const accent = brand === "teaching" ? (c.accent as string) : c.accentOnDark as string;
  const accentLight = brand === "teaching" ? (c.accentSoft as string) : c.accentOnDark as string;
  const bg2 = c.primaryDeep;

  const titleLines = wrapText(d.title, 14);
  const fontSize = titleLines.length > 2 ? 68 : titleLines.length > 1 ? 80 : 96;
  const verseLines = d.verse ? wrapText(d.verse, 42) : [];

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="${bg2}"/>
      <stop offset="100%" stop-color="${c.primary}"/>
    </linearGradient>
    <radialGradient id="glow" cx="85%" cy="8%" r="55%">
      <stop offset="0%" stop-color="${brand === 'teaching' ? c.accent : c.accent}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${c.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <line x1="96" y1="120" x2="96" y2="${H - 120}" stroke="${accent}" stroke-width="2" opacity="0.35"/>

  ${brandMark(96, 92, 22, accentLight, 0.85)}
  <text x="140" y="100" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="600" letter-spacing="4" fill="${accentLight}">VICTORY BAPTIST CHURCH</text>

  <text x="96" y="${520 - titleLines.length * fontSize * 0.35}" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${fontSize}" fill="${c.onPrimary}">
    ${titleLines.map((l, i) => `<tspan x="96" dy="${i === 0 ? 0 : fontSize * 1.05}">${l}</tspan>`).join("")}
  </text>

  ${d.subtitle ? `<text x="96" y="${520 - titleLines.length * fontSize * 0.35 + titleLines.length * fontSize * 1.05 + 20}" font-family="Helvetica, Arial, sans-serif" font-style="italic" font-size="26" fill="${accentLight}">${esc(d.subtitle)}</text>` : ""}

  <g transform="translate(96, ${H - 430})">
    <rect x="0" y="0" width="${W - 192}" height="${(d.date?60:0)+(d.time?50:0)+(d.location?50:0)+40}" fill="${c.onPrimary}" opacity="0.06" rx="4"/>
    <line x1="0" y1="0" x2="0" y2="${(d.date?60:0)+(d.time?50:0)+(d.location?50:0)+40}" stroke="${accent}" stroke-width="3"/>
    ${d.date ? `<text x="32" y="48" font-family="Helvetica, Arial, sans-serif" font-size="32" font-weight="700" fill="${c.onPrimary}">${esc(d.date)}</text>` : ""}
    ${d.time ? `<text x="32" y="${(d.date?90:40)}" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="${accentLight}">${esc(d.time)}</text>` : ""}
    ${d.location ? `<text x="32" y="${(d.date?90:40)+(d.time?38:0)}" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="${c.onPrimary}" opacity="0.75">${esc(d.location)}</text>` : ""}
  </g>

  ${verseLines.length ? `<g transform="translate(96, ${H - 150})">
    <text x="0" y="0" font-family="Georgia, serif" font-style="italic" font-size="20" fill="${c.onPrimary}" opacity="0.65">
      ${verseLines.map((l, i) => `<tspan x="0" dy="${i === 0 ? 0 : 28}">"${l}"</tspan>`).join("")}
    </text>
    <text x="0" y="${verseLines.length * 28 + 30}" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="600" letter-spacing="1" fill="${accent}">${esc(d.verseRef)}</text>
  </g>` : ""}

  <rect x="0" y="${H - 10}" width="${W}" height="10" fill="${accent}"/>
</svg>`;
}

function socialSquare(d: FlyerData, c: Colors, brand: string): string {
  const W = 1080, H = 1080;
  const accent = brand === "teaching" ? (c.accent as string) : c.accentOnDark as string;
  const accentLight = brand === "teaching" ? (c.accentSoft as string) : c.accentOnDark as string;
  const titleLines = wrapText(d.title, 15);
  const fontSize = titleLines.length > 2 ? 60 : 78;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c.primaryDeep}"/>
      <stop offset="100%" stop-color="${c.primary}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W * 0.88}" cy="${H * 0.12}" r="340" fill="${accent}" opacity="0.08"/>
  <circle cx="${W * 0.1}" cy="${H * 0.95}" r="260" fill="${accent}" opacity="0.06"/>

  ${brandMark(W / 2, 150, 26, accentLight, 0.9)}
  <text x="${W / 2}" y="218" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="600" letter-spacing="5" fill="${accentLight}">VICTORY BAPTIST CHURCH</text>

  <text x="${W / 2}" y="${H / 2 - titleLines.length * 15}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="${fontSize}" fill="${c.onPrimary}">
    ${titleLines.map((l, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : fontSize * 1.12}">${l}</tspan>`).join("")}
  </text>

  ${d.subtitle ? `<text x="${W / 2}" y="${H / 2 + titleLines.length * fontSize * 0.58 + 46}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-style="italic" font-size="26" fill="${accentLight}">${esc(d.subtitle)}</text>` : ""}

  <line x1="${W / 2 - 70}" y1="${H - 190}" x2="${W / 2 + 70}" y2="${H - 190}" stroke="${accent}" stroke-width="2" opacity="0.5"/>

  ${d.verse ? `<text x="${W / 2}" y="${H - 140}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="19" fill="${c.onPrimary}" opacity="0.8">"${esc(d.verse).slice(0, 68)}${d.verse.length > 68 ? "..." : ""}"</text>
  <text x="${W / 2}" y="${H - 105}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="1" fill="${accent}">${esc(d.verseRef)}</text>` : ""}

  <rect x="0" y="${H - 10}" width="${W}" height="10" fill="${accent}"/>
</svg>`;
}

function seriesGraphic(d: FlyerData, c: Colors, brand: string): string {
  const W = 1920, H = 1080;
  const accent = brand === "teaching" ? (c.accent as string) : c.accentOnDark as string;
  const accentLight = brand === "teaching" ? (c.accentSoft as string) : c.accentOnDark as string;
  const titleLines = wrapText(d.title, 20);
  const fontSize = titleLines.length > 2 ? 88 : 118;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0.3">
      <stop offset="0%" stop-color="${c.primaryDeep}"/>
      <stop offset="100%" stop-color="${c.primary}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="10" height="${H}" fill="${accent}"/>

  <g transform="translate(130, 140)">${brandMark(30, 20, 26, accentLight, 0.9)}</g>
  <text x="200" y="172" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="600" letter-spacing="6" fill="${accentLight}">SERMON SERIES -- VICTORY BAPTIST CHURCH</text>

  <text x="130" y="${H / 2 + 40}" font-family="Georgia, serif" font-weight="700" font-size="${fontSize}" fill="${c.onPrimary}">
    ${titleLines.map((l, i) => `<tspan x="130" dy="${i === 0 ? 0 : fontSize * 1.1}">${l}</tspan>`).join("")}
  </text>

  ${d.subtitle ? `<text x="130" y="${H / 2 + titleLines.length * fontSize * 0.75 + 60}" font-family="Helvetica, Arial, sans-serif" font-style="italic" font-size="32" fill="${accentLight}">${esc(d.subtitle)}</text>` : ""}

  ${d.verse ? `<text x="130" y="${H - 90}" font-family="Georgia, serif" font-style="italic" font-size="24" fill="${c.onPrimary}" opacity="0.75">"${esc(d.verse).slice(0, 100)}${d.verse.length > 100 ? "..." : ""}" -- ${esc(d.verseRef)}</text>` : ""}
</svg>`;
}

function socialBanner(d: FlyerData, c: Colors, brand: string): string {
  const W = 1200, H = 630;
  const accent = brand === "teaching" ? (c.accent as string) : c.accentOnDark as string;
  const accentLight = brand === "teaching" ? (c.accentSoft as string) : c.accentOnDark as string;
  const titleLines = wrapText(d.title, 22);
  const fontSize = titleLines.length > 2 ? 48 : 62;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c.primary}"/>
      <stop offset="100%" stop-color="${c.primaryDeep}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W - 80}" cy="${H * 0.15}" r="200" fill="${accent}" opacity="0.1"/>

  ${brandMark(70, 70, 20, accentLight, 0.9)}
  <text x="110" y="78" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="3" fill="${accentLight}">VICTORY BAPTIST CHURCH</text>

  <text x="60" y="${H / 2 + 20}" font-family="Georgia, serif" font-weight="700" font-size="${fontSize}" fill="${c.onPrimary}">
    ${titleLines.map((l, i) => `<tspan x="60" dy="${i === 0 ? 0 : fontSize * 1.1}">${l}</tspan>`).join("")}
  </text>

  ${d.subtitle ? `<text x="60" y="${H / 2 + titleLines.length * fontSize * 0.75 + 40}" font-family="Helvetica, Arial, sans-serif" font-style="italic" font-size="22" fill="${accentLight}">${esc(d.subtitle)}</text>` : ""}

  <rect x="0" y="${H - 8}" width="${W}" height="8" fill="${accent}"/>
</svg>`;
}

function bulletinCover(d: FlyerData, c: Colors, brand: string): string {
  const W = 850, H = 1100;
  const accent = brand === "teaching" ? (c.accent as string) : c.accent as string;
  const titleLines = wrapText(d.title, 20);
  const fontSize = titleLines.length > 2 ? 44 : 54;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${c.onPrimary}"/>
  <rect x="0" y="0" width="${W}" height="340" fill="${c.primary}"/>
  <rect x="0" y="340" width="${W}" height="6" fill="${accent}"/>

  ${brandMark(W / 2, 130, 34, c.onPrimary, 0.95)}
  <text x="${W / 2}" y="210" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="600" letter-spacing="5" fill="${c.onPrimary}" opacity="0.9">VICTORY BAPTIST CHURCH</text>

  <text x="${W / 2}" y="550" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="${fontSize}" fill="${c.primary}">
    ${titleLines.map((l, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : fontSize * 1.15}">${l}</tspan>`).join("")}
  </text>

  ${d.subtitle ? `<text x="${W / 2}" y="${550 + titleLines.length * fontSize * 0.7 + 40}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-style="italic" font-size="22" fill="${c.inkMuted || '#6B7280'}">${esc(d.subtitle)}</text>` : ""}

  <line x1="${W / 2 - 60}" y1="${H - 220}" x2="${W / 2 + 60}" y2="${H - 220}" stroke="${accent}" stroke-width="2"/>
  ${d.date ? `<text x="${W / 2}" y="${H - 170}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="600" fill="${c.primary}">${esc(d.date)}</text>` : ""}

  ${d.verse ? `<text x="${W / 2}" y="${H - 90}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="18" fill="${c.inkMuted || '#6B7280'}">"${esc(d.verse).slice(0, 60)}${d.verse.length > 60 ? "..." : ""}"</text>
  <text x="${W / 2}" y="${H - 60}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="${accent}" letter-spacing="1">${esc(d.verseRef)}</text>` : ""}
</svg>`;
}

function nameBadge(d: FlyerData, c: Colors, brand: string): string {
  const W = 1000, H = 650;
  const accent = brand === "teaching" ? (c.accent as string) : c.accent as string;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${c.onPrimary}"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${c.inkMuted || '#9CA3AF'}" stroke-width="2" opacity="0.3"/>
  <rect x="0" y="0" width="18" height="${H}" fill="${c.primary}"/>
  <rect x="18" y="0" width="6" height="${H}" fill="${accent}"/>

  ${brandMark(100, 100, 30, c.primary, 0.9)}
  <text x="100" y="170" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="600" letter-spacing="2" fill="${c.inkMuted || '#6B7280'}">VBC</text>

  <text x="${W / 2 + 60}" y="${H / 2 - 20}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="58" fill="${c.primary}">${esc(d.title)}</text>
  ${d.subtitle ? `<text x="${W / 2 + 60}" y="${H / 2 + 40}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="${c.inkMuted || '#6B7280'}">${esc(d.subtitle)}</text>` : ""}
</svg>`;
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const { text, filename } = await req.json();
    if (!text) return new Response("Missing text", { status: 400 });
    const clean = normalizeText(String(text));
    const docx = buildDocx(clean);
    const name = (String(filename || "lance-document")).replace(/\.docx$/, "") + ".docx";
    return new Response(docx, {
      headers: {
        ...CORS,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (e) {
    console.error("lance-docx error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

const NAVY   = "1a2340";
const NAVY2  = "1E3A5F";
const GOLD   = "C9A84C";
const GOLD_D = "8B6914";
const BODY   = "1F2937";
const RED    = "8B1A1A";
const GREEN  = "1E6B3A";
const THREAD_FILL = "ECEEF1";
const APP_FILL    = "FBF2DD";
const FONT = `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>`;

// A plain sentence addressed to Pastor ("Pastor, one thing to check...", "Do you want...")
// is chat, not sermon. After the CONCLUSION heading, everything from the first such line on is cut.
const CHAT_TAIL = /^(Pastor\b|Do you want|Want me to|Would you like|Shall I|Also, I|One thing to (check|know)|Before you preach|Let me know|I left|I kept|I changed|Note to)/i;
function dropChatTail(s: string): string {
  const lines = s.split("\n");
  const ci = lines.findIndex(l => /^##\s+CONCLUSION\b/i.test(l.trim()));
  if (ci < 0) return s;
  for (let j = ci + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t && !/^[#>\-*!@+^=]/.test(t) && CHAT_TAIL.test(t)) return lines.slice(0, j).join("\n").trimEnd();
  }
  return s;
}

function normalizeText(s: string): string {
  let out = s
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(/\u2013/g, "-")
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\s*\(KJV\)/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Drop a short chat preamble ("Here you go...") sitting above the document title
  const lines = out.split("\n");
  const titleIdx = lines.findIndex(l => l.trim().startsWith("# "));
  if (titleIdx > 0) {
    const before = lines.slice(0, titleIdx).filter(l => l.trim());
    if (before.length <= 3 && before.every(l => !/^[#>\-*!@+^=]/.test(l.trim()))) {
      out = lines.slice(titleIdx).join("\n");
    }
  }
  return dropChatTail(out);
}

function safe(s: string): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Inline markup:
//   **bold**   *italic*   ==key line== (bold + yellow highlight)   ^^critical^^ (bold red + yellow highlight)
function makeRuns(text: string, color = BODY, size = 24, baseItalic = false, baseBold = false): string {
  try {
    const parts = String(text).split(/(\*\*[^*]+\*\*|\^\^[^\^]+\^\^|==[^=]+==|\*[^*]+\*)/g);
    return parts.map(p => {
      if (!p) return "";
      let bold = baseBold, italic = baseItalic, highlight = false, c = color, t = p;
      if (p.startsWith("**") && p.endsWith("**") && p.length > 4) { bold = true; t = p.slice(2, -2); }
      else if (p.startsWith("^^") && p.endsWith("^^") && p.length > 4) { bold = true; highlight = true; c = RED; t = p.slice(2, -2); }
      else if (p.startsWith("==") && p.endsWith("==") && p.length > 4) { bold = true; highlight = true; t = p.slice(2, -2); }
      else if (p.startsWith("*") && p.endsWith("*") && p.length > 2) { italic = true; t = p.slice(1, -1); }
      const rpr = `<w:rPr>${FONT}${bold?"<w:b/>":""}${italic?"<w:i/>":""}<w:color w:val="${c}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${highlight?'<w:highlight w:val="yellow"/>':""}</w:rPr>`;
      return `<w:r>${rpr}<w:t xml:space="preserve">${safe(t)}</w:t></w:r>`;
    }).join("");
  } catch(e) {
    return `<w:r><w:t xml:space="preserve">${safe(text)}</w:t></w:r>`;
  }
}

// Word rejects pPr children out of schema order, so sort them before writing
const PPR_ORDER = ["keepNext", "numPr", "pBdr", "shd", "spacing", "ind", "jc"];
function para(inner: string, before = 0, after = 100, extra = ""): string {
  const parts: string[] = [`<w:spacing w:before="${before}" w:after="${after}"/>`];
  const re = /<w:(\w+)(?:\/>|[\s\S]*?<\/w:\1>|\s[^>]*\/>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(extra)) !== null) parts.push(m[0]);
  const name = (x: string) => (x.match(/^<w:(\w+)/) || ["", ""])[1];
  parts.sort((a, b) => PPR_ORDER.indexOf(name(a)) - PPR_ORDER.indexOf(name(b)));
  return `<w:p><w:pPr>${parts.join("")}</w:pPr>${inner}</w:p>`;
}

function calloutBox(label: string, body: string, fill: string, borderColor: string, labelColor: string): string {
  const inner = label
    ? `<w:r><w:rPr>${FONT}<w:b/><w:color w:val="${labelColor}"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${safe(label)}: </w:t></w:r>${makeRuns(body, BODY, 24)}`
    : makeRuns(body, BODY, 24);
  return `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="8" w:color="${borderColor}"/><w:left w:val="single" w:sz="4" w:space="8" w:color="${borderColor}"/><w:bottom w:val="single" w:sz="4" w:space="8" w:color="${borderColor}"/><w:right w:val="single" w:sz="4" w:space="8" w:color="${borderColor}"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:spacing w:before="160" w:after="160"/><w:ind w:left="120" w:right="120"/></w:pPr>${inner}</w:p>`;
}

const quoteWrap = (s: string) => {
  const t = s.trim().replace(/^"+|"+$/g, "");
  return `"${t}"`;
};

function buildDocx(text: string): Uint8Array {
  const lines = text.split("\n");
  const body: string[] = [];
  let inCode = false, codeLines: string[] = [];

  for (const raw of lines) {
    try {
      let t = raw.trim();
      // "- ++ Ref | text" and "- >> text" behave the same as the bare markers
      if (/^[-*] (\+\+|@@|>>) /.test(t)) t = t.slice(2);
      if (t.startsWith("```")) {
        if (!inCode) { inCode = true; codeLines = []; continue; }
        const ct = safe(codeLines.join(" "));
        body.push(`<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/><w:spacing w:before="80" w:after="80"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${ct}</w:t></w:r></w:p>`);
        inCode = false; codeLines = []; continue;
      }
      if (inCode) { codeLines.push(raw); continue; }
      if (!t) { continue; }

      // ===== Sermon notes markup =====
      // >> Main text Scripture block (red, bold italic, left rule)
      if (t.startsWith(">> ")) {
        body.push(para(makeRuns(quoteWrap(t.slice(3)), RED, 24, true, true), 80, 160,
          `<w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="${RED}"/></w:pBdr><w:ind w:left="540" w:right="540"/>`));
        continue;
      }
      // @@ v. 22 | verse text   -> passage context verse header
      if (t.startsWith("@@ ")) {
        const [v, ...rest] = t.slice(3).split("|");
        const q = rest.join("|").trim();
        const inner = `<w:r><w:rPr>${FONT}<w:b/><w:color w:val="${NAVY}"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${safe(v.trim())}  </w:t></w:r>` +
          (q ? makeRuns(quoteWrap(q), RED, 24, true) : "");
        body.push(para(inner, 200, 60, `<w:keepNext/>`));
        continue;
      }
      // ++ Reference | verse text   -> green cross-reference bullet
      if (t.startsWith("++ ")) {
        const [r, ...rest] = t.slice(3).split("|");
        const q = rest.join("|").trim();
        const inner = `<w:r><w:rPr>${FONT}<w:b/><w:color w:val="${GREEN}"/><w:sz w:val="23"/></w:rPr><w:t xml:space="preserve">${safe(r.trim())}${q ? ": " : ""}</w:t></w:r>` +
          (q ? makeRuns(quoteWrap(q), GREEN, 23, true) : "");
        body.push(para(inner, 0, 60, `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>`));
        continue;
      }
      // ^^Whole line critical statement^^ -> centered, large, red on yellow
      if (/^\^\^[^\^]+\^\^$/.test(t)) {
        body.push(para(makeRuns(t, RED, 28), 240, 120, `<w:jc w:val="center"/>`));
        continue;
      }
      // ===== end sermon notes markup =====

      if (/^!!!\s/.test(t)) {
        const rest = t.replace(/^!!!\s/, "");
        const m = rest.match(/^([A-Z][A-Z0-9 \u2014\-]{2,40}):\s*(.*)$/);
        if (m) body.push(calloutBox(m[1], m[2], THREAD_FILL, NAVY, NAVY));
        else body.push(calloutBox("", rest, THREAD_FILL, NAVY, NAVY));
        continue;
      }
      if (/^!!\s/.test(t)) {
        const rest = t.replace(/^!!\s/, "");
        const m = rest.match(/^([A-Z][A-Za-z0-9\u05D0-\u05EA() \u2014\-\/]{1,50}):\s*(.*)$/);
        if (m) body.push(calloutBox(m[1], m[2], APP_FILL, GOLD, GOLD_D));
        else body.push(calloutBox("", rest, APP_FILL, GOLD, GOLD_D));
        continue;
      }

      if (t.startsWith("# ")) {
        body.push(para(makeRuns(t.slice(2), NAVY, 44, false, true), 240, 120,
          `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${NAVY}"/></w:pBdr>`));
      } else if (t.startsWith("## ")) {
        body.push(para(makeRuns(t.slice(3), NAVY2, 30, false, true), 280, 100,
          `<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="${NAVY2}"/></w:pBdr>`));
      } else if (t.startsWith("### ")) {
        body.push(para(makeRuns(t.slice(4), "2E75B6", 26, false, true), 200, 60, `<w:keepNext/>`));
      } else if (t.startsWith("#### ")) {
        body.push(para(makeRuns(t.slice(5), NAVY, 24, true, true), 160, 60, `<w:keepNext/>`));
      } else if (/^[-*_]{3,}$/.test(t)) {
        body.push(para("", 100, 100, `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${GOLD}"/></w:pBdr>`));
      } else if (t.startsWith("> ")) {
        body.push(para(makeRuns(t.slice(2), NAVY2, 24), 80, 20, `<w:ind w:left="400" w:right="400"/>`));
      } else if (/^--\s*[1-3]?\s?[A-Z][a-zA-Z]+ \d/.test(t)) {
        body.push(para(makeRuns("**" + t.replace(/^--\s*/,"") + "**", NAVY, 22), 0, 120, `<w:ind w:left="400"/>`));
      } else if (/^\s{2,}[-*] /.test(raw)) {
        body.push(para(makeRuns(t.replace(/^[-*]\s/, ""), BODY, 23), 0, 60,
          `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr><w:ind w:left="1080" w:hanging="300"/>`));
      } else if (/^[*\-] /.test(t)) {
        const rest = t.slice(2).trim();
        body.push(para(makeRuns(rest, BODY, 24), 0, 60,
          `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>`));
      } else if (/^\d+\.\s/.test(t)) {
        body.push(para(makeRuns(t.replace(/^\d+\.\s/, ""), BODY, 24), 0, 60,
          `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>`));
      } else {
        body.push(para(makeRuns(t, BODY, 24), 0, 160));
      }
    } catch(lineErr) {
      body.push(para(makeRuns(String(raw).trim().slice(0, 200), BODY, 24), 0, 60));
    }
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="${BODY}"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="24"/></w:rPr></w:style></w:styles>`;

  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#x25CF;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:color w:val="${GOLD}"/><w:sz w:val="20"/></w:rPr></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:b/><w:color w:val="${NAVY}"/></w:rPr></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#x2756;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1080" w:hanging="300"/></w:pPr><w:rPr><w:i/><w:color w:val="${GOLD_D}"/><w:sz w:val="18"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num></w:numbering>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;

  const appRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const enc = (s: string) => new TextEncoder().encode(s);
  return zip([
    { name: "[Content_Types].xml", data: enc(contentTypes) },
    { name: "_rels/.rels",         data: enc(appRels) },
    { name: "word/document.xml",   data: enc(docXml) },
    { name: "word/styles.xml",     data: enc(stylesXml) },
    { name: "word/numbering.xml",  data: enc(numberingXml) },
    { name: "word/_rels/document.xml.rels", data: enc(relsXml) },
  ]);
}

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = [], cdEntries: Uint8Array[] = [];
  let offset = 0;
  const encoder = new TextEncoder();
  for (const { name, data } of files) {
    const nb = encoder.encode(name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nb.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nb.length, true);
    local.set(nb, 30);
    const cd = new Uint8Array(46 + nb.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nb.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nb, 46);
    chunks.push(local, data); cdEntries.push(cd);
    offset += local.length + data.length;
  }
  const cdSize = cdEntries.reduce((s, e) => s + e.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...chunks, ...cdEntries, eocd];
  const total = all.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total); let pos = 0;
  for (const a of all) { out.set(a, pos); pos += a.length; }
  return out;
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

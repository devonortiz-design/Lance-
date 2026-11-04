// Sermon notes renderer: navy, tan, and white, Cinzel + Spectral + Jost, Big Numeral headings.
// Used when the text is sermon notes (## THE TEXT, >> , @@ , or ++ markers).

const NAVY = "1E2B45";
const INK = "1F2330";
const TAN = "85683D";
const LTAN = "CDB68E";
const BLOCK = "E9DCC6";
const HL = "DCC59E";
const WHITE = "FFFFFF";
const HEAD = "Cinzel";
const BODY = "Spectral";
const SANS = "Jost";

// Font files live in the Lance repo (public/fonts). Fetched once per cold start, then cached.
const FONT_SOURCES = [
  "https://lance-roan.vercel.app/fonts/",
  "https://raw.githubusercontent.com/devonortiz-design/Lance-/main/public/fonts/",
];
const EMBEDS: { family: string; slot: string; file: string; guid: string }[] = [
  { family: "Cinzel", slot: "embedRegular", file: "Cinzel-Regular", guid: "6E1C5A0B-3F2D-4A8E-9B71-0C4D2E5F6A11" },
  { family: "Cinzel", slot: "embedBold", file: "Cinzel-Bold", guid: "6E1C5A0B-3F2D-4A8E-9B71-0C4D2E5F6A12" },
  { family: "Spectral", slot: "embedRegular", file: "Spectral-Regular", guid: "6E1C5A0B-3F2D-4A8E-9B71-0C4D2E5F6A13" },
  { family: "Spectral", slot: "embedBold", file: "Spectral-Bold", guid: "6E1C5A0B-3F2D-4A8E-9B71-0C4D2E5F6A14" },
  { family: "Spectral", slot: "embedItalic", file: "Spectral-Italic", guid: "6E1C5A0B-3F2D-4A8E-9B71-0C4D2E5F6A15" },
  { family: "Spectral", slot: "embedBoldItalic", file: "Spectral-BoldItalic", guid: "6E1C5A0B-3F2D-4A8E-9B71-0C4D2E5F6A16" },
  { family: "Jost", slot: "embedRegular", file: "Jost-Regular", guid: "6E1C5A0B-3F2D-4A8E-9B71-0C4D2E5F6A17" },
  { family: "Jost", slot: "embedBold", file: "Jost-Bold", guid: "6E1C5A0B-3F2D-4A8E-9B71-0C4D2E5F6A18" },
];
const fontCache = new Map<string, Uint8Array>();

async function fetchFont(file: string): Promise<Uint8Array | null> {
  if (fontCache.has(file)) return fontCache.get(file)!;
  const localDir = Deno.env.get("LANCE_FONT_DIR");
  if (localDir) {
    try { const d = await Deno.readFile(localDir + file + ".ttf"); fontCache.set(file, d); return d; } catch { /* fall through */ }
  }
  for (const base of FONT_SOURCES) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(base + file + ".ttf", { signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) continue;
      const d = new Uint8Array(await r.arrayBuffer());
      if (d.length < 1000) continue;
      fontCache.set(file, d);
      return d;
    } catch { /* try next source */ }
  }
  return null;
}

function obfuscate(data: Uint8Array, guid: string): Uint8Array {
  const hex = guid.replace(/-/g, "");
  const key = new Uint8Array(16);
  for (let i = 0; i < 16; i++) key[i] = parseInt(hex.substr(i * 2, 2), 16);
  key.reverse();
  const out = new Uint8Array(data);
  for (let i = 0; i < 32 && i < out.length; i++) out[i] ^= key[i % 16];
  return out;
}

// ---------- XML helpers ----------
function safe(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type RunOpt = { font?: string; size?: number; color?: string; b?: boolean; i?: boolean; caps?: boolean; sc?: boolean; sp?: number; fill?: string; u?: string };
function run(text: string, o: RunOpt = {}): string {
  const f = o.font || BODY;
  const rpr = `<w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/>${o.b ? "<w:b/><w:bCs/>" : ""}${o.i ? "<w:i/><w:iCs/>" : ""}${o.caps ? "<w:caps/>" : ""}${o.sc ? "<w:smallCaps/>" : ""}<w:color w:val="${o.color || INK}"/>${o.sp ? `<w:spacing w:val="${o.sp}"/>` : ""}<w:sz w:val="${o.size || 22}"/><w:szCs w:val="${o.size || 22}"/>${o.u ? `<w:u w:val="single" w:color="${o.u}"/>` : ""}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ""}</w:rPr>`;
  return `<w:r>${rpr}<w:t xml:space="preserve">${safe(text)}</w:t></w:r>`;
}

// **bold**  *italic*  ==key line==  ^^critical^^
function inline(text: string, base: RunOpt = {}): string {
  const parts = String(text).split(/(\*\*[^*]+\*\*|\^\^[^\^]+\^\^|==[^=]+==|\*[^*]+\*)/g);
  return parts.map((p) => {
    if (!p) return "";
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return run(p.slice(2, -2), { ...base, b: true });
    if (p.startsWith("^^") && p.endsWith("^^") && p.length > 4) return run(p.slice(2, -2), { ...base, b: true, color: NAVY, fill: HL });
    if (p.startsWith("==") && p.endsWith("==") && p.length > 4) return run(p.slice(2, -2), { ...base, b: true, fill: HL });
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return run(p.slice(1, -1), { ...base, i: true });
    return run(p, base);
  }).join("");
}

type ParaOpt = { before?: number; after?: number; line?: number; exact?: boolean; keep?: boolean; jc?: string; left?: number; right?: number; hanging?: number; num?: number; lvl?: number; shd?: string; bdr?: string; tabs?: string };
// pPr children in schema order
function para(inner: string, o: ParaOpt = {}): string {
  let p = "";
  if (o.keep) p += "<w:keepNext/>";
  if (o.num) p += `<w:numPr><w:ilvl w:val="${o.lvl || 0}"/><w:numId w:val="${o.num}"/></w:numPr>`;
  if (o.bdr) p += `<w:pBdr>${o.bdr}</w:pBdr>`;
  if (o.shd) p += `<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>`;
  if (o.tabs) p += `<w:tabs>${o.tabs}</w:tabs>`;
  p += `<w:spacing w:before="${o.before || 0}" w:after="${o.after ?? 120}"${o.line ? ` w:line="${o.line}" w:lineRule="${o.exact ? "exact" : "auto"}"` : ""}/>`;
  if (o.left || o.right || o.hanging) p += `<w:ind w:left="${o.left || 0}" w:right="${o.right || 0}"${o.hanging ? ` w:hanging="${o.hanging}"` : ""}/>`;
  if (o.jc) p += `<w:jc w:val="${o.jc}"/>`;
  return `<w:p><w:pPr>${p}</w:pPr>${inner}</w:p>`;
}
const side = (n: string, sz: number, color: string, space: number) => `<w:${n} w:val="single" w:sz="${sz}" w:space="${space}" w:color="${color}"/>`;
const boxBdr = (spine: string, fill: string) => side("top", 2, fill, 10) + side("left", 36, spine, 14) + side("bottom", 2, fill, 10) + side("right", 2, fill, 10);

const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "the", "to", "with", "from", "into", "unto"]);
function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().split(/(\s+)/).map((w, i) => (i > 0 && SMALL.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join("");
}
function verseLabel(v: string): string {
  const t = v.replace(/^v{1,2}\.?\s*/i, "").replace(/-/g, "–").trim();
  return (/[–,]/.test(t) ? "VERSES " : "VERSE ") + t;
}

// ---------- builder ----------
export async function buildSermonDocx(text: string, zip: (f: { name: string; data: Uint8Array }[]) => Uint8Array): Promise<Uint8Array> {
  const body: string[] = [];
  let sectionNo = 0, inText = false, messageShown = false, afterTitle = false, lastWasRef = false, lastWasBox = false;
  const lines = text.split("\n");

  const bigHeading = (title: string) => {
    sectionNo++;
    const n = String(sectionNo).padStart(2, "0");
    body.push(para(run("", { size: 28 }), { after: 0, keep: true }));
    body.push(para(run(n, { size: 64, b: true, color: TAN }), { before: 280, after: 0, line: 680, exact: true, keep: true }));
    body.push(para(run(titleCase(title), { size: 46, b: true, color: NAVY }), { before: 60, after: 0, keep: true }));
    body.push(para(run("", { size: 4 }), { after: 300, line: 160, exact: true, keep: true, right: 8100, bdr: side("bottom", 36, TAN, 1) }));
  };
  const label = (t: string, color = TAN) => body.push(para(run(t.toUpperCase(), { font: SANS, size: 16, color, sp: 70 }), { before: 160, after: 80, keep: true }));

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    let t = raw.trim();
    if (/^[-*] (\+\+|@@|>>) /.test(t)) t = t.slice(2);
    if (!t) continue;
    const isRef = t.startsWith("++ ");
    const isBox = /^!!!?\s/.test(t);
    if (!isRef) lastWasRef = false;
    if (!isBox) lastWasBox = false;

    // Title and big idea
    if (t.startsWith("# ")) {
      body.push(para(run("❖", { font: "Arial", size: 16, color: TAN }), { after: 300, jc: "center" }));
      body.push(para(run(t.slice(2).trim(), { font: HEAD, size: 62, color: NAVY, sp: 20 }), { after: 60, jc: "center" }));
      afterTitle = true;
      continue;
    }
    if (afterTitle && /^\*[^*].*\*$/.test(t)) {
      body.push(para(run(t.replace(/^\*+|\*+$/g, ""), { size: 27, i: true }), { after: 200, jc: "center" }));
      afterTitle = false;
      continue;
    }
    afterTitle = false;

    // Section headings
    if (/^##\s+THE TEXT\b/i.test(t)) {
      inText = true;
      const next = (lines[li + 1] || "").trim();
      if (next.startsWith("### ")) {
        body.push(para(run(next.slice(4).trim().toUpperCase().replace(/-/g, "–"), { font: SANS, size: 15, color: INK, sp: 70 }), { after: 420, jc: "center" }));
        li++;
      }
      label("The Text");
      continue;
    }
    const pm = t.match(/^##\s+([IVXLC]+)\.\s+(.+?)(?:\s*\(([^)]*)\))?\s*$/);
    if (pm) {
      inText = false;
      if (!messageShown) { bigHeading("The Message"); messageShown = true; }
      const vr = pm[3] ? verseLabel(pm[3]) : "";
      const ob = side("top", 2, NAVY, 8) + side("left", 2, NAVY, 8) + side("bottom", 2, NAVY, 8) + side("right", 2, NAVY, 8);
      body.push(para(
        run(pm[1], { size: 36, b: true, i: true, color: LTAN }) + run("    ") +
        run(titleCase(pm[2].trim()), { font: HEAD, size: 24, b: true, color: WHITE, sp: 10 }) +
        (vr ? `<w:r><w:tab/></w:r>` + run(vr, { font: SANS, size: 14, color: LTAN, sp: 40 }) : ""),
        { before: 380, after: 200, keep: true, shd: NAVY, bdr: ob, left: 160, right: 160, tabs: `<w:tab w:val="right" w:pos="8900"/>` }));
      continue;
    }
    if (t.startsWith("## ")) {
      inText = false;
      let title = t.slice(3).trim();
      if (/^PASSAGE CONTEXT$/i.test(title) || /^VERSE BY VERSE$/i.test(title)) title = "Exposition";
      bigHeading(title);
      continue;
    }
    if (t.startsWith("### ")) {
      body.push(para(inline(titleCase(t.slice(4).trim()), { size: 26, b: true, color: NAVY }), { before: 200, after: 80, keep: true }));
      continue;
    }
    if (t.startsWith("#### ")) { label(t.slice(5).trim().replace(/:$/, "")); continue; }

    // Scripture
    if (t.startsWith(">> ")) {
      const v = t.slice(3).trim();
      if (inText) {
        const vm = v.match(/^(\d{1,3})\s+(.*)$/);
        const inner = vm ? run(vm[1] + "   ", { size: 20, b: true, i: true, color: TAN }) + inline(vm[2], { size: 24 }) : inline(v, { size: 24 });
        body.push(para(inner, { after: 60, line: 300, shd: BLOCK, bdr: side("top", 2, BLOCK, 10) + side("left", 36, NAVY, 14) + side("bottom", 2, BLOCK, 10) + side("right", 2, BLOCK, 10), left: 300, right: 300 }));
      } else {
        body.push(para(inline(v, { size: 26, i: true, color: NAVY }), { after: 160, line: 300, left: 200, bdr: side("left", 12, TAN, 10) }));
      }
      continue;
    }
    if (t.startsWith("@@ ")) {
      const [v, ...rest] = t.slice(3).split("|");
      label(verseLabel(v.trim()));
      const q = rest.join("|").trim();
      if (q) body.push(para(inline(q, { size: 26, i: true, color: NAVY }), { after: 160, line: 300, keep: true, left: 200, bdr: side("left", 12, TAN, 10) }));
      continue;
    }

    // Added references: ++ Reference | verse text | why to use it
    if (isRef) {
      const [ref, quote, ...why] = t.slice(3).split("|").map((s) => s.trim());
      if (!lastWasRef) body.push(para(run("ADDED REFERENCES", { font: SANS, size: 15, color: TAN, sp: 60 }), { before: 120, after: 80, keep: true, left: 640 }));
      const rule = side("left", 6, HL, 10);
      const w = why.join(" | ");
      body.push(para(run(ref, { size: 20, b: true, sc: true, color: NAVY, sp: 6 }) + (quote ? run("   “" + quote.replace(/^["“]+|["”]+$/g, "") + "”", { size: 21 }) : ""),
        { after: w ? 30 : 120, line: 290, keep: !!w, left: 640, right: 200, bdr: rule }));
      if (w) body.push(para(run(w, { size: 20, i: true, color: TAN }), { after: 120, line: 290, left: 640, right: 200, bdr: rule }));
      lastWasRef = true;
      continue;
    }

    // Application block: "!! LABEL: text" then "!! - item" lines
    if (isBox) {
      const navySpine = t.startsWith("!!!");
      const rest = t.replace(/^!!!?\s/, "");
      const bdr = boxBdr(navySpine ? NAVY : TAN, BLOCK);
      const m = rest.match(/^([A-Z][A-Za-z0-9 ]{1,40}):\s*(.*)$/);
      if (/^[-*]\s/.test(rest)) {
        body.push(para(run("▪", { font: "Arial", size: 18, color: TAN }) + `<w:r><w:tab/></w:r>` + inline(rest.slice(2)),
          { after: 100, line: 300, shd: BLOCK, bdr, left: 640, right: 300, hanging: 340, tabs: `<w:tab w:val="left" w:pos="640"/>` }));
      } else if (m) {
        body.push(para(run(m[1].toUpperCase(), { font: SANS, size: 17, b: true, color: NAVY, sp: 80 }), { before: lastWasBox ? 0 : 200, after: 120, keep: true, shd: BLOCK, bdr, left: 300, right: 300 }));
        if (m[2]) body.push(para(inline(m[2]), { after: 100, line: 300, shd: BLOCK, bdr, left: 300, right: 300 }));
      } else {
        body.push(para(inline(rest), { after: 100, line: 300, shd: BLOCK, bdr, left: 300, right: 300 }));
      }
      lastWasBox = true;
      continue;
    }

    // Punch line and pull quote
    if (/^\^\^[^\^]+\^\^$/.test(t)) {
      body.push(para(run(t.slice(2, -2), { size: 30, b: true, i: true, color: NAVY }), { before: 240, after: 240, jc: "center", left: 500, right: 500 }));
      continue;
    }
    if (t.startsWith("> ")) {
      const [q, ref] = t.slice(2).split("|").map((s) => s.trim());
      body.push(para(run("“" + q.replace(/^["“]+|["”]+$/g, "") + "”", { size: 34, i: true, color: NAVY }), { before: 420, after: ref ? 80 : 420, line: 380, jc: "center", left: 500, right: 500, keep: !!ref }));
      if (ref) body.push(para(run(ref.toUpperCase(), { font: SANS, size: 16, color: TAN, sp: 70 }), { after: 420, jc: "center" }));
      continue;
    }
    if (/^[-*_]{3,}$/.test(t)) { body.push(para("", { after: 120 })); continue; }

    // Lists and paragraphs
    if (/^\s{2,}[-*] /.test(raw)) { body.push(para(inline(t.replace(/^[-*]\s/, "")), { after: 80, line: 276, num: 2 })); continue; }
    if (/^[-*] /.test(t)) { body.push(para(inline(t.slice(2).trim()), { after: 100, line: 276, num: 1 })); continue; }
    if (/^\d+\.\s/.test(t)) { body.push(para(inline(t.replace(/^\d+\.\s/, "")), { after: 100, line: 276, num: 3 })); continue; }
    body.push(para(inline(t), { after: 140, line: 288 }));
  }

  // ---------- package ----------
  const W = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W}><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1300" w:right="1500" w:bottom="1300" w:left="1500" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${BODY}" w:hAnsi="${BODY}" w:cs="${BODY}"/><w:color w:val="${INK}"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

  const lvl = (fmt: string, txt: string, left: number, hang: number, rpr: string) => `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${txt}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="${hang}"/></w:pPr><w:rPr>${rpr}</w:rPr></w:lvl>`;
  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering ${W}>` +
    `<w:abstractNum w:abstractNumId="0">${lvl("bullet", "&#x25AA;", 640, 300, `<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="${TAN}"/><w:sz w:val="18"/>`)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1">${lvl("bullet", "&#x2013;", 1100, 280, `<w:color w:val="${TAN}"/>`)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="2">${lvl("decimal", "%1.", 640, 340, `<w:b/><w:color w:val="${NAVY}"/>`)}</w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num></w:numbering>`;

  // Embedded fonts
  const fontParts: { name: string; data: Uint8Array }[] = [];
  const fontRels: string[] = [];
  const byFamily = new Map<string, string[]>();
  let rid = 1;
  for (const e of EMBEDS) {
    const data = await fetchFont(e.file);
    if (!data) continue;
    const part = `fonts/font${rid}.odttf`;
    fontParts.push({ name: "word/" + part, data: obfuscate(data, e.guid) });
    fontRels.push(`<Relationship Id="rIdF${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${part}"/>`);
    if (!byFamily.has(e.family)) byFamily.set(e.family, []);
    byFamily.get(e.family)!.push(`<w:${e.slot} r:id="rIdF${rid}" w:fontKey="{${e.guid}}"/>`);
    rid++;
  }
  const order = ["embedRegular", "embedBold", "embedItalic", "embedBoldItalic"];
  const fontEntries = [HEAD, BODY, SANS].map((fam) => {
    const slots = (byFamily.get(fam) || []).sort((a, b) => order.indexOf(a.match(/w:(\w+)/)![1]) - order.indexOf(b.match(/w:(\w+)/)![1]));
    return `<w:font w:name="${fam}"><w:charset w:val="00"/><w:family w:val="auto"/><w:pitch w:val="variable"/>${slots.join("")}</w:font>`;
  }).join("");
  const fontTableXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:fonts ${W}>${fontEntries}</w:fonts>`;
  const fontTableRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${fontRels.join("")}</Relationships>`;
  const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings ${W}>${fontParts.length ? "<w:embedTrueTypeFonts/>" : ""}<w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>`;
  const appRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const enc = (s: string) => new TextEncoder().encode(s);
  return zip([
    { name: "[Content_Types].xml", data: enc(contentTypes) },
    { name: "_rels/.rels", data: enc(appRels) },
    { name: "word/document.xml", data: enc(docXml) },
    { name: "word/styles.xml", data: enc(stylesXml) },
    { name: "word/numbering.xml", data: enc(numberingXml) },
    { name: "word/fontTable.xml", data: enc(fontTableXml) },
    { name: "word/settings.xml", data: enc(settingsXml) },
    { name: "word/_rels/document.xml.rels", data: enc(docRels) },
    { name: "word/_rels/fontTable.xml.rels", data: enc(fontTableRels) },
    ...fontParts,
  ]);
}

export function isSermonNotes(text: string): boolean {
  return /^##\s+THE TEXT\b/im.test(text) || /^\s*(?:[-*]\s)?(?:@@|>>|\+\+)\s/m.test(text);
}

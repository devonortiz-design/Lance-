import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Brand colors (hex, no #)
const NAVY   = "1A2340";
const GOLD   = "C9A84C";
const WHITE  = "FFFFFF";
const BODY   = "2B2B2B";
const GREY   = "6B7280";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { text, filename, title } = await req.json();
    if (!text) return new Response("Missing text", { status: 400 });

    const clean = normalize(String(text));
    const slides = parseSlides(clean, title);
    const pptx = buildPptx(slides);
    const name = (String(filename || "lance-presentation")).replace(/\.pptx$/, "") + ".pptx";

    return new Response(pptx, {
      headers: {
        ...CORS,
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (e) {
    console.error("lance-pptx error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

function normalize(s: string): string {
  return s
    .replace(/—/g, "--").replace(/–/g, "-")
    .replace(/‘/g, "'").replace(/’/g, "'")
    .replace(/“/g, '"').replace(/”/g, '"')
    .replace(/…/g, "...").replace(/•/g, "-")
    .replace(/ /g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function safe(s: string): string {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface Slide { title: string; bullets: string[]; isTitle: boolean; subtitle?: string; }

function parseSlides(text: string, docTitle?: string): Slide[] {
  const lines = text.split("\n");
  const slides: Slide[] = [];
  let current: Slide | null = null;

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;

    if (t.startsWith("# ")) {
      if (current) slides.push(current);
      current = { title: t.slice(2).trim(), bullets: [], isTitle: false };
      continue;
    }
    if (t.startsWith("## ")) {
      if (current) slides.push(current);
      current = { title: t.slice(3).trim(), bullets: [], isTitle: false };
      continue;
    }
    if (t.startsWith("### ")) {
      if (!current) current = { title: "", bullets: [], isTitle: false };
      current.bullets.push("__SUB__" + t.slice(4).trim());
      continue;
    }
    if (/^[-*]\s/.test(t)) {
      if (!current) current = { title: "", bullets: [], isTitle: false };
      current.bullets.push(t.replace(/^[-*]\s/, "").replace(/\*\*(.*?)\*\*/g, "$1"));
      continue;
    }
    if (/^\d+\.\s/.test(t)) {
      if (!current) current = { title: "", bullets: [], isTitle: false };
      current.bullets.push(t.replace(/^\d+\.\s/, "").replace(/\*\*(.*?)\*\*/g, "$1"));
      continue;
    }
    if (t.startsWith("> ")) {
      if (!current) current = { title: "", bullets: [], isTitle: false };
      current.bullets.push("__QUOTE__" + t.slice(2).trim());
      continue;
    }
    if (/^[-*_]{3,}$/.test(t)) continue;
    // Plain paragraph text becomes a bullet-less line
    if (!current) current = { title: "", bullets: [], isTitle: false };
    current.bullets.push(t.replace(/\*\*(.*?)\*\*/g, "$1"));
  }
  if (current) slides.push(current);

  // Insert a title slide at the front
  const firstTitle = docTitle || slides[0]?.title || "Presentation";
  slides.unshift({ title: firstTitle, bullets: [], isTitle: true, subtitle: "Victory Baptist Church" });

  // Cap bullets per slide at 6, split overflow into additional slides
  const finalSlides: Slide[] = [];
  for (const s of slides) {
    if (s.isTitle || s.bullets.length <= 6) { finalSlides.push(s); continue; }
    for (let i = 0; i < s.bullets.length; i += 6) {
      finalSlides.push({ title: s.title + (i > 0 ? " (cont.)" : ""), bullets: s.bullets.slice(i, i + 6), isTitle: false });
    }
  }
  return finalSlides.slice(0, 40); // sane cap
}

function bulletRun(text: string): { xml: string; isSub: boolean; isQuote: boolean } {
  let isSub = false, isQuote = false, t = text;
  if (t.startsWith("__SUB__")) { isSub = true; t = t.slice(7); }
  if (t.startsWith("__QUOTE__")) { isQuote = true; t = t.slice(9); }
  return { xml: safe(t), isSub, isQuote };
}

function buildPptx(slides: Slide[]): Uint8Array {
  const W = 12192000, H = 6858000; // 16:9 EMU
  const slideFiles: { name: string; xml: string }[] = [];

  slides.forEach((s, idx) => {
    slideFiles.push({ name: `slide${idx + 1}.xml`, xml: s.isTitle ? titleSlideXml(s) : contentSlideXml(s) });
  });

  const slideRelXml = (n: number) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;

  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("")}</p:sldIdLst>
  <p:sldSz cx="${W}" cy="${H}"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;

  const presRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("\n  ")}
  <Relationship Id="rId${slides.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`;

  const slideMasterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${WHITE}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
  <p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
  </p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`;

  const slideMasterRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;

  const slideLayoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sldLayout>`;

  const slideLayoutRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;

  const themeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Lance">
  <a:themeElements>
    <a:clrScheme name="Lance">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="${NAVY}"/></a:dk2>
      <a:lt2><a:srgbClr val="FFFFFF"/></a:lt2>
      <a:accent1><a:srgbClr val="${GOLD}"/></a:accent1>
      <a:accent2><a:srgbClr val="${NAVY}"/></a:accent2>
      <a:accent3><a:srgbClr val="${GREY}"/></a:accent3>
      <a:accent4><a:srgbClr val="${GOLD}"/></a:accent4>
      <a:accent5><a:srgbClr val="${NAVY}"/></a:accent5>
      <a:accent6><a:srgbClr val="${GREY}"/></a:accent6>
      <a:hlink><a:srgbClr val="${GOLD}"/></a:hlink>
      <a:folHlink><a:srgbClr val="${NAVY}"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Lance"><a:majorFont><a:latin typeface="Calibri"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="Lance"><a:fillStyleLst><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("\n  ")}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

  const enc = (s: string) => new TextEncoder().encode(s);
  const files: { name: string; data: Uint8Array }[] = [
    { name: "[Content_Types].xml", data: enc(contentTypes) },
    { name: "_rels/.rels", data: enc(rootRelsXml) },
    { name: "ppt/presentation.xml", data: enc(presentationXml) },
    { name: "ppt/_rels/presentation.xml.rels", data: enc(presRelsXml) },
    { name: "ppt/slideMasters/slideMaster1.xml", data: enc(slideMasterXml) },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: enc(slideMasterRelsXml) },
    { name: "ppt/slideLayouts/slideLayout1.xml", data: enc(slideLayoutXml) },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: enc(slideLayoutRelsXml) },
    { name: "ppt/theme/theme1.xml", data: enc(themeXml) },
  ];
  slideFiles.forEach((sf, i) => {
    files.push({ name: `ppt/slides/${sf.name}`, data: enc(sf.xml) });
    files.push({ name: `ppt/slides/_rels/${sf.name}.rels`, data: enc(slideRelXml(i)) });
  });

  return zip(files);
}

function titleSlideXml(s: Slide): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${NAVY}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="GoldBar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="0" y="3100000"/><a:ext cx="12192000" cy="38100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${GOLD}"/></a:solidFill></p:spPr>
  <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="900000" y="2400000"/><a:ext cx="10392000" cy="700000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
  <p:txBody><a:bodyPr wrap="square" anchor="b"/><a:lstStyle/>
    <a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-US" sz="3600" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${safe(s.title)}</a:t></a:r></a:p>
  </p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="4" name="Subtitle"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="900000" y="3300000"/><a:ext cx="10392000" cy="500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
  <p:txBody><a:bodyPr wrap="square" anchor="t"/><a:lstStyle/>
    <a:p><a:r><a:rPr lang="en-US" sz="1600" i="1"><a:solidFill><a:srgbClr val="${GOLD}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${safe(s.subtitle || "")}</a:t></a:r></a:p>
  </p:txBody></p:sp>
</p:spTree></p:cSld>
<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sld>`;
}

function contentSlideXml(s: Slide): string {
  const bodyParas = s.bullets.map(b => {
    const { xml, isSub, isQuote } = bulletRun(b);
    if (isQuote) {
      return `<a:p><a:pPr marL="228600" indent="0"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="1800" i="1"><a:solidFill><a:srgbClr val="${NAVY}"/></a:solidFill></a:rPr><a:t>${xml}</a:t></a:r></a:p>`;
    }
    if (isSub) {
      return `<a:p><a:pPr marL="0" indent="0"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="2000" b="1"><a:solidFill><a:srgbClr val="${GOLD}"/></a:solidFill></a:rPr><a:t>${xml}</a:t></a:r></a:p>`;
    }
    return `<a:p><a:pPr marL="342900" indent="-342900"><a:buFont typeface="Arial"/><a:buChar char="●"/></a:pPr><a:r><a:rPr lang="en-US" sz="2000"><a:solidFill><a:srgbClr val="${BODY}"/></a:solidFill></a:rPr><a:t>${xml}</a:t></a:r></a:p>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="HeaderBar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${NAVY}"/></a:solidFill></p:spPr>
  <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="GoldAccent"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="0" y="914400"/><a:ext cx="12192000" cy="38100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${GOLD}"/></a:solidFill></p:spPr>
  <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="4" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="600000" y="180000"/><a:ext cx="10992000" cy="600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
  <p:txBody><a:bodyPr wrap="square" anchor="ctr"/><a:lstStyle/>
    <a:p><a:r><a:rPr lang="en-US" sz="2600" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${safe(s.title)}</a:t></a:r></a:p>
  </p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="5" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="700000" y="1200000"/><a:ext cx="10792000" cy="5400000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
  <p:txBody><a:bodyPr wrap="square" anchor="t"><a:normAutofit fontScale="90000" lnSpcReduction="10000"/></a:bodyPr><a:lstStyle/>
    ${bodyParas}
  </p:txBody></p:sp>
</p:spTree></p:cSld>
<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sld>`;
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

const { 
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  BorderStyle, ShadingType, AlignmentType, LevelFormat,
  convertInchesToTwip
} = require('docx');

const NAVY   = '1a2340';
const NAVY2  = '1E3A5F';
const GOLD   = 'C9A84C';
const GOLD_D = '8B6914';
const BODY   = '1F2937';
const GREY   = '6B7280';

function parseInline(text, color = BODY, size = 24) {
  const runs = [];
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  for (const p of parts) {
    if (!p) continue;
    if (p.startsWith('**') && p.endsWith('**')) {
      runs.push(new TextRun({ text: p.slice(2,-2), bold: true, color, size, font: 'Calibri' }));
    } else if (p.startsWith('*') && p.endsWith('*')) {
      runs.push(new TextRun({ text: p.slice(1,-1), italics: true, color, size, font: 'Calibri' }));
    } else {
      runs.push(new TextRun({ text: p, color, size, font: 'Calibri' }));
    }
  }
  return runs.length ? runs : [new TextRun({ text: '', size, font: 'Calibri' })];
}

function buildDoc(text) {
  const lines = text.split('\n');
  const children = [];
  let inCode = false, codeLines = [];

  for (const raw of lines) {
    const t = raw.trim();

    if (t.startsWith('```')) {
      if (!inCode) { inCode = true; codeLines = []; continue; }
      children.push(new Paragraph({
        children: [new TextRun({ text: codeLines.join('\n'), font: 'Courier New', size: 20, color: '374151' })],
        spacing: { before: 80, after: 80 },
        indent: { left: 360 },
        shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
      }));
      inCode = false; codeLines = []; continue;
    }
    if (inCode) { codeLines.push(raw); continue; }

    if (!t) { children.push(new Paragraph({ spacing: { after: 80 } })); continue; }

    if (t.startsWith('# ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: t.slice(2), bold: true, color: NAVY, size: 44, font: 'Calibri' })],
        spacing: { before: 360, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 4 } },
      }));
      continue;
    }
    if (t.startsWith('## ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: t.slice(3), bold: true, color: NAVY2, size: 34, font: 'Calibri' })],
        spacing: { before: 280, after: 80 },
      }));
      continue;
    }
    if (t.startsWith('### ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: t.slice(4), bold: true, italics: true, color: GOLD_D, size: 28, font: 'Calibri' })],
        spacing: { before: 200, after: 60 },
      }));
      continue;
    }
    if (t.startsWith('#### ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: t.slice(5), bold: true, color: '374151', size: 24, font: 'Calibri' })],
        spacing: { before: 160, after: 40 },
      }));
      continue;
    }
    if (/^[-*_]{3,}$/.test(t)) {
      children.push(new Paragraph({
        spacing: { before: 120, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD } },
      }));
      continue;
    }
    if (t.startsWith('> ')) {
      children.push(new Paragraph({
        children: parseInline(t.slice(2), NAVY2, 24).map(r => new TextRun({...r, italics: true, font: 'Calibri'})),
        spacing: { before: 80, after: 80 },
        indent: { left: 480 },
        border: { left: { style: BorderStyle.SINGLE, size: 16, color: GOLD, space: 8 } },
      }));
      continue;
    }
    if (/^[*\-] /.test(t)) {
      children.push(new Paragraph({
        children: parseInline(t.slice(2), BODY, 24),
        bullet: { level: 0 },
        spacing: { after: 40 },
      }));
      continue;
    }
    if (/^  [*\-] /.test(raw)) {
      children.push(new Paragraph({
        children: parseInline(t.slice(2), GREY, 22),
        bullet: { level: 1 },
        spacing: { after: 30 },
      }));
      continue;
    }
    if (/^\d+\.\s/.test(t)) {
      children.push(new Paragraph({
        children: parseInline(t.replace(/^\d+\.\s/, ''), BODY, 24),
        numbering: { reference: 'lance-numbering', level: 0 },
        spacing: { after: 40 },
      }));
      continue;
    }
    children.push(new Paragraph({
      children: parseInline(t, BODY, 24),
      spacing: { after: 100 },
    }));
  }

  return new Document({
    numbering: {
      config: [{
        reference: 'lance-numbering',
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: { indent: { left: 720, hanging: 360 } },
            run: { bold: true, color: NAVY, font: 'Calibri' }
          }
        }]
      }]
    },
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 24, color: BODY },
          paragraph: { spacing: { after: 100 } }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: {
            width: convertInchesToTwip(8.5),
            height: convertInchesToTwip(11)
          },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children
    }]
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, filename } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const doc = buildDoc(text);
    const buffer = await Packer.toBuffer(doc);
    const name = (filename || 'lance-document').replace(/\.docx$/, '') + '.docx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buffer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
};

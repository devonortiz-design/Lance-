// Builds a Word monthly calendar (landscape, one page per month) from the staff calendar.
import { loadCalendar } from "./api.jsx";

const NAVY = "1A2340", TAN = "9A7B3F", LINE = "C9C2B0", SOFT = "F4F0E6";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const ROUTINE = { "Sunday morning service": 1, "Sunday evening service": 1, "Wednesday service": 1 };

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "p" : "a";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return hh + (m ? ":" + String(m).padStart(2, "0") : "") + ap;
}

export async function buildCalendarDocx({ start, months = 1 }) {
  const D = await import("docx");
  const cal = await loadCalendar();
  if (!cal || !Array.isArray(cal.events)) throw new Error("no_calendar");
  const events = cal.events.filter(e => !(e.cat === "Service" && !e.id && ROUTINE[e.title]));
  const byDate = {};
  events.forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });

  let [y, m] = (start && /^\d{4}-\d{2}$/.test(start) ? start : cal.today.slice(0, 7)).split("-").map(Number);
  months = Math.min(12, Math.max(1, Number(months) || 1));

  const none = { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const thin = { style: D.BorderStyle.SINGLE, size: 4, color: LINE };
  const sections = [];
  const COLW = 2000; // twips per day column, 7 x 2000 = 14000 (landscape letter, 0.5in margins)

  for (let k = 0; k < months; k++) {
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lead = first.getUTCDay();
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const weeks = Math.ceil((lead + dim) / 7);

    const header = new D.TableRow({
      tableHeader: true,
      children: DAYS.map(d => new D.TableCell({
        width: { size: COLW, type: D.WidthType.DXA },
        shading: { fill: NAVY, type: D.ShadingType.CLEAR, color: "auto" },
        borders: { top: thin, bottom: thin, left: thin, right: thin },
        margins: { top: 50, bottom: 50, left: 80, right: 80 },
        children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: d.toUpperCase(), bold: true, color: "FFFFFF", size: 18, font: "Cinzel" })] })],
      })),
    });

    const rows = [header];
    for (let w = 0; w < weeks; w++) {
      const cells = [];
      for (let c = 0; c < 7; c++) {
        const day = w * 7 + c - lead + 1;
        const inMonth = day >= 1 && day <= dim;
        const kids = [];
        if (inMonth) {
          const iso = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          kids.push(new D.Paragraph({ spacing: { after: 20 }, children: [new D.TextRun({ text: String(day), bold: true, color: TAN, size: 22, font: "Cinzel" })] }));
          (byDate[iso] || []).forEach(e => {
            const t = fmtTime(e.start);
            kids.push(new D.Paragraph({
              spacing: { after: 20 },
              children: [
                ...(t ? [new D.TextRun({ text: t + " ", bold: true, color: NAVY, size: 15, font: "Spectral" })] : []),
                new D.TextRun({ text: e.title + (e.loc ? " (" + e.loc + ")" : ""), color: NAVY, size: 15, font: "Spectral" }),
              ],
            }));
          });
        } else {
          kids.push(new D.Paragraph({ children: [] }));
        }
        cells.push(new D.TableCell({
          width: { size: COLW, type: D.WidthType.DXA },
          shading: inMonth ? undefined : { fill: SOFT, type: D.ShadingType.CLEAR, color: "auto" },
          borders: { top: thin, bottom: thin, left: thin, right: thin },
          margins: { top: 40, bottom: 40, left: 70, right: 70 },
          children: kids,
        }));
      }
      rows.push(new D.TableRow({ height: { value: 1350, rule: D.HeightRule.ATLEAST }, cantSplit: true, children: cells }));
    }

    sections.push({
      properties: { page: { size: { orientation: D.PageOrientation.LANDSCAPE, width: 12240, height: 15840 }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children: [
        new D.Paragraph({
          spacing: { after: 120 },
          border: { bottom: { style: D.BorderStyle.SINGLE, size: 12, color: TAN, space: 4 } },
          children: [new D.TextRun({ text: MONTHS[m - 1] + " " + y, bold: true, color: NAVY, size: 52, font: "Cinzel" })],
        }),
        new D.Table({ width: { size: COLW * 7, type: D.WidthType.DXA }, columnWidths: Array(7).fill(COLW), rows }),
      ],
    });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }

  const doc = new D.Document({ sections });
  return D.Packer.toBlob(doc);
}

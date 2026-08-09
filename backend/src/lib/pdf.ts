/**
 * Minimal dependency-free PDF writer for text documents (payout statements).
 * Produces a valid single-font (Helvetica) PDF with automatic pagination.
 */

const PAGE_W = 595; // A4 points
const PAGE_H = 842;
const MARGIN = 50;
const LINE_H = 16;

export type PdfLine = { text: string; size?: number; bold?: boolean; indent?: number };

function escapePdfText(s: string): string {
  // Non-ASCII (e.g. ₵) is outside WinAnsi basics — transliterate common cases
  return s
    .replace(/GH₵/g, "GHS ")
    .replace(/₵/g, "GHS")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export function buildPdf(lines: PdfLine[]): Buffer {
  // Split lines into pages
  const pages: PdfLine[][] = [];
  let current: PdfLine[] = [];
  let y = PAGE_H - MARGIN;
  for (const line of lines) {
    const h = (line.size ?? 10) + 6;
    if (y - h < MARGIN) {
      pages.push(current);
      current = [];
      y = PAGE_H - MARGIN;
    }
    current.push(line);
    y -= Math.max(h, LINE_H);
  }
  if (current.length) pages.push(current);
  if (pages.length === 0) pages.push([]);

  // Object layout: 1 catalog, 2 pages-tree, 3 font-regular, 4 font-bold,
  // then per page: page object + content stream.
  const objects: string[] = [];
  const pageObjIds: number[] = [];
  const firstPageId = 5;
  pages.forEach((_, i) => pageObjIds.push(firstPageId + i * 2));

  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`,
  );
  objects.push(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
  objects.push(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);

  pages.forEach((pageLines, i) => {
    const pageId = firstPageId + i * 2;
    const contentId = pageId + 1;
    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );

    let y = PAGE_H - MARGIN;
    const ops: string[] = ["BT"];
    for (const line of pageLines) {
      const size = line.size ?? 10;
      const font = line.bold ? "/F2" : "/F1";
      const x = MARGIN + (line.indent ?? 0);
      y -= Math.max(size + 6, LINE_H);
      if (line.text.trim() !== "") {
        ops.push(`${font} ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `(${escapePdfText(line.text)}) Tj`);
      }
    }
    ops.push("ET");
    const stream = ops.join("\n");
    objects.push(
      `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
  });

  // Assemble with xref
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "binary");
}

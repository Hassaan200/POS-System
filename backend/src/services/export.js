import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const fmtNumber = (value, type) => {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  if (type === 'int') return String(Math.round(n));
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const isNumeric = (type) => ['money', 'qty', 'int'].includes(type);

export async function toExcel(report, { currency, shopName }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Report');
  sheet.addRow([shopName]).font = { bold: true, size: 14 };
  sheet.addRow([`${report.title} (amounts in ${currency})`]).font = { bold: true };
  sheet.addRow([]);
  const header = sheet.addRow(report.columns.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  });
  for (const row of report.rows) {
    sheet.addRow(report.columns.map((c) => (isNumeric(c.type) ? Number(row[c.key] ?? 0) : row[c.key] ?? '')));
  }
  if (report.totals) {
    const totalsRow = sheet.addRow(
      report.columns.map((c, i) => (i === 0 ? 'Total' : report.totals[c.key] !== undefined ? Number(report.totals[c.key]) : ''))
    );
    totalsRow.font = { bold: true };
  }
  report.columns.forEach((c, i) => {
    const column = sheet.getColumn(i + 1);
    column.width = Math.max(14, c.label.length + 4);
    if (c.type === 'money' || c.type === 'qty') column.numFmt = '#,##0.00';
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function toPdf(report, { currency, shopName }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(15).font('Helvetica-Bold').text(shopName);
    doc.fontSize(11).font('Helvetica').text(`${report.title}  |  Amounts in ${currency}`);
    doc.moveDown(0.8);

    const usable = doc.page.width - 60;
    const weights = report.columns.map((c) => (c.key === 'description' ? 3 : isNumeric(c.type) ? 1 : 1.5));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / totalWeight) * usable);

    const drawRow = (values, bold = false) => {
      const heights = values.map((v, i) => doc.fontSize(8).font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .heightOfString(String(v), { width: widths[i] - 6 }));
      const rowHeight = Math.max(...heights) + 6;
      if (doc.y + rowHeight > doc.page.height - 40) doc.addPage();
      const y = doc.y;
      let x = 30;
      values.forEach((v, i) => {
        doc.fontSize(8).font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(String(v), x + 3, y + 3, { width: widths[i] - 6, align: isNumeric(report.columns[i].type) ? 'right' : 'left' });
        x += widths[i];
      });
      doc.moveTo(30, y + rowHeight).lineTo(30 + usable, y + rowHeight).strokeColor('#d1d5db').lineWidth(0.5).stroke();
      doc.y = y + rowHeight;
    };

    drawRow(report.columns.map((c) => c.label), true);
    for (const row of report.rows) {
      drawRow(report.columns.map((c) => (isNumeric(c.type) ? fmtNumber(row[c.key], c.type) : row[c.key] ?? '')));
    }
    if (report.totals) {
      drawRow(
        report.columns.map((c, i) => (i === 0 ? 'Total' : report.totals[c.key] !== undefined ? fmtNumber(report.totals[c.key], c.type) : '')),
        true
      );
    }
    doc.end();
  });
}

import type { CalculatedBatch, Batch, Settings, MonthlyReport } from './types';

declare const window: {
  jspdf: {
    jsPDF: new (orientation?: 'p' | 'l', unit?: string, format?: string) => any;
  };
};

const geethaTexLogo = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMxNGI4YTYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjEgMTUgYy0xLjcgMS43LTQuMiAyLjUtNi41IDIuNXMtNC44LS44LTYuNS0yLjUiLz48cGF0aCBkPSJNM3EgOWMtMS43LTEuNy00LjItMi41LTYuNS0yLjVTMi4yIDYuOCAuNSA4LjUiLz48cGF0aCBkPSJNMjEgOWExMiAxMiAwIDAgMC02LjUtMi41QzEyLjIgNi41IDkuNyA3LjMgOCA5Ii8+PHBhdGggZD0iTTMgMTVjMS43IDEuNyA0LjIgMi41IDYuNSAyLjVzNC44LS44IDYuNS0yLjUiLz48bGluZSB4MT0iMTIiIHkxPSIyIiB4Mj0iMTIiIHkyPSIyMiIgLz48L3N2Zz4=';

export const generateBillPdf = (batch: CalculatedBatch, settings: Settings) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header
  doc.addImage(geethaTexLogo, 'SVG', 15, 10, 20, 20);
  doc.setFontSize(22);
  doc.setTextColor(37, 99, 235);
  doc.text(`${settings.companyName} 🧵`, 105, 20, { align: "center" });
  doc.setFontSize(18);
  doc.setTextColor(40);
  doc.text("Production Bill", 105, 28, { align: "center" });
  doc.setLineWidth(0.5);
  doc.line(15, 40, 195, 40);

  // Bill Details
  doc.setFontSize(12);
  doc.text(`Bill for Batch: ${batch.batchNumber}`, 15, 50);
  doc.text(`Date Generated: ${new Date().toLocaleDateString()}`, 195, 50, { align: 'right' });

  // Summary Table
  const tableData = [
    ['Machine Number', `Machine #${batch.machineNumber}`],
    ['Start Date', batch.startDate],
    ['Meter Processed', `${batch.meterValue.toFixed(2)} m`],
    ['Calculated FTotal', `${batch.ftotal}`],
    ['Average (Meter/FTotal)', `${batch.average.toFixed(2)}`],
  ];

  (doc as any).autoTable({
    startY: 60,
    head: [['Description', 'Details']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [15, 118, 110] }, // brand-teal-dark
  });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}`, 195, 285, { align: 'right' });
    doc.text(`Thank you for your business!`, 15, 285);
  }

  doc.save(`bill_batch_${batch.batchNumber}.pdf`);
};

const downloadFile = (content: string, filename: string, contentType: string) => {
  const blob = new Blob([content], { type: contentType });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const backupDataAsJson = (settings: Settings, batches: Batch[]) => {
  const data = {
    settings,
    batches,
    backupDate: new Date().toISOString(),
  };
  const jsonString = JSON.stringify(data, null, 2);
  downloadFile(jsonString, 'geetha_tex_backup.json', 'application/json');
};

const convertToCsv = (data: any[], headers: string[]): string => {
  const headerRow = headers.join(',');
  const rows = data.map(row =>
    headers.map(header => JSON.stringify(row[header], (_, value) => value ?? '')).join(',')
  );
  return [headerRow, ...rows].join('\r\n');
};

const getBatchCsvData = (batches: CalculatedBatch[]) => {
    return batches.map(b => ({
        "Batch Number": b.batchNumber,
        "Machine": b.machineNumber,
        "Start Date": b.startDate,
        "Meter": b.meterValue,
        "Ftotal": b.ftotal,
        "Average": b.average
    }));
}

export const exportReportAsCsv = (report: MonthlyReport, batches: CalculatedBatch[]) => {
    const headers = ["Batch Number", "Machine", "Start Date", "Meter", "Ftotal", "Average"];
    const data = getBatchCsvData(batches);
    const csv = convertToCsv(data, headers);
    downloadFile(csv, `report_${report.month.replace(' ', '_')}.csv`, 'text/csv;charset=utf-8;');
};

export const exportMachineReportAsCsv = (machineNumber: number, batches: CalculatedBatch[]) => {
    const headers = ["Batch Number", "Start Date", "Meter", "Ftotal", "Average"];
    const machineBatches = batches.filter(b => b.machineNumber === machineNumber);
    const data = getBatchCsvData(machineBatches);
    const csv = convertToCsv(data, headers);
    downloadFile(csv, `machine_${machineNumber}_report.csv`, 'text/csv;charset=utf-8;');
}
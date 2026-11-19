// Printable report window (the "Export PDF" of the report pages): the report's HTML between a
// company header and an "Issued by / on" footer, then the browser's print dialog.

export function printReport(opts: { title: string; html: string; userName?: string | null; logoUrl?: string | null; companyName?: string | null }): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  const now = new Date().toLocaleString();
  const logoHtml = opts.logoUrl
    ? `<img src="${opts.logoUrl}" alt="Logo" style="height:48px;max-width:160px;object-fit:contain;" />`
    : `<span style="font-size:18px;font-weight:700;">${opts.companyName ?? ""}</span>`;
  w.document.write(`
      <html><head><title>${opts.title}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 14px; color: #555; margin-bottom: 16px; }
        h3 { font-size: 13px; margin-top: 16px; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 12px; }
        th { background: #f5f5f5; font-weight: 600; }
        .text-right { text-align: right; }
        .total-row { font-weight: 700; background: #f9f9f9; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin-bottom: 16px; font-size: 12px; }
        .info-grid dt { color: #666; } .info-grid dd { font-weight: 600; margin: 0; }
        .report-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #111; }
        .report-header .logo { flex-shrink: 0; }
        .report-header .report-title { font-size: 20px; font-weight: 700; text-align: center; flex: 1; }
        .report-footer { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 11px; color: #555; }
        @media print {
          body { padding: 0; }
          .report-footer { position: fixed; bottom: 20px; left: 20px; right: 20px; }
        }
      </style></head><body>
      <div class="report-header">
        <div class="logo">${logoHtml}</div>
        <div class="report-title">${opts.title}</div>
        <div style="width:160px;"></div>
      </div>
      ${opts.html}
      <div class="report-footer">
        <span>Issued By: ${opts.userName || "System"}</span>
        <span>Issued on ${now}</span>
      </div>
      </body></html>
    `);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.close();
  }, 300);
  return true;
}

/** Saves a blob under a file name. */
export function downloadBlob(data: Blob, filename: string) {
  const url = window.URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

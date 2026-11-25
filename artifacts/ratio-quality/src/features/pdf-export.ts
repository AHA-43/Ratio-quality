// Turns an on-screen report into a real PDF file (works where window.print() does not, e.g. WhatsApp's in-app browser).
const PAGE_RATIO = 297 / 210; // A4 portrait

export async function elementToPdf(el: HTMLElement, opts: { width?: number; wrapperClass?: string } = {}): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const width = opts.width ?? 820;
  const host = document.createElement('div');
  host.className = `pdf-capture ${opts.wrapperClass ?? ''}`;
  host.setAttribute('dir', 'rtl');
  Object.assign(host.style, { position: 'fixed', left: '-12000px', top: '0', width: `${width}px`, background: '#ffffff', zIndex: '-1' });
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-print, button, .export-bar, details:not([open]) > :not(summary)').forEach(n => n.remove());
  clone.querySelectorAll('.reveal').forEach(n => n.classList.add('in'));
  host.appendChild(clone); document.body.appendChild(host);
  try {
    await document.fonts?.ready;
    await Promise.all([...host.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
    const scale = 2;
    const canvas = await html2canvas(host, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: width });
    // break pages between blocks rather than through a line of text
    const top0 = host.getBoundingClientRect().top;
    const cuts = [...host.querySelectorAll('section, .report-finding, .report-section-title, .report-action, .exec-sev, .ba-card, .surface-card, h2, h3')]
      .map(n => Math.round((n.getBoundingClientRect().top - top0) * scale)).filter(y => y > 0).sort((a, b) => a - b);
    const pageH = Math.round(canvas.width * PAGE_RATIO);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    let y = 0, page = 0;
    while (y < canvas.height - 4) {
      let end = Math.min(canvas.height, y + pageH);
      if (end < canvas.height) { const c = cuts.filter(v => v > y + pageH * 0.55 && v <= y + pageH).pop(); if (c) end = c; }
      const h = end - y;
      const slice = document.createElement('canvas'); slice.width = canvas.width; slice.height = h;
      const ctx = slice.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, slice.width, h); ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (page) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, 210, (h / canvas.width) * 210, undefined, 'FAST');
      pdf.setFontSize(8); pdf.setTextColor(140); pdf.text(`${page + 1}`, 105, 292, { align: 'center' });
      y = end; page++;
    }
    return pdf.output('blob');
  } finally { host.remove(); }
}

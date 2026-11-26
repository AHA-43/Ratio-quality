// Turns an on-screen report into a real PDF file (works where window.print() does not, e.g. WhatsApp's in-app browser).
const PAGE_RATIO = 297 / 210; // A4 portrait

export async function elementToPdf(el: HTMLElement, opts: { width?: number; wrapperClass?: string; footer?: string } = {}): Promise<Blob> {
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
    // Each A4 page: white margins, the content slice, and a thin branded footer (drawn by the browser, so Arabic renders correctly).
    const W = canvas.width, margin = Math.round(W * 0.045), footH = Math.round(W * 0.06);
    const pageH = Math.round(W * PAGE_RATIO), innerW = W - margin * 2, k = innerW / W;
    const room = Math.floor((pageH - margin - footH) / k); // source pixels that fit on one page
    const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pages: [number, number][] = []; let y = 0;
    while (y < canvas.height - 4) {
      let end = Math.min(canvas.height, y + room);
      if (end < canvas.height) { const c = cuts.filter(v => v > y + room * 0.55 && v <= y + room).pop(); if (c) end = c; }
      pages.push([y, end]); y = end;
    }
    pages.forEach(([from, to], page) => {
      const h = to - from;
      const sheet = document.createElement('canvas'); sheet.width = W; sheet.height = pageH;
      const ctx = sheet.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, pageH);
      ctx.drawImage(canvas, 0, from, W, h, margin, margin, innerW, Math.round(h * k));
      const fy = pageH - footH / 2;
      ctx.strokeStyle = '#e4ded4'; ctx.lineWidth = Math.max(1, W / 900); ctx.beginPath(); ctx.moveTo(margin, pageH - footH); ctx.lineTo(W - margin, pageH - footH); ctx.stroke();
      ctx.fillStyle = '#6b6b99'; ctx.textBaseline = 'middle'; ctx.font = `600 ${Math.round(W * 0.0135)}px ${font}`;
      ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillText(opts.footer ?? 'ريشيو · إدارة الجودة', W - margin, fy);
      ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.fillText(`${page + 1} / ${pages.length}`, margin, fy);
      ctx.fillStyle = '#07014f'; ctx.fillRect(W - margin - Math.round(W * 0.03), pageH - footH - Math.max(2, W / 450), Math.round(W * 0.03), Math.max(2, W / 450));
      if (page) pdf.addPage();
      pdf.addImage(sheet.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    });
    return pdf.output('blob');
  } finally { host.remove(); }
}

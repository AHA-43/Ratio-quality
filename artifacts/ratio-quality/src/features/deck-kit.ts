// Shared design system for every generated PowerPoint (visit report, monthly report).
// Brand: Dark Royal Blue #07014F, Sweet Milk #DBD4CA, Cornflower #7584F7, Camel #B66F4A, Royal Green #234E31.
import type PptxGenJS from 'pptxgenjs';

export type Pptx = PptxGenJS;
export type Slide = PptxGenJS.Slide;

export const C = {
  navy: '07014F', navy2: '1B1470', ink: '14123A', muted: '6B6B99', faint: '9A9AC0', line: 'E7E3DA',
  bg: 'F7F5F0', card: 'FFFFFF', milk: 'DBD4CA', corn: '7584F7', cornSoft: 'E8EBFE', cornInk: '3A46C4',
  camel: 'B66F4A', camelSoft: 'F6E9E1', green: '1F7A4D', greenSoft: 'E3F4EA', red: 'C43B32', redSoft: 'FDE8E6',
  amber: 'B8872A', amberSoft: 'FFF1D6', white: 'FFFFFF', onNavy: 'C9CCF4',
};
export const FONT = 'Arial';
export const W = 10, H = 5.625;
export const SEV = { Critical: { ar: 'حرج', color: C.red, soft: C.redSoft, due: 'التصحيح خلال 24 ساعة' }, Major: { ar: 'رئيسي', color: C.camel, soft: C.camelSoft, due: 'التصحيح خلال 72 ساعة' }, Minor: { ar: 'ثانوي', color: C.cornInk, soft: C.cornSoft, due: 'التصحيح خلال 7 أيام' } } as const;
export const CLS: Record<string, { color: string; soft: string }> = {
  'ممتاز': { color: '2E8B57', soft: C.greenSoft }, 'جيد': { color: '4F5FE0', soft: C.cornSoft }, 'يحتاج تحسين': { color: 'C9962E', soft: C.amberSoft }, 'غير مقبول': { color: C.red, soft: C.redSoft },
};
export const scoreColor = (v: number | null) => v === null ? C.muted : v >= 90 ? '2E8B57' : v >= 80 ? '4F5FE0' : v >= 70 ? 'C9962E' : C.red;
const SHADOW = { type: 'outer' as const, blur: 8, offset: 2, angle: 90, color: '07014F', opacity: 0.08 };

/** Right-aligned Arabic text box with sane defaults. */
export function T(s: Slide, text: string | PptxGenJS.TextProps[], o: PptxGenJS.TextPropsOptions) {
  s.addText(text as never, { fontFace: FONT, align: 'right', rtlMode: true, color: C.ink, margin: 0, valign: 'top', ...o });
}
export function card(p: Pptx, s: Slide, x: number, y: number, w: number, h: number, fill: string = C.card, opts: { line?: string; shadow?: boolean; radius?: number } = {}) {
  s.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: opts.line ?? fill, width: opts.line ? 0.75 : 0 }, rectRadius: opts.radius ?? 0.12, shadow: opts.shadow === false ? undefined : SHADOW });
}
/** Pill/chip; x is the RIGHT edge so chips flow right-to-left. Returns the left edge for the next chip. */
export function chip(p: Pptx, s: Slide, right: number, y: number, text: string, color: string, soft: string, size = 10): number {
  const w = Math.max(0.6, text.length * size * 0.0105 + 0.34);
  s.addShape(p.ShapeType.roundRect, { x: right - w, y, w, h: 0.3, fill: { color: soft }, line: { color: soft, width: 0 }, rectRadius: 0.15 });
  T(s, text, { x: right - w, y, w, h: 0.3, fontSize: size, bold: true, color, align: 'center', valign: 'middle' });
  return right - w - 0.08;
}
/** The Ratio "%" mark (two rings + slash) as a decorative line drawing. */
export function mark(p: Pptx, s: Slide, x: number, y: number, size: number, color: string, transparency = 0) {
  const lw = Math.max(1.5, size * 5.2);
  const ring = size * 0.34;
  s.addShape(p.ShapeType.ellipse, { x: x + size * 0.02, y: y + size * 0.04, w: ring, h: ring, fill: { color, transparency: 100 }, line: { color, width: lw, transparency } });
  s.addShape(p.ShapeType.ellipse, { x: x + size * 0.62, y: y + size * 0.6, w: ring, h: ring, fill: { color, transparency: 100 }, line: { color, width: lw, transparency } });
  s.addShape(p.ShapeType.line, { x: x + size * 0.1, y: y + size * 0.1, w: size * 0.8, h: size * 0.8, flipV: true, line: { color, width: lw, transparency } });
}
export function eyebrow(s: Slide, text: string, x: number, y: number, w: number, color: string = C.corn) {
  T(s, text, { x, y, w, h: 0.3, fontSize: 10.5, bold: true, color });
}
/** Light content slide: header with eyebrow + title, thin footer with page number. */
export function contentSlide(p: Pptx, eyebrowText: string, title: string, footerText: string) {
  const s = p.addSlide(); s.background = { color: C.bg };
  s.addShape(p.ShapeType.rect, { x: W - 0.12, y: 0, w: 0.12, h: H, fill: { color: C.navy }, line: { color: C.navy, width: 0 } });
  eyebrow(s, eyebrowText, 0.6, 0.38, 8.8);
  T(s, title, { x: 0.6, y: 0.62, w: 8.8, h: 0.6, fontSize: 24, bold: true, color: C.navy });
  footer(p, s, footerText);
  return s;
}
export function footer(p: Pptx, s: Slide, text: string, dark = false) {
  s.addShape(p.ShapeType.line, { x: 0.6, y: H - 0.42, w: 8.8, h: 0, line: { color: dark ? '2A2470' : C.line, width: 0.75 } });
  T(s, text, { x: 1.2, y: H - 0.34, w: 8.2, h: 0.22, fontSize: 8.5, color: dark ? C.onNavy : C.muted });
  s.slideNumber = { x: 0.55, y: H - 0.36, w: 0.5, h: 0.22, fontFace: FONT, fontSize: 8.5, color: dark ? C.onNavy : C.muted } as never;
}
/** Horizontal progress bar drawn right-to-left (fills from the right edge). */
export function bar(p: Pptx, s: Slide, x: number, y: number, w: number, h: number, value: number, color: string, track: string = 'ECE9F7') {
  s.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: track }, line: { color: track, width: 0 }, rectRadius: h / 2 });
  const fw = Math.max(h, w * Math.min(1, Math.max(0, value / 100)));
  s.addShape(p.ShapeType.roundRect, { x: x + w - fw, y, w: fw, h, fill: { color }, line: { color, width: 0 }, rectRadius: h / 2 });
}
/** Donut ring with the score in the middle (native chart: stays editable in PowerPoint). */
export function scoreRing(p: Pptx, s: Slide, x: number, y: number, d: number, score: number | null, color: string, label: string) {
  const v = score ?? 0;
  s.addChart(p.ChartType.doughnut, [{ name: 'score', labels: ['النتيجة', ''], values: [v, Math.max(0, 100 - v)] }], { x, y, w: d, h: d, holeSize: 74, chartColors: [color, 'ECE9F7'], showLegend: false, showValue: false, showLabel: false, showPercent: false, showTitle: false, dataBorder: { pt: 0, color: 'FFFFFF' } } as never);
  T(s, score === null ? '—' : `${score}%`, { x, y: y + d * 0.33, w: d, h: d * 0.24, fontSize: d * 9.2, bold: true, color: C.navy, align: 'center', valign: 'middle' });
  T(s, label, { x, y: y + d * 0.57, w: d, h: d * 0.13, fontSize: 10, color: C.muted, align: 'center', valign: 'middle' });
}
/** Chips that wrap onto a new row instead of running past \`minX\`. Returns the y just below the last row. */
export function chipRow(p: Pptx, s: Slide, right: number, y: number, minX: number, items: [string, string, string][], size = 10): number {
  let r = right, yy = y;
  for (const [text, color, soft] of items) { const w = Math.max(0.6, text.length * size * 0.0105 + 0.34); if (r - w < minX && r !== right) { r = right; yy += 0.38; } r = chip(p, s, r, yy, text, color, soft, size); }
  return yy + 0.3;
}
export const short = (t: string, n: number) => t.length > n ? `${t.slice(0, n - 1).trim()}…` : t;

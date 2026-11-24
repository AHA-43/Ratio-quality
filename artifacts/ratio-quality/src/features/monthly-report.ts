// One-button monthly management report (PowerPoint, native editable charts), built from the saved records.
import type { ActionItem, Branch, Inspection } from '../data.ts';
import { executiveSummary, focusInsights, monthRange } from './insights.ts';

const NAVY = '07014F', MILK = 'F4F1EB', CORN = '7584F7', CAMEL = 'B66F4A', RED = 'C43B32', GREEN = '3F9B6A', AMBER = 'D9A441', INK = '55558A';
type D = { inspections: Inspection[]; branches: Branch[]; actions: ActionItem[] };
const SEV: Record<string, string> = { Critical: 'حرج', Major: 'رئيسي', Minor: 'ثانوي' };
export const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('ar-SA-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = (k: string) => new Date(`${k}-15T12:00:00Z`).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', timeZone: 'UTC' });

/** Fixed, human-readable recommendations derived from the numbers (no AI involved). */
export function recommendations(s: ReturnType<typeof executiveSummary>, f: ReturnType<typeof focusInsights>): string[] {
  const out: string[] = [];
  if (s.criticalFailures > 0) out.push(`معالجة ${s.criticalFailures} إخفاق حرج خلال 24 ساعة والتحقق من إغلاقها.`);
  if (f.top[0]) out.push(`التركيز التدريبي على البند الأكثر فشلاً: «${f.top[0].q.title}» (${f.top[0].fails} حالة).`);
  if (s.worst[0] && s.worst[0].score < 90) out.push(`جدولة زيارة متابعة لـ ${s.worst.slice(0, 3).map(w => w.branch.name).join('، ')}.`);
  if (f.stale.length || f.never) out.push(`زيارة الفروع المتأخرة (${f.stale.length + f.never} فرع لم يُزر منذ 30 يوماً أو أكثر) حسب خطة الأسبوع.`);
  if (s.overdue) out.push(`إغلاق ${s.overdue} إجراء تصحيحي متأخر ومراجعة أسباب التأخير.`);
  if (!out.length) out.push('المحافظة على المستوى الحالي ومشاركة الممارسات الناجحة بين الفروع.');
  return out;
}

export async function buildMonthlyDeck(d: D, ym: string, logoWhite?: string | null) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const range = monthRange(ym);
  const s = executiveSummary(d, 31, range.to - 1, range);
  const f = focusInsights(d, range.to - 1, 31);
  const label = monthLabel(ym);
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_16x9'; pptx.rtlMode = true; pptx.title = `التقرير الشهري لجودة الفروع — ${label}`;
  type Slide = import('pptxgenjs').default.Slide; const font = 'Arial';
  const T = (sl: Slide, text: string, o: Record<string, unknown>) => sl.addText(text, { fontFace: font, align: 'right', rtlMode: true, color: NAVY, ...o });
  const footer = (sl: Slide, dark = false) => T(sl, `ريشيو | إدارة الجودة | التقرير الشهري ${label}`, { x: 0.4, y: 5.25, w: 9.2, h: 0.3, fontSize: 9, color: dark ? 'C9CCF4' : '6B6B99' });
  const title = (sl: Slide, text: string) => { sl.background = { color: MILK }; T(sl, text, { x: 0.5, y: 0.25, w: 9, h: 0.6, fontSize: 24, bold: true }); };
  const pct = (n: number | null) => n === null ? '—' : `${n}%`;

  // 1 cover
  const c = pptx.addSlide(); c.background = { color: NAVY };
  if (logoWhite) c.addImage({ data: logoWhite, x: 6.6, y: 0.45, w: 2.9, h: 0.9 });
  T(c, 'التقرير الشهري\nلجودة الفروع', { x: 3.6, y: 1.6, w: 5.9, h: 1.4, fontSize: 34, bold: true, color: 'FFFFFF' });
  T(c, label, { x: 3.6, y: 3.0, w: 5.9, h: 0.5, fontSize: 22, color: CORN, bold: true });
  T(c, `${s.visits} زيارة · ${s.branchesVisited} فرع`, { x: 3.6, y: 3.55, w: 5.9, h: 0.4, fontSize: 14, color: 'FFFFFF' });
  footer(c, true);

  // 2 executive summary
  const e = pptx.addSlide(); title(e, 'الخلاصة التنفيذية');
  e.addShape(pptx.ShapeType.roundRect, { x: 6.9, y: 1.05, w: 2.6, h: 2.1, fill: { color: NAVY }, rectRadius: 0.15 });
  T(e, 'متوسط الالتزام', { x: 6.9, y: 1.15, w: 2.4, h: 0.35, fontSize: 12, color: 'C9CCF4' });
  T(e, pct(s.avg), { x: 6.9, y: 1.5, w: 2.4, h: 0.9, fontSize: 40, bold: true, color: 'FFFFFF' });
  T(e, s.delta === null ? 'لا توجد مقارنة بالشهر السابق' : `${s.delta >= 0 ? '▲ +' : '▼ '}${s.delta} نقطة عن الشهر السابق`, { x: 6.9, y: 2.45, w: 2.4, h: 0.5, fontSize: 11, color: s.delta === null ? 'C9CCF4' : s.delta >= 0 ? '8EE3B0' : 'FFB4AB' });
  const kp: [string, string, string][] = [['زيارة مكتملة', String(s.visits), NAVY], ['تغطية الفروع', `${s.branchesVisited}/${s.branchesTotal}`, CORN], ['إخفاق حرج', String(s.criticalFailures), RED], ['إغلاق الإجراءات', s.actionsClosedPct === null ? '—' : `${s.actionsClosedPct}%`, GREEN]];
  kp.forEach(([lab, val, col], k) => { const x = 4.65 - (k % 2) * 2.1, y = 1.05 + Math.floor(k / 2) * 1.1;
    e.addShape(pptx.ShapeType.roundRect, { x, y, w: 2.0, h: 1.0, fill: { color: 'FFFFFF' }, line: { color: 'E4DED4' }, rectRadius: 0.1 });
    T(e, val, { x, y: y + 0.08, w: 2.0, h: 0.55, fontSize: 24, bold: true, color: col, align: 'center' }); T(e, lab, { x, y: y + 0.65, w: 2.0, h: 0.3, fontSize: 10, color: INK, align: 'center' }); });
  T(e, s.narrative.map(t => `• ${t}`).join('\n'), { x: 0.5, y: 3.3, w: 9, h: 1.85, fontSize: 12.5, valign: 'top', paraSpaceAfter: 4 });
  footer(e);

  // 3 distribution + trend
  const ch = pptx.addSlide(); title(ch, 'التصنيفات واتجاه الأداء');
  const cls = [['ممتاز', GREEN], ['جيد', CORN], ['يحتاج تحسين', AMBER], ['غير مقبول', RED]] as const;
  ch.addChart(pptx.ChartType.doughnut, [{ name: 'التصنيف', labels: cls.map(x => x[0]), values: cls.map(x => s.classCounts[x[0]]) }], { x: 5.2, y: 0.95, w: 4.4, h: 4.1, holeSize: 58, chartColors: cls.map(x => x[1]), showLegend: true, legendPos: 'b', legendFontFace: font, legendFontSize: 11, showValue: true, dataLabelColor: 'FFFFFF', dataLabelFontSize: 12, showTitle: true, title: 'توزيع نتائج الزيارات', titleFontFace: font, titleFontSize: 13, titleColor: NAVY });
  if (s.monthly.length >= 2) ch.addChart(pptx.ChartType.line, [{ name: 'متوسط الالتزام %', labels: s.monthly.map(m => monthShort(m.key)), values: s.monthly.map(m => m.avg) }], { x: 0.4, y: 0.95, w: 4.7, h: 4.1, chartColors: [NAVY], lineSize: 3, lineDataSymbolSize: 9, showValue: true, dataLabelFontSize: 10, dataLabelPosition: 't', valAxisMinVal: Math.max(0, Math.floor(Math.min(...s.monthly.map(m => m.avg)) / 10) * 10 - 5), valAxisMaxVal: 100, catAxisLabelFontFace: font, valAxisLabelFontFace: font, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10, showLegend: false, showTitle: true, title: 'اتجاه الأداء (آخر 6 أشهر)', titleFontFace: font, titleFontSize: 13, titleColor: NAVY });
  else T(ch, 'يلزم شهران على الأقل لعرض الاتجاه.', { x: 0.5, y: 2.5, w: 4.5, h: 0.6, fontSize: 13, color: INK, align: 'center' });
  footer(ch);

  // 4 sections
  const sec = pptx.addSlide(); title(sec, 'الأداء حسب القسم');
  if (s.sections.length) sec.addChart(pptx.ChartType.bar, [{ name: 'متوسط الالتزام %', labels: s.sections.map(x => x.name), values: s.sections.map(x => x.avg) }], { x: 0.5, y: 1.0, w: 9, h: 4.0, barDir: 'bar', chartColors: s.sections.map(x => x.avg < 70 ? RED : x.avg < 80 ? AMBER : GREEN), valAxisMinVal: 0, valAxisMaxVal: 100, showValue: true, dataLabelFontSize: 12, catAxisLabelFontFace: font, catAxisLabelFontSize: 12, valAxisLabelFontFace: font, showLegend: false, barGapWidthPct: 60 });
  else T(sec, 'لا توجد بيانات كافية.', { x: 0.5, y: 2.5, w: 9, h: 0.6, fontSize: 14, color: INK, align: 'center' });
  footer(sec);

  // 5 ranking
  const rk = pptx.addSlide(); title(rk, 'الفروع: الأفضل ومن تحتاج متابعة');
  const head = (t: string, fill: string) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: fill }, align: 'right' as const, fontFace: font, fontSize: 11 } });
  const rows = (list: { branch: Branch; score: number }[], good: boolean) => [[head('الفرع', good ? GREEN : RED), head('آخر نتيجة', good ? GREEN : RED)], ...(list.length ? list : [{ branch: { name: '—' } as Branch, score: NaN }]).map(x => [{ text: x.branch.name, options: { align: 'right' as const, fontFace: font, fontSize: 11, color: NAVY } }, { text: Number.isNaN(x.score) ? '—' : `${Math.round(x.score)}%`, options: { align: 'center' as const, fontFace: font, fontSize: 11, bold: true, color: x.score < 70 ? RED : x.score < 90 ? '8A5A00' : '1F7A4D' } }])];
  T(rk, 'الأفضل أداءً', { x: 5.1, y: 0.95, w: 4.4, h: 0.35, fontSize: 14, bold: true, color: '1F7A4D' }); rk.addTable(rows(s.best, true), { x: 5.1, y: 1.35, w: 4.4, colW: [3.1, 1.3], rowH: 0.42, border: { type: 'solid', color: 'E4DED4', pt: 0.75 }, fill: { color: 'FFFFFF' } });
  T(rk, 'تحتاج متابعة (أقل من 90%)', { x: 0.5, y: 0.95, w: 4.4, h: 0.35, fontSize: 14, bold: true, color: RED }); rk.addTable(rows(s.worst, false), { x: 0.5, y: 1.35, w: 4.4, colW: [3.1, 1.3], rowH: 0.42, border: { type: 'solid', color: 'E4DED4', pt: 0.75 }, fill: { color: 'FFFFFF' } });
  footer(rk);

  // 6 top failing items
  const tf = pptx.addSlide(); title(tf, 'أكثر البنود فشلاً');
  const trendTxt = (x: typeof f.top[number]) => x.delta === null || Math.abs(x.delta) < .05 ? '—' : x.delta > 0 ? '▲ يزداد' : '▼ يتحسن';
  const th = (t: string) => head(t, NAVY);
  tf.addTable([[th('#'), th('البند'), th('الخطورة'), th('الحالات'), th('الاتجاه')], ...f.top.slice(0, 7).map((x, k) => [
    { text: String(k + 1), options: { align: 'center' as const, fontFace: font, fontSize: 10.5 } }, { text: `${x.q.id}. ${x.q.title}`, options: { align: 'right' as const, fontFace: font, fontSize: 10.5, color: NAVY } },
    { text: SEV[x.q.severity], options: { align: 'center' as const, fontFace: font, fontSize: 10.5, bold: true, color: x.q.severity === 'Critical' ? RED : x.q.severity === 'Major' ? CAMEL : INK } },
    { text: `${x.fails}/${x.of}`, options: { align: 'center' as const, fontFace: font, fontSize: 10.5 } }, { text: trendTxt(x), options: { align: 'center' as const, fontFace: font, fontSize: 10.5, color: x.delta !== null && x.delta > 0 ? RED : '1F7A4D' } }])],
  { x: 0.5, y: 1.0, w: 9, colW: [0.5, 5.2, 1.0, 1.1, 1.2], rowH: 0.45, border: { type: 'solid', color: 'E4DED4', pt: 0.75 }, fill: { color: 'FFFFFF' } });
  if (!f.top.length) T(tf, 'لا توجد ملاحظات مسجلة في هذه الفترة.', { x: 0.5, y: 2.6, w: 9, h: 0.5, fontSize: 14, color: INK, align: 'center' });
  footer(tf);

  // 7 actions + coverage
  const ac = pptx.addSlide(); title(ac, 'الإجراءات وتغطية الزيارات');
  const tiles: [string, string, string][] = [['إجراءات مفتوحة', String(d.actions.filter(a => a.status !== 'مغلق').length), NAVY], ['حرجة مفتوحة', String(f.criticalOpen), RED], ['متأخرة', String(s.overdue), CAMEL], ['متوسط زمن الإغلاق', s.avgCloseDays === null ? '—' : `${s.avgCloseDays} يوم`, GREEN]];
  tiles.forEach(([lab, val, col], k) => { const xx = Math.max(0.2, 7.55 - k * 2.4); ac.addShape(pptx.ShapeType.roundRect, { x: xx, y: 1.0, w: 2.2, h: 1.2, fill: { color: 'FFFFFF' }, line: { color: 'E4DED4' }, rectRadius: 0.1 }); T(ac, val, { x: xx, y: 1.1, w: 2.2, h: 0.6, fontSize: 24, bold: true, color: col, align: 'center' }); T(ac, lab, { x: xx, y: 1.75, w: 2.2, h: 0.3, fontSize: 10.5, color: INK, align: 'center' }); });
  T(ac, `فروع تحتاج زيارة (${f.stale.length + f.never})`, { x: 0.5, y: 2.45, w: 9, h: 0.4, fontSize: 15, bold: true });
  T(ac, (f.never ? `• ${f.never} فرع لم يُزر بعد.\n` : '') + (f.stale.slice(0, 6).map(x => `• ${x.branch.name} — ${x.days} يوماً`).join('\n') || (f.never ? '' : 'كل الفروع مزارة خلال آخر 30 يوماً.')), { x: 0.5, y: 2.9, w: 9, h: 2.2, fontSize: 12, valign: 'top' });
  footer(ac);

  // 8 recommendations
  const rc = pptx.addSlide(); rc.background = { color: NAVY };
  T(rc, 'التوصيات للشهر القادم', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 26, bold: true, color: 'FFFFFF' });
  T(rc, recommendations(s, f).map((t, k) => `${k + 1}.  ${t}`).join('\n\n'), { x: 0.7, y: 1.2, w: 8.6, h: 3.7, fontSize: 15, color: 'FFFFFF', valign: 'top' });
  footer(rc, true);
  return pptx;
}

export const monthlyFileName = (ym: string) => `Ratio-monthly-${ym}.pptx`;

/** Browser entry: builds the deck with the brand logo and returns a downloadable blob. */
export async function exportMonthlyReport(d: D, ym: string): Promise<{ blob: Blob; name: string }> {
  const { toDataUrl } = await import('./exports');
  const deck = await buildMonthlyDeck(d, ym, await toDataUrl('/brand/logo-ar-white.png'));
  return { blob: await deck.write({ outputType: 'blob' }) as Blob, name: monthlyFileName(ym) };
}

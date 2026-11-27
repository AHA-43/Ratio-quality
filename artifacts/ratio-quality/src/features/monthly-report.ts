// One-button monthly management report (PowerPoint, native editable charts), built from the saved records.
import type { ActionItem, Branch, Inspection } from '../data.ts';
import { executiveSummary, focusInsights, monthRange } from './insights.ts';
import { DEFAULT_TARGET, standings } from './targets.ts';
import { bar, C, card, chip, chipRow, CLS, contentSlide, eyebrow, FONT, footer, H, mark, scoreColor, scoreRing, SEV as SEV_K, short, T, type Pptx } from './deck-kit.ts';

type D = { inspections: Inspection[]; branches: Branch[]; actions: ActionItem[] };
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

/** Latest facade photo per branch (data URL), from any visit. */
function facades(d: D): Map<string, string> {
  const m = new Map<string, { at: string; data: string }>();
  for (const i of d.inspections) { const f = i.facade?.data; if (!f || !f.startsWith('data:')) continue; const cur = m.get(i.branchId); if (!cur || i.date > cur.at) m.set(i.branchId, { at: i.date, data: f }); }
  return new Map([...m].map(([k, v]) => [k, v.data]));
}

export async function buildMonthlyDeck(d: D, ym: string, logoWhite?: string | null, target = DEFAULT_TARGET) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const range = monthRange(ym);
  const s = executiveSummary(d, 31, range.to - 1, range);
  const f = focusInsights(d, range.to - 1, 31);
  const label = monthLabel(ym);
  const p: Pptx = new PptxGenJS(); p.layout = 'LAYOUT_16x9'; p.rtlMode = true; p.title = `التقرير الشهري لجودة الفروع — ${label}`; p.company = 'Ratio Specialty Coffee';
  const foot = `ريشيو · إدارة الجودة · التقرير الشهري · ${label}`;
  const pct = (n: number | null) => n === null ? '—' : `${n}%`;
  const fac = facades(d);
  const st = standings(d, target, range.to);
  const visitedIds = [...new Set(d.inspections.filter(i => { const t = Date.parse(i.date.replace(' ', 'T')); return i.status === 'finalized' && t >= range.from && t < range.to; }).map(i => i.branchId))];

  /* 1 ─ cover: up to three facades of branches visited this month */
  const cv = p.addSlide(); cv.background = { color: C.navy };
  const pics = visitedIds.map(id => fac.get(id)).filter((x): x is string => Boolean(x)).slice(0, 3);
  if (pics.length) {
    const h = H / pics.length;
    pics.forEach((data, k) => cv.addImage({ data, x: 0, y: k * h, w: 4.6, h: h - (k < pics.length - 1 ? 0.04 : 0), sizing: { type: 'cover', w: 4.6, h: h - (k < pics.length - 1 ? 0.04 : 0) } }));
    cv.addShape(p.ShapeType.rect, { x: 4.6, y: 0, w: 0.06, h: H, fill: { color: C.corn }, line: { color: C.corn, width: 0 } });
  } else {
    cv.addShape(p.ShapeType.ellipse, { x: -2.2, y: 1.4, w: 6.4, h: 6.4, fill: { color: C.navy2 }, line: { color: C.navy2, width: 0 } });
    mark(p, cv, -0.2, 1.75, 3.7, C.corn, 55);
  }
  const tx = pics.length ? 5.1 : 3.6, tw = 9.4 - tx;
  if (logoWhite) cv.addImage({ data: logoWhite, x: 7.35, y: 0.5, w: 2.05, h: 0.63 });
  eyebrow(cv, 'إدارة الجودة', tx, 1.5, tw);
  T(cv, 'التقرير الشهري\nلجودة الفروع', { x: tx, y: 1.85, w: tw, h: 1.35, fontSize: 32, bold: true, color: C.white, valign: 'middle' });
  T(cv, label, { x: tx, y: 3.25, w: tw, h: 0.45, fontSize: 20, bold: true, color: C.corn });
  chipRow(p, cv, 9.4, 3.95, tx, [[`${s.visits} زيارة`, C.white, C.navy2], [`${s.branchesVisited} فرع`, C.white, C.navy2], [`متوسط ${pct(s.avg)}`, C.navy, C.white], ...(st.total ? [[`حققت الهدف ${st.met}/${st.total}`, C.navy, C.corn] as [string, string, string]] : [])], 11);
  footer(p, cv, 'ريشيو للقهوة المختصة', true);

  /* 2 ─ executive summary */
  const ex = contentSlide(p, 'الخلاصة التنفيذية', 'الشهر في لمحة', foot);
  card(p, ex, 0.6, 1.4, 3.3, 3.55);
  scoreRing(p, ex, 1.0, 1.5, 2.5, s.avg, scoreColor(s.avg), 'متوسط الالتزام');
  T(ex, s.delta === null ? 'لا توجد مقارنة بالشهر السابق' : `${s.delta >= 0 ? '▲ +' : '▼ '}${s.delta} نقطة عن الشهر السابق`, { x: 0.6, y: 4.2, w: 3.3, h: 0.3, fontSize: 10.5, bold: true, color: s.delta === null ? C.muted : s.delta >= 0 ? C.green : C.red, align: 'center' });
  const kp: [string, string, string, number][] = [
    ['زيارة مكتملة', String(s.visits), C.navy, 100],
    ['تغطية الفروع', `${s.branchesVisited}/${s.branchesTotal}`, C.cornInk, s.coveragePct],
    ['إخفاق حرج', String(s.criticalFailures), C.red, s.criticalFailures ? 100 : 0],
    ['إغلاق الإجراءات', s.actionsClosedPct === null ? '—' : `${s.actionsClosedPct}%`, C.green, s.actionsClosedPct ?? 0],
  ];
  kp.forEach(([lab, val, col, v], k) => { const x = 7.25 - (k % 2) * 2.65, y = 1.4 + Math.floor(k / 2) * 1.2;
    card(p, ex, x, y, 2.5, 1.05); T(ex, val, { x: x + 0.2, y: y + 0.12, w: 2.1, h: 0.5, fontSize: 24, bold: true, color: col }); T(ex, lab, { x: x + 0.2, y: y + 0.6, w: 2.1, h: 0.22, fontSize: 10, color: C.muted }); bar(p, ex, x + 0.2, y + 0.86, 2.1, 0.06, v, col); });
  card(p, ex, 4.25, 3.85, 5.15, 1.1, C.cornSoft, { shadow: false });
  T(ex, s.narrative.slice(0, 3).map(t => `• ${t}`).join('\n') || 'لا توجد زيارات مكتملة في هذا الشهر.', { x: 4.4, y: 3.92, w: 4.85, h: 0.98, fontSize: 10, color: C.navy, valign: 'middle', fit: 'shrink', lineSpacingMultiple: 1.1 });

  /* 3 ─ distribution + trend */
  const ch = contentSlide(p, 'النتائج', 'التصنيفات واتجاه الأداء', foot);
  const cls = ['ممتاز', 'جيد', 'يحتاج تحسين', 'غير مقبول'] as const;
  card(p, ch, 5.3, 1.4, 4.1, 3.55); card(p, ch, 0.6, 1.4, 4.5, 3.55);
  ch.addChart(p.ChartType.doughnut, [{ name: 'التصنيف', labels: [...cls], values: cls.map(c => s.classCounts[c]) }], { x: 5.4, y: 1.5, w: 3.9, h: 3.35, holeSize: 62, chartColors: cls.map(c => CLS[c].color), showLegend: true, legendPos: 'b', legendFontFace: FONT, legendFontSize: 10, legendColor: C.ink, showValue: true, dataLabelColor: 'FFFFFF', dataLabelFontSize: 11, showTitle: true, title: 'توزيع نتائج الزيارات', titleFontFace: FONT, titleFontSize: 12, titleColor: C.navy, dataBorder: { pt: 1, color: 'FFFFFF' } } as never);
  if (s.monthly.length >= 2) ch.addChart(p.ChartType.line, [{ name: 'متوسط الالتزام %', labels: s.monthly.map(m => monthShort(m.key)), values: s.monthly.map(m => m.avg) }], { x: 0.7, y: 1.5, w: 4.3, h: 3.35, chartColors: [C.corn], lineSize: 3, lineDataSymbolSize: 8, lineDataSymbol: 'circle', showValue: true, dataLabelFontSize: 10, dataLabelColor: C.navy, dataLabelPosition: 't', valAxisMinVal: Math.max(0, Math.floor(Math.min(...s.monthly.map(m => m.avg)) / 10) * 10 - 5), valAxisMaxVal: 100, catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, catAxisLabelFontSize: 10, valAxisLabelFontSize: 9, catAxisLabelColor: C.muted, valAxisLabelColor: C.faint, valGridLine: { color: 'ECE9F7', size: 0.75 }, catAxisLineShow: false, valAxisLineShow: false, showLegend: false, showTitle: true, title: 'اتجاه الأداء (آخر 6 أشهر)', titleFontFace: FONT, titleFontSize: 12, titleColor: C.navy } as never);
  else T(ch, 'يلزم شهران على الأقل لعرض الاتجاه.', { x: 0.7, y: 2.9, w: 4.3, h: 0.5, fontSize: 12, color: C.muted, align: 'center' });

  /* 4 ─ sections */
  const sc = contentSlide(p, 'الأداء حسب القسم', 'أين نحن أقوياء وأين نحتاج تركيزاً', foot);
  if (!s.sections.length) T(sc, 'لا توجد بيانات كافية.', { x: 0.6, y: 2.8, w: 8.8, h: 0.5, fontSize: 13, color: C.muted, align: 'center' });
  const rowH = Math.min(0.85, 3.6 / Math.max(1, s.sections.length));
  s.sections.forEach((x, k) => { const y = 1.45 + k * rowH; card(p, sc, 0.6, y, 8.8, rowH - 0.13);
    T(sc, x.name, { x: 6.2, y: y + (rowH - 0.13) / 2 - 0.15, w: 3.0, h: 0.3, fontSize: 13, bold: true, color: C.navy, valign: 'middle' });
    bar(p, sc, 1.75, y + (rowH - 0.13) / 2 - 0.065, 4.25, 0.13, x.avg, scoreColor(x.avg));
    T(sc, `${Math.round(x.avg)}%`, { x: 0.75, y: y + (rowH - 0.13) / 2 - 0.18, w: 0.9, h: 0.36, fontSize: 16, bold: true, color: scoreColor(x.avg), align: 'left', valign: 'middle' }); });

  /* 5 ─ ranking with facades */
  const rk = contentSlide(p, 'الفروع', 'الأفضل أداءً ومن يحتاج متابعة', foot);
  const col = (title: string, color: string, list: { branch: Branch; score: number }[], x: number) => {
    T(rk, title, { x, y: 1.35, w: 4.3, h: 0.3, fontSize: 13, bold: true, color });
    if (!list.length) { T(rk, '—', { x, y: 1.8, w: 4.3, h: 0.3, fontSize: 12, color: C.muted }); return; }
    list.slice(0, 5).forEach((r, k) => { const y = 1.75 + k * 0.64; card(p, rk, x, y, 4.3, 0.54);
      const img = fac.get(r.branch.id);
      if (img) rk.addImage({ data: img, x: x + 3.62, y: y + 0.05, w: 0.62, h: 0.44, sizing: { type: 'cover', w: 0.62, h: 0.44 }, rounding: false });
      T(rk, short(r.branch.name, 30), { x: x + 1.0, y: y + 0.07, w: img ? 2.5 : 3.15, h: 0.4, fontSize: 11, bold: true, color: C.navy, valign: 'middle' });
      T(rk, `${Math.round(r.score)}%`, { x: x + 0.12, y: y + 0.07, w: 0.85, h: 0.4, fontSize: 14, bold: true, color: scoreColor(r.score), align: 'left', valign: 'middle' }); });
  };
  col('الأفضل أداءً', C.green, s.best, 5.1); col(`تحتاج متابعة (أقل من ${target}%)`, C.red, st.below.map(r => ({ branch: r.branch, score: r.score })), 0.6);
  if (st.total) T(rk, `حققت ${st.met} من ${st.total} فرعاً هدف الالتزام ${target}% (حسب آخر زيارة لكل فرع)`, { x: 0.6, y: 4.95, w: 8.8, h: 0.25, fontSize: 9.5, color: C.muted });

  /* 6 ─ top failing items */
  const tf = contentSlide(p, 'نقاط التركيز', 'أكثر البنود فشلاً هذا الشهر', foot);
  if (!f.top.length) T(tf, 'لا توجد ملاحظات مسجلة في هذه الفترة.', { x: 0.6, y: 2.8, w: 8.8, h: 0.5, fontSize: 13, color: C.muted, align: 'center' });
  f.top.slice(0, 6).forEach((x, k) => { const y = 1.4 + k * 0.6, sev = SEV_K[x.q.severity]; card(p, tf, 0.6, y, 8.8, 0.5);
    T(tf, String(k + 1), { x: 8.85, y: y + 0.08, w: 0.4, h: 0.34, fontSize: 14, bold: true, color: C.corn, align: 'center', valign: 'middle' });
    T(tf, short(`${x.q.id}. ${x.q.title}`, 52), { x: 4.3, y: y + 0.08, w: 4.5, h: 0.34, fontSize: 11, bold: true, color: C.navy, valign: 'middle' });
    chip(p, tf, 4.2, y + 0.1, sev.ar, sev.color, sev.soft, 9);
    bar(p, tf, 1.55, y + 0.21, 1.75, 0.08, Math.max(4, x.rate * 100), sev.color);
    T(tf, `${x.fails}/${x.of}`, { x: 0.7, y: y + 0.08, w: 0.8, h: 0.34, fontSize: 11, bold: true, color: C.ink, align: 'left', valign: 'middle' });
    if (x.delta !== null && Math.abs(x.delta) >= .05) T(tf, x.delta > 0 ? '▲' : '▼', { x: 3.3, y: y + 0.08, w: 0.25, h: 0.34, fontSize: 10, color: x.delta > 0 ? C.red : C.green, align: 'center', valign: 'middle' }); });

  /* 7 ─ actions + coverage */
  const ac = contentSlide(p, 'المتابعة', 'الإجراءات التصحيحية وتغطية الزيارات', foot);
  const tiles: [string, string, string][] = [['إجراءات مفتوحة', String(d.actions.filter(a => a.status !== 'مغلق').length), C.navy], ['حرجة مفتوحة', String(f.criticalOpen), C.red], ['متأخرة', String(s.overdue), C.camel], ['متوسط زمن الإغلاق', s.avgCloseDays === null ? '—' : `${s.avgCloseDays} يوم`, C.green]];
  tiles.forEach(([lab, val, c2], k) => { const x = 7.35 - k * 2.25; card(p, ac, x, 1.4, 2.05, 1.05); T(ac, val, { x: x + 0.15, y: 1.5, w: 1.75, h: 0.5, fontSize: 22, bold: true, color: c2 }); T(ac, lab, { x: x + 0.15, y: 2.0, w: 1.75, h: 0.25, fontSize: 10, color: C.muted }); });
  card(p, ac, 0.6, 2.7, 8.8, 2.25);
  T(ac, `فروع تحتاج زيارة (${f.stale.length + f.never})`, { x: 0.85, y: 2.82, w: 8.3, h: 0.3, fontSize: 13, bold: true, color: C.navy });
  T(ac, (f.never ? `• ${f.never} فرع لم يُزر بعد.\n` : '') + (f.stale.slice(0, 6).map(x => `• ${x.branch.name} — ${x.days} يوماً`).join('\n') || (f.never ? '' : 'كل الفروع مزارة خلال آخر 30 يوماً.')), { x: 0.85, y: 3.18, w: 8.3, h: 1.7, fontSize: 11, color: C.ink, lineSpacingMultiple: 1.15 });

  /* 8 ─ recommendations */
  const rc = p.addSlide(); rc.background = { color: C.navy };
  mark(p, rc, 6.6, 1.2, 3.1, C.corn, 60);
  if (logoWhite) rc.addImage({ data: logoWhite, x: 0.6, y: 0.5, w: 1.75, h: 0.54 });
  eyebrow(rc, 'للشهر القادم', 0.6, 1.4, 6.0);
  T(rc, 'التوصيات', { x: 0.6, y: 1.7, w: 6.0, h: 0.55, fontSize: 26, bold: true, color: C.white });
  T(rc, recommendations(s, f).map((t, k) => `${k + 1}.  ${t}`).join('\n'), { x: 0.6, y: 2.35, w: 6.0, h: 2.6, fontSize: 13, color: C.white, lineSpacingMultiple: 1.35, fit: 'shrink' });
  footer(p, rc, 'إدارة الجودة — ريشيو للقهوة المختصة', true);
  return p;
}

export const monthlyFileName = (ym: string) => `Ratio-monthly-${ym}.pptx`;

/** Browser entry: builds the deck with the brand logo and returns a downloadable blob. */
export async function exportMonthlyReport(d: D, ym: string, target?: number): Promise<{ blob: Blob; name: string }> {
  const { toDataUrl } = await import('./exports');
  const { getMedia } = await import('../data');
  // facades are stored apart from the visit records: load them (latest per branch only)
  const latest = new Map<string, Inspection>();
  for (const i of d.inspections) if (i.facade?.id) { const c = latest.get(i.branchId); if (!c || i.date > c.date) latest.set(i.branchId, i); }
  const withFacades = await Promise.all(d.inspections.map(async i => latest.get(i.branchId) === i && i.facade ? { ...i, facade: { ...i.facade, data: await getMedia(i.facade).catch(() => '') } } : i));
  const { getConfigTarget } = await import('../session');
  const deck = await buildMonthlyDeck({ ...d, inspections: withFacades }, ym, await toDataUrl('/brand/logo-ar-white.png'), target ?? getConfigTarget());
  return { blob: await deck.write({ outputType: 'blob' }) as Blob, name: monthlyFileName(ym) };
}

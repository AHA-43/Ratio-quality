// Client-side report exports built from the same saved inspection record (the approved snapshot once approved).
import type { ActionItem, Inspection, Question } from '../data';
import { TASTING_SCORE_FIELDS } from '../checklist.ts';
import { calculateScore, WEIGHTS } from '../scoring.ts';
import { workflowLabel } from '../labels.ts';

const SEV_AR = { Critical: 'حرج', Major: 'رئيسي', Minor: 'ثانوي' } as const;
const NAVY = '07014F', MILK = 'F4F1EB', CORN = '7584F7';
const failed = (i: Inspection, q: Question) => { const a = i.answers[q.id]; return Boolean(a && (a.value === 'fail' || a.initialValue === 'fail')); };
const resultAr = (v: unknown) => v === 'pass' ? 'مطابق' : v === 'fail' ? 'غير مطابق' : v === 'na' ? 'لا ينطبق' : 'بدون إجابة';
const fileBase = (i: Inspection) => `${i.number ?? 'RQ'}_${(i.branchCode ?? 'BRANCH').replace(/[^A-Za-z0-9.]+/g, '-')}_${i.date.slice(0, 10)}`;

async function toDataUrl(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  try {
    const blob = await (await fetch(src)).blob();
    return await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsDataURL(blob); });
  } catch { return null; }
}

/** Share via the phone share sheet (Mail, WhatsApp…) when available, else download. */
export async function deliver(blob: Blob, filename: string, share: boolean) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (share && nav.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch { /* cancelled → fall back to download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportXlsx(i: Inspection, actions: ActionItem[]): Promise<{ blob: Blob; name: string }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); wb.creator = 'Ratio Quality'; wb.created = new Date();
  const s = calculateScore(i.questionSnapshot, i.answers);
  const header = (ws: import('exceljs').Worksheet) => { const r = ws.getRow(1); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } }; r.alignment = { vertical: 'middle', horizontal: 'right' }; ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }]; };

  const sum = wb.addWorksheet('الملخص', { views: [{ rightToLeft: true }] });
  sum.columns = [{ header: 'البند', key: 'k', width: 28 }, { header: 'القيمة', key: 'v', width: 48 }];
  const fails = i.questionSnapshot.filter(q => failed(i, q));
  ([
    ['رقم الزيارة', i.number ?? '—'], ['الفرع', i.branchName], ['رمز الفرع', i.branchCode ?? '—'], ['تاريخ الزيارة', i.date], ['المفتش', i.inspector],
    ['الفترة', i.shift], ['عدد الموظفين', i.employees], ['نوع الزيارة', i.type], ['الحالة', workflowLabel(i)],
    ['النسبة الموزونة %', s.score ?? '—'], ['التصنيف', s.classification ?? '—'], ['إخفاقات حرجة', s.criticalFailures],
    ['عدد الملاحظات', fails.length], ['حرج / رئيسي / ثانوي', ['Critical', 'Major', 'Minor'].map(k => fails.filter(q => q.severity === k).length).join(' / ')],
    ['ملاحظات متكررة', fails.filter(q => i.answers[q.id]?.recurring).length],
    ['الأوزان', `حرج ${WEIGHTS.Critical} · رئيسي ${WEIGHTS.Major} · ثانوي ${WEIGHTS.Minor}`],
    ['اعتمده', i.approvedBy ? `${i.approvedBy.name} · ${i.approvedAt?.slice(0, 16).replace('T', ' ')}` : '—'],
    ['بصمة النسخة المعتمدة', i.snapshotHash ?? '—'],
  ] as [string, string | number][]).forEach(([k, v]) => sum.addRow({ k, v }));
  header(sum);

  const res = wb.addWorksheet('النتائج');
  res.columns = [
    { header: '#', key: 'id', width: 5 }, { header: 'القسم', key: 'section', width: 22 }, { header: 'بند الفحص', key: 'title', width: 52 },
    { header: 'الخطورة', key: 'sev', width: 10 }, { header: 'الوزن', key: 'w', width: 7 }, { header: 'النتيجة', key: 'result', width: 12 },
    { header: 'الإخفاق الأولي', key: 'init', width: 12 }, { header: 'القراءة', key: 'reading', width: 14 }, { header: 'الوحدة', key: 'unit', width: 10 },
    ...TASTING_SCORE_FIELDS.map(f => ({ header: f, key: `t_${f}`, width: 8 })),
    { header: 'الملاحظة', key: 'obs', width: 48 }, { header: 'التوصية', key: 'rec', width: 40 }, { header: 'متكررة', key: 'recurring', width: 8 },
    { header: 'صُححت أثناء الزيارة', key: 'fixed', width: 14 }, { header: 'عدد الصور', key: 'photos', width: 9 },
  ];
  for (const q of i.questionSnapshot) {
    const a = i.answers[q.id];
    const row = res.addRow({ id: q.id, section: q.section, title: q.title, sev: SEV_AR[q.severity], w: WEIGHTS[q.severity], result: resultAr(a?.value),
      init: a?.initialValue === 'fail' ? 'غير مطابق' : '', reading: a?.actual ?? '', unit: q.measurement?.unit ?? '',
      ...Object.fromEntries(TASTING_SCORE_FIELDS.map(f => [`t_${f}`, a?.tasting?.[f] ?? ''])),
      obs: a?.observation ?? '', rec: a?.recommendation ?? '', recurring: a?.recurring ? 'نعم' : '', fixed: a?.correctedDuringVisit ? 'نعم' : '', photos: a?.attachments?.length ?? 0 });
    if (failed(i, q)) row.getCell('result').font = { bold: true, color: { argb: 'FFB3261E' } };
    row.alignment = { wrapText: true, vertical: 'top', horizontal: 'right' };
  }
  res.autoFilter = { from: 'A1', to: { row: 1, column: res.columns.length } };
  header(res);

  const sec = wb.addWorksheet('تحليل الأقسام');
  sec.columns = [{ header: 'القسم', key: 's', width: 26 }, { header: 'بنود', key: 'n', width: 8 }, { header: 'مطابق', key: 'p', width: 8 }, { header: 'غير مطابق', key: 'f', width: 10 }, { header: 'لا ينطبق', key: 'na', width: 9 }, { header: 'النسبة الموزونة %', key: 'score', width: 16 }];
  for (const name of [...new Set(i.questionSnapshot.map(q => q.section))]) {
    const qs = i.questionSnapshot.filter(q => q.section === name);
    const r = calculateScore(qs, i.answers);
    sec.addRow({ s: name, n: qs.length, p: qs.filter(q => i.answers[q.id]?.value === 'pass').length, f: qs.filter(q => failed(i, q)).length, na: qs.filter(q => i.answers[q.id]?.value === 'na').length, score: r.score ?? '—' });
  }
  header(sec);

  const act = wb.addWorksheet('الإجراءات التصحيحية');
  act.columns = [{ header: 'البند', key: 'q', width: 6 }, { header: 'الملاحظة', key: 'd', width: 46 }, { header: 'الإجراء المطلوب', key: 'r', width: 40 }, { header: 'الخطورة', key: 's', width: 10 }, { header: 'المسؤول', key: 'who', width: 18 }, { header: 'الاستحقاق', key: 'due', width: 12 }, { header: 'الحالة', key: 'st', width: 14 }];
  actions.forEach(a => act.addRow({ q: a.questionId, d: a.description, r: a.recommendation, s: SEV_AR[a.severity], who: a.responsible, due: a.dueDate, st: a.status }));
  act.autoFilter = { from: 'A1', to: { row: 1, column: 7 } };
  header(act);

  const buf = await wb.xlsx.writeBuffer();
  return { blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name: `${fileBase(i)}.xlsx` };
}

export async function exportPptx(i: Inspection, actions: ActionItem[]): Promise<{ blob: Blob; name: string }> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_16x9'; pptx.rtlMode = true; pptx.title = `تقرير زيارة ${i.branchName}`;
  const font = 'Arial';
  const logoWhite = await toDataUrl('/brand/logo-ar-white.png');
  const logoNavy = await toDataUrl('/brand/logo-ar-navy.png');
  const s = calculateScore(i.questionSnapshot, i.answers);
  const fails = i.questionSnapshot.filter(q => failed(i, q));
  const footer = (slide: import('pptxgenjs').default.Slide, dark = false) => slide.addText(`ريشيو | إدارة الجودة${i.number ? ` | ${i.number}` : ''}${i.workflow === 'approved' ? '' : ' | نسخة غير معتمدة'}`, { x: 0.4, y: 5.25, w: 9.2, h: 0.3, fontFace: font, fontSize: 9, color: dark ? 'C9CCF4' : '6B6B99', align: 'right', rtlMode: true });
  const T = (slide: import('pptxgenjs').default.Slide, text: string, o: Record<string, unknown>) => slide.addText(text, { fontFace: font, align: 'right', rtlMode: true, color: NAVY, ...o });

  // cover
  const cover = pptx.addSlide(); cover.background = { color: NAVY };
  if (logoWhite) cover.addImage({ data: logoWhite, x: 6.6, y: 0.45, w: 2.9, h: 0.9 });
  T(cover, 'تقرير فحص جودة\nالقهوة والمعدات', { x: 3.6, y: 1.6, w: 5.9, h: 1.4, fontSize: 32, bold: true, color: 'FFFFFF' });
  T(cover, i.branchName, { x: 3.6, y: 3.0, w: 5.9, h: 0.5, fontSize: 20, color: 'FFFFFF' });
  T(cover, `${i.branchCode ?? ''}  ·  ${i.date.slice(0, 10)}  ·  المفتش: ${i.inspector}`, { x: 3.6, y: 3.5, w: 5.9, h: 0.4, fontSize: 13, color: CORN });
  footer(cover, true);

  // summary
  const sm = pptx.addSlide(); sm.background = { color: MILK };
  T(sm, 'ملخص الزيارة', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 24, bold: true });
  sm.addShape(pptx.ShapeType.roundRect, { x: 6.9, y: 1.1, w: 2.6, h: 3.6, fill: { color: NAVY }, rectRadius: 0.15 });
  T(sm, 'النسبة الموزونة', { x: 6.9, y: 1.3, w: 2.4, h: 0.4, fontSize: 12, color: 'C9CCF4' });
  T(sm, s.score === null ? '—' : `${s.score}%`, { x: 6.9, y: 1.8, w: 2.4, h: 1.0, fontSize: 40, bold: true, color: 'FFFFFF' });
  T(sm, s.classification ?? '—', { x: 6.9, y: 2.9, w: 2.4, h: 0.5, fontSize: 18, color: CORN, bold: true });
  if (s.criticalFailures) T(sm, 'إخفاق حرج: التصنيف غير مقبول', { x: 6.9, y: 3.5, w: 2.4, h: 0.6, fontSize: 11, color: 'FFB4AB' });
  const tiles: [string, number, string][] = [
    ['إجمالي الملاحظات', fails.length, NAVY], ['ملاحظات حرجة', fails.filter(q => q.severity === 'Critical').length, 'B3261E'],
    ['ملاحظات رئيسية', fails.filter(q => q.severity === 'Major').length, 'B66F4A'], ['ملاحظات ثانوية', fails.filter(q => q.severity === 'Minor').length, CORN],
    ['صُححت أثناء الزيارة', fails.filter(q => i.answers[q.id]?.correctedDuringVisit).length, '234E31'], ['ملاحظات متكررة', fails.filter(q => i.answers[q.id]?.recurring).length, '2D1919'],
  ];
  tiles.forEach(([label, n, color], k) => {
    const x = 4.6 - (k % 3) * 2.05, y = 1.1 + Math.floor(k / 3) * 1.85;
    sm.addShape(pptx.ShapeType.roundRect, { x, y, w: 1.9, h: 1.7, fill: { color: 'FFFFFF' }, line: { color: 'E4DED4' }, rectRadius: 0.1 });
    T(sm, String(n), { x, y: y + 0.2, w: 1.9, h: 0.8, fontSize: 30, bold: true, color, align: 'center' });
    T(sm, label, { x, y: y + 1.05, w: 1.9, h: 0.4, fontSize: 11, color: '55558A', align: 'center' });
  });
  footer(sm);

  // one slide per finding, grouped by section
  for (const section of [...new Set(i.questionSnapshot.map(q => q.section))]) {
    const items = fails.filter(q => q.section === section);
    if (!items.length) continue;
    const d = pptx.addSlide(); d.background = { color: NAVY };
    T(d, section, { x: 1, y: 2.0, w: 8.5, h: 0.9, fontSize: 34, bold: true, color: 'FFFFFF' });
    T(d, `${items.length} ملاحظات`, { x: 1, y: 2.9, w: 8.5, h: 0.5, fontSize: 16, color: CORN });
    footer(d, true);
    for (const q of items) {
      const a = i.answers[q.id];
      const sl = pptx.addSlide(); sl.background = { color: 'FFFFFF' };
      sl.addShape(pptx.ShapeType.ellipse, { x: 9.0, y: 0.35, w: 0.6, h: 0.6, fill: { color: NAVY } });
      T(sl, String(q.id), { x: 9.0, y: 0.35, w: 0.6, h: 0.6, fontSize: 14, bold: true, color: 'FFFFFF', align: 'center' });
      T(sl, q.title, { x: 3.0, y: 0.3, w: 5.9, h: 0.8, fontSize: 17, bold: true });
      T(sl, `${SEV_AR[q.severity]} · ${a?.value === 'fail' ? 'غير مطابق' : 'صُحح أثناء الزيارة'}${a?.recurring ? ' · متكرر' : ''}${a?.actual !== undefined ? ` · القراءة ${a.actual} ${q.measurement?.unit ?? ''}` : ''}`, { x: 3.0, y: 1.05, w: 5.9, h: 0.35, fontSize: 11, color: q.severity === 'Critical' ? 'B3261E' : 'B66F4A' });
      sl.addShape(pptx.ShapeType.roundRect, { x: 4.6, y: 1.55, w: 5.0, h: 1.65, fill: { color: MILK }, rectRadius: 0.08 });
      T(sl, `الملاحظة\n${a?.observation || '—'}`, { x: 4.7, y: 1.6, w: 4.8, h: 1.55, fontSize: 12, valign: 'top' });
      sl.addShape(pptx.ShapeType.roundRect, { x: 4.6, y: 3.35, w: 5.0, h: 1.65, fill: { color: 'EEF0FE' }, rectRadius: 0.08 });
      T(sl, `التوصية\n${a?.recommendation || '—'}`, { x: 4.7, y: 3.4, w: 4.8, h: 1.55, fontSize: 12, valign: 'top' });
      const imgs = (a?.attachments ?? []).filter(x => !x.type.startsWith('video/')).slice(0, 2);
      let y = 1.55;
      for (const img of imgs) { const data = await toDataUrl(img.data); if (data) { sl.addImage({ data, x: 0.4, y, w: 4.0, h: 1.65, sizing: { type: 'contain', w: 4.0, h: 1.65 } }); y += 1.8; } }
      if (!imgs.length) { sl.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 1.55, w: 4.0, h: 3.45, fill: { color: 'F6F5F2' }, line: { color: 'C9CCF4', dashType: 'dash' }, rectRadius: 0.08 }); T(sl, 'لا توجد صورة مرفقة', { x: 0.4, y: 3.0, w: 4.0, h: 0.4, fontSize: 11, color: '9A9AC4', align: 'center' }); }
      footer(sl);
    }
  }

  // action plan
  const ap = pptx.addSlide(); ap.background = { color: 'FFFFFF' };
  if (logoNavy) ap.addImage({ data: logoNavy, x: 0.4, y: 0.3, w: 1.6, h: 0.5 });
  T(ap, 'خطة الإجراءات التصحيحية', { x: 3.5, y: 0.3, w: 6.1, h: 0.6, fontSize: 22, bold: true });
  const head = ['الحالة', 'الاستحقاق', 'المسؤول', 'الإجراء المطلوب', 'الملاحظة', '#'].map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' as const, fontFace: font } }));
  const rows = actions.slice(0, 12).map(a => [a.status, a.dueDate, a.responsible || '—', a.recommendation || '—', a.description, String(a.questionId)].map(t => ({ text: t, options: { align: 'right' as const, fontFace: font } })));
  if (rows.length) ap.addTable([head, ...rows], { x: 0.4, y: 1.1, w: 9.2, colW: [1.1, 1.0, 1.3, 2.6, 2.7, 0.5], fontSize: 9, border: { type: 'solid', color: 'E4DED4', pt: 0.5 }, rtlMode: true } as never);
  else T(ap, 'لا توجد إجراءات مرتبطة بهذه الزيارة.', { x: 0.5, y: 1.5, w: 9, h: 0.5, fontSize: 14, color: '6B6B99' });
  footer(ap);

  // signatures
  if (i.signatures) {
    const sg = pptx.addSlide(); sg.background = { color: MILK };
    T(sg, 'التوقيعات', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 22, bold: true });
    const sig = [['توقيع المفتش', i.signatures.inspector?.name, i.signatures.inspector?.image, i.signatures.inspector?.at], ['توقيع مسؤول الفرع', i.signatures.branch?.name, i.signatures.branch?.image, i.signatures.branch?.at]] as const;
    sig.forEach(([label, name, image, at], k) => {
      const x = k === 0 ? 5.1 : 0.5;
      T(sg, label, { x, y: 1.2, w: 4.4, h: 0.4, fontSize: 13, color: '55558A' });
      if (image) sg.addImage({ data: image, x, y: 1.7, w: 4.4, h: 1.5, sizing: { type: 'contain', w: 4.4, h: 1.5 } });
      else if (k === 1 && i.signatures?.branch?.declinedReason) T(sg, `تعذّر التوقيع: ${i.signatures.branch.declinedReason}`, { x, y: 2.1, w: 4.4, h: 0.5, fontSize: 12, color: 'B3261E' });
      T(sg, `${name ?? ''}\n${at?.slice(0, 16).replace('T', ' ') ?? ''}`, { x, y: 3.3, w: 4.4, h: 0.7, fontSize: 12 });
    });
    footer(sg);
  }
  const blob = await pptx.write({ outputType: 'blob' }) as Blob;
  return { blob, name: `${fileBase(i)}.pptx` };
}

export type MailTemplate = { id: string; name: string; subject: string; body: string };
/* Placeholders: {branch} {code} {date} {number} {score} {class} {status} {inspector} {critical} */
export const MAIL_TEMPLATES: MailTemplate[] = [
  { id: 'standard', name: 'تقرير زيارة (عام)', subject: 'تقرير زيارة الجودة — {branch} — {date}', body: 'السلام عليكم،\n\nنرفق لكم نتائج زيارة الجودة لفرع {branch} {code} بتاريخ {date}.\n\nرقم الزيارة: {number}\nالنسبة الموزونة: {score}%\nالتصنيف: {class}\nالحالة: {status}\n\nنأمل الاطلاع على الملاحظات وتنفيذ الإجراءات التصحيحية في مواعيدها.\n\nمع التحية،\n{inspector}\nإدارة الجودة — ريشيو' },
  { id: 'excellent', name: 'شكر وتقدير (نتيجة ممتازة/جيدة)', subject: 'نتيجة زيارة الجودة — {branch} — {class}', body: 'السلام عليكم،\n\nيسعدنا إبلاغكم بنتيجة زيارة الجودة لفرع {branch} {code} بتاريخ {date}: {score}% ({class}).\n\nنشكر الفريق على جهوده ونأمل المحافظة على هذا المستوى. تجدون التقرير المرفق للاطلاع على التفاصيل.\n\nمع التحية،\n{inspector}\nإدارة الجودة — ريشيو' },
  { id: 'followup', name: 'مطلوب إجراءات تصحيحية', subject: 'مطلوب إجراءات تصحيحية — {branch} — {date}', body: 'السلام عليكم،\n\nنتيجة زيارة الجودة لفرع {branch} {code} بتاريخ {date}: {score}% ({class}).\n\nيوجد ملاحظات تتطلب إجراءً تصحيحياً (الحرجة خلال 24 ساعة، الرئيسية خلال 72 ساعة، البسيطة خلال 7 أيام). نرجو تأكيد خطة التصحيح ومسؤول التنفيذ، وسنجري زيارة متابعة.\n\nرقم الزيارة: {number}\n\nمع التحية،\n{inspector}\nإدارة الجودة — ريشيو' },
  { id: 'critical', name: 'عاجل: إخفاق حرج', subject: 'عاجل — إخفاق حرج في {branch} — {date}', body: 'السلام عليكم،\n\nسُجّل في زيارة الجودة لفرع {branch} {code} بتاريخ {date} عدد {critical} إخفاق حرج، ولذلك صُنّفت الزيارة «{class}».\n\nيلزم معالجة البنود الحرجة خلال 24 ساعة وإفادتنا بما تم. التقرير المرفق فيه التفاصيل والصور.\n\nرقم الزيارة: {number}\n\nمع التحية،\n{inspector}\nإدارة الجودة — ريشيو' },
];
export function suggestTemplate(i: Inspection): string {
  const s = calculateScore(i.questionSnapshot, i.answers);
  return s.criticalFailures > 0 ? 'critical' : s.classification === 'ممتاز' || s.classification === 'جيد' ? 'excellent' : s.classification ? 'followup' : 'standard';
}
export function renderTemplate(t: { subject: string; body: string }, i: Inspection) {
  const s = calculateScore(i.questionSnapshot, i.answers);
  const vars: Record<string, string> = { branch: i.branchName, code: i.branchCode ? `(${i.branchCode})` : '', date: i.date.slice(0, 10), number: i.number ?? '—', score: String(s.score ?? '—'), class: s.classification ?? '—', status: workflowLabel(i), inspector: i.inspector, critical: String(s.criticalFailures) };
  const fill = (x: string) => x.replace(/\{(\w+)\}/g, (m, k) => k in vars ? vars[k] : m).replace(/ {2,}/g, ' ');
  return { subject: fill(t.subject), body: fill(t.body) };
}
export function mailtoLink(i: Inspection, to: string[] = [], cc: string[] = [], msg?: { subject: string; body: string }) {
  const m = msg ?? renderTemplate(MAIL_TEMPLATES[0], i);
  const ccPart = cc.length ? `&cc=${encodeURIComponent(cc.join(','))}` : '';
  return `mailto:${encodeURIComponent(to.join(',')).replace(/%40/g, '@').replace(/%2C/g, ',')}?subject=${encodeURIComponent(m.subject)}${ccPart}&body=${encodeURIComponent(m.body)}`;
}

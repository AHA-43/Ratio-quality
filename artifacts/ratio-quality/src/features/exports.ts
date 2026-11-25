// Client-side report exports built from the same saved inspection record (the approved snapshot once approved).
import type { ActionItem, Inspection, Question } from '../data';
import { TASTING_SCORE_FIELDS } from '../checklist.ts';
import { calculateScore, WEIGHTS } from '../scoring.ts';
import { workflowLabel } from '../labels.ts';

const SEV_AR = { Critical: 'حرج', Major: 'رئيسي', Minor: 'ثانوي' } as const;
const NAVY = '07014F', MILK = 'F4F1EB', CORN = '7584F7';
const failed = (i: Inspection, q: Question) => { const a = i.answers[q.id]; return Boolean(a && (a.value === 'fail' || a.initialValue === 'fail')); };
const resultAr = (v: unknown) => v === 'pass' ? 'مطابق' : v === 'fail' ? 'غير مطابق' : v === 'na' ? 'لا ينطبق' : 'بدون إجابة';
export const fileBase = (i: Inspection) => `${i.number ?? 'RQ'}_${(i.branchCode ?? 'BRANCH').replace(/[^A-Za-z0-9.]+/g, '-')}_${i.date.slice(0, 10)}`;

export async function toDataUrl(src: string): Promise<string | null> {
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
  const { buildVisitDeck } = await import('./visit-deck');
  const deck = await buildVisitDeck(i, actions, { logoWhite: await toDataUrl('/brand/logo-ar-white.png'), logoNavy: await toDataUrl('/brand/logo-ar-navy.png'), image: toDataUrl });
  const blob = await deck.write({ outputType: 'blob' }) as Blob;
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
  const fill = (x: string) => x.replace(/\{(\w+)\}/g, (m, k) => k in vars ? vars[k] : m).replace(/ {2,}/g, ' ').replace(/(\d+(?:\.\d+)?)%/g, '\u2066$1%\u2069');
  return { subject: fill(t.subject), body: fill(t.body) };
}
export function mailtoLink(i: Inspection, to: string[] = [], cc: string[] = [], msg?: { subject: string; body: string }) {
  const m = msg ?? renderTemplate(MAIL_TEMPLATES[0], i);
  const ccPart = cc.length ? `&cc=${encodeURIComponent(cc.join(','))}` : '';
  return `mailto:${encodeURIComponent(to.join(',')).replace(/%40/g, '@').replace(/%2C/g, ',')}?subject=${encodeURIComponent(m.subject)}${ccPart}&body=${encodeURIComponent(m.body)}`;
}

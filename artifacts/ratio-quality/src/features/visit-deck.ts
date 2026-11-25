// Visit report as a modern, brand-led PowerPoint (editorial layout, native charts, one slide per finding).
import type { ActionItem, Inspection, Question } from '../data.ts';
import { calculateScore } from '../scoring.ts';
import { explainScore } from './text.ts';
import { bar, C, card, chip, chipRow, CLS, contentSlide, eyebrow, FONT, footer, H, mark, scoreColor, scoreRing, SEV, short, T, W, type Pptx, type Slide } from './deck-kit.ts';

type Assets = { logoWhite?: string | null; logoNavy?: string | null; image?: (src: string) => Promise<string | null> };
const failedAt = (i: Inspection, q: Question) => { const a = i.answers[q.id]; return Boolean(a && (a.value === 'fail' || a.initialValue === 'fail')); };
const rank = { Critical: 0, Major: 1, Minor: 2 } as const;
const statusTone: Record<string, [string, string]> = { 'مغلق': [C.green, C.greenSoft], 'بانتظار التحقق': [C.cornInk, C.cornSoft], 'قيد المعالجة': [C.amber, C.amberSoft], 'مُسند': [C.camel, C.camelSoft], 'مفتوح': [C.red, C.redSoft] };

export async function buildVisitDeck(i: Inspection, actions: ActionItem[], assets: Assets = {}) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const p: Pptx = new PptxGenJS(); p.layout = 'LAYOUT_16x9'; p.rtlMode = true;
  p.title = `تقرير زيارة الجودة — ${i.branchName}`; p.company = 'Ratio Specialty Coffee'; p.author = i.inspector;
  const s = calculateScore(i.questionSnapshot, i.answers);
  const cls = i.imported ? i.imported.classification ?? '' : s.criticalFailures ? 'غير مقبول' : s.classification ?? '';
  const tone = CLS[cls] ?? { color: C.cornInk, soft: C.cornSoft };
  const date = i.date.slice(0, 10);
  const foot = `ريشيو · تقرير زيارة الجودة · ${i.branchName} · ${date}${i.workflow === 'approved' ? '' : ' · نسخة غير معتمدة'}`;
  const findings = i.questionSnapshot.filter(q => failedAt(i, q)).sort((a, b) => rank[a.severity] - rank[b.severity] || a.id - b.id);
  const answered = i.questionSnapshot.filter(q => i.answers[q.id]?.value != null);
  const applicable = answered.filter(q => i.answers[q.id]?.value !== 'na');
  const passed = applicable.filter(q => i.answers[q.id]?.value === 'pass');
  const sections = [...new Set(i.questionSnapshot.map(q => q.section))].map(name => {
    const qs = i.questionSnapshot.filter(q => q.section === name); const r = calculateScore(qs, i.answers);
    return { name, score: r.score, fails: qs.filter(q => failedAt(i, q)).length, total: qs.length };
  });
  const img = assets.image ?? (async (x: string) => x.startsWith('data:') ? x : null);

  /* 1 ─ cover */
  const cv = p.addSlide(); cv.background = { color: C.navy };
  cv.addShape(p.ShapeType.ellipse, { x: -2.2, y: 1.4, w: 6.4, h: 6.4, fill: { color: C.navy2 }, line: { color: C.navy2, width: 0 } });
  mark(p, cv, -0.2, 1.75, 3.7, C.corn, 55);
  if (assets.logoWhite) cv.addImage({ data: assets.logoWhite, x: 7.35, y: 0.5, w: 2.05, h: 0.63 });
  eyebrow(cv, 'تقرير زيارة الجودة', 4.0, 1.55, 5.4);
  T(cv, i.branchName, { x: 3.6, y: 1.9, w: 5.8, h: 1.25, fontSize: i.branchName.length > 22 ? 32 : 40, bold: true, color: C.white, valign: 'middle', fit: 'shrink' });
  T(cv, [i.type, date, i.shift].filter(Boolean).join('  ·  '), { x: 3.6, y: 3.15, w: 5.8, h: 0.35, fontSize: 14, color: C.onNavy });
  T(cv, `المفتش: ${i.inspector}${i.branchCode ? `   ·   ${i.branchCode}` : ''}`, { x: 3.6, y: 3.5, w: 5.8, h: 0.3, fontSize: 11.5, color: C.faint });
  // score badge
  cv.addShape(p.ShapeType.roundRect, { x: 6.55, y: 4.0, w: 2.85, h: 0.95, fill: { color: C.white, transparency: 90 }, line: { color: C.white, width: 0.75, transparency: 70 }, rectRadius: 0.16 });
  T(cv, s.score === null ? '—' : `${s.score}%`, { x: 7.75, y: 4.06, w: 1.55, h: 0.6, fontSize: 28, bold: true, color: C.white, valign: 'middle' });
  T(cv, 'النتيجة', { x: 7.75, y: 4.6, w: 1.55, h: 0.25, fontSize: 9.5, color: C.onNavy });
  chip(p, cv, 7.65, 4.33, cls || '—', C.white, tone.color, 11);
  T(cv, `${i.number ?? ''}${i.workflow ? `   ·   ${i.workflow === 'approved' ? 'معتمد' : i.workflow === 'submitted' ? 'بانتظار الاعتماد' : 'أُعيد للتصحيح'}` : ''}`, { x: 3.6, y: 5.05, w: 5.8, h: 0.25, fontSize: 9, color: C.faint });

  /* 2 ─ summary */
  const sm = contentSlide(p, 'الخلاصة', 'نتيجة الزيارة في لمحة', foot);
  card(p, sm, 0.6, 1.4, 3.6, 3.55);
  scoreRing(p, sm, 1.12, 1.5, 2.55, s.score, tone.color, 'النسبة الموزونة');
  { const w = Math.max(0.6, (cls || '—').length * 11.5 * 0.0105 + 0.34); chip(p, sm, 2.4 + w / 2, 4.12, cls || '—', C.white, tone.color, 11.5); }
  if (i.previous?.score != null && s.score != null) { const d = +(s.score - i.previous.score).toFixed(1); T(sm, `${d >= 0 ? '▲ +' : '▼ '}${d} عن الزيارة السابقة`, { x: 0.6, y: 4.55, w: 3.6, h: 0.22, fontSize: 9.5, color: d >= 0 ? C.green : C.red, align: 'center' }); }
  const kpis: [string, string, string, number][] = [
    ['بنود مقيّمة', String(applicable.length), C.navy, 100],
    ['مطابقة', String(passed.length), C.green, applicable.length ? passed.length / applicable.length * 100 : 0],
    ['ملاحظات', String(findings.length), C.camel, applicable.length ? findings.length / applicable.length * 100 : 0],
    ['حرجة', String(findings.filter(q => q.severity === 'Critical').length), C.red, findings.length ? findings.filter(q => q.severity === 'Critical').length / findings.length * 100 : 0],
  ];
  kpis.forEach(([label, val, col, pct], k) => { const x = 7.25 - (k % 2) * 2.65, y = 1.4 + Math.floor(k / 2) * 1.2;
    card(p, sm, x, y, 2.5, 1.05); T(sm, val, { x: x + 0.2, y: y + 0.12, w: 2.1, h: 0.5, fontSize: 26, bold: true, color: col }); T(sm, label, { x: x + 0.2, y: y + 0.6, w: 2.1, h: 0.22, fontSize: 10, color: C.muted }); bar(p, sm, x + 0.2, y + 0.86, 2.1, 0.06, pct, col); });
  card(p, sm, 4.6, 3.85, 5.15, 1.1, C.cornSoft, { shadow: false });
  T(sm, explainScore(s.score, s.classification, s.criticalFailures), { x: 4.8, y: 3.95, w: 4.75, h: 0.92, fontSize: 11, color: C.navy, valign: 'middle', lineSpacingMultiple: 1.15, fit: 'shrink' });

  /* 3 ─ sections */
  const sc = contentSlide(p, 'الأداء حسب القسم', 'أين كان الفرع قوياً وأين يحتاج انتباهاً', foot);
  sections.forEach((x, k) => { const y = 1.45 + k * 0.85; card(p, sc, 0.6, y, 8.8, 0.7);
    T(sc, x.name, { x: 6.2, y: y + 0.12, w: 3.0, h: 0.28, fontSize: 13, bold: true, color: C.navy });
    T(sc, `${x.total} بنداً${x.fails ? ` · ${x.fails} ملاحظة` : ' · بدون ملاحظات'}`, { x: 6.2, y: y + 0.4, w: 3.0, h: 0.22, fontSize: 9.5, color: x.fails ? C.camel : C.green });
    bar(p, sc, 1.75, y + 0.29, 4.25, 0.13, x.score ?? 0, scoreColor(x.score));
    T(sc, x.score === null ? '—' : `${Math.round(x.score)}%`, { x: 0.75, y: y + 0.17, w: 0.9, h: 0.36, fontSize: 16, bold: true, color: scoreColor(x.score), align: 'left', valign: 'middle' }); });
  const ranked = sections.filter(x => x.score !== null).sort((a, b) => b.score! - a.score!);
  if (ranked.length > 1) T(sc, `الأقوى: ${ranked[0].name}   ·   الأحوج للمتابعة: ${ranked[ranked.length - 1].name}`, { x: 0.6, y: 1.45 + sections.length * 0.85 + 0.05, w: 8.8, h: 0.25, fontSize: 10, color: C.muted });

  /* 4 ─ findings overview */
  if (!findings.length) {
    const ok = p.addSlide(); ok.background = { color: C.navy }; mark(p, ok, 0.7, 1.1, 3.2, C.corn, 40);
    eyebrow(ok, 'الملاحظات', 4.2, 1.7, 5.2); T(ok, 'لا توجد ملاحظات في هذه الزيارة', { x: 4.2, y: 2.05, w: 5.2, h: 1.1, fontSize: 30, bold: true, color: C.white });
    T(ok, 'جميع البنود المنطبقة مطابقة للمعيار. شكراً للفريق على الالتزام.', { x: 4.2, y: 3.2, w: 5.2, h: 0.6, fontSize: 13, color: C.onNavy }); footer(p, ok, foot, true);
  } else {
    const per = 10;
    for (let start = 0; start < findings.length; start += per) {
      const ov = contentSlide(p, 'الملاحظات', start ? 'الملاحظات (تابع)' : `${findings.length} ملاحظة تحتاج إلى معالجة`, foot);
      if (!start) { let r = 9.4; for (const sev of ['Critical', 'Major', 'Minor'] as const) { const n = findings.filter(q => q.severity === sev).length; if (n) r = chip(p, ov, r, 1.22, `${SEV[sev].ar} ${n}`, SEV[sev].color, SEV[sev].soft, 9.5); } }
      findings.slice(start, start + per).forEach((q, k) => { const col = k % 2, row = Math.floor(k / 2); const x = col === 0 ? 5.05 : 0.6, y = 1.65 + row * 0.66;
        card(p, ov, x, y, 4.35, 0.56);
        ov.addShape(p.ShapeType.rect, { x: x + 4.27, y: y + 0.1, w: 0.06, h: 0.36, fill: { color: SEV[q.severity].color }, line: { color: SEV[q.severity].color, width: 0 } });
        T(ov, String(q.legacy ? q.id - 1000 : q.id).padStart(2, '0'), { x: x + 3.6, y: y + 0.1, w: 0.55, h: 0.36, fontSize: 13, bold: true, color: SEV[q.severity].color, valign: 'middle', align: 'center' });
        T(ov, short(q.title, 46), { x: x + 0.15, y: y + 0.07, w: 3.45, h: 0.27, fontSize: 10.5, bold: true, color: C.navy });
        T(ov, `${SEV[q.severity].ar} · ${SEV[q.severity].due}${i.answers[q.id]?.recurring ? ' · متكرر' : ''}`, { x: x + 0.15, y: y + 0.32, w: 3.45, h: 0.2, fontSize: 8.5, color: C.muted }); });
    }
  }

  /* 5 ─ one slide per finding */
  let n = 0;
  for (const q of findings) {
    n++; const a = i.answers[q.id]; const sev = SEV[q.severity];
    const f: Slide = p.addSlide(); f.background = { color: C.bg };
    f.addShape(p.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.09, fill: { color: sev.color }, line: { color: sev.color, width: 0 } });
    // photo panel (left)
    const pics = (a?.attachments ?? []).filter(x => !x.type.startsWith('video/')).slice(0, 2);
    const data: string[] = []; for (const pic of pics) { const d = await img(pic.data); if (d) data.push(d); }
    if (data.length) {
      const ph = data.length === 1 ? 4.35 : 2.12;
      data.forEach((d, k) => { const y = 0.6 + k * (ph + 0.11); card(p, f, 0.5, y, 4.3, ph, C.white); f.addImage({ data: d, x: 0.56, y: y + 0.06, w: 4.18, h: ph - 0.12, sizing: { type: 'cover', w: 4.18, h: ph - 0.12 } }); });
      const cap = pics[0]?.caption; if (cap) T(f, cap, { x: 0.5, y: 5.0, w: 4.3, h: 0.2, fontSize: 8.5, color: C.muted, align: 'center' });
    } else { card(p, f, 0.5, 0.6, 4.3, 4.35, C.white); mark(p, f, 1.9, 1.75, 1.5, C.milk, 0); T(f, 'لا توجد صورة مرفقة', { x: 0.5, y: 3.55, w: 4.3, h: 0.3, fontSize: 11, color: C.muted, align: 'center' }); }
    // text panel (right)
    f.addShape(p.ShapeType.ellipse, { x: 8.75, y: 0.55, w: 0.65, h: 0.65, fill: { color: sev.color }, line: { color: sev.color, width: 0 } });
    T(f, String(q.legacy ? q.id - 1000 : q.id), { x: 8.75, y: 0.55, w: 0.65, h: 0.65, fontSize: 15, bold: true, color: C.white, align: 'center', valign: 'middle' });
    eyebrow(f, `الملاحظة ${n} من ${findings.length}  ·  ${q.section}`, 5.1, 0.63, 3.55, C.muted);
    T(f, q.title, { x: 5.1, y: 0.9, w: 3.55, h: 0.9, fontSize: q.title.length > 45 ? 15 : 18, bold: true, color: C.navy, fit: 'shrink' });
    const chips: [string, string, string][] = [[sev.ar, sev.color, sev.soft], [sev.due, C.navy, 'ECE9F7']];
    if (a?.recurring) chips.push(['متكرر', C.red, C.redSoft]);
    if (a?.correctedDuringVisit || (a?.initialValue === 'fail' && a?.value === 'pass')) chips.push(['صُحح أثناء الزيارة', C.green, C.greenSoft]);
    if (a?.actual !== undefined) chips.push([`القراءة ${a.actual} ${q.measurement?.unit ?? ''}`.trim(), C.cornInk, C.cornSoft]);
    const top = chipRow(p, f, 9.4, 1.88, 5.1, chips) + 0.17; const room = 4.95 - top; const h1 = room * 0.5 - 0.06;
    card(p, f, 5.1, top, 4.3, h1); eyebrow(f, 'ما لاحظناه', 5.3, top + 0.12, 3.9, C.camel);
    T(f, a?.observation || '—', { x: 5.3, y: top + 0.4, w: 3.9, h: h1 - 0.48, fontSize: 11.5, color: C.ink, fit: 'shrink', lineSpacingMultiple: 1.1 });
    const y2 = top + h1 + 0.12; card(p, f, 5.1, y2, 4.3, 4.95 - y2, C.cornSoft, { shadow: false }); eyebrow(f, 'التوصية', 5.3, y2 + 0.12, 3.9, C.cornInk);
    T(f, a?.recommendation || 'معالجة الملاحظة والتحقق منها في الزيارة القادمة.', { x: 5.3, y: y2 + 0.4, w: 3.9, h: 4.95 - y2 - 0.48, fontSize: 11.5, color: C.navy, fit: 'shrink', lineSpacingMultiple: 1.1 });
    footer(p, f, foot);
  }

  /* 6 ─ strengths */
  const strong = sections.filter(x => x.fails === 0 && x.score !== null);
  const st = contentSlide(p, 'نقاط القوة', 'ما يميّز الفرع في هذه الزيارة', foot);
  card(p, st, 6.0, 1.45, 3.4, 3.45, C.navy, { shadow: false });
  T(st, `${passed.length}`, { x: 6.2, y: 1.75, w: 3.0, h: 0.9, fontSize: 52, bold: true, color: C.white });
  T(st, `بنداً مطابقاً من أصل ${applicable.length}`, { x: 6.2, y: 2.7, w: 3.0, h: 0.35, fontSize: 13, color: C.onNavy });
  const critPassed = applicable.filter(q => q.severity === 'Critical' && i.answers[q.id]?.value === 'pass' && !failedAt(i, q)).length, critAll = applicable.filter(q => q.severity === 'Critical').length;
  T(st, `${critPassed} من ${critAll} بنود حرجة مطابقة`, { x: 6.2, y: 3.3, w: 3.0, h: 0.3, fontSize: 11.5, color: C.white });
  bar(p, st, 6.2, 3.7, 3.0, 0.1, critAll ? critPassed / critAll * 100 : 0, C.corn, '2A2470');
  if (strong.length) strong.slice(0, 4).forEach((x, k) => { const y = 1.45 + k * 0.85; card(p, st, 0.6, y, 5.1, 0.7);
    st.addShape(p.ShapeType.ellipse, { x: 5.05, y: y + 0.17, w: 0.36, h: 0.36, fill: { color: C.greenSoft }, line: { color: C.greenSoft, width: 0 } });
    T(st, '✓', { x: 5.05, y: y + 0.17, w: 0.36, h: 0.36, fontSize: 13, bold: true, color: C.green, align: 'center', valign: 'middle' });
    T(st, x.name, { x: 0.8, y: y + 0.13, w: 4.1, h: 0.28, fontSize: 13, bold: true, color: C.navy }); T(st, `${x.total} بنداً · التزام كامل`, { x: 0.8, y: y + 0.4, w: 4.1, h: 0.2, fontSize: 9.5, color: C.green }); });
  else { T(st, 'الأقسام الأعلى التزاماً', { x: 0.6, y: 1.45, w: 5.1, h: 0.3, fontSize: 12, bold: true, color: C.muted });
    ranked.slice(0, 3).forEach((x, k) => { const y = 1.85 + k * 0.85; card(p, st, 0.6, y, 5.1, 0.7);
      T(st, x.name, { x: 2.4, y: y + 0.13, w: 3.1, h: 0.28, fontSize: 13, bold: true, color: C.navy }); T(st, `${x.total} بنداً · ${x.fails} ملاحظة`, { x: 2.4, y: y + 0.4, w: 3.1, h: 0.2, fontSize: 9.5, color: C.muted });
      T(st, `${Math.round(x.score!)}%`, { x: 0.75, y: y + 0.16, w: 1.5, h: 0.38, fontSize: 18, bold: true, color: scoreColor(x.score), align: 'left', valign: 'middle' }); }); }

  /* 7 ─ action plan (cards, paginated) */
  const acts = actions.length ? actions : findings.map(q => ({ id: String(q.id), title: q.title, description: i.answers[q.id]?.observation ?? '', recommendation: i.answers[q.id]?.recommendation, responsible: '', dueDate: '', status: 'مفتوح', severity: q.severity, questionId: q.id } as unknown as ActionItem));
  for (let start = 0; start < Math.max(1, acts.length); start += 5) {
    const ap = contentSlide(p, 'خطة العمل', start ? 'الإجراءات التصحيحية (تابع)' : 'الإجراءات التصحيحية', foot);
    if (!acts.length) { T(ap, 'لا توجد إجراءات مطلوبة.', { x: 0.6, y: 1.6, w: 8.8, h: 0.4, fontSize: 14, color: C.muted }); break; }
    acts.slice(start, start + 5).forEach((a, k) => { const y = 1.4 + k * 0.72; const sv = SEV[(a.severity ?? 'Minor') as keyof typeof SEV] ?? SEV.Minor; const [tc, ts] = statusTone[a.status] ?? [C.muted, 'ECE9F7'];
      card(p, ap, 0.6, y, 8.8, 0.62);
      ap.addShape(p.ShapeType.rect, { x: 9.32, y: y + 0.12, w: 0.06, h: 0.38, fill: { color: sv.color }, line: { color: sv.color, width: 0 } });
      T(ap, short(a.recommendation || a.title || '', 58), { x: 3.45, y: y + 0.08, w: 5.7, h: 0.27, fontSize: 11, bold: true, color: C.navy });
      T(ap, short(`${a.questionId ? `بند ${a.questionId} · ` : ''}${a.description || ''}`, 76), { x: 3.45, y: y + 0.35, w: 5.7, h: 0.22, fontSize: 9, color: C.muted });
      T(ap, a.responsible || 'لم يُحدد المسؤول', { x: 2.15, y: y + 0.08, w: 1.2, h: 0.24, fontSize: 9.5, bold: true, color: a.responsible ? C.ink : C.faint });
      T(ap, a.dueDate ? `حتى ${a.dueDate}` : sv.due, { x: 2.15, y: y + 0.34, w: 1.2, h: 0.22, fontSize: 8.5, color: C.muted });
      chip(p, ap, 2.05, y + 0.16, a.status, tc, ts, 9); });
  }

  /* 8 ─ signatures & approval */
  const sg = contentSlide(p, 'الاعتماد', 'التوقيعات وحالة التقرير', foot);
  const sigs = [['المفتش', i.signatures?.inspector?.name ?? i.inspector, i.signatures?.inspector?.image, i.signatures?.inspector?.at, ''], ['مسؤول الفرع', i.signatures?.branch?.name ?? '—', i.signatures?.branch?.image, i.signatures?.branch?.at, i.signatures?.branch?.declinedReason ?? '']] as const;
  sigs.forEach(([role, name, image, at, declined], k) => { const x = k === 0 ? 5.05 : 0.6; card(p, sg, x, 1.4, 4.35, 2.45);
    eyebrow(sg, role, x + 0.2, 1.55, 3.95, C.muted);
    if (image) sg.addImage({ data: image, x: x + 0.6, y: 1.9, w: 3.15, h: 1.1, sizing: { type: 'contain', w: 3.15, h: 1.1 } });
    else T(sg, declined ? `تعذّر التوقيع: ${declined}` : 'بدون توقيع', { x: x + 0.2, y: 2.2, w: 3.95, h: 0.5, fontSize: 11, color: declined ? C.red : C.faint, align: 'center' });
    sg.addShape(p.ShapeType.line, { x: x + 0.4, y: 3.1, w: 3.55, h: 0, line: { color: C.line, width: 0.75 } });
    T(sg, name || '—', { x: x + 0.2, y: 3.2, w: 3.95, h: 0.3, fontSize: 13, bold: true, color: C.navy, align: 'center' });
    T(sg, at ? at.slice(0, 16).replace('T', ' ') : '', { x: x + 0.2, y: 3.5, w: 3.95, h: 0.22, fontSize: 9, color: C.muted, align: 'center' }); });
  card(p, sg, 0.6, 4.0, 8.8, 0.95, i.workflow === 'approved' ? C.greenSoft : C.amberSoft, { shadow: false });
  T(sg, i.workflow === 'approved' ? `تقرير معتمد${i.approvedBy ? ` من ${i.approvedBy.name}` : ''}${i.approvedAt ? ` · ${i.approvedAt.slice(0, 10)}` : ''}` : 'التقرير بانتظار الاعتماد', { x: 0.8, y: 4.1, w: 8.4, h: 0.32, fontSize: 13, bold: true, color: i.workflow === 'approved' ? C.green : C.amber });
  T(sg, `${i.number ? `رقم الزيارة ${i.number}` : ''}${i.snapshotHash ? `   ·   بصمة المحتوى ${i.snapshotHash.slice(0, 16)}…` : ''}`, { x: 0.8, y: 4.48, w: 8.4, h: 0.3, fontSize: 9.5, color: C.muted });

  /* 9 ─ closing */
  const cl = p.addSlide(); cl.background = { color: C.navy };
  mark(p, cl, 6.6, 1.2, 3.1, C.corn, 60);
  if (assets.logoWhite) cl.addImage({ data: assets.logoWhite, x: 0.6, y: 0.5, w: 1.75, h: 0.54 });
  eyebrow(cl, 'الخطوات التالية', 0.6, 1.5, 5.6);
  const next = [findings.some(q => q.severity === 'Critical') ? 'معالجة البنود الحرجة خلال 24 ساعة وإفادة إدارة الجودة.' : '', findings.length ? `تنفيذ ${findings.length} إجراء تصحيحي في مواعيدها حسب الخطورة.` : 'المحافظة على المستوى الحالي ومشاركة الممارسات الجيدة.', 'زيارة متابعة للتحقق من الإغلاق.'].filter(Boolean);
  T(cl, next.map((x, k) => `${k + 1}.  ${x}`).join('\n'), { x: 0.6, y: 1.85, w: 5.6, h: 2.0, fontSize: 15, color: C.white, lineSpacingMultiple: 1.45 });
  T(cl, `شكراً لفريق ${i.branchName}`, { x: 0.6, y: 4.2, w: 5.6, h: 0.45, fontSize: 18, bold: true, color: C.corn });
  footer(p, cl, 'إدارة الجودة — ريشيو للقهوة المختصة', true);
  void FONT; void H;
  return p;
}

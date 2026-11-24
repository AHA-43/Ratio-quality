// Fills the official reference deck ("تقرير فحص جودة القهوة والمعدات.pptx") with an inspection.
// Slides used from the template: cover, summary, section divider, finding (cloned per finding), action plan.
import JSZip from 'jszip';
import type { ActionItem, Inspection, Question } from '../data';
import { calculateScore } from '../scoring.ts';

const AR = (v: string | number) => String(v).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SECTION_EN: Record<string, string> = { 'المعدات والجاهزية': 'Equipment Inspection', 'جودة القهوة': 'Coffee Quality', 'تجربة المشروبات والتذوق': 'Beverage Tasting', 'أداء الباريستا': 'Barista Performance' };
const T = { cover: 'slide12.xml', summary: 'slide13.xml', divider: 'slide14.xml', finding: 'slide15.xml', plan: 'slide53.xml' };

/** Replace the n-th <a:t> text (document order) — the template's own text positions. */
function setTexts(xml: string, values: Record<number, string>) {
  let k = -1;
  return xml.replace(/<a:t>([^<]*)<\/a:t>/g, (m) => { k++; return k in values ? `<a:t>${esc(values[k])}</a:t>` : m; });
}
const textsOf = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]);
const idx = (xml: string, text: string, from = 0) => textsOf(xml).indexOf(text, from);

function fillPhoto(xml: string, rId: string) {
  const i = xml.indexOf('type="pic"'); if (i < 0) return xml;
  const s = xml.lastIndexOf('<p:sp>', i), e = xml.indexOf('</p:sp>', i) + 7;
  const sp = xml.slice(s, e);
  const xfrm = sp.match(/<a:xfrm>.*?<\/a:xfrm>/)?.[0] ?? '';
  const geom = sp.match(/<a:prstGeom.*?<\/a:prstGeom>/)?.[0] ?? '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  const pic = `<p:pic><p:nvPicPr><p:cNvPr id="90" name="Evidence"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr><p:ph type="pic" idx="100"/></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="${rId}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm}${geom}</p:spPr></p:pic>`;
  return xml.slice(0, s) + pic + xml.slice(e);
}
const b64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1);

export async function exportTemplatePptx(i: Inspection, actions: ActionItem[], templateBytes?: ArrayBuffer): Promise<{ blob: Blob; name: string }> {
  const bytes = templateBytes ?? await (await fetch('/templates/ratio-report-template.pptx')).arrayBuffer();
  const zip = await JSZip.loadAsync(bytes);
  const read = (p: string) => zip.file(p)!.async('string');
  const tpl = { cover: await read(`ppt/slides/${T.cover}`), summary: await read(`ppt/slides/${T.summary}`), divider: await read(`ppt/slides/${T.divider}`), finding: await read(`ppt/slides/${T.finding}`), plan: await read(`ppt/slides/${T.plan}`) };
  const rels = { cover: await read(`ppt/slides/_rels/${T.cover}.rels`), summary: await read(`ppt/slides/_rels/${T.summary}.rels`), divider: await read(`ppt/slides/_rels/${T.divider}.rels`), finding: await read(`ppt/slides/_rels/${T.finding}.rels`), plan: await read(`ppt/slides/_rels/${T.plan}.rels`) };
  const s = calculateScore(i.questionSnapshot, i.answers);
  const failed = (q: Question) => { const a = i.answers[q.id]; return Boolean(a && (a.value === 'fail' || a.initialValue === 'fail')); };
  const fails = i.questionSnapshot.filter(failed);
  const out: { xml: string; rels: string }[] = [];

  // cover
  const [city, district] = i.branchName.split(' - ');
  out.push({ xml: setTexts(tpl.cover, { 2: i.branchName, 3: `${district ? city : ''}${i.branchCode ? `  ·  ${i.branchCode}` : ''}${i.number ? `  ·  ${i.number}` : ''}`, 5: AR(i.date.slice(0, 10).split('-').reverse().join('/')), 7: i.inspector }), rels: rels.cover });

  // summary
  const st = textsOf(tpl.summary);
  const vals: Record<number, string> = {
    [st.indexOf('(اختياري)')]: s.classification ? `التصنيف: ${s.classification}${s.criticalFailures ? ' — بسبب إخفاق حرج' : ''}` : '',
    [st.indexOf('٨٢٪')]: s.score == null ? '—' : `${AR(s.score)}٪`,
    [st.indexOf('١٢')]: AR(fails.length),
    [st.indexOf('١')]: AR(fails.filter(q => q.severity === 'Critical').length),
    [st.indexOf('٤')]: AR(fails.filter(q => q.severity === 'Major').length), [st.indexOf('ملاحظات متوسطة')]: 'ملاحظات رئيسية',
    [st.indexOf('٧')]: AR(fails.filter(q => q.severity === 'Minor').length), [st.indexOf('ملاحظات بسيطة')]: 'ملاحظات ثانوية',
    [st.indexOf('٩')]: AR(fails.filter(q => i.answers[q.id]?.correctedDuringVisit).length),
    [st.indexOf('٣')]: AR(actions.filter(a => a.status !== 'مغلق').length),
  };
  // The template's middle chip is the highlighted one: it carries the actual classification.
  const cls = s.classification ?? '—';
  const others = ['ممتاز', 'جيد', 'يحتاج تحسين', 'غير مقبول'].filter(c => c !== cls);
  vals[st.indexOf('ممتاز')] = others[0]; vals[st.indexOf('جيد')] = cls; vals[st.indexOf('يحتاج تحسين')] = others[others.length - 1];
  out.push({ xml: setTexts(tpl.summary, vals), rels: rels.summary });

  // sections with findings: divider + one slide per finding (template numbering = official item number)
  const media: { path: string; data: string }[] = [];
  const sections = [...new Set(i.questionSnapshot.map(q => q.section))];
  sections.forEach((section, si) => {
    const items = fails.filter(q => q.section === section);
    if (!items.length) return;
    out.push({ xml: setTexts(tpl.divider, { 0: `القسم ${AR(si + 1)}`, 1: section, 2: `${SECTION_EN[section] ?? ''}  ·  ${AR(items.length)} ملاحظات` }), rels: rels.divider });
    for (const q of items) {
      const a = i.answers[q.id];
      const ft = textsOf(tpl.finding);
      const v: Record<number, string> = { 0: AR(q.id), 1: q.title,
        [ft.indexOf('[اكتب ما تم رصده في جملتين أو ثلاث كحد أقصى، مع أثره على العميل أو جودة المنتج]')]: `${a?.observation || '—'}${a?.actual !== undefined ? ` (القراءة: ${a.actual} ${q.measurement?.unit ?? ''})` : ''}${a?.recurring ? ' — ملاحظة متكررة' : ''}`,
        [ft.indexOf('[اكتب الإجراء المطلوب بوضوح وقابلاً للتنفيذ]')]: a?.recommendation || '—',
        [ft.indexOf('ريشيو | إدارة الجودة | جودة القهوة')]: `ريشيو | إدارة الجودة | ${section}`,
      };
      const mark = a?.value === 'fail' ? '✕ غير مطابق' : a?.value === 'pass' ? '✓ مطابق' : 'لا ينطبق';
      v[ft.indexOf(mark)] = `● ${mark}${a?.value === 'pass' ? ' (صُحح أثناء الزيارة)' : ''}`;
      let xml = setTexts(tpl.finding, v), r = rels.finding;
      const photo = (a?.attachments ?? []).find(x => x.type.startsWith('image/') && x.data?.startsWith('data:image/'));
      if (photo) {
        const path = `ppt/media/evidence-${media.length + 1}.jpeg`; media.push({ path, data: b64(photo.data) });
        r = r.replace('</Relationships>', `<Relationship Id="rIdEv" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${path.split('/').pop()}"/></Relationships>`);
        xml = fillPhoto(xml, 'rIdEv');
      }
      out.push({ xml, rels: r });
    }
  });

  // action plan (template table has 6 rows)
  let plan = tpl.plan;
  const pt = textsOf(plan); const first = pt.indexOf('مفتوحة');
  const rows = actions.slice(0, 6);
  const pv: Record<number, string> = {};
  rows.forEach((a, k) => { const b = first + k * 6; Object.assign(pv, { [b]: a.status, [b + 1]: a.dueDate ? AR(a.dueDate.split('-').reverse().join('/')) : '—', [b + 2]: a.responsible || '—', [b + 3]: a.recommendation || '—', [b + 4]: `#${AR(a.questionId)} ${a.description}`, [b + 5]: AR(k + 1) }); });
  const closed = actions.filter(a => a.status === 'مغلق').length;
  Object.assign(pv, { [first + 36]: AR(actions.length - closed), [first + 38]: AR(closed), [first + 40]: `${AR(actions.length ? Math.round(closed / actions.length * 100) : 0)}٪` });
  plan = setTexts(plan, pv);
  // drop unused table rows (header row is first <a:tr>)
  const trs = [...plan.matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)];
  for (let k = trs.length - 1; k > rows.length; k--) plan = plan.replace(trs[k][0], '');
  if (!rows.length && trs[1]) plan = plan.replace(trs[1][0], trs[1][0].replace(/<a:t>[^<]*<\/a:t>/g, '<a:t></a:t>').replace('<a:t></a:t>', '<a:t>لا توجد إجراءات</a:t>'));
  out.push({ xml: plan, rels: rels.plan });

  // rebuild the slide list
  const presRelsPath = 'ppt/_rels/presentation.xml.rels';
  let pres = await read('ppt/presentation.xml'), presRels = await read(presRelsPath), types = await read('[Content_Types].xml');
  const oldSlides = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  for (const p of oldSlides) { zip.remove(p); zip.remove(p.replace('slides/', 'slides/_rels/') + '.rels'); }
  presRels = presRels.replace(/<Relationship [^>]*relationships\/slide"[^>]*\/>/g, '');
  types = types.replace(/<Override PartName="\/ppt\/slides\/slide\d+\.xml"[^>]*\/>/g, '');
  if (!/Extension="jpeg"/.test(types)) types = types.replace('<Default Extension="png"', '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png"');
  let ids = '';
  out.forEach((sl, k) => {
    const n = k + 1;
    zip.file(`ppt/slides/slide${n}.xml`, sl.xml);
    zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, sl.rels);
    presRels = presRels.replace('</Relationships>', `<Relationship Id="rIdS${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/></Relationships>`);
    types = types.replace('</Types>', `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
    ids += `<p:sldId id="${300 + n}" r:id="rIdS${n}"/>`;
  });
  pres = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${ids}</p:sldIdLst>`);
  zip.file('ppt/presentation.xml', pres); zip.file(presRelsPath, presRels); zip.file('[Content_Types].xml', types);
  for (const m of media) zip.file(m.path, m.data, { base64: true });
  // app.xml slide count (cosmetic)
  const app = zip.file('docProps/app.xml'); if (app) zip.file('docProps/app.xml', (await app.async('string')).replace(/<Slides>\d+<\/Slides>/, `<Slides>${out.length}</Slides>`));

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' });
  const base = `${i.number ?? 'RQ'}_${(i.branchCode ?? i.branchName).replace(/[^\p{L}\p{N}.]+/gu, '-')}_${i.date.slice(0, 10)}`;
  return { blob, name: `${base}_قالب-ريشيو.pptx` };
}

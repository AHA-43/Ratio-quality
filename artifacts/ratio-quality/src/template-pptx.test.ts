import { strict as assert } from 'node:assert';
import test from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { QUESTIONS } from './checklist.ts';
import { exportTemplatePptx } from './features/template-pptx.ts';
import type { Answer, Inspection } from './data';

const tiny = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const answers: Record<number, Answer> = Object.fromEntries(QUESTIONS.map(q => [q.id, { value: [5, 20].includes(q.id) ? 'fail' : 'pass', observation: q.id === 5 ? 'عصا التبخير غير نظيفة' : q.id === 20 ? 'الجرعة 16 غ' : '', recommendation: q.id === 5 ? 'تنظيف بعد كل استخدام' : '', recurring: false, severity: q.severity, attachments: q.id === 5 ? [{ id: 'p1', name: 'p', type: 'image/jpeg', data: tiny, caption: '' }] : [] }]));
const i: Inspection = { id: 't', status: 'finalized', workflow: 'approved', number: 'RQ-2026-00007', branchId: 'HAS.01', branchCode: 'HAS.01', branchName: 'الاحساء - السلمانية', inspector: 'مفتش', date: '2026-11-23 10:00', type: '', shift: '', employees: 3, answers, questionSnapshot: QUESTIONS, createdAt: '', updatedAt: '' };

test('template deck: cover, summary, 2 dividers, 2 findings (with photo), action plan', async () => {
  const tpl = readFileSync(new URL('../public/templates/ratio-report-template.pptx', import.meta.url));
  const { blob, name } = await exportTemplatePptx(i, [{ id: 'a', title: '', description: 'عصا التبخير', branchName: '', questionId: 5, inspectionId: 't', responsible: 'مدير الفرع', dueDate: '2026-11-24', status: 'مفتوح', severity: 'Critical', recommendation: 'تنظيف' }], tpl.buffer.slice(tpl.byteOffset, tpl.byteOffset + tpl.byteLength));
  assert.match(name, /Ratio-template\.pptx$/);
  const buf = Buffer.from(await blob.arrayBuffer());
  if (process.env.DUMP) writeFileSync(process.env.DUMP, buf);
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  assert.equal(slides.length, 7);
  const s1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
  assert.ok(s1.includes('الاحساء - السلمانية') && s1.includes('مفتش'));
  const s2 = await zip.file('ppt/slides/slide2.xml')!.async('string');
  assert.ok(s2.includes('غير مقبول'));
  const f = await zip.file('ppt/slides/slide4.xml')!.async('string');
  assert.ok(f.includes('عصا التبخير غير نظيفة') && f.includes('r:embed="rIdEv"'));
  assert.ok(zip.file('ppt/media/evidence-1.jpeg'));
  const pres = await zip.file('ppt/presentation.xml')!.async('string');
  assert.equal((pres.match(/<p:sldId /g) ?? []).length, 7);
});

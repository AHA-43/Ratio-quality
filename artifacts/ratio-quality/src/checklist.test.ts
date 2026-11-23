import { strict as assert } from 'node:assert';
import test from 'node:test';
import { QUESTIONS } from './checklist.ts';
import { calculateScore } from './scoring.ts';
import type { Answer, Question } from './data';

const a = (value: Answer['value'], severity: Answer['severity'] = 'Minor'): Answer => ({ value, observation: '', recommendation: '', recurring: false, severity, attachments: [] });

test('official checklist structure (46 items, 15/11/10/10)', () => {
  assert.equal(QUESTIONS.length, 46);
  const counts = QUESTIONS.reduce<Record<string, number>>((m, q) => ({ ...m, [q.section]: (m[q.section] ?? 0) + 1 }), {});
  assert.deepEqual(Object.values(counts), [15, 11, 10, 10]);
  assert.deepEqual(QUESTIONS.map(q => q.id), Array.from({ length: 46 }, (_, i) => i + 1));
});

test('severities match the official PDF', () => {
  const critical = QUESTIONS.filter(q => q.severity === 'Critical').map(q => q.id);
  const minor = QUESTIONS.filter(q => q.severity === 'Minor').map(q => q.id);
  assert.deepEqual(critical, [5, 11, 16, 36]);
  assert.deepEqual(minor, [8, 14, 15, 24, 26, 34, 35, 38, 40, 46]);
  assert.equal(QUESTIONS.reduce((s, q) => s + ({ Critical: 10, Major: 5, Minor: 1 })[q.severity], 0), 210);
});

test('only standards printed in the PDF are pre-filled', () => {
  const withRange = QUESTIONS.filter(q => q.measurement?.min !== undefined).map(q => q.id);
  assert.deepEqual(withRange, [11, 12]);
});

test('classification uses the unrounded score (188/209 = 89.95% is not Excellent)', () => {
  const qs: Question[] = [];
  const answers: Record<number, Answer> = {};
  // 188 weight compliant out of 209 applicable using Minor(1) items
  for (let i = 1; i <= 209; i++) { qs.push({ id: i, section: 's', title: 't', severity: 'Minor', criterion: '' }); answers[i] = a(i <= 188 ? 'pass' : 'fail'); }
  const r = calculateScore(qs, answers);
  assert.equal(r.score, 90);
  assert.equal(r.classification, 'جيد');
});

test('exact boundaries 90 / 80 / 70', () => {
  const mk = (pass: number, total: number) => {
    const qs: Question[] = []; const ans: Record<number, Answer> = {};
    for (let i = 1; i <= total; i++) { qs.push({ id: i, section: 's', title: 't', severity: 'Minor', criterion: '' }); ans[i] = a(i <= pass ? 'pass' : 'fail'); }
    return calculateScore(qs, ans).classification;
  };
  assert.equal(mk(90, 100), 'ممتاز');
  assert.equal(mk(80, 100), 'جيد');
  assert.equal(mk(70, 100), 'يحتاج تحسين');
  assert.equal(mk(69, 100), 'غير مقبول');
});

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { calculateScore } from './scoring.ts';
import type { Answer, Question } from './data';

const questions: Question[] = [
  { id: 1, section: 'الاختبار', title: 'حرج', severity: 'Critical', criterion: '—' },
  { id: 2, section: 'الاختبار', title: 'رئيسي', severity: 'Major', criterion: '—' },
  { id: 3, section: 'الاختبار', title: 'بسيط', severity: 'Minor', criterion: '—' },
];
const answer = (value: Answer['value'], severity: Answer['severity'] = 'Minor'): Answer => ({ value, observation: '', recommendation: '', recurring: false, severity, attachments: [] });

export function runScoringUnitTests() {
  const empty = calculateScore(questions, { 1: answer('pass'), 2: answer('pass') });
  assert.equal(empty.score, null, 'required unanswered question prevents final score');
  const excluded = calculateScore(questions, { 1: answer('pass'), 2: answer('na'), 3: answer('pass') });
  assert.equal(excluded.score, 100, 'N/A is excluded from denominator');
  const critical = calculateScore(questions, { 1: answer('fail','Critical'), 2: answer('pass'), 3: answer('pass') });
  assert.equal(critical.score, 37.5, 'weighted score remains independently visible');
  assert.equal(critical.classification, 'غير مقبول', 'critical failure overrides classification');
  const corrected = answer('pass','Critical');
  corrected.initialValue = 'fail';
  const preserved = calculateScore(questions, { 1: corrected, 2: answer('pass'), 3: answer('pass') });
  assert.equal(preserved.score, 37.5, 'initial failure remains in the score after correction');
  assert.equal(preserved.criticalFailures, 1);
  const good = calculateScore(questions, { 1: answer('pass'), 2: answer('fail','Major'), 3: answer('pass') });
  assert.equal(good.score, 68.8);
}
test('weighted inspection scoring rules', runScoringUnitTests);

test('imported free-form findings (legacy questions) never produce a weighted score', () => {
  const q = [{ id: 1001, section: 'ملاحظات', title: 'x', severity: 'Critical', criterion: '', legacy: true }] as never;
  const r = calculateScore(q, { 1001: { value: 'fail', initialValue: 'fail', observation: '', recommendation: '', recurring: false, severity: 'Critical', attachments: [] } } as never);
  assert.equal(r.score, null); assert.equal(r.criticalFailures, 0);
});

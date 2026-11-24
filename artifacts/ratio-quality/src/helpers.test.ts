import { strict as assert } from 'node:assert';
import test from 'node:test';
import { explainScore, nameKey, overdueDays } from './features/text.ts';

test('nameKey treats hamza/ta marbuta/spacing variants as the same branch name', () => {
  assert.equal(nameKey('الأحساء  - السلمانية'), nameKey('الاحساء - السلمانيه'));
  assert.notEqual(nameKey('الاحساء - الفتح'), nameKey('الاحساء - الخليج'));
});
test('explainScore: critical failure overrides the number, incomplete has no result', () => {
  assert.match(explainScore(95, 'غير مقبول', 1), /غير مقبولة/);
  assert.match(explainScore(null, null, 0), /لم تكتمل/);
  assert.match(explainScore(92, 'ممتاز', 0), /ممتاز/);
});
test('overdueDays counts whole days and never goes negative', () => {
  assert.equal(overdueDays('2026-11-20', new Date('2026-11-24T10:00:00Z')), 4);
  assert.equal(overdueDays('2026-12-01', new Date('2026-11-24T10:00:00Z')), 0);
});

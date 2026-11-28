import { strict as assert } from 'node:assert';
import test from 'node:test';
import { bulkPassIds, needsDetail } from './features/quick-logic.ts';

const q = (id: number, extra: object = {}) => ({ id, title: `b${id}`, section: 's', severity: 'Major', criterion: '', ...extra }) as never;
test('"all conform" fills only unanswered items that do not need a reading', () => {
  const qs = [q(1), q(2), q(3, { measurement: { unit: '°C' } }), q(4, { inputType: 'rating' }), q(5, { inputType: 'status' })];
  const answers = { 1: { value: 'fail' }, 2: { value: null } } as never;
  assert.deepEqual(bulkPassIds(qs, answers), [2, 5]);
  assert.equal(needsDetail(qs[2]), true); assert.equal(needsDetail(qs[4]), false);
});

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { diffFindings } from './features/compare-logic.ts';

const visit = (fails: [number, string][], all: [number, string][]) => ({ questionSnapshot: all.map(([id, title]) => ({ id, title })), answers: Object.fromEntries(all.map(([id]) => [id, { value: fails.some(f => f[0] === id) ? 'fail' : 'pass' }])) }) as never;
test('findings are split into shared, only-first and only-second', () => {
  const all: [number, string][] = [[1, 'أ'], [2, 'ب'], [3, 'ج'], [1001, 'علبة منتهية']];
  const a = visit([[1, ''], [2, ''], [1001, '']], all), b = visit([[2, ''], [3, '']], all);
  const d = diffFindings(a, b);
  assert.deepEqual(d.both, ['ب']); assert.deepEqual(d.onlyA.sort(), ['أ', 'علبة منتهية'].sort()); assert.deepEqual(d.onlyB, ['ج']);
});

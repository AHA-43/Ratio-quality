import { strict as assert } from 'node:assert';
import test from 'node:test';
import { greetingFor } from './features/greeting.ts';

test('greeting always carries the name, varies, and uses nicknames', () => {
  const seen = new Set<string>();
  for (let k = 0; k < 200; k++) { const g = greetingFor('سارة أحمد', new Date('2026-11-26T09:00:00')); assert.match(g, /سارة/); seen.add(g); }
  assert.ok(seen.size >= 5, `only ${seen.size} variants`);
  const nicks = new Set<string>();
  for (let k = 0; k < 300; k++) { const g = greetingFor('راكان البحر', new Date('2026-11-26T20:00:00')); for (const n of ['بوسعيد', 'شيخ البحر', 'راكان']) if (g.includes(n)) nicks.add(n); }
  assert.deepEqual([...nicks].sort(), ['بوسعيد', 'راكان', 'شيخ البحر'].sort());
  assert.equal(greetingFor(undefined, new Date('2026-11-26T09:00:00')), 'صباح الخير');
});

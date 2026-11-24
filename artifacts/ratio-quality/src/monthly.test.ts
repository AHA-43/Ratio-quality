import { strict as assert } from 'node:assert';
import test from 'node:test';
import { buildMonthlyDeck, monthLabel, recommendations } from './features/monthly-report.ts';
import { executiveSummary, focusInsights, monthRange } from './features/insights.ts';

const q = (id: number, severity: 'Critical' | 'Major' | 'Minor') => ({ id, title: `بند ${id}`, section: id < 3 ? 'المعدات والجاهزية' : 'جودة القهوة', severity }) as never;
const ans = (v: 'pass' | 'fail') => ({ value: v, observation: '', recommendation: '', recurring: false, severity: 'Major', attachments: [] }) as never;
const insp = (id: string, b: string, date: string, fails: number[]) => ({ id, branchId: b, branchName: `فرع ${b}`, status: 'finalized', date, questionSnapshot: [q(1, 'Critical'), q(2, 'Major'), q(3, 'Minor'), q(4, 'Major')], answers: Object.fromEntries([1, 2, 3, 4].map(n => [n, ans(fails.includes(n) ? 'fail' : 'pass')])) }) as never;
const br = (id: string) => ({ id, name: `فرع ${id}`, city: '', manager: '', archived: false, demo: false }) as never;
const data = { inspections: [insp('1', 'A', '2026-10-05 10:00', [2]), insp('2', 'B', '2026-11-03 10:00', [1, 2]), insp('3', 'A', '2026-11-10 10:00', []), insp('4', 'C', '2026-11-12 10:00', [3, 4])], branches: [br('A'), br('B'), br('C'), br('D')], actions: [] };

test('monthly range is the calendar month and the previous one', () => {
  const r = monthRange('2026-11'); assert.equal(new Date(r.from).toISOString().slice(0, 10), '2026-11-01'); assert.equal(new Date(r.prevFrom).toISOString().slice(0, 10), '2026-10-01');
  const s = executiveSummary(data, 31, r.to - 1, r); assert.equal(s.visits, 3); assert.equal(s.branchesVisited, 3); assert.ok(s.delta !== null);
});
test('recommendations react to critical failures and weak branches', () => {
  const r = monthRange('2026-11'); const s = executiveSummary(data, 31, r.to - 1, r); const f = focusInsights(data, r.to - 1, 31);
  const rec = recommendations(s, f); assert.ok(rec.some(x => x.includes('حرج'))); assert.ok(rec.length >= 2);
  assert.match(monthLabel('2026-11'), /2026|٢٠٢٦/);
});
test('monthly deck builds with 8 slides and charts', async () => {
  const deck = await buildMonthlyDeck(data, '2026-11');
  const buf = await deck.write({ outputType: 'nodebuffer' }) as Uint8Array;
  assert.ok(buf.length > 20000, `deck is ${buf.length} bytes`);
  assert.equal((deck as unknown as { slides: unknown[] }).slides.length, 8);
  const { writeFileSync } = await import('node:fs'); writeFileSync(process.env.MONTHLY_OUT ?? '/dev/null', buf);
});

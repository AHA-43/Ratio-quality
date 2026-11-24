import { strict as assert } from 'node:assert';
import test from 'node:test';
import { focusInsights, planWeek, branchPriority, workDays, type Geo } from './features/insights.ts';

const DAY = 86400000;
const NOW = Date.parse('2026-11-24T08:00:00Z');
const q = (id: number, severity: 'Critical' | 'Major' | 'Minor' = 'Major') => ({ id, title: `بند ${id}`, section: 'قسم', severity }) as never;
const ans = (value: 'pass' | 'fail') => ({ value, observation: '', recommendation: '', recurring: false, severity: 'Major', attachments: [] }) as never;
const insp = (id: string, branchId: string, daysAgo: number, fails: number[]) => ({
  id, branchId, branchName: branchId, status: 'finalized', date: new Date(NOW - daysAgo * DAY).toISOString().slice(0, 16).replace('T', ' '),
  questionSnapshot: [q(1), q(2), q(3)], answers: { 1: ans(fails.includes(1) ? 'fail' : 'pass'), 2: ans(fails.includes(2) ? 'fail' : 'pass'), 3: ans(fails.includes(3) ? 'fail' : 'pass') },
}) as never;
const br = (id: string) => ({ id, name: id, city: '', manager: '', archived: false, demo: false }) as never;
const geo: Geo = { pos: b => ({ lat: b.id === 'A' ? 0 : b.id === 'B' ? 0.1 : 5, lng: 0 }), city: n => n, dist: (a, b) => Math.abs(a.lat - b.lat) * 111 };

test('focus: most-failing question ranks first and practice visits are ignored', () => {
  const f = focusInsights({ inspections: [insp('1', 'A', 5, [2]), insp('2', 'B', 6, [2, 3]), { ...insp('3', 'A', 1, [1]), training: true } as never], branches: [br('A'), br('B')], actions: [] }, NOW);
  assert.equal(f.top[0].q.id, 2); assert.equal(f.top[0].fails, 2); assert.equal(f.top.some(t => t.q.id === 1), false);
});
test('focus: stale and never-visited branches are reported, improving/declining detected', () => {
  const f = focusInsights({ inspections: [insp('1', 'A', 60, [1, 2, 3]), insp('2', 'A', 10, []), insp('3', 'B', 80, [])], branches: [br('A'), br('B'), br('C')], actions: [] }, NOW);
  assert.equal(f.never, 1); assert.equal(f.stale[0].branch.id, 'B'); assert.equal(f.improving[0].branch.id, 'A');
});
test('priority: never visited and critical actions raise priority; just visited lowers it', () => {
  const none = branchPriority(br('C'), { inspections: [], actions: [] }, NOW);
  const recent = branchPriority(br('A'), { inspections: [insp('1', 'A', 3, [])], actions: [] }, NOW);
  assert.ok(none.priority > recent.priority); assert.ok(none.reasons.includes('لم يُزر من قبل'));
  const withCrit = branchPriority(br('A'), { inspections: [insp('1', 'A', 40, [])], actions: [{ id: 'x', branchId: 'A', branchName: 'A', status: 'مفتوح', severity: 'Critical', dueDate: '2026-11-01' } as never] }, NOW);
  assert.ok(withCrit.reasons.some(r => r.includes('حرج')) && withCrit.reasons.some(r => r.includes('متأخر')));
});
test('plan: skips Friday/Saturday and groups the nearest branches on the same day', () => {
  const days = workDays(new Date('2026-11-26T00:00:00'), 3); // Thursday
  assert.deepEqual(days.map(d => d.getDay()), [4, 0, 1]);
  const plan = planWeek({ inspections: [], branches: [br('A'), br('B'), br('C'), br('D')], actions: [] }, { perDay: 2, days: 2, geo }, NOW);
  assert.equal(plan.length, 2); assert.equal(plan[0].items.length, 2);
  const ids = plan[0].items.map(x => x.branch.id).sort(); assert.ok(ids.includes('A') || ids.includes('B'));
  assert.equal(plan.flatMap(d => d.items).length, 4);
});

import { executiveSummary } from './features/insights.ts';
test('executive summary: averages, delta vs previous period, coverage and narrative', () => {
  const all = [insp('a', 'A', 10, []), insp('b', 'B', 20, [1, 2, 3]), insp('c', 'A', 120, [1, 2, 3])];
  const s = executiveSummary({ inspections: all, branches: [br('A'), br('B'), br('C')], actions: [] }, 90, NOW);
  assert.equal(s.visits, 2); assert.equal(s.branchesVisited, 2); assert.equal(s.coveragePct, 67);
  assert.ok(s.avg !== null && s.prevAvg !== null && s.delta !== null && s.delta > 0);
  assert.ok(s.narrative.some(x => x.includes('متوسط الالتزام')) && s.narrative.some(x => x.includes('تغطية الزيارات')));
  assert.equal(executiveSummary({ inspections: [], branches: [], actions: [] }, 90, NOW).narrative[0].includes('لا توجد زيارات'), true);
});

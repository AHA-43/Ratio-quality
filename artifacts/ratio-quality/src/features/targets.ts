// Compliance target: which branches meet it on their latest scored visit.
import type { Branch, Inspection } from '../data.ts';
import { calculateScore } from '../scoring.ts';

export const DEFAULT_TARGET = 90;
export type Standing = { branch: Branch; score: number; gap: number; date: string };

/** Latest scored (non-imported, finalized) visit per active branch, against the target. */
export function standings(d: { inspections: Inspection[]; branches: Branch[] }, target = DEFAULT_TARGET, until = Infinity) {
  const latest = new Map<string, Inspection>();
  for (const i of d.inspections) {
    if (i.status !== 'finalized' || i.training || i.imported) continue;
    if (Date.parse(i.date.replace(' ', 'T')) >= until) continue;
    const c = latest.get(i.branchId); if (!c || i.date > c.date) latest.set(i.branchId, i);
  }
  const rows: Standing[] = [];
  for (const b of d.branches) {
    if (b.archived || b.demo) continue;
    const i = latest.get(b.id); if (!i) continue;
    const s = calculateScore(i.questionSnapshot, i.answers).score; if (s === null) continue;
    rows.push({ branch: b, score: s, gap: +(target - s).toFixed(1), date: i.date.slice(0, 10) });
  }
  const met = rows.filter(r => r.score >= target);
  return { target, rows, met: met.length, total: rows.length, below: rows.filter(r => r.score < target).sort((a, b) => b.gap - a.gap) };
}

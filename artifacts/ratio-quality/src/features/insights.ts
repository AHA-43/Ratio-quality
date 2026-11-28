// Pure analytics used by the "Priorities" page (focus points + weekly plan) and by the branch card.
// No React, no browser APIs: unit-tested with node.
import type { ActionItem, Branch, Inspection, Question } from '../data.ts';
import { calculateScore } from '../scoring.ts';
/** Geo helpers are injected (the real ones read a JSON file only the bundler can import). */
export type Geo = { pos: (b: Branch) => { lat: number; lng: number } | null; city: (name: string) => string; dist: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number };

const DAY = 86400000;
export const dateOf = (i: Pick<Inspection, 'date'>) => { const t = Date.parse(i.date.replace(' ', 'T')); return Number.isNaN(t) ? 0 : t; };
const failedAt = (i: Inspection, qid: number) => { const a = i.answers[qid]; return Boolean(a && (a.value === 'fail' || a.initialValue === 'fail')); };
const isReal = (i: Inspection) => i.status === 'finalized' && !i.training;
const isScored = (i: Inspection) => isReal(i) && !i.imported;
const sevRank: Record<string, number> = { Critical: 0, Major: 1, Minor: 2 };
const overdue = (a: ActionItem, now: number) => a.status !== 'مغلق' && Boolean(a.dueDate) && a.dueDate < new Date(now).toISOString().slice(0, 10);

export type FocusItem = { q: Pick<Question, 'id' | 'title' | 'section' | 'severity'>; fails: number; of: number; rate: number; priorRate: number | null; delta: number | null; branches: string[] };
export type BranchTrend = { branch: Branch; last: number; prev: number; delta: number };
export type StaleBranch = { branch: Branch; days: number | null };
export type Focus = { top: FocusItem[]; improving: BranchTrend[]; declining: BranchTrend[]; stale: StaleBranch[]; never: number; criticalOpen: number; overdueActions: number; visits: number; windowDays: number };

export function focusInsights(input: { inspections: Inspection[]; branches: Branch[]; actions: ActionItem[] }, now = Date.now(), windowDays = 90): Focus {
  const real = input.inspections.filter(isReal);
  const active = input.branches.filter(b => !b.archived && !b.demo);
  const scored = real.filter(isScored);
  const recent = scored.filter(i => now - dateOf(i) <= windowDays * DAY);
  const prior = scored.filter(i => { const d = now - dateOf(i); return d > windowDays * DAY && d <= 2 * windowDays * DAY; });
  const stat = (list: Inspection[]) => {
    const m = new Map<number, { q: FocusItem['q']; fails: number; of: number; branches: Map<string, number> }>();
    for (const i of list) for (const q of i.questionSnapshot) {
      const a = i.answers[q.id]; if (!a || a.value == null || a.value === 'na') continue;
      const e = m.get(q.id) ?? { q: { id: q.id, title: q.title, section: q.section, severity: q.severity }, fails: 0, of: 0, branches: new Map() };
      e.of++; if (failedAt(i, q.id)) { e.fails++; e.branches.set(i.branchName, (e.branches.get(i.branchName) ?? 0) + 1); }
      m.set(q.id, e);
    }
    return m;
  };
  const cur = stat(recent), old = stat(prior);
  const top: FocusItem[] = [...cur.values()].filter(e => e.fails > 0).map(e => {
    const o = old.get(e.q.id); const rate = e.fails / e.of; const priorRate = o && o.of >= 3 ? o.fails / o.of : null;
    return { q: e.q, fails: e.fails, of: e.of, rate, priorRate, delta: priorRate === null ? null : rate - priorRate, branches: [...e.branches.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]) };
  }).sort((a, b) => b.fails - a.fails || sevRank[a.q.severity] - sevRank[b.q.severity] || b.rate - a.rate).slice(0, 8);

  const trends: BranchTrend[] = [];
  const lastVisit = new Map<string, number>();
  for (const b of active) {
    const all = real.filter(i => i.branchId === b.id).sort((x, y) => dateOf(y) - dateOf(x));
    if (all[0]) lastVisit.set(b.id, dateOf(all[0]));
    const mine = all.filter(isScored);
    if (mine.length >= 2) {
      const s1 = calculateScore(mine[0].questionSnapshot, mine[0].answers).score, s2 = calculateScore(mine[1].questionSnapshot, mine[1].answers).score;
      if (s1 !== null && s2 !== null) trends.push({ branch: b, last: s1, prev: s2, delta: +(s1 - s2).toFixed(1) });
    }
  }
  const improving = trends.filter(t => t.delta >= 3).sort((a, b) => b.delta - a.delta).slice(0, 5);
  const declining = trends.filter(t => t.delta <= -3).sort((a, b) => a.delta - b.delta).slice(0, 5);
  const staleAll: StaleBranch[] = active.map(b => ({ branch: b, days: lastVisit.has(b.id) ? Math.floor((now - lastVisit.get(b.id)!) / DAY) : null }))
    .filter(x => x.days === null || x.days > 30);
  const stale = staleAll.filter(x => x.days !== null).sort((a, b) => b.days! - a.days!).slice(0, 8);
  const never = staleAll.filter(x => x.days === null).length;
  const open = input.actions.filter(a => a.status !== 'مغلق');
  return { top, improving, declining, stale, never, criticalOpen: open.filter(a => a.severity === 'Critical').length, overdueActions: open.filter(a => overdue(a, now)).length, visits: recent.length, windowDays };
}

/* ---------------- weekly plan ---------------- */
export type PlanItem = { branch: Branch; priority: number; reasons: string[]; km: number | null };
export type PlanDay = { date: Date; items: PlanItem[] };

export function branchPriority(b: Branch, input: { inspections: Inspection[]; actions: ActionItem[] }, now: number): { priority: number; reasons: string[] } {
  const mine = input.inspections.filter(i => isReal(i) && i.branchId === b.id).sort((x, y) => dateOf(y) - dateOf(x));
  const open = input.actions.filter(a => a.status !== 'مغلق' && (a.branchId === b.id || a.branchName === b.name));
  let p = 0; const reasons: string[] = [];
  if (!mine.length) { p += 60; reasons.push('لم يُزر من قبل'); }
  else {
    const days = Math.floor((now - dateOf(mine[0])) / DAY);
    p += Math.min(days, 90) * .6 + (days > 30 ? 10 : 0);
    if (days > 30) reasons.push(`آخر زيارة قبل ${days} يوماً`);
    if (days < 10) p -= 50;
    const cls = calculateScore(mine[0].questionSnapshot, mine[0].answers).classification;
    if (cls === 'غير مقبول') { p += 40; reasons.push('آخر نتيجة: غير مقبول'); }
    else if (cls === 'يحتاج تحسين') { p += 25; reasons.push('آخر نتيجة: يحتاج تحسين'); }
    else if (cls === 'جيد') p += 5;
  }
  const crit = open.filter(a => a.severity === 'Critical').length, late = open.filter(a => overdue(a, now)).length;
  if (crit) { p += Math.min(crit * 15, 45); reasons.push(`${crit} إجراء حرج مفتوح`); }
  if (late) { p += Math.min(late * 6, 30); reasons.push(`${late} إجراء متأخر`); }
  return { priority: Math.round(p), reasons };
}

const WEEKDAY_OFF = new Set([5, 6]); // Friday, Saturday
export function workDays(from: Date, n: number) {
  const out: Date[] = []; const d = new Date(from); d.setHours(0, 0, 0, 0);
  while (out.length < n) { if (!WEEKDAY_OFF.has(d.getDay())) out.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return out;
}

/** Highest-priority branches first; each day is filled with the branches nearest to that day's anchor so trips stay short. */
export function planWeek(input: { inspections: Inspection[]; branches: Branch[]; actions: ActionItem[] }, opts: { perDay?: number; days?: number; from?: Date; geo: Geo }, now = Date.now()): PlanDay[] {
  const perDay = opts.perDay ?? 2, days = opts.days ?? 5;
  // Home base = where recent visits happened (median of their branch positions): far-away branches with
  // the same urgency come after nearby ones, so the plan is drivable.
  const recent = input.inspections.filter(i => !i.training && i.status === 'finalized').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20)
    .map(i => { const b = input.branches.find(x => x.id === i.branchId); return b ? opts.geo.pos(b) : null; }).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const base = recent.length >= 2 ? { lat: med(recent.map(p => p.lat)), lng: med(recent.map(p => p.lng)) } : null;
  const effective = (b: Branch, p: number) => { if (!base) return p; const bp = opts.geo.pos(b); return bp ? p - Math.min(40, opts.geo.dist(base, bp) / 25) : p - 20; };
  const scored = input.branches.filter(b => !b.archived && !b.demo)
    .map(b => ({ b, ...branchPriority(b, input, now) })).filter(x => x.priority >= 15).map(x => ({ ...x, eff: effective(x.b, x.priority) })).sort((a, b) => b.eff - a.eff).slice(0, perDay * days);
  const pool = [...scored]; const out: PlanDay[] = [];
  const dates = workDays(opts.from ?? new Date(now), days);
  const { pos: posOf, city: cityOf, dist: distanceKm } = opts.geo;
  for (const date of dates) {
    if (!pool.length) break;
    const anchor = pool.shift()!; const items: PlanItem[] = [anchor].map(x => ({ branch: x.b, priority: x.priority, reasons: x.reasons, km: null }));
    const ap = posOf(anchor.b);
    while (items.length < perDay && pool.length) {
      let best = 0, bestD = Infinity;
      pool.forEach((c, idx) => { const cp = posOf(c.b); const d = ap && cp ? distanceKm(ap, cp) : (cityOf(c.b.name) === cityOf(anchor.b.name) ? 0 : 9999); if (d < bestD) { bestD = d; best = idx; } });
      const [c] = pool.splice(best, 1); items.push({ branch: c.b, priority: c.priority, reasons: c.reasons, km: bestD < 9999 ? bestD : null });
    }
    out.push({ date, items });
  }
  return out;
}

/* ---------------- executive summary (management dashboard) ---------------- */
export type ExecSummary = {
  days: number; visits: number; branchesVisited: number; branchesTotal: number; coveragePct: number;
  avg: number | null; prevAvg: number | null; delta: number | null; criticalFailures: number;
  classCounts: Record<'ممتاز' | 'جيد' | 'يحتاج تحسين' | 'غير مقبول', number>;
  monthly: { key: string; avg: number; n: number }[];
  sections: { name: string; avg: number }[];
  best: { branch: Branch; score: number }[]; worst: { branch: Branch; score: number }[];
  actionsTotal: number; actionsClosedPct: number | null; avgCloseDays: number | null; overdue: number;
  narrative: string[];
};
/** Percent with direction marks so Arabic text doesn't flip it to %92. */
export const pct = (n: number | string) => `\u2066${n}%\u2069`;
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const r1 = (n: number) => Math.round(n * 10) / 10;

export type Range = { from: number; to: number; prevFrom: number; prevTo: number };
/** Calendar month (YYYY-MM) and the month before it. */
export function monthRange(ym: string): Range { const [y, m] = ym.split('-').map(Number); return { from: Date.UTC(y, m - 1, 1), to: Date.UTC(y, m, 1), prevFrom: Date.UTC(y, m - 2, 1), prevTo: Date.UTC(y, m - 1, 1) }; }
export const availableMonths = (inspections: Inspection[]) => [...new Set(inspections.filter(isReal).map(i => new Date(dateOf(i)).toISOString().slice(0, 7)))].sort().reverse();

export function executiveSummary(input: { inspections: Inspection[]; branches: Branch[]; actions: ActionItem[] }, days = 90, now = Date.now(), range?: Range): ExecSummary {
  const real = input.inspections.filter(isReal);
  const active = input.branches.filter(b => !b.archived && !b.demo);
  const inWin = (i: Inspection, from: number, to: number) => { const age = now - dateOf(i); return age >= from * DAY && age < to * DAY; };
  const cur = range ? real.filter(i => dateOf(i) >= range.from && dateOf(i) < range.to) : real.filter(i => inWin(i, 0, days));
  const prev = range ? real.filter(i => dateOf(i) >= range.prevFrom && dateOf(i) < range.prevTo) : real.filter(i => inWin(i, days, days * 2));
  const scoreOf = (i: Inspection) => calculateScore(i.questionSnapshot, i.answers);
  const scores = cur.map(scoreOf), pscores = prev.map(scoreOf);
  const avg = mean(scores.filter(s => s.score !== null).map(s => s.score!)), prevAvg = mean(pscores.filter(s => s.score !== null).map(s => s.score!));
  const classCounts = { 'ممتاز': 0, 'جيد': 0, 'يحتاج تحسين': 0, 'غير مقبول': 0 };
  for (const s of scores) if (s.classification && s.classification in classCounts) classCounts[s.classification as keyof typeof classCounts]++;
  const visited = new Set(cur.map(i => i.branchId)); const branchesVisited = active.filter(b => visited.has(b.id)).length;

  const byMonth = new Map<string, number[]>();
  for (const i of real) { const s = scoreOf(i).score; if (s === null) continue; const k = new Date(dateOf(i)).toISOString().slice(0, 7); (byMonth.get(k) ?? byMonth.set(k, []).get(k)!).push(s); }
  const monthly = [...byMonth.entries()].sort().slice(-6).map(([key, v]) => ({ key, avg: r1(mean(v)!), n: v.length }));

  const secMap = new Map<string, number[]>();
  for (const i of cur) for (const name of new Set(i.questionSnapshot.map(q => q.section))) { const r = calculateScore(i.questionSnapshot.filter(q => q.section === name), i.answers); if (r.score !== null) (secMap.get(name) ?? secMap.set(name, []).get(name)!).push(r.score); }
  const sections = [...secMap.entries()].map(([name, v]) => ({ name, avg: r1(mean(v)!) })).sort((a, b) => b.avg - a.avg);

  const latest = new Map<string, { b: Branch; score: number }>();
  for (const b of active) { const l = real.filter(i => i.branchId === b.id).sort((x, y) => dateOf(y) - dateOf(x))[0]; const s = l ? scoreOf(l).score : null; if (s !== null) latest.set(b.id, { b, score: s }); }
  const ranked = [...latest.values()].sort((a, b) => b.score - a.score);
  const best = ranked.slice(0, 5).map(x => ({ branch: x.b, score: x.score })), worst = ranked.filter(x => x.score < 90).slice(-5).reverse().map(x => ({ branch: x.b, score: x.score }));

  const acts = input.actions; const closed = acts.filter(a => a.status === 'مغلق');
  const closeDays = closed.map(a => (Date.parse(a.verifiedAt ?? '') - Date.parse(a.createdAt ?? '')) / DAY).filter(d => Number.isFinite(d) && d >= 0);
  const delta = avg !== null && prevAvg !== null ? r1(avg - prevAvg) : null;
  const critical = scores.reduce((a, s) => a + s.criticalFailures, 0);

  const narrative: string[] = [];
  if (!cur.length) narrative.push(`لا توجد زيارات مكتملة خلال آخر ${days} يوماً.`);
  else {
    narrative.push(`متوسط الالتزام ${pct(r1(avg ?? 0))} عبر ${cur.length} زيارة في ${branchesVisited} فرع${delta !== null ? `، ${delta >= 0 ? 'بتحسّن' : 'بتراجع'} ${Math.abs(delta)} نقطة عن الفترة السابقة` : ''}.`);
    if (active.length) narrative.push(`تغطية الزيارات ${pct(Math.round(branchesVisited / active.length * 100))} من الفروع النشطة (${branchesVisited} من ${active.length}).`);
    if (critical) narrative.push(`سُجّل ${critical} إخفاق حرج يتطلب متابعة عاجلة.`); else narrative.push('لا توجد إخفاقات حرجة في هذه الفترة.');
    if (sections.length > 1) narrative.push(`أقوى الأقسام «${sections[0].name}» (${pct(sections[0].avg)}) وأضعفها «${sections[sections.length - 1].name}» (${pct(sections[sections.length - 1].avg)}).`);
    if (worst.length && worst[0].score < 80) narrative.push(`الأحوج للمتابعة: ${worst.slice(0, 3).map(w => `${w.branch.name} (${pct(Math.round(w.score))})`).join('، ')}.`);
  }
  const od = acts.filter(a => a.status !== 'مغلق' && a.dueDate && a.dueDate < new Date(now).toISOString().slice(0, 10)).length;
  if (acts.length) narrative.push(`نسبة إغلاق الإجراءات ${pct(Math.round(closed.length / acts.length * 100))}${od ? ` ويوجد ${od} إجراء متأخر` : ''}.`);

  return { days, visits: cur.length, branchesVisited, branchesTotal: active.length, coveragePct: active.length ? Math.round(branchesVisited / active.length * 100) : 0, avg: avg === null ? null : r1(avg), prevAvg: prevAvg === null ? null : r1(prevAvg), delta, criticalFailures: critical, classCounts, monthly, sections, best, worst, actionsTotal: acts.length, actionsClosedPct: acts.length ? Math.round(closed.length / acts.length * 100) : null, avgCloseDays: closeDays.length ? r1(mean(closeDays)!) : null, overdue: od, narrative };
}

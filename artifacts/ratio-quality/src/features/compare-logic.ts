import type { Inspection } from '../data.ts';
const isFail = (i: Inspection, id: number) => { const a = i.answers[id]; return Boolean(a && (a.value === 'fail' || a.initialValue === 'fail')); };

/** Findings of a visit keyed so the same problem matches across visits (checklist id, or title for imported ones). */
export function findingKeys(i: Inspection): Map<string, string> {
  const m = new Map<string, string>();
  for (const q of i.questionSnapshot) if (isFail(i, q.id)) m.set(q.id < 1000 ? `q${q.id}` : `t:${q.title.trim()}`, q.title);
  return m;
}
export function diffFindings(a: Inspection, b: Inspection) {
  const fa = findingKeys(a), fb = findingKeys(b);
  return {
    both: [...fa].filter(([k]) => fb.has(k)).map(([, t]) => t),
    onlyA: [...fa].filter(([k]) => !fb.has(k)).map(([, t]) => t),
    onlyB: [...fb].filter(([k]) => !fa.has(k)).map(([, t]) => t),
  };
}

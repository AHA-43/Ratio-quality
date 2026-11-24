import { useState } from 'react';
import type { Answer, Inspection } from '../data';
import { clearConflict } from '../data';

const label = (a?: Answer) => !a || a.value == null ? 'بدون إجابة' : a.value === 'pass' ? 'مطابق' : a.value === 'fail' ? 'غير مطابق' : 'لا ينطبق';
const same = (x?: Answer, y?: Answer) => JSON.stringify({ v: x?.value ?? null, o: x?.observation ?? '', r: x?.recommendation ?? '', n: x?.attachments?.length ?? 0 }) === JSON.stringify({ v: y?.value ?? null, o: y?.observation ?? '', r: y?.recommendation ?? '', n: y?.attachments?.length ?? 0 });

/** Shown when the same draft was edited on two devices since the last sync. Nothing is discarded silently. */
export function ConflictResolver({ mine, theirs, onResolve }: { mine: Record<number, Answer>; theirs: Inspection; onResolve: (answers: Record<number, Answer>) => void }) {
  const ids = [...new Set([...Object.keys(mine), ...Object.keys(theirs.answers)].map(Number))].filter(id => !same(mine[id], theirs.answers[id])).sort((a, b) => a - b);
  const [pick, setPick] = useState<Record<number, 'mine' | 'theirs'>>(() => Object.fromEntries(ids.map(id => [id, 'mine'])));
  const apply = () => {
    const merged = { ...mine };
    for (const id of ids) if (pick[id] === 'theirs') { if (theirs.answers[id]) merged[id] = theirs.answers[id]; else delete merged[id]; }
    clearConflict(theirs.id); onResolve(merged);
  };
  if (!ids.length) { clearConflict(theirs.id); return null; }
  return <div className="conflict">
    <b>عُدّلت هذه الزيارة من جهاز آخر أيضاً</b>
    <p>اختر لكل بند النسخة الصحيحة. لن يُحذف أي شيء قبل أن تقرر.</p>
    {ids.map(id => <div key={id} className="conflict-row"><span>البند {id}</span>
      <button className={pick[id] === 'mine' ? 'on' : ''} onClick={() => setPick({ ...pick, [id]: 'mine' })}>هذا الجهاز: {label(mine[id])}{mine[id]?.observation ? ` — ${mine[id].observation.slice(0, 40)}` : ''}</button>
      <button className={pick[id] === 'theirs' ? 'on' : ''} onClick={() => setPick({ ...pick, [id]: 'theirs' })}>الجهاز الآخر: {label(theirs.answers[id])}{theirs.answers[id]?.observation ? ` — ${theirs.answers[id].observation.slice(0, 40)}` : ''}</button>
    </div>)}
    <button className="button button-primary" onClick={apply}>اعتماد الدمج</button>
  </div>;
}

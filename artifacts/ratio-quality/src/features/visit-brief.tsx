import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowLeft, History, ListChecks } from 'lucide-react';
import type { ActionItem, Inspection, Question } from '../data';
import { calculateScore } from '../scoring';

const SEV: Record<string, string> = { Critical: 'حرج', Major: 'رئيسي', Minor: 'ثانوي' }; const rank: Record<string, number> = { Critical: 0, Major: 1, Minor: 2 };
export const repeatQuestions = (questions: Question[], prev?: Inspection) => !prev ? [] :
  questions.filter(q => { const a = prev.answers[q.id]; return a && (a.value === 'fail' || a.initialValue === 'fail'); }).sort((a, b) => rank[a.severity] - rank[b.severity] || a.id - b.id);

/** Short briefing before the first question: what went wrong last time and what is still open at this branch. */
export function VisitBrief({ inspection, prev, actions, onStart, onRepeat }: { inspection: Inspection; prev?: Inspection; actions: ActionItem[]; onStart: () => void; onRepeat: () => void }) {
  const repeats = repeatQuestions(inspection.questionSnapshot, prev); const ps = prev ? calculateScore(prev.questionSnapshot, prev.answers) : null;
  const critical = actions.filter(a => a.severity === 'Critical').length;
  return createPortal(<div className="install-sheet vb" role="dialog" aria-label="إحاطة قبل الزيارة" dir="rtl">
    <div className="is-body vb-body">
      <span className="eyebrow">إحاطة قبل البدء</span><h2>{inspection.branchName}</h2>
      {prev && ps && <div className="vb-last"><History size={18}/><div><b>آخر زيارة {prev.date.slice(0, 10)}</b><small>{ps.score ?? '—'}% · {ps.classification ?? '—'}{ps.criticalFailures ? ` · ${ps.criticalFailures} إخفاق حرج` : ''}</small></div></div>}
      {actions.length > 0 && <div className={`vb-open ${critical ? 'crit' : ''}`}><AlertTriangle size={18}/><div><b>{actions.length} إجراء تصحيحي مفتوح</b><small>{critical ? `منها ${critical} حرج. تحقق من تنفيذها أثناء الزيارة.` : 'تحقق من تنفيذها أثناء الزيارة.'}</small></div></div>}
      {repeats.length > 0 && <><h3><ListChecks size={16}/> تحقق من هذه البنود أولاً ({repeats.length})</h3><ul className="vb-list">{repeats.slice(0, 5).map(q => <li key={q.id}><span className={`severity-tag ${q.severity.toLowerCase()}`}>{SEV[q.severity]}</span>{q.id}. {q.title}</li>)}{repeats.length > 5 && <li className="more">و{repeats.length - 5} بنود أخرى</li>}</ul></>}
      <label className="vb-skip"><input type="checkbox" onChange={e => { try { localStorage.setItem('rq-brief', e.target.checked ? 'off' : 'on'); } catch { /* ignore */ } }}/> لا تعرض الإحاطة مرة أخرى</label>
      <div className="vb-actions">{repeats.length > 0 && <button type="button" className="button button-primary full-button" onClick={onRepeat}>ابدأ بالبنود المتكررة <ArrowLeft size={16}/></button>}<button type="button" className={`button ${repeats.length ? 'button-outline' : 'button-primary'} full-button`} onClick={onStart}>ابدأ الفحص من البند الأول</button></div>
    </div>
  </div>, document.body);
}

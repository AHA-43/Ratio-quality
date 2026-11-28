// "Quick visit" mode: the whole section on one screen. The inspector taps ✓ / — on each row, or one button
// for "everything in this section conforms"; a ✕ opens that single item for the finding details.
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleHelp, Gauge, ListChecks, Ruler, X } from 'lucide-react';
import type { Answer, Question } from '../data';
import { bulkPassIds, needsDetail } from './quick-logic';

type Value = 'pass' | 'fail' | 'na';
const SEV: Record<string, string> = { Critical: 'حرج', Major: 'رئيسي', Minor: 'ثانوي' };

export function SectionOverview({ section, number, total, questions, answers, onSet, onBulkPass, onOpen, onPrev, onNext, last, disabled }: {
  section: string; number: number; total: number; questions: Question[]; answers: Record<number, Answer | undefined>;
  onSet: (q: Question, v: Value) => void; onBulkPass: (ids: number[]) => void; onOpen: (q: Question) => void;
  onPrev?: () => void; onNext: () => void; last: boolean; disabled?: boolean;
}) {
  const done = questions.filter(q => answers[q.id]?.value != null).length;
  const fails = questions.filter(q => answers[q.id]?.value === 'fail').length;
  const bulk = bulkPassIds(questions, answers);
  const remainingDetail = questions.filter(q => answers[q.id]?.value == null && needsDetail(q)).length;
  const complete = done === questions.length;
  return <section className="so" aria-label={`قسم ${section}`}>
    <header className="so-head">
      <span className="so-ico"><ListChecks size={20}/></span>
      <div><small>القسم {number} من {total}</small><h2>{section}</h2></div>
      <span className="so-count"><b>{done}</b>/{questions.length}</span>
    </header>
    <div className="so-bar"><i style={{ width: `${questions.length ? done / questions.length * 100 : 0}%` }} className={fails ? 'has-fail' : ''}/></div>
    {!disabled && bulk.length > 0 && <button type="button" className="so-all" onClick={() => onBulkPass(bulk)} data-testid="button-section-all-pass">
      <Check size={20}/><span><b>كل البنود مطابقة</b><small>{bulk.length} بنداً{remainingDetail ? ` · ويبقى ${remainingDetail} يحتاج قراءة` : ''}</small></span>
    </button>}
    <ul className="so-list">{questions.map(q => { const a = answers[q.id]; const v = a?.value as Value | null | undefined;
      return <li key={q.id} className={`so-row ${v ?? ''}`}>
        <button type="button" className="so-title" onClick={() => onOpen(q)} aria-label={`فتح البند ${q.id}`}>
          <span className="so-num">{q.id}</span>
          <span className="so-text"><b>{q.title}</b>
            <small>
              {q.severity === 'Critical' && <em className="so-sev crit"><AlertTriangle size={11}/> {SEV[q.severity]}</em>}
              {needsDetail(q) && <em className="so-need">{q.measurement ? <><Ruler size={11}/> قراءة</> : <><Gauge size={11}/> تقييم</>}</em>}
              {v === 'fail' && (a?.observation?.trim() ? <em className="so-ok">✓ موثّقة</em> : <em className="so-todo">أضف وصف الملاحظة</em>)}
            </small></span>
          <ChevronLeft size={16} className="so-go"/>
        </button>
        {!disabled && <div className="so-btns" role="group" aria-label={`نتيجة البند ${q.id}`}>
          <button type="button" className={`p ${v === 'pass' ? 'on' : ''}`} onClick={() => onSet(q, 'pass')} aria-label="مطابق" aria-pressed={v === 'pass'} data-testid={`so-pass-${q.id}`}><Check size={18}/></button>
          <button type="button" className={`f ${v === 'fail' ? 'on' : ''}`} onClick={() => onSet(q, 'fail')} aria-label="غير مطابق" aria-pressed={v === 'fail'} data-testid={`so-fail-${q.id}`}><X size={18}/></button>
          <button type="button" className={`n ${v === 'na' ? 'on' : ''}`} onClick={() => onSet(q, 'na')} aria-label="لا ينطبق" aria-pressed={v === 'na'} data-testid={`so-na-${q.id}`}><CircleHelp size={18}/></button>
        </div>}
      </li>; })}</ul>
    <footer className="so-foot">
      <button type="button" className="so-nav" onClick={onPrev} disabled={!onPrev}><ChevronRight size={18}/> القسم السابق</button>
      <button type="button" className={`so-nav next ${complete ? 'ready' : ''}`} onClick={onNext} data-testid="button-section-next">{last ? 'المراجعة والإنهاء' : 'القسم التالي'} <ChevronLeft size={18}/></button>
    </footer>
  </section>;
}

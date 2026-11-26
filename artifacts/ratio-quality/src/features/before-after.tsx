import { useState } from 'react';
import { MediaImg } from './media';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Answer, Attachment, Inspection } from '../data';

const failed = (a?: Answer) => Boolean(a && (a.value === 'fail' || a.initialValue === 'fail'));
const imgs = (a?: Answer) => (a?.attachments ?? []).filter(x => x.type.startsWith('image/') && (x.data || x.id));
const label = (a?: Answer) => !a || a.value == null ? '—' : a.value === 'pass' ? (a.initialValue === 'fail' ? 'تم التصحيح' : 'مطابق') : a.value === 'fail' ? 'غير مطابق' : 'لا ينطبق';

/** Same question, same branch, two visits: photos side by side so improvement (or repetition) is visible at a glance. */
export function BeforeAfter({ current, previous }: { current: Inspection; previous?: Inspection }) {
  const [zoom, setZoom] = useState<{ att: Attachment; cap: string } | null>(null);
  if (!previous) return null;
  const rows = current.questionSnapshot.filter(q => {
    const a = current.answers[q.id], b = previous.answers[q.id];
    return (failed(a) || failed(b)) && (imgs(a).length || imgs(b).length);
  });
  if (!rows.length) return null;
  const side = (title: string, date: string, a?: Answer) => <div className="ba-side"><div className="ba-head"><b>{title}</b><small>{date.slice(0, 10)}</small><span className={`ba-chip ${a?.value === 'fail' ? 'f' : a?.value === 'pass' ? 'p' : ''}`}>{label(a)}</span></div>
    {imgs(a).length ? <div className="ba-imgs">{imgs(a).slice(0, 2).map(m => <button type="button" key={m.id} onClick={() => setZoom({ att: m, cap: `${title} · ${m.caption || ''}` })}><MediaImg att={m} alt={m.caption || title}/></button>)}</div> : <div className="ba-none">لا توجد صورة</div>}
    {a?.observation && <p className="ba-note">{a.observation}</p>}</div>;
  return <section className="ba-section no-print"><h2 className="report-section-title">قبل وبعد</h2>
    <p className="ba-hint">مقارنة بالزيارة السابقة ({previous.date.slice(0, 10)}) للبنود التي لها صور. اضغط على الصورة لتكبيرها.</p>
    {rows.map(q => { const a = current.answers[q.id], b = previous.answers[q.id]; const fixed = failed(b) && a?.value === 'pass'; const again = failed(b) && failed(a);
      return <article className={`ba-card ${fixed ? 'fixed' : again ? 'again' : ''}`} key={q.id}>
        <header><b>{q.id}. {q.title}</b>{fixed && <span className="ba-badge ok">تم التصحيح ✓</span>}{again && <span className="ba-badge bad">مستمرة</span>}{!failed(b) && failed(a) && <span className="ba-badge new">جديدة</span>}</header>
        <div className="ba-grid">{side('بعد', current.date, a)}{side('قبل', previous.date, b)}</div>
      </article>; })}
    {zoom && createPortal(<div className="lightbox" onClick={() => setZoom(null)} role="dialog"><button type="button" aria-label="إغلاق"><X size={20}/></button><MediaImg att={zoom.att} alt={zoom.cap}/><small>{zoom.cap}</small></div>, document.body)}
  </section>;
}

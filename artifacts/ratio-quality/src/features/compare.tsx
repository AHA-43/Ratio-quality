// Compare two visits side by side: two branches, or one branch against its own earlier visit.
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, CheckCircle2, GitCompareArrows, MinusCircle, PlusCircle, TrendingDown, TrendingUp } from 'lucide-react';
import type { Branch, Inspection } from '../data';
import { calculateScore } from '../scoring';
import { HeadIcon } from './page-icons';
import { diffFindings } from './compare-logic';

type D = { inspections: Inspection[]; branches: Branch[] };
const tone = (v: number | null) => v == null ? 'none' : v >= 90 ? 'good' : v >= 80 ? 'ok' : v >= 70 ? 'warn' : 'bad';
const scoreOf = (i: Inspection) => i.imported ? null : calculateScore(i.questionSnapshot, i.answers).score;
const clsOf = (i: Inspection) => i.imported ? i.imported.classification ?? '' : calculateScore(i.questionSnapshot, i.answers).classification ?? '';

function Side({ label, branches, inspections, branchId, visitId, onBranch, onVisit }: { label: string; branches: Branch[]; inspections: Inspection[]; branchId: string; visitId: string; onBranch: (id: string) => void; onVisit: (id: string) => void }) {
  const visits = inspections.filter(i => i.branchId === branchId).sort((x, y) => y.date.localeCompare(x.date));
  return <div className="cmp-side">
    <span className="cmp-label">{label}</span>
    <select value={branchId} onChange={e => onBranch(e.target.value)} aria-label={`${label}: الفرع`}><option value="">اختر الفرع…</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
    <select value={visitId} onChange={e => onVisit(e.target.value)} disabled={!visits.length} aria-label={`${label}: الزيارة`}>{!visits.length && <option>لا زيارات</option>}{visits.map(v => { const s = scoreOf(v); return <option key={v.id} value={v.id}>{v.date.slice(0, 10)} · {s != null ? `${Math.round(s)}%` : clsOf(v) || 'سابقة'}</option>; })}</select>
  </div>;
}

export default function ComparePage({ data }: { data: D }) {
  const q = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const real = useMemo(() => data.inspections.filter(i => i.status === 'finalized' && !i.training), [data.inspections]);
  const branches = useMemo(() => data.branches.filter(b => !b.archived && real.some(i => i.branchId === b.id)).sort((x, y) => x.name.localeCompare(y.name, 'ar')), [data.branches, real]);
  const latest = (bid: string, skip = 0) => real.filter(i => i.branchId === bid).sort((x, y) => y.date.localeCompare(x.date))[skip]?.id ?? '';
  const a0 = q.get('a') ?? '';
  const [aB, setAB] = useState(a0), [aV, setAV] = useState(() => a0 ? latest(a0) : '');
  // default for "a": compare the branch with its own previous visit
  const [bB, setBB] = useState(a0 && latest(a0, 1) ? a0 : ''), [bV, setBV] = useState(() => a0 ? latest(a0, 1) : '');
  const A = real.find(i => i.id === aV), B = real.find(i => i.id === bV);

  const sections = useMemo(() => {
    if (!A || !B || A.imported || B.imported) return [];
    const names = [...new Set(A.questionSnapshot.map(x => x.section))].filter(n => B.questionSnapshot.some(x => x.section === n));
    return names.map(n => ({ n, a: calculateScore(A.questionSnapshot.filter(x => x.section === n), A.answers).score, b: calculateScore(B.questionSnapshot.filter(x => x.section === n), B.answers).score }));
  }, [A, B]);
  const diff = useMemo(() => A && B ? diffFindings(A, B) : null, [A, B]);
  const sa = A ? scoreOf(A) : null, sb = B ? scoreOf(B) : null;
  const delta = sa != null && sb != null ? +(sa - sb).toFixed(1) : null;
  const same = A && B && A.branchId === B.branchId;

  return <div className="page-content cmp">
    <Link href="/branches" className="back-link"><ArrowRight size={16}/> الفروع</Link>
    <div className="page-title"><div className="pt-wrap"><HeadIcon icon={GitCompareArrows} size={22}/><div><div className="eyebrow">تحليل</div><h1>مقارنة</h1><p>قارن فرعين، أو فرعاً مع نفسه في زيارة سابقة.</p></div></div></div>
    <div className="surface-card cmp-pick">
      <Side label="الأول" branches={branches} inspections={real} branchId={aB} visitId={aV} onBranch={id => { setAB(id); setAV(latest(id)); }} onVisit={setAV}/>
      <span className="cmp-vs">مقابل</span>
      <Side label="الثاني" branches={branches} inspections={real} branchId={bB} visitId={bV} onBranch={id => { setBB(id); setBV(id === aB && latest(id, 1) ? latest(id, 1) : latest(id)); }} onVisit={setBV}/>
    </div>
    {(!A || !B) && <div className="surface-card pr-empty">اختر الجهتين لتظهر المقارنة. {!branches.length && 'لا توجد زيارات مكتملة بعد.'}</div>}
    {A && B && diff && <>
      <div className="cmp-scores">
        <div className={`cmp-score tone-${tone(sa)}`}><small>{A.branchName}</small><b>{sa != null ? `${Math.round(sa)}%` : '—'}</b><span>{clsOf(A) || 'تقرير سابق'} · {A.date.slice(0, 10)}</span></div>
        <div className="cmp-delta">{delta == null ? <GitCompareArrows size={20}/> : <span className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? <TrendingUp size={18}/> : <TrendingDown size={18}/>}<b dir="ltr">{delta >= 0 ? '+' : ''}{delta}</b></span>}</div>
        <div className={`cmp-score tone-${tone(sb)}`}><small>{B.branchName}</small><b>{sb != null ? `${Math.round(sb)}%` : '—'}</b><span>{clsOf(B) || 'تقرير سابق'} · {B.date.slice(0, 10)}</span></div>
      </div>
      {same && delta != null && <p className="cmp-note">{delta > 0 ? 'تحسّن الفرع مقارنة بزيارته الأقدم.' : delta < 0 ? 'تراجع الفرع مقارنة بزيارته الأقدم.' : 'النتيجة ثابتة بين الزيارتين.'} {diff.onlyB.length > 0 && `انحلّت ${diff.onlyB.length} ملاحظة.`} {diff.onlyA.length > 0 && `ظهرت ${diff.onlyA.length} ملاحظة جديدة.`}</p>}
      {sections.length > 0 && <section className="surface-card"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="الأقسام"/><div><span className="eyebrow">حسب القسم</span><h2>الأداء في كل قسم</h2></div></div></div>
        {sections.map(s => <div key={s.n} className="cmp-sec"><b>{s.n}</b>
          <div className="cmp-bars"><span className="a" style={{ width: `${s.a ?? 0}%` }}/><em>{s.a != null ? Math.round(s.a) : '—'}</em></div>
          <div className="cmp-bars"><span className="b" style={{ width: `${s.b ?? 0}%` }}/><em>{s.b != null ? Math.round(s.b) : '—'}</em></div></div>)}
        <div className="cmp-key"><i className="a"/> {A.branchName} <i className="b"/> {B.branchName}</div></section>}
      <section className="surface-card cmp-find"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="الملاحظات"/><div><span className="eyebrow">ما تغيّر</span><h2>الملاحظات</h2></div></div></div>
        <FindList icon={<MinusCircle size={15}/>} cls="both" title="مشتركة في الزيارتين" items={diff.both}/>
        <FindList icon={<PlusCircle size={15}/>} cls="a" title={same ? 'جديدة في الزيارة الأحدث' : `فقط في ${A.branchName}`} items={diff.onlyA}/>
        <FindList icon={<CheckCircle2 size={15}/>} cls="b" title={same ? 'كانت في الأقدم وانحلّت' : `فقط في ${B.branchName}`} items={diff.onlyB}/>
        {!diff.both.length && !diff.onlyA.length && !diff.onlyB.length && <p className="pr-empty">لا ملاحظات في الزيارتين.</p>}
      </section>
    </>}
  </div>;
}
function FindList({ icon, cls, title, items }: { icon: React.ReactNode; cls: string; title: string; items: string[] }) {
  if (!items.length) return null;
  return <div className={`cmp-fl ${cls}`}><h3>{icon} {title} <small>{items.length}</small></h3><ul>{items.slice(0, 12).map((t, k) => <li key={k}>{t}</li>)}{items.length > 12 && <li className="more">+{items.length - 12} أخرى</li>}</ul></div>;
}

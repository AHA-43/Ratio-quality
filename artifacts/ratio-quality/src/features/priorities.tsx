import { useMemo, useState } from 'react';
import { HeadIcon } from './page-icons';
import { Link } from 'wouter';
import { ArrowLeft, CalendarCheck, Flame, MapPin, TrendingDown, TrendingUp } from 'lucide-react';
import type { ActionItem, Branch, Inspection } from '../data';
import { branchPos, cityOf, distanceKm, fmtKm } from './geo';
import { focusInsights, planWeek, type Geo } from './insights';
import { themesOf } from './themes';

type D = { inspections: Inspection[]; branches: Branch[]; actions: ActionItem[] };
const geo: Geo = { pos: b => branchPos(b.id, b.name), city: cityOf, dist: distanceKm };
const SEV: Record<string, string> = { Critical: 'حرج', Major: 'رئيسي', Minor: 'ثانوي' };
const dayName = (d: Date) => d.toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'long' });
const dayDate = (d: Date) => d.toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'long' });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function PrioritiesPage({ data }: { data: D }) {
  const [tab, setTab] = useState<'focus' | 'plan'>(() => { try { return new URLSearchParams(window.location.search).get('tab') === 'plan' ? 'plan' : 'focus'; } catch { return 'focus'; } });
  const [perDay, setPerDay] = useState(2);
  const focus = useMemo(() => focusInsights(data), [data.inspections, data.branches, data.actions]);
  const plan = useMemo(() => planWeek(data, { perDay, days: 5, geo }), [data.inspections, data.branches, data.actions, perDay]);
  const staleN = focus.stale.length + focus.never;
  const themes = useMemo(() => { const now = Date.now(); return themesOf(data.inspections.filter(i => i.status === 'finalized' && !i.training && now - Date.parse(i.date.replace(' ', 'T')) <= focus.windowDays * 86400000)); }, [data.inspections, focus.windowDays]);
  const maxTheme = Math.max(1, ...themes.map(t => t.count));
  return <div className="page-content pr-page">
    <div className="page-title"><div className="pt-wrap"><HeadIcon text="الأولويات" size={22}/><div><span className="eyebrow">ماذا نفعل الآن؟</span><h1>الأولويات</h1><p>أين المشكلة الفعلية، وأي الفروع نزورها أولاً هذا الأسبوع.</p></div></div></div>
    <div className="pr-kpis">
      <div className="pr-kpi warn"><b>{staleN}</b><span>فرع يحتاج زيارة</span><small>+30 يوماً أو لم يُزر</small></div>
      <div className="pr-kpi bad"><b>{focus.criticalOpen}</b><span>إجراء حرج مفتوح</span><small>خلال 24 ساعة</small></div>
      <div className="pr-kpi bad"><b>{focus.overdueActions}</b><span>إجراء متأخر</span><small>تجاوز الاستحقاق</small></div>
      <div className="pr-kpi"><b>{focus.visits}</b><span>زيارة آخر {focus.windowDays} يوماً</span><small>أساس التحليل</small></div>
    </div>
    <div className="pr-tabs" role="tablist"><button role="tab" aria-selected={tab === 'focus'} className={tab === 'focus' ? 'on' : ''} onClick={() => setTab('focus')}><Flame size={16}/> نقاط التركيز</button><button role="tab" aria-selected={tab === 'plan'} className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}><CalendarCheck size={16}/> خطة الأسبوع</button></div>

    {tab === 'focus' && <>
      <section className="surface-card pr-card"><div className="card-heading"><div><span className="eyebrow">آخر {focus.windowDays} يوماً</span><h2>أكثر البنود فشلاً</h2></div></div>
        {focus.top.length === 0 ? <p className="pr-empty">لا توجد ملاحظات كافية بعد. بعد اعتماد الزيارات ستظهر هنا البنود الأكثر تكراراً على مستوى كل الفروع.</p> :
          <ol className="pr-list">{focus.top.map((f, i) => <li key={f.q.id} className="pr-focus">
            <span className="pr-rank">{i + 1}</span>
            <div className="pr-focus-main"><b>{f.q.id}. {f.q.title}</b>
              <div className="pr-meta"><span className={`severity-tag ${f.q.severity.toLowerCase()}`}>{SEV[f.q.severity]}</span><span>{f.q.section}</span></div>
              <div className="pr-bar"><i style={{ width: `${Math.max(4, f.rate * 100)}%` }} className={f.q.severity === 'Critical' ? 'crit' : ''}/></div>
              <small>{f.fails} من {f.of} زيارة (<bdi>{Math.round(f.rate * 100)}%</bdi>){f.branches.length ? ` · أبرزها: ${f.branches.join('، ')}` : ''}</small></div>
            {f.delta !== null && Math.abs(f.delta) >= 0.05 && <span className={`pr-trend ${f.delta > 0 ? 'worse' : 'better'}`}>{f.delta > 0 ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}{f.delta > 0 ? 'يزداد' : 'يتحسن'}</span>}
          </li>)}</ol>}
      </section>
      {themes.length > 0 && <section className="surface-card pr-card"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="المواضيع الأكثر تكراراً كل التقارير، بما فيها السابقة"/><div><span className="eyebrow">كل التقارير، بما فيها السابقة</span><h2>المواضيع الأكثر تكراراً</h2></div></div></div>
        <ul className="pr-themes">{themes.slice(0, 8).map(t => <li key={t.name}>
          <div className="th-top"><b>{t.name}</b><span className="th-n">{t.count}<small> ملاحظة</small></span></div>
          <div className="pr-bar"><i style={{ width: `${Math.max(4, t.count / maxTheme * 100)}%` }} className={t.critical ? 'crit' : ''}/></div>
          <small>{t.critical ? <em className="th-crit">{t.critical} حرجة</em> : null}في {t.reports} تقرير{t.branches.length ? ` · أبرزها: ${t.branches.join('، ')}` : ''}</small>
        </li>)}</ul>
      </section>}
      <div className="pr-two">
        <section className="surface-card pr-card"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="فروع تتراجع مقارنة بآخر زيارتين"/><div><span className="eyebrow">مقارنة بآخر زيارتين</span><h2>فروع تتراجع</h2></div></div></div>
          {focus.declining.length ? <ul className="pr-list">{focus.declining.map(t => <li key={t.branch.id}><Link href={`/branches/${t.branch.id}`} className="pr-row"><b>{t.branch.name}</b><span className="pr-delta down">{t.prev}% ← {t.last}%<em>{t.delta}</em></span></Link></li>)}</ul> : <p className="pr-empty">لا توجد فروع متراجعة بشكل ملحوظ.</p>}
        </section>
        <section className="surface-card pr-card"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="فروع تتحسن مقارنة بآخر زيارتين"/><div><span className="eyebrow">مقارنة بآخر زيارتين</span><h2>فروع تتحسن</h2></div></div></div>
          {focus.improving.length ? <ul className="pr-list">{focus.improving.map(t => <li key={t.branch.id}><Link href={`/branches/${t.branch.id}`} className="pr-row"><b>{t.branch.name}</b><span className="pr-delta up">{t.prev}% ← {t.last}%<em>+{t.delta}</em></span></Link></li>)}</ul> : <p className="pr-empty">لا توجد تحسنات ملحوظة بعد.</p>}
        </section>
      </div>
      <section className="surface-card pr-card"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="فروع تحتاج زيارة تغطية الزيارات"/><div><span className="eyebrow">تغطية الزيارات</span><h2>فروع تحتاج زيارة</h2></div></div><button className="text-link" onClick={() => setTab('plan')}>افتح خطة الأسبوع <ArrowLeft size={14}/></button></div>
        {focus.never > 0 && <div className="pr-note"><MapPin size={16}/>{focus.never} فرع لم تتم زيارته بعد.</div>}
        {focus.stale.length ? <ul className="pr-list">{focus.stale.map(s => <li key={s.branch.id}><Link href={`/branches/${s.branch.id}`} className="pr-row"><b>{s.branch.name}</b><span className="pr-days">{s.days} يوماً</span></Link></li>)}</ul> : focus.never === 0 && <p className="pr-empty">كل الفروع مزارة خلال آخر 30 يوماً.</p>}
      </section>
    </>}

    {tab === 'plan' && <>
      <section className="surface-card pr-plan-head">
        <div><b>كم زيارة في اليوم؟</b><small>الخطة تُحدَّث تلقائياً بعد كل زيارة.</small></div>
        <div className="segmented" role="group">{[1, 2, 3].map(n => <button key={n} className={perDay === n ? 'active' : ''} onClick={() => setPerDay(n)}>{n}</button>)}</div>
      </section>
      <p className="pr-why">الترتيب يعتمد على: مدة عدم الزيارة، آخر نتيجة، الإجراءات الحرجة والمتأخرة. وتُجمَّع الفروع القريبة من بعضها في نفس اليوم لتقليل التنقل.</p>
      {plan.length === 0 ? <section className="surface-card"><p className="pr-empty">لا توجد فروع تحتاج زيارة عاجلة هذا الأسبوع. أحسنتم!</p></section> :
        plan.map(day => <section key={day.date.toISOString()} className="surface-card pr-day">
          <header><div><b>{sameDay(day.date, new Date()) ? 'اليوم' : dayName(day.date)}</b><small>{dayDate(day.date)}</small></div><span className="count-badge">{day.items.length} زيارة</span></header>
          <ul className="pr-list">{day.items.map((it, k) => <li key={it.branch.id} className="pr-visit">
            <span className={`pr-pri ${it.priority >= 70 ? 'hi' : it.priority >= 40 ? 'mid' : 'lo'}`} title="الأولوية"/>
            <div className="pr-visit-main"><b>{it.branch.name}</b><div className="pr-reasons">{it.reasons.length ? it.reasons.map(r => <span key={r}>{r}</span>) : <span>متابعة دورية</span>}</div>{k > 0 && it.km !== null && <small><MapPin size={12}/> {fmtKm(it.km)} عن الفرع السابق</small>}</div>
            <Link href={`/inspection/new?branch=${encodeURIComponent(it.branch.id)}`} className="button button-primary pr-go">ابدأ <ArrowLeft size={15}/></Link>
          </li>)}</ul>
        </section>)}
    </>}
  </div>;
}

/** Compact "today" suggestion for the home screen. */
export function HomePriorityCard({ data }: { data: D }) {
  const plan = useMemo(() => planWeek(data, { perDay: 2, days: 1, geo }), [data.inspections, data.branches, data.actions]);
  const today = plan[0];
  if (!today || !today.items.length) return null;
  return <section className="surface-card pr-home"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="أولى بالزيارة اليوم اقتراح اليوم"/><div><span className="eyebrow">اقتراح اليوم</span><h2>أولى بالزيارة اليوم</h2></div></div><Link href="/priorities?tab=plan" className="text-link">خطة الأسبوع <ArrowLeft size={14}/></Link></div>
    <ul className="pr-list">{today.items.map(it => <li key={it.branch.id} className="pr-visit"><span className={`pr-pri ${it.priority >= 70 ? 'hi' : it.priority >= 40 ? 'mid' : 'lo'}`}/><div className="pr-visit-main"><b>{it.branch.name}</b><div className="pr-reasons">{it.reasons.slice(0, 2).map(r => <span key={r}>{r}</span>)}</div></div><Link href={`/inspection/new?branch=${encodeURIComponent(it.branch.id)}`} className="button button-primary pr-go">ابدأ <ArrowLeft size={15}/></Link></li>)}</ul>
  </section>;
}

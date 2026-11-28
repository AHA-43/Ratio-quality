import { useMemo, useState } from 'react';
import { HeadIcon } from './page-icons';
import { Link } from 'wouter';
import { ArrowLeft, CalendarCheck, Printer, TrendingDown, TrendingUp } from 'lucide-react';
import type { ActionItem, Branch, Inspection } from '../data';
import { CountUp } from './brand-motion';
import { audit, isQualityLead, saveConfig, useConfig, useProfile } from '../session';
import { cloudEnabled } from '../cloud';
import { DEFAULT_TARGET, standings } from './targets';
import { availableMonths, executiveSummary } from './insights';
import { monthLabel } from './monthly-report';

type D = { inspections: Inspection[]; branches: Branch[]; actions: ActionItem[] };
const CLS: [string, string][] = [['ممتاز', '#3f9b6a'], ['جيد', '#7584F7'], ['يحتاج تحسين', '#D9A441'], ['غير مقبول', '#E5584F']];
const monthName = (k: string) => new Date(`${k}-15`).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short' });

function Donut({ counts }: { counts: Record<string, number> }) {
  const total = CLS.reduce((a, [k]) => a + (counts[k] ?? 0), 0); const R = 52, C = 2 * Math.PI * R; let acc = 0;
  return <div className="ex-donut"><svg viewBox="0 0 140 140" role="img" aria-label="توزيع التصنيفات"><circle cx="70" cy="70" r={R} fill="none" stroke="#ebe8f7" strokeWidth="18"/>
    {total > 0 && CLS.map(([k, c]) => { const v = counts[k] ?? 0; if (!v) return null; const len = v / total * C; const el = <circle key={k} cx="70" cy="70" r={R} fill="none" stroke={c} strokeWidth="18" strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" style={{ animation: 'donut-in .9s var(--ease-out) both' }}/>; acc += len; return el; })}
    <text x="70" y="68" textAnchor="middle" fontSize="26" fontWeight="800" fill="#07014f">{total}</text><text x="70" y="88" textAnchor="middle" fontSize="10" fill="#55558a">زيارة</text></svg>
    <ul>{CLS.map(([k, c]) => <li key={k}><i style={{ background: c }}/><span>{k}</span><b>{counts[k] ?? 0}</b></li>)}</ul></div>;
}

function Trend({ data }: { data: { key: string; avg: number; n: number }[] }) {
  if (data.length < 2) return <p className="pr-empty">يلزم شهران على الأقل من الزيارات لعرض الاتجاه.</p>;
  const W = 320, H = 150, px = 26, top = 24, bot = 30; const lo = Math.max(0, Math.floor(Math.min(...data.map(d => d.avg)) / 10) * 10 - 5), hi = Math.min(100, Math.ceil(Math.max(...data.map(d => d.avg)) / 5) * 5 + 3);
  const x = (i: number) => W - px - i * ((W - px * 2) / (data.length - 1)); const y = (v: number) => top + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - top - bot);
  const pts = data.map((d, i) => [x(data.length - 1 - i), y(d.avg)] as const); const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a},${b}`).join(' ');
  return <svg className="ex-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="اتجاه متوسط الالتزام الشهري"><defs><linearGradient id="exg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7584F7" stopOpacity=".35"/><stop offset="1" stopColor="#7584F7" stopOpacity="0"/></linearGradient></defs>
    <path d={`${line} L${pts[pts.length - 1][0]},${H - bot} L${pts[0][0]},${H - bot} Z`} fill="url(#exg)"/>
    <path d={line} fill="none" stroke="#07014f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="ex-line"/>
    {pts.map(([a, b], i) => <g key={data[i].key}><circle cx={a} cy={b} r="4.5" fill="#fff" stroke="#07014f" strokeWidth="2.4"/><text x={a} y={b - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="#07014f">{Math.round(data[i].avg)}</text><text x={a} y={H - 10} textAnchor="middle" fontSize="10.5" fill="#55558a">{monthName(data[i].key)}</text></g>)}</svg>;
}

function TargetCard({ data }: { data: D }) {
  const cfg = useConfig(); const me = useProfile(); const lead = isQualityLead(me) || !cloudEnabled;
  const target = cfg.target ?? DEFAULT_TARGET;
  const st = useMemo(() => standings(data, target), [data.inspections, data.branches, target]);
  const [edit, setEdit] = useState(false); const [val, setVal] = useState(String(target));
  if (!st.total) return null;
  const pct = Math.round(st.met / st.total * 100);
  return <section className="surface-card ex-target">
    <div className="card-heading"><div><span className="eyebrow">هدف الالتزام</span><h2>{st.met} من {st.total} فرعاً حققت هدف <bdi>{target}%</bdi></h2></div>
      {lead && !edit && <button type="button" className="text-link no-print" onClick={() => { setVal(String(target)); setEdit(true); }}>تعديل الهدف</button>}</div>
    {edit && <div className="ex-target-edit no-print"><input type="number" min={50} max={100} value={val} onChange={e => setVal(e.target.value)} aria-label="الهدف %"/><button type="button" className="button button-primary" onClick={async () => { const n = Math.round(Number(val)); if (n >= 50 && n <= 100) { await saveConfig({ target: n }); setEdit(false); } }}>حفظ</button><button type="button" className="button button-outline" onClick={() => setEdit(false)}>إلغاء</button></div>}
    <div className="ex-target-bar"><i style={{ width: `${Math.max(2, pct)}%` }}/></div>
    <small className="small-muted">حسب آخر زيارة مقيّمة لكل فرع · {pct}% من الفروع المزارة</small>
    {st.below.length > 0 && <ul className="ex-target-list">{st.below.slice(0, 6).map(r => <li key={r.branch.id}><Link href={`/branches/${r.branch.id}`}><b>{r.branch.name}</b><span><bdi>{Math.round(r.score)}%</bdi> <em>−{Math.round(r.gap)}</em></span></Link></li>)}</ul>}
  </section>;
}

/** Home reminder for quality leads in the first days of a month: last month's report is ready. */
export function HomeMonthlyCard({ data }: { data: D }) {
  const me = useProfile(); const lead = isQualityLead(me) || !cloudEnabled;
  const now = new Date(); const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const ym = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  const key = `rq-monthly-seen-${ym}`;
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  const [busy, setBusy] = useState(false);
  const has = useMemo(() => data.inspections.some(i => i.status === 'finalized' && i.date.startsWith(ym)), [data.inspections, ym]);
  if (!lead || hidden || now.getDate() > 10 || !has) return null;
  const hide = () => { try { localStorage.setItem(key, '1'); } catch { /* ignore */ } setHidden(true); };
  const make = async () => { setBusy(true); try { const [{ exportMonthlyReport }, { deliver }] = await Promise.all([import('./monthly-report'), import('./exports')]); const out = await exportMonthlyReport(data, ym); await deliver(out.blob, out.name, 'share' in navigator); audit('report.monthly.export', 'reports', ym, { from: 'home' }); hide(); } catch (e) { console.error(e); } setBusy(false); };
  return <section className="surface-card home-monthly"><span className="hm-ico"><CalendarCheck size={20}/></span><div><b>التقرير الشهري لـ{monthLabel(ym)} جاهز</b><small>عرض PowerPoint للإدارة بضغطة واحدة</small></div>
    <button type="button" className="button button-primary" disabled={busy} onClick={make}>{busy ? 'جارٍ التجهيز…' : 'تجهيز التقرير'}</button><button type="button" className="hm-x" onClick={hide} aria-label="إخفاء">×</button></section>;
}

export function ExecutivePage({ data }: { data: D }) {
  const [days, setDays] = useState(90);
  const s = useMemo(() => executiveSummary(data, days), [data.inspections, data.branches, data.actions, days]);
  const months = useMemo(() => availableMonths(data.inspections), [data.inspections]);
  const [month, setMonth] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const ym = month || months[0] || '';
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const makeMonthly = async (share: boolean) => {
    if (!ym) return; setBusy(true); setErr('');
    try { const [{ exportMonthlyReport }, { deliver }] = await Promise.all([import('./monthly-report'), import('./exports')]); const out = await exportMonthlyReport(data, ym); await deliver(out.blob, out.name, share); audit('report.monthly.export', 'reports', ym, { share }); }
    catch (e) { console.error(e); setErr('تعذّر إنشاء التقرير. حاول مرة أخرى.'); } setBusy(false);
  };
  const tone = s.avg === null ? 'navy' : s.avg >= 90 ? 'good' : s.avg >= 80 ? 'ok' : s.avg >= 70 ? 'warn' : 'bad';
  return <div className="page-content ex-page">
    <div className="page-title"><div className="pt-wrap"><HeadIcon text="لوحة الإدارة" size={22}/><div><span className="eyebrow">نظرة تنفيذية</span><h1>لوحة الإدارة</h1><p>خلاصة أداء الجودة في الفروع، جاهزة للعرض والطباعة.</p></div></div><button type="button" className="button button-outline no-print" disabled={busy} onClick={async () => { setBusy(true); try { const el = document.querySelector<HTMLElement>('.ex-page'); const [{ elementToPdf }, { deliver }] = await Promise.all([import('./pdf-export'), import('./exports')]); if (el) await deliver(await elementToPdf(el, { wrapperClass: 'page-content ex-page', width: 900 }), `Ratio-executive-${new Date().toISOString().slice(0, 10)}.pdf`, typeof navigator !== 'undefined' && 'share' in navigator); } catch (e) { console.error(e); setErr('تعذّر إنشاء PDF.'); } setBusy(false); }}><Printer size={16}/> {busy ? 'جارٍ التجهيز…' : 'PDF'}</button></div>
    <div className="pr-tabs no-print ex-range" role="tablist">{[[30, 'آخر 30 يوماً'], [90, 'آخر 90 يوماً'], [365, 'آخر سنة']].map(([d, l]) => <button key={d} role="tab" aria-selected={days === d} className={days === d ? 'on' : ''} onClick={() => setDays(d as number)}>{l}</button>)}</div>

    <section className={`ex-hero tone-${tone}`}>
      <div className="ex-hero-main"><small>متوسط الالتزام</small><strong><CountUp to={s.avg} suffix="%" duration={1300}/></strong>
        {s.delta !== null && <span className={`ex-delta ${s.delta >= 0 ? 'up' : 'down'}`}>{s.delta >= 0 ? <TrendingUp size={15}/> : <TrendingDown size={15}/>}{s.delta >= 0 ? '+' : ''}{s.delta} عن الفترة السابقة</span>}</div>
      <ul className="ex-hero-facts"><li><b>{s.visits}</b><span>زيارة مكتملة</span></li><li><b>{s.branchesVisited}<small>/{s.branchesTotal}</small></b><span>فرع تمت زيارته</span></li><li><b>{s.criticalFailures}</b><span>إخفاق حرج</span></li></ul>
    </section>

    <section className="surface-card ex-brief"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="الخلاصة للإدارة ملخص مكتوب تلقائياً"/><div><span className="eyebrow">ملخص مكتوب تلقائياً</span><h2>الخلاصة للإدارة</h2></div></div></div><ul>{s.narrative.map((t, i) => <li key={i}>{t}</li>)}</ul></section>

    <TargetCard data={data}/>
    <section className="surface-card ex-monthly no-print"><div><span className="eyebrow">جاهز للإرسال للإدارة</span><h2>التقرير الشهري</h2><p>عرض PowerPoint من 8 شرائح: الخلاصة، التصنيفات، الاتجاه، الأقسام، الفروع، أكثر البنود فشلاً، الإجراءات، والتوصيات.</p></div>
      {months.length ? <div className="ex-monthly-act"><label className="field"><span>الشهر</span><select value={ym} onChange={e => setMonth(e.target.value)} data-testid="select-month">{months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
        <button type="button" className="button button-primary" disabled={busy} onClick={() => makeMonthly(false)} data-testid="button-monthly">{busy ? 'جارٍ الإنشاء…' : 'تنزيل التقرير'}</button>{canShare && <button type="button" className="button button-soft" disabled={busy} onClick={() => makeMonthly(true)}>مشاركة</button>}</div> : <p className="pr-empty">يظهر هنا بعد اعتماد أول زيارة.</p>}
      {err && <small className="form-error">{err}</small>}</section>

    <div className="ex-kpis">
      <div className="ex-kpi"><span>تغطية الزيارات</span><b>{s.coveragePct}%</b><i><em style={{ width: `${s.coveragePct}%` }}/></i></div>
      <div className="ex-kpi"><span>إغلاق الإجراءات</span><b>{s.actionsClosedPct ?? '—'}{s.actionsClosedPct !== null && '%'}</b><i><em style={{ width: `${s.actionsClosedPct ?? 0}%` }} className="g"/></i></div>
      <div className="ex-kpi"><span>متوسط زمن الإغلاق</span><b>{s.avgCloseDays ?? '—'}{s.avgCloseDays !== null && <small> يوم</small>}</b></div>
      <div className="ex-kpi"><span>إجراءات متأخرة</span><b className={s.overdue ? 'bad' : ''}>{s.overdue}</b></div>
    </div>

    <div className="pr-two">
      <section className="surface-card pr-card"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="التصنيفات توزيع نتائج الزيارات"/><div><span className="eyebrow">توزيع نتائج الزيارات</span><h2>التصنيفات</h2></div></div></div><Donut counts={s.classCounts}/></section>
      <section className="surface-card pr-card"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="اتجاه الأداء آخر 6 أشهر"/><div><span className="eyebrow">آخر 6 أشهر</span><h2>اتجاه الأداء</h2></div></div></div><Trend data={s.monthly}/></section>
    </div>

    <section className="surface-card pr-card"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="الأداء حسب القسم متوسط الفترة"/><div><span className="eyebrow">متوسط الفترة</span><h2>الأداء حسب القسم</h2></div></div></div>
      {s.sections.length ? <ul className="ex-bars">{s.sections.map(x => <li key={x.name}><span>{x.name}</span><i><em className={x.avg < 70 ? 'bad' : x.avg < 80 ? 'warn' : ''} style={{ width: `${x.avg}%` }}/></i><b>{x.avg}%</b></li>)}</ul> : <p className="pr-empty">لا توجد بيانات كافية.</p>}</section>

    <div className="pr-two">
      <section className="surface-card pr-card"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="الأفضل أداءً آخر نتيجة لكل فرع"/><div><span className="eyebrow">آخر نتيجة لكل فرع</span><h2>الأفضل أداءً</h2></div></div></div>
        {s.best.length ? <ol className="ex-rank">{s.best.map((x, i) => <li key={x.branch.id}><Link href={`/branches/${x.branch.id}`}><span className="n">{i + 1}</span><b>{x.branch.name}</b><em className="good">{Math.round(x.score)}%</em></Link></li>)}</ol> : <p className="pr-empty">لا توجد بيانات.</p>}</section>
      <section className="surface-card pr-card"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="الأقل أداءً تحتاج متابعة"/><div><span className="eyebrow">تحتاج متابعة</span><h2>الأقل أداءً</h2></div></div><Link href="/priorities" className="text-link no-print">الأولويات <ArrowLeft size={14}/></Link></div>
        {s.worst.length ? <ol className="ex-rank">{s.worst.map((x, i) => <li key={x.branch.id}><Link href={`/branches/${x.branch.id}`}><span className="n low">{i + 1}</span><b>{x.branch.name}</b><em className={x.score < 70 ? 'bad' : 'warn'}>{Math.round(x.score)}%</em></Link></li>)}</ol> : <p className="pr-empty">لا توجد بيانات.</p>}</section>
    </div>
  </div>;
}

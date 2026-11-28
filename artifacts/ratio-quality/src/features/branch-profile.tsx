// Full branch file: facade photo, result curve against the target, recurring problems (checklist + past
// reports), open actions with the branch's proof, visit history, and the branch's exact location.
import { useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { ArrowRight, Camera, CheckCircle2, Clock3, GitCompareArrows, History, LocateFixed, MapPin, Navigation, Play, Store, Target, TrendingDown, TrendingUp, UserRound } from 'lucide-react';
import type { ActionItem, Branch, Inspection } from '../data';
import { put } from '../data';
import { calculateScore } from '../scoring';
import { audit, getConfigTarget, isQualityLead, useProfile } from '../session';
import { cloudEnabled } from '../cloud';
import { branchPos, parseCoords, registerBranchCoords } from './geo';
import { isOverdue } from './overdue';
import { MediaImg } from './media';
import { HeadIcon } from './page-icons';
import { themesOf } from './themes';

type D = { inspections: Inspection[]; branches: Branch[]; actions: ActionItem[]; refresh: () => Promise<void> };
const SEV: Record<string, string> = { Critical: 'حرج', Major: 'رئيسي', Minor: 'ثانوي' };
const tone = (v: number | null) => v == null ? 'none' : v >= 90 ? 'good' : v >= 80 ? 'ok' : v >= 70 ? 'warn' : 'bad';
const dshort = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'short' });
const failed = (i: Inspection, id: number) => { const a = i.answers[id]; return Boolean(a && (a.value === 'fail' || a.initialValue === 'fail')); };

export default function BranchProfile({ data }: { data: D }) {
  const [, params] = useRoute('/branches/:id');
  const me = useProfile(); const lead = isQualityLead(me) || !cloudEnabled;
  const b = data.branches.find(x => x.id === params?.id);
  const done = useMemo(() => data.inspections.filter(i => b && i.branchId === b.id && i.status === 'finalized' && !i.training).sort((x, y) => x.date.localeCompare(y.date)), [data.inspections, b?.id]);
  if (!b) return <div className="page-content"><Link href="/branches" className="back-link"><ArrowRight size={16}/> الفروع</Link><p>الفرع غير موجود.</p></div>;

  const rows = done.map(i => ({ i, s: i.imported ? { score: null as number | null, classification: i.imported.classification ?? null } : calculateScore(i.questionSnapshot, i.answers) }));
  const scored = rows.filter(r => r.s.score != null);
  const last = scored.at(-1), prev = scored.at(-2);
  const delta = last && prev ? +(last.s.score! - prev.s.score!).toFixed(1) : null;
  const target = getConfigTarget();
  const open = data.actions.filter(a => a.status !== 'مغلق' && (a.branchId === b.id || a.branchName === b.name));
  const themes = themesOf(done).slice(0, 5); const maxTheme = Math.max(1, ...themes.map(t => t.count));
  const freq = Object.values(done.filter(i => !i.imported).flatMap(i => i.questionSnapshot.filter(q => failed(i, q.id))).reduce<Record<number, { id: number; title: string; n: number }>>((m, q) => { (m[q.id] ??= { id: q.id, title: q.title, n: 0 }).n++; return m; }, {})).sort((x, y) => y.n - x.n).slice(0, 5);
  const facadeVisit = [...done].reverse().find(i => i.facade?.id);
  const cls = last?.s.classification ?? rows.at(-1)?.s.classification ?? null;
  const gap = last ? +(target - last.s.score!).toFixed(1) : null;

  return <div className="page-content bprof">
    <Link href="/branches" className="back-link"><ArrowRight size={16}/> الفروع</Link>
    <section className={`bp-hero2 ${facadeVisit ? 'has-photo' : ''}`}>
      {facadeVisit?.facade && <MediaImg att={facadeVisit.facade} alt={`واجهة ${b.name}`} className="bp-hero2-img"/>}
      <div className="bp-hero2-shade"/>
      <div className="bp-hero2-txt">
        <small>{b.code ?? 'فرع'}{b.city ? ` · ${b.city}` : ''}</small>
        <h1>{b.name}</h1>
        <div className="bp-hero2-chips">
          {cls && <span className={`chip tone-${tone(last?.s.score ?? null)}`}>{cls}</span>}
          {gap != null && <span className={`chip ${gap <= 0 ? 'good' : 'warn'}`}><Target size={12}/> {gap <= 0 ? `حقق الهدف ${target}%` : `يبعد ${Math.round(gap)} نقطة عن الهدف`}</span>}
          {b.manager && <span className="chip"><UserRound size={12}/> {b.manager}</span>}
        </div>
      </div>
      {!facadeVisit && <span className="bp-hero2-ph"><Store size={34}/></span>}
    </section>

    <div className="kpi-grid">
      <div className="surface-card kpi"><small>آخر نتيجة</small><b>{last?.s.score ?? '—'}{last ? '%' : ''}</b>{delta != null && <span className={`trend ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? <TrendingUp size={13}/> : <TrendingDown size={13}/>} {delta >= 0 ? '+' : ''}{delta}</span>}</div>
      <div className="surface-card kpi"><small>زيارات مكتملة</small><b>{done.length}</b>{done.at(-1) && <span className="trend">آخرها {dshort(done.at(-1)!.date)}</span>}</div>
      <div className="surface-card kpi"><small>إجراءات مفتوحة</small><b>{open.length}</b>{open.some(isOverdue) && <span className="trend down">{open.filter(isOverdue).length} متأخر</span>}</div>
      <div className="surface-card kpi"><small>مرات تحقيق الهدف</small><b>{scored.filter(r => r.s.score! >= target).length}<small>/{scored.length}</small></b></div>
    </div>

    <section className="surface-card bprof-card">
      <div className="card-heading"><div className="ch-wrap"><HeadIcon text="اتجاه النتيجة"/><div><span className="eyebrow">عبر الزيارات</span><h2>اتجاه النتيجة</h2></div></div></div>
      <Curve pts={scored.slice(-10)} target={target}/>
    </section>

    {themes.length > 0 && <section className="surface-card bprof-card">
      <div className="card-heading"><div className="ch-wrap"><HeadIcon text="المواضيع"/><div><span className="eyebrow">من كل التقارير بما فيها السابقة</span><h2>المواضيع المتكررة</h2></div></div></div>
      <ul className="pr-themes">{themes.map(t => <li key={t.name}><div className="th-top"><b>{t.name}</b><span className="th-n">{t.count}<small> ملاحظة</small></span></div><div className="pr-bar"><i style={{ width: `${Math.max(4, t.count / maxTheme * 100)}%` }} className={t.critical ? 'crit' : ''}/></div><small>{t.critical ? <em className="th-crit">{t.critical} حرجة</em> : null}في {t.reports} زيارة</small></li>)}</ul>
      {freq.length > 0 && <div className="bprof-freq"><small>أكثر بنود النموذج تكراراً:</small>{freq.map(f => <span key={f.id}>#{f.id} {f.title} <b>×{f.n}</b></span>)}</div>}
    </section>}

    <section className="surface-card bprof-card">
      <div className="card-heading"><div className="ch-wrap"><HeadIcon text="الإجراءات"/><div><span className="eyebrow">تحسين مستمر</span><h2>الإجراءات المفتوحة</h2></div></div>{open.length > 0 && <Link href="/actions" className="text-link">الكل</Link>}</div>
      {open.length ? <ul className="bprof-actions">{open.slice(0, 6).map(a => <li key={a.id} className={isOverdue(a) ? 'late' : ''}>
        <span className={`severity-tag ${a.severity.toLowerCase()}`}>{SEV[a.severity]}</span><b>{a.title.replace(/ — .*$/, '')}</b>
        <small>{a.status === 'بانتظار التحقق' ? <><Camera size={12}/> رد الفرع بانتظار تحققكم</> : isOverdue(a) ? <><Clock3 size={12}/> متأخر · {a.dueDate}</> : <>{a.status} · {a.dueDate || '—'}</>}</small>
      </li>)}</ul> : <p className="pr-empty"><CheckCircle2 size={16}/> لا توجد إجراءات مفتوحة لهذا الفرع.</p>}
    </section>

    <section className="surface-card bprof-card">
      <div className="card-heading"><div className="ch-wrap"><HeadIcon icon={History}/><div><span className="eyebrow">سجل</span><h2>الزيارات</h2></div></div></div>
      {rows.length ? <ul className="bprof-visits">{[...rows].reverse().map(({ i, s }) => <li key={i.id}><Link href={`/reports/${i.id}`}>
        <span className={`hb-score ${tone(s.score)}`}>{s.score != null ? Math.round(s.score) : '—'}</span>
        <span className="hb-name"><b>{i.date.slice(0, 10)} · {i.type}</b><small>{i.inspector}{i.imported ? ' · تقرير سابق' : ''}{s.classification ? ` · ${s.classification}` : ''}</small></span></Link></li>)}</ul> : <p className="pr-empty">لم يُزر هذا الفرع بعد.</p>}
    </section>

    <LocationCard b={b} lead={lead} onSaved={data.refresh}/>

    <div className="bprof-cta">
      <Link href={`/inspection/new?branch=${encodeURIComponent(b.id)}`} className="button button-primary"><Play size={16}/> بدء زيارة لهذا الفرع</Link>
      <Link href={`/compare?a=${encodeURIComponent(b.id)}`} className="button button-outline"><GitCompareArrows size={16}/> مقارنة</Link>
    </div>
  </div>;
}

/** Result curve: dots coloured by class, dashed target line, first and last dates. */
function Curve({ pts, target }: { pts: { i: Inspection; s: { score: number | null } }[]; target: number }) {
  if (!pts.length) return <p className="pr-empty">لا توجد نتائج مقيّمة بعد.</p>;
  const W = 340, H = 140, pl = 14, pr = 14, pt = 18, pb = 26;
  const vals = pts.map(p => p.s.score!); const lo = Math.max(0, Math.floor(Math.min(...vals, target) / 10) * 10 - 10), hi = 100;
  const x = (k: number) => pts.length === 1 ? W / 2 : pl + k * (W - pl - pr) / (pts.length - 1);
  const y = (v: number) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const path = pts.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(p.s.score!).toFixed(1)}`).join(' ');
  const col = (v: number) => v >= 90 ? '#2e8b57' : v >= 80 ? '#4f5fe0' : v >= 70 ? '#c9962e' : '#c43b32';
  return <svg viewBox={`0 0 ${W} ${H}`} className="bprof-curve" role="img" aria-label="اتجاه النتيجة عبر الزيارات">
    <line x1={pl} x2={W - pr} y1={y(target)} y2={y(target)} className="tgt"/><text x={pl} y={y(target) - 5} className="tgt-t" textAnchor="start">الهدف {target}%</text>
    {pts.length > 1 && <path d={`${path} L${x(pts.length - 1)},${H - pb} L${x(0)},${H - pb} Z`} className="area"/>}
    {pts.length > 1 && <path d={path} className="line"/>}
    {pts.map((p, k) => <g key={p.i.id}><circle cx={x(k)} cy={y(p.s.score!)} r="5.5" fill="#fff" stroke={col(p.s.score!)} strokeWidth="3" className="pt" style={{ animationDelay: `${k * 60}ms` }}/>
      {(k === pts.length - 1 || pts.length <= 5) && <text x={x(k)} y={y(p.s.score!) - 10} textAnchor="middle" className="pv">{Math.round(p.s.score!)}</text>}</g>)}
    <text x={x(0)} y={H - 8} className="pd" textAnchor={pts.length === 1 ? 'middle' : 'start'}>{dshort(pts[0].i.date)}</text>
    {pts.length > 1 && <text x={x(pts.length - 1)} y={H - 8} className="pd" textAnchor="end">{dshort(pts.at(-1)!.i.date)}</text>}
  </svg>;
}

/** Exact branch location: shows how precise it is, and lets quality leads fix it (GPS at the branch or a pasted link). */
function LocationCard({ b, lead, onSaved }: { b: Branch; lead: boolean; onSaved: () => Promise<void> }) {
  const pos = branchPos(b.id, b.name);
  const [text, setText] = useState(''); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [busy, setBusy] = useState(false);
  const save = async (lat: number, lng: number, how: string) => {
    setBusy(true);
    try { await put('branches', { ...b, lat: +lat.toFixed(6), lng: +lng.toFixed(6), updatedAt: new Date().toISOString() }); await audit('branch.location', 'branches', b.id, { lat, lng, how }); await onSaved(); setMsg({ ok: true, t: 'تم حفظ الموقع الدقيق للفرع.' }); setText(''); }
    catch { setMsg({ ok: false, t: 'تعذّر الحفظ. تأكد من الاتصال وحاول مرة أخرى.' }); }
    setBusy(false);
  };
  const fromText = () => {
    const c = parseCoords(text);
    if (c) { save(c.lat, c.lng, 'link'); return; }
    setMsg({ ok: false, t: /goo\.gl|maps\.app/.test(text) ? 'هذا رابط مختصر. افتحه في المتصفح، ثم انسخ الرابط الكامل من شريط العنوان والصقه هنا.' : 'لم أجد إحداثيات في النص. الصق رابط قوقل ماب الكامل أو الإحداثيات مثل: 25.3829, 49.5866' });
  };
  const fromGps = () => {
    if (!navigator.geolocation) { setMsg({ ok: false, t: 'الجهاز لا يدعم تحديد الموقع.' }); return; }
    setBusy(true); setMsg(null);
    navigator.geolocation.getCurrentPosition(p => { setBusy(false); if (p.coords.accuracy > 80) { setMsg({ ok: false, t: `دقة الموقع الحالية ضعيفة (${Math.round(p.coords.accuracy)} م). اقترب من واجهة الفرع أو انتظر قليلاً وأعد المحاولة.` }); return; } save(p.coords.latitude, p.coords.longitude, 'gps'); },
      () => { setBusy(false); setMsg({ ok: false, t: 'لم نتمكن من معرفة موقعك. اسمح للمتصفح بالوصول للموقع.' }); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };
  return <section className="surface-card bprof-card bprof-loc">
    <div className="card-heading"><div className="ch-wrap"><HeadIcon icon={MapPin}/><div><span className="eyebrow">الخريطة</span><h2>موقع الفرع</h2></div></div>
      <span className={`loc-state ${pos?.exact ? 'ok' : 'approx'}`}>{pos?.exact ? 'موقع دقيق' : 'موقع تقريبي'}</span></div>
    {pos ? <a className="loc-open" href={`https://www.google.com/maps?q=${pos.lat},${pos.lng}`} target="_blank" rel="noopener noreferrer"><Navigation size={16}/> افتح في الخريطة<small dir="ltr">{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</small></a> : <p className="pr-empty">لا يوجد موقع لهذا الفرع بعد.</p>}
    {!pos?.exact && <p className="small-muted">هذا الفرع يظهر بالقرب من وسط مدينته لأن موقعه الدقيق غير مسجّل.{lead ? ' سجّله من هنا:' : ' يمكن لمدير الجودة تسجيله.'}</p>}
    {lead && <div className="loc-edit">
      <button type="button" className="button button-soft" onClick={fromGps} disabled={busy}><LocateFixed size={16}/> {pos?.exact ? 'حدّث' : 'سجّل'} الموقع من جوالي (وأنا عند الفرع)</button>
      <div className="loc-paste"><input value={text} onChange={e => setText(e.target.value)} placeholder="الصق رابط قوقل ماب أو الإحداثيات" dir="ltr" inputMode="url" aria-label="رابط الموقع"/><button type="button" className="button button-primary" onClick={fromText} disabled={busy || !text.trim()}>حفظ</button></div>
      {msg && <small className={msg.ok ? 'form-ok' : 'form-error'}>{msg.t}</small>}
    </div>}
  </section>;
}

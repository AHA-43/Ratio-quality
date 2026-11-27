// Branch-manager portal: the branch sees its approved visit reports and answers its corrective actions
// with a proof photo; the quality team then verifies and closes them. Reads only what the rules allow.
import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { Camera, CheckCircle2, ChevronLeft, Clock3, FileText, LogOut, Store, X } from 'lucide-react';
import { auth, fs, signOutUser } from '../cloud';
import type { ActionItem, Attachment, Inspection } from '../data';
import { calculateScore } from '../scoring';
import { audit, useProfile } from '../session';
import { compressPhoto } from './facade';
import { MediaImg } from './media';
import { sessionGreeting } from './greeting';

const SEV_AR: Record<string, string> = { Critical: 'حرج', Major: 'رئيسي', Minor: 'ثانوي' };
const today = () => new Date().toISOString().slice(0, 10);
const overdue = (a: ActionItem) => a.status !== 'مغلق' && a.status !== 'بانتظار التحقق' && Boolean(a.dueDate) && a.dueDate < today();
const failed = (i: Inspection, id: number) => { const a = i.answers?.[id]; return Boolean(a && (a.value === 'fail' || a.initialValue === 'fail')); };

export default function BranchPortal() {
  const me = useProfile();
  const ids = me?.branchIds ?? [];
  const [reports, setReports] = useState<Inspection[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [branch, setBranch] = useState(ids[0] ?? '');
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [open, setOpen] = useState<Inspection | null>(null);
  const [tab, setTab] = useState<'actions' | 'reports'>('actions');

  const load = async () => {
    if (!fs || !ids.length) { setState('ok'); return; }
    try {
      const r: Inspection[] = [], a: ActionItem[] = [];
      for (const b of ids) {
        const [rs, as] = await Promise.all([
          getDocs(query(collection(fs, 'inspections'), where('branchId', '==', b), where('workflow', '==', 'approved'))),
          getDocs(query(collection(fs, 'actions'), where('branchId', '==', b))),
        ]);
        rs.forEach(d => r.push({ ...(d.data() as Inspection), id: d.id }));
        as.forEach(d => a.push({ ...(d.data() as ActionItem), id: d.id }));
      }
      setReports(r.sort((x, y) => y.date.localeCompare(x.date))); setActions(a); setState('ok');
    } catch { setState('error'); }
  };
  useEffect(() => { load(); const t = window.setInterval(load, 60000); return () => window.clearInterval(t); /* eslint-disable-next-line */ }, [ids.join(',')]);

  const mine = useMemo(() => ({
    reports: reports.filter(r => !branch || r.branchId === branch),
    actions: actions.filter(a => !branch || a.branchId === branch).sort((x, y) => (x.status === 'مغلق' ? 1 : 0) - (y.status === 'مغلق' ? 1 : 0) || (x.dueDate || '').localeCompare(y.dueDate || '')),
  }), [reports, actions, branch]);
  const branchName = mine.reports[0]?.branchName ?? mine.actions[0]?.branchName ?? '';
  const todo = mine.actions.filter(a => a.status !== 'مغلق' && a.status !== 'بانتظار التحقق');
  const waiting = mine.actions.filter(a => a.status === 'بانتظار التحقق');
  const closed = mine.actions.filter(a => a.status === 'مغلق');
  const last = mine.reports[0]; const lastScore = last ? (last.imported ? null : calculateScore(last.questionSnapshot, last.answers).score) : null;

  return <div className="bp" dir="rtl">
    <header className="bp-top">
      <img src="/brand/logo-ar-white.png" alt="ريشيو"/>
      <button type="button" className="bp-out" onClick={() => signOutUser()}><LogOut size={16}/> خروج</button>
    </header>
    <section className="bp-hero">
      <small>بوابة الفرع</small>
      <h1>{sessionGreeting(me?.name)}</h1>
      {ids.length > 1 ? <select className="bp-branch" value={branch} onChange={e => setBranch(e.target.value)}>{ids.map(b => <option key={b} value={b}>{reports.find(r => r.branchId === b)?.branchName ?? actions.find(a => a.branchId === b)?.branchName ?? b}</option>)}</select> : <p className="bp-bname"><Store size={16}/> {branchName || (ids[0] ?? '—')}</p>}
      <div className="bp-kpis">
        <div className={todo.length ? 'warn' : 'ok'}><b>{todo.length}</b><span>مطلوب منكم</span></div>
        <div><b>{waiting.length}</b><span>بانتظار التحقق</span></div>
        <div className="ok"><b>{closed.length}</b><span>مُغلق</span></div>
        <div><b>{lastScore === null ? '—' : `${lastScore}%`}</b><span>آخر زيارة</span></div>
      </div>
    </section>
    {!ids.length && <div className="bp-empty">لم يُربط حسابك بأي فرع بعد. تواصل مع إدارة الجودة.</div>}
    {state === 'error' && <div className="bp-empty err">تعذّر تحميل البيانات. تأكد من الاتصال ثم أعد المحاولة. <button type="button" onClick={load}>إعادة المحاولة</button></div>}
    <div className="bp-tabs" role="tablist"><button role="tab" aria-selected={tab === 'actions'} className={tab === 'actions' ? 'on' : ''} onClick={() => setTab('actions')}>الإجراءات التصحيحية{todo.length ? <em>{todo.length}</em> : null}</button><button role="tab" aria-selected={tab === 'reports'} className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>تقارير الزيارات</button></div>
    {state === 'loading' && <div className="skeleton-list"><i/><i/><i/></div>}
    {state !== 'loading' && tab === 'actions' && <div className="bp-list">
      {!mine.actions.length && <div className="bp-empty">لا توجد إجراءات تصحيحية لفرعكم. أحسنتم 👏</div>}
      {mine.actions.map(a => <ActionCard key={a.id} a={a} onDone={next => setActions(list => list.map(x => x.id === next.id ? next : x))}/>)}
    </div>}
    {state !== 'loading' && tab === 'reports' && <div className="bp-list">
      {!mine.reports.length && <div className="bp-empty">لا توجد تقارير معتمدة بعد.</div>}
      {mine.reports.map(r => { const s = r.imported ? null : calculateScore(r.questionSnapshot, r.answers); const cls = r.imported?.classification ?? s?.classification ?? ''; return <button key={r.id} type="button" className="bp-report" onClick={() => setOpen(r)}>
        <span className="bp-r-ico"><FileText size={18}/></span><span className="bp-r-txt"><b>{r.type}</b><small>{r.date.slice(0, 10)} · {r.inspector}</small></span>
        <span className="bp-r-score"><b>{s?.score != null ? `${s.score}%` : '—'}</b><small>{cls}</small></span><ChevronLeft size={16}/></button>; })}
    </div>}
    {open && <ReportSheet r={open} onClose={() => setOpen(null)}/>}
  </div>;
}

function ActionCard({ a, onDone }: { a: ActionItem; onDone: (a: ActionItem) => void }) {
  const me = useProfile();
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState(a.managerNote ?? '');
  const [photo, setPhoto] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const canAnswer = a.status !== 'مغلق' && a.status !== 'بانتظار التحقق';
  const pick = async (f?: File) => { if (!f) return; setErr(''); setPhoto({ id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: f.name, type: 'image/jpeg', data: await compressPhoto(f), caption: 'إثبات التصحيح' }); };
  const send = async () => {
    if (!fs || !auth?.currentUser) return;
    if (!photo) { setErr('أرفق صورة توضح التصحيح.'); return; }
    setBusy(true); setErr('');
    try {
      await setDoc(doc(fs, 'photos', photo.id), { inspectionId: a.inspectionId ?? '', questionId: Number(a.questionId ?? 0), actionId: a.id, data: photo.data, uid: auth.currentUser.uid, at: new Date().toISOString() });
      const ev = [...(a.evidence ?? []).map(x => ({ ...x, data: '' })), { ...photo, data: '', storagePath: `photos/${photo.id}` }];
      const at = new Date().toISOString();
      const history = [...(a.history ?? []), { status: 'بانتظار التحقق', at, by: me?.name || me?.email || 'مدير الفرع', note: note.trim() || 'تم التصحيح من الفرع' }];
      await updateDoc(doc(fs, 'actions', a.id), { status: 'بانتظار التحقق', evidence: ev, history, managerNote: note.trim(), updatedAt: at });
      audit('action.branch-answer', 'actions', a.id, {});
      onDone({ ...a, status: 'بانتظار التحقق', evidence: ev, history, managerNote: note.trim(), updatedAt: at } as ActionItem);
      setPhoto(null);
    } catch { setErr('تعذّر الإرسال. تأكد من الاتصال وحاول مرة أخرى.'); }
    setBusy(false);
  };
  return <article className={`bp-action ${a.status === 'مغلق' ? 'closed' : a.status === 'بانتظار التحقق' ? 'waiting' : overdue(a) ? 'late' : ''}`}>
    <div className="bp-a-head"><span className={`severity-tag ${a.severity.toLowerCase()}`}>{SEV_AR[a.severity]}</span>
      <span className="bp-a-state">{a.status === 'مغلق' ? <><CheckCircle2 size={14}/> مُغلق</> : a.status === 'بانتظار التحقق' ? <><Clock3 size={14}/> بانتظار تحقق الجودة</> : overdue(a) ? `متأخر · ${a.dueDate}` : `الاستحقاق ${a.dueDate || '—'}`}</span></div>
    <h3>{a.title.replace(/ — .*$/, '')}</h3>
    {a.description && <p>{a.description}</p>}
    {a.recommendation && <p className="bp-a-rec"><b>المطلوب:</b> {a.recommendation}</p>}
    {Boolean(a.evidence?.length) && <div className="bp-ev">{a.evidence!.map(e => <MediaImg key={e.id} att={e} alt="إثبات"/>)}</div>}
    {a.managerNote && !canAnswer && <small className="bp-note">ملاحظتكم: {a.managerNote}</small>}
    {canAnswer && <div className="bp-answer">
      {photo ? <div className="bp-pick has"><img src={photo.data} alt="صورة الإثبات"/><button type="button" onClick={() => setPhoto(null)} aria-label="حذف"><X size={16}/></button></div>
        : <button type="button" className="bp-pick" onClick={() => input.current?.click()}><Camera size={20}/> صوّر الإثبات بعد التصحيح</button>}
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={e => { pick(e.target.files?.[0]); e.currentTarget.value = ''; }}/>
      <textarea rows={2} placeholder="ملاحظة قصيرة (اختياري): ماذا تم؟" value={note} onChange={e => setNote(e.target.value)}/>
      {err && <small className="form-error">{err}</small>}
      <button type="button" className="button button-primary" disabled={busy} onClick={send}>{busy ? 'جارٍ الإرسال…' : 'تم التصحيح — أرسل للتحقق'}</button>
    </div>}
  </article>;
}

function ReportSheet({ r, onClose }: { r: Inspection; onClose: () => void }) {
  const s = r.imported ? null : calculateScore(r.questionSnapshot, r.answers);
  const findings = r.questionSnapshot.filter(q => failed(r, q.id));
  const ref = useRef<HTMLDivElement>(null); const [busy, setBusy] = useState(false);
  const pdf = async () => {
    if (!ref.current) return; setBusy(true);
    try { const { elementToPdf } = await import('./pdf-export'); const { deliver } = await import('./exports'); await deliver(await elementToPdf(ref.current, { wrapperClass: 'bp-pdf', footer: `ريشيو · تقرير زيارة · ${r.branchName} · ${r.date.slice(0, 10)}` }), `Ratio-${r.branchName}-${r.date.slice(0, 10)}.pdf`, 'share' in navigator); } finally { setBusy(false); }
  };
  return <div className="bp-sheet" role="dialog" aria-label="تقرير الزيارة">
    <div className="bp-sheet-bar"><button type="button" onClick={onClose}><X size={18}/> إغلاق</button><button type="button" onClick={pdf} disabled={busy}><FileText size={16}/> {busy ? 'جارٍ التجهيز…' : 'PDF'}</button></div>
    <div ref={ref} className="bp-sheet-body">
      {r.facade?.id && <figure className="report-facade"><MediaImg att={r.facade} alt={r.branchName}/><figcaption>{r.branchName}</figcaption></figure>}
      <header className="bp-s-head"><small>تقرير زيارة الجودة</small><h2>{r.branchName}</h2><p>{r.type} · {r.date.slice(0, 10)} · {r.inspector}</p>
        <div className="bp-s-score"><b>{s?.score != null ? `${s.score}%` : '—'}</b><span>{r.imported?.classification ?? s?.classification ?? ''}</span></div></header>
      <h3 className="bp-s-title">الملاحظات ({findings.length})</h3>
      {!findings.length && <p className="bp-empty">لا توجد ملاحظات في هذه الزيارة.</p>}
      {findings.map(q => { const a = r.answers[q.id]; return <div key={q.id} className="bp-finding">
        <div className="bp-a-head"><span className={`severity-tag ${(a?.severity ?? q.severity).toLowerCase()}`}>{SEV_AR[a?.severity ?? q.severity]}</span>{a?.value === 'pass' && <span className="bp-a-state"><CheckCircle2 size={14}/> صُحّح أثناء الزيارة</span>}</div>
        <b>{q.title}</b>{a?.observation && <p>{a.observation}</p>}{a?.recommendation && <p className="bp-a-rec"><b>التوصية:</b> {a.recommendation}</p>}
        {Boolean(a?.attachments?.length) && <div className="bp-ev">{a!.attachments.filter(x => x.type.startsWith('image/')).map(x => <MediaImg key={x.id} att={x} alt={x.caption || q.title}/>)}</div>}
      </div>; })}
    </div>
  </div>;
}

import { useEffect, useRef, useState } from 'react';
import type { Answer, Inspection } from '../data';
import { TASTING_SCORE_FIELDS } from '../checklist';
import { calculateScore } from '../scoring';
import { audit, canApprove, snapshotHash, useProfile, workflowLabel } from '../session';

type Sigs = NonNullable<Inspection['signatures']>;

/* ---------- signature pad (finger / stylus / mouse) ---------- */
export function SignaturePad({ value, onChange, label }: { value?: string; onChange: (dataUrl: string) => void; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(!value);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = 150 * ratio;
    const ctx = c.getContext('2d')!; ctx.scale(ratio, ratio); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#07014f';
    if (value) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, c.offsetWidth, 150); img.src = value; }
  }, []);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e: React.PointerEvent) => { drawing.current = true; ref.current!.setPointerCapture(e.pointerId); const ctx = ref.current!.getContext('2d')!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = ref.current!.getContext('2d')!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setEmpty(false); };
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange(ref.current!.toDataURL('image/png')); };
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setEmpty(true); onChange(''); };
  return <div className="sig-pad">
    <div className="sig-head"><span>{label}</span><button type="button" onClick={clear}>مسح</button></div>
    <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label={label} style={{ touchAction: 'none' }}/>
    {empty && <small className="sig-hint">وقّع داخل المربع</small>}
  </div>;
}

export function SignatureSection({ value, onChange, inspectorName, disabled }: { value: Sigs; onChange: (v: Sigs) => void; inspectorName: string; disabled?: boolean }) {
  const now = () => new Date().toISOString();
  const [declined, setDeclined] = useState(Boolean(value.branch?.declinedReason));
  if (disabled) return null;
  return <div className="sig-section">
    <b className="sig-title">التوقيعات</b>
    <SignaturePad label={`توقيع المفتش · ${inspectorName}`} value={value.inspector?.image} onChange={image => onChange({ ...value, inspector: image ? { name: inspectorName, image, at: now() } : undefined })}/>
    <label className="field"><span>اسم مسؤول الفرع</span><input value={value.branch?.name ?? ''} onChange={e => onChange({ ...value, branch: { ...(value.branch ?? { at: now() }), name: e.target.value, at: now() } })} placeholder="الاسم الكامل"/></label>
    <label className="sig-decline"><input type="checkbox" checked={declined} onChange={e => { setDeclined(e.target.checked); onChange({ ...value, branch: { name: value.branch?.name ?? '', at: now(), ...(e.target.checked ? { declinedReason: '' } : {}) } }); }}/> تعذّر توقيع مسؤول الفرع</label>
    {declined
      ? <label className="field"><span>السبب</span><input value={value.branch?.declinedReason ?? ''} onChange={e => onChange({ ...value, branch: { name: value.branch?.name ?? '', at: now(), declinedReason: e.target.value } })} placeholder="مثال: غير متواجد وقت الزيارة"/></label>
      : <SignaturePad label="توقيع مسؤول الفرع" value={value.branch?.image} onChange={image => onChange({ ...value, branch: { name: value.branch?.name ?? '', at: now(), image } })}/>}
    <p className="sig-note">يُسجَّل اسم الموقّع ووقت التوقيع وصورة التوقيع كدليل. هذا توقيع إلكتروني بسيط وليس توقيعاً موثقاً قانونياً.</p>
  </div>;
}
export const signaturesComplete = (s?: Sigs) => Boolean(s?.inspector?.image && s.branch?.name?.trim() && (s.branch.image || s.branch.declinedReason?.trim()));

/* ---------- tasting sub-scores (Q27–31) ---------- */
export function TastingScores({ value, onChange }: { value?: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  return <div className="tasting-box"><div className="answer-label">تقييم التذوق <small>من ٥ — للتوثيق، لا يغيّر نتيجة البند</small></div>
    {TASTING_SCORE_FIELDS.map(f => <div className="tasting-row" key={f}><span>{f}</span><div className="tasting-scale">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} className={value?.[f] === n ? 'on' : ''} onClick={() => onChange({ ...(value ?? {}), [f]: n })} aria-label={`${f} ${n}`}>{n}</button>)}</div></div>)}
  </div>;
}

/* ---------- previous visit / recurring ---------- */
export function previousInspection(all: Inspection[], branchId: string, excludeId?: string) {
  return all.filter(i => i.branchId === branchId && i.id !== excludeId && i.status === 'finalized')
    .sort((a, b) => (b.submittedAt || b.finalizedAt || b.date).localeCompare(a.submittedAt || a.finalizedAt || a.date))[0];
}
export const failedAt = (a?: Answer) => Boolean(a && (a.value === 'fail' || a.initialValue === 'fail'));

export function PreviousVisitCard({ prev, openActions }: { prev?: Inspection; openActions: number }) {
  if (!prev) return <div className="prev-card empty">لا توجد زيارة سابقة مكتملة لهذا الفرع.</div>;
  const s = calculateScore(prev.questionSnapshot, prev.answers);
  const failed = prev.questionSnapshot.filter(q => failedAt(prev.answers[q.id]));
  return <div className="prev-card">
    <div className="prev-head"><b>الزيارة السابقة</b><span>{prev.date.slice(0, 10)} · {workflowLabel(prev)}</span></div>
    <div className="prev-stats"><span>النتيجة <b>{s.score ?? '—'}%</b></span><span>التصنيف <b>{s.classification ?? '—'}</b></span><span>إجراءات مفتوحة <b>{openActions}</b></span><span>ملاحظات <b>{failed.length}</b></span></div>
    {failed.length > 0 && <div className="prev-findings">{failed.slice(0, 8).map(q => <span key={q.id}>#{q.id} {q.title}</span>)}{failed.length > 8 && <span>+{failed.length - 8}</span>}</div>}
  </div>;
}

export function RecurringHint({ prev, questionId, answer, onConfirm }: { prev?: Inspection; questionId: number; answer: Answer; onConfirm: (v: boolean) => void }) {
  if (!prev || !failedAt(prev.answers[questionId])) return null;
  const pa = prev.answers[questionId];
  return <div className="recurring-hint">
    <b>↻ كان هذا البند غير مطابق في الزيارة السابقة ({prev.date.slice(0, 10)})</b>
    {pa.observation && <small>الملاحظة السابقة: {pa.observation}</small>}
    {answer.value === 'fail' && <label><input type="checkbox" checked={answer.recurring} onChange={e => onConfirm(e.target.checked)}/> تأكيد أنها ملاحظة متكررة</label>}
  </div>;
}

/* ---------- approval panel (report page) ---------- */
export function ApprovalPanel({ inspection, save, all = [], onAmend }: { inspection: Inspection; save: (i: Inspection) => Promise<void>; all?: Inspection[]; onAmend?: (copy: Inspection) => Promise<void> }) {
  const profile = useProfile();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const allowed = canApprove(profile);
  const amendments = all.filter(x => x.amendmentOf === inspection.id);
  const original = inspection.amendmentOf ? all.find(x => x.id === inspection.amendmentOf) : undefined;
  const amend = async () => {
    if (!profile || !onAmend) return;
    const reason = window.prompt('سبب التصحيح (يُوثَّق ويظهر في التقرير):')?.trim();
    if (!reason) return;
    const rev = Math.max(0, ...amendments.map(a => a.revision ?? 1)) + 1;
    const now = new Date().toISOString();
    const copy: Inspection = { ...JSON.parse(JSON.stringify(inspection)), id: `${inspection.id}-r${rev}`, status: 'draft', workflow: undefined, amendmentOf: inspection.id, amendmentReason: reason, revision: rev,
      number: inspection.number ? `${inspection.number.replace(/-R\d+$/, '')}-R${rev}` : undefined, approvedAt: undefined, approvedBy: undefined, snapshotHash: undefined, submittedAt: undefined, finalizedAt: undefined,
      returnReason: undefined, signatures: {}, createdAt: now, updatedAt: now };
    await onAmend(copy); await audit('inspection.amend', 'inspections', inspection.id, { revision: rev, reason, newId: copy.id });
  };
  const state = inspection.workflow ?? 'submitted';
  const approve = async () => {
    if (!profile) return;
    if (!window.confirm('اعتماد التقرير؟ بعد الاعتماد تُقفل النتائج ولا يمكن تعديلها إلا بإجراء تصحيح موثّق.')) return;
    setBusy(true);
    const next: Inspection = { ...inspection, workflow: 'approved', approvedAt: new Date().toISOString(), approvedBy: { uid: profile.uid, name: profile.name || profile.email }, updatedAt: new Date().toISOString() };
    next.snapshotHash = await snapshotHash(next);
    await save(next); await audit('inspection.approve', 'inspections', inspection.id, { number: inspection.number, hash: next.snapshotHash });
    setBusy(false); setMsg('تم اعتماد التقرير.');
  };
  const sendBack = async () => {
    if (!profile) return;
    const reason = window.prompt('سبب الإرجاع للتصحيح:')?.trim();
    if (!reason) return;
    setBusy(true);
    await save({ ...inspection, status: 'draft', workflow: 'returned', returnReason: reason, returnedAt: new Date().toISOString(), returnedBy: { uid: profile.uid, name: profile.name || profile.email }, updatedAt: new Date().toISOString() });
    await audit('inspection.return', 'inspections', inspection.id, { reason });
    setBusy(false);
  };
  return <div className={`approval-panel state-${state}`}>
    <div><span className="eyebrow">حالة التقرير</span><b>{workflowLabel(inspection)}</b>
      <small>{inspection.number ? `رقم الزيارة ${inspection.number}` : 'رقم الزيارة يُمنح عند المزامنة'}</small>
      {inspection.approvedBy && <small>اعتمده {inspection.approvedBy.name} · {inspection.approvedAt?.slice(0, 16).replace('T', ' ')}</small>}
      {inspection.snapshotHash && <small className="hash">بصمة النسخة المعتمدة: {inspection.snapshotHash.slice(0, 16)}…</small>}
    </div>
    {state !== 'approved' && allowed && <div className="approval-actions"><button className="button button-primary" disabled={busy} onClick={approve}>اعتماد التقرير</button><button className="button button-outline" disabled={busy} onClick={sendBack}>إرجاع للتصحيح</button></div>}
    {state !== 'approved' && !allowed && <small>بانتظار اعتماد مدير الجودة أو مفتش مخوّل بالاعتماد.</small>}
    {state === 'approved' && <small>النتائج مقفلة. أي تعديل يتطلب إجراء تصحيح موثّق.</small>}
    {state === 'approved' && allowed && onAmend && !amendments.some(a => a.workflow !== 'approved') && <button className="button button-outline" onClick={amend}>بدء تصحيح موثّق</button>}
    {amendments.length > 0 && <div className="amend-list">{amendments.map(a => <a key={a.id} href={a.status === 'draft' ? `/inspection/${a.id}` : `/reports/${a.id}`}>النسخة التصحيحية {a.revision} · {a.amendmentReason} · {workflowLabel(a)}</a>)}</div>}
    {original && <small className="amend-of">تصحيح للتقرير المعتمد {original.number ?? ''} — السبب: {inspection.amendmentReason}</small>}
    {msg && <small className="ok">{msg}</small>}
  </div>;
}

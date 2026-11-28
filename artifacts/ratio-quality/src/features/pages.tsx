import { useEffect, useMemo, useState } from 'react';
import { ago, listHealth, type Health } from './device-health';
import { Link, useLocation, useRoute } from 'wouter';
import type { ActionItem, Barista, BaristaEval, Branch, Equipment, Inspection, Question } from '../data';
import { list, newId, put, QUESTIONS } from '../data';
import { calculateScore } from '../scoring';
import { nameKey, overdueDays } from './text';
import { adminCreateUser, generatePassword, audit, canApprove, isQualityLead, isValidEmail, listAudit, listUsers, ROLE_LABEL, saveConfig, updateUser, useConfig, useProfile, type Profile, type RecipientList, type Role } from '../session';
import { cloudEnabled } from '../cloud';
import { type BranchScore } from './position';
import { SaudiMap } from './SaudiMap';
import { regionOf, shortRegion } from './geo';

export type AppData = { inspections: Inspection[]; branches: Branch[]; actions: ActionItem[]; refresh: () => Promise<void> };
const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const SEV_AR: Record<string, string> = { Critical: 'حرج', Major: 'رئيسي', Minor: 'ثانوي' };
const Title = ({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) =>
  <div className="page-title"><div className="pt-wrap"><HeadIcon text={`${title} ${eyebrow}`} size={22}/><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{detail && <p>{detail}</p>}</div></div></div>;

/* ===================== Corrective actions ===================== */
const CHIP_ICON: Record<string, typeof ListChecks> = { 'مفتوحة': CircleDot, 'متأخرة': AlarmClock, 'متكررة': Repeat, 'مفتوح': CircleDot, 'مُسند': UserCheck, 'قيد المعالجة': Hammer, 'بانتظار التحقق': Hourglass, 'مغلق': CheckCircle2, 'الكل': ListChecks };
const STATUSES: ActionItem['status'][] = ['مفتوح', 'مُسند', 'قيد المعالجة', 'بانتظار التحقق', 'مغلق'];
import { isOverdue } from './overdue';
import { MediaImg } from './media';
import { AlarmClock, CheckCircle2, CircleDot, Hammer, Hourglass, ListChecks, Repeat, UserCheck } from 'lucide-react';
import { HeadIcon } from './page-icons';
export { isOverdue };

export function ActionsBoard({ data }: { data: AppData }) {
  const profile = useProfile();
  const lead = isQualityLead(profile) || !cloudEnabled;
  const [filter, setFilter] = useState<string>('مفتوحة');
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  useEffect(() => { list<Equipment>('equipment').then(setEquipment); }, []);
  const rows = data.actions.filter(a => filter === 'الكل' ? true : filter === 'مفتوحة' ? a.status !== 'مغلق' : filter === 'متأخرة' ? isOverdue(a) : filter === 'متكررة' ? a.recurring : a.status === filter)
    .sort((x, y) => (x.dueDate || '9').localeCompare(y.dueDate || '9'));
  const closed = data.actions.filter(a => a.status === 'مغلق').length;
  // Older actions were saved without their branch id: fill it from the visit so branch managers see them.
  useEffect(() => {
    if (!lead) return;
    const fix = data.actions.filter(a => !a.branchId && a.inspectionId);
    if (!fix.length) return;
    (async () => { let n = 0; for (const a of fix) { const i = data.inspections.find(x => x.id === a.inspectionId); if (i?.branchId) { await put('actions', { ...a, branchId: i.branchId, updatedAt: nowIso() }); n++; } } if (n) data.refresh(); })();
  }, [lead, data.actions.length]);
  const verify = (a: ActionItem) => change(a, { status: 'مغلق' }, 'تم التحقق من إثبات الفرع');
  const sendBack = (a: ActionItem) => { const why = window.prompt('سبب الإرجاع للفرع (يظهر لمدير الفرع):', 'الصورة لا توضح التصحيح'); if (why?.trim()) change(a, { status: 'مُسند' }, `أُعيد للفرع: ${why.trim()}`); };
  const change = async (a: ActionItem, patch: Partial<ActionItem>, note?: string) => {
    const by = profile?.name || profile?.email || 'مستخدم';
    const next: ActionItem = { ...a, ...patch, updatedAt: nowIso(), history: [...(a.history ?? []), { status: patch.status ?? a.status, at: nowIso(), by, note }] };
    if (patch.status === 'مغلق') { next.verifiedBy = by; next.verifiedAt = nowIso(); }
    await put('actions', next); await audit('action.update', 'actions', a.id, { ...patch, note }); await data.refresh();
  };
  return <div className="page-content">
    <Title eyebrow="تحسين مستمر" title="الإجراءات التصحيحية" detail={`مفتوحة ${data.actions.length - closed} · متأخرة ${data.actions.filter(isOverdue).length} · نسبة الإغلاق ${data.actions.length ? Math.round(closed / data.actions.length * 100) : 0}%`}/>
    <div className="filter-scroll">{['مفتوحة', 'متأخرة', 'متكررة', ...STATUSES, 'الكل'].map(s => { const I = CHIP_ICON[s] ?? ListChecks; return <button key={s} onClick={() => setFilter(s)} className={`filter-chip ${filter === s ? 'active' : ''}`}><I size={14}/> {s}</button>; })}</div>
    {!rows.length && <div className="surface-card empty-note">لا توجد إجراءات في هذا التصنيف.</div>}
    <div className="action-cards">{rows.map(a => <section key={a.id} className={`surface-card action-card ${isOverdue(a) ? 'overdue' : ''}`}>
      <div className="action-head"><span className={`severity-tag ${a.severity.toLowerCase()}`}>{SEV_AR[a.severity]}</span>{a.recurring && <span className="wf-pill returned">متكرر</span>}<span className="action-date">{isOverdue(a) ? `متأخر ${overdueDays(a.dueDate)} يوم · ` : ''}الاستحقاق {a.dueDate || '—'}</span></div>
      <h3>{a.title}</h3><p className="action-description">{a.description}</p>{a.recommendation && <p>الإجراء المطلوب: {a.recommendation}</p>}
      {(Boolean(a.evidence?.length) || a.managerNote) && <div className="action-proof"><b>{a.status === 'بانتظار التحقق' ? 'رد الفرع — بانتظار تحققك' : 'إثبات التصحيح'}</b>{a.managerNote && <p>{a.managerNote}</p>}{Boolean(a.evidence?.length) && <div className="bp-ev">{a.evidence!.map(e => <MediaImg key={e.id} att={e} alt="إثبات التصحيح"/>)}</div>}
        {lead && a.status === 'بانتظار التحقق' && <div className="proof-act"><button type="button" className="button button-primary" onClick={() => verify(a)}>تحقق وأغلق ✓</button><button type="button" className="button button-outline" onClick={() => sendBack(a)}>إرجاع للفرع</button></div>}</div>}
      <div className="action-edit">
        <label className="field"><span>المسؤول (موظف أو إدارة)</span><input defaultValue={a.responsible} onBlur={e => e.target.value !== a.responsible && change(a, { responsible: e.target.value, status: a.status === 'مفتوح' && e.target.value ? 'مُسند' : a.status })}/></label>
        <label className="field"><span>الاستحقاق</span><input type="date" defaultValue={a.dueDate} onBlur={e => e.target.value !== a.dueDate && change(a, { dueDate: e.target.value })}/></label>
        <label className="field"><span>المعدّة المرتبطة</span><select value={a.equipmentId ?? ''} onChange={e => change(a, { equipmentId: e.target.value || undefined })}><option value="">—</option>{equipment.filter(x => x.branchId === a.branchId || x.branchName === a.branchName).map(x => <option key={x.id} value={x.id}>{x.category} · {x.model}</option>)}</select></label>
        <label className="field"><span>الحالة</span><select value={a.status} onChange={e => change(a, { status: e.target.value as ActionItem['status'] })}>{STATUSES.map(s => <option key={s} value={s} disabled={(s === 'مغلق' || a.status === 'مغلق') && !lead}>{s}{s === 'مغلق' && !lead ? ' (تحقق مدير الجودة)' : ''}</option>)}</select></label>
      </div>
      {a.verifiedBy && <small className="ok">تحقق من الإغلاق: {a.verifiedBy} · {a.verifiedAt?.slice(0, 10)}</small>}
      {Boolean(a.history?.length) && <details className="history"><summary>سجل التغييرات ({a.history!.length})</summary>{a.history!.map((h, k) => <div key={k}>{h.at.slice(0, 16).replace('T', ' ')} · {h.by} · {h.status}{h.note ? ` · ${h.note}` : ''}</div>)}</details>}
    </section>)}</div>
  </div>;
}

/* ===================== Analytics ===================== */
export function AnalyticsPage({ data }: { data: AppData }) {
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [branch, setBranch] = useState(''); const [section, setSection] = useState(''); const [sev, setSev] = useState(''); const [inspector, setInspector] = useState(''); const [fstatus, setFstatus] = useState('');
  const superseded = new Set(data.inspections.filter(i => i.amendmentOf && i.workflow === 'approved').map(i => i.amendmentOf!));
  const comparable = data.inspections.filter(i => i.status === 'finalized' && (i.checklistVersion ?? '').startsWith('official-pdf-v1') && !superseded.has(i.id));
  const legacy = data.inspections.filter(i => i.status === 'finalized' && !(i.checklistVersion ?? '').startsWith('official-pdf-v1')).length;
  const rows = comparable.filter(i => (!from || i.date >= from) && (!to || i.date.slice(0, 10) <= to) && (!branch || i.branchId === branch) && (!inspector || i.inspector === inspector));
  const scored = rows.map(i => ({ i, s: calculateScore(i.questionSnapshot, i.answers) }));
  const avg = scored.filter(x => x.s.score !== null).reduce((a, x, _, arr) => a + x.s.score! / arr.length, 0);
  const qFilter = (q: Question) => (!section || q.section === section) && (!sev || q.severity === sev);
  const actionFor = (iid: string, qid: number) => data.actions.find(a => a.inspectionId === iid && a.questionId === qid);
  const statusOk = (iid: string, qid: number) => { if (!fstatus) return true; const a = actionFor(iid, qid); return fstatus === 'none' ? !a : fstatus === 'open' ? Boolean(a) && a!.status !== 'مغلق' : fstatus === 'overdue' ? Boolean(a) && isOverdue(a!) : Boolean(a) && a!.status === 'مغلق'; };
  const findings = rows.flatMap(i => i.questionSnapshot.filter(q => qFilter(q) && (i.answers[q.id]?.value === 'fail' || i.answers[q.id]?.initialValue === 'fail') && statusOk(i.id, q.id)).map(q => ({ i, q })));
  const byQ = Object.values(findings.reduce<Record<number, { q: Question; n: number; recurring: number }>>((m, f) => { const e = m[f.q.id] ??= { q: f.q, n: 0, recurring: 0 }; e.n++; if (f.i.answers[f.q.id]?.recurring) e.recurring++; return m; }, {})).sort((a, b) => b.n - a.n);
  const byBranch = Object.values(scored.reduce<Record<string, { name: string; scores: number[]; critical: number }>>((m, x) => { const e = m[x.i.branchId] ??= { name: x.i.branchName, scores: [], critical: 0 }; if (x.s.score !== null) e.scores.push(x.s.score); e.critical += x.s.criticalFailures; return m; }, {}))
    .map(b => ({ ...b, avg: b.scores.reduce((a, v) => a + v, 0) / (b.scores.length || 1) })).sort((a, b) => b.avg - a.avg);
  const byMonth = Object.entries(scored.reduce<Record<string, number[]>>((m, x) => { if (x.s.score !== null) (m[x.i.date.slice(0, 7)] ??= []).push(x.s.score); return m; }, {})).sort().map(([k, v]) => ({ k, avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length }));
  const classes = ['ممتاز', 'جيد', 'يحتاج تحسين', 'غير مقبول'].map(c => ({ c, n: scored.filter(x => x.s.classification === c).length }));
  const acts = data.actions.filter(a => !branch || a.branchId === branch || a.branchName === data.branches.find(b => b.id === branch)?.name);
  const closedN = acts.filter(a => a.status === 'مغلق').length;
  const Bar = ({ label, value, max, suffix = '' }: { label: string; value: number; max: number; suffix?: string }) => <div className="bar-row"><span className="bar-label">{label}</span><span className="bar-track"><i style={{ width: `${max ? Math.max(2, value / max * 100) : 0}%` }}/></span><b>{Number.isInteger(value) ? value : value.toFixed(1)}{suffix}</b></div>;
  const inspectors = [...new Set(comparable.map(i => i.inspector))];
  return <div className="page-content">
    <Title eyebrow="تحليلات الجودة" title="لوحة الأداء" detail={`تشمل الزيارات المكتملة على قائمة الفحص الرسمية فقط${legacy ? ` (استُبعدت ${legacy} زيارة على نسخة قديمة لتجنّب مقارنة مضللة)` : ''}.`}/>
    <div className="surface-card analytics-filters">
      <label className="field"><span>من</span><input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label>
      <label className="field"><span>إلى</span><input type="date" value={to} onChange={e => setTo(e.target.value)}/></label>
      <label className="field"><span>الفرع</span><select value={branch} onChange={e => setBranch(e.target.value)}><option value="">الكل</option>{data.branches.filter(b => !b.archived).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="field"><span>القسم</span><select value={section} onChange={e => setSection(e.target.value)}><option value="">الكل</option>{[...new Set(QUESTIONS.map(q => q.section))].map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="field"><span>الخطورة</span><select value={sev} onChange={e => setSev(e.target.value)}><option value="">الكل</option><option value="Critical">حرج</option><option value="Major">رئيسي</option><option value="Minor">ثانوي</option></select></label>
      <label className="field"><span>حالة الملاحظة</span><select value={fstatus} onChange={e => setFstatus(e.target.value)}><option value="">الكل</option><option value="none">بدون إجراء تصحيحي</option><option value="open">إجراء مفتوح</option><option value="overdue">إجراء متأخر</option><option value="closed">مغلقة</option></select></label>
      <label className="field"><span>المفتش</span><select value={inspector} onChange={e => setInspector(e.target.value)}><option value="">الكل</option>{inspectors.map(n => <option key={n}>{n}</option>)}</select></label>
    </div>
    <div className="kpi-grid">
      <div className="surface-card kpi"><small>زيارات</small><b>{rows.length}</b></div>
      <div className="surface-card kpi"><small>متوسط الالتزام</small><b>{scored.length ? `${avg.toFixed(1)}%` : '—'}</b></div>
      <div className="surface-card kpi"><small>إخفاقات حرجة</small><b>{scored.reduce((a, x) => a + x.s.criticalFailures, 0)}</b></div>
      <div className="surface-card kpi"><small>إجراءات مفتوحة / متأخرة</small><b>{acts.length - closedN} / {acts.filter(isOverdue).length}</b></div>
      <div className="surface-card kpi"><small>نسبة إغلاق الإجراءات</small><b>{acts.length ? Math.round(closedN / acts.length * 100) : 0}%</b></div>
      <div className="surface-card kpi"><small>ملاحظات متكررة</small><b>{findings.filter(f => f.i.answers[f.q.id]?.recurring).length}</b></div>
    </div>
    <div className="analytics-grid">
      <section className="surface-card"><h3>الاتجاه الشهري (متوسط الالتزام)</h3>{byMonth.length ? byMonth.map(m => <Bar key={m.k} label={`${m.k} (${m.n})`} value={m.avg} max={100} suffix="%"/>) : <p className="muted-text">لا توجد بيانات.</p>}</section>
      <section className="surface-card"><h3>التصنيفات</h3>{classes.map(c => <Bar key={c.c} label={c.c} value={c.n} max={Math.max(1, ...classes.map(x => x.n))}/>)}</section>
      <section className="surface-card"><h3>مقارنة الفروع</h3>{byBranch.length ? byBranch.slice(0, 15).map(b => <Bar key={b.name} label={`${b.name}${b.critical ? ` · حرج ${b.critical}` : ''}`} value={b.avg} max={100} suffix="%"/>) : <p className="muted-text">لا توجد بيانات.</p>}</section>
      <section className="surface-card"><h3>أكثر الملاحظات تكراراً (حسب رقم البند)</h3>{byQ.length ? byQ.slice(0, 10).map(x => <Bar key={x.q.id} label={`#${x.q.id} ${x.q.title}${x.recurring ? ` · متكرر ${x.recurring}` : ''}`} value={x.n} max={byQ[0].n}/>) : <p className="muted-text">لا توجد ملاحظات.</p>}</section>
    </div>
  </div>;
}

/* ===================== Equipment registry ===================== */
const CATEGORIES = ['ماكينة إسبريسو', 'مطحنة قهوة', 'ثلاجة', 'نظام فلترة المياه', 'غلاية', 'أخرى'];
const EQ_STATUS: Equipment['status'][] = ['يعمل', 'يعمل بملاحظات', 'متوقف', 'خارج الخدمة'];
export function EquipmentPage({ data }: { data: AppData }) {
  const profile = useProfile();
  const [items, setItems] = useState<Equipment[]>([]);
  const [branch, setBranch] = useState('');
  const [draft, setDraft] = useState<Partial<Equipment>>({ category: CATEGORIES[0], status: 'يعمل' });
  const [note, setNote] = useState<Record<string, string>>({});
  const load = () => list<Equipment>('equipment').then(setItems);
  useEffect(() => { load(); }, []);
  const branches = data.branches.filter(b => !b.archived);
  const shown = items.filter(x => !branch || x.branchId === branch);
  const save = async (e: Equipment) => { await put('equipment', { ...e, updatedAt: nowIso() }); await load(); };
  const add = async () => {
    const b = branches.find(x => x.id === (draft.branchId || branch)); if (!b || !draft.model?.trim()) return;
    const e: Equipment = { id: newId(), branchId: b.id, branchName: b.name, category: draft.category!, manufacturer: draft.manufacturer?.trim() ?? '', model: draft.model.trim(), serial: draft.serial?.trim() || undefined, installedAt: draft.installedAt || undefined, status: draft.status!, nextMaintenance: draft.nextMaintenance || undefined, log: [], updatedAt: nowIso() };
    await save(e); await audit('equipment.create', 'equipment', e.id, { branch: b.name, model: e.model }); setDraft({ category: CATEGORIES[0], status: 'يعمل', branchId: draft.branchId });
  };
  const log = async (e: Equipment, type: Equipment['log'][number]['type']) => {
    const text = (note[e.id] ?? '').trim(); if (!text) return;
    const by = profile?.name || profile?.email || 'مستخدم';
    await save({ ...e, log: [{ at: nowIso(), type, note: text, by }, ...e.log], lastMaintenance: type === 'صيانة' ? today() : e.lastMaintenance });
    setNote({ ...note, [e.id]: '' });
  };
  return <div className="page-content">
    <Title eyebrow="سجل المعدات" title="المعدات والصيانة" detail="تُسجَّل المعدات كما هي في الفرع فقط — لا تُضف أرقام تسلسلية غير مؤكدة."/>
    <div className="surface-card form-grid eq-form">
      <label className="field"><span>الفرع *</span><select value={draft.branchId ?? branch} onChange={e => setDraft({ ...draft, branchId: e.target.value })}><option value="">اختر</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="field"><span>الفئة</span><select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="field"><span>الشركة المصنعة</span><input value={draft.manufacturer ?? ''} onChange={e => setDraft({ ...draft, manufacturer: e.target.value })}/></label>
      <label className="field"><span>الموديل *</span><input value={draft.model ?? ''} onChange={e => setDraft({ ...draft, model: e.target.value })}/></label>
      <label className="field"><span>الرقم التسلسلي (إن وجد)</span><input value={draft.serial ?? ''} onChange={e => setDraft({ ...draft, serial: e.target.value })} dir="ltr"/></label>
      <label className="field"><span>تاريخ التركيب (إن وجد)</span><input type="date" value={draft.installedAt ?? ''} onChange={e => setDraft({ ...draft, installedAt: e.target.value })}/></label>
      <label className="field"><span>الحالة</span><select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Equipment['status'] })}>{EQ_STATUS.map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="field"><span>الصيانة القادمة</span><input type="date" value={draft.nextMaintenance ?? ''} onChange={e => setDraft({ ...draft, nextMaintenance: e.target.value })}/></label>
      <button className="button button-primary" onClick={add}>إضافة معدّة</button>
    </div>
    <div className="filter-scroll"><label className="field"><span>عرض فرع</span><select value={branch} onChange={e => setBranch(e.target.value)}><option value="">كل الفروع</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
    {!shown.length && <div className="surface-card empty-note">لا توجد معدات مسجلة.</div>}
    <div className="action-cards">{shown.map(e => <section key={e.id} className={`surface-card eq-card ${e.nextMaintenance && e.nextMaintenance < today() ? 'overdue' : ''}`}>
      <div className="action-head"><b>{e.category}</b><span className="action-date">{e.branchName}</span></div>
      <h3>{e.manufacturer} {e.model}</h3>
      <small>{e.serial ? `S/N ${e.serial} · ` : ''}{e.installedAt ? `التركيب ${e.installedAt} · ` : ''}آخر صيانة {e.lastMaintenance ?? '—'} · القادمة {e.nextMaintenance ?? '—'}</small>
      <div className="action-edit">
        <label className="field"><span>الحالة</span><select value={e.status} onChange={ev => save({ ...e, status: ev.target.value as Equipment['status'] })}>{EQ_STATUS.map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="field"><span>الصيانة القادمة</span><input type="date" defaultValue={e.nextMaintenance} onBlur={ev => ev.target.value !== e.nextMaintenance && save({ ...e, nextMaintenance: ev.target.value })}/></label>
      </div>
      <div className="eq-log-input"><input className="typed-input" placeholder="وصف الصيانة أو الطلب…" value={note[e.id] ?? ''} onChange={ev => setNote({ ...note, [e.id]: ev.target.value })}/><button className="button button-soft" onClick={() => log(e, 'طلب صيانة')}>طلب صيانة</button><button className="button button-outline" onClick={() => log(e, 'صيانة')}>تسجيل صيانة</button></div>
      {Boolean(e.log.length) && <details className="history"><summary>السجل ({e.log.length})</summary>{e.log.map((l, k) => <div key={k}>{l.at.slice(0, 10)} · {l.type} · {l.note} · {l.by}</div>)}</details>}
      {data.actions.filter(a => a.equipmentId === e.id).length > 0 && <small>ملاحظات فحص مرتبطة: {data.actions.filter(a => a.equipmentId === e.id).map(a => `#${a.questionId} (${a.status})`).join('، ')}</small>}
    </section>)}</div>
  </div>;
}

/* ===================== Baristas ===================== */
const BARISTA_QS = QUESTIONS.filter(q => q.section === 'أداء الباريستا');
export const baristaScore = (e: BaristaEval) => calculateScore(BARISTA_QS, Object.fromEntries(BARISTA_QS.map(q => [q.id, { value: e.answers[q.id] ?? null, observation: '', recommendation: '', recurring: false, severity: q.severity, attachments: [] }])));

export function BaristaEvaluation({ data }: { data: AppData }) {
  const [, params] = useRoute('/inspection/:id/baristas');
  const inspection = data.inspections.find(i => i.id === params?.id);
  const profile = useProfile();
  const [baristas, setBaristas] = useState<Barista[]>([]);
  const [evals, setEvals] = useState<BaristaEval[]>([]);
  const [name, setName] = useState('');
  const load = async () => { setBaristas(await list<Barista>('baristas')); setEvals(await list<BaristaEval>('baristaEvals')); };
  useEffect(() => { load(); }, []);
  if (!inspection) return <div className="page-content"><p>الزيارة غير موجودة.</p></div>;
  const mine = evals.filter(e => e.inspectionId === inspection.id);
  const branchBaristas = baristas.filter(b => b.branchId === inspection.branchId && b.active);
  const addBarista = async () => { if (!name.trim()) return; const b: Barista = { id: newId(), name: name.trim(), branchId: inspection.branchId, branchName: inspection.branchName, active: true, updatedAt: nowIso() }; await put('baristas', b); setName(''); await load(); };
  const start = async (b: Barista) => {
    if (mine.some(e => e.baristaId === b.id)) return;
    const e: BaristaEval = { id: newId(), baristaId: b.id, baristaName: b.name, branchId: inspection.branchId, branchName: inspection.branchName, inspectionId: inspection.id, date: inspection.date, evaluator: profile?.name || inspection.inspector, evaluatorUid: profile?.uid, answers: {}, notes: '', updatedAt: nowIso() };
    await put('baristaEvals', e); await load();
  };
  const set = async (e: BaristaEval, patch: Partial<BaristaEval>) => { await put('baristaEvals', { ...e, ...patch, updatedAt: nowIso() }); await load(); };
  return <div className="page-content narrow-page">
    <Link href={inspection.status === 'draft' ? `/inspection/${inspection.id}` : `/reports/${inspection.id}`} className="back-link">← العودة للزيارة</Link>
    <Title eyebrow={`${inspection.branchName} · ${inspection.date.slice(0, 10)}`} title="التقييم الفردي للباريستا" detail="يُقيَّم كل باريستا على بنود القسم الرابع (37–46). الدرجة الفردية منفصلة عن نتيجة الفرع ولا تغيّرها. البيانات مرئية للمقيِّم ولإدارة الجودة فقط."/>
    <div className="surface-card barista-add"><b>باريستا الفرع</b>
      <div className="chips">{branchBaristas.map(b => <button key={b.id} className={`filter-chip ${mine.some(e => e.baristaId === b.id) ? 'active' : ''}`} onClick={() => start(b)}>{b.name}</button>)}</div>
      <div className="eq-log-input"><input className="typed-input" value={name} onChange={e => setName(e.target.value)} placeholder="اسم باريستا جديد"/><button className="button button-soft" onClick={addBarista}>إضافة</button></div>
    </div>
    {mine.map(e => { const s = baristaScore(e); return <section key={e.id} className="surface-card barista-eval">
      <div className="action-head"><b>{e.baristaName}</b><span>{s.score === null ? `${Object.keys(e.answers).length}/10` : `${s.score}% · ${s.classification}`}</span></div>
      {BARISTA_QS.map(q => <div key={q.id} className="be-row"><span>#{q.id} {q.title}</span><div className="be-choice">{(['pass', 'fail', 'na'] as const).map(v => <button key={v} className={e.answers[q.id] === v ? `on ${v}` : ''} onClick={() => set(e, { answers: { ...e.answers, [q.id]: v } })}>{v === 'pass' ? '✓' : v === 'fail' ? '✕' : '—'}</button>)}</div></div>)}
      <label className="field"><span>ملاحظات وتوصية تدريب</span><textarea defaultValue={e.notes} onBlur={ev => ev.target.value !== e.notes && set(e, { notes: ev.target.value })}/></label>
    </section>; })}
  </div>;
}

export function BaristasPage({ data }: { data: AppData }) {
  const [baristas, setBaristas] = useState<Barista[]>([]);
  const [evals, setEvals] = useState<BaristaEval[]>([]);
  const [branch, setBranch] = useState('');
  const [newName, setNewName] = useState(''); const [newBranch, setNewBranch] = useState(''); const [msg, setMsg] = useState(''); const [showInactive, setShowInactive] = useState(false);
  const reload = () => list<Barista>('baristas').then(setBaristas);
  useEffect(() => { reload(); list<BaristaEval>('baristaEvals').then(setEvals); }, []);
  const addBarista = async () => {
    const br = data.branches.find(b => b.id === (branch || newBranch)); const name = newName.trim();
    if (!name || !br) { setMsg('اكتب اسم الباريستا واختر الفرع.'); return; }
    if (baristas.some(b => b.branchId === br.id && nameKey(b.name) === nameKey(name))) { setMsg('هذا الباريستا مسجل مسبقاً في نفس الفرع.'); return; }
    await put('baristas', { id: newId(), name, branchId: br.id, branchName: br.name, active: true, updatedAt: nowIso() } as Barista); setNewName(''); setMsg('تمت الإضافة.'); reload();
  };
  const patch = async (b: Barista, p: Partial<Barista>) => { await put('baristas', { ...b, ...p, updatedAt: nowIso() } as Barista); reload(); };
  const rows = baristas.filter(b => (showInactive || b.active) && (!branch || b.branchId === branch)).map(b => {
    const es = evals.filter(e => e.baristaId === b.id).sort((x, y) => x.date.localeCompare(y.date));
    const scores = es.map(baristaScore).map(s => s.score).filter((x): x is number => x !== null);
    const gaps = BARISTA_QS.map(q => ({ q, n: es.filter(e => e.answers[q.id] === 'fail').length })).filter(g => g.n >= 2);
    return { b, es, scores, gaps };
  });
  return <div className="page-content">
    <Title eyebrow="أداء الباريستا" title="سجل الباريستا" detail="تاريخ التقييمات الفردية، المقارنة بين الزيارات، وفجوات المهارة المتكررة (بند فشل مرتين أو أكثر)."/>
    <label className="field"><span>الفرع</span><select value={branch} onChange={e => setBranch(e.target.value)}><option value="">الكل</option>{data.branches.filter(b => !b.archived).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <div className="surface-card barista-add"><b>إضافة باريستا</b><div className="barista-add-row"><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="اسم الباريستا" aria-label="اسم الباريستا"/>{!branch && <select value={newBranch} onChange={e => setNewBranch(e.target.value)} aria-label="فرع الباريستا الجديد"><option value="">اختر الفرع</option>{data.branches.filter(b => !b.archived).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}<button type="button" className="button button-primary" onClick={addBarista}>إضافة</button></div>{msg && <small>{msg}</small>}<label className="recurring-toggle"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}/><span className="fake-check"/><span>إظهار الموقوفين</span></label></div>
    {!rows.length && <div className="surface-card empty-note">لا توجد تقييمات بعد. ابدأ من صفحة الزيارة ← «تقييم الباريستا».</div>}
    <div className="action-cards">{rows.map(({ b, es, scores, gaps }) => <section key={b.id} className="surface-card">
      <div className="action-head"><b>{b.name}{!b.active && <em className="wf-pill returned"> موقوف</em>}</b><span className="action-date">{b.branchName}</span></div>
      <div className="barista-actions"><button type="button" className="text-link" onClick={() => { const n = window.prompt('الاسم الجديد', b.name)?.trim(); if (n && n !== b.name) patch(b, { name: n }); }}>تعديل الاسم</button><button type="button" className="text-link" onClick={() => patch(b, { active: !b.active })}>{b.active ? 'إيقاف' : 'إعادة تفعيل'}</button></div>
      <p>التقييمات {es.length} · آخر نتيجة <bdi>{scores.at(-1) ?? '—'}%</bdi> · السابقة <bdi>{scores.at(-2) ?? '—'}%</bdi>{scores.length >= 2 ? ` · ${scores.at(-1)! >= scores.at(-2)! ? '↑ تحسّن' : '↓ تراجع'}` : ''}</p>
      {gaps.length > 0 && <div className="recurring-hint"><b>يوصى بمتابعة تدريبية في:</b>{gaps.map(g => <small key={g.q.id}>#{g.q.id} {g.q.title} (تكرر {g.n} مرات)</small>)}</div>}
    </section>)}</div>
  </div>;
}

/* ===================== Users & audit (admin) ===================== */
function DeviceLine({ h }: { h?: Health }) {
  if (!h) return <div className="dev-line muted">لم يفتح التطبيق بعد التحديث الأخير</div>;
  const stale = h.pending > 0 && h.oldestPending && Date.now() - Date.parse(h.oldestPending) > 3600_000;
  return <div className={`dev-line ${stale ? 'warn' : h.pending ? 'pend' : 'ok'}`}>
    <span>آخر ظهور {ago(h.at)} · {h.device}{h.standalone ? ' (تطبيق)' : ' (متصفح)'}</span>
    {h.pending > 0 ? <b>{h.pending} زيارة بانتظار الرفع{h.oldestPending ? ` منذ ${ago(h.oldestPending).replace('قبل ', '')}` : ''}</b> : <b>كل زياراته مرفوعة ✓</b>}
    {h.errors.length > 0 && <details><summary>{h.errors.length} أخطاء حديثة</summary>{h.errors.map((e, k) => <div key={k} dir="ltr"><small>{e.at.slice(5, 16).replace('T', ' ')} · {e.where}</small> {e.message}</div>)}</details>}
  </div>;
}

/** Pick the branches a branch manager may see (search + checkboxes). */
function BranchChooser({ value, onChange, branches }: { value: string[]; onChange: (ids: string[]) => void; branches: Branch[] }) {
  const [q, setQ] = useState('');
  const shown = branches.filter(b => !b.archived && (!q || nameKey(`${b.name} ${b.code ?? ''}`).includes(nameKey(q)))).slice(0, 60);
  return <details className="bc-pick" open={!value.length}>
    <summary>{value.length ? `الفروع المرتبطة: ${value.map(id => branches.find(b => b.id === id)?.name ?? id).join('، ')}` : 'اختر فرع المدير'}</summary>
    <input placeholder="ابحث باسم الفرع أو الرمز" value={q} onChange={e => setQ(e.target.value)}/>
    <div className="bc-list">{shown.map(b => <label key={b.id}><input type="checkbox" checked={value.includes(b.id)} onChange={e => onChange(e.target.checked ? [...value, b.id] : value.filter(x => x !== b.id))}/> {b.name}{b.code ? <small> · {b.code}</small> : null}</label>)}</div>
  </details>;
}

export function UsersPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  useEffect(() => { list<Branch>('branches').then(b => setBranches(b.sort((x, y) => x.name.localeCompare(y.name, 'ar')))); }, []);
  const profile = useProfile();
  const [users, setUsers] = useState<Profile[]>([]);
  const [log, setLog] = useState<Awaited<ReturnType<typeof listAudit>>>([]);
  const [err, setErr] = useState('');
  const [health, setHealth] = useState<Map<string, Health>>(new Map());
  useEffect(() => { listHealth().then(setHealth); const t = window.setInterval(() => listHealth().then(setHealth), 30000); return () => window.clearInterval(t); }, []);
  const load = () => listUsers().then(setUsers).catch(() => setErr('تعذّر تحميل المستخدمين (يتطلب صلاحية مدير واتصالاً بالإنترنت).'));
  useEffect(() => { load(); listAudit().then(l => setLog(l.slice(0, 60))).catch(() => {}); }, []);
  const [adding, setAdding] = useState(false); const [busy, setBusy] = useState(false);
  const [nu, setNu] = useState<{ name: string; email: string; role: Role; canApprove: boolean; branchIds: string[] }>({ name: '', email: '', role: 'inspector', canApprove: false, branchIds: [] });
  const [created, setCreated] = useState<{ name: string; email: string; password: string; role: Role } | null>(null); const [addErr, setAddErr] = useState(''); const [copied, setCopied] = useState(false);
  const createUser = async (e: React.FormEvent) => {
    e.preventDefault(); setAddErr('');
    if (!nu.name.trim()) { setAddErr('اكتب اسم المستخدم.'); return; }
    if (nu.role === 'branch_manager' && !nu.branchIds.length) { setAddErr('اختر فرع مدير الفرع.'); return; }
    if (!isValidEmail(nu.email.trim())) { setAddErr('اكتب بريداً إلكترونياً صحيحاً.'); return; }
    setBusy(true); const password = generatePassword();
    try { await adminCreateUser({ ...nu, password }); setCreated({ name: nu.name.trim(), email: nu.email.trim().toLowerCase(), password, role: nu.role }); setNu({ name: '', email: '', role: 'inspector', canApprove: false, branchIds: [] }); setAdding(false); load(); }
    catch (er) { const c = (er as { code?: string }).code ?? ''; setAddErr(c.includes('email-already-in-use') ? 'هذا البريد مسجّل مسبقاً. ابحث عنه في القائمة أدناه.' : c.includes('invalid-email') ? 'البريد غير صحيح.' : c.includes('network') ? 'لا يوجد اتصال بالإنترنت.' : 'تعذّر إنشاء الحساب. حاول مرة أخرى.'); }
    setBusy(false);
  };
  const shareText = created ? `مرحباً ${created.name}،\nتم إنشاء حسابك في ريشيو للجودة (${ROLE_LABEL[created.role]}).\nالرابط: ${window.location.origin}\nالبريد: ${created.email}\nكلمة المرور: ${created.password}\nيمكنك تغيير كلمة المرور بعد الدخول من الإعدادات.` : '';
  if (!cloudEnabled) return <div className="page-content"><p>إدارة المستخدمين متاحة عند ربط التطبيق بـ Firebase.</p></div>;
  const admin = profile?.role === 'admin';
  return <div className="page-content">
    <Title eyebrow="الصلاحيات" title="المستخدمون والأدوار" detail="الحسابات تُنشأ بالدعوة. مدير النظام يحدد الدور وصلاحية الاعتماد. صلاحيات الحساب تُفرض أيضاً في قواعد الخادم."/>
    {err && <div className="alert alert-danger">{err}</div>}
    {admin && <section className="surface-card add-user">
      {!adding ? <button type="button" className="button button-primary add-user-open" onClick={() => { setAdding(true); setCreated(null); }} data-testid="button-add-user">+ إضافة مستخدم</button> :
        <form onSubmit={createUser} className="add-user-form"><div className="card-heading"><div className="ch-wrap"><HeadIcon text="إضافة مستخدم حساب جديد"/><div><span className="eyebrow">حساب جديد</span><h2>إضافة مستخدم</h2></div></div></div>
          <label className="field"><span>الاسم <em>*</em></span><input value={nu.name} onChange={e => setNu({ ...nu, name: e.target.value })} placeholder="الاسم الكامل" data-testid="input-new-name"/></label>
          <label className="field"><span>البريد الإلكتروني <em>*</em></span><input type="email" dir="ltr" value={nu.email} onChange={e => setNu({ ...nu, email: e.target.value })} placeholder="name@example.com" data-testid="input-new-email"/></label>
          <label className="field"><span>الدور</span><select value={nu.role} onChange={e => setNu({ ...nu, role: e.target.value as Role })} data-testid="select-new-role">{(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
          {nu.role === 'branch_manager' && <div className="field wide"><span>فرع المدير <em>*</em></span><BranchChooser value={nu.branchIds} onChange={ids => setNu({ ...nu, branchIds: ids })} branches={branches}/><small className="small-muted">يرى تقارير فرعه المعتمدة فقط، ويرد على إجراءاته بصورة إثبات.</small></div>}
          <label className="sig-decline"><input type="checkbox" checked={nu.canApprove} onChange={e => setNu({ ...nu, canApprove: e.target.checked })}/> مخوّل باعتماد التقارير</label>
          <p className="small-muted">تُولَّد كلمة مرور تلقائياً وتظهر لك مرة واحدة لترسلها للمستخدم.</p>
          {addErr && <div className="form-error" role="alert">{addErr}</div>}
          <div className="diag-actions"><button type="submit" className="button button-primary" disabled={busy} data-testid="button-create-user">{busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}</button><button type="button" className="button button-outline" onClick={() => { setAdding(false); setAddErr(''); }}>إلغاء</button></div></form>}
    </section>}
    {created && <section className="surface-card created-user" role="status" data-testid="created-user"><span className="eyebrow">تم إنشاء الحساب</span><h2>{created.name} · {ROLE_LABEL[created.role]}</h2>
      <dl><dt>البريد</dt><dd dir="ltr">{created.email}</dd><dt>كلمة المرور</dt><dd dir="ltr" className="cu-pw" data-testid="created-password">{created.password}</dd></dl>
      <p className="small-muted">احفظها الآن أو أرسلها، لن تظهر مرة ثانية.</p>
      <div className="diag-actions"><button type="button" className="button button-soft" onClick={async () => { try { await navigator.clipboard.writeText(shareText); setCopied(true); } catch { window.prompt('انسخ الرسالة', shareText); } }}>{copied ? 'تم النسخ ✓' : 'نسخ الرسالة'}</button><a className="button button-soft" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">إرسال واتساب</a><button type="button" className="button button-outline" onClick={() => { setCreated(null); setCopied(false); }}>تم</button></div></section>}
    <div className="action-cards">{users.map(u => <section key={u.uid} className="surface-card user-card">
      <div className="action-head"><b>{u.name || u.email}</b><span className="action-date" dir="ltr">{u.email}</span></div>
      <div className="action-edit">
        <label className="field"><span>الدور</span><select disabled={!admin || u.uid === profile?.uid} value={u.role} onChange={async e => { await updateUser(u.uid, { role: e.target.value as Role }); load(); }}>{(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
        {u.role === 'branch_manager' && <div className="field wide"><span>فروع المدير</span><BranchChooser value={u.branchIds ?? []} onChange={async ids => { if (!admin) return; await updateUser(u.uid, { branchIds: ids }); load(); }} branches={branches}/></div>}
        <label className="sig-decline" hidden={u.role === 'branch_manager'}><input type="checkbox" disabled={!admin} checked={u.canApprove} onChange={async e => { await updateUser(u.uid, { canApprove: e.target.checked }); load(); }}/> مخوّل باعتماد التقارير</label>
        <label className="sig-decline"><input type="checkbox" disabled={!admin || u.uid === profile?.uid} checked={u.active} onChange={async e => { await updateUser(u.uid, { active: e.target.checked }); load(); }}/> الحساب نشط</label>
      </div>
      <small>{canApprove(u) ? 'يستطيع الاعتماد' : 'لا يستطيع الاعتماد'}</small>
      <DeviceLine h={health.get(u.uid)}/>
    </section>)}</div>
    {log.length > 0 && <section className="surface-card"><h3>سجل التدقيق (آخر 60 حدثاً)</h3><div className="history">{log.map((l, k) => <div key={k}>{l.at.slice(0, 16).replace('T', ' ')} · {l.actor} · {l.action} · {l.entityId}</div>)}</div></section>}
  </div>;
}

/* ===================== Shared configuration (leads) ===================== */
export function ConfigPage({ data }: { data: AppData }) {
  const profile = useProfile();
  const cfg = useConfig();
  const lead = isQualityLead(profile) || !cloudEnabled;
  const [draft, setDraft] = useState<RecipientList>({ id: '', name: '', to: [], cc: [] });
  const [toText, setTo] = useState(''); const [ccText, setCc] = useState(''); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const parse = (t: string) => t.split(/[\s,،;]+/).map(x => x.trim()).filter(Boolean);
  const togglePhoto = (id: number) => saveConfig({ photoRequiredOnFail: cfg.photoRequiredOnFail.includes(id) ? cfg.photoRequiredOnFail.filter(x => x !== id) : [...cfg.photoRequiredOnFail, id].sort((a, b) => a - b) });
  const saveList = async () => {
    const to = parse(toText), cc = parse(ccText);
    const bad = [...to, ...cc].filter(e => !isValidEmail(e));
    if (!draft.name.trim() || !to.length) { setErr('أدخل اسم القائمة وعنواناً واحداً على الأقل في «إلى».'); return; }
    if (bad.length) { setErr(`عناوين غير صحيحة: ${bad.join('، ')}`); return; }
    const item: RecipientList = { ...draft, id: draft.id || newId(), name: draft.name.trim(), to, cc };
    await saveConfig({ recipientLists: [...cfg.recipientLists.filter(l => l.id !== item.id), item] });
    setDraft({ id: '', name: '', to: [], cc: [] }); setTo(''); setCc(''); setErr(''); setOk('تم حفظ القائمة.');
  };
  return <div className="page-content">
    <Title eyebrow="إعدادات مشتركة" title="الأدلة الإلزامية وقوائم البريد" detail={lead ? 'تُطبَّق على جميع المستخدمين.' : 'للاطلاع فقط — التعديل لمدير الجودة.'}/>
    <section className="surface-card cfg-block"><h3>بنود تتطلب صورة عند «غير مطابق»</h3><p className="muted-text">لن يُسمح بالانتقال أو الإرسال حتى تُرفق صورة لهذه البنود عند عدم المطابقة.</p>
      <div className="cfg-qs">{QUESTIONS.map(q => <label key={q.id} className={`cfg-q ${q.severity === 'Critical' ? 'crit' : ''}`}><input type="checkbox" disabled={!lead} checked={cfg.photoRequiredOnFail.includes(q.id)} onChange={() => togglePhoto(q.id)}/><span>#{q.id} {q.title}</span></label>)}</div>
    </section>
    <section className="surface-card cfg-block"><h3>قوائم مستلمي التقارير</h3><p className="muted-text">أدخل عناوين البريد المعتمدة لديكم فقط. تظهر هذه القوائم في صفحة التقرير لتجهيز الرسالة.</p>
      {cfg.recipientLists.map(l => <div key={l.id} className="cfg-list"><div><b>{l.name}</b>{l.branchId && <small> · {data.branches.find(b => b.id === l.branchId)?.name}</small>}<small dir="ltr">To: {l.to.join(', ')}{l.cc.length ? ` · CC: ${l.cc.join(', ')}` : ''}</small></div>{lead && <div className="approval-actions"><button className="button button-outline" onClick={() => { setDraft(l); setTo(l.to.join(', ')); setCc(l.cc.join(', ')); }}>تعديل</button><button className="button button-outline" onClick={() => window.confirm(`حذف القائمة «${l.name}»؟`) && saveConfig({ recipientLists: cfg.recipientLists.filter(x => x.id !== l.id) })}>حذف</button></div>}</div>)}
      {!cfg.recipientLists.length && <p className="muted-text">لا توجد قوائم بعد.</p>}
      {lead && <div className="form-grid cfg-form">
        <label className="field"><span>اسم القائمة (مثال: إدارة العمليات)</span><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
        <label className="field"><span>خاصة بفرع (اختياري)</span><select value={draft.branchId ?? ''} onChange={e => setDraft({ ...draft, branchId: e.target.value || undefined })}><option value="">لكل الفروع</option>{data.branches.filter(b => !b.archived).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="field"><span>إلى (To)</span><input dir="ltr" inputMode="email" value={toText} onChange={e => setTo(e.target.value)} placeholder="name@company.com, ..."/></label>
        <label className="field"><span>نسخة (CC)</span><input dir="ltr" inputMode="email" value={ccText} onChange={e => setCc(e.target.value)}/></label>
        <button className="button button-primary" onClick={saveList}>{draft.id ? 'حفظ التعديل' : 'إضافة القائمة'}</button>
        {err && <small className="form-error">{err}</small>}{ok && <small className="ok">{ok}</small>}
      </div>}
    </section>
  </div>;
}

/* ===================== Branches: directory + profile ===================== */
const classTone = (c: string | null) => c === 'ممتاز' ? 'good' : c === 'جيد' ? 'ok' : c === 'يحتاج تحسين' ? 'warn' : c === 'غير مقبول' ? 'bad' : 'none';
export function BranchesPage({ data }: { data: AppData }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'name' | 'score' | 'due'>('score');
  const [region, setRegion] = useState(''); const [shown, setShown] = useState(20);
  const [, go] = useLocation();
  const n = q.trim().toLowerCase();
  const regionCounts = useMemo(() => { const m = new Map<string, number>(); for (const b of data.branches) if (!b.archived) { const r = regionOf(b.name); m.set(r, (m.get(r) ?? 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); }, [data.branches]);
  useEffect(() => { setShown(20); }, [q, region, sort]);
  const rows = data.branches.filter(b => !b.archived && (!region || regionOf(b.name) === region) && (!n || b.name.toLowerCase().includes(n) || (b.code ?? '').toLowerCase().includes(n))).map(b => {
    const done = data.inspections.filter(i => i.branchId === b.id && i.status === 'finalized').sort((x, y) => y.date.localeCompare(x.date));
    const last = done[0] ? calculateScore(done[0].questionSnapshot, done[0].answers) : null;
    const open = data.actions.filter(a => a.status !== 'مغلق' && (a.branchId === b.id || a.branchName === b.name));
    const daysSince = done[0] ? Math.floor((Date.now() - new Date(done[0].date.replace(' ', 'T')).getTime()) / 864e5) : null;
    return { b, last, open: open.length, overdue: open.filter(isOverdue).length, visits: done.length, daysSince };
  }).sort((x, y) => sort === 'name' ? x.b.name.localeCompare(y.b.name, 'ar') : sort === 'due' ? (y.daysSince ?? 9999) - (x.daysSince ?? 9999) : (x.last?.score ?? 101) - (y.last?.score ?? 101));
  return <div className="page-content">
    <Title eyebrow="الفروع" title="أداء الفروع" detail={`${rows.length} فرعاً فعّالاً · رتّب لترى الأضعف أداءً أو الأطول بلا زيارة.`}/>
    <SaudiMap branches={data.branches.filter(b => !b.archived)} scores={Object.fromEntries(rows.map(r => [r.b.id, { score: r.last?.score ?? null, cls: r.last?.classification ?? null }])) as BranchScore} onSelect={id => { go(`/branches/${id}`); }}/>
    <div className="branch-tools"><input className="typed-input" value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث بالاسم أو الكود"/>
      <div className="segmented">{([['score', 'الأضعف أولاً'], ['due', 'الأطول بلا زيارة'], ['name', 'أبجدياً']] as const).map(([k, l]) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}</div></div>
    <div className="br-regions">{[['', data.branches.filter(b => !b.archived).length] as [string, number], ...regionCounts].map(([r, c]) => <button key={r || 'all'} type="button" className={region === r ? 'on' : ''} onClick={() => setRegion(r)}>{r ? shortRegion(r) : 'كل المناطق'}<span>{c}</span></button>)}</div>
    <div className="branch-grid">{rows.slice(0, shown).map(r => <Link key={r.b.id} href={`/branches/${r.b.id}`} className="branch-tile">
      <span className={`score-dot ${classTone(r.last?.classification ?? null)}`}>{r.last?.score ?? '—'}{r.last?.score != null && <small>%</small>}</span>
      <span className="bt-main"><b>{r.b.name}</b><small>{r.b.code ?? '—'} · {r.visits ? `${r.visits} زيارة · آخرها قبل ${r.daysSince} يوم` : 'لم يُزر بعد'}</small></span>
      {r.overdue > 0 ? <span className="bt-flag red">{r.overdue} متأخر</span> : r.open > 0 ? <span className="bt-flag">{r.open} مفتوح</span> : null}
    </Link>)}</div>
    {rows.length > shown && <button type="button" className="button button-outline br-more" onClick={() => setShown(v => v + 30)}>عرض المزيد ({rows.length - shown} فرعاً)</button>}
  </div>;
}

export function BranchProfile({ data }: { data: AppData }) {
  const [, params] = useRoute('/branches/:id');
  const b = data.branches.find(x => x.id === params?.id);
  if (!b) return <div className="page-content"><p>الفرع غير موجود.</p></div>;
  const done = data.inspections.filter(i => i.branchId === b.id && i.status === 'finalized').sort((x, y) => x.date.localeCompare(y.date));
  const scored = done.map(i => ({ i, s: calculateScore(i.questionSnapshot, i.answers) }));
  const last = scored.at(-1), prev = scored.at(-2);
  const delta = last?.s.score != null && prev?.s.score != null ? +(last.s.score - prev.s.score).toFixed(1) : null;
  const freq = Object.values(done.flatMap(i => i.questionSnapshot.filter(q => i.answers[q.id]?.value === 'fail' || i.answers[q.id]?.initialValue === 'fail').map(q => q))
    .reduce<Record<number, { q: Question; n: number }>>((m, q) => { (m[q.id] ??= { q, n: 0 }).n++; return m; }, {})).sort((x, y) => y.n - x.n);
  const open = data.actions.filter(a => a.status !== 'مغلق' && (a.branchId === b.id || a.branchName === b.name));
  const W = 320, H = 90, pts = scored.filter(x => x.s.score != null);
  const path = pts.map((x, k) => `${k ? 'L' : 'M'}${pts.length === 1 ? W / 2 : (k / (pts.length - 1)) * (W - 20) + 10},${H - 10 - (x.s.score! / 100) * (H - 20)}`).join(' ');
  return <div className="page-content">
    <Link href="/branches" className="back-link">← الفروع</Link>
    <Title eyebrow={b.code ?? 'فرع'} title={b.name} detail={b.city}/>
    <div className="kpi-grid">
      <div className="surface-card kpi"><small>آخر نتيجة</small><b>{last?.s.score ?? '—'}{last?.s.score != null ? '%' : ''}</b><span className={`trend ${delta == null ? '' : delta >= 0 ? 'up' : 'down'}`}>{delta == null ? '' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} عن السابقة`}</span></div>
      <div className="surface-card kpi"><small>التصنيف</small><b>{last?.s.classification ?? '—'}</b></div>
      <div className="surface-card kpi"><small>زيارات مكتملة</small><b>{done.length}</b></div>
      <div className="surface-card kpi"><small>إجراءات مفتوحة / متأخرة</small><b>{open.length} / {open.filter(isOverdue).length}</b></div>
    </div>
    <div className="analytics-grid">
      <section className="surface-card"><h3>اتجاه النتيجة</h3>{pts.length ? <svg viewBox={`0 0 ${W} ${H}`} className="spark" role="img" aria-label="اتجاه النتيجة عبر الزيارات"><line x1="0" x2={W} y1={H - 10 - 0.9 * (H - 20)} y2={H - 10 - 0.9 * (H - 20)} className="ref"/><line x1="0" x2={W} y1={H - 10 - 0.7 * (H - 20)} y2={H - 10 - 0.7 * (H - 20)} className="ref bad"/><path d={path}/>{pts.map((x, k) => <circle key={k} cx={pts.length === 1 ? W / 2 : (k / (pts.length - 1)) * (W - 20) + 10} cy={H - 10 - (x.s.score! / 100) * (H - 20)} r="4"/>)}</svg> : <p className="muted-text">لا توجد زيارات مكتملة.</p>}<small className="muted-text">الخط العلوي 90% (ممتاز) · السفلي 70% (حد القبول)</small></section>
      <section className="surface-card"><h3>الملاحظات المتكررة في هذا الفرع</h3>{freq.length ? freq.slice(0, 8).map(f => <div key={f.q.id} className="bar-row"><span className="bar-label">#{f.q.id} {f.q.title}</span><span className="bar-track"><i style={{ width: `${f.n / freq[0].n * 100}%` }}/></span><b>{f.n}</b></div>) : <p className="muted-text">لا توجد ملاحظات.</p>}</section>
      <section className="surface-card"><h3>الإجراءات المفتوحة</h3>{open.length ? open.map(a => <div key={a.id} className="mini-row"><span className={`severity-tag ${a.severity.toLowerCase()}`}>{SEV_AR[a.severity]}</span><span>#{a.questionId} {a.description}</span><small>{isOverdue(a) ? 'متأخر' : a.dueDate}</small></div>) : <p className="muted-text">لا توجد إجراءات مفتوحة.</p>}</section>
      <section className="surface-card"><h3>سجل الزيارات</h3>{[...scored].reverse().map(x => <Link key={x.i.id} href={`/reports/${x.i.id}`} className="mini-row"><span>{x.i.date.slice(0, 10)}</span><span>{x.i.inspector}</span><b>{x.s.score ?? '—'}%</b></Link>)}{!scored.length && <p className="muted-text">لا توجد زيارات.</p>}</section>
    </div>
    <Link href="/inspection/new" className="button button-primary full-button">بدء زيارة لهذا الفرع</Link>
  </div>;
}

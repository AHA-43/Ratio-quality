import { useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import type { ActionItem, Barista, BaristaEval, Branch, Equipment, Inspection, Question } from '../data';
import { list, newId, put, QUESTIONS } from '../data';
import { calculateScore } from '../scoring';
import { audit, canApprove, isQualityLead, isValidEmail, listAudit, listUsers, ROLE_LABEL, saveConfig, updateUser, useConfig, useProfile, type Profile, type RecipientList, type Role } from '../session';
import { cloudEnabled } from '../cloud';

export type AppData = { inspections: Inspection[]; branches: Branch[]; actions: ActionItem[]; refresh: () => Promise<void> };
const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const SEV_AR: Record<string, string> = { Critical: 'حرج', Major: 'رئيسي', Minor: 'ثانوي' };
const Title = ({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) =>
  <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{detail && <p>{detail}</p>}</div></div>;

/* ===================== Corrective actions ===================== */
const STATUSES: ActionItem['status'][] = ['مفتوح', 'مُسند', 'قيد المعالجة', 'بانتظار التحقق', 'مغلق'];
export const isOverdue = (a: ActionItem) => a.status !== 'مغلق' && Boolean(a.dueDate) && a.dueDate < today();

export function ActionsBoard({ data }: { data: AppData }) {
  const profile = useProfile();
  const lead = isQualityLead(profile) || !cloudEnabled;
  const [filter, setFilter] = useState<string>('مفتوحة');
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  useEffect(() => { list<Equipment>('equipment').then(setEquipment); }, []);
  const rows = data.actions.filter(a => filter === 'الكل' ? true : filter === 'مفتوحة' ? a.status !== 'مغلق' : filter === 'متأخرة' ? isOverdue(a) : filter === 'متكررة' ? a.recurring : a.status === filter)
    .sort((x, y) => (x.dueDate || '9').localeCompare(y.dueDate || '9'));
  const closed = data.actions.filter(a => a.status === 'مغلق').length;
  const change = async (a: ActionItem, patch: Partial<ActionItem>, note?: string) => {
    const by = profile?.name || profile?.email || 'مستخدم';
    const next: ActionItem = { ...a, ...patch, history: [...(a.history ?? []), { status: patch.status ?? a.status, at: nowIso(), by, note }] };
    if (patch.status === 'مغلق') { next.verifiedBy = by; next.verifiedAt = nowIso(); }
    await put('actions', next); await audit('action.update', 'actions', a.id, { ...patch, note }); await data.refresh();
  };
  return <div className="page-content">
    <Title eyebrow="تحسين مستمر" title="الإجراءات التصحيحية" detail={`مفتوحة ${data.actions.length - closed} · متأخرة ${data.actions.filter(isOverdue).length} · نسبة الإغلاق ${data.actions.length ? Math.round(closed / data.actions.length * 100) : 0}%`}/>
    <div className="filter-scroll">{['مفتوحة', 'متأخرة', 'متكررة', ...STATUSES, 'الكل'].map(s => <button key={s} onClick={() => setFilter(s)} className={`filter-chip ${filter === s ? 'active' : ''}`}>{s}</button>)}</div>
    {!rows.length && <div className="surface-card empty-note">لا توجد إجراءات في هذا التصنيف.</div>}
    <div className="action-cards">{rows.map(a => <section key={a.id} className={`surface-card action-card ${isOverdue(a) ? 'overdue' : ''}`}>
      <div className="action-head"><span className={`severity-tag ${a.severity.toLowerCase()}`}>{SEV_AR[a.severity]}</span>{a.recurring && <span className="wf-pill returned">متكرر</span>}<span className="action-date">{isOverdue(a) ? 'متأخر · ' : ''}الاستحقاق {a.dueDate || '—'}</span></div>
      <h3>{a.title}</h3><p className="action-description">{a.description}</p>{a.recommendation && <p>الإجراء المطلوب: {a.recommendation}</p>}
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
  const [branch, setBranch] = useState(''); const [section, setSection] = useState(''); const [sev, setSev] = useState(''); const [inspector, setInspector] = useState('');
  const comparable = data.inspections.filter(i => i.status === 'finalized' && i.checklistVersion === 'official-pdf-v1');
  const legacy = data.inspections.filter(i => i.status === 'finalized' && i.checklistVersion !== 'official-pdf-v1').length;
  const rows = comparable.filter(i => (!from || i.date >= from) && (!to || i.date.slice(0, 10) <= to) && (!branch || i.branchId === branch) && (!inspector || i.inspector === inspector));
  const scored = rows.map(i => ({ i, s: calculateScore(i.questionSnapshot, i.answers) }));
  const avg = scored.filter(x => x.s.score !== null).reduce((a, x, _, arr) => a + x.s.score! / arr.length, 0);
  const qFilter = (q: Question) => (!section || q.section === section) && (!sev || q.severity === sev);
  const findings = rows.flatMap(i => i.questionSnapshot.filter(q => qFilter(q) && (i.answers[q.id]?.value === 'fail' || i.answers[q.id]?.initialValue === 'fail')).map(q => ({ i, q })));
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
  useEffect(() => { list<Barista>('baristas').then(setBaristas); list<BaristaEval>('baristaEvals').then(setEvals); }, []);
  const rows = baristas.filter(b => !branch || b.branchId === branch).map(b => {
    const es = evals.filter(e => e.baristaId === b.id).sort((x, y) => x.date.localeCompare(y.date));
    const scores = es.map(baristaScore).map(s => s.score).filter((x): x is number => x !== null);
    const gaps = BARISTA_QS.map(q => ({ q, n: es.filter(e => e.answers[q.id] === 'fail').length })).filter(g => g.n >= 2);
    return { b, es, scores, gaps };
  });
  return <div className="page-content">
    <Title eyebrow="أداء الباريستا" title="سجل الباريستا" detail="تاريخ التقييمات الفردية، المقارنة بين الزيارات، وفجوات المهارة المتكررة (بند فشل مرتين أو أكثر)."/>
    <label className="field"><span>الفرع</span><select value={branch} onChange={e => setBranch(e.target.value)}><option value="">الكل</option>{data.branches.filter(b => !b.archived).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    {!rows.length && <div className="surface-card empty-note">لا توجد تقييمات بعد. ابدأ من صفحة الزيارة ← «تقييم الباريستا».</div>}
    <div className="action-cards">{rows.map(({ b, es, scores, gaps }) => <section key={b.id} className="surface-card">
      <div className="action-head"><b>{b.name}</b><span className="action-date">{b.branchName}</span></div>
      <p>التقييمات {es.length} · آخر نتيجة {scores.at(-1) ?? '—'}% · السابقة {scores.at(-2) ?? '—'}%{scores.length >= 2 ? ` · ${scores.at(-1)! >= scores.at(-2)! ? '↑ تحسّن' : '↓ تراجع'}` : ''}</p>
      {gaps.length > 0 && <div className="recurring-hint"><b>يوصى بمتابعة تدريبية في:</b>{gaps.map(g => <small key={g.q.id}>#{g.q.id} {g.q.title} (تكرر {g.n} مرات)</small>)}</div>}
    </section>)}</div>
  </div>;
}

/* ===================== Users & audit (admin) ===================== */
export function UsersPage() {
  const profile = useProfile();
  const [users, setUsers] = useState<Profile[]>([]);
  const [log, setLog] = useState<Awaited<ReturnType<typeof listAudit>>>([]);
  const [err, setErr] = useState('');
  const load = () => listUsers().then(setUsers).catch(() => setErr('تعذّر تحميل المستخدمين (يتطلب صلاحية مدير واتصالاً بالإنترنت).'));
  useEffect(() => { load(); listAudit().then(l => setLog(l.slice(0, 60))).catch(() => {}); }, []);
  if (!cloudEnabled) return <div className="page-content"><p>إدارة المستخدمين متاحة عند ربط التطبيق بـ Firebase.</p></div>;
  const admin = profile?.role === 'admin';
  return <div className="page-content">
    <Title eyebrow="الصلاحيات" title="المستخدمون والأدوار" detail="الحسابات تُنشأ بالدعوة. مدير النظام يحدد الدور وصلاحية الاعتماد. صلاحيات الحساب تُفرض أيضاً في قواعد الخادم."/>
    {err && <div className="alert alert-danger">{err}</div>}
    <div className="action-cards">{users.map(u => <section key={u.uid} className="surface-card user-card">
      <div className="action-head"><b>{u.name || u.email}</b><span className="action-date" dir="ltr">{u.email}</span></div>
      <div className="action-edit">
        <label className="field"><span>الدور</span><select disabled={!admin || u.uid === profile?.uid} value={u.role} onChange={async e => { await updateUser(u.uid, { role: e.target.value as Role }); load(); }}>{(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
        <label className="sig-decline"><input type="checkbox" disabled={!admin} checked={u.canApprove} onChange={async e => { await updateUser(u.uid, { canApprove: e.target.checked }); load(); }}/> مخوّل باعتماد التقارير</label>
        <label className="sig-decline"><input type="checkbox" disabled={!admin || u.uid === profile?.uid} checked={u.active} onChange={async e => { await updateUser(u.uid, { active: e.target.checked }); load(); }}/> الحساب نشط</label>
      </div>
      <small>{canApprove(u) ? 'يستطيع الاعتماد' : 'لا يستطيع الاعتماد'}</small>
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

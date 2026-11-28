import { useState } from 'react';
import { HeadIcon } from './page-icons';
import { list, put, type Inspection } from '../data';
import { audit, isQualityLead, useProfile } from '../session';
import { cloudEnabled } from '../cloud';

type Pack = { format: 'ratio-legacy-reports'; version: number; reports: Inspection[] };
const valid = (x: unknown): x is Pack => Boolean(x && typeof x === 'object' && (x as Pack).format === 'ratio-legacy-reports' && Array.isArray((x as Pack).reports));

/** Quality leads load a prepared file of past reports once; each becomes an approved, read-only "تقرير سابق". */
export function LegacyImportCard({ onDone }: { onDone: () => Promise<void> | void }) {
  const profile = useProfile();
  const [pack, setPack] = useState<Pack | null>(null); const [existing, setExisting] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(0);
  if (cloudEnabled && !isQualityLead(profile)) return null;
  const pick = async (f: File | undefined) => {
    setMsg(''); setPack(null); setDone(0); if (!f) return;
    try { const j = JSON.parse(await f.text()); if (!valid(j)) { setMsg('هذا الملف ليس ملف تقارير سابقة صالحاً.'); return; }
      setExisting(new Set((await list<Inspection>('inspections')).map(i => i.id))); setPack(j); }
    catch { setMsg('تعذّر قراءة الملف.'); }
  };
  const fresh = pack ? pack.reports.filter(r => !existing.has(r.id)) : [];
  const run = async () => {
    if (!pack) return; setBusy(true); let n = 0;
    try { for (const r of fresh) { await put('inspections', { ...r, imported: { ...r.imported!, importedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() }); n++; setDone(n); }
      await audit('reports.import.legacy', 'inspections', `${n}`, { count: n }); setMsg(`تم استيراد ${n} تقرير. سيتم رفع الصور للسحابة تدريجياً.`); setPack(null); await onDone(); }
    catch (e) { console.error(e); setMsg(`توقف الاستيراد بعد ${n} تقرير. أعد المحاولة لإكمال الباقي.`); }
    setBusy(false);
  };
  return <section className="surface-card settings-card legacy-import">
    <div className="card-heading"><div className="ch-wrap"><HeadIcon text="استيراد تقارير سابقة السجل التاريخي"/><div><span className="eyebrow">السجل التاريخي</span><h2>استيراد تقارير سابقة</h2></div></div></div>
    <p className="small-muted">اختر ملف التقارير السابقة المجهّز (‎.json). تُضاف كتقارير معتمدة للقراءة فقط مع صورها وملاحظاتها، ولا تدخل في متوسط الالتزام.</p>
    <label className="button button-soft li-pick"><input type="file" accept=".json,application/json" hidden onChange={e => { pick(e.target.files?.[0]); e.currentTarget.value = ''; }} data-testid="input-legacy-file"/>اختيار الملف</label>
    {pack && <div className="li-list"><b>{pack.reports.length} تقرير في الملف · {fresh.length} جديد</b>
      <ul>{pack.reports.map(r => <li key={r.id} className={existing.has(r.id) ? 'dup' : ''}><span>{r.branchName}</span><small>{r.date.slice(0, 10)} · {Object.keys(r.answers).length} ملاحظة{existing.has(r.id) ? ' · موجود مسبقاً' : ''}</small></li>)}</ul>
      <button type="button" className="button button-primary" disabled={busy || !fresh.length} onClick={run} data-testid="button-legacy-import">{busy ? `جارٍ الاستيراد… ${done}/${fresh.length}` : `استيراد ${fresh.length} تقرير`}</button></div>}
    {msg && <small className={msg.startsWith('تم') ? 'form-ok' : 'form-error'}>{msg}</small>}
  </section>;
}

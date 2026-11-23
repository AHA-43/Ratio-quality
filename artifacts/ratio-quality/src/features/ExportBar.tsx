import { useState } from 'react';
import type { ActionItem, Inspection } from '../data';
import { audit, useConfig } from '../session';
import { deliver, exportPptx, exportXlsx, mailtoLink } from './exports';

export function ExportBar({ inspection, actions }: { inspection: Inspection; actions: ActionItem[] }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const cfg = useConfig();
  const lists = cfg.recipientLists.filter(l => !l.branchId || l.branchId === inspection.branchId);
  const [listId, setListId] = useState('');
  const chosen = lists.find(l => l.id === listId);
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const run = async (kind: 'xlsx' | 'pptx', share: boolean) => {
    setBusy(kind); setErr('');
    try {
      const out = kind === 'xlsx' ? await exportXlsx(inspection, actions) : await exportPptx(inspection, actions);
      await deliver(out.blob, out.name, share);
      audit(`report.export.${kind}`, 'inspections', inspection.id, { share });
    } catch (e) { setErr('تعذّر إنشاء الملف. حاول مرة أخرى.'); console.error(e); }
    setBusy('');
  };
  return <div className="export-bar no-print">
    <button className="button button-outline" disabled={!!busy} onClick={() => window.print()}>PDF / طباعة</button>
    <button className="button button-outline" disabled={!!busy} onClick={() => run('xlsx', false)}>{busy === 'xlsx' ? 'جارٍ الإنشاء…' : 'Excel'}</button>
    <button className="button button-outline" disabled={!!busy} onClick={() => run('pptx', false)}>{busy === 'pptx' ? 'جارٍ الإنشاء…' : 'PowerPoint'}</button>
    {canShare && <button className="button button-soft" disabled={!!busy} onClick={() => run('pptx', true)}>مشاركة العرض</button>}
    {canShare && <button className="button button-soft" disabled={!!busy} onClick={() => run('xlsx', true)}>مشاركة Excel</button>}
    {lists.length > 0 && <select className="typed-input recip-select" value={listId} onChange={e => setListId(e.target.value)} aria-label="قائمة المستلمين"><option value="">اختر المستلمين…</option>{lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
    <a className="button button-soft" href={mailtoLink(inspection, chosen?.to, chosen?.cc)} onClick={e => { if (chosen && !window.confirm(`سيتم تجهيز رسالة إلى: ${chosen.to.join(', ')}${chosen.cc.length ? `\nنسخة: ${chosen.cc.join(', ')}` : ''}\nأرفق ملف التقرير قبل الإرسال. متابعة؟`)) { e.preventDefault(); return; } audit('report.email.draft', 'inspections', inspection.id, { list: chosen?.name }); }}>رسالة بريد جاهزة</a>
    {err && <small className="form-error">{err}</small>}
  </div>;
}

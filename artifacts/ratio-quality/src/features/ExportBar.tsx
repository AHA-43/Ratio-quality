import { useState } from 'react';
import type { ActionItem, Inspection } from '../data';
import { audit } from '../session';
import { deliver, exportPptx, exportXlsx, mailtoLink } from './exports';

export function ExportBar({ inspection, actions }: { inspection: Inspection; actions: ActionItem[] }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
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
    <a className="button button-soft" href={mailtoLink(inspection)}>رسالة بريد جاهزة</a>
    {err && <small className="form-error">{err}</small>}
  </div>;
}

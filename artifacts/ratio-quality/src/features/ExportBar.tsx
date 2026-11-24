import { useState } from 'react';
import type { ActionItem, Inspection } from '../data';
import { useEffect } from 'react';
import { audit, listMail, logMail, useConfig, type MailEntry } from '../session';
import { deliver, exportPptx, exportXlsx, mailtoLink, MAIL_TEMPLATES, renderTemplate, suggestTemplate } from './exports';
import { exportTemplatePptx } from './template-pptx';
import { renderBranchCard } from './branch-card';

export function ExportBar({ inspection, actions }: { inspection: Inspection; actions: ActionItem[] }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const cfg = useConfig();
  const lists = cfg.recipientLists.filter(l => !l.branchId || l.branchId === inspection.branchId);
  const [listId, setListId] = useState('');
  const chosen = lists.find(l => l.id === listId);
  const [tplId, setTplId] = useState(() => suggestTemplate(inspection));
  const [msg, setMsg] = useState(() => renderTemplate(MAIL_TEMPLATES.find(t => t.id === suggestTemplate(inspection)) ?? MAIL_TEMPLATES[0], inspection));
  const [showMsg, setShowMsg] = useState(false);
  const pickTemplate = (id: string) => { setTplId(id); setMsg(renderTemplate(MAIL_TEMPLATES.find(t => t.id === id) ?? MAIL_TEMPLATES[0], inspection)); };
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const run = async (kind: 'xlsx' | 'pptx' | 'tpl' | 'card', share: boolean) => {
    setBusy(kind); setErr('');
    try {
      const out = kind === 'card' ? { blob: await renderBranchCard(inspection), name: `Ratio-card-${inspection.branchCode || 'BRANCH'}-${inspection.date.slice(0, 10)}.png` } : kind === 'xlsx' ? await exportXlsx(inspection, actions) : kind === 'tpl' ? await exportTemplatePptx(inspection, actions) : await exportPptx(inspection, actions);
      await deliver(out.blob, out.name, share);
      logMail({ inspectionId: inspection.id, channel: share ? 'share' : 'download', file: out.name });
      audit(`report.export.${kind}`, 'inspections', inspection.id, { share });
    } catch (e) { setErr('تعذّر إنشاء الملف. حاول مرة أخرى.'); console.error(e); }
    setBusy('');
  };
  return <div className="export-bar no-print">
    <button className="button button-outline" disabled={!!busy} onClick={() => window.print()}>PDF / طباعة</button>
    <button className="button button-soft" disabled={!!busy} onClick={() => run('card', canShare)} data-testid="button-branch-card">{busy === 'card' ? 'جارٍ الإنشاء…' : 'بطاقة الفرع (صورة)'}</button>
    <button className="button button-outline" disabled={!!busy} onClick={() => run('xlsx', false)}>{busy === 'xlsx' ? 'جارٍ الإنشاء…' : 'Excel'}</button>
    <button className="button button-outline" disabled={!!busy} onClick={() => run('tpl', false)}>{busy === 'tpl' ? 'جارٍ الإنشاء…' : 'PowerPoint · القالب المعتمد'}</button>
    <button className="button button-outline" disabled={!!busy} onClick={() => run('pptx', false)}>{busy === 'pptx' ? 'جارٍ الإنشاء…' : 'PowerPoint · عرض مفصّل'}</button>
    {canShare && <button className="button button-soft" disabled={!!busy} onClick={() => run('pptx', true)}>مشاركة العرض</button>}
    {canShare && <button className="button button-soft" disabled={!!busy} onClick={() => run('xlsx', true)}>مشاركة Excel</button>}
    {lists.length > 0 && <select className="typed-input recip-select" value={listId} onChange={e => setListId(e.target.value)} aria-label="قائمة المستلمين"><option value="">اختر المستلمين…</option>{lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
    <a className="button button-soft" href={mailtoLink(inspection, chosen?.to, chosen?.cc, msg)} onClick={e => { if (chosen && !window.confirm(`سيتم تجهيز رسالة إلى: ${chosen.to.join(', ')}${chosen.cc.length ? `\nنسخة: ${chosen.cc.join(', ')}` : ''}\nأرفق ملف التقرير قبل الإرسال. متابعة؟`)) { e.preventDefault(); return; } audit('report.email.draft', 'inspections', inspection.id, { list: chosen?.name }); logMail({ inspectionId: inspection.id, channel: 'email', list: chosen?.name, to: chosen?.to, cc: chosen?.cc }); }}>رسالة بريد جاهزة</a>
    <div className="mail-compose">
      <label className="field"><span>قالب الرسالة</span><select className="typed-input" value={tplId} onChange={e => pickTemplate(e.target.value)}>{MAIL_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <button type="button" className="text-link" onClick={() => setShowMsg(v => !v)}>{showMsg ? 'إخفاء نص الرسالة' : 'معاينة وتعديل نص الرسالة'}</button>
      {showMsg && <div className="mail-preview"><label className="field"><span>الموضوع</span><input value={msg.subject} onChange={e => setMsg({ ...msg, subject: e.target.value })}/></label><label className="field"><span>النص</span><textarea rows={9} value={msg.body} onChange={e => setMsg({ ...msg, body: e.target.value })}/></label><small>التعديل هنا يخص هذه الرسالة فقط. أرفق ملف التقرير يدوياً قبل الإرسال.</small></div>}
    </div>
    {err && <small className="form-error">{err}</small>}
  </div>;
}

export function MailHistory({ inspectionId }: { inspectionId: string }) {
  const [rows, setRows] = useState<MailEntry[]>([]);
  useEffect(() => { const load = () => listMail(inspectionId).then(setRows); load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [inspectionId]);
  if (!rows.length) return null;
  const label = (r: MailEntry) => r.channel === 'email' ? `بريد${r.list ? ` · ${r.list}` : ''}${r.to?.length ? ` · ${r.to.join('، ')}` : ''}` : r.channel === 'share' ? `مشاركة ${r.file ?? ''}` : `تنزيل ${r.file ?? ''}`;
  return <details className="surface-card mail-history no-print"><summary>سجل التوزيع ({rows.length})</summary>{rows.map((r, k) => <div key={k}><span>{r.at.slice(0, 16).replace('T', ' ')}</span><span>{label(r)}</span><small>{r.by}</small></div>)}</details>;
}

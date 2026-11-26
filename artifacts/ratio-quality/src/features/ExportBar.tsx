import { useState } from 'react';
import { hydrate, type ActionItem, type Inspection } from '../data';
import { useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, Image as ImageIcon, LayoutTemplate, Loader2, Mail, Presentation, Printer, Share2 } from 'lucide-react';
import { audit, listMail, logMail, useConfig, type MailEntry } from '../session';
import { deliver, fileBase, exportPptx, exportXlsx, mailtoLink, MAIL_TEMPLATES, renderTemplate, suggestTemplate } from './exports';

export function ExportBar({ inspection: base, actions }: { inspection: Inspection; actions: ActionItem[] }) {
  const inspection = base;
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
  const run = async (kind: 'xlsx' | 'pptx' | 'tpl' | 'card' | 'pdf', share: boolean) => {
    setBusy(kind); setErr('');
    try {
      const inspection = kind === 'pdf' || kind === 'card' ? base : await hydrate(base); // photos are stored apart; load them for the file
      const out = kind === 'pdf' ? await (async () => { const el = document.querySelector<HTMLElement>('.print-report'); if (!el) throw new Error('no report'); const { elementToPdf } = await import('./pdf-export'); return { blob: await elementToPdf(el, { wrapperClass: `page-content report-page ${inspection.imported ? 'is-imported' : ''}`, footer: `ريشيو · تقرير زيارة الجودة · ${inspection.branchName} · ${inspection.date.slice(0, 10)}` }), name: `${fileBase(inspection)}.pdf` }; })() : kind === 'card' ? { blob: await (await import('./branch-card')).renderBranchCard(inspection), name: `Ratio-card-${inspection.branchCode || 'BRANCH'}-${inspection.date.slice(0, 10)}.png` } : kind === 'xlsx' ? await exportXlsx(inspection, actions) : kind === 'tpl' ? await (await import('./template-pptx')).exportTemplatePptx(inspection, actions) : await exportPptx(inspection, actions);
      await deliver(out.blob, out.name, share);
      logMail({ inspectionId: inspection.id, channel: share ? 'share' : 'download', file: out.name });
      audit(`report.export.${kind}`, 'inspections', inspection.id, { share });
    } catch (e) { setErr('تعذّر إنشاء الملف. حاول مرة أخرى.'); console.error(e); }
    setBusy('');
  };
  type Kind = 'xlsx' | 'pptx' | 'tpl' | 'card' | 'pdf';
  // One tap: on phones it opens the share sheet (WhatsApp, Mail, Save to Files…); elsewhere the file downloads.
  const tiles: { kind: Kind; icon: typeof FileText; title: string; sub: string; tone: string; aria?: string; testid?: string }[] = [
    { kind: 'pdf', icon: FileText, title: 'PDF', sub: 'التقرير كاملاً — للطباعة والواتساب', tone: 'red', testid: 'button-pdf' },
    { kind: 'pptx', icon: Presentation, title: 'عرض PowerPoint', sub: 'مفصّل بالصور والملاحظات', tone: 'navy', aria: 'PowerPoint · عرض مفصّل' },
    { kind: 'tpl', icon: LayoutTemplate, title: 'القالب المعتمد', sub: 'PowerPoint بنموذج الشركة', tone: 'camel', aria: 'PowerPoint · القالب المعتمد' },
    { kind: 'xlsx', icon: FileSpreadsheet, title: 'Excel', sub: 'كل البنود والبيانات', tone: 'green', aria: 'Excel' },
    { kind: 'card', icon: ImageIcon, title: 'بطاقة الفرع', sub: 'صورة سريعة للمشاركة', tone: 'corn', testid: 'button-branch-card' },
  ];
  return <section className="export-panel no-print" aria-label="تصدير ومشاركة">
    <header className="xp-head">
      <span className="xp-ico"><Share2 size={18}/></span>
      <div><b>تصدير ومشاركة</b><small>{canShare ? 'اضغط على الشكل المطلوب لمشاركته مباشرة (واتساب، بريد، حفظ في الملفات)' : 'اضغط على الشكل المطلوب لتنزيله على جهازك'}</small></div>
    </header>
    <div className="xp-grid">{tiles.map(t => { const Icon = t.icon; const on = busy === t.kind; return <button key={t.kind} type="button" className={`xp-tile tone-${t.tone} ${on ? 'busy' : ''}`} disabled={!!busy} onClick={() => run(t.kind, canShare)} aria-label={t.aria} data-testid={t.testid}>
      <span className="xp-tile-ico">{on ? <Loader2 size={20} className="spin"/> : <Icon size={20}/>}</span>
      <span className="xp-tile-txt"><b>{t.title}</b><small>{on ? 'جارٍ التجهيز…' : t.sub}</small></span>
      <span className="xp-tile-go" aria-hidden>{canShare ? <Share2 size={15}/> : <Download size={15}/>}</span>
    </button>; })}</div>
    {err && <small className="form-error xp-err">{err}</small>}
    <details className="xp-mail">
      <summary><Mail size={16}/> إرسال بالبريد الإلكتروني</summary>
      <div className="xp-mail-body">
        {lists.length > 0 && <label className="field"><span>المستلمون</span><select className="typed-input" value={listId} onChange={e => setListId(e.target.value)} aria-label="قائمة المستلمين"><option value="">اختر قائمة…</option>{lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
        <label className="field"><span>قالب الرسالة</span><select className="typed-input" value={tplId} onChange={e => pickTemplate(e.target.value)}>{MAIL_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <button type="button" className="text-link" onClick={() => setShowMsg(v => !v)}>{showMsg ? 'إخفاء نص الرسالة' : 'معاينة وتعديل نص الرسالة'}</button>
        {showMsg && <div className="mail-preview"><label className="field"><span>الموضوع</span><input value={msg.subject} onChange={e => setMsg({ ...msg, subject: e.target.value })}/></label><label className="field"><span>النص</span><textarea rows={9} value={msg.body} onChange={e => setMsg({ ...msg, body: e.target.value })}/></label></div>}
        <a className="button button-primary xp-mail-go" href={mailtoLink(inspection, chosen?.to, chosen?.cc, msg)} onClick={e => { if (chosen && !window.confirm(`سيتم تجهيز رسالة إلى: ${chosen.to.join(', ')}${chosen.cc.length ? `\nنسخة: ${chosen.cc.join(', ')}` : ''}\nأرفق ملف التقرير قبل الإرسال. متابعة؟`)) { e.preventDefault(); return; } audit('report.email.draft', 'inspections', inspection.id, { list: chosen?.name }); logMail({ inspectionId: inspection.id, channel: 'email', list: chosen?.name, to: chosen?.to, cc: chosen?.cc }); }}><Mail size={16}/> فتح رسالة بريد جاهزة</a>
        <small className="small-muted">أرفق ملف التقرير (PDF أو PowerPoint) في الرسالة قبل الإرسال.</small>
      </div>
    </details>
    <button type="button" className="text-link xp-print print-only-desktop" onClick={() => window.print()}><Printer size={15}/> طباعة من المتصفح</button>
  </section>;
}

export function MailHistory({ inspectionId }: { inspectionId: string }) {
  const [rows, setRows] = useState<MailEntry[]>([]);
  useEffect(() => { const load = () => listMail(inspectionId).then(setRows); load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [inspectionId]);
  if (!rows.length) return null;
  const label = (r: MailEntry) => r.channel === 'email' ? `بريد${r.list ? ` · ${r.list}` : ''}${r.to?.length ? ` · ${r.to.join('، ')}` : ''}` : r.channel === 'share' ? `مشاركة ${r.file ?? ''}` : `تنزيل ${r.file ?? ''}`;
  return <details className="surface-card mail-history no-print"><summary>سجل التوزيع ({rows.length})</summary>{rows.map((r, k) => <div key={k}><span>{r.at.slice(0, 16).replace('T', ' ')}</span><span>{label(r)}</span><small>{r.by}</small></div>)}</details>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { CornerDownLeft, FileText, ListChecks, MapPin, Search, Store } from 'lucide-react';
import type { ActionItem, Branch, Inspection } from '../data';
import { nameKey } from './text';

type Item = { id: string; group: string; label: string; sub?: string; href: string; icon: typeof Search; key: string };
export const openSearch = () => window.dispatchEvent(new Event('rq-search'));

/** Search everything with one gesture: Ctrl/⌘+K on desktop, the magnifier in the top bar on phones. */
export function SearchPalette({ data, pages }: { data: { inspections: Inspection[]; branches: Branch[]; actions: ActionItem[] }; pages: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [cur, setCur] = useState(0); const [, go] = useLocation(); const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const on = () => { setOpen(true); setQ(''); setCur(0); };
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); on(); } else if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('rq-search', on); window.addEventListener('keydown', key); return () => { window.removeEventListener('rq-search', on); window.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => { if (open) window.setTimeout(() => input.current?.focus(), 30); }, [open]);
  const items = useMemo<Item[]>(() => [
    ...pages.map(p => ({ id: p.href, group: 'الصفحات', label: p.label, href: p.href, icon: FileText, key: nameKey(p.label) })),
    ...data.branches.filter(b => !b.archived).map(b => ({ id: b.id, group: 'الفروع', label: b.name, sub: b.code ?? b.city, href: `/branches/${b.id}`, icon: Store, key: nameKey(`${b.name} ${b.code ?? ''} ${b.city ?? ''}`) })),
    ...data.inspections.slice(0, 300).map(i => ({ id: i.id, group: i.status === 'draft' ? 'مسودات' : 'التقارير', label: `${i.branchName}${i.number ? ` · ${i.number}` : ''}`, sub: `${i.date.slice(0, 10)} · ${i.inspector}`, href: i.status === 'draft' ? `/inspection/${i.id}` : `/reports/${i.id}`, icon: MapPin, key: nameKey(`${i.branchName} ${i.number ?? ''} ${i.inspector} ${i.date}`) })),
    ...data.actions.filter(a => a.status !== 'مغلق').slice(0, 200).map(a => ({ id: a.id, group: 'الإجراءات', label: a.title, sub: a.branchName, href: '/actions', icon: ListChecks, key: nameKey(`${a.title} ${a.branchName}`) })),
  ], [data.inspections, data.branches, data.actions, pages]);
  const results = useMemo(() => { const k = nameKey(q); if (!k) return items.filter(i => i.group === 'الصفحات').slice(0, 8); return k.split(' ').reduce((acc, w) => acc.filter(i => i.key.includes(w)), items).slice(0, 9); }, [q, items]);
  const choose = (i: Item) => { setOpen(false); go(i.href); };
  if (!open) return null;
  return createPortal(<div className="palette" role="dialog" aria-label="بحث" dir="rtl" onClick={() => setOpen(false)}>
    <div className="pal-box" onClick={e => e.stopPropagation()}>
      <div className="pal-input"><Search size={18}/><input ref={input} value={q} onChange={e => { setQ(e.target.value); setCur(0); }} placeholder="ابحث عن فرع أو تقرير أو إجراء أو صفحة…" aria-label="بحث"
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setCur(c => Math.min(c + 1, results.length - 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setCur(c => Math.max(c - 1, 0)); } else if (e.key === 'Enter' && results[cur]) choose(results[cur]); }}/><kbd>Esc</kbd></div>
      <ul className="pal-list" role="listbox">{results.length ? results.map((r, i) => <li key={`${r.group}${r.id}`} role="option" aria-selected={i === cur}><button type="button" className={i === cur ? 'on' : ''} onMouseEnter={() => setCur(i)} onClick={() => choose(r)}><r.icon size={17}/><span><b>{r.label}</b>{r.sub && <small>{r.sub}</small>}</span><em>{r.group}</em>{i === cur && <CornerDownLeft size={14}/>}</button></li>) : <li className="pal-none">لا توجد نتائج لـ «{q}»</li>}</ul>
    </div></div>, document.body);
}

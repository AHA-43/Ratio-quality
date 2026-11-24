import { useEffect, useRef, useState } from 'react';
import { Contrast, Sun, Type } from 'lucide-react';

type Display = { size: 0 | 1 | 2; contrast: boolean };
const KEY = 'rq-display';
const read = (): Display => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) return { size: [0, 1, 2].includes(v.size) ? v.size : 0, contrast: Boolean(v.contrast) }; } catch { /* ignore */ } return { size: 0, contrast: typeof window !== 'undefined' && window.matchMedia?.('(prefers-contrast: more)').matches }; };
const ZOOM = [1, 1.12, 1.26];
export function applyDisplay(d: Display) {
  const el = document.documentElement; el.dataset.contrast = d.contrast ? 'high' : 'normal'; el.style.setProperty('--ui-zoom', String(ZOOM[d.size]));
}
export const initDisplay = () => applyDisplay(read());

/** Top-bar menu for outdoor use: bigger text and a high-contrast, sunlight-friendly theme. */
export function DisplayMenu() {
  const [d, setD] = useState<Display>(read); const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  useEffect(() => { applyDisplay(d); try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } }, [d]);
  useEffect(() => { if (!open) return; const f = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', f); document.addEventListener('touchstart', f as never); return () => { document.removeEventListener('mousedown', f); document.removeEventListener('touchstart', f as never); }; }, [open]);
  return <div className="display-menu" ref={box}>
    <button type="button" className={`icon-button ${d.contrast || d.size ? 'on' : ''}`} onClick={() => setOpen(o => !o)} aria-label="العرض والإضاءة" aria-expanded={open} data-testid="button-display"><Sun size={18}/></button>
    {open && <div className="dm-pop" role="dialog" aria-label="خيارات العرض">
      <b><Type size={15}/> حجم الخط</b>
      <div className="dm-seg">{['عادي', 'كبير', 'أكبر'].map((l, i) => <button type="button" key={l} className={d.size === i ? 'on' : ''} onClick={() => setD({ ...d, size: i as 0 | 1 | 2 })}>{l}</button>)}</div>
      <button type="button" className={`dm-toggle ${d.contrast ? 'on' : ''}`} onClick={() => setD({ ...d, contrast: !d.contrast })} aria-pressed={d.contrast}><Contrast size={18}/><span><b>إضاءة عالية</b><small>تباين أقوى للعمل تحت الشمس</small></span><i/></button>
    </div>}
  </div>;
}

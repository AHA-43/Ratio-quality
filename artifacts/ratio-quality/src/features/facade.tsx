// Photo of the branch from outside: taken at the start of a visit, it opens the report and the PowerPoint cover.
import { useRef, useState } from 'react';
import { Camera, RefreshCw, Store } from 'lucide-react';
import type { Attachment, Inspection } from '../data';

/** Compresses a camera photo to a sync-friendly JPEG (long side ≤ maxSide, ~≤ 600 KB). */
export async function compressPhoto(file: File, maxSide = 1600): Promise<string> {
  const readData = (blob: Blob) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(); r.readAsDataURL(blob); });
  if (!('createImageBitmap' in window)) return readData(file);
  try {
    const bitmap = await createImageBitmap(file);
    let side = maxSide, quality = .8, out = '';
    for (let k = 0; k < 6; k++) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d'); if (!ctx) return readData(file);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      out = canvas.toDataURL('image/jpeg', quality);
      if (out.length < 600_000) break;
      side = Math.round(side * .8); quality = Math.max(.55, quality - .07);
    }
    bitmap.close();
    return out;
  } catch { return readData(file); }
}

export const newFacade = async (file: File): Promise<Attachment> => ({ id: `fac-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: 'واجهة الفرع', type: 'image/jpeg', data: await compressPhoto(file), caption: 'واجهة الفرع' });

/** This visit's facade photo, or the most recent one taken at the same branch (marked as older). */
export function facadeFor(i: Inspection, all: Inspection[]): { photo: Attachment; fromVisit?: Inspection } | null {
  if (i.facade?.data) return { photo: i.facade };
  const prev = all.filter(x => x.id !== i.id && x.branchId === i.branchId && x.facade?.data).sort((a, b) => b.date.localeCompare(a.date))[0];
  return prev?.facade ? { photo: prev.facade, fromVisit: prev } : null;
}

/** Capture/replace control. `photo` is what is shown now (may come from an earlier visit). */
export function FacadeCapture({ photo, older, onPick, compact = false }: { photo?: string; older?: string; onPick: (a: Attachment) => void | Promise<void>; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (files: FileList | null) => {
    const f = files?.[0]; if (!f || !f.type.startsWith('image/')) return;
    setBusy(true);
    try { await onPick(await newFacade(f)); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const file = <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={e => pick(e.target.files)} data-testid="input-facade"/>;
  if (photo) return <div className={`facade-card has ${compact ? 'compact' : ''}`}>
    <img src={photo} alt="واجهة الفرع"/>
    <div className="facade-meta"><b><Store size={15}/> واجهة الفرع</b>{older ? <small>من زيارة {older} — صوّر صورة جديدة</small> : <small>تظهر في بداية التقرير والعرض</small>}</div>
    <button type="button" className="facade-btn" onClick={() => input.current?.click()} disabled={busy}><RefreshCw size={15}/>{busy ? 'جارٍ الحفظ…' : older ? 'صورة جديدة' : 'تغيير'}</button>{file}
  </div>;
  return <button type="button" className={`facade-card empty ${compact ? 'compact' : ''}`} onClick={() => input.current?.click()} disabled={busy} data-testid="button-facade">
    <span className="facade-ico"><Camera size={22}/></span>
    <span><b>{busy ? 'جارٍ الحفظ…' : 'صوّر واجهة الفرع من الخارج'}</b><small>أول صورة في التقرير وفي عرض البوربوينت</small></span>{file}
  </button>;
}

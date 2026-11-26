// Estimated cloud storage used by visits and their photos, against the free Firestore quota (1 GiB).
import { useEffect, useMemo, useState } from 'react';
import { Database } from 'lucide-react';
import { mediaStats, type Inspection } from '../data';

const QUOTA = 1024 ** 3;
const bytesOf = (s: string) => Math.round(s.length * 1.02); // data URLs are ASCII: ~1 byte per char, + doc overhead

export function estimateUsage(list: Inspection[], media = { bytes: 0, images: 0 }) {
  let photos = media.bytes, photoCount = media.images, docs = 0;
  for (const i of list) {
    if (i.training) continue;
    const atts = [...Object.values(i.answers ?? {}).flatMap(a => a.attachments ?? []), ...(i.facade ? [i.facade] : [])];
    for (const a of atts) if (a.data?.startsWith('data:image/')) { photos += bytesOf(a.data); photoCount++; }
    docs += JSON.stringify({ ...i, answers: Object.fromEntries(Object.entries(i.answers ?? {}).map(([k, a]) => [k, { ...a, attachments: (a.attachments ?? []).map(x => ({ ...x, data: '' })) }])), facade: undefined }).length;
  }
  const used = photos + docs; const avgPhoto = photoCount ? photos / photoCount : 350_000;
  return { used, pct: used / QUOTA * 100, photoCount, visits: list.filter(i => !i.training).length, photosLeft: Math.max(0, Math.floor((QUOTA - used) / avgPhoto)) };
}
const fmt = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${Math.max(1, Math.round(b / 1024 ** 2))} MB`;

export function CloudUsageCard({ inspections }: { inspections: Inspection[] }) {
  const [media, setMedia] = useState({ bytes: 0, images: 0 });
  useEffect(() => { mediaStats().then(setMedia).catch(() => {}); }, [inspections.length]);
  const u = useMemo(() => estimateUsage(inspections, media), [inspections, media]);
  const tone = u.pct >= 80 ? 'bad' : u.pct >= 60 ? 'warn' : 'ok';
  return <section className="surface-card settings-card cloud-usage">
    <div className="card-heading"><div><span className="eyebrow">السحابة</span><h2>المساحة المستخدمة</h2></div><Database size={20}/></div>
    <div className={`cu-bar ${tone}`}><i style={{ width: `${Math.min(100, Math.max(1.5, u.pct))}%` }}/></div>
    <div className="cu-row"><b>{fmt(u.used)} من 1 GB</b><span>{u.pct < 1 ? 'أقل من 1%' : `${Math.round(u.pct)}%`}</span></div>
    <p className="small-muted">{u.visits} زيارة · {u.photoCount} صورة. تكفي المساحة المتبقية لقرابة {u.photosLeft.toLocaleString('en')} صورة أخرى.{u.pct >= 80 ? ' اقتربت المساحة من الامتلاء: يلزم ترقية خطة Firebase أو أرشفة الصور القديمة.' : ''}</p>
    <small className="small-muted">تقدير من البيانات الموجودة على هذا الجهاز.</small>
  </section>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import shape from './saudi-shape.json';
import type { Branch } from '../data';
import { branchPos, cityOf, distanceKm, fmtKm, type Pos } from './geo';
import type { BranchScore } from './BranchMap';

const { viewBox, proj, ksa, neighbours } = shape as { viewBox: string; proj: { minLng: number; maxLat: number; k: number; s: number }; ksa: string; neighbours: string };
const [VW, VH] = viewBox.split(' ').slice(2).map(Number);
const xy = (p: { lat: number; lng: number }) => [(p.lng - proj.minLng) * proj.k * proj.s, (proj.maxLat - p.lat) * proj.s] as const;
const toneOf = (v: number | null) => v == null ? 'none' : v >= 90 ? 'good' : v >= 80 ? 'ok' : v >= 70 ? 'warn' : 'bad';

/** The Kingdom's own silhouette; each city is a bubble sized by its branches and coloured by their average result. */
export function SaudiMap({ branches, scores = {}, onSelect, me }: { branches: Branch[]; scores?: BranchScore; onSelect?: (id: string) => void; me?: Pos | null }) {
  const [city, setCity] = useState<string | null>(null);
  const [vb, setVb] = useState({ x: 0, y: 0, w: VW, h: VH });
  const anim = useRef(0);
  const zoomTo = (target: { x: number; y: number; w: number; h: number }) => {
    cancelAnimationFrame(anim.current);
    const from = { ...vb }, t0 = performance.now(), dur = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1 : 650;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      setVb({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e });
      if (k < 1) anim.current = requestAnimationFrame(step); };
    anim.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(anim.current), []);
  const zoom = VW / vb.w;
  const pick = (name: string, x: number, y: number) => {
    if (city === name) { setCity(null); zoomTo({ x: 0, y: 0, w: VW, h: VH }); return; }
    setCity(name);
    // Adaptive zoom: dense areas (e.g. Dammam–Khobar–Dhahran–Qatif) zoom in further so bubbles separate.
    const near = cities.filter(o => o.name !== name).map(o => { const [ox, oy] = xy(o); return Math.hypot(ox - x, oy - y); }).filter(d => d < 90);
    const f = near.length ? Math.min(9, Math.max(4, 160 / Math.max(12, Math.min(...near)))) : 3.2;
    const w = VW / f, h = VH / f;
    zoomTo({ x: Math.min(Math.max(0, x - w / 2), VW - w), y: Math.min(Math.max(0, y - h / 2), VH - h), w, h });
  };
  const cities = useMemo(() => {
    const m = new Map<string, { name: string; items: { b: Branch; p: Pos }[] }>();
    for (const b of branches) { const p = branchPos(b.id, b.name); if (!p) continue; const c = cityOf(b.name); (m.get(c) ?? m.set(c, { name: c, items: [] }).get(c)!).items.push({ b, p }); }
    return [...m.values()].map(c => {
      const lat = c.items.reduce((a, x) => a + x.p.lat, 0) / c.items.length, lng = c.items.reduce((a, x) => a + x.p.lng, 0) / c.items.length;
      const sc = c.items.map(x => scores[x.b.id]?.score).filter((v): v is number => v != null);
      return { ...c, lat, lng, avg: sc.length ? sc.reduce((a, v) => a + v, 0) / sc.length : null, visited: sc.length };
    }).sort((a, b) => b.items.length - a.items.length);
  }, [branches, scores]);
  const active = cities.find(c => c.name === city);
  const meXY = me ? xy(me) : null;
  return <div className="saudi-map">
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label="خريطة فروع ريشيو في المملكة">
      <defs>
        <linearGradient id="ksa-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#efeaf9"/><stop offset="1" stopColor="#dfe3fd"/></linearGradient>
        <pattern id="ksa-pct" width="34" height="34" patternUnits="userSpaceOnUse"><g fill="none" stroke="#07014f" strokeOpacity=".05" strokeWidth="1.4"><circle cx="11" cy="11" r="3.2"/><circle cx="23" cy="23" r="3.2"/><path d="M9 25 25 9"/></g></pattern>
        <filter id="ksa-shadow" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#07014f" floodOpacity=".18"/></filter>
      </defs>
      <path d={neighbours} className="neigh"/>
      <path d={ksa} className="ksa" fill="url(#ksa-fill)" filter="url(#ksa-shadow)" style={{ strokeWidth: 2.6 / zoom }}/>
      <path d={ksa} fill="url(#ksa-pct)" className="ksa-pattern"/>
      <text x="720" y="760" className="sea">بحر العرب</text><text x="95" y="420" className="sea" transform="rotate(52 95 420)">البحر الأحمر</text><text x="905" y="300" className="sea">الخليج العربي</text>
      {cities.map((c, k) => { const [x, y] = xy(c); const r = (16 + Math.sqrt(c.items.length) * 8) / zoom; const showLabel = zoom > 1.5 || c.items.length >= 4 || city === c.name; return <g key={c.name} className={`city tone-${toneOf(c.avg)} ${city === c.name ? 'on' : ''}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} style={{ animationDelay: `${k * 35}ms` }} onClick={() => pick(c.name, x, y)} role="button" aria-label={`${c.name}: ${c.items.length} فروع`}>
        <circle r={r + 8 / zoom} className="halo"/><circle r={r} className="dot" style={{ strokeWidth: 4 / zoom }}/>
        <text className="count" dy={9 / zoom} style={{ fontSize: 26 / zoom }}>{c.items.length}</text>
        {showLabel ? <text className="label" y={-r - 10 / zoom} style={{ fontSize: 30 / zoom, strokeWidth: 8 / zoom }}>{c.name}</text> : null}
      </g>; })}
      {meXY && <g transform={`translate(${meXY[0].toFixed(1)} ${meXY[1].toFixed(1)})`} className="me"><circle r={26 / zoom} className="me-halo"/><circle r={11 / zoom} style={{ strokeWidth: 4 / zoom }}/></g>}
    </svg>
    {zoom > 1.2 && <button type="button" className="sm-reset" onClick={() => { setCity(null); zoomTo({ x: 0, y: 0, w: VW, h: VH }); }}>↺ عرض المملكة كاملة</button>}
    <div className="sm-legend"><span><i className="tone-good"/>ممتاز</span><span><i className="tone-ok"/>جيد</span><span><i className="tone-warn"/>يحتاج تحسين</span><span><i className="tone-bad"/>غير مقبول</span><span><i className="tone-none"/>لم يُزر</span></div>
    {active ? <div className="sm-city"><div className="sm-head"><b>{active.name}</b><small>{active.items.length} فروع{active.avg != null ? ` · متوسط ${active.avg.toFixed(1)}%` : ''}</small><button type="button" onClick={() => { setCity(null); zoomTo({ x: 0, y: 0, w: VW, h: VH }); }}>✕</button></div>
      <div className="sm-list">{active.items.sort((a, b) => me ? distanceKm(me, a.p) - distanceKm(me, b.p) : a.b.name.localeCompare(b.b.name, 'ar')).map(({ b, p }) => { const s = scores[b.id]; return <button type="button" key={b.id} onClick={() => onSelect?.(b.id)} className="sm-branch">
        <span className={`sm-score tone-${toneOf(s?.score ?? null)}`}>{s?.score != null ? Math.round(s.score) : '—'}</span>
        <span className="sm-name"><b>{b.name}</b><small>{b.code ?? ''}{me ? ` · ${fmtKm(distanceKm(me, p))}` : ''}{p.exact ? '' : ' · موقع تقريبي'}</small></span>
      </button>; })}</div></div>
      : <p className="sm-hint">اضغط على مدينة لعرض فروعها</p>}
  </div>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import shape from './saudi-shape.json';
import type { Branch } from '../data';
import { branchPos, cityOf, distanceKm, fmtKm, regionOf, shortRegion, type Pos } from './geo';
import type { BranchScore } from './position';

const { viewBox, proj, ksa, neighbours } = shape as { viewBox: string; proj: { minLng: number; maxLat: number; k: number; s: number }; ksa: string; neighbours: string };
const [VW, VH] = viewBox.split(' ').slice(2).map(Number);
const xy = (p: { lat: number; lng: number }) => [(p.lng - proj.minLng) * proj.k * proj.s, (proj.maxLat - p.lat) * proj.s] as const;
const toneOf = (v: number | null) => v == null ? 'none' : v >= 90 ? 'good' : v >= 80 ? 'ok' : v >= 70 ? 'warn' : 'bad';
const FULL = { x: 0, y: 0, w: VW, h: VH };
type Box = typeof FULL;
type Item = { b: Branch; p: Pos; x: number; y: number };
type Group = { name: string; items: Item[]; x: number; y: number; avg: number | null };
/** "الاحساء - السلمانية" → "السلمانية" (the city is already on screen). */
const shortName = (n: string) => n.includes(' - ') ? n.split(' - ').slice(1).join(' - ').trim() : n;

function group(name: string, items: Item[], scores: BranchScore): Group {
  const x = items.reduce((a, i) => a + i.x, 0) / items.length, y = items.reduce((a, i) => a + i.y, 0) / items.length;
  const sc = items.map(i => scores[i.b.id]?.score).filter((v): v is number => v != null);
  return { name, items, x, y, avg: sc.length ? sc.reduce((a, v) => a + v, 0) / sc.length : null };
}
/** View box around points, padded, never smaller than `min` units, keeping the map's aspect ratio. */
function fit(pts: { x: number; y: number }[], min: number, pad = 0.22): Box {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let w = Math.max(min, (x1 - x0) * (1 + pad * 2)), h = Math.max(min * VH / VW, (y1 - y0) * (1 + pad * 2));
  if (w / h > VW / VH) h = w * VH / VW; else w = h * VW / VH;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  w = Math.min(w, VW); h = Math.min(h, VH);
  return { x: Math.min(Math.max(0, cx - w / 2), VW - w), y: Math.min(Math.max(0, cy - h / 2), VH - h), w, h };
}

/** Kingdom → region → city → branch. Bubbles are sized by branch count and coloured by average result. */
export function SaudiMap({ branches, scores = {}, onSelect, me }: { branches: Branch[]; scores?: BranchScore; onSelect?: (id: string) => void; me?: Pos | null }) {
  const [region, setRegion] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [vb, setVb] = useState<Box>(FULL);
  const anim = useRef(0);
  const zoomTo = (target: Box) => {
    cancelAnimationFrame(anim.current);
    const from = { ...vb }, t0 = performance.now(), dur = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1 : 700;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      setVb({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e });
      if (k < 1) anim.current = requestAnimationFrame(step); };
    anim.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(anim.current), []);
  const zoom = VW / vb.w;

  const items = useMemo(() => branches.map(b => { const p = branchPos(b.id, b.name); if (!p) return null; const [x, y] = xy(p); return { b, p, x, y }; }).filter((i): i is Item => Boolean(i)), [branches]);
  const regions = useMemo(() => {
    const m = new Map<string, Item[]>(); for (const i of items) { const r = regionOf(i.b.name); (m.get(r) ?? m.set(r, []).get(r)!).push(i); }
    return [...m].map(([n, list]) => group(n, list, scores)).sort((a, b) => b.items.length - a.items.length);
  }, [items, scores]);
  const reg = regions.find(r => r.name === region) ?? null;
  const cities = useMemo(() => {
    if (!reg) return [];
    const m = new Map<string, Item[]>(); for (const i of reg.items) { const c = cityOf(i.b.name); (m.get(c) ?? m.set(c, []).get(c)!).push(i); }
    return [...m].map(([n, list]) => group(n, list, scores)).sort((a, b) => b.items.length - a.items.length);
  }, [reg, scores]);
  const cty = cities.find(c => c.name === city) ?? null;

  const openRegion = (name: string) => { const r = regions.find(x => x.name === name); if (!r) return; setRegion(name); setCity(null); setHot(null);
    const cs = new Map<string, Item[]>(); for (const i of r.items) { const c = cityOf(i.b.name); (cs.get(c) ?? cs.set(c, []).get(c)!).push(i); }
    // a region with one city goes straight to its branches
    if (cs.size === 1) { const [only] = cs.keys(); setCity(only); zoomTo(fit(r.items, 16, .14)); } else zoomTo(fit(r.items, 110)); };
  const openCity = (name: string) => { const c = cities.find(x => x.name === name); if (!c) return; setCity(name); setHot(null); zoomTo(fit(c.items, 16, .14)); };
  const home = () => { setRegion(null); setCity(null); setHot(null); zoomTo(FULL); };
  const up = () => { if (city && cities.length > 1) { setCity(null); setHot(null); reg && zoomTo(fit(reg.items, 110)); } else home(); };

  // "Nearest to me": open the city that contains the closest branch.
  useEffect(() => {
    if (!me || !items.length) return;
    let best: Item | null = null, d = Infinity;
    for (const i of items) { const k = distanceKm(me, i.p); if (k < d) { d = k; best = i; } }
    if (!best) return;
    const r = regionOf(best.b.name), c = cityOf(best.b.name);
    setRegion(r); setCity(c); setHot(best.b.id);
    zoomTo(fit(items.filter(i => cityOf(i.b.name) === c), 16, .14));
  }, [me?.lat, me?.lng]);

  const level = cty ? 'city' : reg ? 'region' : 'kingdom';
  // Markers are drawn in an un-zoomed overlay (screen units): constant sizes, crisp text at any zoom.
  const P = (x: number, y: number) => [(x - vb.x) * VW / vb.w, (y - vb.y) * VH / vb.h] as const;
  const rOf = (n: number) => 15 + Math.sqrt(n) * 8;
  /** Greedy label placement: each marker tries above, beside (both sides) and below; a label that would
   *  cover another label or marker is dropped (the marker stays tappable and the list names it). */
  type Spot = 'up' | 'left' | 'right' | 'down';
  const keepLabels = (pts: { id: string; x: number; y: number; text: string; r: number }[], fs: number) => {
    const placed: { x: number; y: number; w: number; h: number }[] = []; const out = new Map<string, Spot>();
    for (const t of pts) {
      const w = t.text.length * fs * 0.56 + 8, h = fs * 1.25;
      const cands: [Spot, number, number][] = [['up', t.x, t.y - t.r - fs * 0.6], ['left', t.x - t.r - 6 - w / 2, t.y], ['right', t.x + t.r + 6 + w / 2, t.y], ['down', t.x, t.y + t.r + fs * 0.9]];
      for (const [spot, cx, cy] of cands) {
        if (cx - w / 2 < 0 || cx + w / 2 > VW || cy - h / 2 < 0 || cy + h / 2 > VH) continue;
        const free = placed.every(o => Math.abs(o.x - cx) > (o.w + w) / 2 || Math.abs(o.y - cy) > (o.h + h) / 2)
          && pts.every(o => { const dx = Math.max(Math.abs(o.x - cx) - w / 2, 0), dy = Math.max(Math.abs(o.y - cy) - h / 2, 0); return Math.hypot(dx, dy) > o.r + 2; });
        if (free) { placed.push({ x: cx, y: cy, w, h }); out.set(t.id, spot); break; }
      }
    }
    return out;
  };
  /** Label text at a chosen spot, relative to the marker centre. */
  const labelAt = (spot: Spot, r: number, fs: number, cls: string, text: string) => {
    const style = { fontSize: fs, strokeWidth: fs * 0.3 } as React.CSSProperties;
    if (spot === 'up') return <text className={cls} y={-r - fs * 0.35} style={style}>{text}</text>;
    if (spot === 'down') return <text className={cls} y={r + fs * 1.05} style={style}>{text}</text>;
    // side labels: anchor by box centre so RTL text sits cleanly
    const w = text.length * fs * 0.56 + 8, x = spot === 'left' ? -r - 6 - w / 2 : r + 6 + w / 2;
    return <text className={cls} x={x} dy={fs * 0.35} style={style}>{text}</text>;
  };
  const meXY = me ? xy(me) : null;
  const listItems = (cty ?? reg)?.items ?? [];
  const sorted = [...listItems].sort((a, b) => me ? distanceKm(me, a.p) - distanceKm(me, b.p) : cityOf(a.b.name).localeCompare(cityOf(b.b.name), 'ar') || a.b.name.localeCompare(b.b.name, 'ar'));
  const byCity = useMemo(() => { const m = new Map<string, Item[]>(); for (const i of sorted) { const c = cityOf(i.b.name); (m.get(c) ?? m.set(c, []).get(c)!).push(i); } return [...m]; }, [sorted]);

  const bubble = (g: Group, label: string, onClick: () => void, k: number, spot: Spot | undefined) => {
    const r = rOf(g.items.length); const [x, y] = P(g.x, g.y);
    return <g key={g.name} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <g className={`city tone-${toneOf(g.avg)}`} style={{ animationDelay: `${k * 35}ms` }} onClick={onClick} role="button" aria-label={`${label}: ${g.items.length} فروع`}>
        <circle r={r + 8} className="halo"/><circle r={r} className="dot" style={{ strokeWidth: 4 }}/>
        <text className="count" dy={9} style={{ fontSize: 26 }}>{g.items.length}</text>
        {spot && labelAt(spot, r + 4, 28, 'label', label)}
      </g></g>;
  };
  const groupLabels = keepLabels((level === 'region' ? cities : level === 'kingdom' ? regions : []).map(c => { const [x, y] = P(c.x, c.y); return { id: c.name, x, y, text: level === 'kingdom' ? shortRegion(c.name) : c.name, r: rOf(c.items.length) + 8 }; }), 28);
  const pinLabels = level === 'city' && cty ? keepLabels([...cty.items].sort((a, b) => (hot === b.b.id ? 1 : 0) - (hot === a.b.id ? 1 : 0) || a.y - b.y).map(i => { const [x, y] = P(i.x, i.y); return { id: i.b.id, x, y, text: hot === i.b.id ? `${shortName(i.b.name)} · 00%` : shortName(i.b.name), r: 17 }; }), 22) : new Map<string, Spot>();

  return <div className={`saudi-map lvl-${level}`}>
    <nav className="sm-crumbs" aria-label="مستوى الخريطة">
      <button type="button" onClick={home} className={level === 'kingdom' ? 'on' : ''}>المملكة</button>
      {reg && <><span>‹</span><button type="button" onClick={() => reg && (cities.length > 1 ? (setCity(null), setHot(null), zoomTo(fit(reg.items, 110))) : undefined)} className={level === 'region' ? 'on' : ''}>{shortRegion(reg.name)}</button></>}
      {cty && cities.length > 1 && <><span>‹</span><button type="button" className="on">{cty.name}</button></>}
    </nav>
    <div className="sm-stage">
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label="خريطة فروع ريشيو في المملكة">
      <defs>
        <linearGradient id="ksa-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#efeaf9"/><stop offset="1" stopColor="#dfe3fd"/></linearGradient>
        <pattern id="ksa-pct" width="34" height="34" patternUnits="userSpaceOnUse"><g fill="none" stroke="#07014f" strokeOpacity=".05" strokeWidth="1.4"><circle cx="11" cy="11" r="3.2"/><circle cx="23" cy="23" r="3.2"/><path d="M9 25 25 9"/></g></pattern>
        <filter id="ksa-shadow" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#07014f" floodOpacity=".18"/></filter>
      </defs>
      <path d={neighbours} className="neigh"/>
      <path d={ksa} className="ksa" fill="url(#ksa-fill)" filter="url(#ksa-shadow)" style={{ strokeWidth: 2.6 / zoom }}/>
      {level === 'kingdom' && <path d={ksa} fill="url(#ksa-pct)" className="ksa-pattern"/>}
      {level === 'kingdom' && <><text x="720" y="760" className="sea">بحر العرب</text><text x="95" y="420" className="sea" transform="rotate(52 95 420)">البحر الأحمر</text><text x="905" y="300" className="sea">الخليج العربي</text></>}

    </svg>
    <svg className="sm-overlay" viewBox={`0 0 ${VW} ${VH}`} aria-hidden={false}>
      {level === 'kingdom' && regions.map((g, k) => bubble(g, shortRegion(g.name), () => openRegion(g.name), k, groupLabels.get(g.name)))}
      {level === 'region' && cities.map((g, k) => bubble(g, g.name, () => openCity(g.name), k, groupLabels.get(g.name)))}
      {level === 'city' && cty && cty.items.map(i => { const s = scores[i.b.id]?.score ?? null; const on = hot === i.b.id; const r = on ? 14 : 10; const [x, y] = P(i.x, i.y);
        return <g key={i.b.id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
          <g className={`kpin tone-${toneOf(s)} ${on ? 'on' : ''} ${i.p.exact ? '' : 'approx'}`} onClick={() => setHot(on ? null : i.b.id)} role="button" aria-label={i.b.name}>
            <circle r={r + 7} className="halo"/><circle r={r} className="dot" style={{ strokeWidth: 3 }}/>
            {(on || pinLabels.has(i.b.id)) && labelAt(pinLabels.get(i.b.id) ?? 'up', r + 3, on ? 25 : 22, 'plabel', `${shortName(i.b.name)}${on && s != null ? ` · ${Math.round(s)}%` : ''}`)}
          </g></g>; })}
      {meXY && (() => { const [x, y] = P(meXY[0], meXY[1]); return <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} className="me"><circle r={26} className="me-halo"/><circle r={11} style={{ strokeWidth: 4 }}/></g>; })()}
    </svg>
    </div>
    {level !== 'kingdom' && <button type="button" className="sm-reset" onClick={up}>{level === 'city' && cities.length > 1 ? `↺ كل ${shortRegion(reg!.name)}` : '↺ عرض المملكة كاملة'}</button>}
    <div className="sm-legend"><span><i className="tone-good"/>ممتاز</span><span><i className="tone-ok"/>جيد</span><span><i className="tone-warn"/>يحتاج تحسين</span><span><i className="tone-bad"/>غير مقبول</span><span><i className="tone-none"/>لم يُزر</span></div>

    {reg ? <div className="sm-city">
      <div className="sm-head"><b>{cty && cities.length > 1 ? cty.name : shortRegion(reg.name)}</b><small>{listItems.length} فروع{(cty ?? reg).avg != null ? ` · متوسط ⁦${(cty ?? reg).avg!.toFixed(1)}%⁩` : ''}</small><button type="button" onClick={home} aria-label="إغلاق">✕</button></div>
      {level === 'region' && cities.length > 1 && <div className="sm-chips">{cities.map(c => <button key={c.name} type="button" onClick={() => openCity(c.name)}><b>{c.name}</b><span>{c.items.length}</span></button>)}</div>}
      <div className="sm-list">{byCity.map(([c, list]) => <div key={c} className="sm-group">
        {level === 'region' && <div className="sm-gh">{c}<small>{list.length}</small></div>}
        {list.map(({ b, p }) => { const s = scores[b.id]; return <button type="button" key={b.id} onClick={() => onSelect?.(b.id)} onMouseEnter={() => level === 'city' && setHot(b.id)} className={`sm-branch ${hot === b.id ? 'on' : ''}`}>
          <span className={`sm-score tone-${toneOf(s?.score ?? null)}`}>{s?.score != null ? Math.round(s.score) : '—'}</span>
          <span className="sm-name"><b>{b.name}</b><small>{b.code ?? ''}{me ? `${b.code ? ' · ' : ''}${fmtKm(distanceKm(me, p))}` : ''}{p.exact ? '' : ' · موقع تقريبي'}</small></span>
        </button>; })}
      </div>)}</div></div>
      : <p className="sm-hint">اضغط على منطقة، ثم على مدينة، لترى مواقع الفروع بالتفصيل</p>}
  </div>;
}

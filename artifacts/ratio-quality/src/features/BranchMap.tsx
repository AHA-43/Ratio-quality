import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Branch } from '../data';
import { branchPos, distanceKm, fmtKm, type Pos } from './geo';

export type BranchScore = Record<string, { score: number | null; cls: string | null }>;
const tone = (c: string | null | undefined) => c === 'ممتاز' ? 'good' : c === 'جيد' ? 'ok' : c === 'يحتاج تحسين' ? 'warn' : c === 'غير مقبول' ? 'bad' : 'none';
const KSA: L.LatLngBoundsExpression = [[16.3, 34.5], [32.2, 55.7]];

/** Interactive Saudi map: brand pins coloured by last result; tap a pin to choose the branch. */
export function BranchMap({ branches, scores = {}, selected, onSelect, me, height = 340 }: { branches: Branch[]; scores?: BranchScore; selected?: string; onSelect?: (id: string) => void; me?: Pos | null; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const pins = useMemo(() => branches.map(b => ({ b, p: branchPos(b.id, b.name) })).filter((x): x is { b: Branch; p: Pos } => Boolean(x.p)), [branches]);
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, maxBounds: [[10, 30], [36, 60]], minZoom: 4 }).fitBounds(KSA);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 18 }).addTo(m);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 18, pane: 'shadowPane' }).addTo(m);
    L.control.zoom({ position: 'bottomleft' }).addTo(m);
    layer.current = L.layerGroup().addTo(m); map.current = m;
    setTimeout(() => m.invalidateSize(), 120);
    return () => { m.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const m = map.current, g = layer.current; if (!m || !g) return;
    g.clearLayers();
    for (const { b, p } of pins) {
      const s = scores[b.id];
      const icon = L.divIcon({ className: '', iconSize: [30, 38], iconAnchor: [15, 36], html: `<div class="pin tone-${tone(s?.cls)} ${b.id === selected ? 'sel' : ''} ${p.exact ? '' : 'approx'}"><span>${s?.score != null ? Math.round(s.score) : '%'}</span></div>` });
      const mk = L.marker([p.lat, p.lng], { icon, title: b.name, riseOnHover: true }).addTo(g);
      const dist = me ? ` · ${fmtKm(distanceKm(me, p))}` : '';
      mk.bindPopup(`<div class="pin-pop"><b>${b.name}</b><small>${b.code ?? ''}${dist}${p.exact ? '' : ' · موقع تقريبي (مركز المدينة)'}</small>${s?.score != null ? `<em class="tone-${tone(s.cls)}">آخر نتيجة ${s.score}% · ${s.cls}</em>` : '<em>لم يُزر بعد</em>'}${selectRef.current ? `<button data-id="${b.id}">اختيار هذا الفرع</button>` : ''}</div>`);
      mk.on('popupopen', e => { (e.popup.getElement()?.querySelector('button') as HTMLButtonElement | null)?.addEventListener('click', () => { selectRef.current?.(b.id); m.closePopup(); }); });
    }
    if (me) L.marker([me.lat, me.lng], { icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="me-dot"></div>' }), interactive: false }).addTo(g);
  }, [pins, JSON.stringify(scores), selected, me?.lat, me?.lng]);
  useEffect(() => {
    const m = map.current; if (!m) return;
    const sel = pins.find(x => x.b.id === selected);
    if (sel) m.flyTo([sel.p.lat, sel.p.lng], 13, { duration: .8 });
    else if (me) m.flyTo([me.lat, me.lng], 11, { duration: .8 });
  }, [selected, me?.lat, me?.lng]);
  return <div className="branch-map" style={{ height }} ref={el} role="application" aria-label="خريطة الفروع"/>;
}

export function useMyPosition() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'denied'>('idle');
  const locate = () => {
    if (!('geolocation' in navigator)) { setState('denied'); return; }
    setState('busy');
    navigator.geolocation.getCurrentPosition(p => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, exact: true }); setState('idle'); }, () => setState('denied'), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };
  return { pos, state, locate };
}

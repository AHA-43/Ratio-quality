// Ratio motion language: everything derives from the brand mark — a cup (U) joined to a "%" (two rings + a slash).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ---------- the mark, as strokes (so it can be drawn) ---------- */
export function RatioMark({ size = 64, color = 'currentColor', draw = false, loop = false, className = '' }: { size?: number; color?: string; draw?: boolean; loop?: boolean; className?: string }) {
  return <svg className={`ratio-mark ${draw ? 'draw' : ''} ${loop ? 'loop' : ''} ${className}`} width={size} height={size * 0.9} viewBox="0 0 100 90" fill="none" stroke={color} strokeWidth="8" strokeLinecap="butt" aria-hidden>
    <path className="m-cup" pathLength={1} d="M4 20 H27 M8 20 V48 A34 34 0 0 0 69 70"/>
    <circle className="m-ring1" pathLength={1} cx="41" cy="21" r="14"/>
    <path className="m-slash" pathLength={1} d="M41 63 L90 14"/>
    <circle className="m-ring2" pathLength={1} cx="74" cy="56" r="14"/>
  </svg>;
}

/* ---------- brand icon set: 24px, 2px strokes, rings + 45° slashes like the mark ---------- */
type IP = { size?: number; className?: string };
const I = (children: React.ReactNode) => ({ size = 20, className = '' }: IP) =>
  <svg className={`r-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>;
export const RIconHome = I(<><path d="M4 11.2 12 4l8 7.2V19a1.2 1.2 0 0 1-1.2 1.2H15v-5.4H9v5.4H5.2A1.2 1.2 0 0 1 4 19z"/></>);
export const RIconVisits = I(<><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z"/><path d="M8 6H6.2A1.2 1.2 0 0 0 5 7.2v12.6A1.2 1.2 0 0 0 6.2 21h11.6a1.2 1.2 0 0 0 1.2-1.2V7.2A1.2 1.2 0 0 0 17.8 6H16"/><path d="M8.8 12.2h6.4M8.8 16.2h4"/></>);
export const RIconActions = I(<><circle cx="12" cy="12" r="8.6"/><path d="m8.2 12.3 2.6 2.7 5-5.4"/></>);
export const RIconReports = I(<><path d="M7 3h7l5 5v11.8A1.2 1.2 0 0 1 17.8 21H7A1.2 1.2 0 0 1 5.8 19.8V4.2A1.2 1.2 0 0 1 7 3z"/><path d="M14 3v5h5"/><path d="M9.2 17.4v-2.6M12 17.4v-4.8M14.8 17.4v-3.4"/></>);
export const RIconSettings = I(<><path d="M4 7.5h8.2M17.4 7.5H20M4 16.5h2.6M11.8 16.5H20"/><circle cx="14.8" cy="7.5" r="2.6"/><circle cx="9.2" cy="16.5" r="2.6"/></>);
export const RIconAnalytics = I(<><path d="M4 20h16"/><path d="M6.5 16v-3.5M10.5 16V8.5M14.5 16v-5M18.5 16V5.5"/></>);

/* ---------- count-up number ---------- */
export function CountUp({ to, decimals = 1, duration = 1100, suffix = '' }: { to: number | null; decimals?: number; duration?: number; suffix?: string }) {
  const [v, setV] = useState(reduced() || to == null ? to : 0);
  useEffect(() => {
    if (to == null || reduced()) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / duration); const e = 1 - Math.pow(1 - k, 3); setV(to * e); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{v == null ? '—' : `${(+v).toFixed(Number.isInteger(to) ? 0 : decimals)}${suffix}`}</>;
}

/* ---------- score ring: the "%" ring fills with the score ---------- */
export function ScoreRing({ score, label, tone = 'navy', size = 140 }: { score: number | null; label?: string; tone?: 'navy' | 'good' | 'ok' | 'warn' | 'bad'; size?: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const [p, setP] = useState(reduced() ? (score ?? 0) : 0);
  useEffect(() => { const t = setTimeout(() => setP(score ?? 0), 60); return () => clearTimeout(t); }, [score]);
  return <div className={`score-ring2 tone-${tone}`} style={{ width: size, height: size } as CSSProperties}>
    <svg viewBox="0 0 120 120" aria-hidden><circle cx="60" cy="60" r={r} className="track"/><circle cx="60" cy="60" r={r} className="fill" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)}/></svg>
    <div><b><CountUp to={score} suffix="%"/></b>{label && <small>{label}</small>}</div>
  </div>;
}

/* ---------- celebration: a burst of brand "%" marks ---------- */
export function Celebrate({ fire }: { fire: number }) {
  const [bits, setBits] = useState<{ id: number; x: number; y: number; r: number; d: number; s: number; c: string }[]>([]);
  const n = useRef(0);
  useEffect(() => {
    if (!fire || reduced()) return;
    const colors = ['#07014F', '#7584F7', '#B66F4A', '#234E31', '#DBD4CA'];
    const batch = Array.from({ length: 28 }, (_, k) => ({ id: ++n.current, x: (Math.random() - .5) * 420, y: -(160 + Math.random() * 320), r: (Math.random() - .5) * 540, d: Math.random() * 120, s: .7 + Math.random() * .9, c: colors[k % colors.length] }));
    setBits(batch); try { navigator.vibrate?.([20, 40, 30]); } catch { /* ignore */ }
    const t = setTimeout(() => setBits([]), 1900); return () => clearTimeout(t);
  }, [fire]);
  if (!bits.length) return null;
  return createPortal(<div className="celebrate" aria-hidden>{bits.map(b => <span key={b.id} style={{ ['--x' as string]: `${b.x}px`, ['--y' as string]: `${b.y}px`, ['--r' as string]: `${b.r}deg`, animationDelay: `${b.d}ms`, color: b.c, fontSize: `${26 * b.s}px` }}>%</span>)}</div>, document.body);
}

/* ---------- reveal-on-scroll for cards ---------- */
export function useReveal() {
  useEffect(() => {
    if (reduced() || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    const scan = () => document.querySelectorAll('.surface-card:not(.reveal), .branch-tile:not(.reveal), .kpi:not(.reveal)').forEach((el, k) => { el.classList.add('reveal'); (el as HTMLElement).style.setProperty('--i', String(k % 8)); io.observe(el); });
    scan(); const mo = new MutationObserver(scan); mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);
}

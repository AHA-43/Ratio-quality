// Pull down at the top of a page to sync: iOS home-screen apps have no native pull-to-refresh.
import { useEffect, useRef, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';

const THRESHOLD = 72;
export function PullToRefresh({ enabled, onRefresh }: { enabled: boolean; onRefresh: () => Promise<unknown> }) {
  const [pull, setPull] = useState(0); const [phase, setPhase] = useState<'idle' | 'pulling' | 'busy' | 'done'>('idle');
  const start = useRef<number | null>(null); const live = useRef(0); const busy = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    const atTop = () => (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;
    const blocked = (t: EventTarget | null) => t instanceof Element && Boolean(t.closest('textarea,input,select,canvas,.leaflet-container,.sig-pad,.saudi-map,.so,.runner-page,.bp-sheet,.install-sheet,[role=dialog],.photo-annotator'));
    const down = (e: TouchEvent) => { start.current = !busy.current && atTop() && !blocked(e.target) && e.touches.length === 1 ? e.touches[0].clientY : null; live.current = 0; };
    const move = (e: TouchEvent) => {
      if (start.current == null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || !atTop()) { if (live.current) { live.current = 0; setPull(0); setPhase('idle'); } return; }
      live.current = Math.min(110, dy * 0.5); setPull(live.current); setPhase('pulling');
    };
    const up = async () => {
      if (start.current == null) return; start.current = null;
      if (live.current >= THRESHOLD * 0.5 && !busy.current) {
        busy.current = true; setPhase('busy'); setPull(48);
        try { await Promise.all([onRefresh(), new Promise(r => setTimeout(r, 700))]); } catch { /* offline: just settle */ }
        setPhase('done'); setPull(48); try { navigator.vibrate?.(10); } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 650)); busy.current = false;
      }
      live.current = 0; setPull(0); setPhase('idle');
    };
    window.addEventListener('touchstart', down, { passive: true }); window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up, { passive: true }); window.addEventListener('touchcancel', up, { passive: true });
    return () => { window.removeEventListener('touchstart', down); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up); window.removeEventListener('touchcancel', up); };
  }, [enabled, onRefresh]);
  if (phase === 'idle' && pull === 0) return null;
  const ready = pull >= THRESHOLD * 0.5;
  return <div className={`ptr ${phase}`} style={{ transform: `translate(-50%, ${pull - 56}px)`, opacity: Math.min(1, pull / 30) }} aria-hidden>
    <span className={`ptr-dot ${ready ? 'ready' : ''}`} style={phase === 'pulling' ? { transform: `rotate(${pull * 4}deg)` } : undefined}>
      {phase === 'done' ? <Check size={18}/> : <RefreshCw size={18} className={phase === 'busy' ? 'spin' : ''}/>}
    </span>
    <small>{phase === 'busy' ? 'جارٍ التحديث…' : phase === 'done' ? 'تم التحديث' : ready ? 'أفلت للتحديث' : 'اسحب للتحديث'}</small>
  </div>;
}

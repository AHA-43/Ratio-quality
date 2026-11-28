// Tells approvers the moment a report is waiting for them: in-app toast, short chime + vibration,
// app-icon badge, and a system notification when the app is in the background (if allowed).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { BellRing, X } from 'lucide-react';
import type { Inspection } from '../data';
import { canApprove, useProfile } from '../session';

const SEEN = 'rq-seen-submitted';
const readSeen = (): Set<string> | null => { try { const v = localStorage.getItem(SEEN); return v ? new Set(JSON.parse(v)) : null; } catch { return null; } };
const writeSeen = (s: Set<string>) => { try { localStorage.setItem(SEEN, JSON.stringify([...s].slice(-500))); } catch { /* ignore */ } };

export function chime() {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext); if (!Ctx) return;
    const ctx = new Ctx(); const t = ctx.currentTime;
    for (const [f, d] of [[880, 0], [1320, 0.13]] as const) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
      o.connect(g).connect(ctx.destination); o.start(t + d); o.stop(t + d + 0.4);
    }
    window.setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch { /* audio blocked until the first tap: fine */ }
}
export async function systemNotify(title: string, body: string, url: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', tag: url, data: { url } } as NotificationOptions);
    else new Notification(title, { body, icon: '/icon-192.png' });
  } catch { /* unsupported */ }
}

export function ApprovalAlert({ inspections }: { inspections: Inspection[] }) {
  const me = useProfile();
  const approver = canApprove(me);
  const pending = useMemo(() => approver ? inspections.filter(i => i.workflow === 'submitted' && !i.training && i.inspectorUid !== me?.uid) : [], [inspections, approver, me?.uid]);
  const [toast, setToast] = useState<Inspection[]>([]);
  const [perm, setPerm] = useState(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const first = useRef(true);

  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    (pending.length ? nav.setAppBadge?.(pending.length) : nav.clearAppBadge?.())?.catch(() => {});
    if (!approver) return;
    let seen = readSeen();
    if (!seen) { seen = new Set(pending.map(i => i.id)); writeSeen(seen); first.current = false; return; } // first run: nothing is "new"
    const fresh = pending.filter(i => !seen!.has(i.id));
    if (!fresh.length) { first.current = false; return; }
    fresh.forEach(i => seen!.add(i.id)); writeSeen(seen);
    setToast(t => [...fresh, ...t].slice(0, 3));
    if (!first.current || document.visibilityState === 'visible') { chime(); try { navigator.vibrate?.([60, 40, 60]); } catch { /* ignore */ } }
    if (document.visibilityState !== 'visible') for (const i of fresh) systemNotify('تقرير بانتظار اعتمادك', `${i.branchName} — ${i.inspector}`, `/reports/${i.id}`);
    first.current = false;
  }, [pending.map(i => i.id).join(','), approver]);

  useEffect(() => { if (!toast.length) return; const t = window.setTimeout(() => setToast([]), 12000); return () => window.clearTimeout(t); }, [toast.length]);

  if (!toast.length) return null;
  const i = toast[0];
  return <div className="approval-toast no-print" role="status" aria-live="polite">
    <span className="at-ico"><BellRing size={20}/></span>
    <Link href={`/reports/${i.id}`} className="at-body" onClick={() => setToast([])}>
      <b>{toast.length > 1 ? `${toast.length} تقارير جديدة بانتظار اعتمادك` : 'تقرير جديد بانتظار اعتمادك'}</b>
      <small>{i.branchName} · {i.inspector}</small>
    </Link>
    {perm === 'default' && <button type="button" className="at-enable" onClick={async () => { try { setPerm(await Notification.requestPermission()); } catch { /* ignore */ } }}>فعّل التنبيهات</button>}
    <button type="button" className="at-x" onClick={() => setToast([])} aria-label="إغلاق"><X size={16}/></button>
  </div>;
}

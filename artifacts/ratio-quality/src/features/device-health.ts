// Each signed-in device posts a small heartbeat (last seen, version, uploads waiting, recent errors) so
// quality leads can tell from the Users page whether someone's phone is stuck — without asking them.
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { auth, fs, isSignedIn } from '../cloud';
import { list, pendingUploadIds, type Inspection } from '../data';
import { appVersion, getErrors } from '../errorlog';
import { getProfile } from '../session';

export type Health = { uid: string; name: string; at: string; version: string; standalone: boolean; device: string; pending: number; oldestPending: string | null; drafts: number; errors: { at: string; where: string; message: string }[]; storageMB: number | null };

const device = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'متصفح'; };
let last = 0, lastKey = '';
/** Posts the heartbeat; throttled to once every 2 minutes unless the pending count changed. */
export async function reportHealth(force = false) {
  if (!fs || !isSignedIn() || !auth?.currentUser) return;
  try {
    const all = await list<Inspection>('inspections');
    const pendingIds = new Set(pendingUploadIds(all));
    const pend = all.filter(i => pendingIds.has(i.id));
    const key = `${pend.length}|${getErrors().length}`;
    if (!force && Date.now() - last < 120_000 && key === lastKey) return;
    last = Date.now(); lastKey = key;
    let storageMB: number | null = null; try { const e = await navigator.storage?.estimate?.(); storageMB = e?.usage != null ? Math.round(e.usage / 1048576) : null; } catch { /* ignore */ }
    const p = getProfile(); const uid = auth.currentUser.uid;
    const h: Health = { uid, name: p?.name || p?.email || '', at: new Date().toISOString(), version: appVersion(), standalone: Boolean(window.matchMedia?.('(display-mode: standalone)').matches), device: device(),
      pending: pend.length, oldestPending: pend.map(i => i.updatedAt).sort()[0] ?? null, drafts: all.filter(i => i.status === 'draft' && !i.training).length,
      errors: getErrors().slice(-5).map(e => ({ at: e.at, where: e.where, message: e.message.slice(0, 160) })), storageMB };
    await setDoc(doc(fs, 'deviceHealth', uid), h);
  } catch { /* offline / not allowed: next time */ }
}
export async function listHealth(): Promise<Map<string, Health>> {
  if (!fs || !isSignedIn()) return new Map();
  try { const s = await getDocs(collection(fs, 'deviceHealth')); return new Map(s.docs.map(d => [d.id, d.data() as Health])); } catch { return new Map(); }
}
export function ago(iso: string): string {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 2) return 'الآن'; if (m < 60) return `قبل ${m} دقيقة`; const h = Math.round(m / 60); if (h < 24) return `قبل ${h} ساعة`; const d = Math.round(h / 24); return `قبل ${d} يوم`;
}

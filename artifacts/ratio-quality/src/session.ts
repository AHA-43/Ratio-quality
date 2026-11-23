// User profile, roles, audit log, inspection numbering and approval workflow.
import { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { auth, cloudEnabled, fs } from './cloud';
import type { Inspection } from './data';

export type Role = 'admin' | 'quality_manager' | 'inspector';
export type Profile = { uid: string; email: string; name: string; role: Role; canApprove: boolean; active: boolean };
export const ROLE_LABEL: Record<Role, string> = { admin: 'مدير النظام', quality_manager: 'مدير الجودة', inspector: 'مفتش جودة' };

const LOCAL_PROFILE: Profile = { uid: 'local', email: '', name: '', role: 'admin', canApprove: true, active: true };
let current: Profile | null = cloudEnabled ? null : LOCAL_PROFILE;
const listeners = new Set<(p: Profile | null) => void>();
const emit = () => listeners.forEach(l => l(current));
const cacheKey = (uid: string) => `rq-profile-${uid}`;

export async function loadProfile(): Promise<Profile | null> {
  if (!cloudEnabled) { current = LOCAL_PROFILE; emit(); return current; }
  const user = auth?.currentUser;
  if (!user || !fs) { current = null; emit(); return null; }
  const fallbackName = user.displayName || (user.email ?? '').split('@')[0];
  try {
    const ref = doc(fs, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const fresh = { email: user.email ?? '', name: fallbackName, role: 'inspector' as Role, canApprove: false, active: true, createdAt: new Date().toISOString() };
      await setDoc(ref, fresh);
      current = { uid: user.uid, ...fresh };
    } else {
      const d = snap.data() as Partial<Profile>;
      if (!d.email || !d.name) await updateDoc(ref, { email: d.email || user.email || '', name: d.name || fallbackName }).catch(() => {});
      current = { uid: user.uid, email: d.email || user.email || '', name: d.name || fallbackName, role: (d.role as Role) || 'inspector', canApprove: Boolean(d.canApprove), active: d.active !== false };
    }
    try { localStorage.setItem(cacheKey(user.uid), JSON.stringify(current)); } catch { /* storage unavailable */ }
  } catch {
    // Offline: use the last known profile; never grant more than an inspector by default.
    let cached: Profile | null = null;
    try { cached = JSON.parse(localStorage.getItem(cacheKey(user.uid)) || 'null'); } catch { /* ignore */ }
    current = cached ?? { uid: user.uid, email: user.email ?? '', name: fallbackName, role: 'inspector', canApprove: false, active: true };
  }
  emit();
  return current;
}

export function useProfile() {
  const [p, setP] = useState<Profile | null>(current);
  useEffect(() => { listeners.add(setP); setP(current); return () => { listeners.delete(setP); }; }, []);
  return p;
}
export const getProfile = () => current;
export const canApprove = (p: Profile | null) => Boolean(p && p.active && (p.role === 'admin' || p.role === 'quality_manager' || p.canApprove));
export const isQualityLead = (p: Profile | null) => Boolean(p && (p.role === 'admin' || p.role === 'quality_manager'));

export async function listUsers(): Promise<Profile[]> {
  if (!fs) return [];
  const snap = await getDocs(collection(fs, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...(d.data() as Omit<Profile, 'uid'>) })).map(u => ({ ...u, active: u.active !== false, canApprove: Boolean(u.canApprove), role: u.role || 'inspector' }));
}
export async function updateUser(uid: string, patch: Partial<Pick<Profile, 'role' | 'canApprove' | 'active' | 'name'>>) {
  if (!fs) return;
  await updateDoc(doc(fs, 'users', uid), patch);
  await audit('user.update', 'users', uid, patch);
}

/** Append-only audit trail (create-only in security rules). Never blocks the user. */
export async function audit(action: string, entity: string, entityId: string, details: Record<string, unknown> = {}) {
  const p = current;
  const entry = { action, entity, entityId, details, uid: auth?.currentUser?.uid ?? 'local', actor: p?.name || p?.email || 'local', at: new Date().toISOString() };
  if (!fs || !auth?.currentUser) return;
  addDoc(collection(fs, 'audit'), JSON.parse(JSON.stringify(entry))).catch(() => {});
}
export async function listAudit(entityId?: string) {
  if (!fs) return [];
  const snap = await getDocs(collection(fs, 'audit'));
  return snap.docs.map(d => d.data() as { action: string; entity: string; entityId: string; actor: string; at: string; details: Record<string, unknown> })
    .filter(e => !entityId || e.entityId === entityId).sort((a, b) => b.at.localeCompare(a.at));
}

/** Sequential, unique inspection number (RQ-YYYY-00001). Needs a connection; returns null offline. */
export async function allocateInspectionNumber(): Promise<string | null> {
  const year = new Date().getFullYear();
  if (!fs || !auth?.currentUser) {
    return `LOCAL-${year}-${Date.now().toString(36).toUpperCase()}`;
  }
  try {
    const ref = doc(fs, 'counters', 'inspections');
    const seq = await runTransaction(fs, async tx => {
      const snap = await tx.get(ref);
      const d = snap.exists() ? snap.data() as { year: number; seq: number } : { year, seq: 0 };
      const next = d.year === year ? d.seq + 1 : 1;
      tx.set(ref, { year, seq: next });
      return next;
    });
    return `RQ-${year}-${String(seq).padStart(5, '0')}`;
  } catch { return null; }
}

/** SHA-256 of the canonical approved content (answers + checklist snapshot + metadata). */
export async function snapshotHash(i: Inspection): Promise<string> {
  const canonical = JSON.stringify({ id: i.id, number: i.number, branchId: i.branchId, date: i.date, inspector: i.inspector, answers: i.answers, questions: i.questionSnapshot, signatures: i.signatures });
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export { workflowLabel } from './labels';

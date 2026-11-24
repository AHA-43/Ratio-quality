// User profile, roles, audit log, inspection numbering and approval workflow.
import { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { auth, cloudEnabled, fs, createAccountAsAdmin } from './cloud';
import type { Inspection, Question } from './data';

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
/** 12-character password from an unambiguous alphabet, shown as xxxx-xxxx-xxxx. */
export function generatePassword() {
  const alpha = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const buf = new Uint32Array(12); crypto.getRandomValues(buf);
  const c = [...buf].map(n => alpha[n % alpha.length]).join(''); return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}
export async function adminCreateUser(input: { name: string; email: string; role: Role; canApprove: boolean; password: string }): Promise<string> {
  const uid = await createAccountAsAdmin(input.email.trim().toLowerCase(), input.password, input.name.trim());
  if (input.role !== 'inspector' || input.canApprove) await updateUser(uid, { role: input.role, canApprove: input.canApprove });
  await audit('user.create', 'users', uid, { email: input.email, role: input.role, canApprove: input.canApprove });
  return uid;
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

/* ---------- shared app configuration (config/app), editable by quality leads ---------- */
export type RecipientList = { id: string; name: string; to: string[]; cc: string[]; branchId?: string };
export type StandardsVersion = { version: number; ranges: Record<string, { min?: number; max?: number }>; criteria: Record<string, string> };
export type AppConfig = { photoRequiredOnFail: number[]; recipientLists: RecipientList[]; standards?: StandardsVersion; standardsHistory?: { version: number; at: string; by: string; changes: string[] }[] };
const EMPTY_CONFIG: AppConfig = { photoRequiredOnFail: [], recipientLists: [] };
let config: AppConfig = (() => { try { return { ...EMPTY_CONFIG, ...JSON.parse(localStorage.getItem('rq-config') || '{}') }; } catch { return EMPTY_CONFIG; } })();
const cfgListeners = new Set<(c: AppConfig) => void>();
export async function loadConfig() {
  if (!fs || !auth?.currentUser) return config;
  try {
    const snap = await getDoc(doc(fs, 'config', 'app'));
    if (snap.exists()) config = { ...EMPTY_CONFIG, ...(snap.data() as Partial<AppConfig>) };
    try { localStorage.setItem('rq-config', JSON.stringify(config)); } catch { /* ignore */ }
  } catch { /* offline: keep cached */ }
  cfgListeners.forEach(l => l(config));
  return config;
}
export async function saveConfig(patch: Partial<AppConfig>) {
  config = { ...config, ...patch };
  try { localStorage.setItem('rq-config', JSON.stringify(config)); } catch { /* ignore */ }
  cfgListeners.forEach(l => l(config));
  if (fs && auth?.currentUser) { await setDoc(doc(fs, 'config', 'app'), JSON.parse(JSON.stringify(config))); await audit('config.update', 'config', 'app', patch as Record<string, unknown>); }
}
export function useConfig() {
  const [c, setC] = useState<AppConfig>(config);
  useEffect(() => { cfgListeners.add(setC); loadConfig(); return () => { cfgListeners.delete(setC); }; }, []);
  return c;
}
export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

/* ---------- report distribution history (who prepared/shared what, to whom) ---------- */
export type MailEntry = { inspectionId: string; channel: 'email' | 'share' | 'download'; list?: string; to?: string[]; cc?: string[]; file?: string; by: string; uid: string; at: string };
export async function logMail(e: Omit<MailEntry, 'by' | 'uid' | 'at'>) {
  const entry: MailEntry = { ...e, by: current?.name || current?.email || 'local', uid: auth?.currentUser?.uid ?? 'local', at: new Date().toISOString() };
  try { const k = `rq-mail-${e.inspectionId}`; const prev = JSON.parse(localStorage.getItem(k) || '[]'); localStorage.setItem(k, JSON.stringify([entry, ...prev].slice(0, 50))); } catch { /* ignore */ }
  if (fs && auth?.currentUser) addDoc(collection(fs, 'mailLog'), JSON.parse(JSON.stringify(entry))).catch(() => {});
}
export async function listMail(inspectionId: string): Promise<MailEntry[]> {
  let local: MailEntry[] = [];
  try { local = JSON.parse(localStorage.getItem(`rq-mail-${inspectionId}`) || '[]'); } catch { /* ignore */ }
  if (!fs || !auth?.currentUser) return local;
  try {
    const { query, where } = await import('firebase/firestore');
    const snap = await getDocs(query(collection(fs, 'mailLog'), where('inspectionId', '==', inspectionId)));
    const cloud = snap.docs.map(d => d.data() as MailEntry);
    const keys = new Set(cloud.map(c => c.at + c.uid));
    return [...cloud, ...local.filter(l => !keys.has(l.at + l.uid))].sort((a, b) => b.at.localeCompare(a.at));
  } catch { return local; }
}

/* ---------- shared, versioned operating standards (measurement ranges / criteria) ---------- */
export const checklistVersionLabel = (c: AppConfig) => `official-pdf-v1.${c.standards?.version ?? 0}`;
export function applyStandards(qs: Question[], c: AppConfig): Question[] {
  const st = c.standards; if (!st) return qs.map(q => ({ ...q }));
  return qs.map(q => {
    const r = st.ranges[q.id]; const crit = st.criteria[q.id];
    return { ...q, ...(crit ? { criterion: crit } : {}), ...(q.measurement && r ? { measurement: { ...q.measurement, ...r } } : {}) };
  });
}
export async function publishStandards(next: Question[], base: Question[]) {
  const prev = config.standards ?? { version: 0, ranges: {}, criteria: {} };
  const ranges: StandardsVersion['ranges'] = {}; const criteria: StandardsVersion['criteria'] = {}; const changes: string[] = [];
  for (const q of next) {
    const b = base.find(x => x.id === q.id)!;
    if (q.measurement && (q.measurement.min !== b.measurement?.min || q.measurement.max !== b.measurement?.max)) ranges[q.id] = { min: q.measurement.min, max: q.measurement.max };
    if (q.criterion !== b.criterion) criteria[q.id] = q.criterion;
    const was = prev.ranges[q.id]; const now = ranges[q.id];
    if (JSON.stringify(was ?? null) !== JSON.stringify(now ?? null)) changes.push(`#${q.id} النطاق: ${was ? `${was.min ?? '—'}–${was.max ?? '—'}` : 'افتراضي'} ← ${now ? `${now.min ?? '—'}–${now.max ?? '—'}` : 'افتراضي'}`);
    if ((prev.criteria[q.id] ?? '') !== (criteria[q.id] ?? '')) changes.push(`#${q.id} نص المعيار`);
  }
  if (!changes.length) return null;
  const version = prev.version + 1;
  await saveConfig({ standards: { version, ranges, criteria }, standardsHistory: [{ version, at: new Date().toISOString(), by: current?.name || current?.email || 'local', changes }, ...(config.standardsHistory ?? [])].slice(0, 100) });
  return version;
}

/** Display name the user chose (shown in greetings, reports, signatures). */
export async function setMyName(name: string) {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean || !current || !fs || !auth?.currentUser) return;
  await updateDoc(doc(fs, 'users', current.uid), { name: clean });
  current = { ...current, name: clean };
  try { localStorage.setItem(cacheKey(current.uid), JSON.stringify(current)); } catch { /* ignore */ }
  emit();
}
export const looksAutoNamed = (p: Profile | null) => Boolean(p && p.email && p.name === p.email.split('@')[0]);

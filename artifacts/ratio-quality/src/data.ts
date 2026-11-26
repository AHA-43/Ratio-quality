import Dexie, { type EntityTable } from 'dexie';
import masterBranches from './branches.master.json';
import extraBranches from './branches.extra.json'; // branches added by hand (survive a re-import of the workbook)
import { ConflictError, DEVICE_ID, cloudEnabled, fillPhotos, isSignedIn, pushDoc, pullAll, removeDoc, watchStore } from './cloud';

export type Severity = 'Critical' | 'Major' | 'Minor';
export type AnswerValue = 'pass' | 'fail' | 'na' | string | number | null;
export type Attachment = { id: string; name: string; type: string; data: string; caption: string; storagePath?: string; annotated?: boolean };
export type Answer = {
  value: AnswerValue;
  initialValue?: AnswerValue;
  entry?: string | string[];
  observation: string;
  recommendation: string;
  recurring: boolean;
  correctedDuringVisit?: boolean;
  correctionNote?: string;
  severity: Severity;
  actual?: number;
  attachments: Attachment[];
  /** 1–5 tasting sub-scores (Q27–31): الحلاوة، الحموضة، القوام، التوازن */
  tasting?: Record<string, number>;
  /** Set when the same question failed at the previous approved visit of this branch. */
  recurringSuggested?: { inspectionId: string; date: string };
  /** Text before the inspector accepted a writing-helper suggestion (audit). */
  textHistory?: { field: 'observation' | 'recommendation'; original: string; accepted: string; at: string }[];
};
export type Question = { id: number; section: string; title: string; severity: Severity; criterion: string; /** Finding imported from a past free-form report: not part of the 46-item score. */ legacy?: boolean; inputType?: 'status' | 'numeric' | 'text' | 'single-choice' | 'multi-choice' | 'rating' | 'date' | 'photo'; options?: string[]; measurement?: { unit: string; min?: number; max?: number } };
export type Inspection = {
  id: string; status: 'draft' | 'finalized'; branchId: string; branchName: string; inspector: string;
  date: string; type: string; shift: string; employees: number; answers: Record<number, Answer>;
  questionSnapshot: Question[]; createdAt: string; updatedAt: string; finalizedAt?: string;
  /** Photo of the branch from outside: opens the report and the PowerPoint cover. */
  facade?: Attachment;
  /** Workflow: draft → submitted → approved, or returned to draft for correction. */
  workflow?: 'submitted' | 'approved' | 'returned';
  number?: string; inspectorUid?: string; inspectorEmail?: string; branchCode?: string;
  startedAt?: string; checklistVersion?: string;
  submittedAt?: string; approvedAt?: string; approvedBy?: { uid: string; name: string };
  returnedAt?: string; returnReason?: string; returnedBy?: { uid: string; name: string };
  snapshotHash?: string;
  signatures?: {
    inspector?: { name: string; image: string; at: string };
    branch?: { name: string; image?: string; at: string; declinedReason?: string };
  };
  previous?: { inspectionId: string; date: string; score: number | null; classification: string | null };
  /** Documented correction of an approved report: a new revision linked to the locked original. */
  amendmentOf?: string; amendmentReason?: string; revision?: number;
  /** Practice visit: never leaves this device and is excluded from every statistic. */
  training?: boolean;
  /** Past report imported from a file (PDF/PowerPoint). No weighted score: it was not built on the 46-item checklist. */
  imported?: { source: string; importedAt: string; classification?: string | null; counts?: { critical?: number; major?: number; minor?: number; total?: number }; team?: string[]; general?: string[]; positives?: { title: string; text: string }[]; unlabeledSeverity?: number };
};
export type Branch = { id: string; code?: string; name: string; city: string; manager?: string; archived: boolean; demo?: boolean; updatedAt?: string };
export type ActionItem = { id: string; title: string; description: string; branchName: string; questionId: number; inspectionId: string; responsible: string; dueDate: string; status: 'مفتوح' | 'مُسند' | 'قيد المعالجة' | 'بانتظار التحقق' | 'مغلق'; severity: Severity; recommendation: string; evidence?: Attachment[];
  branchId?: string; createdAt?: string; history?: { status: string; at: string; by: string; note?: string }[]; verifiedBy?: string; verifiedAt?: string; equipmentId?: string; recurring?: boolean };
export type Equipment = { id: string; branchId: string; branchName: string; category: string; manufacturer: string; model: string; serial?: string; installedAt?: string; status: 'يعمل' | 'يعمل بملاحظات' | 'متوقف' | 'خارج الخدمة'; lastMaintenance?: string; nextMaintenance?: string; log: { at: string; type: 'صيانة' | 'طلب صيانة' | 'ملاحظة فحص'; note: string; by: string }[]; updatedAt: string };
export type Barista = { id: string; name: string; branchId: string; branchName: string; active: boolean; updatedAt: string };
export type BaristaEval = { id: string; baristaId: string; baristaName: string; branchId: string; branchName: string; inspectionId: string; date: string; evaluator: string; evaluatorUid?: string; answers: Record<number, 'pass' | 'fail' | 'na'>; notes: string; updatedAt: string };
type StandardsRecord = { id: 'standards'; questions: Question[]; version?: string };
export const CHECKLIST_VERSION = 'official-pdf-v1';

import { QUESTIONS } from './checklist';
export { QUESTIONS, TASTING_SCORE_IDS, TASTING_SCORE_FIELDS } from './checklist';

type StoreName = 'branches' | 'inspections' | 'actions' | 'settings' | 'equipment' | 'baristas' | 'baristaEvals';
export interface InspectionRepository {
  list<T>(store: StoreName): Promise<T[]>;
  put<T extends { id: string }>(store: StoreName, value: T): Promise<void>;
  remove(store: StoreName, id: string): Promise<void>;
  loadQuestions(): Promise<Question[]>;
  saveQuestions(questions: Question[]): Promise<void>;
}

class RatioDatabase extends Dexie {
  branches!: EntityTable<Branch, 'id'>;
  inspections!: EntityTable<Inspection, 'id'>;
  actions!: EntityTable<ActionItem, 'id'>;
  settings!: EntityTable<StandardsRecord, 'id'>;

  constructor() {
    super('ratio-quality-local-v1');
    this.version(1).stores({
      branches: 'id',
      inspections: 'id, status, branchId, date, inspector',
      actions: 'id, status, inspectionId, dueDate',
      settings: 'id',
    });
    this.version(2).stores({ equipment: 'id, branchId', baristas: 'id, branchId', baristaEvals: 'id, baristaId, inspectionId' });
  }
}

const db = new RatioDatabase();

class DexieInspectionRepository implements InspectionRepository {
  async list<T>(store: StoreName): Promise<T[]> {
    return (await db.table(store).toArray()) as T[];
  }
  async put<T extends { id: string }>(store: StoreName, value: T) {
    await db.table(store).put(value as never);
  }
  async remove(store: StoreName, id: string) {
    await db.table(store).delete(id);
  }
  async loadQuestions(): Promise<Question[]> {
    const record = await db.settings.get('standards');
    // Local edits made against the old provisional checklist are discarded; finalized inspections keep their own snapshots.
    return record?.version === CHECKLIST_VERSION && Array.isArray(record.questions) ? record.questions : QUESTIONS.map(q => ({ ...q }));
  }
  async saveQuestions(questions: Question[]) {
    await db.settings.put({ id: 'standards', questions, version: CHECKLIST_VERSION });
  }
}

export const localRepository: InspectionRepository = new DexieInspectionRepository();
export const list = <T>(store: StoreName) => localRepository.list<T>(store);
/* ---- sync bookkeeping for conflict detection: last updatedAt known to match the cloud ---- */
const syncedKey = 'rq-synced';
const readSynced = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(syncedKey) || '{}'); } catch { return {}; } };
export function markSynced(id: string, at?: string) { if (!at) return; try { const m = readSynced(); m[id] = at; localStorage.setItem(syncedKey, JSON.stringify(m)); } catch { /* ignore */ } }
/** Records whose latest local version has not been confirmed as matching the cloud (not uploaded yet). */
export function pendingUploadIds(list: { id: string; updatedAt: string; training?: boolean }[]): string[] { const m = readSynced(); return list.filter(i => !i.training && m[i.id] !== i.updatedAt).map(i => i.id); }
export function getConflict(id: string): Inspection | null { try { return JSON.parse(localStorage.getItem(`rq-conflict-${id}`) || 'null'); } catch { return null; } }
const conflictListeners = new Set<(id: string) => void>();
export const onConflict = (fn: (id: string) => void) => { conflictListeners.add(fn); return () => { conflictListeners.delete(fn); }; };
export function saveConflict(c: Inspection) { try { localStorage.setItem(`rq-conflict-${c.id}`, JSON.stringify(c)); } catch { /* ignore */ } conflictListeners.forEach(f => f(c.id)); }
export function clearConflict(id: string) { try { const c = JSON.parse(localStorage.getItem(`rq-conflict-${id}`) || 'null'); if (c?.updatedAt) markSynced(id, c.updatedAt); localStorage.removeItem(`rq-conflict-${id}`); } catch { /* ignore */ } }
/* Change notifications: 'cloud' = records arrived from another device (screens re-read), 'pushed' = uploads confirmed. */
type ChangeKind = 'cloud' | 'pushed';
const changeListeners = new Set<(k: ChangeKind) => void>();
export const onDataChange = (fn: (k: ChangeKind) => void) => { changeListeners.add(fn); return () => { changeListeners.delete(fn); }; };
const emitChange = (k: ChangeKind) => changeListeners.forEach(f => { try { f(k); } catch { /* ignore */ } });
/* Per-document push queue: one write in flight per doc; while it runs, only the newest version waits (coalesced). */
const inflight = new Map<string, Promise<void>>();
const pending = new Map<string, { store: StoreName; value: { id: string } }>();
function schedulePush(store: StoreName, value: { id: string }) {
  const key = `${store}/${value.id}`;
  pending.set(key, { store, value });
  if (inflight.has(key)) return;
  const run = async () => {
    while (pending.has(key)) {
      const job = pending.get(key)!; pending.delete(key);
      try {
        const uploaded = await pushDoc(job.store, job.value as never, readSynced()[job.value.id]);
        markSynced(job.value.id, (job.value as { updatedAt?: string }).updatedAt); emitChange('pushed');
        if (job.store === 'inspections' && Object.keys(uploaded).length) {
          // remember photo references locally (keep the local image data too)
          const cur = await localRepository.list<Inspection>('inspections').then(all => all.find(x => x.id === job.value.id));
          if (cur) { for (const ans of Object.values(cur.answers)) for (const a of ans.attachments) if (uploaded[a.id]) a.storagePath = uploaded[a.id]; if (cur.facade && uploaded[cur.facade.id]) cur.facade.storagePath = uploaded[cur.facade.id]; await localRepository.put('inspections', cur as never); }
        }
      } catch (e) {
        if (e instanceof ConflictError) { saveConflict(e.cloud as unknown as Inspection); pending.delete(key); }
        // offline / transient: the newest local version is pushed again by the next save or the reconnect sync
      }
    }
  };
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
}
export async function put<T extends { id: string }>(store: StoreName, value: T) {
  await localRepository.put(store, value);
  // Cloud mirroring never blocks or breaks local saving (offline-safe).
  if (cloudEnabled && isSignedIn() && store !== 'settings' && !(value as { training?: boolean }).training) schedulePush(store, value);
}
export async function remove(store: StoreName, id: string) {
  await localRepository.remove(store, id);
  if (cloudEnabled && isSignedIn()) removeDoc(store, id).catch(() => {});
}
/** Cloud copies carry photo references, never device-only videos: keep any media this device already has. */
function keepLocalMedia(local: Inspection, cloud: Inspection) {
  for (const [qid, ans] of Object.entries(cloud.answers ?? {})) {
    const mine = local.answers?.[Number(qid)]?.attachments ?? [];
    for (const a of ans.attachments ?? []) if (!a.data) { const m = mine.find(x => x.id === a.id); if (m?.data) a.data = m.data; }
    for (const m of mine) if (m.type.startsWith('video/') && !(ans.attachments ?? []).some(a => a.id === m.id)) (ans.attachments ??= []).push(m);
  }
  if (cloud.facade && !cloud.facade.data && local.facade?.id === cloud.facade.id) cloud.facade.data = local.facade.data;
}
const SYNC_STORES = ['branches', 'inspections', 'actions', 'equipment', 'baristas', 'baristaEvals'] as const;
type Rec = { id: string; updatedAt?: string };
/** Brings cloud records that are new or newer into the device store. Returns how many were written. */
let applyLock: Promise<unknown> = Promise.resolve();
function applyCloud(store: StoreName, cloud: Rec[]): Promise<number> {
  // The live listener and a full sync can deliver the same record together: apply one batch at a time.
  const run = applyLock.then(() => applyCloudNow(store, cloud));
  applyLock = run.catch(() => 0);
  return run;
}
async function applyCloudNow(store: StoreName, cloud: Rec[]): Promise<number> {
  const local = await localRepository.list<Rec>(store);
  const localById = new Map(local.map(x => [x.id, x]));
  let wrote = 0;
  for (const c of cloud) {
    const l = localById.get(c.id);
    const base = readSynced()[c.id];
    const li = l as unknown as Inspection | undefined, ci = c as unknown as Inspection;
    if (store === 'inspections' && li && li.status === 'draft' && ci.status === 'draft' && base && c.updatedAt && l!.updatedAt
        && c.updatedAt > base && l!.updatedAt > base && c.updatedAt !== l!.updatedAt && (c as { _writer?: string })._writer !== DEVICE_ID) {
      // Both devices changed the same draft since the last sync: keep both, let the inspector decide per item.
      saveConflict(ci);
      continue;
    }
    if (!l || (c.updatedAt && l.updatedAt && c.updatedAt > l.updatedAt)) {
      const copy = JSON.parse(JSON.stringify(c)) as Rec;
      if (store === 'inspections') { if (l) keepLocalMedia(l as unknown as Inspection, copy as unknown as Inspection); await fillPhotos(copy as never).catch(() => {}); }
      delete (copy as { _writer?: string })._writer;
      markSynced(c.id, c.updatedAt);
      await localRepository.put(store, copy as never);
      wrote++;
    } else if (c.updatedAt && l.updatedAt === c.updatedAt) markSynced(c.id, c.updatedAt);
  }
  return wrote;
}
/** After sign-in / on resume: bring down anything missing or newer, then push local-only items up. One run at a time. */
let syncing: Promise<void> | null = null;
export function syncAll(): Promise<void> {
  if (!cloudEnabled || !isSignedIn()) return Promise.resolve();
  if (syncing) return syncing;
  syncing = runSync().finally(() => { syncing = null; });
  return syncing;
}
async function runSync() {
  let wrote = 0;
  for (const store of SYNC_STORES) {
    let cloud: Rec[];
    // A store the user may not read (e.g. barista evaluations for inspectors) must not stop the others.
    try { cloud = await pullAll(store); } catch { continue; }
    wrote += await applyCloud(store, cloud);
    if (wrote) { emitChange('cloud'); wrote = 0; }
    if (store === 'branches') continue; // master data: only edits made through the app (put) reach the cloud
    const local = await localRepository.list<Rec>(store);
    const cloudById = new Map(cloud.map(x => [x.id, x]));
    for (const l of local) {
      const c = cloudById.get(l.id);
      if ((l as { training?: boolean }).training) continue; // practice visits stay on the device
      if (getConflict(l.id)) continue;
      if (!c || (c.updatedAt && l.updatedAt && l.updatedAt > c.updatedAt)) { const ok = await pushDoc(store, l as never, readSynced()[l.id]).then(() => true).catch(e => { if (e instanceof ConflictError) saveConflict(e.cloud as unknown as Inspection); return false; }); if (ok) markSynced(l.id, l.updatedAt); }
    }
    emitChange('pushed');
  }
}
/** Real-time: visits and actions from other users appear without reopening the app. Returns a stop function. */
export function startLiveSync(): () => void {
  if (!cloudEnabled || !isSignedIn()) return () => {};
  const stops = (['inspections', 'actions'] as const).map(store => {
    let queue = Promise.resolve();
    return watchStore(store, docs => { queue = queue.then(() => applyCloud(store, docs)).then(n => { if (n) emitChange('cloud'); }).catch(() => {}); });
  });
  return () => stops.forEach(f => f());
}
export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const emptyAnswer = (): Answer => ({ value: null, observation: '', recommendation: '', recurring: false, severity: 'Minor', attachments: [] });
type MasterBranch = { id: string; code: string | null; nameAr: string; status: string; ownership?: string; city?: string };
const BRANCH_MASTER_VERSION = 'master-5';
export async function initializeBranches() {
  const branches = await list<Branch>('branches');
  let applied = '';
  try { applied = localStorage.getItem('rq-branch-master') ?? ''; } catch { /* ignore */ }
  if (applied === BRANCH_MASTER_VERSION && branches.some(b => b.code)) return;
  // Approved branch master (see docs/branch-import-report.md): upsert by id, keep user edits like manager names.
  const byId = new Map(branches.map(b => [b.id, b]));
  const stamp = new Date().toISOString();
  for (const m of [...masterBranches, ...extraBranches] as MasterBranch[]) {
    const city = m.city ?? m.nameAr.split(' - ')[0].trim();
    const prev = byId.get(m.id);
    const archived = m.status !== 'active';
    if (prev && prev.archived === archived && prev.name === m.nameAr.trim()) continue;
    // Local only: the master ships with the app; pushing it from every device floods the write queue.
    await localRepository.put('branches', { ...(prev ?? {}), id: m.id, code: m.code ?? undefined, name: m.nameAr.trim(), city: prev?.city || city, archived, updatedAt: stamp } as Branch);
  }
  // Old sample branches are archived (not deleted) so existing drafts keep working.
  for (const b of branches.filter(b => b.demo && !b.archived)) await localRepository.put('branches', { ...b, archived: true });
  try { localStorage.setItem('rq-branch-master', BRANCH_MASTER_VERSION); } catch { /* ignore */ }
}
export const loadQuestions = () => localRepository.loadQuestions();
export const saveQuestions = (questions: Question[]) => localRepository.saveQuestions(questions);

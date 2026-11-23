import Dexie, { type EntityTable } from 'dexie';
import masterBranches from './branches.master.json';
import { cloudEnabled, isSignedIn, pushDoc, pullAll, removeDoc } from './cloud';

export type Severity = 'Critical' | 'Major' | 'Minor';
export type AnswerValue = 'pass' | 'fail' | 'na' | string | number | null;
export type Attachment = { id: string; name: string; type: string; data: string; caption: string; storagePath?: string };
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
};
export type Question = { id: number; section: string; title: string; severity: Severity; criterion: string; inputType?: 'status' | 'numeric' | 'text' | 'single-choice' | 'multi-choice' | 'rating' | 'date' | 'photo'; options?: string[]; measurement?: { unit: string; min?: number; max?: number } };
export type Inspection = {
  id: string; status: 'draft' | 'finalized'; branchId: string; branchName: string; inspector: string;
  date: string; type: string; shift: string; employees: number; answers: Record<number, Answer>;
  questionSnapshot: Question[]; createdAt: string; updatedAt: string; finalizedAt?: string;
};
export type Branch = { id: string; code?: string; name: string; city: string; manager?: string; archived: boolean; demo?: boolean };
export type ActionItem = { id: string; title: string; description: string; branchName: string; questionId: number; inspectionId: string; responsible: string; dueDate: string; status: 'مفتوح' | 'قيد المعالجة' | 'بانتظار التحقق' | 'مغلق'; severity: Severity; recommendation: string; evidence?: Attachment[] };
type StandardsRecord = { id: 'standards'; questions: Question[]; version?: string };
export const CHECKLIST_VERSION = 'official-pdf-v1';

import { QUESTIONS } from './checklist';
export { QUESTIONS, TASTING_SCORE_IDS, TASTING_SCORE_FIELDS } from './checklist';

type StoreName = 'branches' | 'inspections' | 'actions' | 'settings';
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
export async function put<T extends { id: string }>(store: StoreName, value: T) {
  await localRepository.put(store, value);
  if (cloudEnabled && isSignedIn() && store !== 'settings') {
    // Cloud mirroring never blocks or breaks local saving (offline-safe). Firestore queues writes itself.
    pushDoc(store, value as never).then(async uploaded => {
      if (store === 'inspections' && Object.keys(uploaded).length) {
        const insp = value as unknown as Inspection;
        for (const ans of Object.values(insp.answers)) for (const a of ans.attachments) if (uploaded[a.id]) a.storagePath = uploaded[a.id];
        await localRepository.put(store, insp as never);
      }
    }).catch(() => {});
  }
}
export async function remove(store: StoreName, id: string) {
  await localRepository.remove(store, id);
  if (cloudEnabled && isSignedIn()) removeDoc(store, id).catch(() => {});
}
/** After sign-in: bring down anything missing/newer from the cloud, then push local-only items up. */
export async function syncAll() {
  if (!cloudEnabled || !isSignedIn()) return;
  for (const store of ['branches', 'inspections', 'actions'] as const) {
    const [cloud, local] = await Promise.all([pullAll(store), localRepository.list<{ id: string; updatedAt?: string }>(store)]);
    const localById = new Map(local.map(x => [x.id, x]));
    const cloudIds = new Set(cloud.map(x => x.id));
    for (const c of cloud) {
      const l = localById.get(c.id);
      if (!l || (c.updatedAt && l.updatedAt && c.updatedAt > l.updatedAt)) await localRepository.put(store, c as never);
    }
    for (const l of local) {
      const c = cloud.find(x => x.id === l.id);
      if (!cloudIds.has(l.id) || (c?.updatedAt && l.updatedAt && l.updatedAt > c.updatedAt)) await pushDoc(store, l as never).catch(() => {});
    }
  }
}
export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const emptyAnswer = (): Answer => ({ value: null, observation: '', recommendation: '', recurring: false, severity: 'Minor', attachments: [] });
type MasterBranch = { id: string; code: string | null; nameAr: string; status: string; ownership?: string };
export async function initializeBranches() {
  const branches = await list<Branch>('branches');
  if (branches.some(b => b.code)) return;
  // Approved branch master (see docs/branch-import-report.md). Branches needing owner review stay archived/hidden.
  for (const m of masterBranches as MasterBranch[]) {
    const city = m.nameAr.split(' - ')[0].trim();
    await put('branches', { id: m.id, code: m.code ?? undefined, name: m.nameAr.trim(), city, archived: m.status !== 'active' } satisfies Branch);
  }
  // Old sample branches are archived (not deleted) so existing drafts keep working.
  for (const b of branches.filter(b => b.demo && !b.archived)) await put('branches', { ...b, archived: true });
}
export const loadQuestions = () => localRepository.loadQuestions();
export const saveQuestions = (questions: Question[]) => localRepository.saveQuestions(questions);

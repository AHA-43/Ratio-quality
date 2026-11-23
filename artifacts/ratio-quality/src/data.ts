import Dexie, { type EntityTable } from 'dexie';

export type Severity = 'Critical' | 'Major' | 'Minor';
export type AnswerValue = 'pass' | 'fail' | 'na' | string | number | null;
export type Attachment = { id: string; name: string; type: string; data: string; caption: string };
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
export type Question = { id: number; section: string; title: string; severity: Severity; criterion: string; inputType?: 'status' | 'numeric' | 'text' | 'single-choice' | 'multi-choice' | 'rating' | 'date' | 'photo'; options?: string[]; measurement?: { unit: string; min: number; max: number } };
export type Inspection = {
  id: string; status: 'draft' | 'finalized'; branchId: string; branchName: string; inspector: string;
  date: string; type: string; shift: string; employees: number; answers: Record<number, Answer>;
  questionSnapshot: Question[]; createdAt: string; updatedAt: string; finalizedAt?: string;
};
export type Branch = { id: string; name: string; city: string; manager?: string; archived: boolean; demo?: boolean };
export type ActionItem = { id: string; title: string; description: string; branchName: string; questionId: number; inspectionId: string; responsible: string; dueDate: string; status: 'مفتوح' | 'قيد المعالجة' | 'بانتظار التحقق' | 'مغلق'; severity: Severity; recommendation: string; evidence?: Attachment[] };
type StandardsRecord = { id: 'standards'; questions: Question[] };

const sectionDefs: { name: string; items: string[] }[] = [
  { name: 'المعدات والجاهزية', items: ['نظافة ماكينة الإسبريسو ورؤوس المجموعات','سلامة شاشات التوزيع','نظافة حوامل القهوة','نظافة عصي التبخير','ضغط الماكينة','درجة حرارة الماء','عدم وجود تسربات','سلامة التصريف','نظافة المطاحن','حالة شفرات الطحن','درجة حرارة الثلاجة','قراءة TDS للماء','حالة فلاتر المياه','جاهزية أدوات التنظيف','جاهزية الغلاية'] },
  { name: 'جودة القهوة', items: ['حالة حبوب القهوة','نظافة وعاء المطحنة','حداثة التحميص','معايرة المطحنة','جرعة القهوة','وزن الناتج','زمن الاستخلاص','توازن المذاق','اتساق التحضير','وصفة V60','معايير التقطير'] },
  { name: 'تجربة المشروبات والتذوق', items: ['طعم الإسبريسو','جودة اللاتيه الساخن','جودة اللاتيه البارد','توازن الفلات وايت','جودة V60','قوام الحليب المبخر','درجة حرارة المشروب','جودة فن اللاتيه','توازن المشروب البارد','خلو المشروبات من النكهات غير المرغوبة'] },
  { name: 'أداء الباريستا', items: ['الالتزام بالوصفات','معرفة القهوة','ضبط المطحنة','توزيع القهوة والكبس','استخدام الأدوات المعتمدة','تبخير الحليب','نظافة محطة العمل','فصل مناشف الاستخدام','ثبات الجودة تحت الضغط','زمن تجهيز الطلب'] },
];
const severityAt = (id: number): Severity => [2, 5, 15, 18, 22, 27, 36, 38, 39].includes(id) ? 'Critical' : [6, 7, 11, 12, 13, 16, 17, 19, 20, 21, 23, 24, 25, 28, 30, 31, 32, 34, 35, 37, 40, 41, 44, 45, 46].includes(id) ? 'Major' : 'Minor';
const measurementAt: Record<number, { unit: string; min: number; max: number }> = {
  5: { unit: 'bar', min: 8, max: 10 }, 6: { unit: '°C', min: 90, max: 96 }, 11: { unit: '°C', min: 1, max: 5 }, 12: { unit: 'ppm', min: 50, max: 150 },
  20: { unit: 'g', min: 17, max: 20 }, 21: { unit: 'g', min: 34, max: 42 }, 22: { unit: 'ث', min: 24, max: 32 }, 33: { unit: '°C', min: 55, max: 68 }, 46: { unit: 'ث', min: 90, max: 240 },
};
export const QUESTIONS: Question[] = sectionDefs.flatMap(s => s.items.map(title => {
  const id = sectionDefs.slice(0, sectionDefs.indexOf(s)).reduce((n, x) => n + x.items.length, 0) + s.items.indexOf(title) + 1;
  const corrected = id === 15 ? 'نظافة أدوات التنظيف' : id === 46 ? 'زمن تحضير الطلب' : title;
  return { id, section: s.name, title: corrected, severity: severityAt(id), criterion: `يُراجع وفق المعيار الداخلي المعتمد للفرع — صياغة وعتبة أولية قابلة للتعديل.`, ...(measurementAt[id] ? { measurement: measurementAt[id] } : {}) };
}));

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
    return Array.isArray(record?.questions) ? record.questions : QUESTIONS.map(q => ({ ...q }));
  }
  async saveQuestions(questions: Question[]) {
    await db.settings.put({ id: 'standards', questions });
  }
}

export const localRepository: InspectionRepository = new DexieInspectionRepository();
export const list = <T>(store: StoreName) => localRepository.list<T>(store);
export const put = <T extends { id: string }>(store: StoreName, value: T) => localRepository.put(store, value);
export const remove = (store: StoreName, id: string) => localRepository.remove(store, id);
export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const emptyAnswer = (): Answer => ({ value: null, observation: '', recommendation: '', recurring: false, severity: 'Minor', attachments: [] });
export async function initializeBranches() {
  const branches = await list<Branch>('branches');
  if (!branches.length) {
    for (const [name, city] of [['المطيرفي', 'الأحساء'], ['النسيم', 'الأحساء'], ['الكوت', 'الأحساء']]) {
      await put('branches', { id: newId(), name, city, archived: false, demo: true } satisfies Branch);
    }
  }
}
export const loadQuestions = () => localRepository.loadQuestions();
export const saveQuestions = (questions: Question[]) => localRepository.saveQuestions(questions);

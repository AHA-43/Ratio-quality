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
export type Question = { id: number; section: string; title: string; severity: Severity; criterion: string; inputType?: 'status' | 'numeric' | 'text' | 'single-choice' | 'multi-choice' | 'rating' | 'date' | 'photo'; options?: string[]; measurement?: { unit: string; min?: number; max?: number } };
export type Inspection = {
  id: string; status: 'draft' | 'finalized'; branchId: string; branchName: string; inspector: string;
  date: string; type: string; shift: string; employees: number; answers: Record<number, Answer>;
  questionSnapshot: Question[]; createdAt: string; updatedAt: string; finalizedAt?: string;
};
export type Branch = { id: string; name: string; city: string; manager?: string; archived: boolean; demo?: boolean };
export type ActionItem = { id: string; title: string; description: string; branchName: string; questionId: number; inspectionId: string; responsible: string; dueDate: string; status: 'مفتوح' | 'قيد المعالجة' | 'بانتظار التحقق' | 'مغلق'; severity: Severity; recommendation: string; evidence?: Attachment[] };
type StandardsRecord = { id: 'standards'; questions: Question[]; version?: string };
export const CHECKLIST_VERSION = 'official-pdf-v1';

// Official checklist: "قائمة فحص زيارة قسم الجودة" (46 items). Order, titles, severity and units follow the PDF.
// Only standards printed in the PDF are pre-filled (Q11: 3–5 °C, Q12: 90–150 ppm). All others must be set
// from Ratio's approved recipes / operating standards — never invented.
type Sev = 'Critical' | 'Major' | 'Minor';
type Def = [string, Sev, { unit: string; min?: number; max?: number }?];
const sectionDefs: { name: string; items: Def[] }[] = [
  { name: 'المعدات والجاهزية', items: [
    ['نظافة ماكينة الإسبريسو والأسطح المحيطة', 'Major'],
    ['نظافة رؤوس الاستخلاص (Group Heads)', 'Major'],
    ['حالة الشاور سكرين والجوانات وتاريخ آخر تغيير', 'Major'],
    ['نظافة البورتافلتر والسلال', 'Major'],
    ['نظافة عصا التبخير بعد كل استخدام', 'Critical'],
    ['التحقق من ضغط الماكينة وحرارة الاستخلاص وفق المواصفات', 'Major', { unit: 'بار / °م' }],
    ['عدم وجود تسربات ماء أو بخار', 'Major'],
    ['سلامة تصريف المياه ومنطقة العمل', 'Minor'],
    ['نظافة الطواحين', 'Major'],
    ['حالة شفرات المطحنة وتاريخ آخر تغيير', 'Major'],
    ['التحقق من درجة حرارة الثلاجات وتوثيقها', 'Critical', { unit: '°م', min: 3, max: 5 }],
    ['التحقق من نظام المياه وقراءات TDS حسب معيار الفرع', 'Major', { unit: 'ppm', min: 90, max: 150 }],
    ['حالة فلتر الماء وتاريخ آخر تغيير', 'Major'],
    ['توفر أدوات التنظيف وتنفيذ التنظيف الدوري', 'Minor'],
    ['نظافة الكتل وسلامته ودقة درجة حرارته', 'Minor', { unit: '°م' }],
  ] },
  { name: 'جودة القهوة', items: [
    ['التأكد من سلامة حبوب القهوة وعدم وجود روائح غير طبيعية', 'Critical'],
    ['نظافة الهوبر وإدارة البن فيه', 'Major'],
    ['طزاجة البن: عدد الأيام منذ تاريخ التحميص', 'Major', { unit: 'يوم' }],
    ['التحقق من معايرة الطاحونة ودرجة الطحن', 'Major'],
    ['مطابقة جرعة الإسبريسو للوصفة (Dose)', 'Major', { unit: 'غ' }],
    ['مطابقة وزن المشروب للوصفة (Yield)', 'Major', { unit: 'غ' }],
    ['التحقق من زمن الاستخلاص حسب الوصفة', 'Major', { unit: 'ثانية' }],
    ['تقييم نكهة الإسبريسو وتوازن الحموضة والمرارة', 'Major'],
    ['التحقق من ثبات جودة التحضير بين المحاولات', 'Minor'],
    ['مطابقة وصفة القهوة المفلترة (V60): كمية البن والماء', 'Major', { unit: 'غ / مل' }],
    ['مطابقة حرارة الماء وزمن التحضير في القهوة المفلترة (V60)', 'Minor', { unit: '°م / دقيقة' }],
  ] },
  { name: 'تجربة المشروبات والتذوق', items: [
    ['تذوق الإسبريسو وتقييم النكهة والرائحة والقوام', 'Major'],
    ['تذوق اللاتيه الساخن ومطابقة الوصفة', 'Major'],
    ['تذوق اللاتيه البارد ومطابقة الوصفة', 'Major'],
    ['تذوق الفلات وايت ومطابقة الوصفة', 'Major'],
    ['تذوق القهوة المفلترة (V60) ومطابقة الوصفة', 'Major'],
    ['تقييم تبخير الحليب وقوام المايكروفوم', 'Major'],
    ['التحقق من درجة حرارة الحليب وفق المعيار المعتمد', 'Major', { unit: '°م' }],
    ['تقييم جودة تقديم المشروب واللاتيه آرت', 'Minor'],
    ['تقييم نسبة الثلج والتوازن في المشروبات الباردة', 'Minor'],
    ['التأكد من عدم وجود نكهات غريبة أو طعم احتراق', 'Critical'],
  ] },
  { name: 'أداء الباريستا', items: [
    ['معرفة وصفات المشروبات ومعايير تقديمها', 'Major'],
    ['القدرة على شرح المحصول وخصائصه عند سؤال العميل', 'Minor'],
    ['القدرة على ضبط الطاحونة عند تغير الاستخلاص', 'Major'],
    ['الالتزام بتوزيع البن والكبس بصورة صحيحة', 'Minor'],
    ['الالتزام بالأوزان والأدوات المعتمدة', 'Major'],
    ['القدرة على تبخير الحليب وتقديم قوام مناسب', 'Major'],
    ['المحافظة على النظافة أثناء التحضير', 'Major'],
    ['فصل الفوط: عصا البخار، الكاونتر، البورتافلتر', 'Major'],
    ['الالتزام بالجودة والسرعة أثناء ضغط العمل', 'Major'],
    ['زمن التحضير من الطلب إلى التسليم', 'Minor', { unit: 'دقيقة' }],
  ] },
];
// Tasting items (IDs 27–31) also record four 1–5 sub-scores: sweetness, acidity, body, balance.
export const TASTING_SCORE_IDS = [27, 28, 29, 30, 31];
export const TASTING_SCORE_FIELDS = ['الحلاوة', 'الحموضة', 'القوام', 'التوازن'] as const;
export const QUESTIONS: Question[] = (() => {
  let id = 0;
  return sectionDefs.flatMap(s => s.items.map(([title, severity, measurement]) => {
    id += 1;
    return { id, section: s.name, title, severity, criterion: 'يُقارن بالوصفات ومعايير التشغيل المعتمدة لدى المنشأة (لا تُفرض قيمة واحدة على جميع أنواع البن).', ...(measurement ? { measurement } : {}) } as Question;
  }));
})();

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

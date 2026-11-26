// Groups every finding — from the 46-item checklist AND from imported free-form past reports — into
// a small set of operational themes, so recurring problems are visible across all history.
import type { Inspection } from '../data.ts';

type Rule = [name: string, re: RegExp, ids: number[]];
// First match wins: specific risks before generic cleanliness.
const RULES: Rule[] = [
  ['الحشرات والآفات', /حشر|صرصور|ذباب|مبيد|عنكبوت|قوارض/, []],
  ['صلاحية المنتجات وتواريخها', /صلاحي|منتهي|انتهاء|تاريخ|ملصق/, []],
  ['ماكينة الثلج', /ثلج(?!ة)|صانعة الثلج|ماكينة الثلج/, []],
  ['الثلاجات ودرجات الحرارة', /ثلاج/, [11, 15]],
  ['جودة المياه والفلاتر', /مياه|الماء|أملاح|TDS|خزان|فلتر/, [12, 13]],
  ['الطواحين والطحن', /طاحون|مطحن|مطاحن|تروس|التروس|طحن/, [9, 10, 19, 39]],
  ['قهوة اليوم والقهوة المقطرة', /قهوة اليوم|المقطرة|دل[ةا]ل?|غلاي|دريبر|FETCO|V60|فلاتر القهوة/, [25, 26, 31]],
  ['ماكينة الإسبريسو والاستخلاص', /إسبريسو|اسبريسو|معايرة|استخلاص|بورتافلتر|شاور|عصا|ذراع البخار|مجموعة/, [1, 2, 3, 4, 5, 6, 20, 21, 22, 23, 24, 27]],
  ['المشروبات بالحليب والتقديم', /حليب|لاتيه|مشروب|آيسكريم|ايسكريم|كريمة/, [28, 29, 30, 32, 33, 34, 35, 36, 42]],
  ['التدريب والالتزام بالوصفات', /تدريب|وصف|أوزان|موازين|ميزان/, [37, 38, 40, 41, 45, 46]],
  ['المرافق والأثاث والسلامة', /كراسي|طاولات|مكيف|طفاية|تصريف|تسرب|سخان|طابعة|حوض|دهان|سجاد|باب|محبس/, [7, 8]],
  ['النظافة العامة والتخزين', /نظاف|ممزق|مفتوح|مكشوف|ملعقة|متسخ|اتساخ|بقع|غبار|أوساخ|تخزين|كراتين|صدأ|ترسب|تكلس|عشوائي|فوط|فرش/, [14, 16, 17, 43, 44]],
];
const BY_ID = new Map<number, string>(); for (const [n, , ids] of RULES) for (const id of ids) BY_ID.set(id, n);
export const OTHER = 'ملاحظات أخرى';

/** Theme of one finding: checklist items by id, free-form findings by their wording. */
export function themeOf(qid: number, title: string, observation = ''): string {
  if (qid < 1000 && BY_ID.has(qid)) return BY_ID.get(qid)!;
  // The finding's title decides; the longer observation is only a fallback (it mentions water, dates… in passing).
  for (const text of [title, observation]) for (const [n, re] of RULES) if (re.test(text)) return n;
  return OTHER;
}

export type Theme = { name: string; count: number; critical: number; branches: string[]; reports: number };
const failed = (i: Inspection, id: number) => { const a = i.answers[id]; return Boolean(a && (a.value === 'fail' || a.initialValue === 'fail')); };

/** Findings grouped by theme over the given visits (scored and imported alike). */
export function themesOf(list: Inspection[]): Theme[] {
  const m = new Map<string, { count: number; critical: number; br: Map<string, number>; reports: Set<string> }>();
  for (const i of list) for (const q of i.questionSnapshot) {
    if (!failed(i, q.id)) continue;
    const a = i.answers[q.id];
    const name = themeOf(q.id, q.title, a?.observation ?? '');
    const e = m.get(name) ?? { count: 0, critical: 0, br: new Map(), reports: new Set() };
    e.count++; if ((a?.severity ?? q.severity) === 'Critical') e.critical++;
    e.br.set(i.branchName, (e.br.get(i.branchName) ?? 0) + 1); e.reports.add(i.id);
    m.set(name, e);
  }
  return [...m.entries()].map(([name, e]) => ({ name, count: e.count, critical: e.critical, reports: e.reports.size, branches: [...e.br.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]) }))
    .sort((a, b) => (a.name === OTHER ? 1 : 0) - (b.name === OTHER ? 1 : 0) || b.count - a.count || b.critical - a.critical);
}

export function tidyArabic(t: string) {
  let s = t.replace(/\s+/g, ' ').trim();
  s = s.replace(/,/g, '،').replace(/\?/g, '؟').replace(/;/g, '؛').replace(/\s+([،.؛:!؟])/g, '$1');
  s = s.replace(/([،.؛:!؟])(?=[^\s\d])/g, '$1 ').replace(/([.!؟])\1+/g, '$1').replace(/ـ{2,}/g, '');
  if (s && !/[.!؟]$/.test(s)) s += '.';
  return s;
}

/* Plain-language explanation of a result, for inspectors and branch managers. */
export function explainScore(score: number | null, cls: string | null, criticalFailures: number): string {
  if (score === null) return 'لم تكتمل الإجابات بعد، فلا توجد نتيجة نهائية.';
  if (criticalFailures > 0) return `النتيجة ${ltr(score + '%')} لكن الزيارة «غير مقبولة» لأن فيها ${criticalFailures} بند حرج غير مطابق. البند الحرج يُسقط التقييم مهما كانت بقية النتائج، ويلزم تصحيحه خلال 24 ساعة.`;
  const body = cls === 'ممتاز' ? 'أداء ممتاز. حافظوا على المستوى وشاركوا الممارسات الجيدة.'
    : cls === 'جيد' ? 'أداء جيد مع ملاحظات بسيطة. عالجوا البنود غير المطابقة في مواعيدها.'
    : cls === 'يحتاج تحسين' ? 'الفرع دون المستوى المطلوب. يلزم خطة تصحيح ومتابعة قريبة.'
    : 'الفرع دون الحد المقبول. يلزم تدخل وزيارة متابعة.';
  return `النتيجة ${ltr(score + '%')} = مجموع أوزان البنود المطابقة ÷ أوزان البنود المنطبقة (حرج 10 · رئيسي 5 · بسيط 1). ${body}`;
}
export const overdueDays = (due: string, now = new Date()) => { const d = Date.parse(due); return Number.isNaN(d) ? 0 : Math.max(0, Math.floor((now.getTime() - d) / 86400000)); };
/** Arabic-insensitive key used to detect duplicate names (hamza/ta marbuta/spaces). */
export const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();

/** Isolates a number/percent run so Arabic text can't flip it (95.2% stays 95.2%). */
export const ltr = (s: string | number) => `\u2066${s}\u2069`;

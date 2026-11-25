import type { Answer, Question } from './data.ts';

export const WEIGHTS = { Critical: 10, Major: 5, Minor: 1 } as const;
export type ScoreResult = {
  score: number | null;
  classification: 'ممتاز' | 'جيد' | 'يحتاج تحسين' | 'غير مقبول' | null;
  unanswered: number[];
  criticalFailures: number;
  compliantWeight: number;
  applicableWeight: number;
};
export function calculateScore(questions: Question[], answers: Record<number, Answer>): ScoreResult {
  const unanswered = questions.filter(q => !answers[q.id] || answers[q.id].value === null || answers[q.id].value === undefined).map(q => q.id);
  let compliantWeight = 0;
  let applicableWeight = 0;
  let criticalFailures = 0;
  for (const q of questions) {
    if (q.legacy) continue; // imported free-form findings never feed the weighted score
    const answer = answers[q.id];
    if (!answer || answer.value === null || (answer.value === 'na' && answer.initialValue !== 'fail')) continue;
    const effectiveValue = answer.initialValue === 'fail' ? 'fail' : answer.value;
    // Severity always comes from the approved checklist, never from a per-answer override.
    const severity = q.severity;
    const weight = WEIGHTS[severity];
    applicableWeight += weight;
    if (effectiveValue === 'pass') compliantWeight += weight;
    if (effectiveValue === 'fail' && severity === 'Critical') criticalFailures++;
  }
  if (unanswered.length || applicableWeight === 0) return { score: null, classification: null, unanswered, criticalFailures, compliantWeight, applicableWeight };
  const exact = (compliantWeight / applicableWeight) * 100;
  const score = Math.round(exact * 10) / 10;
  const classification = criticalFailures ? 'غير مقبول' : exact >= 90 ? 'ممتاز' : exact >= 80 ? 'جيد' : exact >= 70 ? 'يحتاج تحسين' : 'غير مقبول';
  return { score, classification, unanswered, criticalFailures, compliantWeight, applicableWeight };
}

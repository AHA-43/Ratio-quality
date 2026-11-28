import type { Answer, Question } from '../data.ts';
/** Items that need a reading/selection are never auto-passed: they are opened one by one. */
export const needsDetail = (q: Question) => Boolean(q.measurement) || Boolean(q.inputType && q.inputType !== 'status');
/** Unanswered items of a section that "all conform" may fill in. */
export const bulkPassIds = (qs: Question[], answers: Record<number, Answer | undefined>) => qs.filter(q => answers[q.id]?.value == null && !needsDetail(q)).map(q => q.id);

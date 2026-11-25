import { strict as assert } from 'node:assert';
import test from 'node:test';
import { QUESTIONS } from './checklist.ts';
import { buildVisitDeck } from './features/visit-deck.ts';

const answers = (fails: number[]) => Object.fromEntries(QUESTIONS.map(q => [q.id, { value: fails.includes(q.id) ? 'fail' : 'pass', initialValue: fails.includes(q.id) ? 'fail' : undefined, observation: 'ملاحظة', recommendation: 'توصية', recurring: false, severity: q.severity, attachments: [] }]));
const visit = (fails: number[]) => ({ id: 'v', status: 'finalized', branchId: 'b', branchName: 'فرع تجريبي', inspector: 'مفتش', date: '2026-11-24 10:00', type: 'زيارة جودة شاملة', shift: 'صباحية', employees: 3, answers: answers(fails), questionSnapshot: QUESTIONS, createdAt: '', updatedAt: '' }) as never;

test('visit deck: cover, summary, sections, overview, one slide per finding, strengths, plan, approval, closing', async () => {
  const deck = await buildVisitDeck(visit([5, 11, 19]), []);
  assert.equal((deck as unknown as { slides: unknown[] }).slides.length, 4 + 3 + 4);
  const buf = await deck.write({ outputType: 'nodebuffer' }) as Uint8Array; assert.ok(buf.length > 30000);
});
test('visit deck without findings shows the no-findings slide and still builds', async () => {
  const deck = await buildVisitDeck(visit([]), []);
  assert.equal((deck as unknown as { slides: unknown[] }).slides.length, 8);
});

// Dev tool: builds sample decks from a realistic visit so the design can be reviewed as images.
// node --experimental-strip-types tests/render-deck.mts <outDir>   (then: soffice --headless --convert-to pdf)
import { readFileSync, writeFileSync } from 'node:fs';
import { QUESTIONS } from '../src/checklist.ts';
import { buildVisitDeck } from '../src/features/visit-deck.ts';
const out = process.argv[2] ?? '.';
const uri = (f: string, t: string) => `data:${t};base64,${readFileSync(new URL(f, import.meta.url)).toString('base64')}`;
const photo = uri('./fixture-photo.jpg', 'image/jpeg');
const fails: Record<number, [string, string, boolean?]> = {
  5: ['عصا التبخير عليها بقايا حليب متجمدة بعد آخر استخدام ولم تُمسح فوراً.', 'تدريب الفريق على مسح عصا التبخير وتفريغها مباشرة بعد كل استخدام.', true],
  11: ['درجة حرارة ثلاجة الحليب 7°م وهي خارج النطاق المعتمد (3–5°م).', 'ضبط الثرموستات وتوثيق القراءة مرتين يومياً.'],
  19: ['الطاحونة غير معايرة والطحنة أخشن من المعتاد.', 'معايرة الطاحونة صباحاً قبل بدء التشغيل.'],
  33: ['حرارة الحليب أعلى من المعيار في كوبين.', 'استخدام ميزان الحرارة مع كل طلب حليب.'],
  44: ['الكاونتر غير مرتب أثناء الذروة.', 'تخصيص موظف لترتيب الكاونتر كل ساعة.'],
};
const answers: Record<number, unknown> = {};
for (const q of QUESTIONS) { const f = fails[q.id]; answers[q.id] = f ? { value: 'fail', initialValue: 'fail', observation: f[0], recommendation: f[1], recurring: Boolean(f[2]), severity: q.severity, attachments: q.id === 5 || q.id === 11 ? [{ id: 'p' + q.id, name: 'p.jpg', type: 'image/jpeg', data: photo, caption: 'صورة من الزيارة' }] : [], actual: q.id === 11 ? 7 : undefined } : { value: 'pass', observation: '', recommendation: '', recurring: false, severity: q.severity, attachments: [] }; }
const i = { id: 'x', status: 'finalized', workflow: 'approved', number: 'RQ-2026-00042', branchId: 'HAS.01', branchCode: 'HAS.01', branchName: 'الاحساء - السلمانية', inspector: 'الحسن', date: '2026-11-24 10:30', type: 'زيارة جودة شاملة', shift: 'صباحية', employees: 4, answers, questionSnapshot: QUESTIONS, createdAt: '', updatedAt: '', approvedAt: '2026-11-24T15:00:00Z', approvedBy: { uid: 'a', name: 'مدير الجودة' }, snapshotHash: 'a3f91c0be2d47788aa01', previous: { inspectionId: 'p', date: '2026-10-20', score: 84.1, classification: 'جيد' },
  signatures: { inspector: { name: 'الحسن', image: photo, at: '2026-11-24T11:40:00Z' }, branch: { name: 'محمد العتيبي', image: photo, at: '2026-11-24T11:42:00Z' } } } as never;
const actions = Object.entries(fails).map(([id, f], k) => ({ id: 'a' + id, title: 'x', description: f[0], recommendation: f[1], responsible: k % 2 ? 'مشرف الفرع' : '', dueDate: '2026-11-27', status: ['مفتوح', 'مُسند', 'قيد المعالجة', 'بانتظار التحقق', 'مغلق'][k], severity: QUESTIONS.find(q => q.id === +id)!.severity, questionId: +id })) as never;
const deck = await buildVisitDeck(i, actions, { logoWhite: uri('../public/brand/logo-ar-white.png', 'image/png'), logoNavy: uri('../public/brand/logo-ar-navy.png', 'image/png') });
writeFileSync(`${out}/visit.pptx`, await deck.write({ outputType: 'nodebuffer' }) as Uint8Array);
console.log('written', `${out}/visit.pptx`);

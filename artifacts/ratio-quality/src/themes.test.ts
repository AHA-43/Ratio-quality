import { strict as assert } from 'node:assert';
import test from 'node:test';
import { themeOf, themesOf, OTHER } from './features/themes.ts';

test('checklist items map by id, free-form findings by their title', () => {
  assert.equal(themeOf(11, 'x'), 'الثلاجات ودرجات الحرارة');
  assert.equal(themeOf(1001, 'علبة سكاي لاتيه منتهية الصلاحية'), 'صلاحية المنتجات وتواريخها');
  assert.equal(themeOf(1002, 'صرصور داخل ثلاجة المشروبات'), 'الحشرات والآفات');
  assert.equal(themeOf(1003, 'ماكينة الثلج لا تعمل'), 'ماكينة الثلج');
  assert.equal(themeOf(1004, 'شيء غير مصنف', 'نص'), OTHER);
});
test('themes count failed findings across reports and rank them', () => {
  const ans = (v: string, severity = 'Major') => ({ value: v, initialValue: v, observation: '', recommendation: '', recurring: false, severity, attachments: [] });
  const r = (id: string, b: string, qs: [number, string, string][]) => ({ id, branchName: b, questionSnapshot: qs.map(([qid, title]) => ({ id: qid, title, section: '', severity: 'Major' })), answers: Object.fromEntries(qs.map(([qid, , v]) => [qid, ans(v, qid === 1001 ? 'Critical' : 'Major')])) }) as never;
  const t = themesOf([r('a', 'فرع 1', [[1001, 'منتج منتهي الصلاحية', 'fail'], [11, '', 'fail']]), r('b', 'فرع 2', [[1002, 'تاريخ انتهاء لعبوة', 'fail'], [11, '', 'pass']])]);
  assert.equal(t[0].name, 'صلاحية المنتجات وتواريخها'); assert.equal(t[0].count, 2); assert.equal(t[0].critical, 1); assert.equal(t[0].reports, 2);
  assert.equal(t.find(x => x.name === 'الثلاجات ودرجات الحرارة')?.count, 1);
});

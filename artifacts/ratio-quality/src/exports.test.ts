import { strict as assert } from 'node:assert';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { QUESTIONS } from './checklist.ts';
import { exportXlsx } from './features/exports.ts';
import type { Answer, Inspection } from './data';

const answers: Record<number, Answer> = Object.fromEntries(QUESTIONS.map(q => [q.id, { value: q.id === 5 ? 'fail' : 'pass', observation: q.id === 5 ? 'عصا التبخير غير نظيفة' : '', recommendation: '', recurring: false, severity: q.severity, attachments: [] }]));
const inspection: Inspection = { id: 't1', status: 'finalized', workflow: 'submitted', number: 'RQ-2026-00001', branchId: 'HAS.01', branchCode: 'HAS.01', branchName: 'الاحساء - السلمانية', inspector: 'مفتش', date: '2026-11-23 10:00', type: 'زيارة جودة شاملة', shift: 'صباحية', employees: 3, answers, questionSnapshot: QUESTIONS, createdAt: '', updatedAt: '', checklistVersion: 'official-pdf-v1' };

test('Excel export contains all 46 results and reflects the critical failure', async () => {
  const { blob, name } = await exportXlsx(inspection, []);
  assert.match(name, /^RQ-2026-00001_HAS\.01_2026-11-23\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  assert.deepEqual(wb.worksheets.map(w => w.name), ['الملخص', 'النتائج', 'تحليل الأقسام', 'الإجراءات التصحيحية']);
  const results = wb.getWorksheet('النتائج')!;
  assert.equal(results.rowCount, 47);
  assert.equal(results.getRow(6).getCell(6).value, 'غير مطابق');
  const summary = wb.getWorksheet('الملخص')!;
  const cls = summary.getColumn(1).values.findIndex(v => v === 'التصنيف');
  assert.equal(summary.getRow(cls).getCell(2).value, 'غير مقبول');
});

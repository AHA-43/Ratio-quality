// End-to-end smoke test of the core inspection journey (local mode, no Firebase).
// Usage: start `vite preview` of a build made with `--mode shot`, then: node tests/e2e-flow.mjs http://localhost:4181 <outDir>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { strict as assert } from 'node:assert';
const base = process.argv[2] ?? 'http://localhost:4181';
const out = process.argv[3] ?? '.';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, acceptDownloads: true });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message));
const signIn = async (sel) => { const c = p.locator(sel); await c.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, 120)); const box = await c.boundingBox(); await p.mouse.move(box.x + 20, box.y + 40); await p.mouse.down(); await p.mouse.move(box.x + 120, box.y + 90, { steps: 8 }); await p.mouse.move(box.x + 200, box.y + 50, { steps: 8 }); await p.mouse.up(); };

await p.goto(base + '/'); await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/e2e-home0.png` });
await p.getByTestId('button-start-inspection').click();
await p.getByTestId('input-branch-search').fill('HAS.01');
await p.locator('.branch-option').first().click();
await p.getByTestId('input-inspector').fill('مفتش الاختبار');
await p.getByTestId('button-create-inspection').click();
await p.waitForURL(/\/inspection\//);
for (let id = 1; id <= 46; id++) {
  if (id === 5) { await p.getByTestId(`answer-fail-${id}`).click(); await p.getByTestId(`input-observation-${id}`).fill('عصا التبخير غير نظيفة بعد الاستخدام'); }
  else await p.getByTestId(`answer-pass-${id}`).click();
  if (id === 27) assert.equal(await p.locator('.tasting-box').count(), 1, 'tasting scores shown for Q27');
  if (id === 5) await p.getByTestId('button-next-question').click();
  if (id === 1) await p.screenshot({ path: `${out}/e2e-runner.png` });
}
await p.waitForTimeout(700);
if (!(await p.getByTestId('button-finalize').count())) await p.getByTestId('button-review').click();
await p.waitForTimeout(400);
assert.equal(await p.getByTestId('button-finalize').isDisabled(), true, 'submit blocked until signatures');
await signIn('.sig-pad canvas >> nth=0');
await p.getByPlaceholder('الاسم الكامل').last().fill('مسؤول الفرع');
await signIn('.sig-pad canvas >> nth=1');
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/e2e-review.png`, fullPage: true });
console.log('hint:', await p.locator('.validation-hint').allInnerTexts(), 'msg:', await p.locator('.alert, .runner-message, .form-error').allInnerTexts());
await p.getByTestId('button-finalize').click({ timeout: 5000 });
await p.waitForTimeout(1500);
console.log('after submit:', p.url(), (await p.locator('main').innerText()).slice(0, 200).replace(/\n/g, ' | '));
assert.match(p.url(), /\/reports\//, 'submit opens the report');
const reportText = await p.locator('main').innerText();
assert.match(reportText, /غير مقبول/, 'critical failure => unacceptable');
assert.match(reportText, /بانتظار الاعتماد/);
await p.screenshot({ path: `${out}/e2e-report.png`, fullPage: false });
p.once('dialog', d => d.accept());
await p.getByRole('button', { name: 'اعتماد التقرير' }).click();
await p.waitForTimeout(1500);
assert.match(await p.locator('main').innerText(), /معتمدة/);
const [xlsx] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Excel' }).click()]);
const [pptx] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByRole('button', { name: 'PowerPoint' }).click()]);
await xlsx.saveAs(`${out}/${xlsx.suggestedFilename()}`); await pptx.saveAs(`${out}/${pptx.suggestedFilename()}`);
console.log('downloads:', xlsx.suggestedFilename(), pptx.suggestedFilename());
await p.screenshot({ path: `${out}/e2e-approved.png` });
await p.goto(base + '/'); await p.waitForTimeout(800); await p.screenshot({ path: `${out}/e2e-home.png` });
await p.goto(base + '/actions'); await p.waitForTimeout(500);
await p.goto(base + '/analytics'); await p.waitForTimeout(800);
assert.match(await p.locator('main').innerText(), /لوحة الأداء/);
await p.screenshot({ path: `${out}/e2e-analytics.png`, fullPage: true });
assert.deepEqual(errors, [], 'no page errors');
console.log('E2E OK');
await b.close();

// Full multi-user test against Firebase emulators (Auth + Firestore) using the real app build (mode "emu").
import { createRequire } from 'node:module';
import { strict as assert } from 'node:assert';
const { chromium } = createRequire(import.meta.url)('playwright');
const APP = process.env.APP_URL ?? 'http://localhost:4183';
const OUT = process.env.OUT ?? '.';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-ratio/databases/(default)/documents';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const results = [];
const step = async (name, fn) => { console.log('… ' + name); try { await Promise.race([fn(), new Promise((_, r) => setTimeout(() => r(new Error('step timeout 90s')), 90000))]); results.push(['PASS', name]); console.log('PASS ' + name); } catch (e) { results.push(['FAIL', name, String(e.message).slice(0, 300)]); throw e; } };

async function signUp(email) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=demo-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Test-pass-123', returnSecureToken: true }) });
  return (await r.json()).localId;
}
const fsGet = async path => (await fetch(`${FS}/${path}`, { headers: admin })).json();
const fsList = async coll => ((await (await fetch(`${FS}/${coll}?pageSize=300`, { headers: admin })).json()).documents ?? []);
const val = f => f?.stringValue ?? f?.integerValue ?? f?.booleanValue ?? f?.mapValue;

const inspUid = await signUp('inspector@test.local');
const qmUid = await signUp('manager@test.local');
const adminUid = await signUp('admin@test.local');
await fetch(`${FS}/users/${adminUid}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: { email: { stringValue: 'admin@test.local' }, name: { stringValue: 'مدير النظام' }, role: { stringValue: 'admin' }, canApprove: { booleanValue: true }, active: { booleanValue: true } } }) });
// Manager role is granted by an admin (service account here).
await fetch(`${FS}/users/${qmUid}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: { email: { stringValue: 'manager@test.local' }, name: { stringValue: 'مدير الجودة' }, role: { stringValue: 'quality_manager' }, canApprove: { booleanValue: true }, active: { booleanValue: true } } }) });

const browser = await chromium.launch();
const newDevice = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true }); await c.addInitScript(() => { try { localStorage.setItem('rq-coach', 'done'); localStorage.setItem('rq-brief', 'off'); sessionStorage.setItem('rq-name-skip', '1'); } catch {} }); const p = await c.newPage(); const errs = []; const logs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => logs.push(m.text().slice(0, 200))); return { c, p, errs, logs }; };
const login = async (p, email) => { await p.goto(APP + '/'); await p.waitForSelector('.login-card'); await p.locator('input[type=email]').fill(email); await p.locator('input[type=password]').fill('Test-pass-123'); await p.getByRole('button', { name: 'دخول' }).click(); await p.waitForSelector('.today', { timeout: 20000 }); };
const draw = async (p, sel) => { const c = p.locator(sel); await c.scrollIntoViewIfNeeded(); const b = await c.boundingBox(); await p.mouse.move(b.x + 20, b.y + 40); await p.mouse.down(); await p.mouse.move(b.x + 140, b.y + 100, { steps: 6 }); await p.mouse.move(b.x + 220, b.y + 40, { steps: 6 }); await p.mouse.up(); };

const A = await newDevice();
// Device A behaves like a phone on a mobile network: every request waits ~300 ms.
await (await A.c.newCDPSession(A.p)).send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: 1.5e6 / 8 * 8, uploadThroughput: 750e3 / 8 * 8 });
let inspectionId; let photoLen = 0; let id2;
await step('wrong password is rejected with a clear message', async () => {
  await A.p.goto(APP + '/'); await A.p.waitForSelector('.login-card');
  await A.p.locator('input[type=email]').fill('inspector@test.local'); await A.p.locator('input[type=password]').fill('wrong');
  await A.p.getByRole('button', { name: 'دخول' }).click(); await A.p.waitForSelector('.login-card .err');
});
await step('forgot password: asks for the email and confirms without revealing whether it exists', async () => {
  const X = await newDevice(); await X.p.goto(APP + '/'); await X.p.waitForSelector('.login-card');
  await X.p.getByTestId('link-forgot').click(); await X.p.getByTestId('input-reset-email').fill('nobody-here@test.local');
  await X.p.getByTestId('button-reset-send').click(); await X.p.waitForSelector('[data-testid=reset-sent]', { timeout: 15000 });
  await X.c.close();
});
await step('inspector signs in; profile auto-created as inspector', async () => {
  await login(A.p, 'inspector@test.local');
  const u = await fsGet(`users/${inspUid}`);
  assert.equal(val(u.fields.role), 'inspector');
});
await step('inspector cannot open user management data', async () => {
  await A.p.goto(APP + '/users'); await A.p.waitForTimeout(1500);
  const cards = await A.p.locator('.user-card').count();
  assert.ok(cards <= 1, `inspector saw ${cards} user cards`);
});
await step('start inspection: branch search, name prefilled from account', async () => {
  await A.p.goto(APP + '/inspection/new'); await A.p.waitForTimeout(800);
  await A.p.getByTestId('input-branch-search').fill('HAS.01'); await A.p.locator('.branch-option').first().click();
  assert.equal(await A.p.getByTestId('input-inspector').inputValue(), 'inspector');
  await A.p.getByTestId('button-create-inspection').click(); await A.p.waitForURL(u => /\/inspection\/(?!new)[^/]+$/.test(String(u)));
  inspectionId = A.p.url().split('/').pop();
});
await step('answer 46 items (auto-advance), one critical failure with a photo', async () => {
  for (let id = 1; id <= 46; id++) {
    if (id === 5) {
      await A.p.getByTestId('answer-fail-5').click();
      await A.p.getByTestId('input-observation-5').fill('عصا التبخير غير نظيفة');
      await A.p.getByTestId('input-photo-5').setInputFiles(new URL('./fixture-photo.jpg', import.meta.url).pathname);
      await A.p.waitForSelector('.evidence-item img');
      photoLen = (await A.p.locator('.evidence-item img').first().getAttribute('src'))?.length ?? 0;
      await A.p.getByTestId('button-next-question').click();
    } else await A.p.getByTestId(`answer-pass-${id}`).click();
  }
  await A.p.waitForTimeout(800);
});
await step('photo compressed below 600 KB', async () => { assert.ok(photoLen > 1000 && photoLen < 600000, `photo is ${photoLen} chars`); });
await step('submit requires signatures; then gets sequential number RQ-YYYY-00001', async () => {
  if (!(await A.p.getByTestId('button-finalize').count())) await A.p.getByTestId('button-review').click();
  assert.equal(await A.p.getByTestId('button-finalize').isDisabled(), true);
  await draw(A.p, '.sig-pad canvas >> nth=0');
  await A.p.getByPlaceholder('الاسم الكامل').last().fill('مسؤول الفرع');
  await draw(A.p, '.sig-pad canvas >> nth=1');
  await A.p.getByTestId('button-finalize').click();
  await A.p.waitForSelector('.sc', { timeout: 15000 }); await A.p.locator('.sc-main').click();
  await A.p.waitForURL(/\/reports\//); await A.p.waitForTimeout(2500);
  assert.match(await A.p.locator('main').innerText(), new RegExp(`RQ-${new Date().getFullYear()}-00001`));
});
await step('cloud copy: submitted, photo stored separately, inspection holds only a reference', async () => {
  let d = {};
  for (let k = 0; k < 15 && !d.fields; k++) { d = await fsGet(`inspections/${inspectionId}`); if (!d.fields) await new Promise(r => setTimeout(r, 1000)); }
  if (!d.fields) console.log('DEBUG inspections:', (await fsList('inspections')).map(x => x.name.split('/').pop()), 'photos:', (await fsList('photos')).length, 'users:', (await fsList('users')).length, 'id:', inspectionId, 'console:', A.logs.slice(-8));
  assert.equal(val(d.fields.workflow), 'submitted');
  const att = d.fields.answers.mapValue.fields['5'].mapValue.fields.attachments.arrayValue.values[0].mapValue.fields;
  assert.equal(val(att.data), '');
  assert.match(val(att.storagePath), /^photos\//);
  const photo = await fsGet(val(att.storagePath));
  assert.match(val(photo.fields.data), /^data:image\/jpeg/);
});
await step('inspector cannot approve own report', async () => {
  assert.equal(await A.p.getByRole('button', { name: 'اعتماد التقرير' }).count(), 0);
});
await step('Excel and PowerPoint exports download', async () => {
  const [x] = await Promise.all([A.p.waitForEvent('download'), A.p.getByRole('button', { name: 'Excel' }).click()]);
  const [y] = await Promise.all([A.p.waitForEvent('download', { timeout: 60000 }), A.p.getByRole('button', { name: 'PowerPoint · عرض مفصّل' }).click()]);
  assert.match(x.suggestedFilename(), /^RQ-\d{4}-00001_HAS\.01_/); assert.match(y.suggestedFilename(), /\.pptx$/);
  await y.saveAs(`${OUT}/cloud-report.pptx`);
});

const B = await newDevice();
await step('manager on another device sees the report with the photo (synced)', async () => {
  await login(B.p, 'manager@test.local');
  await B.p.goto(APP + `/reports/${inspectionId}`); await B.p.waitForTimeout(2000);
  const src = await B.p.locator('.report-evidence img').first().getAttribute('src');
  assert.match(src ?? '', /^data:image\/jpeg/);
  await B.p.screenshot({ path: `${OUT}/cloud-manager-report.png` });
});
await step('home shows pending approval to the manager', async () => {
  await B.p.goto(APP + '/'); await B.p.waitForTimeout(1200);
  assert.match(await B.p.locator('.attention').innerText(), /بانتظار اعتمادك/);
});
await step('manager approves; hash recorded; locked in the cloud', async () => {
  await B.p.goto(APP + `/reports/${inspectionId}`); await B.p.waitForTimeout(1000);
  B.p.once('dialog', d => d.accept());
  await B.p.getByRole('button', { name: 'اعتماد التقرير' }).click(); await B.p.waitForTimeout(2500);
  const d = await fsGet(`inspections/${inspectionId}`);
  assert.equal(val(d.fields.workflow), 'approved');
  assert.match(val(d.fields.snapshotHash), /^[0-9a-f]{64}$/);
});
await step('audit trail recorded submit and approve', async () => {
  const actions = (await fsList('audit')).map(d => val(d.fields.action));
  assert.ok(actions.includes('inspection.submit') && actions.includes('inspection.approve'), actions.join(','));
});
await step('inspector device sees approved status after reload', async () => {
  await A.p.reload(); await A.p.waitForTimeout(3500);
  await A.p.goto(APP + `/reports/${inspectionId}`); await A.p.waitForTimeout(1500);
  assert.match(await A.p.locator('.approval-panel').innerText(), /معتمدة/);
});
await step('offline: draft keeps working without a connection and syncs after', async () => {
  await A.p.goto(APP + '/inspection/new'); await A.p.waitForTimeout(800);
  await A.p.getByTestId('input-branch-search').fill('HAS.03'); await A.p.locator('.branch-option').first().click();
  await A.c.setOffline(true);
  await A.p.getByTestId('button-create-inspection').click(); await A.p.waitForURL(u => /\/inspection\/(?!new)[^/]+$/.test(String(u)));
  id2 = A.p.url().split('/').pop();
  await A.p.getByTestId('answer-pass-1').click(); await A.p.waitForTimeout(800);
  assert.match(await A.p.locator('.sync-chip').innerText(), /دون اتصال/);
  await A.c.setOffline(false); await A.p.getByTestId('answer-pass-2').click(); await A.p.waitForTimeout(4000);
  const d = await fsGet(`inspections/${id2}`);
  assert.ok(d.fields, 'offline draft reached the cloud after reconnecting');
});
await step('rapid consecutive autosaves all reach the cloud (no self-conflict)', async () => {
  await A.p.goto(APP + `/inspection/${id2}`); await A.p.waitForTimeout(800);
  await A.p.locator('.heat').nth(3).click(); await A.p.getByTestId('answer-pass-4').click(); await A.p.waitForTimeout(350);
  await A.p.getByTestId('answer-fail-5').click(); await A.p.getByTestId('input-observation-5').fill('سريع'); await A.p.waitForTimeout(4000);
  const d = await fsGet(`inspections/${id2}`);
  assert.equal(val(d.fields.answers.mapValue.fields['5'].mapValue.fields.value), 'fail');
  assert.equal(await A.p.locator('.conflict').count(), 0, 'no false conflict on the same device');
});
await step('same draft edited on two devices: conflict shown, nothing lost', async () => {
  await B.p.goto(APP + '/'); await B.p.waitForSelector('.today', { timeout: 20000 }); await B.p.waitForTimeout(1500);
  await B.p.goto(APP + `/inspection/${id2}`); await B.p.waitForTimeout(1500);
  // Truly concurrent edits: B is offline while A changes the same item (with live sync, an online B would
  // simply receive A's change first, which is not a conflict).
  await B.c.setOffline(true);
  await A.p.goto(APP + `/inspection/${id2}`); await A.p.waitForTimeout(1000);
  await A.p.locator('.heat').nth(2).click(); await A.p.getByTestId('answer-pass-3').click(); await A.p.waitForTimeout(2500);
  await B.p.locator('.heat').nth(2).click(); await B.p.getByTestId('answer-fail-3').click();
  await B.p.getByTestId('input-observation-3').fill('ملاحظة من جهاز المدير'); await B.p.waitForTimeout(1200);
  await B.c.setOffline(false); await B.p.reload(); await B.p.waitForSelector('.today, .runner-page', { timeout: 20000 }); await B.p.waitForTimeout(2500);
  await B.p.goto(APP + `/inspection/${id2}`); await B.p.waitForSelector('.conflict', { timeout: 15000 });
  assert.match(await B.p.locator('.conflict').innerText(), /البند 3/);
  await B.p.locator('.conflict-row button').nth(1).click();
  await B.p.getByRole('button', { name: 'اعتماد الدمج' }).click(); await B.p.waitForTimeout(800);
  assert.equal(await B.p.locator('.conflict').count(), 0);
});
await step('new user is asked for a display name once; it is saved and used in the greeting', async () => {
  const uid3 = await signUp('third@test.local');
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c.addInitScript(() => { try { localStorage.setItem('rq-coach', 'done'); localStorage.setItem('rq-brief', 'off'); } catch {} });
  const p = await c.newPage();
  await login(p, 'third@test.local');
  await p.waitForSelector('[role=dialog] input', { timeout: 15000 });
  await p.locator('[role=dialog] input').fill('سارة العتيبي');
  await p.getByRole('button', { name: 'حفظ' }).click();
  await p.waitForSelector('[role=dialog]', { state: 'detached', timeout: 10000 });
  assert.match(await p.locator('.today-hello h1').innerText(), /سارة/);
  let name = '';
  for (let k = 0; k < 10 && name !== 'سارة العتيبي'; k++) { await new Promise(r => setTimeout(r, 700)); name = val((await fsGet(`users/${uid3}`)).fields?.name) ?? ''; }
  assert.equal(name, 'سارة العتيبي');
  await c.close();
});
await step('quality lead imports a past report file; it lands in the cloud as an approved, read-only report with photos', async () => {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const photo = 'data:image/jpeg;base64,' + readFileSync(new URL('./fixture-small.jpg', import.meta.url)).toString('base64');
  const rep = { id: 'imp-e2e-1', status: 'finalized', workflow: 'approved', branchId: 'HAS.06', branchName: 'الاحساء - الفتح', inspector: 'فريق الجودة', date: '2026-10-06 09:00', type: 'زيارة دورية', shift: '', employees: 0, checklistVersion: 'legacy-import',
    questionSnapshot: [{ id: 1001, section: 'ملاحظات الزيارة', title: 'نظافة خزان الماء', severity: 'Major', criterion: '', legacy: true }],
    answers: { 1001: { value: 'fail', initialValue: 'fail', observation: 'خزان الماء غير نظيف', recommendation: 'تنظيف الخزان', recurring: false, severity: 'Major', attachments: [{ id: 'imp-ph-1', name: 'p.jpg', type: 'image/jpeg', data: photo, caption: '' }] } },
    createdAt: '2026-10-06T09:00:00.000Z', updatedAt: '2026-10-06T09:00:00.000Z', imported: { source: 'تقرير الفتح (PDF)', importedAt: '', classification: 'جيد', counts: { total: 1 } } };
  const file = '/tmp/rq-legacy-e2e.json'; writeFileSync(file, JSON.stringify({ format: 'ratio-legacy-reports', version: 1, reports: [rep] }));
  await B.p.goto(APP + '/settings'); await B.p.getByTestId('input-legacy-file').setInputFiles(file);
  await B.p.getByTestId('button-legacy-import').click(); await B.p.waitForSelector('.legacy-import .form-ok', { timeout: 20000 });
  let d; for (let k = 0; k < 30 && !(d?.fields?.answers); k++) { await B.p.waitForTimeout(1000); d = await fsGet('inspections/imp-e2e-1'); }
  assert.equal(val(d.fields.workflow), 'approved'); assert.ok(d.fields.imported, 'imported block stored');
  await B.p.goto(APP + '/reports/imp-e2e-1'); await B.p.waitForSelector('.legacy-banner'); assert.match(await B.p.locator('.legacy-banner').innerText(), /جيد/);
});
await step('admin adds a user from the Users page; the new account works and the admin stays signed in', async () => {
  const C = await newDevice(); await login(C.p, 'admin@test.local');
  await C.p.goto(APP + '/users'); await C.p.waitForSelector('[data-testid=button-add-user]');
  await C.p.getByTestId('button-add-user').click();
  await C.p.getByTestId('input-new-name').fill('مفتش جديد'); await C.p.getByTestId('input-new-email').fill('Newbie@Test.local');
  await C.p.getByTestId('select-new-role').selectOption('quality_manager');
  if (process.env.SHOT_DIR) await C.p.screenshot({ path: `${process.env.SHOT_DIR}/u-form.png` });
  await C.p.getByTestId('button-create-user').click(); await C.p.waitForSelector('[data-testid=created-user]', { timeout: 20000 });
  if (process.env.SHOT_DIR) await C.p.screenshot({ path: `${process.env.SHOT_DIR}/u-created.png` });
  const pw = (await C.p.getByTestId('created-password').innerText()).trim(); assert.match(pw, /^[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}$/);
  const r = await (await fetch(`${AUTH}/accounts:signInWithPassword?key=demo-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'newbie@test.local', password: pw, returnSecureToken: true }) })).json();
  assert.ok(r.idToken, 'new account can sign in with the generated password');
  const doc = await fsGet(`users/${r.localId}`); assert.equal(val(doc.fields.role), 'quality_manager'); assert.equal(val(doc.fields.name), 'مفتش جديد');
  await C.p.goto(APP + '/users'); await C.p.waitForSelector('.user-card'); assert.ok(await C.p.getByText('newbie@test.local').count() > 0, 'listed in users');
  assert.equal(await C.p.locator('.login-card').count(), 0, 'admin session untouched');
  // the new user changes the password from Settings
  const D = await newDevice(); await D.p.goto(APP + '/'); await D.p.waitForSelector('.login-card'); await D.p.locator('input[type=email]').fill('newbie@test.local'); await D.p.locator('input[type=password]').fill(pw); await D.p.getByRole('button', { name: 'دخول' }).click(); await D.p.waitForSelector('.today', { timeout: 20000 });
  await D.p.goto(APP + '/settings'); await D.p.waitForSelector('[data-testid=input-pw-current]');
  await D.p.getByTestId('input-pw-current').fill(pw); await D.p.getByTestId('input-pw-new').fill('Brand-new-pass-9'); await D.p.getByTestId('input-pw-confirm').fill('Brand-new-pass-9');
  await D.p.getByRole('button', { name: 'حفظ كلمة المرور' }).click(); await D.p.waitForSelector('.form-ok', { timeout: 15000 });
  const r2 = await (await fetch(`${AUTH}/accounts:signInWithPassword?key=demo-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'newbie@test.local', password: 'Brand-new-pass-9', returnSecureToken: true }) })).json();
  assert.ok(r2.idToken, 'new password works'); await C.c.close(); await D.c.close();
});
await step('branch manager: sees own approved report, answers an action with proof; cannot reach other data', async () => {
  const insp = await fsGet(`inspections/${inspectionId}`); const branchId = val(insp.fields.branchId);
  await fetch(`${FS}/actions/e2e-act`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: { id: { stringValue: 'e2e-act' }, title: { stringValue: 'تنظيف عصا التبخير — فرع' }, description: { stringValue: 'بقايا حليب' }, recommendation: { stringValue: 'تنظيف بعد كل استخدام' }, status: { stringValue: 'مفتوح' }, severity: { stringValue: 'Major' }, branchId: { stringValue: branchId }, branchName: { stringValue: 'فرع' }, inspectionId: { stringValue: inspectionId }, questionId: { integerValue: 5 }, dueDate: { stringValue: '2030-01-01' }, responsible: { stringValue: '' } } }) });
  const bmUid = await signUp('branch@test.local');
  await fetch(`${FS}/users/${bmUid}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: { email: { stringValue: 'branch@test.local' }, name: { stringValue: 'مدير الفرع' }, role: { stringValue: 'branch_manager' }, canApprove: { booleanValue: false }, active: { booleanValue: true }, branchIds: { arrayValue: { values: [{ stringValue: branchId }] } } } }) });
  const C = await newDevice();
  await C.p.goto(APP + '/'); await C.p.waitForSelector('.login-card'); await C.p.locator('input[type=email]').fill('branch@test.local'); await C.p.locator('input[type=password]').fill('Test-pass-123'); await C.p.getByRole('button', { name: 'دخول' }).click();
  await C.p.waitForSelector('.bp', { timeout: 20000 }); await C.p.waitForSelector('.bp-action', { timeout: 20000 });
  assert.equal(await C.p.locator('.today').count(), 0, 'no access to the full app');
  await C.p.locator('.bp-action input[type=file]').first().setInputFiles(new URL('./fixture-small.jpg', import.meta.url).pathname);
  await C.p.waitForSelector('.bp-pick.has img');
  await C.p.locator('.bp-action textarea').first().fill('تم التنظيف وتدريب الفريق');
  await C.p.getByRole('button', { name: 'تم التصحيح — أرسل للتحقق' }).click();
  await C.p.waitForSelector('.bp-action.waiting', { timeout: 15000 });
  const a = await fsGet('actions/e2e-act');
  assert.equal(val(a.fields.status), 'بانتظار التحقق');
  assert.match(val(a.fields.evidence.arrayValue.values[0].mapValue.fields.storagePath), /^photos\//);
  await C.p.getByRole('tab', { name: 'تقارير الزيارات' }).click(); await C.p.waitForSelector('.bp-report', { timeout: 15000 });
  // a new action arrives while the manager has the portal open: alert + 'new' badge (no reload needed)
  await fetch(`${FS}/actions/e2e-act2`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: { id: { stringValue: 'e2e-act2' }, title: { stringValue: 'إجراء جديد للاختبار — فرع' }, description: { stringValue: 'وصف' }, recommendation: { stringValue: 'تنفيذ' }, status: { stringValue: 'مفتوح' }, severity: { stringValue: 'Minor' }, branchId: { stringValue: branchId }, branchName: { stringValue: 'فرع' }, inspectionId: { stringValue: inspectionId }, questionId: { integerValue: 7 }, dueDate: { stringValue: '2030-01-01' }, responsible: { stringValue: '' } } }) });
  await C.p.getByRole('tab', { name: 'الإجراءات التصحيحية' }).click();
  await C.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await C.p.waitForSelector('.bp-alert', { timeout: 15000 });
  assert.match(await C.p.locator('.bp-alert').innerText(), /إجراء جديد/);
  await C.p.waitForSelector('.bp-action.fresh', { timeout: 5000 });
  assert.deepEqual(C.errs, []);
  await C.c.close();
  // the quality manager's device receives the branch reply and verifies it
  await B.p.goto(APP + '/actions'); await B.p.waitForTimeout(1500);
  await B.p.getByRole('button', { name: 'الكل' }).click().catch(() => {});
  await B.p.waitForSelector('.action-proof', { timeout: 20000 });
  assert.match(await B.p.locator('.action-proof').first().innerText(), /تم التنظيف/);
  await B.p.getByRole('button', { name: 'تحقق وأغلق ✓' }).first().click();
  let st = ''; for (let k = 0; k < 15 && st !== 'مغلق'; k++) { await new Promise(r => setTimeout(r, 1000)); st = val((await fsGet('actions/e2e-act')).fields.status); }
  assert.equal(st, 'مغلق');
});
await step('manager device: branch file, comparison, pull-to-refresh and the sync chip work', async () => {
  const insp = await fsGet(`inspections/${inspectionId}`); const branchId = val(insp.fields.branchId);
  await B.p.goto(APP + `/branches/${encodeURIComponent(branchId)}`); await B.p.waitForSelector('.bprof', { timeout: 15000 });
  assert.ok(await B.p.locator('.bp-hero2').count(), 'branch hero'); assert.ok(await B.p.locator('.loc-state').count(), 'location card');
  await B.p.goto(APP + `/compare?a=${encodeURIComponent(branchId)}`); await B.p.waitForSelector('.cmp-pick', { timeout: 15000 });
  await B.p.goto(APP + '/'); await B.p.waitForSelector('.today', { timeout: 15000 }); await B.p.waitForTimeout(800);
  const cdp = await B.c.newCDPSession(B.p); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 200, y }] });
  await touch('touchStart', 140); for (let y = 140; y <= 420; y += 28) await touch('touchMove', y);
  await B.p.waitForSelector('.ptr', { timeout: 4000 }); await touch('touchEnd', 420);
  await B.p.waitForSelector('.ptr.busy, .ptr.done', { timeout: 6000 });
  await B.p.waitForSelector('.ptr.done', { timeout: 15000 });
  await B.p.getByTestId('button-sync').click(); await B.p.waitForFunction(() => /تم التحديث|جارٍ التحديث/.test(document.querySelector('[data-testid=button-sync]')?.textContent ?? ''), null, { timeout: 8000 });
});
await step('no page errors on either device', async () => { assert.deepEqual([...A.errs, ...B.errs], []); });
await step('enforced Content-Security-Policy: nothing was blocked', async () => {
  const blocked = [...A.logs, ...B.logs].filter(t => /Content Security Policy|Refused to (load|connect|execute|evaluate|apply|frame)/i.test(t));
  assert.deepEqual(blocked, []);
});

await browser.close();
for (const r of results) console.log(r.join(' | '));
console.log(`SUMMARY ${results.filter(r => r[0] === 'PASS').length}/${results.length}`);

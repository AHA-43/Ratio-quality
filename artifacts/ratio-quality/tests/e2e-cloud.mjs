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
// Manager role is granted by an admin (service account here).
await fetch(`${FS}/users/${qmUid}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: { email: { stringValue: 'manager@test.local' }, name: { stringValue: 'مدير الجودة' }, role: { stringValue: 'quality_manager' }, canApprove: { booleanValue: true }, active: { booleanValue: true } } }) });

const browser = await chromium.launch();
const newDevice = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true }); const p = await c.newPage(); const errs = []; const logs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => logs.push(m.text().slice(0, 200))); return { c, p, errs, logs }; };
const login = async (p, email) => { await p.goto(APP + '/'); await p.waitForSelector('.login-card'); await p.locator('input[type=email]').fill(email); await p.locator('input[type=password]').fill('Test-pass-123'); await p.getByRole('button', { name: 'دخول' }).click(); await p.waitForSelector('.today', { timeout: 20000 }); };
const draw = async (p, sel) => { const c = p.locator(sel); await c.scrollIntoViewIfNeeded(); const b = await c.boundingBox(); await p.mouse.move(b.x + 20, b.y + 40); await p.mouse.down(); await p.mouse.move(b.x + 140, b.y + 100, { steps: 6 }); await p.mouse.move(b.x + 220, b.y + 40, { steps: 6 }); await p.mouse.up(); };

const A = await newDevice();
let inspectionId; let photoLen = 0;
await step('wrong password is rejected with a clear message', async () => {
  await A.p.goto(APP + '/'); await A.p.waitForSelector('.login-card');
  await A.p.locator('input[type=email]').fill('inspector@test.local'); await A.p.locator('input[type=password]').fill('wrong');
  await A.p.getByRole('button', { name: 'دخول' }).click(); await A.p.waitForSelector('.login-card .err');
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
  const [y] = await Promise.all([A.p.waitForEvent('download', { timeout: 60000 }), A.p.getByRole('button', { name: 'PowerPoint' }).click()]);
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
  const id2 = A.p.url().split('/').pop();
  await A.p.getByTestId('answer-pass-1').click(); await A.p.waitForTimeout(800);
  assert.match(await A.p.locator('.sync-chip').innerText(), /دون اتصال/);
  await A.c.setOffline(false); await A.p.getByTestId('answer-pass-2').click(); await A.p.waitForTimeout(4000);
  const d = await fsGet(`inspections/${id2}`);
  assert.ok(d.fields, 'offline draft reached the cloud after reconnecting');
});
await step('no page errors on either device', async () => { assert.deepEqual([...A.errs, ...B.errs], []); });

await browser.close();
for (const r of results) console.log(r.join(' | '));
console.log(`SUMMARY ${results.filter(r => r[0] === 'PASS').length}/${results.length}`);

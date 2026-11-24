// Post-deploy smoke test on the LIVE site with a temporary account (created and removed by CI).
// Env: APP_URL, EMAIL, PASSWORD, TOKEN (service-account bearer for verification), PROJECT
import { createRequire } from 'node:module';
import { strict as assert } from 'node:assert';
const { chromium } = createRequire(import.meta.url)('playwright');
const { APP_URL, EMAIL, PASSWORD, TOKEN, PROJECT = 'ratio-quality' } = process.env;
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const H = { Authorization: `Bearer ${TOKEN}` };
const results = []; let failed = false;
const step = async (name, fn) => { try { await fn(); results.push(`PASS | ${name}`); } catch (e) { failed = true; results.push(`FAIL | ${name} | ${String(e.message).slice(0, 250)}`); } };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('rq-coach', 'done'); localStorage.setItem('rq-brief', 'off'); sessionStorage.setItem('rq-name-skip', '1'); } catch {} });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const csp = []; p.on('console', m => { const t = m.text(); if (/Content Security Policy|Report Only|Refused to/i.test(t)) csp.push(t.slice(0, 220)); });
let id = '';
await step('site loads with branded login', async () => { await p.goto(APP_URL); await p.waitForSelector('.login-card', { timeout: 30000 }); assert.equal(await p.locator('.login-logo').count(), 1); });
await step('sign in', async () => { await p.locator('input[type=email]').fill(EMAIL); await p.locator('input[type=password]').fill(PASSWORD); await p.getByRole('button', { name: 'دخول' }).click(); await p.waitForSelector('.today', { timeout: 30000 }); });
await step('branch master loaded: Kingdom map by default, search lists branches', async () => {
  await p.goto(APP_URL + '/inspection/new'); await p.waitForSelector('[data-testid=input-branch-search]');
  await p.waitForSelector('.saudi-map .city', { timeout: 20000 });
  assert.ok(await p.locator('.saudi-map .city').count() >= 25, 'city bubbles on the map');
  await p.getByTestId('input-branch-search').fill('HAS.');
  await p.waitForSelector('.branch-option');
  assert.ok(await p.locator('.branch-option').count() >= 10, 'search results');
  await p.getByTestId('input-branch-search').fill('');
});
await step('start draft and answer with photo', async () => {
  await p.getByTestId('input-branch-search').fill('HAS.01'); await p.locator('.branch-option').first().click();
  await p.getByTestId('button-create-inspection').click(); await p.waitForURL(u => /\/inspection\/(?!new)[^/]+$/.test(String(u))); id = p.url().split('/').pop();
  await p.getByTestId('answer-pass-1').click(); await p.waitForTimeout(700);
  await p.getByTestId('answer-pass-2').click(); await p.waitForTimeout(700);
  await p.getByTestId('answer-fail-3').click(); await p.getByTestId('input-observation-3').fill('اختبار آلي — يُحذف');
  await p.getByTestId('input-photo-3').setInputFiles(new URL('./fixture-photo.jpg', import.meta.url).pathname);
  await p.waitForSelector('.evidence-item img'); await p.waitForTimeout(5000);
});
await step('draft and photo reached Firestore', async () => {
  let d = {}, att;
  for (let k = 0; k < 20; k++) {
    d = await (await fetch(`${FS}/inspections/${id}`, { headers: H })).json();
    att = d.fields?.answers?.mapValue?.fields?.['3']?.mapValue?.fields?.attachments?.arrayValue?.values?.[0]?.mapValue?.fields;
    if (att?.storagePath) break; await new Promise(r => setTimeout(r, 1500));
  }
  assert.ok(d.fields, 'inspection missing in cloud'); assert.ok(att, 'item 3 with photo not in cloud after 30s');
  const path = att.storagePath?.stringValue; assert.match(path ?? '', /^photos\//);
  const ph = await (await fetch(`${FS}/${path}`, { headers: H })).json(); assert.match(ph.fields.data.stringValue, /^data:image\/jpeg/);
});
await step('main pages open without errors', async () => {
  for (const r of ['/', '/visits', '/actions', '/reports', '/analytics', '/equipment', '/baristas', '/config', '/priorities', '/priorities?tab=plan']) { await p.goto(APP_URL + r); await p.waitForTimeout(900); }
  assert.deepEqual(errs, []);
});
await step('production headers present and no Content-Security-Policy violations in the browser', async () => {
  const r = await fetch(APP_URL); const h = r.headers;
  assert.equal(h.get('x-content-type-options'), 'nosniff'); assert.equal(h.get('x-frame-options'), 'DENY'); assert.match(h.get('permissions-policy') ?? '', /camera=\(self\)/);
  assert.ok(h.get('content-security-policy') || h.get('content-security-policy-report-only'), 'CSP header missing');
  assert.deepEqual(csp, [], 'CSP violations: ' + csp.join(' || '));
});
await b.close();
console.log(results.join('\n'));
console.log(`INSPECTION_ID=${id}`);
process.exit(failed ? 1 : 0);

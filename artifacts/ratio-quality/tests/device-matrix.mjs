// Device-matrix check (Chromium with real device profiles: size, DPR, touch, user agent) under constrained conditions:
// slow 4G + 4x CPU slowdown on first load, then offline reload from the service-worker cache and answering offline.
// Usage: vite build --mode shot && vite preview --port 4181 &  node tests/device-matrix.mjs http://localhost:4181
// NOTE: this is emulation in Chromium, not Safari/iOS hardware. It cannot prove iOS-specific behaviour.
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4181';
const only = process.env.ONLY; const matrix = (['iPhone SE', 'iPhone 14 Pro Max', 'Pixel 7', 'Galaxy S9+', 'iPad Mini', 'iPad Pro 11', 'Galaxy Tab S4', 'iPhone 14 landscape']).filter(n => !only || n === only);
const b = await chromium.launch();
let failed = false; const rows = [];
for (const name of matrix) {
  const d = devices[name]; if (!d) { rows.push(`${name}: profile missing`); continue; }
  const prof = { ...d };
  delete prof.defaultBrowserType;
  const ctx = await b.newContext(prof); await ctx.addInitScript(() => { try { localStorage.setItem('rq-coach', 'done'); localStorage.setItem('rq-brief', 'off'); } catch {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text().slice(0, 120)); });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now(); await p.goto(base + '/'); await p.waitForSelector('.today-hello h1', { timeout: 60000 }); const loadMs = Date.now() - t0;
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const kb = await p.evaluate(() => Math.round(performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0) / 1024));
  const o1 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // visit: pick a branch, answer a few items including a failure with a photo
  await p.goto(base + '/inspection/new'); await p.waitForTimeout(1500); await p.getByTestId('input-branch-search').fill('HAS.01'); await p.waitForTimeout(500); await p.locator('.branch-option').first().click();
  await p.getByTestId('input-inspector').fill('اختبار'); await p.getByTestId('button-create-inspection').click(); await p.waitForURL(/\/inspection\/[0-9a-z-]{8}/);
  const hasBar = await p.locator('.action-bar').count() > 0;
  for (let id = 1; id <= 4; id++) await p.getByTestId('answer-pass-' + id).click();
  await p.getByTestId('answer-fail-5').click(); await p.getByTestId('input-observation-5').fill('ملاحظة اختبارية'); await p.getByTestId('input-photo-5').setInputFiles(new URL('./fixture-photo.jpg', import.meta.url).pathname);
  await p.waitForSelector('.evidence-item img'); await p.getByTestId('button-next-question').click();
  const visitUrl = p.url();
  // service worker + offline: warm caches, go offline, hard reload, navigate to a lazy screen, keep answering
  await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(4500);
  await ctx.setOffline(true);
  let offlineOk = true, why = '';
  try { await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('.question-card', { timeout: 15000 });
    await p.getByTestId('answer-pass-1').click(); await p.waitForTimeout(700); // the runner reopens on question 1 after a reload
    await p.goto(base + '/priorities'); await p.waitForSelector('.pr-page', { timeout: 15000 });
    await p.goto(visitUrl.replace(base, base)); await p.waitForSelector('.question-card', { timeout: 15000 });
    const passes = await p.locator('.heat.p').count(), fails = await p.locator('.heat.f').count(); if (passes < 4 || fails < 1) { offlineOk = false; why = `answers lost (${passes} pass, ${fails} fail)`; }
  } catch (e) { offlineOk = false; why = String(e.message).split('\n')[0].slice(0, 80); }
  await ctx.setOffline(false);
  await p.waitForTimeout(800); // let entry animations settle
  const o2 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const small = await p.evaluate(() => [...document.querySelectorAll('button:not(.heat),a,select')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && (r.height < 43 || r.width < 43) && !e.closest('.wh-chips,.heat-strip'); }).length);
  if (o1 > 0 || o2 > 0) { const w = await p.evaluate(() => { const vw = document.documentElement.clientWidth; const inScroller = e => { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const ox = getComputedStyle(n).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true; } return false; }; return [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1 && getComputedStyle(e).position !== 'fixed' && !inScroller(e); }).slice(0, 4).map(e => `${e.tagName}.${String(e.className?.baseVal === undefined ? e.className : '').split(' ')[0]} right=${Math.round(e.getBoundingClientRect().right)} ${(e.textContent || '').trim().slice(0, 24)}`); }); console.log('  overflow offenders:', JSON.stringify(w)); }
  const ok = offlineOk && !errs.length && o1 <= 0 && o2 <= 0 && small === 0;
  if (!ok) failed = true;
  rows.push(`${ok ? 'PASS' : 'FAIL'} | ${name.padEnd(20)} | ${p.viewportSize().width}x${p.viewportSize().height} | slow-4G+4xCPU load ${(loadMs / 1000).toFixed(1)}s, ${kb} KB | action bar ${hasBar ? 'yes' : 'no'} | overflow ${o1}/${o2} | offline ${offlineOk ? 'ok' : 'FAIL ' + why} | small targets ${small} | errors ${errs.length}${errs.length ? ' ' + errs[0] : ''}`);
  await ctx.close();
}
await b.close(); console.log(rows.join('\n')); process.exit(failed ? 1 : 0);

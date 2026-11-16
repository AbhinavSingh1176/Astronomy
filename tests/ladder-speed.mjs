#!/usr/bin/env node
/* OWLT · tests/ladder-speed.mjs — how long the Ladder takes to show its first frame, and to finish loading everything.
   Throttled to a typical 4G connection (9 Mbit/s down, 60 ms latency), against tests/serve-gh.mjs so transfer sizes match GitHub Pages.
     node tests/serve-gh.mjs 8766 &   node tests/ladder-speed.mjs [http://127.0.0.1:8766] [--runs 3] [--fast] */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2), BASE = (args.find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8766').replace(/\/$/, '');
const RUNS = args.includes('--runs') ? +args[args.indexOf('--runs') + 1] : 3, FAST = args.includes('--fast');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
for (let r = 0; r < RUNS; r++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (!FAST) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 });
  /* timestamps from inside the page: when the boot screen lifts, the first frame after it, and when the deferred catalogue is in */
  await page.addInitScript(() => {
    window.__t = {}; const mark = k => { if (!window.__t[k]) window.__t[k] = performance.now(); };
    new MutationObserver(() => { const b = document.getElementById('boot'); if (b && b.classList.contains('off') && !window.__t.boot) { mark('boot'); requestAnimationFrame(() => requestAnimationFrame(() => mark('frame'))); } })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
    addEventListener('owlt:ladder-complete', () => mark('complete'));
  });
  const t0 = Date.now();
  await page.goto(BASE + '/ladder.html', { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__t && window.__t.frame, null, { timeout: 180000 });
  await page.waitForFunction(() => window.__t.complete, null, { timeout: 30000 }).catch(() => {});
  const t = await page.evaluate(() => ({ ...window.__t, res: performance.getEntriesByType('resource').map(e => ({ n: e.name.split('/').slice(-2).join('/'), kb: Math.round(e.transferSize / 1024), end: Math.round(e.responseEnd) })) }));
  const bytes = t.res.reduce((s, x) => s + x.kb, 0), beforeBoot = t.res.filter(x => x.end <= t.boot).reduce((s, x) => s + x.kb, 0);
  results.push(t); console.log(`run ${r + 1}: first frame ${Math.round(t.frame)} ms · everything ${t.complete ? Math.round(t.complete) + ' ms' : '(no completion event)'} · ${beforeBoot} KB before the first frame, ${bytes} KB in all`);
  if (r === 0) for (const x of t.res.sort((a, b) => a.end - b.end)) console.log('    ' + String(x.end).padStart(6) + ' ms  ' + String(x.kb).padStart(5) + ' KB  ' + x.n);
  await ctx.close();
}
await browser.close();
const med = k => { const v = results.map(x => x[k]).filter(Boolean).sort((a, b) => a - b); return v.length ? Math.round(v[Math.floor(v.length / 2)]) : null; };
console.log(`\nmedian: first frame ${med('frame')} ms, everything loaded ${med('complete') ?? '—'} ms` + (FAST ? ' (no throttling)' : ' (4G: 9 Mbit/s, 60 ms)'));

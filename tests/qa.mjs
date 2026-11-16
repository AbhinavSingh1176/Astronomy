#!/usr/bin/env node
/* OWLT · tests/qa.mjs — every page in a real browser, at desktop and phone width.
   Fails on console errors, uncaught exceptions, failed requests, horizontal overflow, broken internal links,
   a search box that finds nothing, or a Ladder canvas that stays black.
   Needs Playwright with Chromium (npm i -g playwright && npx playwright install chromium).
     python3 -m http.server 8765 &   node tests/qa.mjs [http://127.0.0.1:8765] [--shots dir] */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), BASE = (args.find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8765').replace(/\/$/, '');
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PAGES = ['index.html', 'papers.html', 'papers.html#canon-penzias-wilson-1965', 'papers.html#term-redshift', 'dispatch.html', 'deck.html', 'sky.html', 'sky.html#con-Ori', 'sky.html#vega', 'atlas.html', 'atlas.html#europa', 'lost.html', 'lost.html#apollo-1', 'log.html', 'gallery.html', 'games.html', 'games.html#constellation', 'games.html#light', 'sky.html#con-Ser',
  'ladder.html', 'ladder.html#scale-planets', 'ladder.html#proxima-centauri', 'ladder.html#scale-galaxy', 'ladder.html#andromeda-galaxy', 'ladder.html#scale-universe', 'ladder.html#sgr-a-star'];
const SIZES = [[1440, 900], [390, 844]];
let fails = 0; const fail = (where, msg) => { fails++; console.log('  FAIL ' + where + ': ' + msg); }, noted = new Set();

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  for (const pg of PAGES) {
    const page = await ctx.newPage(), where = pg + ' @' + w, errs = [];
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => addEventListener('owlt:ladder-complete', () => { window.__done = true; }));
    /* an outside host this machine cannot reach (a sandbox, no network) is noted, not failed; anything from the site itself always fails */
    const OFFLINE = /ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_PROXY_CONNECTION_FAILED|ERR_CONNECTION_REFUSED/;
    page.on('console', m => { if (m.type() === 'error' && !OFFLINE.test(m.text())) errs.push('console: ' + m.text()); });
    page.on('pageerror', e => errs.push('exception: ' + e.message));
    page.on('requestfailed', r => { const u = r.url(), why = (r.failure() || {}).errorText || '';
      if (/fonts\.gstatic|favicon/.test(u)) return;
      if (!u.startsWith(BASE) && OFFLINE.test(why)) { if (!noted.has(u)) { noted.add(u); console.log('  note ' + where + ': cannot reach ' + new URL(u).host + ' from here (' + why + ')'); } return; }
      errs.push('request failed: ' + u + (why ? ' (' + why + ')' : '')); });
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(BASE)) errs.push('HTTP ' + r.status() + ': ' + r.url()); });
    try { await page.goto(BASE + '/' + pg, { waitUntil: 'load', timeout: 60000 }); } catch (e) { fail(where, 'did not load: ' + e.message); await page.close(); continue; }
    if (pg.startsWith('ladder')) { await page.waitForSelector('#boot.off', { timeout: 60000 }).catch(() => fail(where, 'the Ladder never finished booting'));
      /* the rest of the catalogue arrives after the first frame; a place in the address flies once it is in */
      await page.waitForFunction(() => window.__done, null, { timeout: 90000 }).catch(() => fail(where, 'the rest of the catalogue never arrived')); await page.waitForTimeout(pg.includes('#') ? 6000 : 2500); }
    else await page.waitForTimeout(1500);
    for (const e of errs) fail(where, e);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 1) fail(where, 'page scrolls sideways by ' + over + 'px');
    /* internal links must point at pages that exist */
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => h && !/^(https?:|mailto:|#)/.test(h)));
    for (const l of new Set(links)) { const f = l.split('#')[0]; if (f && !existsSync(path.join(ROOT, f))) fail(where, 'link to a missing page: ' + l); }
    if (pg.startsWith('ladder')) {
      /* read the canvas inside the same animation frame it was drawn in, before the browser clears it */
      const lit = await page.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { const c = document.querySelector('#gl'), t = document.createElement('canvas'); t.width = 64; t.height = 64;
        const x = t.getContext('2d'); x.drawImage(c, 0, 0, 64, 64); const d = x.getImageData(0, 0, 64, 64).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; res(s / (64 * 64)); }))));
      if (!(lit > 2)) fail(where, 'the canvas looks empty (mean brightness ' + lit.toFixed(2) + ')');
      const h1 = await page.evaluate(() => (document.querySelector('#panel h1') || {}).textContent || '');
      if (!h1) fail(where, 'no info card for the focus');
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, pg.replace(/[^a-z0-9]+/gi, '_') + '-' + w + '.png'), fullPage: !pg.startsWith('ladder') && !pg.startsWith('deck') });
    console.log((errs.length || over > 1 ? 'FAIL ' : 'ok   ') + where);
    await page.close();
  }
  await ctx.close();
}
/* the search palette reaches everything */
{
  const page = await browser.newPage(); await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await page.waitForTimeout(600);
  for (const [q, want] of [['Europa', 'ladder.html#europa'], ['Hubble 1929', 'papers.html#canon-hubble-1929'], ['M31', 'ladder.html#andromeda-galaxy'], ['Columbia', 'lost.html#columbia'], ['dark matter', 'papers.html#term-dark-matter'], ['Orion', 'sky.html#con-Ori']]) {
    await page.keyboard.press('/'); await page.fill('#owlt-q', q); await page.waitForTimeout(500);
    const hrefs = await page.evaluate(() => [...document.querySelectorAll('#owlt-pal .it')].slice(0, 8).map(a => a.getAttribute('href')));
    if (!hrefs.includes(want)) fail('search "' + q + '"', 'expected ' + want + ' in the first results, got ' + hrefs.slice(0, 4).join(', ')); else console.log('ok   search "' + q + '"');
    await page.keyboard.press('Escape');
  }
  await page.close();
}
await browser.close();
console.log('\n' + (fails ? fails + ' problems' : 'every page clean'));
process.exit(fails ? 1 : 0);

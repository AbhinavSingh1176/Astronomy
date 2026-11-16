#!/usr/bin/env node
/* OWLT · tests/overlap.mjs — finds text that renders on top of other text.
   Every line box of every visible text node is measured (clipped by scrolling and overflow-hidden ancestors);
   two different text nodes whose boxes overlap by more than a sliver are reported. Runs each page at five widths.
     python3 -m http.server 8765 &   node tests/overlap.mjs [http://127.0.0.1:8765] [--shots dir] [--only page.html] */
import { createRequire } from 'node:module';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2), BASE = (args.find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8765').replace(/\/$/, '');
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const PAGES = ['index.html', 'papers.html', 'papers.html#canon-penzias-wilson-1965', 'dispatch.html', 'deck.html', 'sky.html', 'atlas.html', 'atlas.html#europa', 'lost.html', 'log.html',
  'gallery.html', 'games.html',
  'ladder.html', 'ladder.html#earth', 'ladder.html#scale-moon', 'ladder.html#scale-inner', 'ladder.html#scale-planets', 'ladder.html#saturn', 'ladder.html#scale-heliosphere', 'ladder.html#scale-neighbours', 'ladder.html#proxima-centauri',
  'ladder.html#scale-arm', 'ladder.html#scale-galaxy', 'ladder.html#scale-local-group', 'ladder.html#andromeda-galaxy', 'ladder.html#scale-laniakea', 'ladder.html#scale-universe']
  .filter(p => (!ONLY || p.startsWith(ONLY)) && existsSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', p.split('#')[0])));
const SIZES = [[1440, 900], [1280, 800], [1024, 768], [820, 1180], [390, 844]]
  .filter(([w]) => !args.includes('--w') || args[args.indexOf('--w') + 1].split(',').map(Number).includes(w));

/* runs in the page: every visible line box of text, clipped to what can actually be seen */
function collect() {
  /* the contents of a closed <details> keep a layout box in Chromium (content-visibility) but are not drawn */
  const out = [], vis = el => { if (el.closest('details:not([open])') && !el.closest('summary')) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || s.contentVisibility === 'hidden' || +s.opacity < 0.3) return false; } return true; };
  const clipOf = el => { let r = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 }; for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); if (s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.clipPath !== 'none') { const b = e.getBoundingClientRect(); r = { l: Math.max(r.l, b.left), t: Math.max(r.t, b.top), r: Math.min(r.r, b.right), b: Math.min(r.b, b.bottom) }; } if (s.position === 'fixed') break; } return r; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  let n, id = 0; const range = document.createRange();
  while ((n = walker.nextNode())) {
    const el = n.parentElement; if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION)$/.test(el.tagName) || !vis(el)) continue;
    range.selectNodeContents(n); const c = clipOf(el), who = (el.closest('[id]') || {}).id || '', tag = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const fixed = (() => { for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') return true; return false; })();
    id++;
    for (const r of range.getClientRects()) {
      const l = Math.max(r.left, c.l), t = Math.max(r.top, c.t), rr = Math.min(r.right, c.r), b = Math.min(r.bottom, c.b);
      if (rr - l < 2 || b - t < 2) continue;
      out.push({ id, l, t: t + (fixed ? 0 : scrollY), r: rr, b: b + (fixed ? 0 : scrollY), fixed, text: n.nodeValue.trim().slice(0, 48), who, tag });
    }
  }
  return out;
}
function overlaps(boxes) {
  const found = [], seen = new Set();
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]; if (a.id === b.id || a.fixed !== b.fixed) continue;
    const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    if (w <= 1.5 || h <= 1.5) continue;
    const small = Math.min((a.r - a.l) * (a.b - a.t), (b.r - b.l) * (b.b - b.t));
    if (w * h < 0.12 * small) continue;                          /* a sliver of ascender or descender is not an overlap */
    const key = a.text + '|' + b.text; if (seen.has(key)) continue; seen.add(key);
    found.push({ a: a.text, b: b.text, where: [Math.round(a.l), Math.round(a.t)], ids: [a.who + ' ' + a.tag, b.who + ' ' + b.tag], frac: +(w * h / small).toFixed(2) });
  }
  return found;
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let total = 0;
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  for (const pg of PAGES) {
    const page = await ctx.newPage(); await page.addInitScript(() => addEventListener('owlt:ladder-complete', () => { window.__done = true; }));
    try { await page.goto(BASE + '/' + pg, { waitUntil: 'load', timeout: 60000 }); } catch (e) { console.log('skip ' + pg + ' @' + w + ': ' + e.message.split('\n')[0]); await page.close(); continue; }
    if (pg.startsWith('ladder')) { await page.waitForSelector('#boot.off', { timeout: 90000 }).catch(() => {}); await page.waitForFunction(() => window.__done, null, { timeout: 90000 }).catch(() => {}); await page.waitForTimeout(pg.includes('#') ? 7000 : 3000); } else await page.waitForTimeout(1600);
    const boxes = await page.evaluate(collect), found = overlaps(boxes);
    total += found.length;
    console.log((found.length ? 'OVERLAP ' : 'ok      ') + pg + ' @' + w + (found.length ? '  (' + found.length + ')' : ''));
    for (const f of found.slice(0, 12)) console.log('    "' + f.a + '"  ×  "' + f.b + '"  at ' + f.where.join(',') + '  [' + f.ids.join(' | ') + ']  ' + Math.round(f.frac * 100) + '%');
    if (SHOTS && found.length) await page.screenshot({ path: path.join(SHOTS, pg.replace(/[^a-z0-9]+/gi, '_') + '-' + w + '.png'), fullPage: !pg.startsWith('ladder') && !pg.startsWith('deck') });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log('\n' + (total ? total + ' overlaps' : 'no overlapping text'));
process.exit(total ? 1 : 0);

/* OWLT · tests/games.mjs — plays the day's three puzzles in a real browser, both ways: a loss and a win for each, and checks what is left behind.
   node tests/games.mjs [base-url]   (default http://127.0.0.1:8766/, e.g. tests/serve-gh.mjs) */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8766/';
const shots = process.env.SHOTS || '';
const fails = [], ok = (c, m) => { if (!c) fails.push(m); console.log((c ? '  ok  ' : '  FAIL ') + m); };
const browser = await chromium.launch();

async function page(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  return { ctx, p, errs };
}
const state = p => p.evaluate(() => JSON.parse(localStorage.getItem('owlt:games') || 'null'));

/* ── a win for each ── */
{
  const { ctx, p, errs } = await page(1440, 1000);
  await p.goto(BASE + 'games.html'); await p.waitForFunction(() => document.querySelectorAll('#swBoard .tile').length === 30);
  let st = await state(p); ok(st && st.sw && /^[A-Z]{5}$/.test(st.sw.a), 'Starword has a word for today: ' + (st && st.sw && st.sw.a));
  ok(await p.isVisible('#g-starword'), 'Starword is the first cabinet open');
  /* not a word, then a real wrong word, then the answer */
  await p.keyboard.type('qxzjv'); await p.keyboard.press('Enter');
  ok((await p.textContent('#swMsg')).includes('Not in the word list'), 'a non-word is refused');
  for (let i = 0; i < 5; i++) await p.keyboard.press('Backspace');
  const wrong = st.sw.a === 'CRANE' ? 'SLATE' : 'CRANE';
  await p.keyboard.type(wrong.toLowerCase()); await p.keyboard.press('Enter'); await p.waitForTimeout(1700);
  ok((await p.$$eval('#swBoard .row:first-child .tile', t => t.map(x => x.className))).every(c => /hit|near|miss/.test(c)), 'the first row is scored');
  await p.keyboard.type(st.sw.a.toLowerCase()); await p.keyboard.press('Enter'); await p.waitForTimeout(1900);
  st = await state(p); ok(st.sw.done && st.sw.won && st.sw.g.length === 2, 'Starword solved in 2');
  ok(await p.isVisible('#swDone .done'), 'the result card shows');
  ok((await p.textContent('#swDone')).includes(st.sw.a), 'the card names the word');
  ok(st.stats.sw.streak === 1 && st.stats.sw.dist[2] === 1, 'streak and distribution are recorded');
  if (shots) await p.screenshot({ path: shots + '/games-sw-1440.png', fullPage: true });

  /* Constellation: a wrong guess by English name, then the answer by abbreviation */
  await p.click('#cabs [data-game=constellation]'); ok(await p.isVisible('#g-constellation'), 'the Constellation cabinet opens');
  ok(await p.$eval('#coPlot svg', s => s.querySelectorAll('circle').length > 4 && s.querySelectorAll('polyline').length > 0), 'a figure is drawn');
  const ans = st.co.a, other = ans === 'Ori' ? 'Swan' : 'Hunter', otherId = ans === 'Ori' ? 'Cyg' : 'Ori';
  await p.fill('#coIn', 'Not A Thing'); await p.press('#coIn', 'Enter');
  ok((await p.textContent('#coMsg')).includes('Not a constellation'), 'an unknown name is refused');
  await p.fill('#coIn', other); ok(await p.$$eval('#coSugg .opt', b => b.length) > 0, 'suggestions appear while typing');
  await p.press('#coIn', 'Enter'); st = await state(p);
  ok(st.co.g.length === 1 && st.co.g[0] === otherId, 'an English name counts as a guess (' + other + ' → ' + otherId + ')');
  const clue = await p.textContent('#coClues li'); ok(/\d+°/.test(clue) && /\d+%/.test(clue), 'a miss gives a distance and closeness: ' + clue.replace(/\s+/g, ' '));
  await p.fill('#coIn', other); await p.press('#coIn', 'Enter'); ok((await p.textContent('#coMsg')).includes('Already'), 'a repeat guess is refused');
  await p.fill('#coIn', ans.toLowerCase()); await p.press('#coIn', 'Enter'); st = await state(p);
  ok(st.co.done && st.co.won && st.co.g.length === 2, 'Constellation solved in 2 (' + ans + ')');
  ok(await p.$eval('#coIn', i => i.disabled), 'the box is shut once solved');
  ok((await p.textContent('#coDone')).includes('Find it in the Observatory'), 'the card links to the Observatory');
  if (shots) await p.screenshot({ path: shots + '/games-co-1440.png', fullPage: true });

  /* Light Time: a guess far off, then the answer */
  await p.click('#cabs [data-game=light]');
  const target = await p.textContent('#ltTarget'); ok(target.length > 1, 'Light Time has an object: ' + target);
  const sec = await p.evaluate(async () => {
    const st = JSON.parse(localStorage.getItem('owlt:games')), G = await (await fetch('data/games.json')).json(), it = G.light.find(x => x.slug === st.lt.a), A = window.ASTRO, jd = A.jdOf(new Date());
    if (!it.live) return it.sec;
    return it.slug === 'moon' ? A.moon(jd).distKm / 299792.458 : it.slug === 'sun' ? A.sun(jd).dist * A.AU_KM / 299792.458 : it.slug === 'voyager-1' ? A.probe('voyager-1', jd).lightSec : A.planet(it.slug, jd).lightMin * 60;
  });
  const far = Math.log10(sec) > 9 ? 1 : 17;
  await p.$eval('#ltIn', (r, v) => { r.value = v; r.dispatchEvent(new Event('input')); }, far); await p.click('#ltGo');
  st = await state(p); ok(st.lt.g.length === 1 && st.lt.g[0][1] === 'c', 'a guess far off is cold');
  ok(st.lt.g[0][2] === (far < Math.log10(sec) ? 1 : -1), 'and points the right way');
  /* a drag on the dial moves the needle */
  const box = await p.$eval('#ltScale', s => { const r = s.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  await p.mouse.move(box[0] + box[2] * 0.25, box[1] + 10); await p.mouse.down(); await p.mouse.move(box[0] + box[2] * 0.5, box[1] + 10, { steps: 4 }); await p.mouse.up();
  const v = +(await p.$eval('#ltIn', r => r.value)); ok(Math.abs(v - (-0.5 + 0.5 * 18.5)) < 0.3, 'dragging the dial tunes it (' + v + ')');
  await p.$eval('#ltIn', (r, v) => { r.value = v; r.dispatchEvent(new Event('input')); }, Math.log10(sec)); await p.click('#ltGo');
  st = await state(p); ok(st.lt.done && st.lt.won && st.lt.g.length === 2, 'Light Time solved in 2');
  ok(await p.$eval('#ltScale', s => !!s.querySelector('.mark.true')), 'the answer is marked on the dial');
  ok((await p.textContent('#ltDone')).includes('Copy all three'), 'with all three done, all three can be copied');
  ok(await p.$$eval('#cabs .lamp.go', l => l.length) === 3, 'three green lamps');
  if (shots) await p.screenshot({ path: shots + '/games-lt-1440.png', fullPage: true });

  /* the result cards read back */
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await p.click('#ltDone button:has-text("Copy all three")'); await p.waitForTimeout(200);
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(/OWLT Starword No\. \d+ · 2\/6/.test(clip) && /OWLT Constellation No\. \d+ · 2\/6/.test(clip) && /OWLT Light Time No\. \d+ · 2\/5/.test(clip), 'the copied card has all three results');
  ok(!new RegExp(st.sw.a, 'i').test(clip), 'and gives nothing away');
  /* a reload keeps the day */
  await p.reload(); await p.waitForFunction(() => document.querySelector('#swDone .done'));
  ok(await p.$$eval('#cabs .lamp.go', l => l.length) === 3, 'a reload keeps the day’s results');
  ok(errs.length === 0, 'no errors in the page' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

/* ── a loss for each, on a phone ── */
{
  const { ctx, p, errs } = await page(390, 844);
  await p.goto(BASE + 'games.html#starword'); await p.waitForFunction(() => document.querySelectorAll('#swBoard .tile').length === 30);
  let st = await state(p);
  const pool = ['CRANE', 'SLATE', 'PLANT', 'MOUSE', 'TRAIN', 'BRICK', 'GHOST'].filter(w => w !== st.sw.a).slice(0, 6);
  for (const w of pool) { for (const ch of w) await p.click('#swKeys .key[data-k="' + ch + '"]'); await p.click('#swKeys .key[data-k="Enter"]'); await p.waitForTimeout(1550); }
  st = await state(p); ok(st.sw.done && !st.sw.won, 'Starword lost after six on the screen keys');
  ok((await p.textContent('#swMsg')).includes(st.sw.a), 'and the word is shown');
  ok(st.stats.sw.streak === 0, 'the streak resets');
  if (shots) await p.screenshot({ path: shots + '/games-sw-390.png', fullPage: true });
  await p.click('#cabs [data-game=constellation]');
  const wrong = ['Ori', 'Cyg', 'Sco', 'Leo', 'Cas', 'Cru', 'UMa'].filter(x => x !== st.co.a).slice(0, 6);
  for (const w of wrong) { await p.fill('#coIn', w); await p.press('#coIn', 'Enter'); }
  st = await state(p); ok(st.co.done && !st.co.won, 'Constellation lost after six');
  ok((await p.textContent('#coHints')) === '', 'the clue line is cleared at the end');
  if (shots) await p.screenshot({ path: shots + '/games-co-390.png', fullPage: true });
  await p.click('#cabs [data-game=light]');
  for (let i = 0; i < 5; i++) { await p.$eval('#ltIn', r => { r.value = 17.9; r.dispatchEvent(new Event('input')); }); await p.click('#ltGo'); if ((await state(p)).lt.done) break; }
  st = await state(p); ok(st.lt.done, 'Light Time finished within five');
  if (shots) await p.screenshot({ path: shots + '/games-lt-390.png', fullPage: true });
  const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(sw <= 390, 'no sideways scroll on a phone (' + sw + ')');
  ok(errs.length === 0, 'no errors in the page' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}
await browser.close();
console.log(fails.length ? '\n' + fails.length + ' failed' : '\nall passed');
process.exit(fails.length ? 1 : 0);

/* OWLT · games.js — the arcade. Three puzzles a day, the same for everyone on a given date, new at local midnight:
   Starword, a five-letter space word in six tries; Constellation, a star figure to name, where each miss says how far away on the sky the
   answer is and which way; Light Time, a dial to tune to how long the light you see from something has been travelling.
   Each day's puzzles come from a fixed shuffle of the lists in data/, so nothing is fetched from anywhere else. Progress and streaks stay
   in this browser. */
(function () {
  'use strict';
  const O = window.OWLT, A = window.ASTRO, $ = O.$, el = O.el;
  O.nav();
  const D2R = Math.PI / 180, C = 299792.458, YEAR = 31557600;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const today = new Date(), DAY = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 864e5);
  const NO = Math.max(1, DAY - Date.UTC(2026, 10, 15) / 864e5 + 1);          /* No. 1 was 15 November 2026, in your own time zone */
  const HERE = location.origin + location.pathname;

  /* ── the day's pick: a seeded shuffle (mulberry32), a fresh order for each pass through a list ── */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffled(arr, seed) { const r = rng(seed), a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const pass = (n, k) => [Math.floor((k - 1) / n), (k - 1) % n];
  function pickPlain(list, salt, k) { const [c, p] = pass(list.length, k); return shuffled(list, salt * 7919 + c * 104729 + 1)[p]; }
  /* constellations: two well-known figures, then a fainter one, so a run of obscure ones never comes up */
  function pickCon(list, k) {
    const [c, p] = pass(list.length, k), e = shuffled(list.filter(x => x.rank < 3), 2027 + c * 104729), h = shuffled(list.filter(x => x.rank >= 3), 3011 + c * 104729), order = [];
    while (e.length || h.length) order.push((order.length % 3 === 2 && h.length) || !e.length ? h.shift() : e.shift());
    return order[p];
  }

  /* ── progress, in this browser only ── */
  let ST = O.store.get('games', null);
  if (!ST || typeof ST !== 'object' || ST.v !== 1) ST = { v: 1, day: DAY, sw: null, co: null, lt: null, stats: {} };
  if (ST.day !== DAY) { ST.day = DAY; ST.sw = ST.co = ST.lt = null; }       /* a new day: fresh boards, the same streaks */
  if (!ST.stats || typeof ST.stats !== 'object') ST.stats = {};
  const save = () => O.store.set('games', ST);
  const NAME = { sw: 'Starword', co: 'Constellation', lt: 'Light Time' }, MAX = { sw: 6, co: 6, lt: 5 }, TAB = { sw: 'starword', co: 'constellation', lt: 'light' };
  const KEY = { starword: 'sw', constellation: 'co', light: 'lt' };
  function record(k, won, n) {
    const s = ST.stats[k] || (ST.stats[k] = { played: 0, won: 0, streak: 0, best: 0, lastWin: null, dist: {} });
    s.played++;
    if (won) { s.won++; s.streak = s.lastWin === DAY - 1 ? s.streak + 1 : 1; s.best = Math.max(s.best, s.streak); s.lastWin = DAY; s.dist[n] = (s.dist[n] || 0) + 1; }
    else { s.streak = 0; s.dist.x = (s.dist.x || 0) + 1; }
  }
  const streak = s => s && s.lastWin != null && s.lastWin >= DAY - 1 ? s.streak : 0;

  /* ── the cabinets ── */
  function lamps() {
    O.$$('#cabs [data-game]').forEach(b => { const g = ST[KEY[b.dataset.game]];
      b.querySelector('.lamp').className = 'lamp' + (!g ? '' : g.done ? (g.won ? ' go' : ' alarm') : g.g && g.g.length ? ' on' : '');
      b.title = !g || !g.g || !g.g.length ? 'Not started' : g.done ? (g.won ? 'Solved' : 'Out of tries') : 'In progress'; });
  }
  function open(name, focus) {
    if (!KEY[name]) name = 'starword';
    O.$$('#cabs [data-game]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.game === name)));
    for (const id of Object.keys(KEY)) $('#g-' + id).hidden = id !== name;
    if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
    if (focus && name === 'constellation' && ST.co && !ST.co.done && matchMedia('(pointer:fine)').matches) $('#coIn').focus({ preventScroll: true });
  }
  const shown = () => (O.$$('#cabs [aria-pressed=true]')[0] || {}).dataset;

  /* ── the date and the countdown to the next set ── */
  $('#dayNo').textContent = 'No. ' + NO;
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
  (function tick() {
    const left = midnight - Date.now(), host = $('#dayNext');
    if (left > 0) { host.textContent = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · next set in ' + O.fmt.countdown(left); setTimeout(tick, 1000 - Date.now() % 1000); }
    else O.clear(host).append(el('button', { class: 'push', type: 'button', onclick: () => location.reload(), text: 'A new set is ready' }));
  })();

  /* ── results: statistics, and a spoiler-free card to copy ── */
  function stats(k) {
    const s = ST.stats[k] || { played: 0, won: 0, best: 0, dist: {} }, g = ST[k], top = Math.max(1, ...Array.from({ length: MAX[k] }, (_, i) => s.dist[i + 1] || 0));
    return [el('div', { class: 'stats' }, [['Played', s.played], ['Won', s.played ? Math.round(100 * s.won / s.played) + '%' : '—'], ['Streak', streak(s)], ['Best streak', s.best || 0]]
        .map(([l, v]) => el('div', null, el('b', { text: String(v) }), l))),
      el('div', { class: 'dist', role: 'img', 'aria-label': 'Wins by number of tries: ' + Array.from({ length: MAX[k] }, (_, i) => (i + 1) + ' tries ' + (s.dist[i + 1] || 0)).join(', ') },
        Array.from({ length: MAX[k] }, (_, i) => { const n = s.dist[i + 1] || 0;
          return el('div', null, el('span', { text: String(i + 1) }), el('i', { class: g && g.won && g.g.length === i + 1 ? 'me' : null, style: { width: Math.max(9, 100 * n / top) + '%' }, text: String(n) })); }))];
  }
  function card(k) {
    const g = ST[k]; if (!g || !g.done) return '';
    const head = 'OWLT ' + NAME[k] + ' No. ' + NO + ' · ' + (g.won ? g.g.length : 'X') + '/' + MAX[k];
    if (k === 'sw') return head + '\n' + g.g.map(w => score(w, g.a).map(r => r === 'hit' ? '🟩' : r === 'near' ? '🟨' : '⬛').join('')).join('\n');
    if (k === 'co') return head + '\n' + g.g.map(id => { if (id === g.a) return '⭐'; const c = clue(id); return c ? ARROWS[Math.round(((360 - c.b) % 360) / 45) % 8] + ' ' + Math.round(c.d) + '°' : '·'; }).join('  ');
    return head + '\n' + g.g.map(x => x[1] === 'h' ? '🟩' : (x[1] === 'w' ? '🟨' : '🟥') + (x[2] > 0 ? '⬆️' : '⬇️')).join(' ');
  }
  function share(k) {
    const host = el('div', { class: 'row2' }), note = el('div', { class: 'note', 'aria-live': 'polite' });
    const copy = text => {
      const ok = () => O.clear(note).append(el('span', { class: 'copied', text: 'Copied. Paste it anywhere.' }));
      const fall = () => { const ta = el('textarea', { class: 'sharebox', rows: String(text.split('\n').length + 1), readonly: true, 'aria-label': 'Your result, to copy' }); ta.value = text; O.clear(note).append(ta); ta.focus(); ta.select(); };
      try { navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text).then(ok, fall) : fall(); } catch (e) { fall(); }
    };
    host.append(el('button', { class: 'push', type: 'button', onclick: () => copy(card(k) + '\n' + HERE + '#' + TAB[k]), text: 'Copy result' }));
    if (['sw', 'co', 'lt'].every(x => ST[x] && ST[x].done))
      host.append(el('button', { class: 'push', type: 'button', onclick: () => copy(['sw', 'co', 'lt'].map(card).join('\n\n') + '\n' + HERE), text: 'Copy all three' }));
    else { const next = ['sw', 'co', 'lt'].find(x => !(ST[x] && ST[x].done)); if (next) host.append(el('a', { class: 'push', href: '#' + TAB[next], text: 'Next: ' + NAME[next] })); }
    return [host, note];
  }
  function done(k, body) {
    const g = ST[k], host = O.clear($('#' + k + 'Done'));
    host.append(el('div', { class: 'done' }, el('span', { class: 'plate', text: g.won ? 'Solved in ' + g.g.length + (g.g.length === 1 ? ' try' : ' tries') : 'Out of tries' }), body, stats(k), share(k)));
    lamps();
  }
  /* finishing one cabinet changes the "next" and "all three" buttons on the others */
  const refreshDone = () => { if (ST.sw && ST.sw.done && W.ans) swDone(); if (ST.co && ST.co.done && CO.ans) coDone(); if (ST.lt && ST.lt.done && LT.item) ltDone(); };

  /* ════════ Starword ════════ */
  const W = { ans: null, note: '', link: null, valid: null, cur: '', busy: false };
  const PRAISE = ['Direct hit!', 'Bullseye', 'Clean orbit', 'Docked', 'Close approach', 'Landed, just'];
  const SAY = { hit: 'in the right place', near: 'in the word, elsewhere', miss: 'not in the word' };
  function score(guess, ans) {
    const res = Array(5).fill('miss'), left = {};
    for (let i = 0; i < 5; i++) if (guess[i] === ans[i]) res[i] = 'hit'; else left[ans[i]] = (left[ans[i]] || 0) + 1;
    for (let i = 0; i < 5; i++) if (res[i] !== 'hit' && left[guess[i]] > 0) { res[i] = 'near'; left[guess[i]]--; }
    return res;
  }
  function swSetup(d, list) {
    const words = (d && Array.isArray(d.words) ? d.words : []).filter(w => Array.isArray(w) && /^[A-Z]{5}$/.test(w[0]));
    if (!words.length) { $('#swMsg').textContent = 'Today’s word could not be loaded. Try again later.'; return; }
    if (typeof list === 'string') { W.valid = new Set(list.split(/\s+/).filter(w => /^[a-z]{5}$/.test(w)).map(w => w.toUpperCase())); words.forEach(w => W.valid.add(w[0])); }
    let pick = ST.sw && words.find(w => w[0] === ST.sw.a);
    if (!pick) { pick = pickPlain(words, 11, NO); ST.sw = { a: pick[0], g: [], done: false, won: false }; save(); }
    W.ans = pick[0]; W.note = pick[1] || ''; W.link = pick[2] || null;
    const board = O.clear($('#swBoard'));
    for (let r = 0; r < 6; r++) board.append(el('div', { class: 'row', role: 'row' }, Array.from({ length: 5 }, () => el('div', { class: 'tile', role: 'gridcell' }))));
    const keys = O.clear($('#swKeys'));
    for (const r of ['QWERTYUIOP', 'ASDFGHJKL', '>ZXCVBNM<']) keys.append(el('div', { class: 'kr' }, [...r].map(ch =>
      ch === '>' ? el('button', { class: 'key wide', type: 'button', 'data-k': 'Enter', text: 'Enter' })
      : ch === '<' ? el('button', { class: 'key wide', type: 'button', 'data-k': 'Backspace', 'aria-label': 'Delete letter', text: '⌫' })
      : el('button', { class: 'key', type: 'button', 'data-k': ch, text: ch }))));
    keys.addEventListener('click', e => { const b = e.target.closest('.key'); if (b) { press(b.dataset.k); b.blur(); } });
    paint(); if (ST.sw.done) swDone(); lamps();
  }
  function row(r, word, res) {
    Array.from($('#swBoard').children[r].children).forEach((t, i) => { const ch = word[i] || '';
      t.textContent = ch; t.className = 'tile' + (res ? ' ' + res[i] : ch ? ' typed' : ''); t.setAttribute('aria-label', ch ? ch + (res ? ', ' + SAY[res[i]] : '') : 'empty'); });
  }
  function paint() {
    const g = ST.sw.g;
    for (let r = 0; r < 6; r++) row(r, r < g.length ? g[r] : r === g.length && !ST.sw.done ? W.cur : '', r < g.length ? score(g[r], W.ans) : null);
    paintKeys();
  }
  function paintKeys() {
    const best = {}, rank = { miss: 1, near: 2, hit: 3 };
    for (const w of ST.sw.g) score(w, W.ans).forEach((r, i) => { if (!best[w[i]] || rank[r] > rank[best[w[i]]]) best[w[i]] = r; });
    O.$$('#swKeys .key').forEach(k => { const s = best[k.dataset.k]; k.className = 'key' + (k.dataset.k.length > 1 ? ' wide' : '') + (s ? ' ' + s : '');
      if (k.dataset.k.length === 1) k.setAttribute('aria-label', k.dataset.k + (s ? ', ' + SAY[s] : '')); });
  }
  let sayT = 0;
  function swSay(text, shake, stay) {
    const host = O.clear($('#swMsg')); host.append(el('span', { class: 'tape' + (stay ? '' : ' red'), text })); clearTimeout(sayT);
    if (!stay) sayT = setTimeout(() => O.clear(host), 1900);
    if (shake && !O.reduced) { shake.classList.remove('shake'); void shake.offsetWidth; shake.classList.add('shake'); }
  }
  function press(k) {
    if (!ST.sw || ST.sw.done || W.busy) return;
    if (k === 'Enter') return enter();
    if (k === 'Backspace') W.cur = W.cur.slice(0, -1);
    else if (/^[A-Z]$/.test(k) && W.cur.length < 5) W.cur += k;
    else return;
    row(ST.sw.g.length, W.cur, null);
  }
  function enter() {
    const w = W.cur, r = ST.sw.g.length, rowEl = $('#swBoard').children[r];
    if (w.length < 5) return swSay('Five letters, please', rowEl);
    if (W.valid && !W.valid.has(w)) return swSay('Not in the word list', rowEl);
    const res = score(w, W.ans), won = w === W.ans, over = won || r + 1 >= 6;
    ST.sw.g.push(w); W.cur = '';
    if (over) { ST.sw.done = true; ST.sw.won = won; record('sw', won, r + 1); }
    save(); lamps();
    $('#swSr').textContent = w + ': ' + res.map((x, i) => w[i] + ' ' + SAY[x]).join(', ') + '.';
    W.busy = true; const STEP = O.reduced ? 0 : 250, tiles = Array.from(rowEl.children);
    tiles.forEach((t, i) => setTimeout(() => { if (STEP) t.classList.add('flip'); setTimeout(() => { t.className = 'tile ' + res[i] + (STEP ? ' flip' : ''); t.setAttribute('aria-label', w[i] + ', ' + SAY[res[i]]); }, STEP ? 200 : 0); }, i * STEP));
    setTimeout(() => {
      W.busy = false; paintKeys();
      if (over) { swSay(won ? PRAISE[r] : 'The word was ' + W.ans, null, true); swDone(); refreshDone(); }
    }, STEP * 5 + (STEP ? 260 : 0));
  }
  function swDone() {
    const link = W.link && /^(ladder|sky|atlas|papers|log|lost|index)\.html#[\w-]+$/.test(W.link) ? W.link : null;
    done('sw', [el('h3', { text: W.ans }), el('p', { text: W.note }),
      link ? el('div', { class: 'row2' }, el('a', { class: 'push', href: link, text: link.startsWith('sky') ? 'Find it in the Observatory' : 'See it on the Ladder' })) : null]);
  }

  /* ════════ Constellation ════════ */
  const CO = { ans: null, guess: [], by: new Map() };
  const ARROWS = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'], COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const WORDY = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };
  const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`.*]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '');
  const unit = (ra, dec) => [Math.cos(dec * D2R) * Math.cos(ra * D2R), Math.cos(dec * D2R) * Math.sin(ra * D2R), Math.sin(dec * D2R)];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sep = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a[0], a[1]), unit(b[0], b[1]))))) / D2R;
  /* the direction to go from a to b on the sky, in degrees from north through east */
  function bearing(a, b) {
    const d1 = a[1] * D2R, d2 = b[1] * D2R, da = (b[0] - a[0]) * D2R;
    return (Math.atan2(Math.sin(da) * Math.cos(d2), Math.cos(d1) * Math.sin(d2) - Math.sin(d1) * Math.cos(d2) * Math.cos(da)) / D2R + 360) % 360;
  }
  /* how far the answer is from a guess (from its nearer half, for Serpens), and which way */
  function clue(id) {
    const g = CO.guess.find(x => x.id === id); if (!g || !CO.ans) return null; let best = null;
    for (const p of g.parts) { const d = sep(p, CO.ans.cen); if (!best || d < best.d) best = { d, b: bearing(p, CO.ans.cen) }; }
    return best;
  }
  function coSetup(G) {
    const cons = G && Array.isArray(G.cons) ? G.cons : [], guess = G && Array.isArray(G.guess) ? G.guess : [];
    if (!cons.length || !guess.length) { $('#coMsg').textContent = 'The star figures could not be loaded. Try again later.'; return; }
    CO.guess = guess;
    const en = {}; for (const g of guess) if (g.en) en[norm(g.en)] = (en[norm(g.en)] || 0) + 1;
    for (const g of guess) for (const n of [g.name, g.id, ...(g.aka || []), ...(g.en && en[norm(g.en)] === 1 ? [g.en] : [])]) CO.by.set(norm(n), g);
    let pick = ST.co && cons.find(c => c.id === ST.co.a);
    if (!pick) { pick = pickCon(cons, NO); ST.co = { a: pick.id, g: [], done: false, won: false }; save(); }
    CO.ans = pick;
    $('#coForm').addEventListener('submit', e => { e.preventDefault(); const first = $('#coSugg button'); coGuess(CO.by.has(norm($('#coIn').value)) || !first ? $('#coIn').value : first.dataset.name); });
    $('#coIn').addEventListener('input', () => suggest($('#coIn').value));
    figure(); clues(); if (ST.co.done) coDone(); lamps();
  }
  function suggest(q) {
    const host = O.clear($('#coSugg')); q = norm(q); if (!q || !ST.co || ST.co.done) return;
    const starts = [], inner = [];
    for (const g of CO.guess) {
      if (ST.co.g.includes(g.id)) continue;
      const names = [g.name, ...(g.aka || []), g.en].filter(Boolean).map(norm);
      if (names.some(n => n.startsWith(q))) starts.push(g); else if (names.some(n => n.includes(' ' + q))) inner.push(g);
    }
    for (const g of starts.concat(inner).slice(0, 6))
      host.append(el('button', { class: 'opt', type: 'button', 'data-name': g.name, onclick: () => coGuess(g.name) }, el('b', { text: g.name }), g.en ? el('span', { text: g.en }) : null));
  }
  let coT = 0;
  function coSay(text, stay) { const host = O.clear($('#coMsg')); host.append(el('span', { class: 'tape' + (stay ? '' : ' red'), text })); clearTimeout(coT); if (!stay) coT = setTimeout(() => O.clear(host), 2200); }
  function coGuess(text) {
    if (!ST.co || ST.co.done || !String(text).trim()) return;
    const g = CO.by.get(norm(text));
    if (!g) return coSay('Not a constellation I know. Try its Latin name.');
    if (ST.co.g.includes(g.id)) return coSay('Already tried ' + g.name);
    ST.co.g.push(g.id); $('#coIn').value = ''; O.clear($('#coSugg'));
    const n = ST.co.g.length, won = g.id === CO.ans.id, over = won || n >= MAX.co;
    if (over) { ST.co.done = true; ST.co.won = won; record('co', won, n); }
    save(); lamps(); clues();
    if (over) { coSay(won ? (n === 1 ? 'First try. Well read!' : 'Found it') : 'It was ' + CO.ans.name, true); figure(); coDone(); refreshDone(); }
  }
  function arrow(b) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '-14 -14 28 28'); svg.setAttribute('aria-hidden', 'true');
    /* drawn as on a star chart: north up, east to the left */
    svg.innerHTML = '<circle r="13" fill="none" stroke="currentColor" stroke-opacity=".25"/><g transform="rotate(' + (-b).toFixed(1) + ')"><path d="M0-10 6 1H2v8h-4V1h-4z" fill="currentColor"/></g>';
    return svg;
  }
  function clues() {
    const host = O.clear($('#coClues'));
    ST.co.g.forEach(id => {
      const g = CO.guess.find(x => x.id === id), won = id === CO.ans.id, c = clue(id); if (!g || !c) return;
      const dir = COMPASS[Math.round(c.b / 45) % 8];
      host.append(el('li', { class: won ? 'win' : null, 'aria-label': g.name + (won ? ': correct' : ': the answer is ' + Math.round(c.d) + ' degrees away, to the ' + WORDY[dir]) },
        el('b', { text: g.name }), el('span', { text: won ? 'Found' : Math.round(c.d) + '°' }), el('span', { class: 'pct', text: Math.round(100 * (1 - c.d / 180)) + '%' }),
        won ? el('span', { class: 'dir', text: '★' }) : el('span', { class: 'dir' }, arrow(c.b), dir)));
    });
    const n = ST.co.g.length, out = [];
    if (!ST.co.done) {
      if (n >= 2) out.push(where(CO.ans.cen));
      if (n >= 4) out.push('Its name begins with “' + CO.ans.name[0] + '”' + (CO.ans.name.includes(' ') ? ' and has two words.' : '.'));
      const left = MAX.co - n;
      out.push(n ? left + (left === 1 ? ' guess left.' : ' guesses left.') + (n < 2 ? ' A clue after two misses.' : n < 4 ? ' Another clue after four.' : '') : 'Six guesses. A clue after two misses, another after four.');
    }
    $('#coHints').textContent = out.join(' ');
    $('#coIn').disabled = ST.co.done; $('#coForm button').disabled = ST.co.done;
  }
  /* where on the sky, and when in the year it is highest at about 9 pm local time: 21h of sidereal time falls on about 22 September */
  function where(cen) {
    const [ra, dec] = cen, side = Math.abs(dec) < 1 ? 'on the celestial equator' : Math.round(Math.abs(dec)) + '° ' + (dec > 0 ? 'north' : 'south') + ' of the celestial equator';
    if (Math.abs(dec) > 70) return 'It sits ' + side + ', near the ' + (dec > 0 ? 'north' : 'south') + ' celestial pole, and circles it all year.';
    const m = ((ra / 15 - 21 + 48) % 24) / 2, t = new Date(Date.UTC(2026, 8, 22) + m * 30.44 * 864e5), d = t.getUTCDate();
    return 'Its centre is ' + side + '; it is highest in the evening sky, at about 9 pm, in ' + (d <= 10 ? 'early ' : d <= 20 ? 'mid-' : 'late ') + MONTHS[t.getUTCMonth()] + '.';
  }
  function figure() {
    const c = CO.ans, [a0, d0] = [c.cen[0] * D2R, c.cen[1] * D2R], C0 = unit(c.cen[0], c.cen[1]);
    const E = [-Math.sin(a0), Math.cos(a0), 0], N = [-Math.sin(d0) * Math.cos(a0), -Math.sin(d0) * Math.sin(a0), Math.cos(d0)];
    /* a stereographic view centred on the figure, which keeps its shape: east to the left, north up, as on the sky */
    const P = c.pts.map(p => { const u = unit(p[0], p[1]), k = 2 / (1 + dot(u, C0)); return [-k * dot(u, E), -k * dot(u, N), p[2]]; });
    const xs = P.map(p => p[0]), ys = P.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const S = 400, pad = 52, s = (S - 2 * pad) / Math.max(x1 - x0, y1 - y0, 0.05), ox = S / 2 - (x0 + x1) / 2 * s, oy = S / 2 - (y0 + y1) / 2 * s;
    const X = p => (ox + p[0] * s).toFixed(1), Y = p => (oy + p[1] * s).toFixed(1);
    const deg = s * D2R, bar = [1, 2, 5, 10, 20, 30, 45].find(v => v * deg >= 40) || 45;           /* a scale bar of a round number of degrees */
    const lines = c.lines.map(l => '<polyline points="' + l.map(i => X(P[i]) + ',' + Y(P[i])).join(' ') + '"/>').join('');
    const dots = P.map(p => '<circle cx="' + X(p) + '" cy="' + Y(p) + '" r="' + (p[2] == null ? 1.8 : Math.max(1.6, Math.min(5.2, 4.4 - 0.62 * p[2]))).toFixed(1) + '"/>').join('');
    const solved = ST.co && ST.co.done;
    $('#coPlot').innerHTML = '<svg viewBox="0 0 400 400" role="img" aria-label="' + (solved ? 'The figure of ' + c.name : 'Today’s star figure') + ', ' + c.pts.length + ' stars">' +
      '<g stroke="currentColor" stroke-opacity=".12" fill="none"><circle cx="200" cy="200" r="186"/><path d="M200 14V40M200 360v26M14 200h26M360 200h26"/></g>' +
      '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-opacity=".62" stroke-linejoin="round" stroke-linecap="round">' + lines + '</g>' +
      '<g fill="#eafff2" style="filter:drop-shadow(0 0 3px rgba(124,255,178,.9))">' + dots + '</g>' +
      '<g fill="currentColor" font-size="13" style="font-family:var(--f-data)"><text x="200" y="30" text-anchor="middle">N</text><text x="22" y="204" text-anchor="middle">E</text>' +
      '<path d="M24 372h' + (bar * deg).toFixed(1) + '" stroke="currentColor" stroke-width="2"/><text x="24" y="362" font-size="11">' + bar + '°</text>' +
      (solved ? '<text x="376" y="378" text-anchor="end" font-size="15" letter-spacing="2">' + c.name.toUpperCase().replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text>' : '') + '</g></svg>';
  }
  function coDone() {
    const c = CO.ans;
    done('co', [el('h3', { text: c.name + (c.en ? ', the ' + c.en : '') }),
      el('p', { text: where(c.cen).replace(/^Its centre is/, 'Its centre lies') }),
      el('div', { class: 'row2' }, el('a', { class: 'push', href: 'sky.html#con-' + c.id, text: 'Find it in the Observatory' }))]);
  }

  /* ════════ Light Time ════════ */
  const LT = { item: null, sec: null, v: 9 }, LO = -0.5, HI = 18;
  const MARKS = [[0, '1 s'], [Math.log10(60), '1 min'], [Math.log10(3600), '1 h'], [Math.log10(86400), '1 day'], [Math.log10(YEAR), '1 yr'], [Math.log10(1e3 * YEAR), '1,000 yr'],
    [Math.log10(1e6 * YEAR), '1 Myr'], [Math.log10(1e9 * YEAR), '1 Gyr']];
  const at = v => ((v - LO) / (HI - LO) * 100).toFixed(3) + '%';
  const the = n => /^the /.test(n) ? n : /(Nebula|Cluster|Galaxy|Cloud)$|^(Pleiades|Hyades)$/.test(n) ? 'the ' + n : /background$/.test(n) ? 'the ' + n.toLowerCase() : n;
  function liveSec(slug) {
    const jd = A.jdOf(new Date());
    try { return slug === 'moon' ? A.moon(jd).distKm / C : slug === 'sun' ? A.sun(jd).dist * A.AU_KM / C : slug === 'voyager-1' ? A.probe('voyager-1', jd).lightSec : A.planet(slug, jd).lightMin * 60; }
    catch (e) { return null; }
  }
  function ltSetup(G) {
    const list = (G && Array.isArray(G.light) ? G.light : []).filter(x => x && x.slug && (x.live || x.sec > 0));
    if (!list.length) { $('#ltTarget').textContent = 'Today’s object could not be loaded. Try again later.'; return; }
    let item = ST.lt && list.find(x => x.slug === ST.lt.a);
    if (!item) { item = pickPlain(list, 31, NO); ST.lt = { a: item.slug, g: [], done: false, won: false }; save(); }
    LT.item = item; LT.sec = ST.lt.sec || (item.live ? liveSec(item.slug) : item.sec);
    if (!(LT.sec > 0)) { $('#ltTarget').textContent = 'Today’s object could not be worked out. Try again later.'; return; }
    $('#ltTarget').textContent = item.name.charAt(0).toUpperCase() + item.name.slice(1);
    $('#ltAsk').textContent = item.slug === 'voyager-1' ? 'How long does a radio signal from it take to reach Earth right now?'
      : item.live ? 'How long does its light take to reach you right now?' : 'How long has the light you see from it been travelling?';
    const sc = O.clear($('#ltScale'));
    for (let d = Math.ceil(LO); d <= HI; d++) sc.append(el('i', { class: 'tk', style: { left: at(d) } }));
    MARKS.forEach(([v, t], i) => sc.append(el('i', { class: 'tk big' + (i % 2 ? ' lo' : ''), style: { left: at(v) } }, el('span', { text: t }))));
    sc.append(el('i', { class: 'needle', id: 'ltNeedle' }));
    const dial = $('#ltDial'), range = $('#ltIn'); let drag = false;
    const fromX = x => { const r = sc.getBoundingClientRect(); return LO + Math.max(0, Math.min(1, (x - r.left) / r.width)) * (HI - LO); };
    dial.addEventListener('pointerdown', e => { if (ST.lt.done || e.button > 0) return; drag = true; try { dial.setPointerCapture(e.pointerId); } catch (x) {} setV(fromX(e.clientX)); range.focus({ preventScroll: true }); });
    dial.addEventListener('pointermove', e => { if (drag) setV(fromX(e.clientX)); });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) dial.addEventListener(t, () => { drag = false; });
    range.addEventListener('input', () => setV(+range.value));
    range.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lock(); } });
    range.addEventListener('focus', () => dial.classList.add('focus')); range.addEventListener('blur', () => dial.classList.remove('focus'));
    $('#ltDown').addEventListener('click', () => setV(LT.v - 0.1)); $('#ltUp').addEventListener('click', () => setV(LT.v + 0.1)); $('#ltGo').addEventListener('click', lock);
    const last = ST.lt.g[ST.lt.g.length - 1]; setV(last ? last[0] : 9); tries(); if (ST.lt.done) ltDone(); lamps();
  }
  function setV(v) {
    LT.v = Math.round(Math.max(LO, Math.min(HI, v)) * 100) / 100; const r = $('#ltIn'), t = A.lightTime(Math.pow(10, LT.v));
    r.value = LT.v; r.setAttribute('aria-valuetext', t); $('#ltNeedle').style.left = at(LT.v); $('#ltVal').textContent = t;
  }
  function lock() {
    if (!ST.lt || ST.lt.done || !(LT.sec > 0)) return;
    const d = LT.v - Math.log10(LT.sec), res = Math.abs(d) <= Math.log10(2) ? 'h' : Math.abs(d) <= 1 ? 'w' : 'c';
    ST.lt.g.push([LT.v, res, res === 'h' ? 0 : d < 0 ? 1 : -1]);                    /* 1: the real time is longer than the guess */
    const n = ST.lt.g.length, won = res === 'h', over = won || n >= MAX.lt;
    if (over) { ST.lt.done = true; ST.lt.won = won; ST.lt.sec = LT.sec; record('lt', won, n); }
    save(); lamps(); tries();
    if (over) { ltDone(); refreshDone(); }
  }
  function tries() {
    const host = O.clear($('#ltTries')), sc = $('#ltScale');
    O.$$('.mark', sc).forEach(m => m.remove());
    ST.lt.g.forEach(([v, res, dir], i) => {
      const what = res === 'h' ? 'On the mark: within a factor of two' : (dir > 0 ? 'Longer' : 'Shorter') + (res === 'w' ? ', but within ten times' : ', by more than ten times');
      sc.append(el('i', { class: 'mark ' + { h: 'hit', w: 'near', c: 'miss' }[res], style: { left: at(v) }, title: '#' + (i + 1) + ' · ' + A.lightTime(Math.pow(10, v)) }));
      host.append(el('li', null, el('span', { text: '#' + (i + 1) + ' · ' + A.lightTime(Math.pow(10, v)) }), el('span', { class: { h: 'h', w: 'n', c: 'm' }[res], text: (res === 'h' ? '✓ ' : dir > 0 ? '▲ ' : '▼ ') + what })));
    });
    if (ST.lt.done) sc.append(el('i', { class: 'mark true', style: { left: at(Math.log10(ST.lt.sec || LT.sec)) }, title: 'The answer' }));
    const left = MAX.lt - ST.lt.g.length;
    if (!ST.lt.done) host.append(el('li', { class: 'left' }, el('span', { text: left + (left === 1 ? ' try left' : ' tries left') + (ST.lt.g.length ? '' : '. Green within a factor of two, amber within ten times.') })));
    for (const id of ['#ltDown', '#ltUp', '#ltGo', '#ltIn']) $(id).disabled = ST.lt.done;
  }
  function ltDone() {
    const it = LT.item, sec = ST.lt.sec || LT.sec, years = sec / YEAR, nm = the(it.name), p = [];
    if (it.slug === 'voyager-1') p.push('A radio signal from Voyager 1 takes ' + A.lightTime(sec) + ' to reach Earth right now, and the gap grows by about 17 kilometres every second.');
    else if (it.live) p.push('Light from ' + nm + ' takes ' + A.lightTime(sec) + ' to reach you right now. ' + (it.slug === 'moon' || it.slug === 'sun' ? 'It changes a little through the year as the orbit swings in and out.' : 'It changes through the year as Earth and ' + nm + ' move around the Sun.'));
    else p.push('The light you see from ' + nm + ' has been travelling for ' + A.lightTime(sec) + '.');
    if (it.lookback) p.push('That is the lookback time. Space has stretched while the light was on its way, so where it came from is now much farther away than that many light-years.');
    if (it.approx) p.push('Its distance is uncertain, so take this as approximate.');
    const left = el('p');
    done('lt', [el('h3', { text: it.name.charAt(0).toUpperCase() + it.name.slice(1) + ' · ' + A.lightTime(sec) }), el('p', { text: p.join(' ') }), left,
      el('div', { class: 'row2' }, el('a', { class: 'push', href: 'ladder.html#' + encodeURIComponent(it.slug), text: 'See it on the Ladder' }))]);
    if (!it.live && years >= 1 && !it.lookback) O.lightLeft(years).then(r => { if (document.contains(left)) left.textContent = 'It set out ' + r.when + (r.context ? ', ' + r.link + ' ' + r.context : '') + '.'; });
  }

  /* ── keys: letters go to Starword when it is showing ── */
  addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || O.palette.isOpen || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(e.target.tagName) && e.key === 'Enter' || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if ((shown() || {}).game !== 'starword') return;
    const k = e.key === 'Enter' || e.key === 'Backspace' ? e.key : /^[a-z]$/i.test(e.key) ? e.key.toUpperCase() : null;
    if (k) { e.preventDefault(); press(k); }
  });
  $('#cabs').addEventListener('click', e => { const b = e.target.closest('[data-game]'); if (b) open(b.dataset.game, true); });
  addEventListener('hashchange', () => { const h = location.hash.slice(1); if (KEY[h]) open(h, true); });

  /* the first unsolved cabinet, unless the address names one */
  const first = () => { const h = location.hash.slice(1); if (KEY[h]) return h; const k = ['sw', 'co', 'lt'].find(x => !(ST[x] && ST[x].done)); return k ? TAB[k] : 'starword'; };
  open(first());
  lamps();
  Promise.all([O.load('data/starword.json'), O.load('data/words5.txt', 'text'), O.load('data/games.json')]).then(([sw, words, G]) => {
    swSetup(sw, words); coSetup(G); ltSetup(G);
    open(first());
  });
  O.footer(document.body, ['Guesses are checked against the SCOWL word list. Star figures: d3-celestial. Light times: the Ladder’s catalogue, and the Solar System worked out for the moment you play.']);
})();

/* OWLT · today.js — the front page: the light arriving now, then the day in cards.
   Every card works without its data file: it says what is missing instead of breaking. */
(function () {
  'use strict';
  const O = window.OWLT, A = window.ASTRO, $ = O.$, el = O.el;
  O.nav();
  const C = 299792.458, AUKM = A.AU_KM, YR = 31557600, jdNow = () => A.jdOf(new Date());
  const grid = $('#grid');

  /* ── the date line ── */
  function dateLine() {
    const d = new Date(), doy = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 0)) / 864e5);
    O.clear($('#date')).append(O.fmt.longDay(d), el('b', { text: 'Day ' + doy + ' · ' + O.fmt.utc(d) + ' · JD ' + jdNow().toFixed(4) }));
  }

  /* ── the strip: how long ago each thing sent the light arriving now ── */
  const LB = Math.log10(4.4e17);
  const MARKS = [
    ['moon', 'The Moon', () => A.moon(jdNow()).distKm / C, 1],
    ['sun', 'The Sun', () => A.sun(jdNow()).dist * AUKM / C, 1],
    ['venus', 'Venus', () => A.planet('venus', jdNow()).lightMin * 60, 1],
    ['mars', 'Mars', () => A.planet('mars', jdNow()).lightMin * 60, 1],
    ['jupiter', 'Jupiter', () => A.planet('jupiter', jdNow()).lightMin * 60, 1],
    ['saturn', 'Saturn', () => A.planet('saturn', jdNow()).lightMin * 60, 1],
    ['neptune', 'Neptune', () => A.planet('neptune', jdNow()).lightMin * 60, 1],
    ['voyager-1', 'Voyager 1', () => A.probe('voyager-1', jdNow()).lightSec, 1],
    ['proxima-centauri', 'Proxima Centauri', () => 4.2465 * YR],
    ['sirius', 'Sirius', () => 8.60 * YR],
    ['pleiades', 'The Pleiades', () => 444 * YR],
    ['orion-nebula', 'Orion Nebula', () => 1344 * YR],
    ['milky-way', 'Centre of the galaxy', () => 26670 * YR],
    ['lmc', 'Large Magellanic Cloud', () => 163000 * YR],
    ['andromeda-galaxy', 'Andromeda', () => 2.5e6 * YR],
    ['virgo-cluster', 'Virgo Cluster', () => 53.8e6 * YR],
    ['3c-273', '3C 273', () => A.cosmo.lookbackGyr(0.158) * 1e9 * YR],
    ['gn-z11', 'GN-z11', () => A.cosmo.lookbackGyr(10.603) * 1e9 * YR],
    ['cmb', 'The oldest light', () => A.cosmo.lookbackGyr(1089.9) * 1e9 * YR]
  ];
  const TICKS = [[1, '1 second'], [60, '1 minute'], [3600, '1 hour'], [86400, '1 day'], [YR, '1 year'], [100 * YR, 'a century'], [1e4 * YR, '10,000 years'], [1e6 * YR, 'a million years'], [1e9 * YR, 'a billion years']];
  const xOf = s => 3.5 + 88.5 * Math.log10(Math.max(1, s)) / LB;
  function ago(s) {
    if (s < 60) return s.toFixed(2) + ' s';
    if (s < 3600) return Math.floor(s / 60) + ' min ' + String(Math.floor(s % 60)).padStart(2, '0') + ' s';
    if (s < 3 * 86400) return Math.floor(s / 3600) + ' h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ' min ' + String(Math.floor(s % 60)).padStart(2, '0') + ' s';
    const y = s / YR; return y < 1e3 ? O.fmt.sig(y, 3) + ' years' : y < 1e6 ? O.fmt.sig(y / 1e3, 3) + ' thousand years' : y < 1e9 ? O.fmt.sig(y / 1e6, 3) + ' million years' : O.fmt.sig(y / 1e9, 4) + ' billion years';
  }
  const live = [];
  function strip() {
    const host = $('#strip'); for (const n of O.$$('.m, .tick', host)) n.remove(); live.length = 0;
    for (const [s, label] of TICKS) host.append(el('div', { class: 'tick', style: { left: xOf(s) + '%' } }, el('span', { text: label })));
    const W = host.clientWidth, lanes = [], items = MARKS.map(m => ({ m, s: m[2]() })).sort((a, b) => a.s - b.s);
    for (const it of items) {
      const x = xOf(it.s) / 100 * W, w = Math.max(it.m[1].length * 7.6, ago(it.s).length * 6.9) + 16, left = x - w / 2;
      let lane = 0; while (lanes[lane] != null && lanes[lane] > left) lane++; lanes[lane] = x + w / 2;
      const up = lane % 2 === 0, lvl = Math.floor(lane / 2), off = 9 + lvl * 40;
      const a = el('a', { class: 'm ' + (up ? 'up' : 'dn') + (it.m[3] ? ' live' : ''), href: 'ladder.html#' + it.m[0], style: { left: xOf(it.s) + '%', [up ? 'bottom' : 'top']: 'calc(50% + ' + off + 'px)' } },
        el('span', { class: 'dot' }), el('span', { class: 'n', text: it.m[1] }), el('span', { class: 'v', text: ago(it.s) }));
      a.style.setProperty('--h', off + 'px'); host.append(a);                      /* the stem reaches back to the axis from whichever lane it landed in */
      if (it.m[3]) live.push([a.querySelector('.v'), it.m[2]]);
    }
  }

  /* ── a dated event worth a countdown: Voyager 1 reaches one light-day ── */
  function event() {
    const host = $('#event'), T = A.dateOf(A.V1_ANCHOR_JD), ms = T - Date.now();
    if (ms < -30 * 864e5) { host.hidden = true; return; }
    host.hidden = false; O.clear(host);
    const lt = A.probe('voyager-1', jdNow()).lightSec;
    if (ms > 0) host.append(el('div', { class: 'k', text: 'Voyager 1 · one light-day from Earth' }), el('div', { class: 'clock', id: 'evClock', text: O.fmt.countdown(ms) }),
      el('p', null, 'At 10:16:07 UTC on 18 November 2026, by NASA’s reckoning, Voyager 1 becomes the first thing people have made to sit one light-day from Earth: about 25.9 billion km. A command sent then takes a full day to arrive and the reply another day. Its signal is taking ', el('b', { id: 'evLt', text: ago(lt) }), ' right now. ', el('a', { href: 'ladder.html#voyager-1', text: 'See where it is' }), '.'));
    else host.append(el('div', { class: 'k', text: 'Voyager 1 · past one light-day' }), el('div', { class: 'clock', id: 'evLt', text: ago(lt) }),
      el('p', null, 'Since 18 November 2026 Voyager 1 has been about a light-day from Earth, the first thing people have made to get that far. Earth’s own orbit carries us toward it and away from it through the year, so the light-time swings by about a quarter of an hour either side of its steady climb. ', el('a', { href: 'ladder.html#voyager-1', text: 'See where it is' }), '.'));
  }

  /* ── cards ── */
  const card = (cls, eyebrow, link) => { const c = el('section', { class: 'card ' + (cls || '') }, el('div', { class: 'eyebrow' }, el('span', { text: eyebrow }), link ? el('a', { href: link[0], text: link[1] }) : null)); grid.append(c); return c; };
  const empty = (c, text) => c.append(el('p', { class: 'empty', text }));
  const fmtDay = s => O.fmt.shortDay(new Date(s + 'T12:00:00Z'));

  function paperCard(d, c) {
    const box = card('w8', 'Today’s paper', ['papers.html', 'Reading Room →']);
    const ps = (d && d.papers) || [], latest = ps.length ? ps.reduce((m, p) => p.date > m ? p.date : m, '') : null, fresh = ps.filter(p => p.date === latest);
    const p = O.pick(fresh.length ? fresh : ps, 1);
    if (!p) { empty(box, 'No digests yet. The Reading Room’s canon is always there.'); return; }
    box.append(el('h2', null, el('a', { href: 'papers.html#' + p.id, text: p.t })), el('p', { text: p.one }));
    const can = O.pick((c && c.papers) || [], 3);
    if (can) box.append(el('p', { style: { color: 'var(--mute)', fontSize: '14.5px' } }, 'From the canon: ', el('a', { href: 'papers.html#canon-' + can.id, text: can.by.split(/,| and /)[0].replace(/\(.*\)/, '').trim() + ' ' + can.yr }), ', ' + can.one.charAt(0).toLowerCase() + can.one.slice(1)));
    const more = ps.filter(x => x !== p).slice(0, 3);
    if (more.length) box.append(el('div', { style: { marginTop: '14px', fontFamily: 'var(--f-display)', fontSize: '11px', letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--faint)' }, text: 'Also new' }),
      el('ul', { class: 'heads' }, more.map(x => el('li', null, el('a', { href: 'papers.html#' + x.id, text: x.t }), el('span', { class: 's', text: fmtDay(x.date) + ' · ' + (x.cat || '') + (O.log.has('paper:' + x.id) ? ' · read' : '') })))));
    box.append(el('div', { class: 'meta', text: fmtDay(p.date) + ' · ' + (p.cat || '') + ' · ' + (/submitted/i.test(p.status) || !/published|accepted/i.test(p.status) ? 'not yet peer reviewed' : 'peer reviewed') + (O.log.has('paper:' + p.id) ? ' · read' : '') }));
  }

  function moonCanvas(ph) {
    const s = 64, cv = el('canvas', { width: s * 2, height: s * 2, style: { width: s + 'px', height: s + 'px' }, 'aria-hidden': 'true' }), x = cv.getContext('2d'), img = x.createImageData(s * 2, s * 2);
    const a = ph.angle * Math.PI / 180, L = [Math.sin(a), 0, -Math.cos(a)], r = s - 2;
    for (let j = 0; j < s * 2; j++) for (let i = 0; i < s * 2; i++) {
      const px = (i - s + 0.5) / r, py = (j - s + 0.5) / r, rr = px * px + py * py; if (rr > 1) continue;
      const pz = Math.sqrt(1 - rr), d = px * L[0] + pz * L[2], lit = Math.max(0, Math.min(1, d * 6 + 0.5)), mott = 0.86 + 0.14 * Math.sin(px * 9.1 + py * 5.3) * Math.cos(py * 7.7 - px * 3.1);
      const v = (lit * 0.95 * mott + 0.035) * (0.75 + 0.25 * pz), o = (j * s * 2 + i) * 4;
      img.data[o] = 255 * v; img.data[o + 1] = 235 * v; img.data[o + 2] = 196 * v; img.data[o + 3] = 255 * Math.min(1, (1 - rr) * 40);
    }
    x.putImageData(img, 0, 0); return cv;
  }
  function tonightCard() {
    const box = card('', 'The sky tonight', ['sky.html', 'Observatory →']), jd = jdNow(), ph = A.moonPhase(jd);
    const nexts = [[0, 'New Moon'], [90, 'First quarter'], [180, 'Full Moon'], [270, 'Last quarter']].map(([t, n]) => [A.nextPhase(jd, t), n]).filter(x => x[0]).sort((a, b) => a[0] - b[0]);
    box.append(el('div', { class: 'moonrow' }, moonCanvas(ph), el('div', null, el('div', { style: { fontFamily: 'var(--f-display)', fontWeight: 600, color: 'var(--starlight)', fontSize: '17px' }, text: ph.name }),
      el('div', { style: { fontFamily: 'var(--f-data)', fontSize: '12px', color: 'var(--mute)' }, text: Math.round(ph.illum * 100) + '% lit · ' + A.moonAge(jd).toFixed(1) + ' days since new' }),
      nexts[0] ? el('div', { style: { fontFamily: 'var(--f-data)', fontSize: '12px', color: 'var(--faint)' }, text: nexts[0][1] + ' ' + O.fmt.shortDay(A.dateOf(nexts[0][0])) }) : null)));
    const sun = A.sun(jd), ul = el('ul', { class: 'planets' });
    for (const p of ['mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
      const g = A.planet(p, jd), east = ((g.ra - sun.ra + 540) % 360) - 180 > 0, near = g.elong < (p === 'mercury' ? 12 : 16);
      const when = near ? 'too close to the Sun' : g.elong >= 140 ? 'all night' : g.elong >= 90 ? (east ? 'evening, past midnight' : 'late night to dawn') : (east ? 'evening sky' : 'morning sky');
      ul.append(el('li', null, el('span', { text: p[0].toUpperCase() + p.slice(1) }), el('span', { text: when + (near ? '' : ' · mag ' + g.mag.toFixed(1)) })));
    }
    box.append(ul, el('div', { class: 'meta', text: 'Evening or morning from anywhere on Earth. Times for your sky are on the Observatory.' }));
  }

  function launchCard(L) {
    const box = card('', 'Next launch', ['dispatch.html#launches', 'All launches →']);
    const up = ((L && L.upcoming) || []).filter(l => new Date(l.net) > Date.now() - 3600e3).sort((a, b) => a.net.localeCompare(b.net));
    if (!up.length) { empty(box, L ? 'No upcoming launches in the last fetch.' : 'The launch schedule has not been fetched yet. It arrives with the site’s first daily refresh.'); return; }
    const l = up[0];
    box.append(el('h2', { text: l.mission || l.name }), el('div', { class: 'big', id: 'lnClock', style: { marginTop: '6px', fontSize: '24px' }, text: O.fmt.countdown(new Date(l.net) - Date.now()) }),
      el('p', null, [l.rocket, l.provider].filter(Boolean).join(' · ') + (l.loc ? ' · ' + l.loc : '') + (l.status ? ' · ' + l.statusName : '')));
    box.dataset.net = l.net;
    if (up[1]) box.append(el('p', { style: { fontSize: '13.5px', color: 'var(--mute)' } }, 'Then: ' + up.slice(1, 3).map(x => (x.mission || x.name) + ' (' + O.fmt.shortDay(new Date(x.net)) + ')').join(', ')));
    box.append(el('div', { class: 'meta' }, O.stamp(L.source || 'Launch Library 2', L.fetched, 30)));
  }

  function weatherCard(W) {
    const box = card('', 'Space weather now', ['deck.html', 'Flight Deck →']);
    if (!W || !(W.kp || W.wind || W.xray)) { empty(box, 'Space weather has not been fetched yet. It arrives with the site’s first daily refresh.'); return; }
    const g = W.scales && W.scales.G ? W.scales.G.scale : null, kp = W.kp ? W.kp.now : null;
    box.append(el('div', { class: 'sw' },
      el('div', { class: kp >= 5 ? 'hot' : '' }, el('b', { text: kp != null ? kp.toFixed(1) : '—' }), el('span', { text: 'Kp index' + (g ? ' · G' + g + ' storm' : '') })),
      el('div', null, el('b', { text: W.wind ? Math.round(W.wind.speed) : '—' }), el('span', { text: 'solar wind, km/s' })),
      el('div', { class: W.xray && /^[MX]/.test(W.xray.cls) ? 'hot' : '' }, el('b', { text: W.xray ? W.xray.cls : '—' }), el('span', { text: 'X-ray flux class' }))));
    const say = kp == null ? '' : kp >= 7 ? 'A strong geomagnetic storm: aurora may reach far from the poles tonight.' : kp >= 5 ? 'A geomagnetic storm: aurora possible at higher mid-latitudes.' : kp >= 4 ? 'Unsettled: aurora likely near the auroral zones.' : 'Quiet: aurora mostly confined to the polar regions.';
    if (say) box.append(el('p', { text: say }));
    box.append(el('div', { class: 'meta' }, O.stamp('NOAA SWPC', W.fetched, 8)));
  }

  function newsCard(N) {
    const box = card('w8', 'From the Dispatch', ['dispatch.html', 'All stories →']);
    const items = ((N && N.items) || []).slice(0, 6);
    if (!items.length) { empty(box, 'The news desk has not been fetched yet. Stories from NASA, ESA, ESO and the space press arrive with the site’s first daily refresh.'); return; }
    box.append(el('ul', { class: 'heads' }, items.map(a => el('li', null, O.ext(a.url, a.t), el('span', { class: 's', text: a.site + ' · ' + O.fmt.ago(new Date(a.date)) })))));
    box.append(el('div', { class: 'meta' }, O.stamp(N.source || 'news feeds', N.fetched, 30)));
  }

  function apodCard(P) {
    const box = card('w6 apod', 'Astronomy Picture of the Day', ['https://apod.nasa.gov/apod/', 'apod.nasa.gov →']);
    const d = P && P.days && P.days[0];
    if (!d) { empty(box, 'Today’s picture has not been fetched yet.'); return; }
    box.append(el('h2', null, O.ext(d.page, d.title)));
    /* the image itself only when NASA lists no copyright holder; otherwise a link, so nobody's photograph is copied here */
    if (!d.credit && d.media === 'image' && O.safeUrl(d.url) && O.canLive) box.append(el('img', { src: d.url, alt: d.title, loading: 'lazy' }));
    else box.append(el('p', { class: 'empty', text: d.credit ? 'Image © ' + d.credit + '. See it on the APOD page.' : d.media === 'video' ? 'Today’s entry is a video. Watch it on the APOD page.' : 'See it on the APOD page.' }));
    box.append(el('p', { text: d.text.length > 320 ? d.text.slice(0, d.text.lastIndexOf(' ', 320)) + '…' : d.text }), el('div', { class: 'meta', text: fmtDay(d.date) }));
  }

  function placeCard(S) {
    const box = card('w6', 'A place for today', ['ladder.html', 'The Ladder →']);
    const items = ((S && S.items) || []).filter(x => x.note && x.ly != null && x.ly > 0 && !x.home);
    const p = O.pick(items, 7); if (!p) { empty(box, 'The catalogue did not load.'); return; }
    box.append(el('h2', null, el('a', { href: 'ladder.html#' + p.id, text: p.n })), el('p', { text: p.note }));
    const left = el('p', { style: { color: 'var(--mute)' } }); box.append(left);
    O.lightLeft(p.ly).then(r => left.append('The light from it arriving now left ' + r.when + (r.context ? ', when ' + r.context : '') + '.'));
    box.append(el('div', { class: 'meta', text: O.fmt.ly(p.ly) + ' away' }));
  }

  function lostCard(Lo) {
    const box = card('w6', 'From The Lost', ['lost.html', 'The Lost →']);
    const ms = (Lo && Lo.missions) || []; if (!ms.length) { empty(box, 'The archive did not load.'); return; }
    const md = new Date().toISOString().slice(5, 10), today = ms.filter(m => String(m.when).slice(5, 10) === md), m = today[0] || O.pick(ms, 11);
    box.append(el('h2', null, el('a', { href: 'lost.html#' + m.id, text: m.n })), el('p', { style: { fontFamily: 'var(--f-display)', fontSize: '13px', color: 'var(--mute)' }, text: (today.length ? 'On this day · ' : '') + m.who + ' · ' + String(m.when).slice(0, 4) }),
      el('p', { text: m.what.split(/(?<=\.)\s/)[0] }));
  }

  function logCard(G) {
    const box = card('w6', 'Ship log', ['log.html', 'Your log →']), L = O.log.all(), n = Object.keys(L).length, total = G && G.nodes ? Object.keys(G.nodes).length : 0;
    box.append(el('div', { class: 'big', text: n + (total ? ' of ' + total : '') }), el('p', { style: { marginTop: '2px', color: 'var(--mute)' }, text: 'places, papers and stories you have found' }));
    if (total) box.append(el('div', { class: 'log-bar' }, el('i', { style: { width: Math.min(100, n / total * 100) + '%' } })));
    /* a rumour, in the manner of a ship's log: something you have not seen, next to something you have */
    if (G && G.adj) {
      const seen = Object.keys(L).filter(k => G.nodes[k]), pool = [];
      for (const k of seen) for (const nb of G.adj[k] || []) if (!L[nb] && G.nodes[nb]) pool.push([k, nb]);
      const r = O.pick(pool, 2) || (() => { const ks = Object.keys(G.nodes).filter(k => !L[k] && !k.startsWith('page:')); const k = O.pick(ks, 2); return k ? [null, k] : null; })();
      if (r) box.append(el('p', null, r[0] ? 'Rumour: ' + G.nodes[r[0]][0] + ' leads to ' : 'Unexplored: ', el('a', { href: G.nodes[r[1]][2], text: G.nodes[r[1]][0] }), '.'));
    }
  }

  /* ── sources and licences ── */
  const SOURCES = [
    ['Stars', 'HYG database v4.1 (Hipparcos, Yale Bright Star and Gliese catalogues, with Gaia distances where available), by David Nash', 'CC BY-SA 4.0'],
    ['Galaxies, nebulae, clusters', 'OpenNGC, by Mattia Verga; Messier data from d3-celestial', 'CC BY-SA 4.0 · BSD-3'],
    ['Exoplanets', 'Open Exoplanet Catalogue, by Hanno Rein and contributors', 'MIT'],
    ['Constellation figures', 'd3-celestial, by Olaf Frohn', 'BSD-3'],
    ['Coastlines and cities', 'Natural Earth', 'public domain'],
    ['Planet positions', 'JPL approximate Keplerian elements (Standish); Moon and Sun from Meeus, Astronomical Algorithms', 'published methods'],
    ['Spiral arms', 'Reid et al. 2019, ApJ 885, 131 (log-spiral fits to maser parallaxes)', 'published values'],
    ['Cosmology', 'Planck 2018 results VI: H0 = 67.4 km/s/Mpc, Ωm = 0.315 (flat ΛCDM)', 'published values'],
    ['Habitable zones', 'Kopparapu et al. 2014, ApJL 787, L29', 'published values'],
    ['Voyager 1 light-day', 'NASA/JPL: one light-day from Earth at 10:16:07 UTC, 18 November 2026', 'NASA'],
    ['Papers', 'arXiv metadata and abstracts via the arXiv API; digests are OWLT’s own plain-language summaries linking to each paper', 'arXiv metadata CC0'],
    ['News', 'Spaceflight News API (The Space Devs), and feeds from ESA, ESO, NASA, NOIRLab, Universe Today and Sky & Telescope; headlines link to the original', 'links only'],
    ['Launches', 'Launch Library 2, The Space Devs', 'free tier, attribution'],
    ['Space weather', 'NOAA Space Weather Prediction Center', 'US government work'],
    ['Satellite orbits', 'CelesTrak general perturbations elements, propagated with satellite.js (SGP4)', 'public · MIT'],
    ['Close approaches', 'NASA/JPL Center for Near-Earth Object Studies, SBDB close-approach API', 'US government work'],
    ['Picture of the day', 'NASA Astronomy Picture of the Day; images shown only when NASA lists no copyright holder', 'per image'],
    ['Deep Space Network', 'NASA DSN Now', 'US government work'],
    ['3-D engine', 'three.js r149', 'MIT'],
    ['Type', 'Archivo (Omnibus-Type), STIX Two Text (STI Pub), IBM Plex Mono (IBM)', 'SIL Open Font License']
  ];
  function sources() { $('#srcs').append(...SOURCES.map(s => el('div', { class: 's' }, el('dt', { text: s[0] }), el('dd', null, s[1] + ' ', el('small', { text: s[2] }))))); }

  /* ── go ── */
  dateLine(); strip(); event(); sources();
  addEventListener('resize', (() => { let t; return () => { clearTimeout(t); t = setTimeout(strip, 150); }; })());
  Promise.all([O.load('data/papers/digests.json'), O.load('data/papers/canon.json'), O.load('data/launches.json'), O.load('data/spaceweather.json'), O.load('data/news.json'),
    O.load('data/apod.json'), O.load('data/catalog/structures.json'), O.load('data/lost.json'), O.graph()]).then(([dg, cn, ln, sw, nw, ap, st, lo, gr]) => {
    paperCard(dg, cn); tonightCard(); launchCard(ln); weatherCard(sw); newsCard(nw); apodCard(ap); placeCard(st); lostCard(lo); logCard(gr);
    if (location.hash === '#sources') $('#sources').scrollIntoView();
  });
  setInterval(() => {
    dateLine();
    for (const [v, f] of live) v.textContent = ago(f());
    const ev = $('#evClock'), lt = $('#evLt'); if (ev) { const ms = A.dateOf(A.V1_ANCHOR_JD) - Date.now(); if (ms <= 0) event(); else ev.textContent = O.fmt.countdown(ms); }
    if (lt) lt.textContent = ago(A.probe('voyager-1', jdNow()).lightSec);
    const lc = $('#lnClock'); if (lc) { const ms = new Date(lc.closest('.card').dataset.net) - Date.now(); lc.textContent = ms > 0 ? O.fmt.countdown(ms) : 'Launch time reached'; }
  }, 1000);
  O.footer(document.body);
})();

/* OWLT · core.js — the shell every page shares: navigation, search, data loading, the ship log.
   Rule for anything that arrives from outside the repo (news, abstracts, feeds, shared rows):
   it goes into the page as text nodes through el(), never through innerHTML. */
(function () {
  'use strict';
  const O = window.OWLT = {};
  O.PAGES = [['index.html', 'Today', 'The day’s light, reading and sky'], ['ladder.html', 'The Ladder', 'Zoom from the ground to the edge of the observable universe'],
    ['papers.html', 'Reading Room', 'Research papers, broken down'], ['dispatch.html', 'Dispatch', 'Space news and launches'],
    ['deck.html', 'Flight Deck', 'Live quantities on an analogue console'], ['sky.html', 'Observatory', 'What is above you tonight'],
    ['atlas.html', 'Atlas', 'Every catalogued object, searchable'], ['lost.html', 'The Lost', 'Missions that failed, ended early or never flew'],
    ['log.html', 'Ship Log', 'What you have found, and what it leads to']];
  O.reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  O.page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (!/\.html$/.test(O.page) || !O.PAGES.some(p => p[0] === O.page)) O.page = 'index.html';
  /* Inside a Claude artifact the frame blocks every outside request, so live calls are only tried on an ordinary web origin. */
  O.inArtifact = !!(window.claude && typeof window.claude.use === 'function');
  let framed = false; try { framed = window.top !== window.self; } catch (e) { framed = true; }
  O.canLive = /^https?:$/.test(location.protocol) && !O.inArtifact && !framed;
  O.$ = (s, r) => (r || document).querySelector(s);
  O.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  O.el = function (tag, attrs) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'data') for (const d in v) n.dataset[d] = v[d];
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(x => x != null && x !== false && n.append(x.nodeType ? x : document.createTextNode(String(x))));
      else n.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return n;
  };
  O.clear = n => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
  /* the one slug rule; tools/registry.js and tools/build_catalog.py use the same one */
  O.slug = s => String(s).normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  /* only http(s) links from outside data are ever made clickable */
  O.safeUrl = u => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; } };
  O.ext = (href, text, cls) => { const u = O.safeUrl(href); return u ? O.el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', class: cls, text }) : O.el('span', { class: cls, text }); };
  O.str = (v, max) => typeof v === 'string' ? v.slice(0, max || 4000) : '';

  /* ── formatting ── */
  const p2 = n => String(n).padStart(2, '0');
  O.fmt = {
    utc: d => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`,
    day: d => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`,
    longDay: d => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    shortDay: d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    local: d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    num: (n, d) => n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }),
    sig: (n, s) => n == null || !isFinite(n) ? '—' : Number(Number(n).toPrecision(s || 3)).toLocaleString('en-US', { maximumFractionDigits: 6 }),
    ago: d => { const s = (Date.now() - d.getTime()) / 1000, a = Math.abs(s), w = s < 0 ? ['in ', ''] : ['', ' ago'];
      const t = a < 90 ? 'a minute' : a < 5400 ? Math.round(a / 60) + ' min' : a < 129600 ? Math.round(a / 3600) + ' h' : a < 5184000 ? Math.round(a / 86400) + ' days' : a < 63072000 ? Math.round(a / 2629800) + ' months' : Math.round(a / 31557600) + ' years';
      return w[0] + t + w[1]; },
    /* a distance in light-years, written at whatever scale reads best */
    ly: ly => ly == null || !isFinite(ly) ? '—' : ly < 0.001 ? O.fmt.sig(ly * 63241.077, 3) + ' AU' : ly < 1e3 ? O.fmt.sig(ly, 3) + ' light-years' : ly < 1e6 ? O.fmt.sig(ly / 1e3, 3) + ' thousand light-years'
      : ly < 1e9 ? O.fmt.sig(ly / 1e6, 3) + ' million light-years' : O.fmt.sig(ly / 1e9, 3) + ' billion light-years',
    countdown: ms => { const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400); return (d ? d + ' d ' : '') + p2(Math.floor(s % 86400 / 3600)) + ':' + p2(Math.floor(s % 3600 / 60)) + ':' + p2(s % 60); }
  };

  /* ── data: files shipped with the site. A missing file resolves to null, never throws. ── */
  const cache = new Map(); O.missing = [];
  O.load = function (path, type) {
    const key = path + '|' + (type || 'json');
    if (cache.has(key)) return cache.get(key);
    const p = fetch(path).then(r => { if (!r.ok) throw new Error(r.status); return type === 'bin' ? r.arrayBuffer() : type === 'text' ? r.text() : r.json(); })
      .catch(() => { O.missing.push(path); if (location.protocol === 'file:') O.fileNotice(); return null; });
    cache.set(key, p); return p;
  };
  /* a live call to a public API: quiet failure, 7 s budget, only where it can work */
  O.live = function (url, type) {
    if (!O.canLive) return Promise.resolve(null);
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 7000);
    return fetch(url, { signal: ac.signal, credentials: 'omit' }).then(r => r.ok ? (type === 'text' ? r.text() : r.json()) : null).catch(() => null).finally(() => clearTimeout(t));
  };
  /* rows added after publishing (daily digests, news) when the page runs as a Claude artifact; [] everywhere else */
  let dbP = null;
  O.cloud = function (name, n) {
    if (!O.inArtifact) return Promise.resolve([]);
    const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
    dbP = dbP || Promise.race([window.claude.use('db'), wait(9000, null)]).catch(() => null);
    return dbP.then(db => db ? Promise.race([db.collection(name).limit(n || 120).get(), wait(9000, null)]) : null)
      .then(s => s && s.docs ? s.docs.map(d => Object.assign({}, d.data() || {}, { id: d.id })) : []).catch(() => []);
  };
  let noticed = false;
  O.fileNotice = function () {
    if (noticed) return; noticed = true;
    document.body.append(O.el('div', { class: 'notice', style: { position: 'fixed', left: '16px', right: '16px', bottom: '16px', zIndex: 500 } },
      'This page was opened straight from disk, and browsers stop pages on disk from reading their data files. In the site folder run “python -m http.server”, then open http://localhost:8000.'));
  };
  /* provenance: where a number came from and how old it is */
  O.stamp = function (source, iso, staleHours) {
    const d = iso ? new Date(iso) : null, ok = d && !isNaN(d);
    const old = ok && staleHours && (Date.now() - d.getTime()) > staleHours * 3600e3;
    return O.el('span', { class: 'stamp' + (old ? ' stale' : ''), title: ok ? d.toISOString() : '' }, source, ok ? [' · fetched ', O.el('b', { text: O.fmt.ago(d) })] : null);
  };

  /* ── storage that never throws ── */
  const mem = {};
  O.store = {
    get(k, d) { try { const v = localStorage.getItem('owlt:' + k); return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem('owlt:' + k, JSON.stringify(v)); } catch (e) { /* private window or blocked storage: memory only */ } }
  };

  /* ── ship log: what you have found. id = "<kind>:<slug>", kinds: page obj paper canon term lost ── */
  O.log = {
    all() { const L = O.store.get('log', {}); return L && typeof L === 'object' ? L : {}; },
    has(id) { return !!this.all()[id]; },
    mark(id, title, href) {
      const L = this.all(); if (L[id]) return false;
      L[id] = [Date.now(), String(title).slice(0, 120), href || '']; O.store.set('log', L);
      document.dispatchEvent(new CustomEvent('owlt:log', { detail: { id, title } })); return true;
    },
    count() { return Object.keys(this.all()).length; },
    clear() { O.store.set('log', {}); }
  };
  /* knowledge graph built by tools/build_index.mjs: nodes[id] = [title, kind, href, light-years|null]; edges undirected */
  O.graph = () => O.load('data/graph.json').then(g => {
    if (!g) return { nodes: {}, adj: {}, edges: [] };
    if (!g.adj) { g.adj = {}; for (const [a, b] of g.edges) { (g.adj[a] = g.adj[a] || []).push(b); (g.adj[b] = g.adj[b] || []).push(a); } }
    return g;
  });
  /* threads: where a thing leads. Dashed chips are places you have not been yet. */
  O.threads = function (host, ids, lead) {
    O.clear(host); if (!ids || !ids.length) return host;
    O.graph().then(g => {
      const seen = new Set(), chips = [];
      for (const id of ids) { const n = g.nodes[id]; if (!n || seen.has(id)) continue; seen.add(id);
        chips.push(O.el('a', { class: 'chip' + (O.log.has(id) ? '' : ' unseen'), href: n[2], title: O.log.has(id) ? 'You have been here' : 'Not visited yet' }, O.el('span', { class: 'dot' }), n[0])); }
      if (chips.length) host.append(O.el('span', { class: 'lead', text: lead || 'This leads to' }), ...chips);
    });
    return host;
  };

  /* ── navigation bar + footer ── */
  O.nav = function () {
    const bar = O.el('header', { id: 'owlt-nav' },
      O.el('a', { class: 'mark', href: 'index.html', 'aria-label': 'OWLT, today’s page' }, 'OWLT'),
      O.el('nav', { 'aria-label': 'Sections' }, O.PAGES.map(p => O.el('a', { href: p[0], 'aria-current': p[0] === O.page ? 'page' : null, title: p[2] }, p[1]))),
      O.el('div', { class: 'tools' },
        O.el('span', { class: 'clock', id: 'owlt-clock', title: 'Coordinated Universal Time' }),
        O.el('button', { class: 'owlt-find', type: 'button', id: 'owlt-find', onclick: () => O.palette.open(), 'aria-label': 'Search everything' }, O.el('span', { text: 'Search' }), O.el('kbd', { text: '/' }))));
    document.body.prepend(bar); document.body.classList.add('has-nav');
    const cur = bar.querySelector('[aria-current=page]'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    const clk = O.$('#owlt-clock'), tick = () => { const d = new Date(); clk.textContent = `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} UTC`; };
    tick(); setInterval(tick, 1000);
    O.palette.init();
    const p = O.PAGES.find(x => x[0] === O.page); if (p) O.log.mark('page:' + O.slug(p[1]), p[1], p[0]);
  };
  O.footer = function (host, lines) {
    const f = O.el('footer', { id: 'owlt-foot' }, O.el('div', { class: 'wrap' },
      (lines || []).map(l => O.el('div', null, l)),
      O.el('div', null, 'OWLT is organised by one-way light time: how long light takes to get here. Everything on it already happened. ',
        O.el('a', { href: 'index.html#sources', text: 'Sources and licences' }), '.')));
    (host || document.body).append(f); return f;
  };

  /* ── search palette: one box that reaches every page, object, paper, term and mission ── */
  O.palette = (function () {
    let root, input, list, items = [], sel = 0, index = null, loading = null;
    const KIND = { page: 'Page', scale: 'Scale', star: 'Star', planet: 'Planet', moon: 'Moon', dwarf: 'Dwarf planet', asteroid: 'Asteroid', comet: 'Comet', probe: 'Spacecraft',
      system: 'Planetary system', exo: 'Exoplanet', nebula: 'Nebula', cluster: 'Cluster', globular: 'Globular cluster', remnant: 'Supernova remnant', pulsar: 'Pulsar', blackhole: 'Black hole',
      galaxy: 'Galaxy', satellite: 'Satellite galaxy', supercluster: 'Supercluster', wall: 'Great wall', void: 'Void', structure: 'Structure', quasar: 'Quasar', transient: 'Transient',
      horizon: 'Horizon', region: 'Region', paper: 'Paper', canon: 'Landmark paper', term: 'Glossary', lost: 'Lost mission', obj: 'Object' };
    function ensure() { return loading || (loading = O.load('data/search-index.json').then(d => { index = (d && d.items) || []; })); }
    function score(q, s) { s = s.toLowerCase(); if (s === q) return 0; if (s.startsWith(q)) return 1; const i = s.indexOf(q); if (i < 0) return -1; return /[\s(\-–·]/.test(s[i - 1]) ? 2 : 3; }
    function run(q) {
      q = q.trim().toLowerCase(); let out;
      if (!q) {
        out = O.PAGES.map(p => [p[1], 'page', p[0], p[2]]);
        const L = O.log.all(), rec = Object.keys(L).filter(k => !k.startsWith('page:') && L[k][2]).sort((a, b) => L[b][0] - L[a][0]).slice(0, 6);
        out = out.concat(rec.map(k => [L[k][1], k.split(':')[0], L[k][2], 'visited ' + O.fmt.ago(new Date(L[k][0]))]));
      } else {
        const hits = [];
        for (const p of O.PAGES) { const s = score(q, p[1]); if (s >= 0) hits.push([s - 1, [p[1], 'page', p[0], p[2]]]); }
        for (const it of index || []) { let s = score(q, it[0]); if (s < 0 && it[4]) { s = score(q, it[4]); if (s >= 0) s += 1.5; } if (s >= 0) hits.push([s + (it[5] || 0), it]); }
        hits.sort((a, b) => a[0] - b[0] || a[1][0].length - b[1][0].length); out = hits.slice(0, 60).map(h => h[1]);
      }
      items = out; sel = 0; paint(q);
    }
    function paint(q) {
      O.clear(list);
      if (!items.length) { list.append(O.el('div', { class: 'grp', text: index ? 'Nothing matches “' + q + '”. Try a designation such as M31 or NGC 1300, or an arXiv number.' : 'Loading the index…' })); return; }
      if (!q) list.append(O.el('div', { class: 'grp', text: 'Go to' }));
      items.forEach((it, i) => list.append(O.el('a', { class: 'it' + (i === sel ? ' sel' : ''), href: it[2], onclick: () => setTimeout(close, 0), onmousemove: () => { if (sel !== i) { sel = i; mark(); } } },
        O.el('span', { class: 'n', text: it[0] }), it[3] ? O.el('span', { class: 'd', text: it[3] }) : null, O.el('span', { class: 'k', text: KIND[it[1]] || it[1] }))));
    }
    function mark() { const all = O.$$('.it', list); all.forEach((n, i) => n.classList.toggle('sel', i === sel)); if (all[sel]) all[sel].scrollIntoView({ block: 'nearest' }); }
    let back = null;
    function open() { back = document.activeElement; root.classList.add('on'); input.value = ''; run(''); input.focus(); ensure().then(() => { if (root.classList.contains('on')) run(input.value); }); }
    function close() { root.classList.remove('on'); input.blur(); if (back && back !== input && document.contains(back) && back.focus) back.focus({ preventScroll: true }); back = null; }
    function go() { const it = items[sel]; if (!it) return; close(); location.href = it[2]; }
    function init() {
      if (root) return;
      input = O.el('input', { id: 'owlt-q', type: 'text', placeholder: 'Jump to anything: Europa, Betelgeuse, M87, dark matter, Voyager…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Search' });
      list = O.el('div', { class: 'list', role: 'listbox' });
      root = O.el('div', { id: 'owlt-pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search', onmousedown: e => { if (e.target === root) close(); } },
        O.el('div', { class: 'box' }, input, list, O.el('div', { class: 'foot' }, O.el('span', { text: '↑ ↓ move' }), O.el('span', { text: 'Enter open' }), O.el('span', { text: 'Esc close' }))));
      document.body.append(root);
      input.addEventListener('input', () => run(input.value));
      input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); mark(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
        else if (e.key === 'Enter') { go(); e.preventDefault(); }
        else if (e.key === 'Escape') { close(); e.stopPropagation(); }
      });
      document.addEventListener('keydown', e => {
        const t = e.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') || t.isContentEditable;
        if ((e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); root.classList.contains('on') ? close() : open(); }
        else if (e.key === 'Escape' && root.classList.contains('on')) close();
      });
    }
    return { init, open, close, get isOpen() { return !!root && root.classList.contains('on'); } };
  })();

  /* "when this light left": the departure date of light from something `years` light-years away, and what Earth was doing */
  O.lightLeft = function (years) {
    return O.load('data/eras.json').then(E => {
      const d = new Date(), now = d.getUTCFullYear(), nowF = now + (d.getUTCMonth() + d.getUTCDate() / 31) / 12, list = (E && E.eras) || [];
      let when;
      if (years < 1) when = years * 365.25 < 2 ? 'within the last two days' : Math.round(years * 365.25) + ' days ago';
      else if (years < now - 1) when = 'in ' + Math.round(now - years);
      else if (years < 12000) when = 'around ' + O.fmt.num(Math.round((years - now + 1) / 10) * 10) + ' BCE';
      else if (years < 1e6) when = O.fmt.num(Math.round(years / 100) * 100) + ' years ago';
      else if (years < 1e9) when = O.fmt.sig(years / 1e6, 3) + ' million years ago';
      else when = O.fmt.sig(years / 1e9, 4) + ' billion years ago';
      let best = null, bd = 1e9;
      for (const e of list) { const ago = e[2] != null ? nowF - e[2] : e[0], dd = Math.abs(Math.log(Math.max(ago, 0.5) / Math.max(years, 0.5))); if (dd < bd) { bd = dd; best = e; } }
      return { when, context: best && bd < 0.45 ? best[1] : null };
    });
  };
  /* a deterministic pick that changes once a day (UTC), the same for everyone */
  O.dayIndex = () => Math.floor(Date.now() / 86400000);
  O.pick = (arr, salt) => arr && arr.length ? arr[(O.dayIndex() * 7 + (salt || 0) * 13) % arr.length] : null;
})();

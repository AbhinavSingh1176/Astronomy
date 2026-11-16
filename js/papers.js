/* OWLT · papers.js — the Reading Room.
   Two shelves: digests of new papers (data/papers/digests.json, refreshed by scripts/digest.mjs) and the canon
   (data/papers/canon.json), the papers that made the field. Everything from the files enters the page as text. */
(function () {
  'use strict';
  const O = window.OWLT, $ = O.$, el = O.el;
  O.nav();
  const CAT = { 'astro-ph.EP': 'Planets', 'astro-ph.SR': 'Stars', 'astro-ph.HE': 'High energy', 'astro-ph.GA': 'Galaxies', 'astro-ph.CO': 'Cosmology',
    'astro-ph.IM': 'Instruments', 'gr-qc': 'Gravity', 'physics.space-ph': 'Space physics' };
  const FILTERS = [['all', 'All'], ['Planets', 'Planets'], ['Stars', 'Stars'], ['High energy', 'High energy'], ['Galaxies', 'Galaxies'], ['Cosmology', 'Cosmology'], ['Instruments', 'Instruments'], ['canon', 'The canon']];
  const paperEl = $('#paper'), tocEl = $('#toc');
  let ALL = [], DIG = [], CAN = [], GL = [], G = {}, byTerm = {}, cur = null, filter = 'all', query = '', order = [];

  Promise.all([O.load('data/papers/digests.json'), O.load('data/papers/canon.json'), O.load('data/glossary.json'), O.cloud('digests', 200)]).then(([d, c, g, cloud]) => {
    GL = ((g && g.terms) || []).slice().sort((a, b) => a.t.localeCompare(b.t)); for (const t of GL) G[t.id] = t;
    const seen = new Set();
    for (const p of ((d && d.papers) || []).concat(cloud || [])) {
      if (!p || !p.id || !p.t || seen.has(p.id)) continue; seen.add(p.id);
      DIG.push({ kind: 'paper', id: String(p.id), key: 'paper:' + p.id, title: O.str(p.t, 400), by: O.str(p.by, 600), date: O.str(p.date, 10), cat: CAT[p.cat] || O.str(p.cat, 40) || 'Astrophysics', code: O.str(p.cat, 40),
        status: O.str(p.status, 300), one: O.str(p.one), q: O.str(p.q), how: O.str(p.how), found: Array.isArray(p.found) ? p.found : [], why: O.str(p.why), careful: O.str(p.careful),
        terms: Array.isArray(p.terms) ? p.terms : [], links: Array.isArray(p.links) ? p.links : [], url: p.url, arxiv: O.str(p.arxiv, 30), auto: !!p.auto });
    }
    DIG.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
    CAN = ((c && c.papers) || []).map(p => ({ kind: 'canon', id: 'canon-' + p.id, raw: p.id, key: 'canon:' + p.id, title: p.t, by: p.by, yr: p.yr, ref: p.ref, url: p.url, arxiv: p.arxiv, cat: p.field,
      one: p.one, q: p.q, how: p.how, found: p.found || [], why: p.why, since: p.since, terms: p.terms || [], links: p.links || [] })).sort((a, b) => a.yr - b.yr);
    ALL = DIG.concat(CAN);
    for (const it of ALL) for (const t of it.terms) (byTerm[t] = byTerm[t] || []).push(it);
    masthead(); filters(); glossary(); route();
    addEventListener('hashchange', route);
    $('#q').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); toc(); });
    $('#tocToggle').addEventListener('click', () => { const ix = $('#index'), open = ix.classList.toggle('closed') === false; $('#tocToggle').setAttribute('aria-expanded', open); });
    document.addEventListener('owlt:log', () => toc());
  });

  /* ── helpers ── */
  const DAY = 864e5;
  const fmtDate = s => { const d = new Date(s + 'T12:00:00Z'); return isNaN(d) ? s : O.fmt.shortDay(d); };
  function review(s) {
    s = s || '';
    if (/submitted|under review|in review/i.test(s)) return ['pre', 'Submitted · not yet peer reviewed'];
    if (/published|accepted|in press/i.test(s) || /\b(ApJ|ApJL|AJ|MNRAS|A&A|Nature|Science|PRL|PRD|JCAP|Icarus|PSJ|ApJS)\b\s*\d/.test(s)) return ['ok', 'Peer reviewed'];
    return ['pre', 'Preprint · not yet peer reviewed'];
  }
  const words = it => [it.one, it.q, it.how, it.why, it.careful, it.since].join(' ').split(/\s+/).length + it.found.length * 8;
  const minutes = it => Math.max(1, Math.round(words(it) / 170));      /* careful reading of technical prose */
  const shortBy = by => { const b = String(by || '').replace(/\s+and \d+ others?$/i, ' et al.'); return b.length > 90 ? b.split(',')[0] + ' et al.' : b; };
  const hrefOf = it => 'papers.html#' + it.id;
  const read = it => O.log.has(it.key);
  /* "Hubble 1929" / "Ferrer-Chavez et al. 2026": how people say a paper's name aloud */
  function cite(it) {
    const yr = it.kind === 'canon' ? it.yr : (it.date || '').slice(0, 4), bare = String(it.by).replace(/\([^)]*\)/g, '').trim();
    const coll = bare.match(/^(?:The\s+)?(.+?)\s+(?:Scientific\s+)?Collaboration\b/i); if (coll && !/,| and /.test(coll[1])) return coll[1] + ' ' + yr;
    const ppl = bare.replace(/\bet al\.?/i, '').replace(/\s+and \d+ others?$/i, '').split(/,| and /).map(x => x.trim()).filter(x => x && !/co-authors?|others|team|collaboration|^the\b/i.test(x));
    const sur = x => x.split(/\s+/).filter(w => !/^(Jr|Sr)\.?$/i.test(w)).pop().replace(/\.$/, '');
    const more = /et al|co-author|team|others|collaboration/i.test(bare) || ppl.length > 2;
    if (!ppl.length) return yr;
    return (more ? sur(ppl[0]) + ' et al.' : ppl.length === 2 ? sur(ppl[0]) + ' & ' + sur(ppl[1]) : sur(ppl[0])) + ' ' + yr;
  }

  /* ── masthead: an issue a day ── */
  function masthead() {
    const now = new Date(), doy = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(now.getFullYear(), 0, 0)) / DAY);
    const nRead = ALL.filter(read).length;
    O.clear($('#issue')).append('Issue ', el('b', { text: String(doy) }), ' · ' + O.fmt.longDay(now) + ' · ' + nRead + ' of ' + ALL.length + ' read');
    const host = O.clear($('#today')), latest = DIG.length ? DIG[0].date : null, fresh = DIG.filter(p => p.date === latest);
    const tp = O.pick(fresh.length ? fresh : DIG, 1), cp = O.pick(CAN, 3), term = O.pick(GL, 5);
    if (tp) host.append(el('a', { href: '#' + tp.id }, el('span', { class: 'k', text: 'Today’s paper · ' + tp.cat }), el('span', { class: 't', text: tp.title }), el('span', { class: 'o', text: tp.one }),
      el('span', { class: 'm', text: fmtDate(tp.date) + ' · ' + minutes(tp) + ' min read' + (read(tp) ? ' · read' : '') })));
    if (cp) host.append(el('a', { href: '#' + cp.id }, el('span', { class: 'k', text: 'From the canon · ' + cp.yr }), el('span', { class: 't', text: cite(cp) }), el('span', { class: 'o', text: cp.one }),
      el('span', { class: 'm', text: cp.cat + ' · ' + minutes(cp) + ' min read' + (read(cp) ? ' · read' : '') })));
    if (term) host.append(el('a', { class: 'term', href: '#term-' + term.id }, el('span', { class: 'k', text: 'Term of the day' }), el('span', { class: 't', text: term.t }),
      el('span', { class: 'o', text: term.d.length > 150 ? term.d.slice(0, term.d.lastIndexOf(' ', 150)) + '…' : term.d })));
    if (!DIG.length) host.append(el('div', { class: 'notice', text: 'No new digests have been fetched yet. The canon below is always here.' }));
  }

  /* ── the table of contents ── */
  function filters() {
    const host = $('#filters');
    for (const [k, label] of FILTERS) {
      if (k !== 'all' && k !== 'canon' && !DIG.some(p => p.cat === k)) continue;
      host.append(el('button', { type: 'button', 'aria-pressed': k === filter ? 'true' : 'false', onclick: ev => { filter = k; for (const b of host.children) b.setAttribute('aria-pressed', b === ev.currentTarget); toc(); } }, label));
    }
  }
  function matches(it) {
    if (filter === 'canon' && it.kind !== 'canon') return false;
    if (filter !== 'all' && filter !== 'canon' && (it.kind === 'canon' || it.cat !== filter)) return false;
    if (!query) return true;
    const hay = [it.title, it.one, it.by, it.cat, it.kind === 'canon' ? it.yr + ' ' + cite(it) : it.date, it.arxiv, it.terms.map(t => G[t] ? G[t].t : t).join(' ')].join(' ').toLowerCase();
    return query.split(/\s+/).every(w => hay.includes(w));
  }
  function toc() {
    O.clear(tocEl); order = [];
    const latest = DIG.length ? new Date(DIG[0].date + 'T00:00:00Z').getTime() : 0;
    const groups = [['This week', DIG.filter(p => latest - new Date(p.date + 'T00:00:00Z').getTime() < 7 * DAY)], ['Earlier', DIG.filter(p => latest - new Date(p.date + 'T00:00:00Z').getTime() >= 7 * DAY)], ['The canon', CAN]];
    let any = false;
    for (const [name, list] of groups) {
      const items = list.filter(matches); if (!items.length) continue; any = true;
      tocEl.append(el('h3', { text: name + ' · ' + items.length }));
      for (const it of items) {
        order.push(it);
        tocEl.append(el('a', { href: '#' + it.id, 'aria-current': cur === it ? 'true' : null },
          el('span', { class: 'tt', text: it.kind === 'canon' ? cite(it) + ': ' + it.one : it.title }),
          el('span', { class: 'mm' }, el('span', { text: it.kind === 'canon' ? it.cat : it.cat + ' · ' + fmtDate(it.date) }), el('span', { text: minutes(it) + ' min' }), read(it) ? el('span', { class: 'rd', text: '✓ read' }) : null)));
      }
    }
    if (!any) tocEl.append(el('div', { class: 'none', text: 'Nothing matches. Try fewer words, or another field.' }));
  }

  /* ── text with its terms made into notes ── */
  function rich(text, ids, used) {
    const pats = [];
    for (const id of ids) { const g = G[id]; if (!g || used.has(id)) continue; for (const s of [g.t].concat(g.aka || [])) if (s && s.length > 2) pats.push([s, id]); }
    pats.sort((a, b) => b[0].length - a[0].length);
    const out = []; let rest = String(text || '');
    while (rest) {
      let best = null;
      for (const [s, id] of pats) {
        if (used.has(id)) continue;
        const m = new RegExp('(^|[^A-Za-z])(' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![A-Za-z])', 'i').exec(rest);
        if (m && (!best || m.index + m[1].length < best.i)) best = { i: m.index + m[1].length, len: m[2].length, id };
      }
      if (!best) { out.push(rest); break; }
      used.add(best.id);
      out.push(rest.slice(0, best.i), el('button', { class: 'term', type: 'button', data: { term: best.id }, title: G[best.id].t, onclick: () => showNote(best.id) }, rest.substr(best.i, best.len)));
      rest = rest.slice(best.i + best.len);
    }
    return out;
  }
  function showNote(id) {
    for (const n of O.$$('.marg .note, .paper .term')) n.classList.toggle('on', n.dataset.term === id);
    const n = O.$('.marg .note[data-term="' + id + '"]');
    if (n) { const r = n.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight) n.scrollIntoView({ block: 'center', behavior: O.reduced ? 'auto' : 'smooth' }); }
    if (G[id]) O.log.mark('term:' + id, G[id].t, 'papers.html#term-' + id);
  }

  /* ── one paper ── */
  function render(it) {
    cur = it; O.clear(paperEl); document.title = (it.kind === 'canon' ? cite(it) : it.title) + ' · Reading Room · OWLT';
    const used = new Set(), top = el('div', { class: 'top' });
    if (it.kind === 'canon') top.append(el('span', { class: 'cat', text: 'The canon · ' + it.cat }), el('span', { class: 'date', text: String(it.yr) }), el('span', { class: 'badge ok', text: 'Peer reviewed' }));
    else { const rv = review(it.status); top.append(el('span', { class: 'cat', text: it.cat + (it.code ? ' · ' + it.code : '') }), el('span', { class: 'date', text: fmtDate(it.date) }), el('span', { class: 'badge ' + rv[0], text: rv[1], title: it.status || '' })); }
    const marg = el('aside', { class: 'marg', 'aria-label': 'Terms in this paper' });
    paperEl.append(marg, top, el('h1', { text: it.title }), el('div', { class: 'by', text: it.by }), el('p', { class: 'one', text: it.one }),
      el('div', { class: 'rt', text: minutes(it) + ' min read · ' + (it.kind === 'canon' ? 'a plain-language account of the original paper' : 'a plain-language digest of the paper’s abstract') }));
    if (it.auto) paperEl.append(el('div', { class: 'notice auto', text: 'This digest was put together automatically from the abstract and has not been checked by a person. Read the abstract for anything that matters.' }));
    let n = 0;
    const sec = (title, body, cls) => { if (!body) return; n++; const s = el('section', { class: cls || null }, el('h2', null, cls === 'careful' ? null : el('span', { class: 'n', text: String(n).padStart(2, '0') }), title)); if (typeof body === 'string') s.append(el('p', null, rich(body, it.terms, used))); else s.append(body); paperEl.append(s); };
    sec('The question', it.q);
    sec('What they did', it.how);
    if (it.found.length) sec('What they found', el('table', { class: 'found' }, el('tbody', null, it.found.filter(f => Array.isArray(f) && f.length >= 2).map(f => el('tr', null, el('td', { text: String(f[0]) }), el('td', { text: String(f[1]) }))))));
    sec('Why it matters', it.why);
    if (it.since) sec('What happened next', it.since);
    if (it.careful) { n--; sec('Read with care', it.careful, 'careful'); }
    /* the reference, in full, and where to read the real thing */
    const ref = el('p', { class: 'ref' });
    if (it.kind === 'canon') ref.append(it.by + ' (' + it.yr + '). ', el('i', { text: it.title }), '. ' + (it.ref || '') + '.');
    else ref.append(shortBy(it.by) + ' (' + it.date.slice(0, 4) + '). ', el('i', { text: it.title }), '. arXiv:' + it.arxiv + (it.code ? ' [' + it.code + ']' : '') + '.' + (it.status ? ' ' + it.status.replace(/\.?$/, '.') : ''));
    const acts = el('div', { class: 'acts' }), copy = el('button', { class: 'btn', type: 'button', text: 'Copy reference' });
    copy.addEventListener('click', () => {
      const txt = ref.textContent + (it.url ? ' ' + it.url : '');
      const done = ok => { copy.textContent = ok ? 'Copied' : 'Select and copy'; if (!ok) { const r = document.createRange(); r.selectNodeContents(ref); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } setTimeout(() => { copy.textContent = 'Copy reference'; }, 1800); };
      try { navigator.clipboard.writeText(txt).then(() => done(true), () => done(false)); } catch (e) { done(false); }
    });
    if (it.kind === 'canon') { acts.append(O.ext(it.url, 'Read the original', 'btn')); if (it.arxiv) acts.append(O.ext('https://arxiv.org/abs/' + it.arxiv, 'arXiv', 'btn')); }
    else if (it.arxiv) acts.append(O.ext('https://arxiv.org/abs/' + it.arxiv, 'Abstract on arXiv', 'btn'), O.ext('https://arxiv.org/pdf/' + it.arxiv, 'PDF', 'btn'), O.ext('https://arxiv.org/html/' + it.arxiv, 'Full text with figures', 'btn'));
    acts.append(copy);
    paperEl.append(el('div', { class: 'cite' }, el('div', { class: 'eyebrow', style: { marginBottom: '6px' }, text: 'Reference' }), ref, acts));
    const th = el('div', { class: 'threads' }); paperEl.append(th); O.threads(th, it.links, 'This leads to');
    /* the terms, in the margin */
    const terms = it.terms.filter(t => G[t]);
    if (terms.length) { marg.append(el('h3', { text: 'Terms' })); for (const t of terms) marg.append(el('div', { class: 'note', data: { term: t } }, el('b', { text: G[t].t }), el('p', { text: G[t].d }), el('a', { href: '#term-' + t, text: 'In the glossary' }))); }
    else marg.remove();
    /* previous and next, in the order the contents list shows */
    toc(); const i = order.indexOf(it), pn = el('nav', { class: 'pn', 'aria-label': 'More papers' });
    if (i > 0) pn.append(el('a', { class: 'prev', href: '#' + order[i - 1].id }, '← Previous', el('b', { text: order[i - 1].kind === 'canon' ? cite(order[i - 1]) : order[i - 1].title })));
    if (i >= 0 && i < order.length - 1) pn.append(el('a', { class: 'next', href: '#' + order[i + 1].id }, 'Next →', el('b', { text: order[i + 1].kind === 'canon' ? cite(order[i + 1]) : order[i + 1].title })));
    paperEl.append(pn);
    O.log.mark(it.key, it.kind === 'canon' ? cite(it) : it.title, hrefOf(it));
    masthead();
  }

  /* ── the glossary ── */
  function glossary() {
    const dl = $('#gl'), az = $('#az'), letters = new Set();
    for (const t of GL) {
      const L = t.t[0].toUpperCase(), first = !letters.has(L); letters.add(L);
      const uses = (byTerm[t.id] || []).slice(0, 6);
      dl.append(el('div', { class: 'g', id: 'term-' + t.id, data: first ? { letter: L } : null },
        el('dt', null, t.t, t.aka && t.aka.length ? el('small', { text: t.aka.slice(0, 3).join(' · ') }) : null),
        el('dd', null, t.d, uses.length ? el('span', { class: 'in' }, 'In: ', uses.map(u => el('a', { href: '#' + u.id, text: u.kind === 'canon' ? cite(u) : (u.title.length > 46 ? u.title.slice(0, u.title.lastIndexOf(' ', 46)) + '…' : u.title) }))) : null)));
    }
    for (const L of letters) az.append(el('a', { href: '#gl-' + L, text: L, onclick: ev => { ev.preventDefault(); const n = O.$('#gl [data-letter="' + L + '"]'); if (n) n.scrollIntoView({ block: 'start', behavior: O.reduced ? 'auto' : 'smooth' }); } }));
  }

  /* ── routing: #<paper id>, #canon-<id>, #term-<id>, #glossary ── */
  function route() {
    const h = decodeURIComponent((location.hash || '').slice(1));
    if (h.startsWith('term-')) {
      const id = h.slice(5), n = document.getElementById('term-' + id);
      if (!cur) render(firstPaper());
      if (n) { for (const g of O.$$('.gloss .g.on')) g.classList.remove('on'); n.classList.add('on'); n.scrollIntoView({ block: 'center', behavior: O.reduced ? 'auto' : 'smooth' }); if (G[id]) O.log.mark('term:' + id, G[id].t, 'papers.html#term-' + id); }
      return;
    }
    if (h === 'glossary') { if (!cur) render(firstPaper()); $('#glossary').scrollIntoView({ block: 'start' }); return; }
    const it = ALL.find(x => x.id === h) || firstPaper();
    if (!it) { paperEl.append(el('p', { class: 'notice', text: 'The reading list could not be loaded.' })); return; }
    const was = cur; render(it);
    if (was && h) { const r = paperEl.getBoundingClientRect(); if (r.top < 0 || r.top > innerHeight * 0.6) scrollTo({ top: scrollY + r.top - 64, behavior: O.reduced ? 'auto' : 'smooth' }); }
    if (innerWidth <= 900) { $('#index').classList.add('closed'); $('#tocToggle').setAttribute('aria-expanded', 'false'); }
  }
  function firstPaper() { const latest = DIG.length ? DIG[0].date : null, fresh = DIG.filter(p => p.date === latest); return O.pick(fresh.length ? fresh : DIG, 1) || CAN[0]; }

  O.footer(document.body, ['Digests are written from each paper’s public arXiv abstract and link to the full paper. Canon accounts are written from the published originals. Neither replaces reading the paper.']);
})();

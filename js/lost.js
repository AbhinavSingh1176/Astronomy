/* OWLT · lost.js — the memorial archive. Every entry opens; the one in the address opens itself. */
(function () {
  'use strict';
  const O = window.OWLT, $ = O.$, el = O.el;
  O.nav();
  const KINDS = [['all', 'All', null], ['crew', 'Lives lost', 'crew'], ['lost', 'Spacecraft lost', 'lost'], ['ended', 'Ended early', 'ended'], ['cancelled', 'Never flew', 'cancelled']];
  let M = [], STARS = [], show = 'all';
  Promise.all([O.load('data/lost.json'), O.load('data/catalog/stars.json')]).then(([l, s]) => {
    M = ((l && l.missions) || []).slice().sort((a, b) => String(a.when).localeCompare(String(b.when)));
    if (s) STARS = s.rows.map(r => ({ name: r[s.cols.indexOf('name')], ly: r[s.cols.indexOf('ly')], mag: r[s.cols.indexOf('mag')], slug: r[s.cols.indexOf('slug')] })).filter(x => x.ly && x.mag != null && x.mag < 4.5 && /^[A-Z][a-z]/.test(x.name) && !/^(HD|HIP|GJ|Gliese)\b/.test(x.name)).sort((a, b) => a.ly - b.ly);
    key(); list(); open();
    addEventListener('hashchange', open);
  });
  function key() {
    const host = $('#key');
    for (const [k, label, mk] of KINDS) host.append(el('button', { type: 'button', 'aria-pressed': k === show ? 'true' : 'false', onclick: ev => { show = k; for (const b of host.children) b.setAttribute('aria-pressed', b === ev.currentTarget); list(); } },
      mk ? el('span', { class: 'mk ' + mk }) : null, label + (k === 'all' ? '' : ' · ' + M.filter(m => m.kind === k).length)));
  }
  /* the light from that day is still travelling: how far it has got */
  function light(when) {
    const t = new Date(String(when).length === 4 ? when + '-07-01' : when), yrs = (Date.now() - t) / (365.25 * 864e5);
    if (!(yrs > 0)) return null;
    const passed = STARS.filter(s => s.ly <= yrs).pop();
    return 'Light that left Earth that day is now ' + O.fmt.sig(yrs, 3) + ' light-years out' + (passed ? ', past ' + passed.name + '.' : '.');
  }
  function list() {
    const host = O.clear($('#line')), md = new Date().toISOString().slice(5, 10); let lastY = null;
    for (const m of M) {
      if (show !== 'all' && m.kind !== show) continue;
      const y = String(m.when).slice(0, 4);
      if (y !== lastY) { host.append(el('div', { class: 'yr', text: y })); lastY = y; }
      const dl = el('dl', null, [['What it was for', m.for], ['How far it got', m.far], ['What happened', m.what], ['The record', m.primary]].filter(r => r[1]).map(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]).flat());
      const det = el('details', { id: 'd-' + m.id }, el('summary', { text: 'The record' }), dl, light(m.when) ? el('p', { class: 'light', text: light(m.when) }) : null, m.more ? el('p', { class: 'light' }, O.ext(m.more, 'A longer account')) : null);
      det.addEventListener('toggle', () => { if (det.open) O.log.mark('lost:' + m.id, m.n, 'lost.html#' + m.id); });
      const th = el('div', { class: 'threads' });
      host.append(el('article', { class: 'm' + (String(m.when).slice(5, 10) === md ? ' today' : ''), id: m.id },
        el('span', { class: 'mk ' + m.kind, title: KINDS.find(k => k[2] === m.kind)[1] }), el('h2', { text: m.n }),
        el('div', { class: 'who' }, m.who + ' · ' + fmtWhen(m.when), m.lives ? [' · ', el('b', { text: m.lives + (m.lives === '1' ? ' life' : ' lives') })] : null),
        el('p', { class: 'why', text: m.what.split(/(?<=\.)\s/)[0] }), det, th));
      if (m.links && m.links.length) O.threads(th, m.links, 'See also');
    }
  }
  const fmtWhen = w => String(w).length === 4 ? w : O.fmt.shortDay(new Date(w + 'T12:00:00Z'));
  function open() {
    const id = decodeURIComponent((location.hash || '').slice(1)); if (!id) return;
    const d = document.getElementById('d-' + id), a = document.getElementById(id); if (!d) return;
    d.open = true; a.scrollIntoView({ block: 'start' });
  }
  O.footer(document.body, ['Entries are written from the official investigation or programme records named in each. Soviet-era casualty figures are disputed and given as ranges.']);
})();

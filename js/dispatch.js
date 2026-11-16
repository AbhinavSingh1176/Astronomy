/* OWLT · dispatch.js — news, the departures board, the last launches, close approaches.
   Headlines link to the original story; nothing from a feed is ever inserted as markup. */
(function () {
  'use strict';
  const O = window.OWLT, $ = O.$, el = O.el;
  O.nav();
  const DESK = { launch: 'Launches and rockets', missions: 'Missions', astronomy: 'Astronomy', policy: 'Policy and industry', other: 'Elsewhere' };
  let N = null, who = 'All';

  Promise.all([O.load('data/news.json'), O.load('data/launches.json'), O.load('data/neo.json')]).then(([news, ln, neo]) => {
    N = news; edition(news, ln); chips(); paper(); board(ln); recent(ln); near(neo);
    if (location.hash === '#launches') $('#launches').scrollIntoView();
  });

  function edition(news, ln) {
    const d = new Date(), h = d.getHours(), ed = h < 6 ? 'Night edition' : h < 12 ? 'Morning edition' : h < 18 ? 'Afternoon edition' : 'Evening edition';
    const host = $('#ed'); O.clear(host).append(el('span', { text: ed + ' · ' + O.fmt.longDay(d) }),
      el('span', { text: (news && news.items ? news.items.length + ' stories' : 'no stories yet') + (ln && ln.upcoming ? ' · ' + ln.upcoming.length + ' launches ahead' : '') }),
      news && news.fetched ? O.stamp('Wire', news.fetched, 30) : el('span', { text: 'Awaiting the first wire' }));
  }

  function chips() {
    const host = $('#chips'), items = (N && N.items) || [], counts = {};
    for (const a of items) for (const w of a.who || []) counts[w] = (counts[w] || 0) + 1;
    const list = ['All'].concat(Object.keys(counts).sort((a, b) => counts[b] - counts[a]));
    if (list.length < 2) { host.hidden = true; return; }
    host.append(el('span', { class: 'lab', text: 'Who' }));
    for (const w of list) host.append(el('button', { type: 'button', 'aria-pressed': w === who ? 'true' : 'false', onclick: ev => { who = w; for (const b of host.querySelectorAll('button')) b.setAttribute('aria-pressed', b === ev.currentTarget); paper(); } }, w + (w === 'All' ? '' : ' · ' + counts[w])));
  }

  const byline = a => el('div', { class: 'by', text: a.site + ' · ' + O.fmt.ago(new Date(a.date)) + (a.who && a.who.length ? ' · ' + a.who.join(', ') : '') });
  function paper() {
    const front = O.clear($('#front')), desks = O.clear($('#desks')), tick = O.clear($('#ticker'));
    const all = (N && N.items) || [], items = who === 'All' ? all : all.filter(a => (a.who || []).includes(who));
    if (!all.length) {
      front.append(el('div', { class: 'lead' }, el('div', { class: 'kick', text: 'Awaiting the wire' }), el('h2', { text: 'The presses start with the site’s first daily refresh' }),
        el('p', { text: 'Every six hours the site collects stories from the Spaceflight News API and directly from ESA, ESO, NASA, NOIRLab, Universe Today and Sky & Telescope, sorts them by desk and by who is involved, and links each headline to the original.' })));
      tick.hidden = true; return;
    }
    /* the teletype: twice over, so the loop is seamless */
    const run = el('div', { class: 'run' }), heads = all.slice(0, 16).map(a => el('span', null, el('b', { text: a.site.toUpperCase() }), O.ext(a.url, a.t)));
    run.append(...heads, ...heads.map(n => n.cloneNode(true))); run.style.setProperty('--dur', Math.max(60, heads.length * 9) + 's'); tick.append(run); tick.hidden = false;
    const lead = items.find(a => a.sum && a.sum.length > 80) || items[0];
    if (!lead) { front.append(el('div', { class: 'lead' }, el('h2', { text: 'Nothing from ' + who + ' in this edition.' }))); return; }
    const rest = items.filter(a => a !== lead);
    front.append(el('article', { class: 'lead' }, el('div', { class: 'kick', text: DESK[lead.desk] || 'News' }), el('h2', null, O.ext(lead.url, lead.t)), lead.sum ? el('p', { text: lead.sum }) : null, byline(lead)));
    for (const col of [rest.slice(0, 2), rest.slice(2, 4)]) front.append(el('div', null, col.map(a => el('article', { class: 'story' }, el('div', { class: 'kick', text: DESK[a.desk] || 'News' }), el('h3', null, O.ext(a.url, a.t)),
      a.sum ? el('p', { text: a.sum.length > 220 ? a.sum.slice(0, a.sum.lastIndexOf(' ', 220)) + '…' : a.sum }) : null, byline(a)))));
    const later = rest.slice(4);
    for (const k of ['launch', 'missions', 'astronomy', 'policy']) {
      const list = later.filter(a => a.desk === k).slice(0, 7).concat(k === 'policy' ? later.filter(a => a.desk === 'other').slice(0, 3) : []);
      desks.append(el('section', { class: 'desk' }, el('h2', { text: DESK[k] }), list.length ? el('ul', null, list.map(a => el('li', null, O.ext(a.url, a.t), byline(a)))) : el('p', { class: 'none', text: 'Quiet on this desk.' })));
    }
  }

  /* ── split-flap departures ── */
  const flap = (text, n, cls, delay) => { const s = String(text || '').toUpperCase().slice(0, n).padEnd(n, ' '), w = el('span', { class: 'flap ' + (cls || '') });
    [...s].forEach((ch, i) => w.append(el('i', { class: O.reduced ? '' : 'go', style: { '--d': (delay + i * 0.03).toFixed(2) + 's' }, text: ch === ' ' ? ' ' : ch }))); return w; };
  const stCls = s => /^go/i.test(s) ? 'st-go' : /hold|fail|scrub/i.test(s) ? 'st-hold' : 'st-tbd';
  function tminus(ms, prec) { if (/month/.test(prec || '')) return 'this month'; if (/day/.test(prec || '')) return 'T−' + Math.max(0, Math.ceil(ms / 864e5)) + 'd'; const neg = ms < 0, s = Math.floor(Math.abs(ms) / 1000), d = Math.floor(s / 86400); return (neg ? 'T+' : 'T−') + (d ? d + 'd ' : '') + String(Math.floor(s % 86400 / 3600)).padStart(2, '0') + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function board(L) {
    const host = O.clear($('#board')), up = ((L && L.upcoming) || []).filter(l => new Date(l.net) > Date.now() - 2 * 3600e3).sort((a, b) => a.net.localeCompare(b.net)).slice(0, 14);
    if (L && L.fetched) O.clear($('#lstamp')).append(O.stamp(L.source || 'Launch Library 2', L.fetched, 30));
    if (!up.length) { host.append(el('div', { class: 'empty-board', text: L ? 'NO DEPARTURES ON THE BOARD IN THE LAST FETCH' : 'BOARD OFFLINE · THE SCHEDULE ARRIVES WITH THE FIRST DAILY REFRESH' })); return; }
    const tb = el('tbody');
    up.forEach((l, i) => {
      const t = new Date(l.net), MON = t.toLocaleString('en-GB', { month: 'short' }).toUpperCase().slice(0, 3), p = (l.prec || '').toLowerCase();
      const when = /month/.test(p) ? 'NET ' + MON + ' ' + t.getFullYear() : String(t.getDate()).padStart(2, '0') + ' ' + MON + (/day/.test(p) ? '  --:--' : '  ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'));
      const tm = el('span', { class: 'tm', data: { net: l.net, prec: p }, text: tminus(t - Date.now(), p) });
      tb.append(el('tr', null, el('td', null, flap(when, 13, '', i * 0.06)), el('td', null, tm),
        el('td', null, flap(l.rocket || l.name.split('|')[0], 18, '', i * 0.06 + 0.2), el('span', { class: 'sub', text: l.provider + (l.country ? ' · ' + l.country : '') })),
        el('td', null, flap(l.mission || l.name.split('|')[1] || '', 20, '', i * 0.06 + 0.35), el('span', { class: 'sub', text: [l.mtype, l.orbit].filter(Boolean).join(' · ') + (l.loc ? ' · ' + l.loc : '') })),
        el('td', null, flap(l.status || 'TBD', 5, stCls(l.status), i * 0.06 + 0.5), el('span', { class: 'sub', text: l.prec && !/second|minute/i.test(l.prec) ? 'date to the ' + l.prec.toLowerCase() : '' }))));
    });
    host.append(el('table', null, el('thead', null, el('tr', null, ['Planned', 'Countdown', 'Vehicle', 'Mission', 'Status'].map(h => el('th', { text: h })))), tb));
    $('#lcount').textContent = up.length + ' shown of ' + L.upcoming.length;
    setInterval(() => { for (const n of O.$$('.tm', host)) n.textContent = tminus(new Date(n.dataset.net) - Date.now(), n.dataset.prec); }, 1000);
  }
  function recent(L) {
    const host = $('#recent'), list = ((L && L.recent) || []).slice().sort((a, b) => b.net.localeCompare(a.net)).slice(0, 10);
    if (!list.length) { host.append(el('p', { class: 'note', text: 'Recent launches arrive with the first daily refresh.' })); return; }
    host.append(el('ul', null, list.map(l => { const ok = /success/i.test(l.statusName || l.status), bad = /fail/i.test(l.statusName || l.status);
      return el('li', null, el('span', { class: 'd', text: O.fmt.shortDay(new Date(l.net)) }), el('span', { class: 'n', text: (l.mission || l.name) + ' · ' + (l.rocket || l.provider) }),
        el('span', { class: 'o ' + (ok ? 'ok' : bad ? 'bad' : ''), text: l.statusName || l.status })); })));
  }
  function near(D) {
    const host = $('#neo'), list = ((D && D.items) || []).filter(n => new Date(n.when) > Date.now() - 864e5).slice(0, 10);
    if (!list.length) { host.append(el('p', { class: 'note', text: D && D.fetched ? 'Nothing passes within 0.05 AU (about 19 lunar distances) in the next 60 days.' : 'Close approaches from NASA/JPL arrive with the site’s first daily refresh.' })); return; }
    host.append(el('ul', null, list.map(n => el('li', null, el('span', { class: 'd', text: O.fmt.shortDay(new Date(n.when)) }), el('span', { class: 'n', text: n.des + (n.size ? ' · ' + n.size[0] + '–' + n.size[1] + ' m' : '') }),
      el('span', { class: 'x', text: (n.ld < 1 ? 'inside the Moon’s orbit · ' : '') + n.ld + ' LD · ' + (n.kms != null ? n.kms.toFixed(1) + ' km/s' : '') })))),
      el('p', { class: 'note' }, 'LD is the Moon’s distance, 384,400 km. ' + (D.note || '') + ' ', O.stamp(D.source || 'JPL', D.fetched, 30)));
  }
  O.footer(document.body, ['Headlines link to the stories on their publishers’ sites. Launch data from Launch Library 2 by The Space Devs.']);
})();

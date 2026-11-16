/* OWLT · atlas.js — the whole registry as a catalogue. Built from the same files and the same code as the Ladder. */
(function () {
  'use strict';
  const O = window.OWLT, A = window.ASTRO, REG = window.OWLT_REGISTRY, $ = O.$, el = O.el;
  O.nav();
  const KIND = { scale: 'Scale', star: 'Star', planet: 'Planet', moon: 'Moon', dwarf: 'Dwarf planet', asteroid: 'Asteroid', comet: 'Comet', probe: 'Spacecraft', system: 'Planetary system',
    nebula: 'Nebula', cluster: 'Cluster', globular: 'Globular cluster', remnant: 'Supernova remnant', pulsar: 'Pulsar', blackhole: 'Black hole', galaxy: 'Galaxy', satellite: 'Satellite galaxy',
    supercluster: 'Supercluster', wall: 'Great wall', void: 'Void', structure: 'Structure', quasar: 'Quasar', transient: 'Transient', horizon: 'Horizon', region: 'Region', interstellar: 'Interstellar object' };
  const GROUPS = [['all', 'Everything', () => true], ['solar', 'Solar System', e => e.group === 'solar' || e.group === 'craft' || e.group === 'note'],
    ['star', 'Stars', e => e.kind === 'star'], ['system', 'Planetary systems', e => !!e.system], ['hz', 'Habitable-zone planets', e => e.system && e.system.planets.some(p => p.hz === 2)],
    ['deep', 'Nebulae and clusters', e => /nebula|remnant|globular/.test(e.kind) || (e.kind === 'cluster' && e.ly < 1e6)], ['compact', 'Black holes and pulsars', e => e.kind === 'blackhole' || e.kind === 'pulsar'],
    ['galaxy', 'Galaxies', e => e.kind === 'galaxy' || e.kind === 'satellite'], ['large', 'The largest structures', e => /supercluster|wall|void|structure|quasar|transient|horizon/.test(e.kind) || (e.kind === 'cluster' && e.ly >= 1e6)]];
  const YR = 31557600, C = A.C_KMS, AUKM = A.AU_KM;
  let R = null, rows = [], group = 'all', query = '', sort = 'ly', limit = 200, sel = null;

  Promise.all(['solar', 'structures', 'stars', 'exoplanets', 'messier', 'galaxies'].map(f => O.load('data/catalog/' + f + '.json'))).then(d => {
    if (d.some(x => !x)) { $('#card').append(el('p', { class: 'notice', text: 'Part of the catalogue did not load. Reload the page to try again.' })); return; }
    R = REG.build({ solar: d[0], structures: d[1], stars: d[2], exo: d[3], messier: d[4], galaxies: d[5] }, A);
    rows = R.list.filter(e => e.kind !== 'scale').map(e => ({ e, ly: lyOf(e), key: (e.name + ' ' + (e.alias || []).join(' ') + ' ' + (e.des || '') + ' ' + (e.system ? e.system.planets.map(p => p.name).join(' ') : '')).toLowerCase() }));
    counts(); kinds(); table(); route();
    addEventListener('hashchange', route);
    $('#q').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); limit = 200; table(); });
    $('#sort').addEventListener('change', e => { sort = e.target.value; table(); });
  });

  /* distance in light-years; bodies in the Solar System are measured from Earth now */
  function lyOf(e) {
    const jd = A.jdOf(new Date());
    if (e.body === 'earth') return 0;
    if (e.body === 'sun') return A.sun(jd).dist * AUKM / C / YR;
    if (e.body === 'moon') return A.moon(jd).distKm / C / YR;
    if (e.body && A.PLANETS.includes(e.body)) return A.planet(e.body, jd).lightMin * 60 / YR;
    if (e.body && A.PROBES[e.body]) return A.probe(e.body, jd).lightSec / YR;
    if (e.el) { const p = A.elementsXYZ(e.el, jd), q = A.helio('earth', jd); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * AUKM / C / YR; }
    if (e.group === 'solar' && e.parent && e.parent !== 'Sun') { const par = R.find(O.slug(e.parent)); return par ? lyOf(par) : null; }
    if (e.kind === 'horizon' || e.shell) return e.shell === 'hubble' ? A.cosmo.hubbleGly * 1e9 : e.shell === 'event' ? A.cosmo.eventHorizonGly * 1e9 : e.ly;
    return e.z != null ? e.ltYears : e.ly != null ? e.ly : null;
  }
  function age(ly) {
    if (ly == null) return '—'; if (ly === 0) return 'now'; const s = ly * YR;
    if (s < 60) return s.toFixed(2) + ' s'; if (s < 3600) return (s / 60).toFixed(1) + ' min'; if (s < 172800) return (s / 3600).toFixed(1) + ' h'; if (ly < 1) return (s / 86400).toFixed(0) + ' days';
    const y = new Date().getFullYear(); if (ly < y - 1) return 'in ' + Math.round(y - ly); if (ly < 1e4) return Math.round(ly - y + 1) + ' BCE';
    return ly < 1e6 ? O.fmt.sig(ly / 1e3, 3) + ' kyr ago' : ly < 1e9 ? O.fmt.sig(ly / 1e6, 3) + ' Myr ago' : O.fmt.sig(ly / 1e9, 3) + ' Gyr ago';
  }
  const dist = r => r.e.z != null ? 'z ' + r.e.z : r.ly == null ? '—' : r.ly === 0 ? (r.e.body === 'earth' ? 'here' : 'around us') : r.ly < 0.01 ? A.lightTime(r.ly * YR) : REG.fmtLy(r.ly);

  function counts() {
    const n = k => rows.filter(r => GROUPS.find(g => g[0] === k)[2](r.e)).length, planets = rows.reduce((s, r) => s + (r.e.system ? r.e.system.planets.length : 0), 0);
    O.clear($('#counts')).append(el('span', null, el('b', { text: O.fmt.num(rows.length) }), ' places'), el('span', null, el('b', { text: O.fmt.num(n('star')) }), ' named stars'),
      el('span', null, el('b', { text: O.fmt.num(n('system')) }), ' planetary systems with ', el('b', { text: O.fmt.num(planets) }), ' planets'), el('span', null, el('b', { text: O.fmt.num(n('hz')) }), ' with a planet in the habitable zone'),
      el('span', null, el('b', { text: O.fmt.num(n('galaxy')) }), ' galaxies'));
  }
  function kinds() {
    const host = $('#kinds');
    for (const [k, label, f] of GROUPS) host.append(el('button', { type: 'button', 'aria-pressed': k === group ? 'true' : 'false', onclick: ev => { group = k; limit = 200; for (const b of host.children) b.setAttribute('aria-pressed', b === ev.currentTarget); table(); } },
      label, el('small', { text: O.fmt.num(rows.filter(r => f(r.e)).length) })));
  }
  function filtered() {
    const f = GROUPS.find(g => g[0] === group)[2], words = query.split(/\s+/).filter(Boolean);
    let out = rows.filter(r => f(r.e) && words.every(w => r.key.includes(w)));
    const big = 1e30;
    if (sort === 'ly') out.sort((a, b) => (a.ly ?? big) - (b.ly ?? big)); else if (sort === '-ly') out.sort((a, b) => (b.ly ?? -1) - (a.ly ?? -1));
    else if (sort === 'name') out.sort((a, b) => a.e.name.localeCompare(b.e.name)); else out.sort((a, b) => (a.e.mag ?? 99) - (b.e.mag ?? 99));
    if (query) { const exact = out.filter(r => r.e.name.toLowerCase() === query || (r.e.alias || []).some(a => a.toLowerCase() === query)); out = exact.concat(out.filter(r => !exact.includes(r))); }
    return out;
  }
  function table() {
    const t = O.clear($('#cat')), list = filtered(), shown = list.slice(0, limit);
    t.append(el('thead', null, el('tr', null, [['Name', 'name'], ['Kind'], ['Distance', 'ly'], ['Light left'], ['Constellation'], ['Magnitude', 'mag']].map(([h, s]) =>
      el('th', { 'aria-sort': s && (sort === s || (s === 'ly' && sort === '-ly')) ? (sort === '-ly' ? 'descending' : 'ascending') : null, onclick: s ? () => { sort = s === 'ly' && sort === 'ly' ? '-ly' : s; $('#sort').value = sort; table(); } : null, text: h })))));
    const tb = el('tbody');
    for (const r of shown) {
      const e = r.e, hz = e.system && e.system.planets.some(p => p.hz === 2);
      tb.append(el('tr', { 'aria-selected': sel === e ? 'true' : 'false', onclick: () => { location.hash = e.slug; } },
        el('td', null, e.name, e.des || (e.alias && e.alias[0] && e.alias[0] !== e.name) ? el('small', { text: [e.des].concat(e.alias || []).filter(a => a && a !== e.name).slice(0, 2).join(' · ') }) : null),
        el('td', { class: hz ? 'hz' : '', text: (e.kind === 'cluster' && e.ly >= 1e6 ? 'Galaxy cluster' : KIND[e.kind] || e.kind) + (e.system ? ' · ' + e.system.planets.length + 'p' : '') }),
        el('td', { text: dist(r) }), el('td', { text: age(r.ly) }), el('td', { text: e.con || '' }), el('td', { text: e.mag != null ? String(e.mag) : '' })));
    }
    t.append(tb);
    const more = O.clear($('#more'));
    more.append(el('span', { text: 'Showing ' + O.fmt.num(shown.length) + ' of ' + O.fmt.num(list.length) }));
    if (list.length > shown.length) more.append(el('button', { class: 'btn', type: 'button', onclick: () => { limit += 400; table(); }, text: 'Show more' }));
  }

  /* ── one card ── */
  function card(e) {
    sel = e; const host = O.clear($('#card')), r = rows.find(x => x.e === e), ly = r ? r.ly : null;
    host.append(el('div', { class: 'k', text: e.kind === 'cluster' && e.ly >= 1e6 ? 'Galaxy cluster' : KIND[e.kind] || e.kind }), el('h2', { text: e.name }));
    const al = [e.des].concat(e.alias || []).filter(a => a && a !== e.name); if (al.length) host.append(el('div', { class: 'al', text: al.slice(0, 5).join(' · ') }));
    if (ly) host.append(el('div', { class: 'lt' }, el('b', { text: e.z != null ? O.fmt.sig(e.ltYears / 1e9, 3) + ' billion years' : A.lightTime(ly * YR) }),
      el('span', { text: e.z != null ? 'since the light left · redshift ' + e.z + ' · now ' + O.fmt.sig(A.cosmo.comovingGly(e.z), 3) + ' billion light-years away' : e.body ? 'of light from here to Earth, now' : 'of light from here to Earth' })));
    const left = el('p'); host.append(left);
    if (ly != null && ly >= 1) O.lightLeft(ly).then(x => { if (sel === e) left.append('The light arriving from it now left ' + x.when + (x.context ? ', when ' + x.context : '') + '.'); });
    if (e.note) host.append(el('p', { text: e.note }));
    const kv = [];
    if (e.radius) kv.push(['Radius', O.fmt.num(e.radius) + ' km']); if (e.facts) for (const k in e.facts) kv.push([k, e.facts[k]]);
    if (e.sp) kv.push(['Spectral type', e.sp]); if (e.mag != null) kv.push(['Magnitude', String(e.mag)]); if (e.absmag != null) kv.push(['Absolute magnitude', String(e.absmag)]);
    if (e.lum) kv.push(['Luminosity', O.fmt.sig(e.lum, 3) + ' Suns']); if (e.hubble) kv.push(['Type', e.hubble]); if (e.sizeLy && !e.home) kv.push(['Across', REG.fmtLy(e.sizeLy)]);
    if (e.mass) kv.push(['Mass', O.fmt.sig(e.mass, 3) + ' Suns']); if (e.ra != null && e.kind !== 'horizon') kv.push(['Sky position', A.fmtRA(e.ra) + ' ' + A.fmtDec(e.dec)]);
    if (e.cluster) kv.push(['Group', e.cluster]); if (e.dflag) kv.push(['Distance from', { 1: 'measured directly', 2: 'its cluster', 3: 'its redshift' }[e.dflag]]);
    if (kv.length) host.append(el('dl', { class: 'kv' }, kv.map(([k, v]) => [el('dt', { text: k }), el('dd', { text: String(v) })]).flat()));
    if (e.system) host.append(el('ul', { class: 'pl' }, e.system.planets.map(p => el('li', null, el('span', { class: p.hz === 2 ? 'hz' : '', text: p.name + (p.hz === 2 ? ' · habitable zone' : p.hz === 1 ? ' · edge of the zone' : '') }),
      el('span', { text: [p.a ? p.a + ' AU' : '', p.period ? O.fmt.sig(p.period, 3) + ' d' : '', p.rE ? p.rE + ' R⊕' : p.mE ? p.mE + ' M⊕' : '', p.teq ? p.teq + ' K' : '', p.year || ''].filter(Boolean).join(' · ') })))));
    const th = el('div', { class: 'threads' }); host.append(th); if (e.links && e.links.length) O.threads(th, e.links.map(l => l.startsWith('obj:') ? 'obj:' + ((R.find(l.slice(4)) || {}).slug || l.slice(4)) : l));
    const acts = el('div', { class: 'acts' }); host.append(acts);
    if (e.group !== 'note') acts.append(el('a', { class: 'btn', href: 'ladder.html#' + e.slug, text: 'Go there on the Ladder' }));
    if (e.kind === 'star' && e.mag != null && e.mag < 3) acts.append(el('a', { class: 'btn', href: 'sky.html#' + e.slug, text: 'Find it tonight' }));
    if (e.group === 'note') host.append(el('p', { class: 'stamp', text: 'Not drawn on the Ladder: its position is not modelled here.' }));
    O.log.mark('obj:' + e.slug, e.name, (e.group === 'note' ? 'atlas.html#' : 'ladder.html#') + e.slug);
    for (const tr of O.$$('#cat tbody tr')) tr.setAttribute('aria-selected', 'false');
  }
  function route() {
    const h = decodeURIComponent((location.hash || '').slice(1)); if (!h || !R) return;
    const e = R.find(h) || R.find(O.slug(h)); if (!e) { O.clear($('#card')).append(el('p', { class: 'empty', text: 'Nothing in the Atlas goes by “' + h + '”.' })); return; }
    card(e); table();
    if (innerWidth <= 1000) $('#card').scrollIntoView({ block: 'start' });
  }
  O.footer(document.body, ['Built from HYG v4.1, OpenNGC, the Open Exoplanet Catalogue and OWLT’s own landmark list. Solar System distances are computed for this moment.']);
})();

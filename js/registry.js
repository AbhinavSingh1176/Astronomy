/* OWLT · registry.js — the one list of every place the Ladder can take you.
   The browser (Ladder, Atlas) and tools/build_index.mjs both build it from the same catalogue files,
   so a link or a search result can never point at something the Ladder cannot find.
   Entry: { slug, name, kind, group, alias[], detail, note, facts, links, ...where it is }
   where it is, one of:  body (a Solar System id, placed live) · ra/dec/ly · ra/dec/mly · ra/dec/z · shell (a horizon) */
(function (root) {
  'use strict';
  const slug = s => String(s).normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const M = { ER: 6.371e6, AU: 1.495978707e11, LY: 9.4607304725808e15, RSUN: 6.957e8, C: 299792458 };
  const SCALES = [
    ['scale-earth', 'Earth', 3.2e7], ['scale-moon', 'Earth and Moon', 1.1e9], ['scale-inner', 'Inner planets', 6.5e11],
    ['scale-planets', 'Solar System', 1.3e13], ['scale-heliosphere', 'Kuiper belt and heliosphere', 9e13], ['scale-oort', 'Oort cloud', 3.5e16],
    ['scale-neighbours', 'Nearest stars', 4e17], ['scale-bubble', 'Local Bubble', 1.2e19], ['scale-arm', 'Orion Arm', 1.4e20],
    ['scale-galaxy', 'Milky Way', 1.9e21], ['scale-local-group', 'Local Group', 9e22], ['scale-laniakea', 'Laniakea', 6e24],
    ['scale-web', 'Cosmic web', 6e25], ['scale-universe', 'Observable universe', 1.05e27]];
  const STAR_ALIAS = { 'rigil-kentaurus': ['Alpha Centauri', 'Alpha Centauri A'], toliman: ['Alpha Centauri B'], polaris: ['North Star', 'Pole Star'], sirius: ['Dog Star'] };
  const SIZE_LY = { nebula: 20, cluster: 20, globular: 120, remnant: 30, satellite: 5000, galaxy: 60000, region: 1000 };
  /* habitable-zone edges in AU for a star of temperature teff (K) and luminosity L (Suns): Kopparapu et al. 2014, 1 Earth mass */
  function hz(teff, L) {
    const T = Math.max(2600, Math.min(7200, teff)) - 5780, s = (s0, a, b, c, d) => s0 + a * T + b * T * T + c * T * T * T + d * T * T * T * T;
    return [Math.sqrt(L / s(1.107, 1.332e-4, 1.580e-8, -8.308e-12, -1.931e-15)), Math.sqrt(L / s(0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16))];
  }
  const fmtLy = ly => ly < 1e3 ? +ly.toPrecision(3) + ' ly' : ly < 1e6 ? +(ly / 1e3).toPrecision(3) + ' thousand ly' : ly < 1e9 ? +(ly / 1e6).toPrecision(3) + ' million ly' : +(ly / 1e9).toPrecision(3) + ' billion ly';
  const rows = t => t && t.rows ? t.rows.map(r => { const o = {}; t.cols.forEach((c, i) => { o[c] = r[i]; }); return o; }) : [];

  function build(D, A) {
    const list = [], by = {}, alias = {};
    const add = e => {
      if (!e.slug || by[e.slug]) return by[e.slug] || null;
      if (alias[e.slug]) delete alias[e.slug];
      by[e.slug] = e; list.push(e); e.alias = e.alias || [];
      const names = [e.name].concat(e.alias);
      for (const a of names) { const s = slug(a); if (s && s !== e.slug && !by[s] && !alias[s]) alias[s] = e.slug; }
      return e;
    };
    const find = s => by[s] || by[alias[s]] || null;

    SCALES.forEach(s => add({ slug: s[0], name: s[1], kind: 'scale', group: 'scale', span: s[2], detail: A.lightTime(s[2] / M.C) + ' across',
      note: 'A step on the ladder. Light takes ' + A.lightTime(s[2] / M.C) + ' to cross this view.' }));

    /* Solar System */
    const S = D.solar || {};
    for (const b of S.bodies || []) add({ slug: b.id, name: b.name, kind: b.kind, group: 'solar', body: b.id, parent: b.parent, radius: b.radius, look: b.look, rings: b.rings, el: b.el,
      a: b.a, period: b.period, life: b.life, note: b.note, facts: b.facts, links: b.links, span: Math.max(b.radius * 1000 * (b.rings ? 11 : 6), 2e5),
      detail: b.kind === 'moon' ? 'moon of ' + b.parent : b.kind === 'star' ? 'our star' : b.a ? b.a + ' AU from the Sun' : '' });
    for (const b of S.small || []) add({ slug: b.id, name: b.name, kind: b.kind, group: 'note', note: b.note, facts: b.facts, links: b.links, detail: 'Solar System' });
    for (const c of S.craft || []) add({ slug: c.id, name: c.name, kind: 'probe', group: 'craft', body: c.id, note: c.note, facts: c.facts, links: c.links,
      span: c.id === 'iss' ? 2.6e7 : c.id === 'jwst' ? 6e9 : 8e13, detail: 'spacecraft' });

    /* landmarks beyond the Solar System */
    for (const s of (D.structures && D.structures.items) || []) {
      const e = { slug: s.id, name: s.n, kind: s.k, group: 'far', alias: s.alias, sub: s.sub, note: s.note, links: s.links, approx: s.approx, disputed: s.disputed, sig: s.sig, mass: s.mass, shell: s.shell };
      if (s.shell) { e.detail = 'a horizon'; }
      else if (s.ly != null) { e.ra = s.ra; e.dec = s.dec; e.ly = s.ly; e.sizeLy = s.size || SIZE_LY[s.k]; e.home = s.home; e.detail = s.ly ? fmtLy(s.ly) : 'around us'; }
      else if (s.mly != null) { e.ra = s.ra; e.dec = s.dec; e.ly = s.mly * 1e6; e.sizeLy = s.size ? s.size * 1e6 : undefined; e.detail = fmtLy(e.ly); }
      else { e.ra = s.ra; e.dec = s.dec; e.z = s.z; e.sizeLy = s.size ? s.size * 1e6 : undefined; e.ltYears = A.cosmo.lookbackGyr(s.z) * 1e9; e.ly = A.cosmo.comovingGly(s.z) * 1e9;
        e.detail = s.z >= 0.1 ? 'z ' + s.z + ' · light left ' + (+(e.ltYears / 1e9).toPrecision(3)) + ' billion yr ago' : fmtLy(e.ly); }
      add(e);
    }

    /* named stars with a measured distance */
    for (const s of rows(D.stars)) {
      if (s.ly == null) continue;
      add({ slug: s.slug, name: s.name, kind: 'star', group: 'star', alias: (s.full ? s.full.split(' / ') : []).concat(s.id ? [s.id] : [], STAR_ALIAS[s.slug] || []), des: s.des, ra: s.ra, dec: s.dec, ly: s.ly, mag: s.mag, absmag: s.absmag, bv: s.bv, sp: s.sp, lum: s.lum, con: s.con,
        detail: fmtLy(s.ly) + (s.sp ? ' · ' + s.sp : '') });
    }

    const reg = { list, by, alias, find, scales: SCALES, extend: D2 => { more(D2 || {}); return reg; } };
    more(D);
    return reg;

    /* the rest, in the same order: planetary systems, Messier objects, galaxies. The Ladder adds these after its first frame
       (reg.extend), everything else passes them to build at once; either way an entry is added, merged or skipped exactly the same */
    function more(D) {
    /* planetary systems */
    const sys = {};
    for (const p of rows(D.exo)) {
      if (p.ra == null || !p.ly || !p.host) continue;
      (sys[p.host] = sys[p.host] || { host: p.host, ra: p.ra, dec: p.dec, ly: p.ly, sp: p.sp, teff: p.teff, lum: p.lum, planets: [] }).planets.push(p);
    }
    for (const h in sys) {
      const s = sys[h], sl = slug(h); if (!sl) continue;
      s.planets.sort((a, b) => (a.a || 1e9) - (b.a || 1e9));
      if (s.teff && s.lum) s.hz = hz(s.teff, s.lum);
      const nHz = s.planets.filter(p => p.hz === 2).length;
      const det = s.planets.length + (s.planets.length === 1 ? ' planet' : ' planets') + (nHz ? ', ' + nHz + ' in the habitable zone' : '') + ' · ' + fmtLy(s.ly);
      const ex = find(sl);
      if (ex && ex.kind === 'star') { ex.system = s; ex.detail = det; }
      else if (!ex) add({ slug: sl, name: h, kind: 'system', group: 'star', ra: s.ra, dec: s.dec, ly: s.ly, sp: s.sp, system: s, detail: det });
    }

    /* Messier objects inside the Milky Way (the galaxies come from the galaxy table) */
    const MK = { 'Globular cluster': 'globular', 'Open cluster': 'cluster', 'Cluster with nebulosity': 'cluster', 'Star cloud': 'cluster', 'Asterism': 'cluster', 'Double star': 'cluster',
      'Planetary nebula': 'nebula', 'Supernova remnant': 'remnant', 'Diffuse nebula': 'nebula', 'Bright nebula': 'nebula', 'Emission nebula': 'nebula', 'Reflection nebula': 'nebula' };
    for (const m of D.messier || []) {
      const k = MK[m.type]; if (!k || !m.ly) continue;
      if (find(slug(m.id))) continue;
      add({ slug: slug(m.id), name: m.name ? m.name : m.id, kind: k, group: 'far', alias: [m.id, m.des].filter(Boolean), sub: m.type === 'Planetary nebula' ? 'planetary' : m.type === 'Reflection nebula' ? 'reflection' : 'emission',
        ra: m.ra, dec: m.dec, ly: m.ly, sizeLy: SIZE_LY[k], mag: m.mag, detail: m.type + ' · ' + fmtLy(m.ly), note: m.id + (m.des ? ' (' + m.des + ')' : '') + ', a ' + m.type.toLowerCase() + ' in the Milky Way.' });
    }

    /* galaxies */
    for (const g of rows(D.galaxies)) {
      const al = [g.des, g.m].filter(Boolean);
      if (al.some(a => find(slug(a))) || find(g.slug)) continue;
      const sizeLy = g.majArcmin ? g.majArcmin / 60 * Math.PI / 180 * g.mly * 1e6 : SIZE_LY.galaxy;
      add({ slug: g.slug, name: g.name || g.m || g.des, kind: 'galaxy', group: 'far', alias: al, ra: g.ra, dec: g.dec, ly: g.mly * 1e6, gi: g.i, hubble: g.hubble, mag: g.mag, sizeLy, cluster: g.cluster, dflag: g.dflag, zcat: g.z,
        detail: fmtLy(g.mly * 1e6) + (g.hubble ? ' · ' + g.hubble : '') });
    }
    }
  }

  /* how wide a view (metres) frames an entry well */
  function spanFor(e, A) {
    if (e.span) return e.span;
    if (e.shell || e.kind === 'horizon') return 1.05e27;
    if (e.kind === 'star' || e.kind === 'system') {
      if (e.system) { const far = Math.max(e.system.hz ? e.system.hz[1] : 0, ...e.system.planets.map(p => p.a || 0)); if (far > 0) return Math.min(far * 3.2, 400) * M.AU; }
      const R = e.absmag != null ? A.starRadius(e.absmag, e.bv == null ? 0.65 : e.bv) : 1; return R * M.RSUN * 9;
    }
    if (e.kind === 'pulsar') return 4e5;
    if (e.mass) return 2953 * e.mass * 16;
    if (e.sizeLy) return e.sizeLy * M.LY * (e.kind === 'void' || e.kind === 'wall' || e.kind === 'supercluster' ? 1.5 : 2.4);
    if (e.kind === 'quasar' || e.kind === 'transient' || e.kind === 'galaxy') return 2e5 * M.LY;
    if (e.kind === 'structure') return 4e8 * M.LY;
    return 100 * M.LY;
  }
  const api = { slug, build, spanFor, hz, SCALES, M, rows, fmtLy };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OWLT_REGISTRY = api;
})(typeof window !== 'undefined' ? window : globalThis);

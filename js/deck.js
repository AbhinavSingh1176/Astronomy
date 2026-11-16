/* OWLT · deck.js — the Flight Deck. Computed quantities tick every second; fetched ones show their age.
   A gauge whose feed has not arrived rests at zero with a dim readout rather than guessing. */
(function () {
  'use strict';
  const O = window.OWLT, A = window.ASTRO, $ = O.$, el = O.el, SAT = window.satellite;
  O.nav();
  const jdNow = () => A.jdOf(new Date()), C = A.C_KMS, AUKM = A.AU_KM, D2R = Math.PI / 180;
  const V1_LAUNCH = Date.UTC(1977, 8, 5, 12, 56, 0);
  let SW = null, LN = null, NEO = null, DSN = null, TLE = null, recs = [];

  /* ── Nixie displays ── */
  const nixie = s => { const w = el('span', { class: 'nixie' }); for (const ch of s) w.append(el('i', { class: /[:.\s-]/.test(ch) ? 'sep' : '', text: ch })); return w; };
  function setNixie(w, s) { if (w.dataset.v === s) return; w.dataset.v = s; O.clear(w); for (const ch of s) w.append(el('i', { class: /[:.\s-]/.test(ch) ? 'sep' : '', text: ch })); }
  const hms = sec => { sec = ((sec % 86400) + 86400) % 86400; return [Math.floor(sec / 3600), Math.floor(sec % 3600 / 60), Math.floor(sec % 60)].map(n => String(n).padStart(2, '0')).join(':'); };
  const CLOCKS = [['UTC', () => { const d = new Date(); return hms(d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()); }],
    ['Local', () => { const d = new Date(); return hms(d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()); }],
    ['Sidereal, Greenwich', () => hms(A.gmst(jdNow()) / 15 * 3600)],
    ['Modified Julian date', () => (jdNow() - 2400000.5).toFixed(4)],
    ['Voyager 1 mission day', () => String(Math.floor((Date.now() - V1_LAUNCH) / 864e5)).padStart(5, '0')],
    ['Voyager 1 one-way light', () => hms(A.probe('voyager-1', jdNow()).lightSec)]];
  const clockEls = [];
  function clocks() { const host = $('#clocks'); for (const [label, f] of CLOCKS) { const n = nixie(f()); clockEls.push([n, f]); host.append(el('div', { class: 'c' }, n, el('div', { class: 'sub', text: label }))); } }

  /* ── dials: a cream face, engraved ticks, a red needle ── */
  function dialSVG(o) {
    const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
    s.setAttribute('viewBox', '0 0 200 132'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', o.label);
    s.append(mk('rect', { x: 4, y: 4, width: 192, height: 124, rx: 10, fill: '#0b0c0b' }), mk('path', { d: 'M18 112 A86 86 0 1 1 182 112 Z', fill: '#E8DCC0' }));
    const ang = f => (-120 + 240 * f) * D2R, pt = (f, r) => [100 + r * Math.sin(ang(f)), 100 - r * Math.cos(ang(f))];
    for (const z of o.zones || []) { const [a0, a1] = [o.frac(z[0]), o.frac(z[1])], p0 = pt(a0, 74), p1 = pt(a1, 74); s.append(mk('path', { d: `M${p0[0]} ${p0[1]} A74 74 0 ${a1 - a0 > 0.5 ? 1 : 0} 1 ${p1[0]} ${p1[1]}`, stroke: z[2], 'stroke-width': 7, fill: 'none', opacity: 0.85 })); }
    for (const t of o.ticks) { const f = o.frac(t[0]), a = pt(f, 79), b = pt(f, t[1] ? 66 : 72); s.append(mk('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#1a1712', 'stroke-width': t[1] ? 2 : 1 }));
      if (t[1]) { const q = pt(f, 54), tx = mk('text', { x: q[0], y: q[1] + 3.5, 'text-anchor': 'middle', 'font-size': 10, 'font-family': 'IBM Plex Mono, monospace', fill: '#1a1712' }); tx.textContent = t[1]; s.append(tx); } }
    const u = mk('text', { x: 100, y: 84, 'text-anchor': 'middle', 'font-size': 8.5, 'letter-spacing': 1.4, 'font-family': 'Archivo, sans-serif', fill: '#5b5242' }); u.textContent = o.unit.toUpperCase(); s.append(u);
    const g = mk('g', { class: 'needle' }); g.append(mk('line', { x1: 100, y1: 108, x2: 100, y2: 30, stroke: '#C8311C', 'stroke-width': 2.2, 'stroke-linecap': 'round' }), mk('circle', { cx: 100, cy: 100, r: 6, fill: '#2a2620' }), mk('circle', { cx: 100, cy: 100, r: 2.2, fill: '#C8311C' }));
    s.append(g); s.append(mk('rect', { x: 18, y: 104, width: 164, height: 22, fill: '#0b0c0b' }));
    return [s, g];
  }
  const lin = (a, b) => v => Math.max(0, Math.min(1, (v - a) / (b - a)));
  const DIALS = [
    { id: 'vgr', label: 'Voyager 1 light-time', unit: 'hours', frac: lin(23, 25), ticks: [[23, '23'], [23.25], [23.5, '23.5'], [23.75], [24, '24'], [24.25], [24.5, '24.5'], [24.75], [25, '25']], zones: [[24, 25, '#C8311C']],
      get: () => A.probe('voyager-1', jdNow()).lightSec / 3600, fmt: v => hms(v * 3600), live: true },
    { id: 'sun', label: 'Distance to the Sun', unit: 'AU', frac: lin(0.98, 1.02), ticks: [[0.98, '.98'], [0.99, '.99'], [1, '1.00'], [1.01, '1.01'], [1.02, '1.02'], [0.985], [0.995], [1.005], [1.015]],
      zones: [[0.9833, 0.985, '#4a7fc0'], [1.015, 1.0167, '#c07a3a']], get: () => A.sun(jdNow()).dist, fmt: v => v.toFixed(5) + ' AU · ' + O.fmt.num(v * AUKM / 1e6, 2) + ' million km', live: true },
    { id: 'moon', label: 'Distance to the Moon', unit: '1000 km', frac: lin(355, 410), ticks: [[355, '355'], [365], [370, '370'], [380], [385, '385'], [395], [400, '400'], [410, '410']], zones: [[355, 362, '#4a7fc0'], [403, 410, '#c07a3a']],
      get: () => A.moon(jdNow()).distKm / 1000, fmt: v => O.fmt.num(v * 1000) + ' km · ' + (v * 1000 / C).toFixed(3) + ' s', live: true },
    { id: 'wind', label: 'Solar wind', unit: 'km/s', frac: lin(200, 900), ticks: [[200, '200'], [300], [400, '400'], [500], [600, '600'], [700], [800, '800'], [900]], zones: [[600, 900, '#E8A33A']],
      get: () => SW && SW.wind ? SW.wind.speed : null, fmt: v => Math.round(v) + ' km/s' + (SW.wind.density != null ? ' · ' + SW.wind.density + ' /cm³' : '') },
    { id: 'kp', label: 'Planetary K index', unit: 'Kp', frac: lin(0, 9), ticks: [[0, '0'], [1], [2], [3, '3'], [4], [5, '5'], [6], [7, '7'], [8], [9, '9']], zones: [[5, 7, '#E8A33A'], [7, 9, '#C8311C']],
      get: () => SW && SW.kp ? SW.kp.now : null, fmt: v => 'Kp ' + v.toFixed(2) + (SW.scales && SW.scales.G && SW.scales.G.scale ? ' · G' + SW.scales.G.scale : '') },
    { id: 'xr', label: 'Solar X-rays', unit: 'flare class', frac: v => Math.max(0, Math.min(1, (Math.log10(v) + 8) / 5)), ticks: [[1e-8, 'A'], [1e-7, 'B'], [1e-6, 'C'], [1e-5, 'M'], [1e-4, 'X'], [1e-3]], zones: [[1e-5, 1e-4, '#E8A33A'], [1e-4, 1e-3, '#C8311C']],
      get: () => SW && SW.xray ? SW.xray.flux : null, fmt: v => SW.xray.cls + ' · 24 h peak ' + (SW.xray.max24 ? SW.xray.max24.cls : '—') }
  ];
  const dialEls = [];
  function dials() {
    const host = $('#dials');
    for (const d of DIALS) {
      const [svg, needle] = dialSVG(d), read = el('div', { class: 'read' }), box = el('div', { class: 'dial' }, svg, el('div', { class: 'sub', text: d.label }), read);
      host.append(box); dialEls.push({ d, needle, read, box });
    }
  }
  function setDials() {
    for (const x of dialEls) {
      const v = x.d.get(), on = v != null && isFinite(v);
      x.box.classList.toggle('off', !on);
      const jitter = on && !O.reduced && !x.d.live ? (Math.random() - 0.5) * 0.8 : 0;
      x.needle.style.transform = 'rotate(' + ((on ? -120 + 240 * x.d.frac(v) : -120) + jitter).toFixed(2) + 'deg)';
      x.read.textContent = on ? x.d.fmt(v) : 'no feed yet';
    }
  }

  /* ── annunciators ── */
  const ANN = [
    ['Geomagnetic storm', () => SW && SW.kp && SW.kp.now >= 5 ? (SW.kp.now >= 7 ? 'red blink' : 'amber') : null],
    ['Flare M or X', () => SW && SW.xray ? (/^X/.test(SW.xray.cls) ? 'red blink' : /^M/.test(SW.xray.cls) ? 'amber' : null) : null],
    ['Fast solar wind', () => SW && SW.wind && SW.wind.speed > 600 ? 'amber' : null],
    ['Field south', () => SW && SW.mag && SW.mag.bz < -10 ? 'amber' : null],
    ['Launch < 24 h', () => { const t = nextLaunch(); return t != null && t < 864e5 ? (t < 3600e3 ? 'green blink' : 'green') : null; }],
    ['Close pass < 1 LD', () => NEO && NEO.items && NEO.items.some(n => n.ld < 1 && Math.abs(new Date(n.when) - Date.now()) < 7 * 864e5) ? 'amber' : null],
    ['Voyager 1 past a light-day', () => A.probe('voyager-1', jdNow()).lightSec > 86400 ? 'green' : null],
    ['DSN link to Voyager', () => DSN && DSN.stations && DSN.stations.some(s => s.dishes.some(d => d.targets.some(t => /voyager/i.test(t.name)))) ? 'green' : null],
    ['Full Moon', () => A.moonPhase(jdNow()).illum > 0.97 ? 'green' : null],
    ['New Moon', () => A.moonPhase(jdNow()).illum < 0.03 ? 'green' : null],
    ['Station elements', () => issRec ? 'green' : null],
    ['Feeds stale', () => recs.some(r => !r.at || Date.now() - new Date(r.at) > 12 * 3600e3) ? 'amber' : null]
  ];
  const annEls = [];
  function ann() { const host = $('#ann'); for (const [label] of ANN) { const n = el('div', { class: 'lens', text: label }); host.append(n); annEls.push(n); } }
  function setAnn() { ANN.forEach(([, f], i) => { const s = f(); annEls[i].className = 'lens' + (s ? ' on ' + s : ''); annEls[i].title = s ? 'on' : 'off'; }); }
  function nextLaunch() { const up = ((LN && LN.upcoming) || []).map(l => new Date(l.net) - Date.now()).filter(t => t > -3600e3 && !isNaN(t)); return up.length ? Math.min(...up) : null; }

  /* ── the scope: Earth in phosphor, night where it is night, the station where it is ── */
  const cv = $('#scope'), cx = cv.getContext('2d'), CW = cv.width, CH = cv.height;
  let land = null, issRec = null, sats = [];
  const night = document.createElement('canvas'); night.width = 360; night.height = 180;
  function loadLand() {
    const img = new Image();
    img.onload = () => {
      const t = document.createElement('canvas'); t.width = CW; t.height = CH; const x = t.getContext('2d'); x.drawImage(img, 0, 0, CW, CH);
      const d = x.getImageData(0, 0, CW, CH), out = x.createImageData(CW, CH);
      for (let i = 0; i < d.data.length; i += 4) { const L = d.data[i] / 255, cst = d.data[i + 1] / 255, lights = d.data[i + 2] / 255;
        out.data[i] = 30 * L + 120 * cst; out.data[i + 1] = 70 * L + 255 * cst; out.data[i + 2] = 45 * L + 170 * cst; out.data[i + 3] = 255; }
      x.putImageData(out, 0, 0); land = t; draw();
    };
    img.src = 'data/catalog/earth.webp';
  }
  const X = lon => ((lon + 180) / 360 * CW + CW) % CW, Y = lat => (90 - lat) / 180 * CH;
  function draw() {
    const jd = jdNow(); cx.fillStyle = '#020604'; cx.fillRect(0, 0, CW, CH);
    if (land) cx.drawImage(land, 0, 0);
    /* graticule */
    cx.strokeStyle = 'rgba(124,255,178,.10)'; cx.lineWidth = 1;
    for (let lo = -150; lo <= 180; lo += 30) { cx.beginPath(); cx.moveTo(X(lo), 0); cx.lineTo(X(lo), CH); cx.stroke(); }
    for (let la = -60; la <= 60; la += 30) { cx.beginPath(); cx.moveTo(0, Y(la)); cx.lineTo(CW, Y(la)); cx.stroke(); }
    /* night: the Sun's altitude everywhere, from the point it is overhead */
    const ss = A.subsolar(jd), sd = ss.lat * D2R, nx = night.getContext('2d'), im = nx.createImageData(360, 180);
    for (let j = 0; j < 180; j++) { const la = (89.5 - j) * D2R; for (let i = 0; i < 360; i++) { const lo = (i - 179.5) * D2R, ce = Math.sin(la) * Math.sin(sd) + Math.cos(la) * Math.cos(sd) * Math.cos(lo - ss.lon * D2R);
      const alt = Math.asin(Math.max(-1, Math.min(1, ce))) / D2R, a = alt > 0 ? 0 : alt < -18 ? 0.72 : 0.72 * (-alt / 18) ** 0.7, o = (j * 360 + i) * 4; im.data[o + 3] = a * 255; } }
    nx.putImageData(im, 0, 0); cx.imageSmoothingEnabled = true; cx.drawImage(night, 0, 0, CW, CH);
    /* the Sun and the Moon overhead */
    const m = A.moon(jd), mlon = ((m.ra - A.gmst(jd) + 540) % 360) - 180;
    mark(ss.lon, ss.lat, '#FFD27A', 'SUN OVERHEAD', 9, true); mark(mlon, m.dec, '#E8DCC0', 'MOON OVERHEAD', 7, false, Math.abs(X(mlon) - X(ss.lon)) < 330 && Math.abs(m.dec - ss.lat) < 12);
    /* the station, if today's elements are on hand */
    const rd = O.clear($('#scopeRead'));
    rd.append(el('span', { text: 'SUBSOLAR ' + fmtLL(ss.lat, ss.lon) }), el('span', { text: 'SUBLUNAR ' + fmtLL(m.dec, mlon) }));
    if (issRec) {
      const now = Date.now(); cx.strokeStyle = 'rgba(255,138,61,.75)'; cx.lineWidth = 2.5; cx.setLineDash([]); let prev = null;
      for (let t = -46; t <= 92; t += 1) { const g = geo(issRec, new Date(now + t * 60e3)); if (!g) continue; const p = [X(g.lon), Y(g.lat)];
        cx.globalAlpha = t < 0 ? 0.35 : 0.9; if (prev && Math.abs(p[0] - prev[0]) < CW / 2) { cx.beginPath(); cx.moveTo(prev[0], prev[1]); cx.lineTo(p[0], p[1]); cx.stroke(); } prev = p; }
      cx.globalAlpha = 1;
      const g = geo(issRec, new Date(now)); if (g) { mark(g.lon, g.lat, '#FF8A3D', 'ISS', 8, true); rd.append(el('span', { text: 'ISS ' + fmtLL(g.lat, g.lon) + ' · ' + g.alt.toFixed(0) + ' KM · ' + g.v.toFixed(2) + ' KM/S' })); }
      for (const s of sats) { const q = geo(s.rec, new Date(now)); if (q) mark(q.lon, q.lat, '#7CFFB2', s.name, 5); }
      rd.append(el('span', { class: 'dim', text: 'ELEMENTS ' + O.fmt.ago(new Date(TLE.fetched)).toUpperCase() }));
    } else rd.append(el('span', { class: 'dim', text: 'STATION TRACK · AWAITING TODAY’S ORBITAL ELEMENTS' }));
  }
  function mark(lon, lat, col, label, r, glow, below) {
    const x = X(lon), y = Y(lat); cx.save(); cx.shadowColor = col; cx.shadowBlur = glow ? 18 : 8; cx.strokeStyle = col; cx.fillStyle = col; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.stroke(); cx.beginPath(); cx.arc(x, y, 2.4, 0, Math.PI * 2); cx.fill();
    cx.shadowBlur = 0; cx.font = '600 15px "IBM Plex Mono", monospace'; cx.fillText(label, x + r + 6 > CW - 150 ? x - r - 6 - cx.measureText(label).width : x + r + 6, below ? y + r + 18 : y - r - 4); cx.restore();
  }
  const fmtLL = (la, lo) => Math.abs(la).toFixed(1) + '°' + (la >= 0 ? 'N' : 'S') + ' ' + Math.abs(lo).toFixed(1) + '°' + (lo >= 0 ? 'E' : 'W');
  function geo(rec, date) {
    try { const pv = SAT.propagate(rec, date); if (!pv || !pv.position) return null; const g = SAT.eciToGeodetic(pv.position, SAT.gstime(date)), v = pv.velocity;
      return { lat: SAT.degreesLat(g.latitude), lon: SAT.degreesLong(g.longitude), alt: g.height, v: Math.hypot(v.x, v.y, v.z) }; } catch (e) { return null; }
  }

  /* ── the Deep Space Network ── */
  function dsn() {
    const host = O.clear($('#dsn'));
    if (!DSN || !DSN.stations || !DSN.stations.length) { host.append(el('div', { class: 'off-msg', text: 'LINK DOWN · THE DSN FEED ARRIVES WITH THE FIRST DAILY REFRESH' })); return; }
    for (const s of DSN.stations) {
      host.append(el('div', { class: 'site' }, el('div', { class: 'sub', text: s.name }), s.dishes.length ? s.dishes.map(d => {
        const t = d.targets.filter(x => x.name), on = t.length > 0, r = t.find(x => x.rtlt);
        return el('div', { class: 'dish' }, el('span', null, el('span', { class: 'led' + (on ? ' on' : '') }), d.name), el('span', { class: 't', text: on ? t.map(x => x.name).join(', ') : 'idle' }),
          el('span', { class: 'r', text: r ? 'light ' + hms(r.rtlt / 2) + ' each way' : d.down.length ? d.down[0].band + ' band' : '' }));
      }) : el('div', { class: 'dish' }, el('span', { text: '—' }), el('span', { class: 't', text: 'no dishes reported' }), el('span'))));
    }
    host.append(el('div', { class: 'stamps' }, O.stamp('DSN Now', DSN.fetched, 8)));
  }

  /* ── escape trajectories ── */
  const pRows = [];
  function probes() {
    const t = $('#probes'), jd = jdNow();
    t.append(el('thead', null, el('tr', null, ['Craft', 'From the Sun', 'From Earth', 'Light, one way', 'Speed', 'Launched', 'Status'].map(h => el('th', { text: h })))));
    const tb = el('tbody'); t.append(tb);
    for (const id in A.PROBES) {
      const P = A.PROBES[id], lt = el('td', { class: 'lt' }), sun = el('td'), earth = el('td');
      tb.append(el('tr', null, el('td', null, el('a', { href: 'ladder.html#' + id, text: P.name })), sun, earth, lt, el('td', { text: P.kms.toFixed(1) + ' km/s' }), el('td', { text: P.launched }),
        el('td', { class: 'q', text: P.silent ? 'silent since ' + P.silent.slice(0, 4) : 'in contact' })));
      pRows.push({ id, P, lt, sun, earth });
    }
    $('#probeNote').textContent = 'Voyager 1 is pinned to NASA’s figure for one light-day from Earth at 10:16:07 UTC on 18 November 2026. The others (marked ≈) are straight-line escapes from published distances and speeds, good to a fraction of an AU. Earth’s own orbit makes every Earth distance swing through the year.';
    setProbes();
  }
  function setProbes() { const jd = jdNow(); for (const r of pRows) { const p = A.probe(r.id, jd), q = r.P.approx ? '≈ ' : ''; r.sun.textContent = q + p.helioAU.toFixed(2) + ' AU'; r.earth.textContent = q + p.dist.toFixed(2) + ' AU'; r.lt.textContent = q + hms(p.lightSec) + (p.lightSec >= 86400 ? ' +1 d' : ''); } }

  /* ── the chart recorder ── */
  function recorder() {
    const c = $('#rec'), x = c.getContext('2d'), W = c.width, H = c.height;
    x.fillStyle = '#e8dcc0'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(120,90,60,.25)'; x.lineWidth = 1;
    for (let k = 0; k <= 9; k++) { const y = H - 26 - k * (H - 46) / 9; x.beginPath(); x.moveTo(36, y); x.lineTo(W - 8, y); x.stroke(); x.fillStyle = '#6d5a44'; x.font = '13px "IBM Plex Mono", monospace'; x.fillText(String(k), 14, y + 4); }
    const S = SW && SW.kp && SW.kp.series;
    if (!S || !S.length) { x.fillStyle = '#8a3a22'; x.font = '600 16px "IBM Plex Mono", monospace'; x.fillText('NO TRACE · AWAITING NOAA FEED', W / 2 - 150, H / 2); return; }
    const bw = (W - 50) / S.length;
    S.forEach(([t, kp], i) => { const h = kp * (H - 46) / 9, X0 = 40 + i * bw; x.fillStyle = kp >= 7 ? '#a0281a' : kp >= 5 ? '#c8781c' : '#5d4a36'; x.fillRect(X0, H - 26 - h, bw - 3, h);
      if (i % 8 === 0) { x.fillStyle = '#6d5a44'; x.font = '12px "IBM Plex Mono", monospace'; x.fillText(new Date(t).toISOString().slice(5, 10), X0, H - 8); } });
    O.clear($('#recStamp')).append(O.stamp('NOAA SWPC', SW.fetched, 8));
  }

  /* ── go ── */
  clocks(); dials(); ann(); probes(); loadLand(); setDials(); setAnn(); draw();
  Promise.all([O.load('data/spaceweather.json'), O.load('data/launches.json'), O.load('data/neo.json'), O.load('data/dsn.json'), O.load('data/tle.json')]).then(([sw, ln, neo, ds, tle]) => {
    SW = sw && sw.fetched ? sw : null; LN = ln; NEO = neo && neo.fetched ? neo : null; DSN = ds && ds.fetched ? ds : null; TLE = tle && tle.fetched ? tle : null;
    recs = [sw, ln, neo, ds, tle].map(d => ({ at: d && d.fetched }));
    if (TLE && SAT && Date.now() - new Date(TLE.fetched) < 7 * 864e5) {
      const iss = TLE.sats.find(s => s.norad === 25544); if (iss) try { issRec = SAT.twoline2satrec(iss.l1, iss.l2); } catch (e) { issRec = null; }
      for (const s of TLE.sats.filter(s => s.norad === 48274 || s.norad === 20580)) try { sats.push({ name: s.norad === 20580 ? 'HUBBLE' : 'TIANGONG', rec: SAT.twoline2satrec(s.l1, s.l2) }); } catch (e) { /* skip */ }
    }
    setDials(); setAnn(); dsn(); recorder(); draw();
  });
  setInterval(() => { for (const [n, f] of clockEls) setNixie(n, f()); setProbes(); setDials(); }, 1000);
  setInterval(() => { setAnn(); draw(); }, 4000);
  O.footer(document.body, ['Computed: clocks, Sun and Moon distances, subsolar and sublunar points, probe distances. Fetched: space weather (NOAA SWPC), orbital elements (CelesTrak), Deep Space Network (NASA DSN Now), launches, close approaches.']);
})();

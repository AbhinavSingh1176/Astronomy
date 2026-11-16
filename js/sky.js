/* OWLT · sky.js — the Observatory: the sky above a place on Earth, for any moment in the next day, and an almanac for tonight.
   Your location never leaves the browser: it is guessed from your time zone, picked from a list, or read from the device on request. */
(function () {
  'use strict';
  const O = window.OWLT, A = window.ASTRO, $ = O.$, el = O.el, SAT = window.satellite, D2R = Math.PI / 180;
  O.nav();
  let LOC = O.store.get('loc', null), CITIES = [], NAMED = [], SKYS = null, CONS = [], MES = [], TLE = null, issRec = null;
  let offset = 0, lines = true, names = true, focus = null, drawn = [];
  const cv = $('#sky'), cx = cv.getContext('2d'), SZ = cv.width, R = SZ * 0.446, CX = SZ / 2, CY = SZ / 2;
  const when = () => new Date(Date.now() + offset * 60e3), jdAt = d => A.jdOf(d);
  const fmtT = d => d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtDT = d => d ? d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  /* ── where you are ── */
  function guessLoc() {
    let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* none */ }
    const city = tz.split('/').pop().replace(/_/g, ' ').toLowerCase(), hit = CITIES.find(c => c[3].toLowerCase() === city);
    if (hit) return { name: hit[3] + ', ' + hit[4], lat: hit[1], lon: hit[0], guessed: true };
    const lonG = -new Date().getTimezoneOffset() / 60 * 15, near = CITIES.filter(c => Math.abs(c[0] - lonG) < 8).sort((a, b) => b[2] - a[2])[0];
    return near ? { name: 'near ' + near[3] + ', ' + near[4], lat: near[1], lon: near[0], guessed: true } : { name: 'Greenwich, United Kingdom', lat: 51.48, lon: 0, guessed: true };
  }
  function showLoc() {
    O.clear($('#loc')).append(el('span', null, 'Sky above ', el('b', { text: LOC.name }), ' · ' + Math.abs(LOC.lat).toFixed(2) + '°' + (LOC.lat >= 0 ? 'N' : 'S') + ' ' + Math.abs(LOC.lon).toFixed(2) + '°' + (LOC.lon >= 0 ? 'E' : 'W')),
      LOC.guessed ? el('span', { text: 'guessed from your time zone' }) : null, el('button', { type: 'button', onclick: () => { const p = $('#picker'); p.hidden = !p.hidden; if (!p.hidden) $('#cityQ').focus(); } }, 'Change'),
      el('span', { text: 'Times are on your device’s clock.' }));
  }
  function setLoc(l) { LOC = l; O.store.set('loc', l); $('#picker').hidden = true; showLoc(); draw(); almanac(); }
  function picker() {
    const q = $('#cityQ'), ul = $('#cityL');
    const list = s => { O.clear(ul); s = s.trim().toLowerCase(); const hits = (s ? CITIES.filter(c => c[3].toLowerCase().includes(s) || c[4].toLowerCase().startsWith(s)) : CITIES).slice(0, 40);
      for (const c of hits) ul.append(el('li', null, el('button', { type: 'button', onclick: () => setLoc({ name: c[3] + ', ' + c[4], lat: c[1], lon: c[0] }) }, c[3] + ', ' + c[4]))); };
    q.addEventListener('input', () => list(q.value)); list('');
    $('#geo').addEventListener('click', () => {
      const msg = $('#geoMsg'); if (!navigator.geolocation) { msg.textContent = 'This browser cannot share a location.'; return; }
      msg.textContent = 'Asking…';
      navigator.geolocation.getCurrentPosition(p => setLoc({ name: 'your location', lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }),
        () => { msg.textContent = 'The location was not shared. Pick a city instead.'; }, { timeout: 10000, maximumAge: 3600e3 });
    });
  }

  /* ── projection: altitude and azimuth to the chart; north up, east left ── */
  const proj = (alt, az) => { const r = (90 - alt) / 90 * R, a = az * D2R; return [CX - r * Math.sin(a), CY - r * Math.cos(a)]; };
  function altaz(ra, dec, lst, sl, cl) { const H = (lst - ra) * D2R, d = dec * D2R, sd = Math.sin(d), cd = Math.cos(d), ch = Math.cos(H);
    const alt = Math.asin(sl * sd + cl * cd * ch), az = Math.atan2(-cd * Math.sin(H), sd * cl - cd * ch * sl); return [alt / D2R, ((az / D2R) + 360) % 360]; }
  const bodies = jd => {
    const out = [], s = A.sun(jd), m = A.moon(jd);
    out.push({ n: 'Sun', ra: s.ra, dec: s.dec, mag: -26.7, kind: 'sun' }, { n: 'Moon', ra: m.ra, dec: m.dec, mag: -12, kind: 'moon', par: true });
    for (const p of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) { const g = A.planet(p, jd); out.push({ n: p[0].toUpperCase() + p.slice(1), ra: g.ra, dec: g.dec, mag: g.mag, kind: 'planet', slug: p }); }
    return out;
  };

  /* ── the chart ── */
  function draw() {
    if (!LOC || !SKYS) return;
    const d = when(), jd = jdAt(d), lst = (A.gmst(jd) + LOC.lon + 360) % 360, sl = Math.sin(LOC.lat * D2R), cl = Math.cos(LOC.lat * D2R);
    const sun = A.sun(jd), [salt] = altaz(sun.ra, sun.dec, lst, sl, cl);
    const dark = salt < -18 ? 1 : salt > 0 ? 0 : -salt / 18;
    cx.clearRect(0, 0, SZ, SZ); cx.save(); cx.beginPath(); cx.arc(CX, CY, R, 0, Math.PI * 2); cx.clip();
    const g = cx.createRadialGradient(CX, CY, 0, CX, CY, R), day = [38, 70, 120], nightC = [5, 8, 18], mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const z = mix(day, nightC, dark), h = mix([90, 120, 160], [16, 18, 30], dark);
    g.addColorStop(0, `rgb(${z})`); g.addColorStop(1, `rgb(${h})`); cx.fillStyle = g; cx.fillRect(0, 0, SZ, SZ);
    /* grid */
    cx.strokeStyle = 'rgba(176,141,87,.16)'; cx.lineWidth = 1.5;
    for (const a of [30, 60]) { cx.beginPath(); cx.arc(CX, CY, (90 - a) / 90 * R, 0, Math.PI * 2); cx.stroke(); }
    for (let az = 0; az < 360; az += 30) { const [x, y] = proj(0, az); cx.beginPath(); cx.moveTo(CX, CY); cx.lineTo(x, y); cx.stroke(); }
    drawn = [];
    /* constellation figures */
    const starVis = 1 - dark * 0, limit = 6.2 - (1 - dark) * 5.5;
    if (lines) for (const c of CONS) {
      const on = focus && focus.con === c[0]; cx.strokeStyle = on ? 'rgba(79,216,196,.85)' : 'rgba(143,165,217,' + (0.18 + 0.2 * dark) + ')'; cx.lineWidth = on ? 3 : 1.6;
      for (const L of c[2]) { cx.beginPath(); let pen = false;
        for (let i = 0; i < L.length; i += 2) { const [al, az] = altaz(L[i], L[i + 1], lst, sl, cl); if (al < -2) { pen = false; continue; } const [x, y] = proj(Math.max(al, -2), az); if (pen) cx.lineTo(x, y); else cx.moveTo(x, y); pen = true; }
        cx.stroke(); }
    }
    /* stars */
    const n = SKYS.n;
    for (let i = 0; i < n; i++) {
      const m = SKYS.mag[i]; if (m > limit) continue;
      const [al, az] = altaz(SKYS.ra[i], SKYS.dec[i], lst, sl, cl); if (al < 0) continue;
      const ext = al < 10 ? (10 - al) * 0.12 : 0, mm = m + ext; if (mm > limit) continue;
      const [x, y] = proj(al, az), r = Math.max(1.1, (6.6 - mm) * 1.15);
      cx.fillStyle = SKYS.col[i]; cx.globalAlpha = Math.min(1, 0.35 + (limit - mm) / 4); cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
    }
    cx.globalAlpha = 1;
    /* named bright stars */
    cx.font = '500 21px Archivo, sans-serif'; cx.textBaseline = 'middle';
    for (const s of NAMED) {
      const [al, az] = altaz(s.ra, s.dec, lst, sl, cl); if (al < 2) continue; const [x, y] = proj(al, az);
      drawn.push({ x, y, n: s.name, sub: 'mag ' + s.mag + ' · ' + O.fmt.ly(s.ly) + ' · alt ' + al.toFixed(0) + '°', slug: s.slug });
      const on = focus && focus.slug === s.slug;
      if (on) { cx.strokeStyle = '#4FD8C4'; cx.lineWidth = 3; cx.beginPath(); cx.arc(x, y, 16, 0, Math.PI * 2); cx.stroke(); }
      if (names && (s.mag < 1.6 || on) && dark > 0.3) { cx.fillStyle = on ? '#4FD8C4' : 'rgba(255,235,196,.72)'; cx.fillText(s.name, x + 10, y); }
    }
    /* constellation names */
    if (names && lines) { cx.font = '600 18px Archivo, sans-serif'; cx.fillStyle = 'rgba(143,165,217,.55)'; cx.textAlign = 'center';
      for (const c of CONS) { if (!c.cen) continue; const [al, az] = altaz(c.cen[0], c.cen[1], lst, sl, cl); if (al < 8) continue; const [x, y] = proj(al, az);
        cx.fillStyle = focus && focus.con === c[0] ? '#4FD8C4' : 'rgba(143,165,217,.55)'; cx.fillText(c[1].toUpperCase(), x, y); }
      cx.textAlign = 'left'; }
    /* Sun, Moon, planets */
    for (const b of bodies(jd)) {
      let [al, az] = altaz(b.ra, b.dec, lst, sl, cl); if (b.par) al -= 0.95 * Math.cos(al * D2R);       /* the Moon is near enough for parallax */
      if (al < -0.5) continue; const [x, y] = proj(Math.max(al, 0), az);
      drawn.push({ x, y, n: b.n, sub: (b.kind === 'planet' ? 'mag ' + b.mag.toFixed(1) + ' · ' : '') + 'alt ' + al.toFixed(0) + '° · az ' + az.toFixed(0) + '°', slug: b.slug || b.n.toLowerCase() });
      if (b.kind === 'sun') { const gg = cx.createRadialGradient(x, y, 0, x, y, 60); gg.addColorStop(0, 'rgba(255,230,170,1)'); gg.addColorStop(0.2, 'rgba(255,210,120,.6)'); gg.addColorStop(1, 'rgba(255,200,100,0)'); cx.fillStyle = gg; cx.beginPath(); cx.arc(x, y, 60, 0, Math.PI * 2); cx.fill(); }
      else if (b.kind === 'moon') moonDisc(x, y, 15, A.moonPhase(jd));
      else { cx.fillStyle = { Mars: '#FF9C7A', Jupiter: '#F3DDB6', Saturn: '#E9D29A', Venus: '#FFF6DE', Mercury: '#D9CDB8', Uranus: '#B8E3EA', Neptune: '#8FB2FF' }[b.n] || '#fff';
        const r = Math.max(3.5, (2 - b.mag) * 1.6 + 5); cx.shadowColor = cx.fillStyle; cx.shadowBlur = 14; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill(); cx.shadowBlur = 0; }
      if (names) { cx.font = '600 23px Archivo, sans-serif'; cx.fillStyle = b.kind === 'planet' ? '#FFB13B' : '#FFEBC4'; cx.fillText(b.n, x + 16, y - 2); }
    }
    cx.restore();
    /* horizon and cardinal points */
    cx.strokeStyle = 'rgba(176,141,87,.8)'; cx.lineWidth = 3; cx.beginPath(); cx.arc(CX, CY, R, 0, Math.PI * 2); cx.stroke();
    cx.font = '700 30px Archivo, sans-serif'; cx.fillStyle = '#E8DCC0'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    for (const [lab, az] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) { const r = R + 46, a = az * D2R; cx.fillText(lab, CX - r * Math.sin(a), CY - r * Math.cos(a)); }
    cx.font = '500 15px "IBM Plex Mono", monospace'; cx.fillStyle = 'rgba(232,220,192,.7)';
    for (let az = 0; az < 360; az += 10) { if (az % 90 === 0) continue; const a = az * D2R, r1 = R + 6, r2 = R + (az % 30 === 0 ? 22 : 13); cx.strokeStyle = 'rgba(232,220,192,.6)'; cx.lineWidth = 2;
      cx.beginPath(); cx.moveTo(CX - r1 * Math.sin(a), CY - r1 * Math.cos(a)); cx.lineTo(CX - r2 * Math.sin(a), CY - r2 * Math.cos(a)); cx.stroke(); }
    cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    $('#scrubT').textContent = offset ? fmtDT(d) : 'now · ' + fmtT(d);
  }
  function moonDisc(x, y, r, ph) {
    const a = ph.angle * D2R; cx.save(); cx.fillStyle = '#26221c'; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#F2E6C9'; cx.beginPath();
    const k = Math.cos(a), waxing = ph.angle < 180;                         /* the lit limb faces the Sun: right when waxing (seen from the north) */
    cx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !waxing); cx.ellipse(x, y, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing ? true : false);
    cx.fill(); cx.restore();
  }

  /* ── tooltips ── */
  function bindTips() {
    const tip = $('#tip'), mount = $('#mount');
    cv.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect(), k = SZ / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
      let best = null, bd = 26 * k; for (const d of drawn) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = d; } }
      if (!best) { tip.hidden = true; return; }
      tip.hidden = false; O.clear(tip).append(best.n, el('small', { text: best.sub })); tip.style.left = (e.clientX - mount.getBoundingClientRect().left) + 'px'; tip.style.top = (e.clientY - mount.getBoundingClientRect().top) + 'px';
    });
    cv.addEventListener('pointerleave', () => { tip.hidden = true; });
    cv.addEventListener('click', e => { const r = cv.getBoundingClientRect(), k = SZ / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
      let best = null, bd = 26 * k; for (const d of drawn) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = d; } } if (best && best.slug) location.hash = best.slug; });
  }

  /* ── tonight's almanac ── */
  const SHOWERS = [['Quadrantids', 1, 3, 110, 230, 49], ['Lyrids', 4, 22, 18, 271, 34], ['Eta Aquariids', 5, 6, 50, 338, -1], ['Southern Delta Aquariids', 7, 30, 25, 340, -16], ['Perseids', 8, 12, 100, 48, 58],
    ['Draconids', 10, 8, 10, 262, 54], ['Orionids', 10, 21, 20, 95, 16], ['Southern Taurids', 11, 5, 5, 52, 15], ['Northern Taurids', 11, 12, 5, 58, 22], ['Leonids', 11, 17, 15, 152, 22], ['Geminids', 12, 14, 150, 112, 33], ['Ursids', 12, 22, 10, 217, 76]];
  function events(posFn, h0, jd0) { return A.crossings(posFn, LOC.lat, LOC.lon, jd0, h0).map(c => ({ d: A.dateOf(c.jd), rising: c.rising })); }
  function almanac() {
    if (!LOC) return;
    const host = O.clear($('#alm')), now = new Date(), jd0 = jdAt(now), sunF = jd => A.sun(jd), moonF = jd => A.moon(jd);
    const first = (list, rising) => (list.find(x => x.rising === rising) || {}).d;
    const sEv = events(sunF, -0.833, jd0), civ = events(sunF, -6, jd0), nau = events(sunF, -12, jd0), ast = events(sunF, -18, jd0);
    host.append(el('h2', { text: 'The Sun · next 24 hours' }), el('table', null, el('tbody', null,
      row('Sunset', fmtT(first(sEv, false))), row('Civil dusk', fmtT(first(civ, false)), 'the sky is dark enough for bright stars'), row('Nautical dusk', fmtT(first(nau, false))),
      row('Astronomical dark', fmtT(first(ast, false)), 'no trace of sunlight left'), row('Astronomical dawn', fmtT(first(ast, true))), row('Sunrise', fmtT(first(sEv, true))))));
    if (!sEv.length) host.append(el('p', { class: 'note', text: A.sun(jd0).dec * LOC.lat > 0 && Math.abs(LOC.lat) > 60 ? 'The Sun does not set here today.' : 'The Sun does not rise here today.' }));
    const ph = A.moonPhase(jd0), mEv = events(moonF, 0.125, jd0);
    host.append(el('h2', { text: 'The Moon' }), el('table', null, el('tbody', null, row('Phase', ph.name, Math.round(ph.illum * 100) + '% lit, ' + A.moonAge(jd0).toFixed(1) + ' days since new'),
      row('Moonrise', fmtDT(first(mEv, true))), row('Moonset', fmtDT(first(mEv, false))), row('Distance', O.fmt.num(A.moon(jd0).distKm) + ' km', (A.moon(jd0).distKm / A.C_KMS).toFixed(2) + ' light-seconds'))));
    /* planets: when each is up while the sky is dark */
    /* tonight: the dark spell under way now, or the next one */
    const sunAlt = jd => { const s = A.sun(jd); return A.altaz(s.ra, s.dec, LOC.lat, LOC.lon, jd).alt; };
    let n0 = null, n1 = null; for (let k = 0; k <= 30 * 6; k++) { const jd = jd0 + k / 144; if (sunAlt(jd) < -8) { if (n0 == null) n0 = jd; n1 = jd; } else if (n0 != null) break; }
    const tb = el('tbody');
    for (const p of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
      let start = null, end = null, best = -99, bestT = null;
      if (n0 != null) for (let jd = n0; jd <= n1 + 1e-6; jd += 1 / 144) { const g = A.planet(p, jd), a = A.altaz(g.ra, g.dec, LOC.lat, LOC.lon, jd).alt;
        if (a > 8) { if (start == null) start = jd; end = jd; if (a > best) { best = a; bestT = jd; } } }
      const g = A.planet(p, jd0), faint = g.mag > 6 ? ' (needs binoculars or a telescope)' : '';
      tb.append(start == null ? row(cap(p), 'not in a dark sky', 'mag ' + g.mag.toFixed(1) + faint) :
        row(cap(p), fmtT(A.dateOf(start)) + '–' + fmtT(A.dateOf(end)), 'mag ' + g.mag.toFixed(1) + ', highest ' + best.toFixed(0) + '° at ' + fmtT(A.dateOf(bestT)) + faint));
    }
    host.append(el('h2', { text: 'Planets in a dark sky tonight' }), n0 != null ? el('p', { class: 'note', style: { marginTop: '6px', fontSize: '13px', color: 'var(--faint)' }, text: 'Dark enough from ' + fmtT(A.dateOf(n0)) + ' to ' + fmtT(A.dateOf(n1)) + '; planets listed while more than 8° up.' }) : el('p', { class: 'note', text: 'The sky does not get properly dark here in the next day.' }), el('table', null, tb));
    /* the space station */
    host.append(el('h2', { text: 'Space station passes' }));
    if (issRec && SAT) { const ps = passes(); host.append(ps.length ? el('table', null, el('tbody', null, ps.slice(0, 5).map(p => row(fmtDT(p.start), p.vis ? 'visible' : 'in shadow or daylight', 'up to ' + p.max.toFixed(0) + '° · ' + Math.round((p.end - p.start) / 60e3) + ' min · from ' + compass(p.azS) + ' to ' + compass(p.azE)))))
      : el('p', { class: 'note', text: 'No passes above 10° in the next 24 hours.' }), el('p', { class: 'note' }, O.stamp('Orbital elements, CelesTrak', TLE.fetched, 72))); }
    else host.append(el('p', { class: 'note', text: 'Pass predictions need today’s orbital elements, which arrive with the site’s first daily refresh.' }));
    /* meteors */
    const y = now.getFullYear(), active = SHOWERS.map(s => ({ s, d: Math.round((new Date(y, s[1] - 1, s[2]) - now) / 864e5) })).filter(x => Math.abs(x.d) <= (x.s[3] >= 10 ? 4 : 1));
    host.append(el('h2', { text: 'Meteors' }));
    if (active.length) for (const { s, d } of active) {
      const ra = A.altaz(s[4], s[5], LOC.lat, LOC.lon, jdAt(new Date(now.getFullYear(), now.getMonth(), now.getDate() + (now.getHours() > 12 ? 1 : 0), 4))).alt;
      host.append(el('div', { class: 'hl' }, el('b', { text: s[0] }), ' peak ' + (d === 0 ? 'around tonight' : d > 0 ? 'in about ' + d + ' day' + (d > 1 ? 's' : '') : 'about ' + -d + ' day' + (d < -1 ? 's' : '') + ' ago') + '. Up to about ' + s[3] + ' meteors an hour under a perfectly dark sky at the peak; expect far fewer. ' +
        (ra > 0 ? 'The radiant stands ' + ra.toFixed(0) + '° up at 4 a.m. here.' : 'The radiant stays low or below the horizon from here.') + (ph.illum > 0.6 ? ' Moonlight will wash out the fainter ones.' : '')));
    }
    else { const nx = SHOWERS.map(s => ({ s, t: new Date(y + (new Date(y, s[1] - 1, s[2]) < now ? 1 : 0), s[1] - 1, s[2]) })).sort((a, b) => a.t - b.t)[0];
      host.append(el('p', { class: 'note', text: 'No major shower is near its peak. Next: the ' + nx.s[0] + ', around ' + nx.t.toLocaleDateString([], { day: 'numeric', month: 'long' }) + '.' })); }
    /* something deeper: the best-placed Messier object in the dark hours */
    const darkJd = ast.length ? jdAt(first(ast, false) || now) + 1 / 24 : jd0 + 0.25, cand = MES.filter(m => m.mag && m.mag < 7.5).map(m => ({ m, a: A.altaz(m.ra, m.dec, LOC.lat, LOC.lon, darkJd).alt })).filter(x => x.a > 35).sort((a, b) => a.m.mag - b.m.mag)[0];
    if (cand) host.append(el('h2', { text: 'Worth a look tonight' }), el('p', { class: 'note' }, el('b', { text: cand.m.id + (cand.m.name ? ', ' + cand.m.name : '') }), ': a ' + cand.m.type.toLowerCase() + ' of magnitude ' + cand.m.mag + ', ' + cand.a.toFixed(0) + '° up around ' + fmtT(A.dateOf(darkJd)) + '. ' + (cand.m.ly ? 'Its light left ' + O.fmt.ly(cand.m.ly).replace('light-years', 'years') + ' ago. ' : ''), el('a', { href: 'ladder.html#' + O.slug(cand.m.id), text: 'On the Ladder' }), '.'));
  }
  const cap = s => s[0].toUpperCase() + s.slice(1), compass = az => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];
  function row(a, b, c) { return el('tr', null, el('td', null, a, c ? el('small', { text: c }) : null), el('td', { text: b })); }
  function passes() {
    const out = [], obs = { longitude: LOC.lon * D2R, latitude: LOC.lat * D2R, height: 0.1 }, t0 = Date.now(); let cur = null;
    for (let s = 0; s < 86400; s += 20) {
      const d = new Date(t0 + s * 1000), pv = SAT.propagate(issRec, d); if (!pv || !pv.position) continue;
      const la = SAT.ecfToLookAngles(obs, SAT.eciToEcf(pv.position, SAT.gstime(d))), elv = la.elevation / D2R, az = la.azimuth / D2R;
      if (elv > 10) { if (!cur) cur = { start: d, max: elv, azS: az, maxT: d, pos: pv.position }; if (elv > cur.max) { cur.max = elv; cur.maxT = d; cur.pos = pv.position; } cur.end = d; cur.azE = az; }
      else if (cur) { const jd = jdAt(cur.maxT), sn = A.sun(jd), sa = A.altaz(sn.ra, sn.dec, LOC.lat, LOC.lon, jd).alt, u = A.radec2v(sn.ra, sn.dec), p = cur.pos;
        const P = [p.x, p.z, -p.y], along = P[0] * u[0] + P[1] * u[1] + P[2] * u[2], perp = Math.hypot(P[0] - along * u[0], P[1] - along * u[1], P[2] - along * u[2]);
        cur.vis = sa < -6 && (along > 0 || perp > 6371); out.push(cur); cur = null; }
    }
    return out;
  }

  /* ── focus from the address: #con-Ori, or a star's slug ── */
  function route() {
    const h = decodeURIComponent((location.hash || '').slice(1)); focus = null; const host = O.clear($('#focus'));
    if (!h) { draw(); return; }
    if (h.startsWith('con-')) { const c = CONS.find(x => x[0].toLowerCase() === h.slice(4).toLowerCase()); if (c) { focus = { con: c[0] }; describe(c[1], c.cen[0], c.cen[1], 'constellation'); } }
    else { const s = NAMED.find(x => x.slug === h) || NAMED.find(x => O.slug(x.name) === h); if (s) { focus = { slug: s.slug }; describe(s.name, s.ra, s.dec, 'star', s); }
      else { const b = bodies(jdAt(new Date())).find(x => (x.slug || x.n.toLowerCase()) === h); if (b) describe(b.n, b.ra, b.dec, b.kind); } }
    draw();
    function describe(name, ra, dec, kind, s) {
      const jd0 = jdAt(new Date()), ev = A.crossings(() => ({ ra, dec }), LOC.lat, LOC.lon, jd0, -0.5667).map(c => ({ d: A.dateOf(c.jd), rising: c.rising })), a = A.altaz(ra, dec, LOC.lat, LOC.lon, jd0).alt;
      const never = !ev.length, up = a > 0, month = new Date(2026, 2, 20 + Math.round(((ra - 135 + 360) % 360) / 360 * 365.25)).toLocaleDateString([], { month: 'long' });
      host.append(el('div', { class: 'focus-card' }, el('h3', { text: name }), el('p', null, (never ? (up ? 'Never sets from here: it circles the pole all night.' : 'Never rises from here.') :
        (up ? 'Up now, ' + a.toFixed(0) + '° above the horizon. ' : 'Below the horizon now. ') + 'Rises ' + fmtDT((ev.find(x => x.rising) || {}).d) + ', sets ' + fmtDT((ev.find(x => !x.rising) || {}).d) + '.') +
        (kind === 'constellation' || kind === 'star' ? ' Highest in the evening sky around ' + month + '.' : ''), s ? [' ', el('a', { href: 'ladder.html#' + s.slug, text: 'Its light is ' + O.fmt.ly(s.ly).replace('light-years', 'years') + ' old' }), '.'] : null)));
    }
  }

  /* ── go ── */
  Promise.all([O.load('data/catalog/cities.json'), O.load('data/catalog/sky.bin', 'bin'), O.load('data/catalog/stars.json'), O.load('data/catalog/constellations.json'), O.load('data/catalog/messier.json'), O.load('data/tle.json')]).then(([ci, sk, st, co, me, tle]) => {
    CITIES = ci || []; MES = me || [];
    if (sk) { const dv = new DataView(sk), n = dv.byteLength / 8, ra = new Float32Array(n), dec = new Float32Array(n), mag = new Float32Array(n), col = new Array(n);
      for (let i = 0; i < n; i++) { const o = i * 8; ra[i] = dv.getUint16(o, true) / 65535 * 360; dec[i] = dv.getInt16(o + 2, true) / 32767 * 90; mag[i] = dv.getInt16(o + 4, true) / 100;
        const c = A.bv2rgb(dv.getInt16(o + 6, true) / 1000); col[i] = `rgb(${Math.round(255 * (0.6 + 0.4 * c[0]))},${Math.round(255 * (0.6 + 0.4 * c[1]))},${Math.round(255 * (0.6 + 0.4 * c[2]))})`; }
      SKYS = { n, ra, dec, mag, col }; }
    if (st) NAMED = st.rows.map(r => Object.fromEntries(st.cols.map((c, i) => [c, r[i]]))).filter(s => s.mag != null && s.mag < 2.6 && !/^(HD|HIP|GJ)/.test(s.name));
    CONS = co || []; for (const c of CONS) { let x = 0, y = 0, z = 0; for (const L of c[2]) for (let i = 0; i < L.length; i += 2) { const v = A.radec2v(L[i], L[i + 1]); x += v[0]; y += v[1]; z += v[2]; } const rd = A.v2radec([x, y, z]); c.cen = [rd[0], rd[1]]; }
    if (tle && tle.fetched && SAT && Date.now() - new Date(tle.fetched) < 7 * 864e5) { TLE = tle; const iss = tle.sats.find(s => s.norad === 25544); if (iss) try { issRec = SAT.twoline2satrec(iss.l1, iss.l2); } catch (e) { issRec = null; } }
    if (!LOC) LOC = guessLoc();
    showLoc(); picker(); bindTips(); route(); almanac();
    addEventListener('hashchange', route);
  });
  $('#scrub').addEventListener('input', e => { offset = +e.target.value; draw(); });
  $('#tNow').addEventListener('click', () => { offset = 0; $('#scrub').value = 0; draw(); });
  $('#tLines').addEventListener('click', e => { lines = !lines; e.currentTarget.setAttribute('aria-pressed', lines); draw(); });
  $('#tNames').addEventListener('click', e => { names = !names; e.currentTarget.setAttribute('aria-pressed', names); draw(); });
  setInterval(() => { if (!offset) draw(); }, 30000);
  O.footer(document.body, ['Positions computed in your browser: stars from the HYG catalogue, planets from JPL elements, the Moon and Sun from Meeus. Nothing about your location is sent anywhere.']);
})();

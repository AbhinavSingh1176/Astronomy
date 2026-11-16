/* OWLT · astro.js — every number the site shows about the sky is computed here, in the browser.
   Sun: Meeus ch.25 (≈0.01°).  Moon: truncated ELP-2000/82, Meeus ch.47 (≈0.1°, ≈50 km).
   Planets: JPL "Approximate Positions of the Planets" Keplerian elements, valid 1800–2050 (≈ arcminutes).
   Galilean moons: Meeus ch.44 low-accuracy method.  Cosmology: flat ΛCDM, Planck 2018.
   Scene frame used everywhere: equatorial J2000, +Y = north celestial pole, +X = RA 0h, −Z = RA 6h. */
(function (root) {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const AU_KM = 149597870.7, C_KMS = 299792.458, LY_KM = 9460730472580.8, LY_AU = LY_KM / AU_KM;
  const LD_AU = C_KMS * 86400 / AU_KM;                       // one light-day, 173.1446 AU
  const EPS0 = 23.4392911 * D2R;                             // obliquity J2000
  const rev = x => x - Math.floor(x / 360) * 360;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const jdOf = d => d.getTime() / 86400000 + 2440587.5;
  const dateOf = jd => new Date((jd - 2440587.5) * 86400000);
  const Tof = jd => (jd - 2451545.0) / 36525;

  /* ── Sun (geocentric, of date) ── */
  function sun(jd) {
    const T = Tof(jd);
    const L0 = rev(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
    const M = rev(357.52911 + 35999.05029 * T - 0.0001537 * T * T) * D2R;
    const e = 0.016708634 - 0.000042037 * T;
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
    const tru = L0 + C, v = M + C * D2R;
    const R = 1.000001018 * (1 - e * e) / (1 + e * Math.cos(v));
    const om = (125.04 - 1934.136 * T) * D2R;
    const lam = (tru - 0.00569 - 0.00478 * Math.sin(om)) * D2R;
    const eps = (23.439291 - 0.0130042 * T + 0.00256 * Math.cos(om)) * D2R;
    return { ra: rev(Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) * R2D), dec: Math.asin(Math.sin(eps) * Math.sin(lam)) * R2D,
             dist: R, lam: rev(lam * R2D) };
  }

  /* ── Moon (geocentric, of date) ── */
  const ML = [[0,0,1,0,6288774,-20905355],[2,0,-1,0,1274027,-3699111],[2,0,0,0,658314,-2955968],[0,0,2,0,213618,-569925],
    [0,1,0,0,-185116,48888],[0,0,0,2,-114332,-3149],[2,0,-2,0,58793,246158],[2,-1,-1,0,57066,-152138],[2,0,1,0,53322,-170733],
    [2,-1,0,0,45758,-204586],[0,1,-1,0,-40923,-129620],[1,0,0,0,-34720,108743],[0,1,1,0,-30383,104755],[2,0,0,-2,15327,10321],
    [0,0,1,2,-12528,0],[0,0,1,-2,10980,79661],[4,0,-1,0,10675,-34782],[0,0,3,0,10034,-23210],[4,0,-2,0,8548,-21636],
    [2,1,-1,0,-7888,24208],[2,1,0,0,-6766,30824],[1,0,-1,0,-5163,-8379],[1,1,0,0,4987,-16675],[2,-1,1,0,4036,-12831],
    [2,0,2,0,3994,-10445],[4,0,0,0,3861,-11650],[2,0,-3,0,3665,14403],[0,1,-2,0,-2689,-7003],[2,0,-1,2,-2602,0],
    [2,-1,-2,0,2390,10056],[1,0,1,0,-2348,6322],[2,-2,0,0,2236,-9884]];
  const MB = [[0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],[2,0,-1,1,55413],[2,0,-1,-1,46271],
    [2,0,0,1,32573],[0,0,2,1,17198],[2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],[2,0,1,1,4200],
    [2,1,0,-1,-3359],[2,-1,-1,1,2463],[2,-1,0,1,2211],[2,-1,-1,-1,2065],[0,1,-1,-1,-1870],[4,0,-1,-1,1828],[0,1,0,1,-1794]];
  function moon(jd) {
    const T = Tof(jd);
    const Lp = rev(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T + T * T * T / 538841);
    const D = rev(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T * T * T / 545868) * D2R;
    const M = rev(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T) * D2R;
    const Mp = rev(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T * T * T / 69699) * D2R;
    const F = rev(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T - T * T * T / 3526000) * D2R;
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;
    let sl = 0, sr = 0, sb = 0;
    for (const t of ML) { const a = t[0] * D + t[1] * M + t[2] * Mp + t[3] * F, k = Math.abs(t[1]) === 1 ? E : Math.abs(t[1]) === 2 ? E * E : 1;
      sl += t[4] * k * Math.sin(a); sr += t[5] * k * Math.cos(a); }
    for (const t of MB) { const a = t[0] * D + t[1] * M + t[2] * Mp + t[3] * F, k = Math.abs(t[1]) === 1 ? E : 1; sb += t[4] * k * Math.sin(a); }
    const A1 = (119.75 + 131.849 * T) * D2R, A2 = (53.09 + 479264.290 * T) * D2R, A3 = (313.45 + 481266.484 * T) * D2R;
    sl += 3958 * Math.sin(A1) + 1962 * Math.sin(Lp * D2R - F) + 318 * Math.sin(A2);
    sb += -2235 * Math.sin(Lp * D2R) + 382 * Math.sin(A3) + 175 * Math.sin(A1 - F) + 175 * Math.sin(A1 + F) + 127 * Math.sin(Lp * D2R - Mp) - 115 * Math.sin(Lp * D2R + Mp);
    const lam = (Lp + sl / 1e6) * D2R, bet = sb / 1e6 * D2R, dist = 385000.56 + sr / 1000;
    const eps = (23.439291 - 0.0130042 * T) * D2R;
    const x = Math.cos(bet) * Math.cos(lam), y = Math.cos(bet) * Math.sin(lam), z = Math.sin(bet);
    return { ra: rev(Math.atan2(y * Math.cos(eps) - z * Math.sin(eps), x) * R2D), dec: Math.asin(y * Math.sin(eps) + z * Math.cos(eps)) * R2D,
             distKm: dist, lam: rev(lam * R2D), bet: bet * R2D };
  }
  const PHASES = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  function moonPhase(jd) {
    const s = sun(jd), m = moon(jd);
    const el = Math.acos(clamp(Math.cos(m.bet * D2R) * Math.cos((m.lam - s.lam) * D2R), -1, 1));
    const sd = s.dist * AU_KM, pa = Math.atan2(sd * Math.sin(el), m.distKm - sd * Math.cos(el));
    const d = rev(m.lam - s.lam);
    return { illum: (1 + Math.cos(pa)) / 2, angle: d, age: d / 360 * 29.530588, name: PHASES[Math.floor(rev(d + 22.5) / 45)], waxing: d < 180 };
  }
  /* next time the Moon's elongation from the Sun reaches `target` degrees (0 new, 90 first quarter, 180 full, 270 last) */
  function nextPhase(jd, target) {
    const f = j => { let d = rev(moonPhase(j).angle - target); return d > 180 ? d - 360 : d; };
    let a = jd, fa = f(a);
    for (let i = 0; i < 40; i++) { const b = a + 1, fb = f(b); if (fa < 0 && fb >= 0) { let lo = a, hi = b; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; } return (lo + hi) / 2; } a = b; fa = fb; }
    return null;
  }

  /* ── planets: heliocentric ecliptic J2000 from JPL approximate elements ── */
  const PL = {
    mercury: [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.25032350, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
    venus:   [0.72333566, 0.00000390, 0.00677672, -0.00004107, 3.39467605, -0.00078890, 181.97909950, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
    earth:   [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0],
    mars:    [1.52371034, 0.00001847, 0.09339410, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
    jupiter: [5.20288700, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
    saturn:  [9.53667594, -0.00125060, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794],
    uranus:  [19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939, 313.23810451, 428.48202785, 170.95427630, 0.40805281, 74.01692503, 0.04240589],
    neptune: [30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372, -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664],
    pluto:   [39.48211675, -0.00031596, 0.24882730, 0.00005170, 17.14001206, 0.00004818, 238.92903833, 145.20780515, 224.06891629, -0.04062942, 110.30393684, -0.01183482]
  };
  const PLANETS = Object.keys(PL);
  /* north poles of rotation, IAU: [RA°, Dec°] — sets the tilt of rings and moon orbits */
  const POLES = { earth: [0, 90], mars: [317.681, 52.887], jupiter: [268.057, 64.495], saturn: [40.589, 83.537], uranus: [257.311, -15.175], neptune: [299.36, 43.46], pluto: [132.993, -6.163] };
  function kepler(M, e) { let E = M + e * Math.sin(M); for (let i = 0; i < 14; i++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; } return E; }
  function orbitXYZ(a, e, I, O, wbar, M) {            // angles in radians; wbar = longitude of perihelion
    const w = wbar - O, E = kepler(M, e), xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
    return [(cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp, (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp, sw * sI * xp + cw * sI * yp];
  }
  function planetEl(name, jd) {
    const p = PL[name], T = Tof(jd);
    return { a: p[0] + p[1] * T, e: p[2] + p[3] * T, I: (p[4] + p[5] * T) * D2R, L: p[6] + p[7] * T, wb: p[8] + p[9] * T, O: (p[10] + p[11] * T) * D2R };
  }
  function helio(name, jd) {                           // → [x,y,z] AU, ecliptic J2000
    const q = planetEl(name, jd); let M = rev(q.L - q.wb); if (M > 180) M -= 360;
    return orbitXYZ(q.a, q.e, q.I, q.O, q.wb * D2R, M * D2R);
  }
  /* any body from osculating elements {a,e,i,node,peri(arg),M0,epoch(JD),period(yr)} */
  function elementsXYZ(el, jd) {
    const n = 360 / (el.period * 365.25), M = rev(el.M0 + n * (jd - el.epoch)) * D2R;
    return orbitXYZ(el.a, el.e, el.i * D2R, el.node * D2R, (el.node + el.peri) * D2R, M);
  }
  /* the whole orbit as a polyline (ecliptic AU), for drawing */
  function orbitPath(spec, jd, n) {
    const out = []; let a, e, I, O, wb;
    if (typeof spec === 'string') { const q = planetEl(spec, jd); a = q.a; e = q.e; I = q.I; O = q.O; wb = q.wb * D2R; }
    else { a = spec.a; e = spec.e; I = spec.i * D2R; O = spec.node * D2R; wb = (spec.node + spec.peri) * D2R; }
    for (let i = 0; i <= n; i++) out.push(orbitXYZ(a, e, I, O, wb, i / n * 2 * Math.PI));
    return out;
  }
  const ecl2eq = v => [v[0], v[1] * Math.cos(EPS0) - v[2] * Math.sin(EPS0), v[1] * Math.sin(EPS0) + v[2] * Math.cos(EPS0)];
  const eq2scene = v => [v[0], v[2], -v[1]];
  const ecl2scene = v => eq2scene(ecl2eq(v));
  const lonlat2ecl = (lon, lat, r) => { const a = lon * D2R, b = lat * D2R; return [r * Math.cos(b) * Math.cos(a), r * Math.cos(b) * Math.sin(a), r * Math.sin(b)]; };
  const radec2v = (ra, dec, r = 1) => { const a = ra * D2R, d = dec * D2R, c = Math.cos(d) * r; return [c * Math.cos(a), Math.sin(d) * r, -c * Math.sin(a)]; };
  const v2radec = v => { const r = Math.hypot(v[0], v[1], v[2]) || 1; return [rev(Math.atan2(-v[2], v[0]) * R2D), Math.asin(clamp(v[1] / r, -1, 1)) * R2D, r]; };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = v => Math.hypot(v[0], v[1], v[2]);
  /* geocentric view of a planet */
  function planet(name, jd) {
    const p = helio(name, jd), e = helio('earth', jd), g = sub(p, e), q = ecl2eq(g);
    const delta = len(g), r = len(p), R = len(e);
    const ph = Math.acos(clamp((r * r + delta * delta - R * R) / (2 * r * delta), -1, 1)) * R2D;
    const l5 = 5 * Math.log10(r * delta);
    const mag = { mercury: -0.42 + l5 + 0.0380 * ph - 0.000273 * ph * ph + 0.000002 * ph * ph * ph, venus: -4.40 + l5 + 0.0009 * ph + 0.000239 * ph * ph - 0.00000065 * ph * ph * ph,
      mars: -1.52 + l5 + 0.016 * ph, jupiter: -9.40 + l5 + 0.005 * ph, saturn: -8.88 + l5 + 0.044 * ph, uranus: -7.19 + l5, neptune: -6.87 + l5, pluto: -1.0 + l5 }[name];
    const elong = Math.acos(clamp((R * R + delta * delta - r * r) / (2 * R * delta), -1, 1)) * R2D;
    return { ra: rev(Math.atan2(q[1], q[0]) * R2D), dec: Math.asin(q[2] / delta) * R2D, dist: delta, r, phase: ph, mag, elong, lightMin: delta * AU_KM / C_KMS / 60 };
  }

  /* ── Earth rotation, observer geometry ── */
  const gmst = jd => { const T = Tof(jd); return rev(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000); };
  function altaz(ra, dec, lat, lon, jd) {
    const H = rev(gmst(jd) + lon - ra) * D2R, d = dec * D2R, f = lat * D2R;
    const alt = Math.asin(clamp(Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(H), -1, 1));
    const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(f) - Math.cos(d) * Math.cos(H) * Math.sin(f));
    return { alt: alt * R2D, az: rev(az * R2D) };
  }
  /* crossings of altitude h0 during the 24 h starting at jd0; posFn(jd) → {ra,dec} */
  function crossings(posFn, lat, lon, jd0, h0) {
    const out = [], step = 1 / 144; let pa = null, pj = jd0;
    const f = jd => { const p = posFn(jd); return altaz(p.ra, p.dec, lat, lon, jd).alt - h0; };
    for (let i = 0; i <= 144; i++) {
      const j = jd0 + i * step, a = f(j);
      if (pa !== null && (a > 0) !== (pa > 0)) {
        let lo = pj, hi = j, flo = pa;
        for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2, fm = f(mid); if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid; }
        out.push({ jd: (lo + hi) / 2, rising: a > 0 });
      }
      pa = a; pj = j;
    }
    return out;
  }
  const subsolar = jd => { const s = sun(jd); let lon = rev(s.ra - gmst(jd)); if (lon > 180) lon -= 360; return { lat: s.dec, lon }; };

  /* ── Galilean moons: apparent offsets from Jupiter in Jupiter radii (x + = west, y + = north, z + = toward Earth) ── */
  function galilean(jd) {
    const d = jd - 2451545.0, s = x => Math.sin(x * D2R), c = x => Math.cos(x * D2R);
    const V = 172.74 + 0.00111588 * d, M = 357.529 + 0.9856003 * d, N = 20.020 + 0.0830853 * d + 0.329 * s(V);
    const J = 66.115 + 0.9025179 * d - 0.329 * s(V), A = 1.915 * s(M) + 0.020 * s(2 * M), B = 5.555 * s(N) + 0.168 * s(2 * N), K = J + A - B;
    const R = 1.00014 - 0.01671 * c(M) - 0.00014 * c(2 * M), r = 5.20872 - 0.25208 * c(N) - 0.00611 * c(2 * N);
    const Dl = Math.sqrt(r * r + R * R - 2 * r * R * c(K)), psi = Math.asin(R / Dl * s(K)) * R2D, t = d - Dl / 173;
    const lam = 34.35 + 0.083091 * d + 0.329 * s(V) + B;
    const DE = 3.12 * s(lam + 42.8) - 2.22 * s(psi) * c(lam + 22) - 1.30 * (r - Dl) / Dl * s(lam - 100.5);
    const u1 = 163.8069 + 203.4058646 * t + psi - B, u2 = 358.4140 + 101.2916335 * t + psi - B, u3 = 5.7176 + 50.2345180 * t + psi - B, u4 = 224.8092 + 21.4879800 * t + psi - B;
    const G = 331.18 + 50.310482 * t, H = 87.45 + 21.569231 * t;
    const c1 = 0.473 * s(2 * (u1 - u2)), c2 = 1.065 * s(2 * (u2 - u3)), c3 = 0.165 * s(G), c4 = 0.843 * s(H);
    const rr = [5.9057 - 0.0244 * c(2 * (u1 - u2)), 9.3966 - 0.0882 * c(2 * (u2 - u3)), 14.9883 - 0.0216 * c(G), 26.3627 - 0.1939 * c(H)];
    const uu = [u1 + c1, u2 + c2, u3 + c3, u4 + c4];
    return ['Io', 'Europa', 'Ganymede', 'Callisto'].map((n, i) => ({ name: n, u: rev(uu[i]), r: rr[i], x: rr[i] * s(uu[i]), y: -rr[i] * c(uu[i]) * s(DE), z: rr[i] * c(uu[i]) * c(DE), behind: c(uu[i]) < 0 }));
  }

  /* ── probes leaving the Solar System: straight-line escape, heliocentric ecliptic ──
     Voyager 1 is pinned to NASA's published instant for crossing one light-day from Earth. */
  const V1_ANCHOR_JD = jdOf(new Date(Date.UTC(2026, 10, 18, 10, 16, 7)));
  const PROBES = {
    'voyager-1':    { name: 'Voyager 1',    lon: 256.0, lat: 34.9,  kms: 16.92, approx: false, launched: '1977-09-05' },
    'voyager-2':    { name: 'Voyager 2',    lon: 290.4, lat: -38.5, kms: 15.30, r0: 144.3, approx: true, launched: '1977-08-20' },
    'new-horizons': { name: 'New Horizons', lon: 290.6, lat: 2.1,   kms: 13.70, r0: 66.2,  approx: true, launched: '2006-01-19' },
    'pioneer-10':   { name: 'Pioneer 10',   lon: 80.0,  lat: 3.0,   kms: 11.9,  r0: 140.0, approx: true, launched: '1972-03-03', silent: '2003-01-23' },
    'pioneer-11':   { name: 'Pioneer 11',   lon: 283.5, lat: 14.0,  kms: 11.2,  r0: 118.5, approx: true, launched: '1973-04-06', silent: '1995-11-24' }
  };
  (function pin() {                                    // solve |u·r − E| = 1 light-day at the anchor instant
    const p = PROBES['voyager-1'], u = lonlat2ecl(p.lon, p.lat, 1), E = helio('earth', V1_ANCHOR_JD);
    const ue = u[0] * E[0] + u[1] * E[1] + u[2] * E[2];
    p.r0 = ue + Math.sqrt(ue * ue - (E[0] * E[0] + E[1] * E[1] + E[2] * E[2]) + LD_AU * LD_AU);
  })();
  function probe(id, jd) {
    const p = PROBES[id], r = p.r0 + p.kms * 86400 / AU_KM * (jd - V1_ANCHOR_JD), pos = lonlat2ecl(p.lon, p.lat, r);
    const g = sub(pos, helio('earth', jd)), dist = len(g), q = ecl2eq(g);
    return { name: p.name, approx: p.approx, helioAU: r, pos, dist, lightSec: dist * AU_KM / C_KMS,
             ra: rev(Math.atan2(q[1], q[0]) * R2D), dec: Math.asin(q[2] / dist) * R2D };
  }

  /* ── cosmology: flat ΛCDM, Planck 2018 (H0 67.4, Ωm 0.315) ── */
  const H0 = 67.4, OM = 0.315, OR = 9.2e-5, OL = 1 - OM - OR, HUB_GYR = 977.7922216807891 / H0, HUB_GLY = C_KMS / H0 * 3.2615637769 / 1000;
  const Ez = z => Math.sqrt(OR * (1 + z) ** 4 + OM * (1 + z) ** 3 + OL);
  function integ(z, f) { if (z <= 0) return 0; const n = z > 50 ? 3000 : 400, u1 = Math.log1p(z), h = u1 / n; let s = 0;
    for (let i = 0; i <= n; i++) { const zz = Math.expm1(i * h); s += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * f(zz); } return s * h / 3; }
  const cosmo = {
    H0, OM, age: 0, hubbleGly: HUB_GLY,
    comovingGly: z => HUB_GLY * integ(z, zz => (1 + zz) / Ez(zz)),      // where it is now
    lookbackGyr: z => HUB_GYR * integ(z, zz => 1 / Ez(zz)),             // how long the light took
    /* redshift whose light-travel time is t Gyr (bisection) */
    emitGly: z => HUB_GLY * integ(z, zz => (1 + zz) / Ez(zz)) / (1 + z),  // where it was when the light left
    recession: z => integ(z, zz => (1 + zz) / Ez(zz)),                    // how fast it recedes now, in units of c (= comoving distance / Hubble distance)
    zAtLookback: t => { let lo = 0, hi = 1e4; for (let i = 0; i < 60; i++) { const m = Math.sqrt((lo + 1) * (hi + 1)) - 1; if (cosmo.lookbackGyr(m) < t) lo = m; else hi = m; } return (lo + hi) / 2; }
  };
  cosmo.age = HUB_GYR * integ(1e7, zz => 1 / Ez(zz));
  cosmo.eventHorizonGly = HUB_GLY * (function () { const n = 4000; let s = 0; for (let i = 0; i <= n; i++) { const a = 1 + (1e4 - 1) * Math.pow(i / n, 4); /* a from 1 to 10^4 */
    const da = i === 0 ? 0 : a - (1 + (1e4 - 1) * Math.pow((i - 1) / n, 4)); const am = a - da / 2; if (i) s += da / (am * am * Math.sqrt(OR / am ** 4 + OM / am ** 3 + OL)); } return s; })();

  /* ── stars: rough physical size from brightness and colour ── */
  const tempFromBV = bv => 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));       // Ballesteros 2012
  function starRadius(absmag, bv) {                     // solar radii; ignores bolometric correction, so hot and cool stars are underestimated
    const L = Math.pow(10, 0.4 * (4.83 - absmag)), T = tempFromBV(clamp(bv, -0.4, 2.0));
    return clamp(Math.sqrt(L) * (5772 / T) ** 2, 0.08, 1800);
  }

  /* ── formatting ── */
  function lightTime(sec) {
    if (!isFinite(sec)) return '—';
    if (sec < 1e-3) return (sec * 1e6).toFixed(0) + ' µs';
    if (sec < 1) return (sec * 1e3).toFixed(1) + ' ms';
    if (sec < 100) return sec.toFixed(2) + ' s';
    if (sec < 6000) return Math.floor(sec / 60) + ' min ' + String(Math.floor(sec % 60)).padStart(2, '0') + ' s';
    if (sec < 2 * 86400) return Math.floor(sec / 3600) + ' h ' + String(Math.floor(sec % 3600 / 60)).padStart(2, '0') + ' min';
    const yr = sec / 31557600;
    if (yr < 1) return (sec / 86400).toFixed(1) + ' days';
    if (yr < 1e3) return Number(yr.toPrecision(3)) + ' years';
    if (yr < 1e6) return Number((yr / 1e3).toPrecision(3)) + ' thousand years';
    if (yr < 1e9) return Number((yr / 1e6).toPrecision(3)) + ' million years';
    return Number((yr / 1e9).toPrecision(4)) + ' billion years';
  }
  const hms = (sec) => { const s = Math.max(0, Math.floor(sec)); return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const fmtRA = ra => { const h = rev(ra) / 15, hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return String(hh).padStart(2, '0') + 'h ' + String(mm).padStart(2, '0') + 'm'; };
  const fmtDec = dec => { const a = Math.abs(dec), dd = Math.floor(a), mm = Math.floor((a - dd) * 60); return (dec < 0 ? '−' : '+') + String(dd).padStart(2, '0') + '° ' + String(mm).padStart(2, '0') + '′'; };

  /* B−V colour index → RGB via the blackbody locus; [r,g,b,kelvin] */
  function bv2rgb(bv) {
    bv = clamp(bv, -0.4, 2.0);
    const t = tempFromBV(bv); let x, y;
    if (t < 4000) x = -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.179910; else x = -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.240390;
    if (t < 2222) y = -1.1063814 * x ** 3 - 1.34811020 * x * x + 2.18555832 * x - 0.20219683;
    else if (t < 4000) y = -0.9549476 * x ** 3 - 1.37418593 * x * x + 2.09137015 * x - 0.16748867;
    else y = 3.0817580 * x ** 3 - 5.87338670 * x * x + 3.75112997 * x - 0.37001483;
    const X = y > 0 ? x / y : 0, Z = y > 0 ? (1 - x - y) / y : 0;
    const g = v => { v = Math.max(0, v); return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
    const r = g(3.2406 * X - 1.5372 - 0.4986 * Z), gg = g(-0.9689 * X + 1.8758 + 0.0415 * Z), b = g(0.0557 * X - 0.2040 + 1.0570 * Z), m = Math.max(r, gg, b) || 1;
    return [r / m, gg / m, b / m, t];
  }
  /* galactic frame expressed in the scene frame: toward the centre (l=0), l=90°, north galactic pole */
  const GAL = (() => { const x = radec2v(266.40499, -28.93617), z = radec2v(192.85948, 27.12825);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]; return { x, y, z }; })();
  const gal2scene = (gx, gy, gz) => [GAL.x[0] * gx + GAL.y[0] * gy + GAL.z[0] * gz, GAL.x[1] * gx + GAL.y[1] * gy + GAL.z[1] * gz, GAL.x[2] * gx + GAL.y[2] * gy + GAL.z[2] * gz];

  const ASTRO = { D2R, R2D, AU_KM, C_KMS, LY_KM, LY_AU, LD_AU, rev, clamp, jdOf, dateOf, sun, moon, moonPhase, nextPhase, PLANETS, POLES, helio, elementsXYZ, orbitPath, planet,
    ecl2eq, eq2scene, ecl2scene, lonlat2ecl, radec2v, v2radec, gmst, altaz, crossings, subsolar, galilean, PROBES, probe, V1_ANCHOR_JD,
    cosmo, tempFromBV, starRadius, lightTime, hms, fmtRA, fmtDec, bv2rgb, GAL, gal2scene, len, sub };
  if (typeof module !== 'undefined' && module.exports) module.exports = ASTRO; else root.ASTRO = ASTRO;
})(typeof window !== 'undefined' ? window : globalThis);

// Checks the ephemeris code against published values.   node tests/astro.test.cjs
const A = require('../js/astro.js');
let fail = 0;
const near = (name, got, want, tol, unit = '') => {
  const ok = Math.abs(got - want) <= tol; if (!ok) fail++;
  console.log(`${ok ? '  ok ' : ' FAIL'}  ${name.padEnd(52)} ${String(+got.toFixed(4)).padStart(12)} ${unit.padEnd(5)} want ${want} ±${tol}`);
};
const jd = (y, m, d, h = 0, mi = 0, s = 0) => A.jdOf(new Date(Date.UTC(y, m - 1, d, h, mi, s)));

console.log('Sun — Meeus example 25.a, 1992 Oct 13 0h TD');
let s = A.sun(2448908.5); near('apparent RA', s.ra, 198.38083, 0.01, '°'); near('apparent Dec', s.dec, -7.78507, 0.01, '°'); near('distance', s.dist, 0.99766, 0.0001, 'AU');

console.log('Moon — Meeus example 47.a, 1992 Apr 12 0h TD');
let m = A.moon(2448724.5); near('RA', m.ra, 134.688470, 0.02, '°'); near('Dec', m.dec, 13.768368, 0.02, '°'); near('distance', m.distKm, 368409.7, 30, 'km');

console.log('Moon phase — full Moon 2026 Nov 24 14:53 UTC, new Moon 2026 Nov 9 07:02 UTC');
near('illumination at full', A.moonPhase(jd(2026, 11, 24, 14, 53)).illum, 1.0, 0.002); near('elongation at new', A.rev(A.moonPhase(jd(2026, 11, 9, 7, 2)).angle + 180) - 180, 0, 0.6, '°');
near('next full Moon after Nov 14 (hours from 24 Nov 14:53)', (A.nextPhase(jd(2026, 11, 14), 180) - jd(2026, 11, 24, 14, 53)) * 24, 0, 1.0, 'h');

console.log('Sidereal time — Meeus example 12.b, 1987 Apr 10 19:21:00 UT');
near('GMST', A.gmst(2446896.30625), 128.7378734, 0.0005, '°');

console.log('Planets — a perihelion and known oppositions');
near('Earth heliocentric distance (perihelion Jan 3 2026)', A.len(A.helio('earth', jd(2026, 1, 3, 17))), 0.98330, 0.0004, 'AU');
near('Mars opposition 2025 Jan 16: distance', A.planet('mars', jd(2025, 1, 16, 2)).dist, 0.6423, 0.004, 'AU');
near('Jupiter opposition 2026 Jan 10: distance', A.planet('jupiter', jd(2026, 1, 10, 9)).dist, 4.232, 0.02, 'AU');
near('Saturn opposition 2026 Oct 4: elongation', A.planet('saturn', jd(2026, 10, 4, 12)).elong, 178, 2.5, '°');
near('Pluto distance from Sun, 2026', A.len(A.helio('pluto', jd(2026, 11, 13))), 35.6, 0.5, 'AU');
const op = A.orbitPath('mars', jd(2026, 1, 1), 180), rs = op.map(A.len); near('Mars orbit path: perihelion', Math.min(...rs), 1.381, 0.003, 'AU'); near('Mars orbit path: aphelion', Math.max(...rs), 1.666, 0.003, 'AU');

console.log('Galilean moons — Meeus example 44.a, 1992 Dec 16 0h UT (Jupiter radii)');
let g = A.galilean(2448972.50068); near('Io X', g[0].x, -3.44, 0.05); near('Europa X', g[1].x, 7.44, 0.05); near('Ganymede X', g[2].x, 1.24, 0.05); near('Callisto X', g[3].x, 7.08, 0.05);
near('Io orbital radius from x,y,z', Math.hypot(g[0].x, g[0].y, g[0].z), 5.9, 0.05);

console.log('Voyager 1 — pinned to NASA: one light-day at 2026 Nov 18 10:16:07 UTC');
let v = A.probe('voyager-1', A.V1_ANCHOR_JD); near('light time at anchor', v.lightSec, 86400, 0.01, 's'); near('distance at anchor', v.dist, 173.1446, 0.001, 'AU');
near('heliocentric distance at anchor (tracker: ~172.3)', v.helioAU, 172.37, 0.08, 'AU');
let best = { d: 0 }, low = { d: 1e9 };
for (let j = A.V1_ANCHOR_JD; j < A.V1_ANCHOR_JD + 220; j += 0.25) { const d = A.probe('voyager-1', j).dist; if (j < A.V1_ANCHOR_JD + 110 && d > best.d) best = { d, j }; if (j > A.V1_ANCHOR_JD + 110 && d < low.d) low = { d, j }; }
near('days from anchor to local maximum (21 Jan → 64)', best.j - A.V1_ANCHOR_JD, 64, 3, 'd'); near('days from anchor to local minimum (25 Apr → 158)', low.j - A.V1_ANCHOR_JD, 158, 3, 'd');
near('margin beyond one light-day at that minimum', (low.d - A.LD_AU) * A.AU_KM / 1e6, 27, 3, 'Mkm');
near('Voyager 1 geocentric RA (Ophiuchus, ~17h14m)', v.ra, 258.6, 1.0, '°');

console.log('Cosmology — flat ΛCDM, Planck 2018');
near('age of the universe', A.cosmo.age, 13.79, 0.03, 'Gyr'); near('comoving distance to z=1089 (CMB)', A.cosmo.comovingGly(1089), 45.2, 0.3, 'Gly');
near('lookback time to z=1', A.cosmo.lookbackGyr(1), 7.95, 0.05, 'Gyr'); near('comoving distance to z=1', A.cosmo.comovingGly(1), 11.09, 0.05, 'Gly');
near('lookback to z=14.44 (MoM-z14)', A.cosmo.lookbackGyr(14.44), 13.51, 0.03, 'Gyr'); near('particle horizon', A.cosmo.comovingGly(1e7), 46.1, 0.4, 'Gly');
near('cosmic event horizon (published ~16.7)', A.cosmo.eventHorizonGly, 16.7, 0.4, 'Gly'); near('Hubble distance c/H0', A.cosmo.hubbleGly, 14.5, 0.1, 'Gly');
near('redshift at 10 Gyr lookback', A.cosmo.lookbackGyr(A.cosmo.zAtLookback(10)), 10, 0.001, 'Gyr');

console.log('Stars and frames');
near('Sun radius from M=4.83, B−V=0.656', A.starRadius(4.83, 0.656), 1.0, 0.03, 'R☉'); near('Sirius radius (true 1.71)', A.starRadius(1.45, 0.009), 1.71, 0.45, 'R☉');
const gc = A.gal2scene(1, 0, 0), rd = A.v2radec(gc); near('galactic centre RA', rd[0], 266.405, 0.001, '°'); near('galactic centre Dec', rd[1], -28.936, 0.001, '°');
const np = A.v2radec(A.ecl2scene([0, 0, 1])); near('ecliptic pole Dec', np[1], 66.5607, 0.001, '°'); near('ecliptic pole RA', np[0], 270, 0.001, '°');
near('subsolar latitude at Dec solstice 2026', A.subsolar(jd(2026, 12, 21, 20, 50)).lat, -23.44, 0.01, '°');
near('B−V 0.656 (Sun) colour temperature', A.bv2rgb(0.656)[3], 5770, 120, 'K');
near('light-time formatter: 499 s', parseFloat(A.lightTime(499.004)), 8, 0.01, 'min');

console.log('Things the pages print');
near('Moon age the day before first quarter, Nov 2026 (true time since the 9 Nov new Moon)', A.moonAge(jd(2026, 11, 16, 5, 41)), 6.94, 0.02, 'd');
near('first quarter, 17 Nov 2026 11:48 UTC', (A.nextPhase(jd(2026, 11, 16), 90) - jd(2026, 11, 17, 11, 48)) * 24, 0, 0.2, 'h');
near('Galilean u is continuous: Io advances ~203.4°/day', A.rev(A.galilean(2448973.50068)[0].u - A.galilean(2448972.50068)[0].u), A.rev(203.4058646), 1.5, '°');
near('emission distance at z=1 (comoving / 2)', A.cosmo.emitGly(1), 11.09 / 2, 0.03, 'Gly'); near('recession speed of the CMB matter today', A.cosmo.recession(1089.9), 3.12, 0.03, 'c');
near('GN-z11 recedes now at', A.cosmo.recession(10.603), 2.19, 0.03, 'c');

console.log(fail ? `\n${fail} FAILED` : '\nall checks passed'); process.exit(fail ? 1 : 0);

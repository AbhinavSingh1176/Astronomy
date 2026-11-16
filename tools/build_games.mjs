#!/usr/bin/env node
/* OWLT · build_games.mjs — writes data/games.json for the Games page.
   Light Time: things to guess, each with how long its light has been travelling, from the same registry the Ladder uses
   (the light-travel time, not the distance, for the far galaxies). Solar System bodies are marked live: the page works them out for the moment you play.
   Constellation: the figures with enough stars to recognise, and every constellation's name and centre for guessing.
   Deterministic output, so it only changes when the catalogues do.   node tools/build_games.mjs [--strict] [--check] */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = require(path.join(ROOT, 'js/astro.js')), REG = require(path.join(ROOT, 'js/registry.js'));
const read = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8')), strict = process.argv.includes('--strict');
const R = REG.build({ solar: read('data/catalog/solar.json'), structures: read('data/catalog/structures.json'), stars: read('data/catalog/stars.json'),
  exo: read('data/catalog/exoplanets.json'), messier: read('data/catalog/messier.json'), galaxies: read('data/catalog/galaxies.json') }, A);
const YEAR = 31557600;

/* the Solar System, worked out live on the page */
const LIVE = [['moon', 'the Moon'], ['sun', 'the Sun'], ['mercury', 'Mercury'], ['venus', 'Venus'], ['mars', 'Mars'], ['jupiter', 'Jupiter'], ['saturn', 'Saturn'],
  ['uranus', 'Uranus'], ['neptune', 'Neptune'], ['pluto', 'Pluto'], ['voyager-1', 'Voyager 1']];
/* everything else: its light left long ago, and the time is in the catalogue */
const FAR = ['proxima-centauri', 'sirius', 'vega', 'arcturus', 'altair', 'fomalhaut', 'aldebaran', 'polaris', 'betelgeuse', 'rigel', 'deneb', 'antares', 'canopus', 'spica', 'capella',
  'pleiades', 'hyades', 'orion-nebula', 'm1', 'm16', 'm57', 'm13', 'omega-centauri', 'helix-nebula', 'sgr-a-star', 'large-magellanic-cloud', 'small-magellanic-cloud',
  'andromeda-galaxy', 'triangulum-galaxy', 'm51', 'm104', 'm87', 'virgo-cluster', 'coma-cluster', 'centaurus-a', '3c-273', 'gn-z11', 'cmb'];
const light = [], missing = [];
for (const [slug, name] of LIVE) { const e = R.find(slug); if (e) light.push({ slug: e.slug, name, live: true }); else missing.push(slug); }
for (const s of FAR) {
  const e = R.find(s); if (!e) { missing.push(s); continue; }
  const years = e.ltYears || e.ly; if (!(years > 0)) { missing.push(s + ' (no distance)'); continue; }
  light.push({ slug: e.slug, name: e.name, kind: e.kind, sec: +(years * YEAR).toPrecision(4), ...(e.ltYears ? { lookback: true } : {}), ...(e.approx ? { approx: true } : {}) });
}
/* Constellation: each figure as its stars (with their brightness where the star catalogue knows it, so the bright ones are drawn bigger)
   and the lines between them. Answers are the figures with at least five stars, and the Southern Cross; every constellation can be guessed.
   English names are the usual IAU meanings; a guess can use the Latin name, the English one, or the three-letter abbreviation. */
const EN = { And: 'Chained Maiden', Ant: 'Air Pump', Aps: 'Bird of Paradise', Aqr: 'Water Bearer', Aql: 'Eagle', Ara: 'Altar', Ari: 'Ram', Aur: 'Charioteer', Boo: 'Herdsman',
  Cae: 'Chisel', Cam: 'Giraffe', Cnc: 'Crab', CVn: 'Hunting Dogs', CMa: 'Great Dog', CMi: 'Little Dog', Cap: 'Sea Goat', Car: 'Keel', Cas: 'Queen', Cen: 'Centaur', Cep: 'King',
  Cet: 'Whale', Cha: 'Chameleon', Cir: 'Compasses', Col: 'Dove', Com: 'Berenice’s Hair', CrA: 'Southern Crown', CrB: 'Northern Crown', Crv: 'Crow', Crt: 'Cup', Cru: 'Southern Cross',
  Cyg: 'Swan', Del: 'Dolphin', Dor: 'Swordfish', Dra: 'Dragon', Equ: 'Little Horse', Eri: 'River', For: 'Furnace', Gem: 'Twins', Gru: 'Crane', Her: 'Hero', Hor: 'Pendulum Clock',
  Hya: 'Water Snake', Hyi: 'Little Water Snake', Ind: 'Indian', Lac: 'Lizard', Leo: 'Lion', LMi: 'Little Lion', Lep: 'Hare', Lib: 'Scales', Lup: 'Wolf', Lyn: 'Lynx', Lyr: 'Lyre',
  Men: 'Table Mountain', Mic: 'Microscope', Mon: 'Unicorn', Mus: 'Fly', Nor: 'Carpenter’s Square', Oct: 'Octant', Oph: 'Serpent Bearer', Ori: 'Hunter', Pav: 'Peacock',
  Peg: 'Winged Horse', Per: 'Hero', Phe: 'Phoenix', Pic: 'Painter’s Easel', Psc: 'Fishes', PsA: 'Southern Fish', Pup: 'Stern', Pyx: 'Mariner’s Compass', Ret: 'Reticle',
  Sge: 'Arrow', Sgr: 'Archer', Sco: 'Scorpion', Scl: 'Sculptor', Sct: 'Shield', Ser: 'Serpent', Sex: 'Sextant', Tau: 'Bull', Tel: 'Telescope', Tri: 'Triangle',
  TrA: 'Southern Triangle', Tuc: 'Toucan', UMa: 'Great Bear', UMi: 'Little Bear', Vel: 'Sails', Vir: 'Maiden', Vol: 'Flying Fish', Vul: 'Little Fox' };
/* Hercules and Perseus are both heroes; the English name is only accepted as a guess when it names one constellation */
const ALIAS = { UMa: ['Big Dipper', 'Plough', 'Plow'], UMi: ['Little Dipper'] };
const ST = read('data/catalog/stars.json'), SC = Object.fromEntries(ST.cols.map((k, i) => [k, i])), D2R = Math.PI / 180;
function magAt(ra, dec) {
  let best = null, bd = 0.15;
  for (const r of ST.rows) { const d = Math.hypot(((r[SC.ra] - ra + 540) % 360 - 180) * Math.cos(dec * D2R), r[SC.dec] - dec); if (d < bd) { bd = d; best = r[SC.mag]; } }
  return best;
}
const unit = (ra, dec) => [Math.cos(dec * D2R) * Math.cos(ra * D2R), Math.cos(dec * D2R) * Math.sin(ra * D2R), Math.sin(dec * D2R)];
function centre(pts) {
  const s = [0, 0, 0]; for (const p of pts) { const u = unit(p[0], p[1]); s[0] += u[0]; s[1] += u[1]; s[2] += u[2]; }
  return [+((Math.atan2(s[1], s[0]) / D2R + 360) % 360).toFixed(2), +(Math.atan2(s[2], Math.hypot(s[0], s[1])) / D2R).toFixed(2)];
}
function figure(c) {
  const pts = [], at = new Map();
  const lines = c[2].map(l => { const idx = []; for (let i = 0; i < l.length; i += 2) { const k = l[i] + ',' + l[i + 1];
    if (!at.has(k)) { at.set(k, pts.length); const m = magAt(l[i], l[i + 1]); pts.push([l[i], l[i + 1], m == null ? null : +m.toFixed(1)]); } idx.push(at.get(k)); } return idx; });
  return { pts, lines };
}
const RAW = read('data/catalog/constellations.json');
const cons = [], guess = [];
for (const c of RAW) {
  const f = figure(c), cen = centre(f.pts), g = guess.find(x => x.id === c[0]);
  if (g) { g.parts.push(cen); g.aka.push(g.name, c[1]); g.name = c[1].split(' ')[0]; continue; }       /* the second half of Serpens: one guess, two centres */
  guess.push({ id: c[0], name: c[1], en: EN[c[0]] || null, aka: [...(ALIAS[c[0]] || [])], parts: [cen] });
  if (c[0] !== 'Ser' && (f.pts.length >= 5 || c[0] === 'Cru')) cons.push({ id: c[0], name: c[1], en: EN[c[0]] || null, rank: c[5] || 3, cen, ...f });
}
const noEn = guess.filter(g => !g.en).map(g => g.id); if (noEn.length) missing.push('English names for ' + noEn.join(' '));
const out = JSON.stringify({ note: 'Built by tools/build_games.mjs from the catalogues. Do not edit by hand.', light, cons, guess });
if (process.argv.includes('--check')) {                 /* CI: the committed file must match what the catalogues give */
  let had = ''; try { had = readFileSync(path.join(ROOT, 'data/games.json'), 'utf8'); } catch (e) {}
  if (had !== out) { console.log('data/games.json is out of date: run node tools/build_games.mjs'); process.exit(1); }
} else writeFileSync(path.join(ROOT, 'data/games.json'), out);
console.log('light ' + light.length + ' (' + light.filter(x => x.live).length + ' live) · constellations ' + cons.length + ' to find, ' + guess.length + ' to guess' + (missing.length ? ' · not found: ' + missing.join(', ') : ''));
if (strict && missing.length) process.exit(1);

#!/usr/bin/env node
/* OWLT · tests/data.test.mjs — every data file the pages read, checked for the shape the pages expect.
   Run in CI after each refresh (a bad file fails the job before it can be deployed) and locally.   node tests/data.test.mjs */
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('  FAIL ' + msg); } };
const isISO = s => typeof s === 'string' && !isNaN(new Date(s)) && /^\d{4}-\d\d-\d\dT/.test(s);
const isURL = s => { try { return /^https?:$/.test(new URL(s).protocol); } catch (e) { return false; } };
const str = (s, max = 1e5) => typeof s === 'string' && s.length > 0 && s.length <= max && !/<script|javascript:/i.test(s);
function section(name, fn) { const before = fails; try { fn(); } catch (e) { fails++; console.log('  FAIL ' + name + ': ' + e.message); } console.log((fails === before ? 'ok   ' : 'FAIL ') + name); }
const opt = (p, fn) => { if (!existsSync(path.join(ROOT, p))) return console.log('skip ' + p + ' (not fetched yet)'); const d = read(p); if (d && d.fetched === null) return console.log('skip ' + p + ' (placeholder until the first refresh)'); section(p, () => fn(d)); };

/* ── catalogues, built once by tools/build_catalog.py ── */
section('catalogue binaries', () => {
  for (const [f, rec, min] of [['sky.bin', 8, 20000], ['local.bin', 8, 90000], ['galaxies.bin', 14, 9000]]) {
    const n = statSync(path.join(ROOT, 'data/catalog', f)).size; ok(n % rec === 0, f + ' size is not a multiple of ' + rec); ok(n / rec >= min, f + ' has only ' + n / rec + ' records');
  }
});
section('solar.json', () => { const s = read('data/catalog/solar.json'); ok(s.bodies.length >= 30, 'bodies'); for (const b of s.bodies) { ok(str(b.id) && str(b.name) && b.radius > 0, 'body ' + b.id); ok(Array.isArray(b.look) && b.look.length === 5, 'look ' + b.id); } });
section('structures.json', () => { const s = read('data/catalog/structures.json'); const ids = new Set();
  for (const x of s.items) { ok(!ids.has(x.id), 'duplicate ' + x.id); ids.add(x.id); ok(x.shell || x.ly != null || x.mly != null || x.z != null, 'no distance for ' + x.id); if (x.ra != null) ok(x.ra >= 0 && x.ra < 360 && Math.abs(x.dec) <= 90, 'bad position ' + x.id); } });
section('glossary.json', () => { const g = read('data/glossary.json').terms, ids = new Set(); for (const t of g) { ok(/^[a-z0-9-]+$/.test(t.id) && !ids.has(t.id), 'term id ' + t.id); ids.add(t.id); ok(str(t.t, 80) && str(t.d, 800), 'term ' + t.id); } });
section('eras.json', () => { const e = read('data/eras.json').eras; let last = 0; for (const x of e) { ok(x[0] >= last, 'eras out of order at ' + x[1]); last = x[0]; ok(str(x[1], 200), 'era text'); } });
section('canon.json', () => { const c = read('data/papers/canon.json').papers; for (const p of c) { ok(str(p.id) && str(p.t) && str(p.by) && p.yr > 1500 && p.yr < 2100, 'canon ' + p.id); ok(isURL(p.url), 'canon url ' + p.id);
  for (const k of ['one', 'q', 'how', 'why']) ok(str(p[k], 1500), 'canon ' + p.id + ' ' + k); ok(Array.isArray(p.found) && p.found.every(f => f.length === 2), 'canon found ' + p.id); } });
section('lost.json', () => { const m = read('data/lost.json').missions; for (const x of m) { ok(str(x.id) && str(x.n) && str(x.who) && str(String(x.when)), 'mission ' + x.id); ok(['crew', 'lost', 'ended', 'cancelled'].includes(x.kind), 'kind ' + x.id); } });

/* ── snapshots written by scripts/refresh.mjs and scripts/digest.mjs ── */
const gl = new Set(read('data/glossary.json').terms.map(t => t.id));
opt('data/papers/digests.json', d => { const ids = new Set(); for (const p of d.papers) {
  ok(str(p.id) && !ids.has(p.id), 'digest id ' + p.id); ids.add(p.id); ok(/^\d{4}\.\d{4,5}$|^[a-z-]+\/\d{7}$/.test(p.arxiv), 'arXiv id ' + p.arxiv); ok(/^\d{4}-\d\d-\d\d$/.test(p.date), 'date ' + p.id);
  ok(str(p.t, 400) && str(p.by, 600) && str(p.one, 400) && str(p.q, 2000) && str(p.how, 2000), 'text ' + p.id); ok(isURL(p.url), 'url ' + p.id);
  ok(Array.isArray(p.found) && p.found.every(f => Array.isArray(f) && f.length === 2), 'found ' + p.id); ok((p.terms || []).every(t => gl.has(t)), 'unknown term in ' + p.id);
  if (!p.auto) ok(str(p.why, 2000) && str(p.careful, 2000), 'why/careful ' + p.id); } });
opt('data/papers/arxiv.json', d => { ok(isISO(d.fetched), 'fetched'); ok(d.papers.length > 0, 'papers'); for (const p of d.papers.slice(0, 50)) ok(str(p.id) && str(p.t) && Array.isArray(p.by) && str(p.abs), 'paper ' + p.id); });
opt('data/news.json', d => { ok(isISO(d.fetched), 'fetched'); for (const a of d.items) { ok(str(a.id) && str(a.t, 300) && isURL(a.url) && str(a.site, 80) && isISO(a.date), 'item ' + a.id); ok(!/<[a-z]/i.test(a.t + a.sum), 'markup in ' + a.id); } });
opt('data/launches.json', d => { ok(isISO(d.fetched), 'fetched'); for (const l of d.upcoming.concat(d.recent)) ok(str(l.id) && str(l.name) && isISO(l.net) && typeof l.status === 'string', 'launch ' + l.id);
  ok(d.upcoming.every((l, i, a) => !i || a[i - 1].net <= l.net), 'upcoming not in date order'); });
opt('data/spaceweather.json', d => { ok(isISO(d.fetched), 'fetched'); if (d.kp) ok(d.kp.now >= 0 && d.kp.now <= 9, 'Kp range'); if (d.wind) ok(d.wind.speed > 100 && d.wind.speed < 3000, 'wind speed'); if (d.xray) ok(/^[ABCMX]\d/.test(d.xray.cls), 'x-ray class'); });
opt('data/tle.json', d => { for (const s of d.sats) ok(s.l1.length === 69 && s.l2.length === 69 && s.l1[0] === '1' && s.l2[0] === '2' && s.norad > 0, 'tle ' + s.name); if (d.fetched) ok(d.sats.some(s => s.norad === 25544), 'ISS present'); });
opt('data/neo.json', d => { for (const n of d.items) ok(str(n.des) && isISO(n.when) && n.au > 0 && n.au < 0.06, 'neo ' + n.des); });
opt('data/apod.json', d => { for (const a of d.days) { ok(/^\d{4}-\d\d-\d\d$/.test(a.date) && str(a.title), 'apod ' + a.date); ok(!a.url || isURL(a.url), 'apod url'); } });
opt('data/dsn.json', d => { ok(d.stations.length >= 1, 'stations'); for (const s of d.stations) for (const x of s.dishes) ok(str(x.name) && Array.isArray(x.targets), 'dish ' + x.name); });
opt('data/status.json', d => { for (const k in d.sources) ok(typeof d.sources[k].ok === 'boolean', 'status ' + k); });

console.log('\n' + checks + ' checks, ' + fails + ' failed');
process.exit(fails ? 1 : 0);

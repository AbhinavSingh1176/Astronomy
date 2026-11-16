#!/usr/bin/env node
/* OWLT · build_index.mjs — writes data/search-index.json and data/graph.json.
   Run after any change to a file in data/.   node tools/build_index.mjs [--strict]
   The registry (js/registry.js) is the same code the Ladder and Atlas run in the browser,
   so a search result can never point at something the Ladder cannot find.
   --strict exits non-zero when a link points nowhere (used in CI). */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = require(path.join(ROOT, 'js/astro.js'));
const REG = require(path.join(ROOT, 'js/registry.js'));
const strict = process.argv.includes('--strict');
const read = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const opt = (p, d) => existsSync(path.join(ROOT, p)) ? read(p) : d;

const D = {
  solar: read('data/catalog/solar.json'), structures: read('data/catalog/structures.json'), stars: read('data/catalog/stars.json'),
  exo: read('data/catalog/exoplanets.json'), messier: read('data/catalog/messier.json'), galaxies: read('data/catalog/galaxies.json')
};
const canon = read('data/papers/canon.json').papers;
const digests = opt('data/papers/digests.json', { papers: [] }).papers;
const glossary = read('data/glossary.json').terms;
const lost = read('data/lost.json').missions;
const R = REG.build(D, A);

const PAGES = [['index.html', 'Today'], ['ladder.html', 'The Ladder'], ['papers.html', 'Reading Room'], ['dispatch.html', 'Dispatch'], ['deck.html', 'Flight Deck'],
  ['sky.html', 'Observatory'], ['gallery.html', 'Gallery'], ['games.html', 'Games'], ['atlas.html', 'Atlas'], ['lost.html', 'The Lost'], ['log.html', 'Ship Log']];

/* ── nodes ── */
const nodes = {}, edges = new Set(), missing = [];
const objHref = e => (e.group === 'note' ? 'atlas.html#' : 'ladder.html#') + e.slug;
const objNode = e => { const id = 'obj:' + e.slug; if (!nodes[id]) nodes[id] = [e.name, e.kind, objHref(e), e.ly != null ? +(+e.ly).toPrecision(4) : null]; return id; };
for (const p of PAGES) nodes['page:' + REG.slug(p[1])] = [p[1], 'page', p[0], null];
/* how a scientist would cite it in conversation: "Hubble 1929", "Penzias & Wilson 1965", "Riess et al. 1998", "Planck 2018" */
export function cite(p) {
  const bare = String(p.by).replace(/\([^)]*\)/g, '').trim(), yr = (p.id.match(/\d{4}/) || [p.yr])[0];
  const lead = bare.match(/^(?:The\s+)?(.+?)\s+(?:Scientific\s+)?Collaboration\b/i);       // "Planck Collaboration", "The Event Horizon Telescope Collaboration"
  if (lead && !/,| and /.test(lead[1])) return lead[1] + ' ' + yr;
  const people = bare.replace(/\bet al\.?/i, '').split(/,| and /).map(x => x.trim()).filter(x => x && !/co-authors?|others|team|collaboration|^the\b/i.test(x));
  const sur = x => x.split(/\s+/).filter(w => !/^(Jr|Sr)\.?$/i.test(w)).pop().replace(/\.$/, '');
  const more = /et al|co-author|team|others|collaboration/i.test(bare) || people.length > 2;
  return (more ? sur(people[0]) + ' et al.' : people.length === 2 ? sur(people[0]) + ' & ' + sur(people[1]) : sur(people[0])) + ' ' + yr;
}
for (const p of canon) nodes['canon:' + p.id] = [cite(p), 'canon', 'papers.html#canon-' + p.id, null];
for (const p of digests) nodes['paper:' + p.id] = [p.t, 'paper', 'papers.html#' + p.id, null];
for (const t of glossary) nodes['term:' + t.id] = [t.t, 'term', 'papers.html#term-' + t.id, null];
for (const m of lost) nodes['lost:' + m.id] = [m.n, 'lost', 'lost.html#' + m.id, null];
for (const e of R.list) if (e.note || e.group === 'solar' || e.group === 'craft' || e.kind === 'scale') objNode(e);
/* canon titles in nodes are shortened to "Author year: claim" when long; keep the full title in search */

/* resolve a link id to a canonical node id (object links may use any alias) */
function resolve(id, from) {
  const i = id.indexOf(':'), kind = id.slice(0, i), key = id.slice(i + 1);
  if (kind === 'obj') { const e = R.find(key) || R.find(REG.slug(key)); if (e) return objNode(e); }
  else if (nodes[id]) return id;
  missing.push(`${from} → ${id}`); return null;
}
const link = (a, b) => { if (!a || !b || a === b) return; edges.add(a < b ? a + '|' + b : b + '|' + a); };
for (const e of R.list) for (const l of e.links || []) link(objNode(e), resolve(l, 'obj:' + e.slug));
for (const p of canon) { const id = 'canon:' + p.id; for (const l of p.links || []) link(id, resolve(l, id)); for (const t of p.terms || []) link(id, resolve('term:' + t, id)); }
for (const p of digests) { const id = 'paper:' + p.id; for (const l of p.links || []) link(id, resolve(l, id)); for (const t of p.terms || []) link(id, resolve('term:' + t, id)); }
for (const m of lost) { const id = 'lost:' + m.id; for (const l of m.links || []) link(id, resolve(l, id)); }
/* planetary systems lead to the habitable zone when they have a planet in it */
for (const e of R.list) if (e.system && e.system.planets.some(p => p.hz === 2)) link(objNode(e), 'term:habitable-zone');

/* drop object nodes that ended up with no edges and no note (kept small) */
const deg = {}; for (const k of edges) { const [a, b] = k.split('|'); deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; }
for (const id in nodes) if (id.startsWith('obj:') && !deg[id]) { const e = R.find(id.slice(4)); if (!(e && (e.note || e.kind === 'scale'))) delete nodes[id]; }

/* ── search index: [title, kind, href, detail, aliases, penalty] ── */
const items = [], seen = new Set();
const push = (t, k, href, d, al, pen) => { const key = k + '|' + t; if (seen.has(key)) return; seen.add(key); items.push([t, k, href, d || '', (al || []).filter(Boolean).join(' · '), +(pen || 0).toFixed(2)]); };
const KPEN = { scale: 0.1, planet: 0, moon: 0.2, dwarf: 0.2, probe: 0.1, star: 0.4, system: 0.6, galaxy: 0.7, cluster: 0.4, globular: 0.4, nebula: 0.3, remnant: 0.3 };
/* search carries the systems people look for; the Atlas lists every one */
const keepSystem = e => !e.system || e.kind === 'star' || e.note || e.ly <= 150 || e.system.planets.length >= 3 || e.system.planets.some(p => p.hz) || /^(TRAPPIST|Kepler-(16|22|62|90|186|442|452)|TOI-700|LHS|GJ|Gliese|Ross|Wolf|Barnard|Teegarden|HD 209458|51 Peg|55 Cnc|HR 8799|Beta Pic|PSR|K2-18|WASP-(12|39|76|96|107|121)|HD 189733|TOI-270|LTT)/i.test(e.name);
for (const e of R.list) {
  if (!keepSystem(e)) continue;
  let pen = KPEN[e.kind] != null ? KPEN[e.kind] : 0.2;
  if (e.kind === 'star' && e.mag != null) pen += Math.max(0, (e.mag - 3) * 0.12);
  if (e.kind === 'galaxy' && !/[a-z]/.test(e.name)) pen += 0.5;              // bare designations rank below named galaxies
  if (e.note) pen -= 0.2;
  push(e.name, e.kind, objHref(e), e.detail, e.alias.concat(e.des ? [e.des] : []), Math.max(0, pen));
}
/* exoplanets: each planet is a way into its system */
const ex = REG.rows(D.exo);
for (const p of ex) {
  const host = R.find(REG.slug(p.host || '')); if (!host || !p.name || !keepSystem(host)) continue;
  const bits = ['planet of ' + p.host];
  if (p.ly) bits.push(REG.fmtLy(p.ly)); if (p.hz === 2) bits.push('habitable zone'); else if (p.hz === 1) bits.push('edge of habitable zone');
  push(p.name, 'exo', 'ladder.html#' + host.slug, bits.join(' · '), [], 0.5 + (p.hz ? 0 : 0.3) + (p.ly && p.ly > 1000 ? 0.4 : 0));
}
for (const p of canon) push(p.t, 'canon', 'papers.html#canon-' + p.id, cite(p), [cite(p), p.field], 0.1);
for (const p of digests) push(p.t, 'paper', 'papers.html#' + p.id, 'arXiv ' + p.arxiv + ' · ' + p.date, [p.arxiv], 0.15);
for (const t of glossary) push(t.t, 'term', 'papers.html#term-' + t.id, 'glossary', t.aka || [], 0.25);
for (const m of lost) push(m.n, 'lost', 'lost.html#' + m.id, m.who + ' · ' + String(m.when).slice(0, 4), [], 0.2);
const cons = read('data/catalog/constellations.json');
for (const c of cons) {                                        /* Serpens comes in two halves: one entry, found by either name */
  const halves = cons.filter(x => x[0] === c[0]); if (halves[0] !== c) continue;
  push(halves.length > 1 ? c[1].split(' ')[0] : c[1], 'con', 'sky.html#con-' + c[0], 'constellation · ' + c[0], [c[0], ...(halves.length > 1 ? halves.map(h => h[1]) : [])], 0.5);
}

writeFileSync(path.join(ROOT, 'data/search-index.json'), JSON.stringify({ built: new Date().toISOString(), items }));
const edgeList = [...edges].map(k => k.split('|')).filter(([a, b]) => nodes[a] && nodes[b]);
writeFileSync(path.join(ROOT, 'data/graph.json'), JSON.stringify({ built: new Date().toISOString(), nodes, edges: edgeList }));

const kb = f => (readFileSync(path.join(ROOT, f)).length / 1024).toFixed(0) + ' KB';
const kinds = {}; for (const it of items) kinds[it[1]] = (kinds[it[1]] || 0) + 1;
console.log(`registry ${R.list.length} entries · search ${items.length} items (${kb('data/search-index.json')}) · graph ${Object.keys(nodes).length} nodes, ${edgeList.length} edges (${kb('data/graph.json')})`);
console.log('by kind:', Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n).join(', '));
if (missing.length) { console.log(`\n${missing.length} links point nowhere:`); for (const m of [...new Set(missing)]) console.log('  ' + m); if (strict) process.exit(1); }
else console.log('every link resolves');

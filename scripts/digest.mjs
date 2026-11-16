#!/usr/bin/env node
/* OWLT · scripts/digest.mjs — turns the newest arXiv papers (data/papers/arxiv.json) into Reading Room digests.
   With ANTHROPIC_API_KEY set, Claude writes each digest from the abstract alone, and the result is checked before it is kept:
   every number in it must appear in the abstract, nothing may be hyped, every field must be present. A digest that fails twice
   is replaced by a plainer one assembled from the abstract's own sentences and marked automatic, so the page can say so.
   Without a key, every digest is the plain kind. The job runs every six hours but adds papers only until the day's quota is met.
   Env: ANTHROPIC_API_KEY, DIGEST_MODEL (default claude-sonnet-5-5), DIGESTS_PER_DAY (3), DIGEST_FORCE=1 to ignore the quota. */
import { createRequire } from 'node:module';
import { get, readJSON, writeJSON, ROOT } from './lib.mjs';
const require = createRequire(import.meta.url);
const REG = require(ROOT + '/js/registry.js'), A = require(ROOT + '/js/astro.js');

const KEY = process.env.ANTHROPIC_API_KEY, MODEL = process.env.DIGEST_MODEL || 'claude-sonnet-5-5';
const PER_DAY = Math.max(0, Math.min(10, +(process.env.DIGESTS_PER_DAY || 3))), KEEP = 400, TODAY = new Date().toISOString().slice(0, 10);
const CAT = { 'astro-ph.EP': 'planets', 'astro-ph.SR': 'stars', 'astro-ph.HE': 'high-energy astrophysics', 'astro-ph.GA': 'galaxies', 'astro-ph.CO': 'cosmology', 'astro-ph.IM': 'instruments and methods' };

const arx = readJSON('data/papers/arxiv.json', { papers: [] }) || { papers: [] };
const store = readJSON('data/papers/digests.json', { papers: [] }) || { papers: [] };
const GLOSS = (readJSON('data/glossary.json', { terms: [] }) || { terms: [] }).terms;
const CANON = (readJSON('data/papers/canon.json', { papers: [] }) || { papers: [] }).papers;
const have = new Set(store.papers.map(p => p.arxiv || String(p.id).replace('-', '.')));

/* ── which papers: fresh, readable, about things people ask about, spread across fields ── */
const INTEREST = /\b(jwst|webb|exoplanet|habitable|biosignature|atmospheres?|black holes?|neutron stars?|gravitational waves?|dark matter|dark energy|supernova|fast radio bursts?|frb|magnetar|pulsar|quasar|kilonova|mars|europa|enceladus|titan|venus|jupiter|saturn|uranus|neptune|pluto|moon|lunar|comet|asteroid|interstellar|milky way|andromeda|first galaxies|cosmic dawn|reioni[sz]ation|cosmic microwave|hubble tension|hubble constant|euclid|rubin|gaia|solar flare|sun|aurora|white dwarf|brown dwarf|star formation|trappist|proxima|oumuamua|3i\/atlas|voyager)\b/gi;
const DRY = /\b(pipeline|calibration|software package|data release|catalogue of|catalog of|user guide|technical note|erratum|corrigendum)\b/i;
function score(p) {
  const t = (p.t + ' ' + p.abs.slice(0, 600)).toLowerCase(), hits = new Set((t.match(INTEREST) || []).map(x => x.toLowerCase()));
  let s = Math.min(6, hits.size * 1.5);
  if (/published|accepted|in press/i.test(p.comment) || p.jref) s += 2.5;
  if (DRY.test(p.t)) s -= 3;
  if (p.abs.length < 500) s -= 4;
  if (p.by.length > 200) s -= 1;
  return s;
}
function choose(PER_RUN) {
  const fresh = arx.papers.filter(p => p.id && !have.has(p.id) && p.abs && Date.now() - new Date(p.date) < 12 * 864e5).map(p => ({ p, s: score(p) })).sort((a, b) => b.s - a.s || b.p.date.localeCompare(a.p.date));
  const out = [], cats = new Set();
  for (const { p } of fresh) { if (out.length >= PER_RUN) break; if (cats.has(p.cat) && fresh.length > PER_RUN * 2) continue; out.push(p); cats.add(p.cat); }
  for (const { p } of fresh) { if (out.length >= PER_RUN) break; if (!out.includes(p)) out.push(p); }
  return out;
}

/* ── terms and links are chosen by matching, never by the model ── */
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text, name) => name.length > 2 && new RegExp('(^|[^A-Za-z])' + esc(name) + '(?![A-Za-z])', 'i').test(text);
function termsFor(text) { return GLOSS.filter(g => [g.t].concat(g.aka || []).some(n => has(text, n))).map(g => g.id).slice(0, 4); }
const CANON_HINTS = [[/exoplanet|planet around/i, 'mayor-queloz-1995'], [/gravitational wave|binary black hole|ligo|virgo|kagra/i, 'ligo-2016'], [/pulsar timing|nanohertz/i, 'nanograv-2023'],
  [/dark matter/i, 'rubin-ford-1970'], [/cosmic microwave|\bcmb\b/i, 'penzias-wilson-1965'], [/hubble constant|hubble tension|expansion rate/i, 'riess-1998'], [/event horizon telescope|black hole shadow/i, 'eht-2019'],
  [/pulsar|neutron star/i, 'hewish-1968'], [/fast radio burst|\bfrb/i, 'lorimer-2007'], [/kuiper belt|trans-neptunian/i, 'jewitt-luu-1993'], [/interstellar (object|comet)|3i\/atlas|oumuamua/i, 'meech-2017'],
  [/enceladus/i, 'waite-2017'], [/europa/i, 'kivelson-2000'], [/gaia/i, 'gaia-2016'], [/quasar/i, 'schmidt-1963'], [/accretion dis[ck]/i, 'shakura-sunyaev-1973'], [/sgr a|galactic cent/i, 'ghez-2008'],
  [/high.redshift galax|first galaxies|cosmic dawn|z\s*[>~]\s*1[0-9]/i, 'carniani-2024'], [/solar wind|heliosphere/i, 'parker-1958'], [/oort cloud|long-period comet/i, 'oort-1950'], [/cepheid|distance ladder/i, 'leavitt-1912']];
function linksFor(p, R) {
  const text = p.t + ' ' + p.abs, out = [];
  for (const e of R.list) {
    if (out.length >= 2) break;
    if (!(e.group === 'solar' || e.group === 'craft' || (e.group === 'far' && e.note))) continue;
    if ([e.name].concat(e.alias || []).some(n => n.length > 3 && !/^(the |moon|sun|earth)$/i.test(n) && has(text, n))) out.push('obj:' + e.slug);
  }
  const c = CANON_HINTS.find(([re, id]) => re.test(text) && CANON.some(x => x.id === id)); if (c) out.push('canon:' + c[1]);
  return out.slice(0, 3);
}

/* ── the check every digest passes before it is kept ── */
const HYPE = /\b(breakthrough|revolutionar|stunning|game.?changing|groundbreaking|unprecedented|mind.?blowing|shocking|incredible)\w*/i;
const numbersIn = s => (String(s).replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(\.\d+)?/g) || []).filter(n => !/^(19|20)\d\d$/.test(n));
function check(d, p) {
  const src = (p.t + ' ' + p.abs + ' ' + p.comment + ' ' + p.jref).replace(/(\d),(\d{3})/g, '$1$2');
  for (const k of ['one', 'q', 'how', 'why', 'careful']) if (typeof d[k] !== 'string' || d[k].trim().length < 12) return 'missing or too short: ' + k;
  if (d.one.split(/\s+/).length > 34) return '"one" is too long';
  if (!Array.isArray(d.found) || d.found.length < 1 || d.found.length > 5 || d.found.some(f => !Array.isArray(f) || f.length !== 2 || f.some(x => typeof x !== 'string' || !x.trim()))) return '"found" must be 1 to 5 [label, value] pairs';
  const all = [d.one, d.q, d.how, d.why, d.careful].concat(d.found.flat()).join(' ');
  if (HYPE.test(all) || /!/.test(all)) return 'hype or exclamation marks';
  const bad = numbersIn(all).filter(n => !src.includes(n) && !['1', '2', '3', '4', '5', '10', '100', '1000'].includes(n));
  if (bad.length) return 'numbers not in the abstract: ' + [...new Set(bad)].slice(0, 5).join(', ');
  return null;
}

/* ── writing one with Claude ── */
function prompt(p, retry) {
  return `You write plain-language digests of new astronomy papers for a curious adult reader with no physics training. Work only from the abstract below. Do not add facts, numbers or claims that are not in it; if the abstract does not say something, leave it out.

Title: ${p.t}
Authors: ${p.by.slice(0, 8).join(', ')}${p.by.length > 8 ? ' and ' + (p.by.length - 8) + ' others' : ''}
Field: ${CAT[p.cat] || p.cat}
Comments: ${p.comment || 'none'}
Journal reference: ${p.jref || 'none'}
Abstract: ${p.abs}

Return one JSON object and nothing else, with exactly these keys:
"one": one sentence of at most 28 words saying what was found, in everyday words.
"q": two or three sentences on the question the work addresses and why it was open.
"how": two or three sentences on what the authors did: data, instrument or method, in everyday words.
"found": two to four pairs ["label", "value"] giving the key results. Labels at most five words. Values copied from the abstract, with numbers, units and uncertainties exactly as written there.
"why": one to three sentences on why it matters. Where it is the authors' claim, say so ("The authors suggest").
"careful": one or two specific sentences on what the abstract does not show, the main limitation, or what still needs confirming.
Style: British spelling. No hype words such as breakthrough, stunning or unprecedented. No exclamation marks. Explain any jargon you cannot avoid.${retry ? '\n\nYour previous answer was rejected because: ' + retry + '. Fix that.' : ''}`;
}
async function viaClaude(p) {
  let why = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await get('https://api.anthropic.com/v1/messages', { method: 'POST', timeout: 90000, retries: 1,
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1400, messages: [{ role: 'user', content: prompt(p, why) }] }) });
    const text = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    let d = null; try { d = JSON.parse(text.slice(a, b + 1)); } catch (e) { why = 'the answer was not valid JSON'; continue; }
    why = check(d, p); if (!why) return { one: d.one.trim(), q: d.q.trim(), how: d.how.trim(), found: d.found.map(f => [f[0].trim(), f[1].trim()]), why: d.why.trim(), careful: d.careful.trim(), model: MODEL };
    console.log('    rejected (' + why + ')' + (attempt ? ', using the plain digest' : ', asking again'));
  }
  return null;
}

/* ── the plain kind: the abstract's own sentences, reorganised ── */
function plain(p) {
  const S = p.abs.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z(])/).map(s => s.trim()).filter(s => s.length > 20);
  const trim = (s, n) => { const w = s.split(' '); return w.length > n ? w.slice(0, n).join(' ').replace(/[,;:]$/, '') + '…' : s; };
  const res = S.find(s => /\b(we (find|show|report|detect|discover|measure|confirm|demonstrate|identify)|our (results|analysis|observations|measurements) (show|reveal|indicate|suggest|imply)|(this|these) results? (show|indicate|suggest))\b/i.test(s)) || S[S.length - 1] || p.t;
  const how = S.filter(s => s !== res && /\b(we (use|used|analy[sz]e|model|perform|combine|obtain|observe|develop|present|carry out|conduct|compile|introduce)|using|based on|with data from)\b/i.test(s)).slice(0, 2);
  const q = S.filter(s => s !== res && !how.includes(s)).slice(0, 2);
  const nums = S.filter(s => s !== res && !how.includes(s) && !q.includes(s) && /\d/.test(s)).slice(0, 2);
  const cap = (s, n) => s.length > n ? s.slice(0, s.lastIndexOf(' ', n - 1)) + '…' : s;
  return { one: cap(trim(res, 40), 380), q: cap(q.join(' ') || p.t + '.', 1900), how: cap(how.join(' ') || 'The abstract does not describe the method in detail.', 1900), found: nums.map((s, i) => ['From the abstract' + (nums.length > 1 ? ' (' + (i + 1) + ')' : ''), trim(s, 60)]),
    why: '', careful: '', auto: true };
}

const shortBy = by => by.length <= 4 ? by.join(', ').replace(/, ([^,]*)$/, ' and $1') : by.slice(0, 3).join(', ') + ' and ' + (by.length - 3) + ' others';
async function main() {
  const done = store.papers.filter(p => p.added === TODAY).length, quota = process.env.DIGEST_FORCE ? PER_DAY : Math.max(0, PER_DAY - done);
  const picks = choose(quota);
  console.log('OWLT digests · ' + picks.length + ' new' + (done ? ' (' + done + ' already today)' : '') + (KEY ? ' · written with ' + MODEL : ' · no API key, plain digests'));
  if (!picks.length) return;
  const R = REG.build({ solar: readJSON('data/catalog/solar.json'), structures: readJSON('data/catalog/structures.json'), stars: { cols: [], rows: [] }, exo: { cols: [], rows: [] }, messier: [], galaxies: { cols: [], rows: [] } }, A);
  const made = [];
  for (const p of picks) {
    let d = null;
    if (KEY) { try { d = await viaClaude(p); } catch (e) { console.log('    API error: ' + e.message); } }
    if (!d) d = plain(p);
    const text = [d.one, d.q, d.how, d.why, d.careful].join(' ');
    made.push({ id: p.id.replace('.', '-').replace('/', '-'), arxiv: p.id, t: p.t, by: shortBy(p.by), date: p.date, added: TODAY, cat: p.cat,
      status: p.jref ? (p.comment ? p.comment.replace(/\.?$/, '. ') : '') + 'Published in ' + p.jref : p.comment || '', url: 'https://arxiv.org/abs/' + p.id,
      ...d, terms: termsFor(text + ' ' + p.t), links: linksFor(p, R) });
    console.log('  + ' + p.id + ' ' + (d.auto ? '[plain] ' : '') + p.t.slice(0, 70));
  }
  const papers = made.concat(store.papers).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, KEEP);
  writeJSON('data/papers/digests.json', { note: store.note || 'Plain-language digests of new papers, written from their arXiv abstracts.', papers });
}
export { check, plain, numbersIn, termsFor };
if (process.argv[1] && process.argv[1].endsWith('digest.mjs')) main().catch(e => { console.error(e); process.exit(1); });

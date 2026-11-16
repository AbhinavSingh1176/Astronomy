/* OWLT · scripts/lib.mjs — shared plumbing for the refresh jobs. Node 20+, no dependencies.
   Set OWLT_MOCK=http://127.0.0.1:9911 to send every request to the local mock server (tests/mock-server.mjs). */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* who is asking: GitHub Actions sets GITHUB_REPOSITORY, so the services can see which site the requests come from */
export const UA = 'OWLT/1.0 (personal astronomy site' + (process.env.GITHUB_REPOSITORY ? '; https://github.com/' + process.env.GITHUB_REPOSITORY : '') + ')';

/* fetch with a time budget and a couple of polite retries */
export async function get(url, { type = 'json', timeout = 20000, headers = {}, retries = 2, method = 'GET', body } = {}) {
  const target = process.env.OWLT_MOCK ? process.env.OWLT_MOCK.replace(/\/$/, '') + '/' + url.replace(/^https?:\/\//, '') : url;
  let last;
  for (let i = 0; i <= retries; i++) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout);
    try {
      const r = await fetch(target, { method, body, signal: ac.signal, headers: { 'user-agent': UA, accept: type === 'json' ? 'application/json' : '*/*', ...headers } });
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.fatal = true; e.status = r.status; e.body = (await r.text().catch(() => '')).slice(0, 400); throw e; }
      return type === 'json' ? await r.json() : await r.text();
    } catch (e) {
      last = e; if (e.fatal) break;
      await new Promise(res => setTimeout(res, 1500 * (i + 1)));
    } finally { clearTimeout(t); }
  }
  throw last;
}

export const file = p => path.join(ROOT, p);
export function readJSON(p, fallback = null) { try { return JSON.parse(readFileSync(file(p), 'utf8')); } catch (e) { return fallback; } }
/* write atomically, and only when the content (ignoring the timestamp) changed */
export function writeJSON(p, obj, { stampKey = 'fetched' } = {}) {
  const f = file(p); mkdirSync(path.dirname(f), { recursive: true });
  const prev = readJSON(p);
  const strip = o => { if (!o || typeof o !== 'object') return o; const c = { ...o }; delete c[stampKey]; return JSON.stringify(c); };
  if (prev && strip(prev) === strip(obj)) return false;
  writeFileSync(f + '.tmp', JSON.stringify(obj, null, 1) + '\n'); renameSync(f + '.tmp', f); return true;
}

/* text from the outside world: no tags, no entities, bounded */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', deg: '°', times: '×', minus: '−', plusmn: '±', micro: 'µ' };
export function decode(s) {
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
export function clean(s, max = 2000) {
  let t = decode(s).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  t = decode(t).replace(/\s+/g, ' ').replace(/\s+([.,;:!?)])/g, '$1').replace(/\(\s+/g, '(').trim();
  if (t.length > max) { t = t.slice(0, max); const i = t.lastIndexOf(' '); t = t.slice(0, i > max * 0.7 ? i : max) + '…'; }
  return t;
}
export function safeUrl(u) { try { const x = new URL(String(u).trim()); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; } }
export function iso(d) { const x = new Date(d); return isNaN(x) ? null : x.toISOString(); }

/* the smallest XML reader that does the job for Atom, RSS and the DSN feed */
export function blocks(xml, tag) {
  const out = [], re = new RegExp('<' + tag + '(\\s[^>]*)?(?:/>|>([\\s\\S]*?)</' + tag + '>)', 'g'); let m;
  while ((m = re.exec(xml))) out.push({ attrs: attrs(m[1] || ''), inner: m[2] || '' });
  return out;
}
export function attrs(s) { const o = {}, re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g; let m; while ((m = re.exec(s))) o[m[1]] = decode(m[3] ?? m[4]); return o; }
export function first(xml, tag) { const b = blocks(xml, tag)[0]; return b ? b.inner : ''; }

/* run several sources at once; each one either replaces its file or leaves the last good one in place */
export async function runAll(sources) {
  const status = readJSON('data/status.json', { sources: {} }) || { sources: {} };
  status.sources = status.sources || {};
  const results = await Promise.allSettled(sources.map(async s => {
    const t0 = Date.now(), data = await s.run();
    const n = s.count ? s.count(data) : Array.isArray(data) ? data.length : 1;
    if (s.min != null && n < s.min) throw new Error('only ' + n + ' items, expected at least ' + s.min);
    const changed = writeJSON(s.file, data);
    return { name: s.name, n, ms: Date.now() - t0, changed };
  }));
  results.forEach((r, i) => {
    const s = sources[i], prev = status.sources[s.name] || {};
    if (r.status === 'fulfilled') status.sources[s.name] = { ok: true, at: new Date().toISOString(), n: r.value.n, file: s.file, source: s.label };
    else status.sources[s.name] = { ...prev, ok: false, tried: new Date().toISOString(), error: String(r.reason && r.reason.message || r.reason).slice(0, 200), file: s.file, source: s.label };
    console.log((r.status === 'fulfilled' ? '  ok   ' : '  FAIL ') + s.name.padEnd(14) + (r.status === 'fulfilled' ? r.value.n + ' items' + (r.value.changed ? '' : ' (unchanged)') + ' ' + r.value.ms + ' ms' : status.sources[s.name].error));
  });
  status.run = new Date().toISOString();
  writeFileSync(file('data/status.json'), JSON.stringify(status, null, 1) + '\n');
  return results;
}

/* ── Astronomy Picture of the Day ──
   In 2026 NASA moved APOD to science.nasa.gov/apod. The api.nasa.gov feed still reads the old pages: it fails when asked for
   video thumbnails and otherwise returns the site's logo, titled "NASA Science", for every date. So the page itself is read,
   and every answer, from the page or from the feed, has to pass apodCheck before it is kept. */
export const APOD_PAGE = 'https://science.nasa.gov/apod/';
const APOD_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const APOD_HOSTS = /^(apod\.nasa\.gov|science\.nasa\.gov|assets\.science\.nasa\.gov|(www\.)?youtube(-nocookie)?\.com|youtu\.be|(player\.)?vimeo\.com)$/;
export function apodFromPage(html) {
  const pick = (re, s = html) => (String(s).match(re) || [])[1] || '';
  const row = label => {
    const m = html.match(new RegExp('<th[^>]*>\\s*(' + label + ')\\s*:\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>', 'i'));
    return m ? { label: decode(m[1]), value: clean(m[2].replace(/<br\s*\/?>/gi, ' '), 300) } : null;
  };
  const when = row('Date'), credit = row('Credit(?:\\s*(?:&amp;|&)\\s*Copyright)?');
  const dm = when && when.value.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/), mi = dm ? APOD_MONTHS.indexOf(dm[1].toLowerCase()) : -1;
  const fig = pick(/(<figure class="hds-media-inner[\s\S]*?<\/figure>)/);
  const video = decode(pick(/<iframe[^>]*?\ssrc="([^"]+)"/, fig)), img = decode(pick(/<img[^>]*?\ssrc="([^"]+)"/, fig));
  return {
    date: mi < 0 ? null : dm[3] + '-' + String(mi + 1).padStart(2, '0') + '-' + dm[2].padStart(2, '0'),
    title: clean(pick(/<h2 class="display-48[^"]*">([\s\S]*?)<\/h2>/), 200),
    text: clean(pick(/<strong>\s*Explanation:\s*<\/strong>([\s\S]*?)<\/p>/i), 3000),
    media: video ? 'video' : img ? 'image' : 'other',
    url: safeUrl(video || img), hd: !video && img ? safeUrl(img.split('?')[0]) : null, thumb: video && img ? safeUrl(img) : null,
    /* NASA labels the row "Credit & Copyright" when someone holds the copyright, and just "Credit" when nobody does */
    credit: credit && /copyright/i.test(credit.label) ? credit.value : null, by: credit ? credit.value : null, hasCredit: !!credit,
    page: safeUrl(pick(/href="(https:\/\/science\.nasa\.gov\/image-article\/apod-[^"]+)"/, fig)) || APOD_PAGE
  };
}
export function apodCheck(day) {
  const host = u => { try { return new URL(u).hostname; } catch (e) { return ''; } };
  const why = !day ? 'nothing read' : !/^\d{4}-\d\d-\d\d$/.test(day.date || '') ? 'no date' : !day.title || /^nasa science$/i.test(day.title) ? 'no real title'
    : (day.text || '').length < 80 ? 'no explanation' : day.hasCredit === false ? 'no credit line' : !/^(image|video)$/.test(day.media) ? 'neither an image nor a video'
    : !day.url || !APOD_HOSTS.test(host(day.url)) || /logo/i.test(day.url) ? 'the picture is not from APOD (' + (day.url || 'none') + ')' : '';
  if (why) throw new Error(why);
  const { hasCredit, ...kept } = day; return kept;
}

/* ── the Gallery: one slide from the NASA Image and Video Library ──
   NASA's titles are sometimes a catalogue number or a programme name ("Saturn Apollo Program"); then the first sentence of the
   description is the title. Descriptions lose their HTML, the "art002e021278 (April 6, 2026) –" lead and the trailing credit line. */
const NASA_GENERIC = /^(saturn apollo program|space science|space shuttle projects|mercury project|around marshall|n\/a|untitled|image)$/i;
const NASA_CENTERS = { JPL: 'NASA/JPL-Caltech', GSFC: 'NASA Goddard', JSC: 'NASA Johnson', KSC: 'NASA Kennedy', ARC: 'NASA Ames', MSFC: 'NASA Marshall', HQ: 'NASA', GRC: 'NASA Glenn', LaRC: 'NASA Langley', AFRC: 'NASA Armstrong', SSC: 'NASA Stennis' };
export function firstSentence(t, max = 110) {
  const s = String(t || '').split(/(?<=[a-z0-9)”"'])\.\s+(?=[A-Z])/)[0].replace(/\.$/, '');
  if (s.length <= max) return s; const cut = s.slice(0, max); return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}
export function nasaSlide(want, d, img, thumb) {
  let text = want.text || clean(String(d.description || d.description_508 || '').replace(/<br\s*\/?>/gi, ' '), 4000);
  /* the photo lab's lead-ins: "S84-27017 (7 Feb. 1984) ---", "KENNEDY SPACE CENTER, Fla. --", "P-21742 C Range: 6 million kilometers (3.72 million miles)" */
  for (let i = 0; i < 4; i++) text = text.replace(/^[\w.-]+\s*\([^)]{4,40}\)\s*(?:-{1,3}|[–—])\s*/, '').replace(/^[A-Z][A-Z .,'’-]{2,40},\s*(?:Fla|Calif|Texas|Tex|Ala|Md|Va|D\.C|Ohio|Colo|Ariz)\.?\s*(?:-{1,3}|[–—])\s*/, '')
    .replace(/^(?:P-\d+\s*[A-Z]{0,2}\s+|(?:Range|Resolution):\s*[\d.,]+\s*(?:million\s+)?(?:kilometers|km|miles|mi)\.?(?:\s*\([^)]*\))?\s*)/i, '');
  text = text.replace(/\s*(Image\s+)?Credits?:\s*[^.]*\.?\s*$/i, '').trim();
  let title = want.title || clean(d.title, 160).replace(/^Apollo \d+ Mission image\s*[-,]\s*/i, '').replace(/,(?=[A-Za-z])/g, ', ');
  const letters = title.replace(/[^A-Za-z]/g, ''), shouting = letters.length > 8 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.8;
  if (!want.title && (!title || shouting || NASA_GENERIC.test(title) || title.toLowerCase() === String(d.nasa_id).toLowerCase() || /^[A-Z]{2,6}[-_]?\d|^\d{5,}|^[a-z0-9]+(_[a-z0-9]+)+$/i.test(title))) title = firstSentence(text, 110) || title;
  if (title.length > 110) title = firstSentence(title, 110);
  const by = clean(d.photographer || d.secondary_creator || '', 120);
  const date = want.date !== undefined ? want.date : (String(d.date_created || '').slice(0, 10) || null);
  if (text.length > 900) { const cut = text.slice(0, 900); text = cut.slice(0, Math.max(cut.lastIndexOf('. ') + 1, 600)) || cut; }
  return { id: d.nasa_id, title, date, text, credit: by || NASA_CENTERS[d.center] || 'NASA', center: d.center || null, img: safeUrl(img), thumb: safeUrl(thumb || img),
    page: 'https://images.nasa.gov/details/' + encodeURIComponent(d.nasa_id), ...(want.obj ? { obj: want.obj } : {}) };
}

/* ── TeX in titles and abstracts: arXiv keeps authors' markup ("SiO$_2$", "$10^{10}\,M_\odot$"). Readers get plain Unicode instead:
   Greek letters and common symbols, sub- and superscripts where Unicode has the characters, and the markup itself removed. ── */
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ', s: 'ₛ', t: 'ₜ', i: 'ᵢ', j: 'ⱼ', r: 'ᵣ', u: 'ᵤ', v: 'ᵥ' };
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };
const SYM = { alpha: 'α', beta: 'β', gamma: 'γ', Gamma: 'Γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', Theta: 'Θ', iota: 'ι',
  kappa: 'κ', lambda: 'λ', Lambda: 'Λ', mu: 'μ', nu: 'ν', xi: 'ξ', Xi: 'Ξ', pi: 'π', Pi: 'Π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ',
  Phi: 'Φ', chi: 'χ', psi: 'ψ', Psi: 'Ψ', omega: 'ω', Omega: 'Ω', ell: 'ℓ', odot: '☉', sun: '☉', oplus: '⊕', earth: '⊕', star: '⋆', sim: '~', simeq: ' ≃ ', approx: ' ≈ ',
  propto: ' ∝ ', lesssim: ' ≲ ', gtrsim: ' ≳ ', le: ' ≤ ', leq: ' ≤ ', ge: ' ≥ ', geq: ' ≥ ', ll: ' ≪ ', gg: ' ≫ ', neq: ' ≠ ', ne: ' ≠ ', times: '×', pm: '±', mp: '∓',
  cdot: '·', circ: '°', deg: '°', infty: '∞', partial: '∂', nabla: '∇', rightarrow: ' → ', to: ' → ', leftarrow: ' ← ', parallel: '∥', perp: '⊥', prime: '′', AA: 'Å', angstrom: 'Å',
  log: 'log', ln: 'ln', exp: 'exp', sin: 'sin', cos: 'cos', max: 'max', min: 'min', quad: ' ', qquad: ' ', ldots: '…', dots: '…', cdots: '…' };
const BARE = new Set(['☉', '⊕', '⋆', '*', '∥', '⊥', '′', '°']);
function script(body, map) {
  const t = body.trim(); if (!t) return '';
  if ([...t].every(c => map[c])) return [...t].map(c => map[c]).join('');
  if ([...t].length === 1 && BARE.has(t)) return t;
  return (map === SUP ? '\u0002' : '\u0001') + t;                 /* no Unicode for it: written plainly, as M_BH or 10^-1.5 */
}
function mathText(m) {
  let s = m, prev;
  do { prev = s; s = s.replace(/\\(?:mathrm|rm|text|textrm|mathbf|textbf|textit|mathit|mathcal|mathbb|mathsf|texttt|emph|operatorname|bm|boldsymbol)\s*\{([^{}]*)\}/g, '$1').replace(/\{\\(?:rm|it|bf|sf|tt)\s+([^{}]*)\}/g, '{$1}'); } while (s !== prev);
  s = s.replace(/\\(?:rm|it|bf|sf|tt|left|right|big|Big|displaystyle)\b\s*/g, '').replace(/\\([,;:! ])/g, (x, c) => c === '!' ? '' : ' ').replace(/\\([%&#_$])/g, '$1');
  s = s.replace(/\\([A-Za-z]+)\s?/g, (x, n) => SYM[n] != null ? SYM[n] : n);
  for (let i = 0; i < 3; i++) s = s.replace(/\^\s*\{([^{}]*)\}|\^\s*(\\?.)/g, (x, a, b) => script(a != null ? a : b, SUP)).replace(/_\s*\{([^{}]*)\}|_\s*(\\?.)/g, (x, a, b) => script(a != null ? a : b, SUB));
  return s.replace(/[{}]/g, '').replace(/\u0001/g, '_').replace(/\u0002/g, '^').replace(/ {2,}/g, ' ');
}
export function detex(str) {
  if (typeof str !== 'string' || !/[$\\]/.test(str)) return str;
  /* only what is plainly mathematics: markup inside, or one short token like $z$; "$5 and $10" is money and stays */
  let s = str.replace(/\$\$?([^$]{1,200}?)\$\$?/g, (x, m) => /[\\_^{}]/.test(m) || /^\S{1,12}$/.test(m) ? mathText(m) : x);
  s = s.replace(/\\(?:textit|textbf|texttt|emph|textrm|textsc|mathrm|text)\s*\{([^{}]*)\}/g, '$1').replace(/\\([%&#_])/g, '$1').replace(/\\(alpha|beta|gamma|delta|mu|nu|sigma|sim|times|pm|odot|approx)\b\s?/g, (x, n) => SYM[n]);
  s = s.replace(/\\([A-Z][A-Za-z]+)\b/g, '$1');                                   /* an author's own macro, like \Euclid: keep the word */
  return s.replace(/ {2,}/g, ' ').replace(/ ([,.;:)])/g, '$1').trim();
}

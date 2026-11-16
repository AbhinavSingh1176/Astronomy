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
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.fatal = true; throw e; }
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

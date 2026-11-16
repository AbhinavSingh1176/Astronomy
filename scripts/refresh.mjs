#!/usr/bin/env node
/* OWLT · scripts/refresh.mjs — pulls the day's outside data into data/*.json. Run by .github/workflows/site.yml every six hours.
   Every source is independent: one that fails keeps yesterday's file and is marked in data/status.json.
   Optional secret: NASA_API_KEY (APOD; DEMO_KEY works at low volume).   node scripts/refresh.mjs [source …] */
import { createHash } from 'node:crypto';
import { get, readJSON, clean, decode, safeUrl, iso, blocks, attrs, first, runAll } from './lib.mjs';

const now = () => new Date().toISOString();
const hash = s => createHash('sha1').update(String(s)).digest('hex').slice(0, 12);

/* ── research: the newest astro-ph submissions ── */
const ARXIV_CATS = ['astro-ph.EP', 'astro-ph.SR', 'astro-ph.HE', 'astro-ph.GA', 'astro-ph.CO', 'astro-ph.IM'];
async function arxiv() {
  const q = ARXIV_CATS.map(c => 'cat:' + c).join('+OR+');
  const xml = await get(`https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&start=0&max_results=250`, { type: 'text', timeout: 45000 });
  const papers = [];
  for (const e of blocks(xml, 'entry')) {
    const x = e.inner, id = (first(x, 'id').match(/abs\/([^v\s<]+)(v\d+)?/) || [])[1];
    if (!id) continue;
    const pc = (x.match(/<arxiv:primary_category[^>]*term="([^"]+)"/) || [])[1] || '';
    papers.push({ id, t: clean(first(x, 'title'), 400), by: blocks(x, 'author').map(a => clean(first(a.inner, 'name'), 120)).filter(Boolean).slice(0, 60),
      date: (first(x, 'published') || '').slice(0, 10), cat: pc, abs: clean(first(x, 'summary'), 4000), comment: clean(first(x, 'arxiv:comment'), 400),
      jref: clean(first(x, 'arxiv:journal_ref'), 300), doi: clean(first(x, 'arxiv:doi'), 120) });
  }
  return { fetched: now(), source: 'arXiv API (export.arxiv.org)', papers };
}

/* ── news: an aggregator plus the agencies and observatories directly ── */
const FEEDS = [
  ['ESA', 'https://www.esa.int/rssfeed/Our_Activities/Space_Science'],
  ['ESO', 'https://www.eso.org/public/news/feed/'],
  ['NASA', 'https://www.nasa.gov/news-release/feed/'],
  ['NOIRLab', 'https://noirlab.edu/public/news/feed/'],
  ['Universe Today', 'https://www.universetoday.com/feed/'],
  ['Sky & Telescope', 'https://skyandtelescope.org/astronomy-news/feed/']
];
const DESKS = [['launch', /\b(launch(es|ed)?|rocket|liftoff|booster|starship|falcon|ariane|vega|h3|pslv|gslv|lvm3|long march|soyuz|electron|neutron|new glenn|vulcan|kuiper|starlink|static fire)\b/i],
  ['missions', /\b(mission|spacecraft|probe|orbiter|lander|rover|flyby|astronaut|crew|iss|space station|tiangong|artemis|gateway|perseverance|curiosity|juice|clipper|psyche|lucy|bepicolombo|hayabusa|chang.?e|chandrayaan|aditya|voyager|new horizons|osiris|dart|hera)\b/i],
  ['astronomy', /\b(galax|star|nebula|black hole|exoplanet|planet|telescope|webb|jwst|hubble|euclid|rubin|alma|supernova|quasar|pulsar|universe|cosmic|dark (matter|energy)|gravitational|asteroid|comet|meteor|eclipse|aurora)\b/i],
  ['policy', /\b(budget|congress|contract|funding|policy|agency|administrator|director|company|startup|ipo|acquire|regulat|faa|fcc|treaty)\b/i]];
const WHO = [['NASA', /\bnasa\b/i], ['ESA', /\besa\b|european space agency/i], ['JAXA', /\bjaxa\b|japan/i], ['ISRO', /\bisro\b|india/i], ['CNSA', /\bcnsa\b|china|chinese/i],
  ['Roscosmos', /roscosmos|russia/i], ['Israel', /israel|\bisa\b|spaceil|beresheet/i], ['UAE', /\buae\b|emirates|mbrsc/i], ['KASA', /\bkasa\b|\bkari\b|korea/i],
  ['SpaceX', /spacex|starship|falcon/i], ['Rocket Lab', /rocket lab/i], ['Blue Origin', /blue origin|new glenn|new shepard/i], ['ESO', /\beso\b|european southern observatory|very large telescope/i]];
const deskOf = t => (DESKS.find(d => d[1].test(t)) || ['other'])[0];
async function rss(site, url) {
  const xml = await get(url, { type: 'text', timeout: 20000, retries: 1 });
  const items = blocks(xml, 'item').concat(blocks(xml, 'entry'));
  return items.slice(0, 25).map(b => {
    const x = b.inner, link = safeUrl(clean(first(x, 'link'), 600)) || safeUrl((blocks(x, 'link')[0] || { attrs: {} }).attrs.href);
    return { t: clean(first(x, 'title'), 240), url: link, site, date: iso(clean(first(x, 'pubDate') || first(x, 'published') || first(x, 'updated') || first(x, 'dc:date'), 60)),
      sum: clean(first(x, 'description') || first(x, 'summary') || first(x, 'content'), 420) };
  });
}
async function news() {
  const jobs = [get('https://api.spaceflightnewsapi.net/v4/articles/?limit=60&ordering=-published_at').then(j => (j.results || []).map(a => ({
    t: clean(a.title, 240), url: safeUrl(a.url), site: clean(a.news_site, 60), date: iso(a.published_at), sum: clean(a.summary, 420) })))]
    .concat(FEEDS.map(([site, url]) => rss(site, url)));
  const res = await Promise.allSettled(jobs), all = [], seen = new Set(), feeds = {};
  res.forEach((r, i) => { const name = i === 0 ? 'Spaceflight News API' : FEEDS[i - 1][0]; feeds[name] = r.status === 'fulfilled' ? r.value.length : 'failed'; if (r.status === 'fulfilled') all.push(...r.value); });
  if (!all.length) throw new Error('every news feed failed');
  const key = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 3).slice(0, 7).join(' ');
  const items = all.filter(a => a.t && a.url && a.date && Date.now() - new Date(a.date) < 21 * 864e5).sort((a, b) => b.date.localeCompare(a.date))
    .filter(a => { const k = key(a.t); if (seen.has(a.url) || seen.has(k)) return false; seen.add(a.url); seen.add(k); return true; }).slice(0, 90)
    .map(a => { const txt = a.t + ' ' + a.sum; return { id: hash(a.url), ...a, desk: deskOf(txt), who: WHO.filter(w => w[1].test(txt)).map(w => w[0]).slice(0, 4) }; });
  return { fetched: now(), source: 'Spaceflight News API and agency feeds', feeds, items };
}

/* ── launches: Launch Library 2 ── */
function launch(l) {
  const st = l.status || {}, lsp = l.launch_service_provider || {}, m = l.mission || {}, pad = l.pad || {}, conf = (l.rocket && l.rocket.configuration) || {};
  return { id: String(l.id || l.slug || hash(l.name)), name: clean(l.name, 160), net: iso(l.net), win: [iso(l.window_start), iso(l.window_end)], prec: l.net_precision ? clean(l.net_precision.name, 40) : null,
    status: clean(st.abbrev || st.name, 30), statusName: clean(st.name, 60), provider: clean(lsp.name || l.lsp_name, 100), ptype: clean(lsp.type && (lsp.type.name || lsp.type), 40),
    country: clean((pad.country && (pad.country.alpha_2_code || pad.country.name)) || (pad.location && (pad.location.country_code || (pad.location.country && pad.location.country.alpha_2_code))) || '', 20),
    rocket: clean(conf.full_name || conf.name || '', 100), mission: clean(m.name || '', 160), mtype: clean(m.type || l.mission_type || '', 60), orbit: clean((m.orbit && (m.orbit.name || m.orbit.abbrev)) || l.orbit || '', 60),
    desc: clean(m.description || '', 420), pad: clean(pad.name || '', 120), loc: clean((pad.location && pad.location.name) || l.location || '', 120),
    fail: clean(l.failreason || '', 300) || null, url: safeUrl((l.info_urls && l.info_urls[0] && l.info_urls[0].url) || (l.vid_urls && l.vid_urls[0] && l.vid_urls[0].url) || '') };
}
async function launches() {
  const [up, prev] = await Promise.all([get('https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=40&hide_recent_previous=true'), get('https://ll.thespacedevs.com/2.3.0/launches/previous/?limit=20')]);
  return { fetched: now(), source: 'Launch Library 2 (The Space Devs)', upcoming: (up.results || []).map(launch).filter(l => l.net), recent: (prev.results || []).map(launch).filter(l => l.net) };
}

/* ── space weather: NOAA Space Weather Prediction Center ── */
const table = j => { if (!Array.isArray(j) || !j.length) return []; if (Array.isArray(j[0])) { const h = j[0]; return j.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); } return j; };
const num = v => { const x = parseFloat(v); return isFinite(x) ? x : null; };
const swTime = s => iso(String(s || '').replace(' ', 'T').replace(/(\.\d+)?$/, '') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
const xclass = f => { if (!(f > 0)) return null; const L = [['X', 1e-4], ['M', 1e-5], ['C', 1e-6], ['B', 1e-7], ['A', 1e-8]].find(c => f >= c[1]) || ['A', 1e-8]; return L[0] + (f / L[1]).toFixed(1); };
function hourly(rows, tk, vk, agg) {
  const by = {}; for (const r of rows) { const t = swTime(r[tk]), v = num(r[vk]); if (!t || v == null) continue; const h = t.slice(0, 13); (by[h] = by[h] || []).push(v); }
  return Object.keys(by).sort().slice(-24).map(h => [h + ':00:00Z', +(agg === 'max' ? Math.max(...by[h]) : by[h].reduce((a, b) => a + b, 0) / by[h].length).toPrecision(4)]);
}
async function spaceweather() {
  const B = 'https://services.swpc.noaa.gov/';
  const [kp, plasma, mag, xr, sc] = await Promise.allSettled([get(B + 'products/noaa-planetary-k-index.json'), get(B + 'products/solar-wind/plasma-1-day.json'),
    get(B + 'products/solar-wind/mag-1-day.json'), get(B + 'json/goes/primary/xrays-1-day.json'), get(B + 'products/noaa-scales.json')]);
  const out = { fetched: now(), source: 'NOAA Space Weather Prediction Center' }; let ok = 0;
  if (kp.status === 'fulfilled') { const rows = table(kp.value).map(r => [swTime(r.time_tag), num(r.Kp ?? r.kp ?? r.kp_index)]).filter(r => r[0] && r[1] != null).slice(-24); if (rows.length) { out.kp = { now: rows[rows.length - 1][1], at: rows[rows.length - 1][0], series: rows }; ok++; } }
  if (plasma.status === 'fulfilled') { const rows = table(plasma.value); const last = [...rows].reverse().find(r => num(r.speed) != null);
    if (last) { out.wind = { speed: num(last.speed), density: num(last.density), temp: num(last.temperature), at: swTime(last.time_tag), series: hourly(rows, 'time_tag', 'speed') }; ok++; } }
  if (mag.status === 'fulfilled') { const rows = table(mag.value); const last = [...rows].reverse().find(r => num(r.bz_gsm) != null);
    if (last) { out.mag = { bz: num(last.bz_gsm), bt: num(last.bt), at: swTime(last.time_tag), series: hourly(rows, 'time_tag', 'bz_gsm') }; ok++; } }
  if (xr.status === 'fulfilled') { const rows = (Array.isArray(xr.value) ? xr.value : []).filter(r => r.energy === '0.1-0.8nm' && num(r.flux) != null);
    if (rows.length) { const last = rows[rows.length - 1], mx = rows.reduce((a, b) => num(b.flux) > num(a.flux) ? b : a);
      out.xray = { flux: num(last.flux), cls: xclass(num(last.flux)), at: swTime(last.time_tag), max24: { flux: num(mx.flux), cls: xclass(num(mx.flux)), at: swTime(mx.time_tag) }, series: hourly(rows, 'time_tag', 'flux', 'max') }; ok++; } }
  if (sc.status === 'fulfilled' && sc.value && sc.value['0']) { const c = sc.value['0'], s = k => ({ scale: num(c[k] && c[k].Scale) || 0, text: clean(c[k] && c[k].Text, 40) || 'none' }); out.scales = { R: s('R'), S: s('S'), G: s('G'), at: iso((c.DateStamp || '') + 'T' + (c.TimeStamp || '00:00:00') + 'Z') }; ok++; }
  if (!ok) throw new Error('no space-weather product could be read');
  return out;
}

/* ── orbital elements: CelesTrak ── */
function tles(txt) {
  const L = String(txt).split(/\r?\n/).map(s => s.trimEnd()).filter(Boolean), out = [];
  const sum = l => { let s = 0; for (const ch of l.slice(0, 68)) s += ch === '-' ? 1 : /\d/.test(ch) ? +ch : 0; return s % 10 === +l[68]; };
  for (let i = 0; i + 2 < L.length + 1; i++) if (L[i + 1] && L[i + 2] && L[i + 1].startsWith('1 ') && L[i + 2].startsWith('2 ') && L[i + 1].length >= 69 && L[i + 2].length >= 69 && sum(L[i + 1]) && sum(L[i + 2])) {
    out.push({ name: clean(L[i], 60), norad: parseInt(L[i + 1].slice(2, 7), 10), l1: L[i + 1].slice(0, 69), l2: L[i + 2].slice(0, 69) }); i += 2; }
  return out;
}
async function tle() {
  const [st, hst] = await Promise.allSettled([get('https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle', { type: 'text' }), get('https://celestrak.org/NORAD/elements/gp.php?CATNR=20580&FORMAT=tle', { type: 'text' })]);
  const sats = (st.status === 'fulfilled' ? tles(st.value) : []).concat(hst.status === 'fulfilled' ? tles(hst.value) : []);
  if (!sats.some(s => s.norad === 25544)) throw new Error('no ISS elements in the response');
  return { fetched: now(), source: 'CelesTrak', sats: sats.slice(0, 40) };
}

/* ── close approaches: NASA/JPL Center for Near-Earth Object Studies ── */
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
async function neo() {
  const j = await get('https://ssd-api.jpl.nasa.gov/cad.api?date-min=now&date-max=%2B60&dist-max=0.05&sort=date');
  const f = j.fields || [], ix = k => f.indexOf(k);
  const items = (j.data || []).map(r => {
    const cd = String(r[ix('cd')] || ''), m = cd.match(/(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})/), H = num(r[ix('h')]), au = num(r[ix('dist')]);
    return { des: clean(r[ix('des')], 40), when: m ? `${m[1]}-${MON[m[2]] || '01'}-${m[3]}T${m[4]}:${m[5]}:00Z` : null, au, ld: au != null ? +(au * 389.17).toFixed(2) : null,
      kms: num(r[ix('v_rel')]), h: H, size: H != null ? [Math.round(1329e3 / Math.sqrt(0.25) * Math.pow(10, -H / 5)), Math.round(1329e3 / Math.sqrt(0.05) * Math.pow(10, -H / 5))] : null };
  }).filter(x => x.when && x.au != null);
  return { fetched: now(), source: 'NASA/JPL CNEOS close-approach data', note: 'Sizes are a range from brightness alone (albedo 0.25 to 0.05).', items: items.slice(0, 60) };
}

/* ── astronomy picture of the day ── */
async function apod() {
  const j = await get('https://api.nasa.gov/planetary/apod?thumbs=true&api_key=' + (process.env.NASA_API_KEY || 'DEMO_KEY'));
  if (!j || !j.date || !j.title) throw new Error('no APOD entry');
  const prev = readJSON('data/apod.json', { days: [] }) || { days: [] };
  const day = { date: j.date, title: clean(j.title, 200), text: clean(j.explanation, 3000), media: clean(j.media_type, 20), url: safeUrl(j.url), hd: safeUrl(j.hdurl), thumb: safeUrl(j.thumbnail_url),
    credit: j.copyright ? clean(j.copyright, 200) : null, page: 'https://apod.nasa.gov/apod/ap' + j.date.slice(2).replace(/-/g, '') + '.html' };
  const days = [day].concat((prev.days || []).filter(d => d.date !== day.date)).slice(0, 14);
  return { fetched: now(), source: 'NASA Astronomy Picture of the Day', days };
}

/* ── the Deep Space Network, right now ── */
const DSN_NAMES = { VGR1: 'Voyager 1', VGR2: 'Voyager 2', JWST: 'James Webb Space Telescope', NHPC: 'New Horizons', MRO: 'Mars Reconnaissance Orbiter', MVN: 'MAVEN', M20: 'Perseverance',
  MSL: 'Curiosity', ODY: 'Mars Odyssey', JNO: 'Juno', EMM: 'Hope (UAE)', TGO: 'ExoMars Trace Gas Orbiter', MEX: 'Mars Express', LRO: 'Lunar Reconnaissance Orbiter', KPLO: 'Danuri (Korea)',
  SOHO: 'SOHO', ACE: 'ACE', WIND: 'Wind', STA: 'STEREO-A', PSYC: 'Psyche', EURC: 'Europa Clipper', LUCY: 'Lucy', SPP: 'Parker Solar Probe', BEPI: 'BepiColombo', JUCE: 'JUICE',
  CH3: 'Chandrayaan-3', CHDR: 'Chandrayaan-2', TESS: 'TESS', GAIA: 'Gaia', EUCL: 'Euclid', DSCO: 'DSCOVR', CAPS: 'CAPSTONE', ORX: 'OSIRIS-APEX', HYB2: 'Hayabusa2', SLIM: 'SLIM', BIOS: 'BioSentinel', ARTM: 'Artemis', ORION: 'Orion' };
const DSN_SITES = { gdscc: 'Goldstone, California', mdscc: 'Madrid, Spain', cdscc: 'Canberra, Australia' };
async function dsn() {
  const [xml, cfg] = await Promise.all([get('https://eyes.nasa.gov/dsn/data/dsn.xml?r=' + Date.now(), { type: 'text' }), get('https://eyes.nasa.gov/dsn/config.xml', { type: 'text', retries: 0 }).catch(() => '')]);
  const names = { ...DSN_NAMES }; for (const s of blocks(cfg, 'spacecraft')) if (s.attrs.name && s.attrs.friendlyName) names[s.attrs.name.toUpperCase()] = clean(s.attrs.friendlyName, 60);
  /* stations and dishes come as siblings in document order: a dish belongs to the station before it */
  const stations = [], re = /<station\b([^>]*?)\/?>|<dish\b([^>]*?)(?:\/>|>([\s\S]*?)<\/dish>)/g; let m, cur = null;
  while ((m = re.exec(xml))) {
    if (m[1] != null) { const a = attrs(m[1]); cur = { id: a.name, name: DSN_SITES[a.name] || clean(a.friendlyName, 60), dishes: [] }; stations.push(cur); continue; }
    if (!cur) continue;
    const a = attrs(m[2]), inner = m[3] || '';
    const band = s => s.band || (s.frequency ? (num(s.frequency) > 30e9 ? 'Ka' : num(s.frequency) > 7e9 ? 'X' : 'S') : null);
    const sig = t => blocks(inner, t).map(b => b.attrs).filter(s => s.active === 'true' && s.spacecraft && !/^(DSN|TEST)$/i.test(s.spacecraft)).map(s => ({ sc: names[String(s.spacecraft).toUpperCase()] || s.spacecraft, rate: num(s.dataRate), band: band(s), power: num(s.power) }));
    const targets = blocks(inner, 'target').map(b => b.attrs).filter(t => t.name && !/^(DSN|DSS|TEST)/i.test(t.name)).map(t => ({ code: t.name, name: names[String(t.name).toUpperCase()] || t.name, km: num(t.downlegRange) > 0 ? num(t.downlegRange) : null, rtlt: num(t.rtlt) > 0 ? num(t.rtlt) : null }));
    cur.dishes.push({ name: a.name, az: num(a.azimuthAngle), el: num(a.elevationAngle), up: sig('upSignal'), down: sig('downSignal'), targets });
  }
  if (!stations.length) throw new Error('no stations in the DSN feed');
  return { fetched: now(), source: 'NASA Deep Space Network Now (eyes.nasa.gov/dsn)', stations };
}

const SOURCES = [
  { name: 'arxiv', label: 'arXiv', file: 'data/papers/arxiv.json', run: arxiv, count: d => d.papers.length, min: 20 },
  { name: 'news', label: 'Spaceflight News API and agency feeds', file: 'data/news.json', run: news, count: d => d.items.length, min: 5 },
  { name: 'launches', label: 'Launch Library 2', file: 'data/launches.json', run: launches, count: d => d.upcoming.length + d.recent.length, min: 3 },
  { name: 'spaceweather', label: 'NOAA SWPC', file: 'data/spaceweather.json', run: spaceweather, count: d => ['kp', 'wind', 'mag', 'xray', 'scales'].filter(k => d[k]).length, min: 1 },
  { name: 'tle', label: 'CelesTrak', file: 'data/tle.json', run: tle, count: d => d.sats.length, min: 1 },
  { name: 'neo', label: 'NASA/JPL CNEOS', file: 'data/neo.json', run: neo, count: d => d.items.length, min: 0 },
  { name: 'apod', label: 'NASA APOD', file: 'data/apod.json', run: apod, count: d => d.days.length, min: 1 },
  { name: 'dsn', label: 'NASA DSN Now', file: 'data/dsn.json', run: dsn, count: d => d.stations.reduce((n, s) => n + s.dishes.length, 0), min: 1 }
];
export { SOURCES, tles, table, xclass, launch };

if (import.meta.url === 'file://' + process.argv[1] || process.argv[1].endsWith('refresh.mjs')) {
  const only = process.argv.slice(2), pick = only.length ? SOURCES.filter(s => only.includes(s.name)) : SOURCES;
  console.log('OWLT refresh · ' + now() + (process.env.OWLT_MOCK ? ' · mock ' + process.env.OWLT_MOCK : ''));
  const res = await runAll(pick);
  /* the job only fails when nothing at all could be fetched; partial days are normal */
  if (res.every(r => r.status === 'rejected')) process.exit(1);
}

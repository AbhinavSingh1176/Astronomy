#!/usr/bin/env node
/* OWLT · tests/mock-server.mjs — stands in for every outside service the refresh jobs call, with responses in each
   service's real format, so the pipeline can be tested without a network.   node tests/mock-server.mjs [port]
   Requests arrive as /<host>/<path> (see OWLT_MOCK in scripts/lib.mjs). One agency feed always fails, on purpose. */
import http from 'node:http';

const port = +(process.argv[2] || 9911), day = (n = 0) => new Date(Date.now() + n * 864e5);
const isoD = (n = 0) => day(n).toISOString(), ymd = (n = 0) => isoD(n).slice(0, 10);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TOPICS = ['a temperate super-Earth seen by JWST', 'the merger of two neutron stars', 'dark matter in dwarf galaxies', 'the Hubble tension from Cepheids', 'a fast radio burst from a magnetar',
  'water ice on Europa', 'the first galaxies at redshift 12', 'a white dwarf eating its planets', 'the solar wind near Parker Solar Probe', 'a calibration pipeline for Rubin'];
const CATS = ['astro-ph.EP', 'astro-ph.HE', 'astro-ph.GA', 'astro-ph.CO', 'astro-ph.HE', 'astro-ph.EP', 'astro-ph.GA', 'astro-ph.SR', 'astro-ph.SR', 'astro-ph.IM'];
function arxiv() {
  const entries = Array.from({ length: 30 }, (_, i) => {
    const k = i % 10, id = '2611.' + String(20000 + i).padStart(5, '0');
    return `<entry><id>http://arxiv.org/abs/${id}v1</id><updated>${isoD(-1)}</updated><published>${isoD(-(i % 4))}</published>
<title>On ${esc(TOPICS[k])}: case study ${i}</title>
<summary>  Astronomers have long wondered about ${esc(TOPICS[k])}. The question has remained open because earlier data lacked the sensitivity.
We use 42 nights of observations with a new spectrograph and model the signal with a Bayesian framework. We find a detection at 5.2 sigma, with a mass of 3.1 +/- 0.4 Earth masses
and a temperature of 290 K. These results suggest that such objects are common, at a rate of 22% among similar systems. Future observations will test this.</summary>
<author><name>Ana Example</name></author><author><name>Bo Sample</name></author><author><name>Chen Placeholder</name></author><author><name>Dee Fixture</name></author>
<arxiv:comment xmlns:arxiv="http://arxiv.org/schemas/atom">${i % 3 === 0 ? 'Accepted for publication in ApJ' : '14 pages, 6 figures'}</arxiv:comment>
${i % 5 === 0 ? '<arxiv:journal_ref xmlns:arxiv="http://arxiv.org/schemas/atom">MNRAS 540, 1234 (2026)</arxiv:journal_ref>' : ''}
<link href="http://arxiv.org/abs/${id}v1" rel="alternate" type="text/html"/>
<arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="${CATS[k]}" scheme="http://arxiv.org/schemas/atom"/>
<category term="${CATS[k]}" scheme="http://arxiv.org/schemas/atom"/></entry>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>arXiv Query</title>${entries.join('\n')}</feed>`;
}
const snapi = () => ({ count: 30, next: null, previous: null, results: Array.from({ length: 30 }, (_, i) => ({ id: 30000 + i, title: ['SpaceX launches Starlink batch', 'ESA approves new mission to Venus', 'JAXA probe returns asteroid samples', 'ISRO tests crew module', 'Webb finds water in exoplanet atmosphere', 'NASA budget hearing in Congress'][i % 6] + ' ' + i,
  authors: [{ name: 'Reporter', socials: null }], url: 'https://example.com/news/' + i, image_url: 'https://example.com/i.jpg', news_site: ['SpaceNews', 'NASA', 'ESA', 'Spaceflight Now'][i % 4],
  summary: 'A summary with <b>markup</b> &amp; entities, about item ' + i + '.', published_at: isoD(-i / 3), updated_at: isoD(-i / 3), featured: false, launches: [], events: [] })) });
const rss = site => `<?xml version="1.0"?><rss version="2.0"><channel><title>${site}</title>${Array.from({ length: 6 }, (_, i) => `<item><title>${site} story ${i}: Hubble sees a comet</title><link>https://example.org/${encodeURIComponent(site)}/${i}</link><pubDate>${day(-i).toUTCString()}</pubDate><description><![CDATA[<p>Text for ${site} ${i}.</p>]]></description></item>`).join('')}</channel></rss>`;
const ll = up => ({ count: 6, results: Array.from({ length: 6 }, (_, i) => ({ id: 'uuid-' + (up ? 'u' : 'p') + i, url: 'https://ll.thespacedevs.com/2.3.0/launches/x/', name: ['Falcon 9 Block 5 | Starlink Group 12-3', 'H3 | HTV-X2', 'PSLV-C62 | EOS-N1', 'Long March 5 | Chang\'e 7', 'Electron | Mission', 'Ariane 6 | Galileo L14'][i],
  status: { id: up ? 1 : 3, name: up ? 'Go for Launch' : 'Launch Successful', abbrev: up ? 'Go' : 'Success' }, net: isoD(up ? i + 0.3 : -i - 0.4), window_start: isoD(up ? i + 0.3 : -i - 0.4), window_end: isoD(up ? i + 0.35 : -i - 0.35),
  net_precision: { id: 0, name: 'Second' }, launch_service_provider: { id: 121, name: ['SpaceX', 'JAXA', 'ISRO', 'CASC', 'Rocket Lab', 'Arianespace'][i], type: { name: i === 0 || i === 4 ? 'Commercial' : 'Government' } },
  rocket: { configuration: { name: 'Rocket', full_name: ['Falcon 9 Block 5', 'H3-24W', 'PSLV-XL', 'Long March 5', 'Electron', 'Ariane 62'][i] } },
  mission: { name: ['Starlink Group 12-3', 'HTV-X2', 'EOS-N1', 'Chang\'e 7', 'Mission', 'Galileo L14'][i], type: 'Communications', description: 'A mission description.', orbit: { name: 'Low Earth Orbit', abbrev: 'LEO' } },
  pad: { name: 'Pad ' + i, location: { name: 'Somewhere, Earth', country_code: ['USA', 'JPN', 'IND', 'CHN', 'NZL', 'GUF'][i] } } })) });
const kp = () => [['time_tag', 'Kp', 'a_running', 'station_count']].concat(Array.from({ length: 24 }, (_, i) => [new Date(Date.now() - (23 - i) * 3 * 3600e3).toISOString().replace('T', ' ').slice(0, 19) + '.000', String((i % 7) * 0.67), '9', '8']));
/* NOAA's real-time solar-wind files (November 2026): a day of one-minute rows from three spacecraft, newest first, the one in use marked active */
const rtswT = i => new Date(Date.now() - i * 60e3).toISOString().slice(0, 16) + ':00';
const plasma = () => Array.from({ length: 1440 }, (_, i) => ['SOLAR1', 'ACE', 'IMAP'].map(s => ({ time_tag: rtswT(i), active: s === 'SOLAR1', source: s, proton_speed: i === 0 ? null : 420 + (i % 30) + (s === 'ACE' ? 900 : 0), proton_temperature: 90000, proton_density: 4.1, overall_quality: 0 }))).flat();
const mag = () => Array.from({ length: 1440 }, (_, i) => ['SOLAR1', 'IMAP'].map(s => ({ time_tag: rtswT(i), active: s === 'SOLAR1', source: s, bt: 5.5, bx_gsm: 1.2, by_gsm: -2.0, bz_gsm: -3 + i % 6 + (s === 'IMAP' ? 50 : 0), overall_quality: 0 }))).flat();
const xr = () => Array.from({ length: 200 }, (_, i) => [{ time_tag: new Date(Date.now() - (199 - i) * 432e3).toISOString().slice(0, 19) + 'Z', satellite: 19, flux: 2e-6 * (1 + (i % 9) / 3), energy: '0.1-0.8nm' }, { time_tag: new Date(Date.now() - (199 - i) * 432e3).toISOString().slice(0, 19) + 'Z', satellite: 19, flux: 1e-8, energy: '0.05-0.4nm' }]).flat();
const scales = () => ({ 0: { DateStamp: ymd(), TimeStamp: '04:30:00', R: { Scale: '1', Text: 'minor' }, S: { Scale: '0', Text: 'none' }, G: { Scale: null, Text: null } }, 1: { DateStamp: ymd(1) } });
const ck = l => { let s = 0; for (const ch of l) s += ch === '-' ? 1 : /\d/.test(ch) ? +ch : 0; return l + (s % 10); };
const tle = (name, n) => [name, ck(`1 ${String(n).padStart(5, '0')}U 98067A   26319.51782528  .00016717  00000+0  30106-3 0  999`), ck(`2 ${String(n).padStart(5, '0')}  51.6386 297.5634 0007601 190.4573 241.2633 15.5006698748187`)].join('\n');
const cad = () => ({ signature: { version: '1.5', source: 'NASA/JPL SBDB Close Approach Data API' }, count: '3', fields: ['des', 'orbit_id', 'jd', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'v_inf', 't_sigma_f', 'h'],
  data: [['2026 VA1', '4', '2461361.5', day(2).getUTCFullYear() + '-Nov-18 03:12', '0.00412', '0.0041', '0.0042', '8.31', '8.30', '< 00:01', '27.1'], ['433', '659', '2461371.5', '2026-Nov-28 11:40', '0.0412', '0.0412', '0.0412', '5.9', '5.9', '< 00:01', '10.4'], ['2026 UZ', '2', '2461380.5', '2026-Dec-07 00:05', '0.0201', '0.02', '0.0202', '12.0', '12.0', '00:10', '24.9']] });
/* what api.nasa.gov answers since APOD moved to science.nasa.gov (November 2026): the site's logo, titled "NASA Science", for any date */
const apod = () => ({ date: ymd(), title: 'NASA Science', explanation: 'What surrounds a galaxy? A faint halo of stars, gas and dark matter extends far beyond the bright disc seen in most images.', media_type: 'image', url: 'https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png', hdurl: 'https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png', service_version: 'v1' });
/* the APOD page itself, reduced to the parts the refresh reads, in the page's own markup (November 2026) */
const apodPage = () => {
  const d = day(), long = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }), slug = ymd().replace(/-(\d\d)-/, (_, m) => '-' + d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }).toLowerCase() + '-').replace(/-0(\d)$/, '-$1');
  return `<!doctype html><html><head><title>APOD - NASA Science</title></head><body><main>
<figure class="hds-media-inner hds-cover-wrapper hds-media-ratio-fit "><a href="https://science.nasa.gov/image-article/apod-${slug}-a-galaxy-its-halo/"><img sizes="auto, (max-width: 85rem) calc(100vw - 3rem), 85rem" srcset="https://assets.science.nasa.gov/dynamicimage/assets/science/cds/apod/apod/2026/november/halo.jpg?w=1280&amp;h=1280&amp;fit=crop 1280w" src="https://assets.science.nasa.gov/dynamicimage/assets/science/cds/apod/apod/2026/november/halo.jpg?w=1280&amp;h=1194&amp;fit=clip&amp;crop=faces%2Cfocalpoint" alt="A galaxy and its halo"></a></figure>
<div class="grid-container grid-container-block padding-x-0"><p class="p-md margin-top-0 margin-bottom-3 media-detail-hero__subtext"><a href="/apod/archive/">Discover the cosmos!</a> Each day a different image or photograph of our fascinating universe is featured.</p>
<h2 class="display-48 margin-top-0 margin-bottom-3">A Galaxy &amp; Its Halo</h2>
<p class="p-md margin-0 media-detail-hero__description"> <strong>Explanation:</strong> What surrounds a galaxy? A faint <a href="https://example.org/halo">halo</a> of stars, gas and dark matter extends far beyond the bright disc seen in most images, and this deep exposure shows it.</p>
<p class="p-md"><strong>Tomorrow's picture:</strong> open space </p></div>
<table class="media-detail-hero__meta-table width-full"> <tbody> <tr class="media-detail-hero__meta-row"> <th scope="row" class="label padding-y-1">Date:</th> <td class="p-sm padding-y-1"> ${long} </td> </tr> <tr class="media-detail-hero__meta-row"> <th scope="row" class="label padding-y-1">Credit &amp; Copyright:</th> <td class="p-sm padding-y-1"> <a href="mailto:someone at example dot com">Someone Photographer</a> </td> </tr> <tr class="media-detail-hero__meta-row"> <th scope="row" class="label padding-y-1">Authors &amp; editors:</th> <td class="p-sm padding-y-1"> Robert Nemiroff, Jerry Bonnell </td> </tr> </tbody> </table>
</main></body></html>`;
};
const dsn = () => `<?xml version='1.0' encoding='utf-8'?><dsn><station friendlyName="Goldstone" name="gdscc" timeUTC="${Date.now()}" timeZoneOffset="-28800000" />
<dish name="DSS14" azimuthAngle="140.9" elevationAngle="35.4" windSpeed="5" isMSPA="false" isArray="false" isDDOR="false" created="${isoD()}" updated="${isoD()}"><downSignal active="true" signalType="data" dataRate="160" frequency="8420432110" band="X" power="-155.2" spacecraft="VGR1" spacecraftID="-31"/><upSignal active="true" signalType="data" dataRate="16" frequency="2114" band="S" power="18" spacecraft="VGR1" spacecraftID="-31"/><target name="VGR1" id="31" uplegRange="2.5902E+10" downlegRange="2.5902E+10" rtlt="172800.1"/></dish>
<dish name="DSS26" azimuthAngle="200" elevationAngle="12" windSpeed="2" isMSPA="false" isArray="false" isDDOR="false" created="${isoD()}" updated="${isoD()}"><downSignal active="false" signalType="none" dataRate="" frequency="" band="X" power="" spacecraft="DSN" spacecraftID="-99"/><target name="DSN" id="99" uplegRange="-1" downlegRange="-1" rtlt="-1"/></dish>
<station friendlyName="Madrid" name="mdscc" timeUTC="${Date.now()}" timeZoneOffset="3600000" />
<dish name="DSS63" azimuthAngle="90" elevationAngle="50" windSpeed="3" isMSPA="false" isArray="false" isDDOR="false" created="${isoD()}" updated="${isoD()}"><downSignal active="true" signalType="data" dataRate="2000000" frequency="25900000000" band="Ka" power="-120" spacecraft="JWST" spacecraftID="-170"/><target name="JWST" id="170" uplegRange="1.5E+06" downlegRange="1.5E+06" rtlt="10.1"/></dish>
<station friendlyName="Canberra" name="cdscc" timeUTC="${Date.now()}" timeZoneOffset="39600000" /><timestamp>${Date.now()}</timestamp></dsn>`;
const dsncfg = () => `<config><sites/><spacecraftMap><spacecraft name="vgr1" explorerName="sc_voyager_1" friendlyName="Voyager 1" thumbnail="true"/><spacecraft name="jwst" explorerName="sc_jwst" friendlyName="James Webb Space Telescope" thumbnail="true"/></spacecraftMap></config>`;
/* Claude: the first answer for each paper breaks the rules (hype and an invented number), the second keeps them */
const seen = new Map();
function claude(body) {
  const req = JSON.parse(body || '{}'), text = (req.messages && req.messages[0] && req.messages[0].content) || '', title = (text.match(/Title: (.*)/) || [])[1] || 'x';
  const n = (seen.get(title) || 0) + 1; seen.set(title, n);
  const good = { one: 'Astronomers report a detection at 5.2 sigma of an object about 3.1 Earth masses with a temperature near 290 K.', q: 'Whether such objects exist has been unclear. Earlier data were not sensitive enough to tell.',
    how: 'The team used 42 nights of observations with a new spectrograph and fitted the signal with a statistical model.', found: [['Significance', '5.2 sigma'], ['Mass', '3.1 +/- 0.4 Earth masses'], ['Temperature', '290 K']],
    why: 'The authors suggest such objects are common, at a rate of 22% among similar systems.', careful: 'This rests on a single detection; the rate depends on assumptions the abstract does not spell out.' };
  const bad = { ...good, one: 'A stunning breakthrough: astronomers find 7 hidden worlds!' };
  return { id: 'msg_mock', type: 'message', role: 'assistant', model: req.model, content: [{ type: 'text', text: JSON.stringify(n === 1 ? bad : good) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
}

const ROUTES = [
  [/^export\.arxiv\.org\/api\/query/, () => ['application/atom+xml', arxiv()]],
  [/^api\.spaceflightnewsapi\.net\/v4\/articles/, () => ['application/json', snapi()]],
  [/^www\.nasa\.gov\//, () => [500, 'down for maintenance']],
  [/^(www\.esa\.int|www\.eso\.org|noirlab\.edu|www\.universetoday\.com|skyandtelescope\.org)\//, u => ['application/rss+xml', rss(u.split('/')[0])]],
  [/^ll\.thespacedevs\.com\/2\.3\.0\/launches\/upcoming/, () => ['application/json', ll(true)]],
  [/^ll\.thespacedevs\.com\/2\.3\.0\/launches\/previous/, () => ['application/json', ll(false)]],
  [/noaa-planetary-k-index\.json/, () => ['application/json', kp()]], [/rtsw_wind_1m\.json/, () => ['application/json', plasma()]], [/rtsw_mag_1m\.json/, () => ['application/json', mag()]],
  [/xrays-1-day\.json/, () => ['application/json', xr()]], [/noaa-scales\.json/, () => ['application/json', scales()]],
  [/^celestrak\.org\/.*GROUP=stations/, () => ['text/plain', tle('ISS (ZARYA)', 25544) + '\n' + tle('CSS (TIANHE)', 48274) + '\n']],
  [/^celestrak\.org\/.*CATNR=20580/, () => ['text/plain', tle('HST', 20580) + '\n']],
  [/^ssd-api\.jpl\.nasa\.gov\/cad\.api/, () => ['application/json', cad()]],
  [/^api\.nasa\.gov\/planetary\/apod/, () => ['application/json', apod()]], [/^science\.nasa\.gov\/apod\/?$/, () => ['text/html; charset=utf-8', apodPage()]],
  [/^eyes\.nasa\.gov\/dsn\/data\/dsn\.xml/, () => ['text/xml', dsn()]], [/^eyes\.nasa\.gov\/dsn\/config\.xml/, () => ['text/xml', dsncfg()]],
  [/^api\.anthropic\.com\/v1\/messages/, (u, body) => ['application/json', claude(body)]]
];
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
    const u = decodeURIComponent(req.url.slice(1)), r = ROUTES.find(([re]) => re.test(u));
    if (!r) { res.writeHead(404); res.end('no mock for ' + u); return; }
    const [type, data] = r[1](u, body);
    if (typeof type === 'number') { res.writeHead(type); res.end(String(data)); return; }
    res.writeHead(200, { 'content-type': type }); res.end(typeof data === 'string' ? data : JSON.stringify(data));
  });
});
server.listen(port, '127.0.0.1', () => console.log('mock services on http://127.0.0.1:' + port));

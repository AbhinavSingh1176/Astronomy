/* OWLT · log.js — the Ship Log: what you found, what it mentions, drawn as a small map you can walk. */
(function () {
  'use strict';
  const O = window.OWLT, $ = O.$, el = O.el;
  O.nav();
  const KNAME = { page: 'Pages', obj: 'Places', paper: 'New papers', canon: 'Landmark papers', term: 'Terms', lost: 'Missions remembered' };
  const COL = { page: '#B3A696', obj: '#8FA5D9', paper: '#FFB13B', canon: '#FFEBC4', term: '#4FD8C4', lost: '#E8442C' };
  O.graph().then(G => {
    const L = O.log.all(), ids = Object.keys(L), kindOf = id => id.split(':')[0];
    /* tally */
    const total = Object.keys(G.nodes).length, by = {}; for (const id of ids) by[kindOf(id)] = (by[kindOf(id)] || 0) + 1;
    O.clear($('#tally')).append(el('div', null, el('b', { text: ids.length + (total ? ' / ' + total : '') }), 'found'), ...Object.keys(KNAME).map(k => el('div', null, el('b', { text: String(by[k] || 0) }), KNAME[k])));
    /* rumours: things that what you found points to, ranked by how many of your finds mention them */
    const score = {}; for (const id of ids) for (const nb of G.adj[id] || []) if (!L[nb] && G.nodes[nb]) score[nb] = (score[nb] || 0) + 1;
    const rumours = Object.keys(score).sort((a, b) => score[b] - score[a] || G.nodes[a][0].localeCompare(G.nodes[b][0]));
    const rh = O.clear($('#rum'));
    if (rumours.length) rh.append(el('ul', null, rumours.slice(0, 24).map(r => el('li', null, el('a', { href: G.nodes[r][2], text: G.nodes[r][0] }), el('span', { text: KNAME[kindOf(r)].replace(/s$/, '').toLowerCase() + (score[r] > 1 ? ' · ' + score[r] + ' leads' : '') })))));
    else rh.append(el('p', { class: 'notice empty', text: 'No rumours yet. Open a place on the Ladder or a paper in the Reading Room, and what it mentions will appear here.' }));
    /* found, newest first, by kind */
    const fh = O.clear($('#found')), real = ids.filter(id => L[id][2]);
    if (!real.length) fh.append(el('p', { class: 'notice empty', text: 'Nothing logged yet. Try the Ladder’s tour, today’s paper, or the Observatory.' }));
    for (const k of Object.keys(KNAME)) {
      const list = real.filter(id => kindOf(id) === k).sort((a, b) => L[b][0] - L[a][0]); if (!list.length) continue;
      fh.append(el('div', { class: 'grp', text: KNAME[k] }), el('ul', null, list.slice(0, 40).map(id => el('li', null, el('a', { href: L[id][2], text: L[id][1] }), el('span', { text: O.fmt.ago(new Date(L[id][0])) })))));
    }
    map(G, L, ids, rumours.slice(0, 60));
    /* forgetting, with a second press to confirm */
    const dz = O.clear($('#danger')); let armed = false; const b = el('button', { class: 'btn', type: 'button', text: 'Clear the log' });
    b.addEventListener('click', () => { if (!armed) { armed = true; b.textContent = 'Press again to forget everything'; setTimeout(() => { armed = false; b.textContent = 'Clear the log'; }, 4000); return; } O.log.clear(); location.reload(); });
    if (ids.length) dz.append(b, el('span', { text: 'The log lives only in this browser. Clearing it cannot be undone.' }));
  });

  /* a small force layout: your finds pull together where they are linked; rumours hang off them */
  function map(G, L, ids, rumours) {
    const host = O.clear($('#map')), found = ids.filter(id => G.nodes[id]), set = found.concat(rumours);
    if (!set.length) { host.append(el('p', { class: 'notice', style: { margin: '20px' }, text: 'The map draws itself as you explore.' })); return; }
    const W = 1200, H = 620, N = set.map((id, i) => ({ id, x: W / 2 + Math.cos(i * 2.4) * (80 + i * 4), y: H / 2 + Math.sin(i * 2.4) * (60 + i * 3), vx: 0, vy: 0, seen: !!L[id] }));
    const idx = {}; N.forEach((n, i) => { idx[n.id] = i; });
    const E = []; for (const n of N) for (const nb of G.adj[n.id] || []) if (idx[nb] != null && n.id < nb) E.push([idx[n.id], idx[nb]]);
    for (let it = 0; it < 320; it++) {
      const t = 1 - it / 320;
      for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) { const a = N[i], b = N[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01, f = 5200 / d2;
        a.vx += dx * f / Math.sqrt(d2); a.vy += dy * f / Math.sqrt(d2); b.vx -= dx * f / Math.sqrt(d2); b.vy -= dy * f / Math.sqrt(d2); }
      for (const [i, j] of E) { const a = N[i], b = N[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) + 0.01, f = (d - 90) * 0.02; a.vx += dx / d * f * d * 0.05; a.vy += dy / d * f * d * 0.05; b.vx -= dx / d * f * d * 0.05; b.vy -= dy / d * f * d * 0.05; }
      for (const n of N) { n.vx += (W / 2 - n.x) * 0.004; n.vy += (H / 2 - n.y) * 0.006; n.x += Math.max(-20, Math.min(20, n.vx)) * t; n.y += Math.max(-20, Math.min(20, n.vy)) * t; n.vx *= 0.5; n.vy *= 0.5;
        n.x = Math.max(40, Math.min(W - 40, n.x)); n.y = Math.max(30, Math.min(H - 30, n.y)); }
    }
    /* fit the drawing to the frame */
    const xs = N.map(n => n.x), ys = N.map(n => n.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sc = Math.min((W - 260) / Math.max(1, x1 - x0), (H - 90) / Math.max(1, y1 - y0), 3);
    for (const n of N) { n.x = W / 2 + (n.x - (x0 + x1) / 2) * sc - 60; n.y = H / 2 + (n.y - (y0 + y1) / 2) * sc; }
    const NS = 'http://www.w3.org/2000/svg', mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Map of what you have found and the rumours it points to' });
    for (const [i, j] of E) svg.append(mk('line', { x1: N[i].x, y1: N[i].y, x2: N[j].x, y2: N[j].y, stroke: N[i].seen && N[j].seen ? 'rgba(255,235,196,.28)' : 'rgba(143,165,217,.18)', 'stroke-width': 1, 'stroke-dasharray': N[i].seen && N[j].seen ? '' : '3 4' }));
    for (const n of N) {
      const g = G.nodes[n.id], k = n.id.split(':')[0], a = mk('a', { href: g[2] }), lab = mk('text', { x: n.x + 9, y: n.y + 4 });
      a.append(mk('circle', n.seen ? { cx: n.x, cy: n.y, r: 5.5, fill: COL[k] || '#ccc', stroke: '#000', 'stroke-width': 1 } : { cx: n.x, cy: n.y, r: 5, fill: 'none', stroke: COL[k] || '#ccc', 'stroke-width': 1.3, 'stroke-dasharray': '2 2' }));
      lab.textContent = g[0].length > 34 ? g[0].slice(0, 32) + '…' : g[0]; if (n.seen || N.length < 70) a.append(lab);
      const tt = mk('title', {}); tt.textContent = g[0] + (n.seen ? ' · found' : ' · rumour'); a.append(tt); svg.append(a);
    }
    host.append(svg, el('div', { class: 'legend', text: 'Solid: found · dashed: rumour · colour: kind (places blue, papers amber, landmark papers cream, terms teal, missions red)' }));
  }
  O.footer(document.body);
})();

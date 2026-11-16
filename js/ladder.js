/* OWLT · ladder.js — one continuous place from the ground under you to the edge of the observable universe.
   Every layer keeps its own unit (Earth radii, AU, light-years, thousands, millions, billions of light-years) and
   is scaled into a two-unit view in double precision, so nothing jitters at 10²⁷ metres.
   Positions are real wherever real data exists, computed for this moment. Where they are not (belt and cloud
   dots, the cosmic web beyond the catalogue, moons other than ours and Jupiter's four), the page says so. */
(function () {
  'use strict';
  const O = window.OWLT, A = window.ASTRO, T = window.THREE, G = window.OWLT_GL, REG = window.OWLT_REGISTRY;
  const $ = O.$, el = O.el;
  const M = REG.M, AU = M.AU, LY = M.LY, KLY = LY * 1e3, MLY = LY * 1e6, GLY = LY * 1e9, ER = M.ER, RSUN = M.RSUN, C = M.C;
  const VIEW = 2, CAM_D = 3.2, SKY = 60, LMIN = 4.6, LMAX = Math.log10(1.25e27);
  const D2R = A.D2R, clamp = A.clamp;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const win = (x, a0, a1, b0, b1) => sstep(a0, a1, x) * (1 - sstep(b0, b1, x));
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], len = a => Math.hypot(a[0], a[1], a[2]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const hash01 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const KIND = { scale: 'Scale', star: 'Star', planet: 'Planet', moon: 'Moon', dwarf: 'Dwarf planet', asteroid: 'Asteroid', comet: 'Comet', probe: 'Spacecraft',
    system: 'Planetary system', nebula: 'Nebula', cluster: 'Star cluster', globular: 'Globular cluster', remnant: 'Supernova remnant', pulsar: 'Pulsar',
    blackhole: 'Black hole', galaxy: 'Galaxy', satellite: 'Satellite galaxy', supercluster: 'Supercluster', wall: 'Great wall', void: 'Void',
    structure: 'Structure', quasar: 'Quasar', transient: 'Transient', horizon: 'Horizon', region: 'Region' };

  O.nav();
  const stage = $('#stage'), canvas = $('#gl'), labelsEl = $('#labels'), panel = $('#panel');
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); if (!renderer.getContext()) throw 0; }
  catch (e) {
    stage.append(el('div', { id: 'nogl' }, el('div', { class: 'notice', style: { maxWidth: '520px' } },
      'This view needs WebGL, which this browser or device has turned off. Everything shown here is also in the ',
      el('a', { href: 'atlas.html', text: 'Atlas' }), ', as tables you can search.')));
    $('#boot').classList.add('off'); return;
  }
  renderer.setClearColor(0x000000, 1); renderer.autoClear = true;
  const post = G.Post(renderer), scene = new T.Scene(), overlay = new T.Scene();
  const camera = new T.PerspectiveCamera(35, 1, 0.003, 30000);
  const R2 = { list: [], find: () => null };
  let R = R2, CONS = {}, W = 1, H = 1, pxPerUnit = 500, pr = 1;

  /* ── state ── */
  const S = { jd: A.jdOf(new Date()), ls: Math.log10(3.2e7), lsT: Math.log10(3.2e7), F: [0, 0, 0], focus: null, flight: null,
    yaw: 0, pitch: 0.18, tYaw: 0, tPitch: 0.18, vYaw: 0, vPitch: 0, idle: 0, labels: true, lines: false, tour: null, minLs: LMIN };
  const B = {};                      // live body positions, metres from the Sun, scene frame
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ── loading ── */
  const FILES = [['data/catalog/solar.json'], ['data/catalog/structures.json'], ['data/catalog/stars.json'], ['data/catalog/exoplanets.json'],
    ['data/catalog/messier.json'], ['data/catalog/galaxies.json'], ['data/catalog/sky.bin', 'bin'], ['data/catalog/local.bin', 'bin'],
    ['data/catalog/galaxies.bin', 'bin'], ['data/catalog/constellations.json']];
  let got = 0;
  Promise.all(FILES.map(f => O.load(f[0], f[1]).then(x => { got++; $('#bootBar').style.width = (got / FILES.length * 100) + '%'; $('#bootS').textContent = f[0].split('/').pop(); return x; })))
    .then(d => {
      if (d.some(x => !x)) { $('#bootS').textContent = 'Some catalogue files did not load. Reload the page, or open the Atlas instead.'; return; }
      try { start(d); } catch (e) { console.error(e); $('#bootS').textContent = 'The view could not start: ' + e.message; }
    });

  /* ── materials written for this page ── */
  const PLACE_VS = `${G.PLACE}`;
  const lineMat = color => new T.ShaderMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false,
    uniforms: { uFocus: { value: new T.Vector3() }, uK: { value: 1 }, uT: { value: 0 }, uSky: { value: SKY }, uOp: { value: 0 }, uC: { value: new T.Color(color) } },
    vertexShader: `${PLACE_VS} varying float vA; void main(){ float d; vec3 q = place(position, d); vA = smoothstep(3.2, 1.0, length(q)); gl_Position = projectionMatrix*modelViewMatrix*vec4(q, 1.0); }`,
    fragmentShader: `uniform float uOp; uniform vec3 uC; varying float vA; void main(){ gl_FragColor = vec4(uC*uOp*vA, 1.0); }` });
  const shellMat = (color, mode) => new T.ShaderMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false, side: T.DoubleSide,
    uniforms: { uC: { value: new T.Color(color) }, uOp: { value: 0 }, uMode: { value: mode || 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vN, vV, vP; void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position, 1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: `varying vec3 vN, vV, vP; uniform vec3 uC; uniform float uOp, uMode, uTime; ${G.NOISE}
      void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        if (uMode > 0.5) {                                                   /* the CMB: temperature ripples of one part in 100,000, in the colours of the Planck map */
          vec3 p = normalize(vP); float n = fbm(p*3.1 + 1.3)*0.55 + fbm(p*9.0 + 7.0)*0.32 + fbm(p*26.0)*0.16;
          vec3 c = mix(vec3(0.02, 0.10, 0.45), vec3(0.25, 0.55, 0.95), smoothstep(0.30, 0.44, n));
          c = mix(c, vec3(0.95, 0.85, 0.70), smoothstep(0.44, 0.52, n)); c = mix(c, vec3(1.0, 0.45, 0.10), smoothstep(0.52, 0.62, n)); c = mix(c, vec3(0.75, 0.08, 0.04), smoothstep(0.62, 0.72, n));
          gl_FragColor = vec4(c*(0.085 + pow(f, 4.0)*0.12)*uOp, 1.0); return; }
        float a = pow(f, 5.0)*0.9 + 0.012; gl_FragColor = vec4(uC*a*uOp, 1.0); }` });
  /* the Milky Way seen from inside: brighter toward the centre, dust lanes along the plane */
  const bandMat = new T.ShaderMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false, side: T.BackSide,
    uniforms: { uN: { value: new T.Vector3().fromArray(A.GAL.z) }, uG: { value: new T.Vector3().fromArray(A.GAL.x) }, uOp: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uN, uG; uniform float uOp; ${G.NOISE}
      void main(){ vec3 d = normalize(vD); float b = asin(clamp(dot(d, uN), -1.0, 1.0)); float t = max(0.0, dot(d, uG));
        float band = exp(-(b*b)/(0.05 + 0.05*(1.0 - t))), bulge = pow(t, 7.0)*0.75;
        float cl = fbm(d*7.5)*0.7 + fbm(d*19.0)*0.33, dust = smoothstep(0.36, 0.86, fbm(d*11.0 + vec3(3.1, 0.7, 5.2)))*exp(-(b*b)/0.012);
        float I = (band*(0.42 + cl*0.78)*(1.0 - dust*0.75) + bulge*(0.55 + cl*0.4))*uOp;
        vec3 c = mix(vec3(0.60, 0.68, 0.92), vec3(1.0, 0.78, 0.52), clamp(t*1.25 + bulge, 0.0, 1.0));
        gl_FragColor = vec4(c*I*0.075, 1.0); }` });
  const exoMat = new T.ShaderMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false,
    uniforms: { uFocus: { value: new T.Vector3() }, uK: { value: 1 }, uT: { value: 1 }, uSky: { value: SKY }, uOp: { value: 0 }, uSize: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `attribute float aHz; varying float vH; uniform float uSize; ${G.PLACE}
      void main(){ float d; vec3 q = place(position, d); gl_Position = projectionMatrix*modelViewMatrix*vec4(q, 1.0); gl_PointSize = uSize*(6.0 + aHz*3.0)*step(0.004, d); vH = aHz; }`,
    fragmentShader: `varying float vH; uniform float uOp, uTime;
      void main(){ vec2 p = gl_PointCoord*2.0 - 1.0; float r = length(p); float ring = exp(-pow((r - 0.72)*8.0, 2.0));
        vec3 c = vH > 1.5 ? vec3(0.31, 0.85, 0.77) : vH > 0.5 ? vec3(0.56, 0.66, 0.86) : vec3(0.72, 0.62, 0.52);
        float a = ring*uOp*(vH > 1.5 ? 0.85 + 0.15*sin(uTime*2.2) : vH > 0.5 ? 0.55 : 0.18); if (a < 0.004) discard; gl_FragColor = vec4(c*a, 1.0); }` });
  const beamMat = new T.ShaderMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide,
    uniforms: { uOp: { value: 1 } },
    vertexShader: 'varying float vY; void main(){ vY = clamp(position.y, 0.0, 1.0); gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
    fragmentShader: 'varying float vY; uniform float uOp; void main(){ gl_FragColor = vec4(vec3(0.55, 0.75, 1.0)*pow(1.0 - vY, 2.2)*0.55*uOp, 1.0); }' });

  /* ── scene graph ── */
  const L = {};                      // layers
  const markers = new T.Group(); scene.add(markers);
  function placeUniforms(m, focusUnits, k, t) { m.uniforms.uFocus.value.set(focusUnits[0], focusUnits[1], focusUnits[2]); m.uniforms.uK.value = k; if (m.uniforms.uT) m.uniforms.uT.value = t; }
  function placedPoints(pos, col, size, material, order) {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    if (col) g.setAttribute('aColor', new T.BufferAttribute(col, 3)); if (size) g.setAttribute('aS', new T.BufferAttribute(size, 1));
    const p = new T.Points(g, material); p.frustumCulled = false; p.renderOrder = order || 0; scene.add(p); return p;
  }
  const sphere = new T.SphereGeometry(1, 64, 40);

  function start(d) {
    const [solar, structures, stars, exo, messier, galaxies, skyBin, localBin, galBin, cons] = d;
    R = REG.build({ solar, structures, stars, exo, messier, galaxies }, A);
    for (const c of cons) CONS[c[0]] = c[1];
    buildSky(skyBin); buildLocal(localBin, stars, cons); buildSolar(solar); buildEarth(); buildBelts(); buildMilkyWay(); buildGalaxies(galBin); buildCosmos(); updateBodies(); buildRail();
    S.galBin = new DataView(galBin);
    /* the lists the labeller walks every frame, filtered once */
    R.starsL = R.list.filter(e => (e.kind === 'star' || e.kind === 'system') && e.group === 'star' && e.ly != null);
    R.bright = R.starsL.filter(e => e.mag != null && e.mag <= 1.3);
    R.far = R.list.filter(e => e.ra != null && e.ly != null && e.group === 'far');
    resize(); addEventListener('resize', resize);
    bindInput(); loadTle();
    updateBodies();
    const target = (location.hash || '').slice(1);
    const first = target && findEntry(target);
    const earth = R.find('earth');
    setFocus(earth, { instant: true });
    const sd = A.radec2v(A.sun(S.jd).ra, A.sun(S.jd).dec);          /* open on the terminator, so you see day, night and city lights */
    S.yaw = S.tYaw = Math.atan2(sd[0], sd[2]) + 1.75; S.pitch = S.tPitch = 0.22;
    if (first && first !== earth) setTimeout(() => flyTo(first), 600);
    else if (target && !first) showMissing(target);
    $('#boot').classList.add('off');
    if (/[?&]debug\b/.test(location.search)) window.__ladder = { S, L, F, B, R, camera, post, flyTo };   /* for the test suite */
    requestAnimationFrame(frame);
  }

  /* the sky as seen from the Sun: every naked-eye star, at infinity */
  function buildSky(buf) {
    const dv = new DataView(buf), n = dv.byteLength / 8, pos = new Float32Array(n * 3), mag = new Float32Array(n), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = i * 8, v = A.radec2v(dv.getUint16(o, true) / 65535 * 360, dv.getInt16(o + 2, true) / 32767 * 90, SKY);
      pos.set(v, i * 3); mag[i] = dv.getInt16(o + 4, true) / 100;
      const c = A.bv2rgb(dv.getInt16(o + 6, true) / 1000), l = (c[0] + c[1] + c[2]) / 3; for (let k = 0; k < 3; k++) col[i * 3 + k] = l + (c[k] - l) * 1.5;
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aMag', new T.BufferAttribute(mag, 1)); g.setAttribute('aColor', new T.BufferAttribute(col, 3));
    L.sky = new T.Points(g, G.skyStars()); L.sky.frustumCulled = false; L.sky.renderOrder = -20; scene.add(L.sky);
    L.band = new T.Mesh(new T.SphereGeometry(SKY * 0.97, 64, 32), bandMat); L.band.renderOrder = -30; scene.add(L.band);
  }

  /* stars with measured distances, in light-years from the Sun; the Sun is added so other stars can see it */
  function buildLocal(buf, stars, cons) {
    const dv = new DataView(buf), n = dv.byteLength / 8, LN = Math.log(2100);
    const pos = new Float32Array((n + 1) * 3), abs = new Float32Array(n + 1), col = new Float32Array((n + 1) * 3);
    for (let i = 0; i < n; i++) {
      const o = i * 8, ly = Math.exp(dv.getUint16(o + 4, true) / 65535 * LN);
      pos.set(A.radec2v(dv.getUint16(o, true) / 65535 * 360, dv.getInt16(o + 2, true) / 32767 * 90, ly), i * 3);
      abs[i] = dv.getInt8(o + 6) / 8;
      const c = A.bv2rgb(dv.getInt8(o + 7) / 60), l = (c[0] + c[1] + c[2]) / 3; for (let k = 0; k < 3; k++) col[i * 3 + k] = l + (c[k] - l) * 1.45;
    }
    abs[n] = 4.83; const cs = A.bv2rgb(0.65); col.set(cs.slice(0, 3), n * 3);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aAbs', new T.BufferAttribute(abs, 1)); g.setAttribute('aColor', new T.BufferAttribute(col, 3));
    L.local = new T.Points(g, G.spaceStars()); L.local.frustumCulled = false; L.local.renderOrder = -19; scene.add(L.local);
    L.localCount = n;
    /* constellation figures, each vertex matched to a star with a distance: from the Sun they are the familiar shapes, from anywhere else they come apart */
    const grid = {}, rows = REG.rows(stars).filter(s => s.ly != null);
    for (const s of rows) { const k = Math.floor(s.ra) + ':' + Math.floor(s.dec + 90); (grid[k] = grid[k] || []).push(s); }
    const near = (ra, dec) => { let best = null, bd = 0.4; const r0 = Math.floor(ra), d0 = Math.floor(dec + 90);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const s of grid[((r0 + a + 360) % 360) + ':' + (d0 + b)] || []) {
        const dd = Math.hypot((((s.ra - ra + 540) % 360) - 180) * Math.cos(dec * D2R), s.dec - dec); if (dd < bd) { bd = dd; best = s; } } return best; };
    const seg = [];
    for (const c of cons) for (const line of c[2]) {
      let prev = null;
      for (let i = 0; i < line.length; i += 2) { const s = near(line[i], line[i + 1]); if (s && prev) seg.push(...A.radec2v(prev.ra, prev.dec, prev.ly), ...A.radec2v(s.ra, s.dec, s.ly)); prev = s; }
    }
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(new Float32Array(seg), 3));
    L.cons = new T.LineSegments(lg, lineMat('#8FA5D9')); L.cons.frustumCulled = false; L.cons.renderOrder = -9; scene.add(L.cons);
    /* planetary systems: a ring for every star known to have planets; teal when one may be rocky and temperate */
    const sys = R.list.filter(e => e.system && e.ly != null), sp = new Float32Array(sys.length * 3), hz = new Float32Array(sys.length);
    sys.forEach((e, i) => { sp.set(A.radec2v(e.ra, e.dec, e.ly), i * 3); const pl = e.system.planets; hz[i] = pl.some(p => p.hz && p.rocky) ? 2 : pl.some(p => p.hz) ? 1 : 0; });
    const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(sp, 3)); eg.setAttribute('aHz', new T.BufferAttribute(hz, 1));
    L.exo = new T.Points(eg, exoMat); L.exo.frustumCulled = false; L.exo.renderOrder = -8; scene.add(L.exo);
    /* deep-sky objects inside the Milky Way, as coloured glows at their true places */
    const dso = R.list.filter(e => e.ly != null && e.ra != null && /nebula|remnant|cluster|globular|pulsar|blackhole/.test(e.kind) && e.ly < 2e5);
    const dp = new Float32Array(dso.length * 3), dc = new Float32Array(dso.length * 3), ds = new Float32Array(dso.length);
    const DC = { nebula: [1.0, 0.42, 0.34], remnant: [0.5, 0.9, 0.85], cluster: [0.7, 0.8, 1.0], globular: [1.0, 0.85, 0.6], pulsar: [0.6, 0.75, 1.0], blackhole: [1.0, 0.7, 0.45] };
    dso.forEach((e, i) => { dp.set(A.radec2v(e.ra, e.dec, e.ly), i * 3); const c = e.sub === 'planetary' ? [0.45, 0.95, 0.85] : e.sub === 'reflection' ? [0.5, 0.65, 1] : DC[e.kind]; dc.set(c, i * 3); ds[i] = e.kind === 'globular' ? 4 : 5; });
    L.dso = placedPoints(dp, dc, ds, G.dust(), -7);
  }

  /* ── the Solar System, live ── */
  const bodies = [];                 // {e, id, mesh, kind, parentId, r(m)}
  let sunMesh, sunGlow, helio;
  function buildSolar(solar) {
    L.solar = new T.Group(); scene.add(L.solar);
    L.orbits = new T.Group(); L.solar.add(L.orbits);
    for (const b of solar.bodies) {
      if (b.id === 'earth' || b.id === 'moon') continue;
      const e = R.find(b.id); if (!e) continue;
      const m = new T.Mesh(sphere, G.body(b.look)); m.material.uniforms.uSeed.value = hash01(b.id) * 40;
      const r = b.radius * 1000; m.userData.r = r; L.solar.add(m);
      const parentId = b.parent && b.parent !== 'Sun' ? O.slug(b.parent) : null;
      if (b.id === 'sun') { sunMesh = m; continue; }
      if (A.POLES[b.id]) m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3().fromArray(A.radec2v(A.POLES[b.id][0], A.POLES[b.id][1])));
      if (b.rings) {
        const ring = new T.Mesh(new T.RingGeometry(b.rings[0] / b.radius, b.rings[1] / b.radius, 160, 1), G.rings(b.rings[0] / b.radius, b.rings[1] / b.radius, b.id === 'uranus' ? '#7E9AA3' : '#E3CF9F'));
        ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2; m.add(ring); m.userData.ring = ring;
      }
      bodies.push({ e, id: b.id, mesh: m, kind: b.kind, parentId, r, el: b.el, a: b.a, period: b.period, look: b.look });
      /* orbits: planets from JPL elements, dwarfs and small bodies from their own elements */
      const path = A.PLANETS.includes(b.id) ? A.orbitPath(b.id, S.jd, 256) : b.el ? A.orbitPath(b.el, S.jd, 512) : null;
      if (path) addOrbit(path, b.look ? b.look[1] : '#888', b.kind === 'planet' ? 0.3 : 0.16);
      if (b.kind === 'moon' && parentId) {           /* a moon's orbit drawn around its planet */
        const ring = new T.LineLoop(circleGeo(256), new T.LineBasicMaterial({ color: '#8C7F72', transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
        ring.userData = { moonOf: parentId, a: b.a * 1000 }; L.orbits.add(ring);
      }
    }
    addOrbit(A.orbitPath('earth', S.jd, 256), '#6FA8DC', 0.38);
    sunGlow = new T.Sprite(G.glow('#FFE2A8', 1.4)); sunGlow.renderOrder = 3; L.solar.add(sunGlow);
    /* the heliopause: where the solar wind meets interstellar gas. Voyager 1 crossed it at 121.6 AU in 2012 */
    helio = new T.Mesh(new T.SphereGeometry(1, 64, 40), shellMat('#FFB13B'));
    const nose = A.ecl2scene(A.lonlat2ecl(255.4, 5.2, 1));
    helio.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), new T.Vector3().fromArray(nose));
    helio.scale.set(150 * AU, 122 * AU, 122 * AU); helio.userData.offset = mul(nose, -28 * AU); helio.renderOrder = -5; L.solar.add(helio);
    /* where the probes are, and the straight run behind each one */
    for (const id in A.PROBES) {
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
      const ln = new T.Line(g, new T.LineBasicMaterial({ color: '#FFB13B', transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      ln.userData.probe = id; L.orbits.add(ln);
    }
  }
  function circleGeo(n) { const p = new Float32Array((n) * 3); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p[i * 3] = Math.cos(a); p[i * 3 + 2] = Math.sin(a); } const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); return g; }
  function addOrbit(path, color, op) {
    const p = new Float32Array(path.length * 3); path.forEach((v, i) => p.set(mul(A.ecl2scene(v), AU), i * 3));
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
    const ln = new T.LineLoop(g, new T.LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })); ln.userData.op = op; L.orbits.add(ln);
  }

  /* ── Earth, the Moon, and the space around them ── */
  let earthMesh, moonMesh, moonPath, moonPathJd = 0;
  function buildEarth() {
    L.earth = new T.Group(); scene.add(L.earth);
    const tex = new T.TextureLoader().load('data/catalog/earth.png'); tex.minFilter = T.LinearMipmapLinearFilter; tex.anisotropy = 4;
    const sb = R.find('earth'), mb = R.find('moon');
    earthMesh = new T.Mesh(sphere, G.body(sb.look, tex)); L.earth.add(earthMesh);
    moonMesh = new T.Mesh(sphere, G.body(mb.look)); moonMesh.scale.setScalar(1737.4 / 6371); moonMesh.material.uniforms.uSeed.value = 3.7; L.earth.add(moonMesh);
    const mat = c => new T.LineBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
    const iss = new T.LineLoop(circleGeo(256), mat('#4FD8C4')); iss.scale.setScalar((6371 + 420) / 6371); iss.rotation.x = 51.6 * D2R; iss.userData.op = 0.55; L.earth.add(iss);
    const geo = new T.LineLoop(circleGeo(512), mat('#E8442C')); geo.scale.setScalar(42164 / 6371); geo.userData.op = 0.35; L.earth.add(geo);
    moonPath = new T.Line(new T.BufferGeometry(), mat('#B3A696')); moonPath.userData.op = 0.3; L.earth.add(moonPath);
    L.earthRings = [iss, geo, moonPath];
  }
  function refreshMoonPath() {
    const p = [];
    for (let t = -14; t <= 14.01; t += 0.25) { const m = A.moon(S.jd + t); p.push(...A.radec2v(m.ra, m.dec, m.distKm * 1000 / ER)); }
    moonPath.geometry.dispose(); moonPath.geometry = new T.BufferGeometry(); moonPath.geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(p), 3));
    moonPathJd = S.jd;
  }

  /* ── belts and clouds: where these regions are, drawn as dots (not individual objects) ── */
  function ring(n, r0, r1, thick, color, sizeMax) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = G.rnd() * Math.PI * 2, r = r0 + (r1 - r0) * Math.pow(G.rnd(), 0.8), z = G.gauss() * thick * r;
      pos.set(A.ecl2scene([r * Math.cos(a), r * Math.sin(a), z]), i * 3); const w = 0.75 + G.rnd() * 0.25; col.set([color[0] * w, color[1] * w, color[2] * w], i * 3); size[i] = 1 + G.rnd() * sizeMax; }
    return [pos, col, size];
  }
  function buildBelts() {
    let [p, c, s] = ring(7000, 2.15, 3.3, 0.08, [0.55, 0.48, 0.40], 1.2); L.belt = placedPoints(p, c, s, G.dust(), -10);
    [p, c, s] = ring(9000, 30, 50, 0.12, [0.45, 0.55, 0.75], 1.4); L.kuiper = placedPoints(p, c, s, G.dust(), -10);
    const n = 9000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const inner = i < 2500, r = inner ? 2000 + G.rnd() * 18000 : 20000 + Math.pow(G.rnd(), 0.7) * 80000, a = G.rnd() * Math.PI * 2;
      const u = inner ? G.gauss() * 0.35 : G.rnd() * 2 - 1, sq = Math.sqrt(Math.max(0, 1 - u * u));
      pos.set(A.ecl2scene([r * sq * Math.cos(a), r * sq * Math.sin(a), r * u]), i * 3); col.set([0.6, 0.68, 0.85], i * 3); size[i] = 1 + G.rnd();
    }
    L.oort = placedPoints(pos, col, size, G.dust(), -10);
  }

  /* soft glows with a true size: the light of the arms, seen from inside or out */
  const glowPts = () => new T.ShaderMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false,
    uniforms: { uFocus: { value: new T.Vector3() }, uK: { value: 1 }, uT: { value: 1 }, uSky: { value: SKY }, uPx: { value: 500 }, uOp: { value: 0 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; varying vec3 vC; varying float vI; uniform float uPx; ${G.PLACE}
      void main(){ float d; vec3 q = place(position, d); vec4 mv = modelViewMatrix*vec4(q, 1.0); gl_Position = projectionMatrix*mv;
        float px = 2.0*aSize*uK*uPx/max(0.01, -mv.z); gl_PointSize = clamp(px, 1.0, 220.0);
        vI = smoothstep(1.5, 8.0, px)*clamp(9.0/px, 0.05, 1.0)*(px > 220.0 ? pow(220.0/px, 2.0) : 1.0); vC = aColor; }`,
    fragmentShader: `varying vec3 vC; varying float vI; uniform float uOp; void main(){ vec2 p = gl_PointCoord*2.0 - 1.0; float r2 = dot(p, p); if (r2 > 1.0) discard; gl_FragColor = vec4(vC*exp(-r2*3.2)*(1.0 - r2)*vI*uOp, 1.0); }` });
  /* ── the Milky Way: a model built on measured arm positions (Reid et al. 2019), with real globular clusters and satellites ── */
  const R0 = 26.67, Z0 = 0.068, KPC = 3.26156;      /* kly: Sun to centre, Sun above the plane */
  const ARMS = [['Scutum–Centaurus Arm', 4.91, 23, 13, -250, 100, 1.15], ['Sagittarius–Carina Arm', 6.04, 24, 12, -180, 120, 0.8], ['Perseus Arm', 8.87, 40, 9.5, -140, 200, 1.1],
    ['Norma–Outer Arm', 4.46, 18, 10, -300, 60, 0.85], ['Orion Spur', 8.26, 9, 11.4, -25, 45, 0.3]];
  const armXY = (a, beta) => { const r = a[1] * Math.exp(-(beta - a[2]) * D2R * Math.tan(a[3] * D2R)) * KPC, phi = Math.PI - beta * D2R; return [r * Math.cos(phi), r * Math.sin(phi)]; };
  const galToScene = (x, y, z) => A.gal2scene(x + R0, y, z - Z0);    /* galactocentric kly → kly from the Sun */
  let armLabels = [];
  function buildMilkyWay() {
    const N = 120000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), wsum = ARMS.reduce((s, a) => s + a[6], 0);
    const bar = 153 * D2R, cb = Math.cos(bar), sb = Math.sin(bar);
    for (let i = 0; i < N; i++) {
      let x, y, z, c, s = 1; const u = G.rnd();
      if (u < 0.13) { const a = G.gauss() * 4.2, b = G.gauss() * 1.9; x = a * cb - b * sb; y = a * sb + b * cb; z = G.gauss() * 1.5; c = [1.0, 0.8, 0.56]; s = 1.2; }
      else if (u < 0.5) { const r = Math.min(52, 1.5 - 8.5 * Math.log(1 - G.rnd() * 0.995)), ph = G.rnd() * Math.PI * 2; x = r * Math.cos(ph); y = r * Math.sin(ph); z = G.gauss() * (0.35 + 0.5 * G.rnd()); c = [0.95, 0.86, 0.72]; }
      else if (u < 0.985) {
        let k = G.rnd() * wsum, a = ARMS[0]; for (const q of ARMS) { k -= q[6]; if (k <= 0) { a = q; break; } }
        const beta = a[4] + (a[5] - a[4]) * G.rnd(), p = armXY(a, beta), rr = Math.hypot(p[0], p[1]);
        if (rr < 9 || rr > 56) { i--; continue; }
        const sp = 0.7 + rr * 0.02; x = p[0] + G.gauss() * sp; y = p[1] + G.gauss() * sp; z = G.gauss() * 0.22;
        const hii = G.rnd() < 0.06; c = hii ? [1.0, 0.32, 0.26] : [0.72, 0.8, 1.0]; s = hii ? 2.4 : G.rnd() < 0.04 ? 2 : 1;
      } else { const r = 10 + G.rnd() * 90, uu = G.rnd() * 2 - 1, ph = G.rnd() * Math.PI * 2, q = Math.sqrt(1 - uu * uu); x = r * q * Math.cos(ph); y = r * q * Math.sin(ph); z = r * uu * 0.7; c = [0.9, 0.8, 0.65]; s = 0.8; }
      pos.set(galToScene(x, y, z), i * 3); const w = 0.33; col.set([c[0] * w, c[1] * w, c[2] * w], i * 3); size[i] = s;
    }
    /* real globular clusters and satellite galaxies, in their measured places */
    const extra = [], ec = [], es = [];
    for (const e of R.list) {
      if (e.ly == null || e.ra == null) continue;
      if (e.kind === 'globular') { const P = A.radec2v(e.ra, e.dec, e.ly / 1e3); for (let k = 0; k < 40; k++) { extra.push(P[0] + G.gauss() * 0.06, P[1] + G.gauss() * 0.06, P[2] + G.gauss() * 0.06); ec.push(0.5, 0.42, 0.3); es.push(1.4); } }
      else if (e.kind === 'satellite') {
        const P = A.radec2v(e.ra, e.dec, e.ly / 1e3), rad = (e.sizeLy || 5000) / 2e3, m = G.galaxyModel(4, Math.round(clamp(rad * 300, 300, 5000)));
        for (let k = 0; k < m.size.length; k++) { extra.push(P[0] + m.pos[k * 3] * rad, P[1] + m.pos[k * 3 + 1] * rad, P[2] + m.pos[k * 3 + 2] * rad); ec.push(m.col[k * 3] * 0.35, m.col[k * 3 + 1] * 0.35, m.col[k * 3 + 2] * 0.35); es.push(1); }
      }
    }
    const all = new Float32Array(pos.length + extra.length); all.set(pos); all.set(extra, pos.length);
    const ac = new Float32Array(col.length + ec.length); ac.set(col); ac.set(ec, col.length);
    const as = new Float32Array(size.length + es.length); as.set(size); as.set(es, size.length);
    L.mw = placedPoints(all, ac, as, G.dust(), -18); L.mw.material.uniforms.uAtt.value = 1.0;
    armLabels = [[ARMS[0], -60], [ARMS[1], -40], [ARMS[2], -20], [ARMS[3], -250], [ARMS[4], 14]].map(([a, b]) => { const p = armXY(a, b); return { name: a[0], P: mul(galToScene(p[0], p[1], 0), KLY) }; });
    armLabels.push({ name: 'Galactic bar', P: mul(galToScene(-7 * cb, -7 * sb, 0), KLY) });
    /* the glow of the disc: a few thousand soft lights of true size laid along the same arms, so the galaxy reads as light, not dots */
    const NG = 5200, gp = new Float32Array(NG * 3), gc = new Float32Array(NG * 3), gs = new Float32Array(NG);
    for (let i = 0; i < NG; i++) {
      let x, y, z = G.gauss() * 0.25, c, sz; const u = G.rnd();
      if (u < 0.06) { const a = G.gauss() * 4, b = G.gauss() * 1.7; x = a * cb - b * sb; y = a * sb + b * cb; c = [0.20, 0.15, 0.085]; sz = 1.3 + G.rnd() * 1.6; }
      else if (u < 0.28) { const r = Math.min(50, 2 - 9 * Math.log(1 - G.rnd() * 0.99)), ph = G.rnd() * Math.PI * 2; x = r * Math.cos(ph); y = r * Math.sin(ph); c = [0.06, 0.055, 0.05]; sz = 2 + G.rnd() * 2; }
      else { let k = G.rnd() * wsum, a = ARMS[0]; for (const q of ARMS) { k -= q[6]; if (k <= 0) { a = q; break; } }
        const p = armXY(a, a[4] + (a[5] - a[4]) * G.rnd()), rr = Math.hypot(p[0], p[1]); if (rr < 9 || rr > 56) { i--; continue; }
        const sp = 0.6 + rr * 0.016; x = p[0] + G.gauss() * sp; y = p[1] + G.gauss() * sp; const hii = G.rnd() < 0.16;
        c = hii ? [0.17, 0.05, 0.045] : [0.075, 0.095, 0.15]; sz = hii ? 0.35 + G.rnd() * 0.5 : 0.6 + G.rnd() * 0.9; }
      gp.set(galToScene(x, y, z), i * 3); gc.set(c, i * 3); gs[i] = sz;
    }
    const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.BufferAttribute(gp, 3)); gg.setAttribute('aColor', new T.BufferAttribute(gc, 3)); gg.setAttribute('aSize', new T.BufferAttribute(gs, 1));
    L.mwGlow = new T.Points(gg, glowPts()); L.mwGlow.frustumCulled = false; L.mwGlow.renderOrder = -19; scene.add(L.mwGlow);
    /* the Local Bubble: hot, thin gas around the Sun, open toward the galactic poles like a chimney */
    L.bubble = new T.Mesh(new T.SphereGeometry(1, 64, 40), shellMat('#F29A86')); L.bubble.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3().fromArray(A.GAL.z)); L.bubble.renderOrder = -14; scene.add(L.bubble);
  }

  /* ── 10,177 catalogued galaxies in three dimensions, each disc tilted the way we see it ── */
  function galaxyNormal(ra, dec, pa, ratio) {
    const a = ra * D2R, d = dec * D2R, n = A.radec2v(ra, dec);
    const N = [-Math.sin(d) * Math.cos(a), Math.cos(d), Math.sin(d) * Math.sin(a)], E = [-Math.sin(a), 0, -Math.cos(a)];
    const s = add(mul(N, -Math.sin(pa * D2R)), mul(E, Math.cos(pa * D2R))), inc = Math.acos(clamp(ratio, 0.12, 1));
    return norm(add(mul(n, Math.cos(inc)), mul(s, Math.sin(inc))));
  }
  const TYPE_COL = [[1.0, 0.82, 0.62], [1.0, 0.86, 0.7], [0.86, 0.88, 1.0], [0.9, 0.9, 1.0], [0.68, 0.8, 1.0], [0.9, 0.86, 0.85]];
  function buildGalaxies(buf) {
    const dv = new DataView(buf), n = dv.byteLength / 14;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n), lum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 14, ra = dv.getUint16(o, true) / 65535 * 360, dec = dv.getInt16(o + 2, true) / 32767 * 90, d = dv.getFloat32(o + 4, true);
      const type = dv.getUint8(o + 8), mag = dv.getUint8(o + 9) / 10, ls = dv.getUint8(o + 10), ratio = dv.getUint8(o + 12) / 255, pa = dv.getUint8(o + 13) / 255 * 180;
      pos.set(A.radec2v(ra, dec, d), i * 3); nrm.set(galaxyNormal(ra, dec, pa, ratio), i * 3); col.set(TYPE_COL[Math.min(5, type)], i * 3);
      sz[i] = (ls ? Math.pow(10, ls / 40) : 30) / 2000;               /* radius in million light-years */
      const Mabs = mag < 25 ? mag - 5 * Math.log10(Math.max(d, 0.01) * 1e6 / 32.6156) : -20; lum[i] = clamp(1.5 * Math.pow(10, -0.4 * (Mabs + 20.3)), 0.4, 3.2);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aN', new T.BufferAttribute(nrm, 3));
    g.setAttribute('aColor', new T.BufferAttribute(col, 3)); g.setAttribute('aSize', new T.BufferAttribute(sz, 1)); g.setAttribute('aLum', new T.BufferAttribute(lum, 1));
    L.gal = new T.Points(g, G.galaxies()); L.gal.frustumCulled = false; L.gal.renderOrder = -17; L.gal.material.uniforms.uMin.value = 3.6; scene.add(L.gal);
    /* the Milky Way itself, as one galaxy among the rest */
    const mg = new T.BufferGeometry(); mg.setAttribute('position', new T.BufferAttribute(new Float32Array(A.radec2v(266.405, -28.936, 0.02667)), 3));
    mg.setAttribute('aN', new T.BufferAttribute(new Float32Array(A.GAL.z), 3)); mg.setAttribute('aColor', new T.BufferAttribute(new Float32Array([0.95, 0.9, 0.85]), 3));
    mg.setAttribute('aSize', new T.BufferAttribute(new Float32Array([0.0528]), 1)); mg.setAttribute('aLum', new T.BufferAttribute(new Float32Array([1.6]), 1));
    L.mwDot = new T.Points(mg, G.galaxies()); L.mwDot.frustumCulled = false; L.mwDot.renderOrder = -17; scene.add(L.mwDot);
  }

  /* ── the cosmic web, the horizons and the oldest light ── */
  const HUBBLE_GLY = A.cosmo.hubbleGly, EVENT_GLY = A.cosmo.eventHorizonGly;
  const CMB_GLY = A.cosmo.comovingGly(1089.9), EDGE_GLY = A.cosmo.comovingGly(1e7);
  const zOfGly = (() => { const zs = [], ds = []; for (let i = 0; i <= 240; i++) { const z = Math.expm1(i / 240 * Math.log(1101)); zs.push(z); ds.push(A.cosmo.comovingGly(z)); }
    return g => { if (g <= 0) return 0; for (let i = 1; i < ds.length; i++) if (ds[i] >= g) { const t = (g - ds[i - 1]) / (ds[i] - ds[i - 1]); return zs[i - 1] + t * (zs[i] - zs[i - 1]); } return 1100; }; })();
  /* the cosmic web, as an illustration: galaxies gathered onto the walls, filaments and knots of a foam of voids.
     Near us it is drawn as a slice along the supergalactic plane, 300 million light-years thick, because a whole sphere of foam
     seen through its full depth averages into fog. Built off the main thread, since nobody needs it until they zoom out that far. */
  const SG = (() => { const l = 47.37 * D2R, b = 6.32 * D2R, z = A.gal2scene(Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)), x = A.gal2scene(Math.cos(137.37 * D2R), Math.sin(137.37 * D2R), 0); return { x, y: cross(z, x), z }; })();
  const WEB_SRC = `self.onmessage = function (ev) {
    var o = ev.data, n = o.n, cell = o.cell, seed = o.seed, s = (seed * 2654435761) >>> 0;
    function rnd() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }
    function fh(x, y, z, k) { var h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(k + seed, 2654435761); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
    var R = Math.ceil(o.r1 / cell) + 2, D = 2 * R + 1, F = new Float32Array(D * D * D * 3), a, b, c;
    for (a = 0; a < D; a++) for (b = 0; b < D; b++) for (c = 0; c < D; c++) { var q = ((a * D + b) * D + c) * 3, X = a - R, Y = b - R, Z = c - R; F[q] = X + fh(X, Y, Z, 1); F[q + 1] = Y + fh(X, Y, Z, 2); F[q + 2] = Z + fh(X, Y, Z, 3); }
    var pos = new Float32Array(n * 3), knot = new Float32Array(n), rad = new Float32Array(n), i = 0, tries = 0;
    while (i < n && tries < n * 60) {
      tries++; var x, y, z, r;
      if (o.wedge) { var half = o.wedge * Math.PI / 180, side = rnd() < 0.5 ? 0 : Math.PI; r = Math.sqrt(o.r0 * o.r0 + rnd() * (o.r1 * o.r1 - o.r0 * o.r0)); if (rnd() > Math.exp(-r / o.fall)) continue;
        var pw = side + (rnd() * 2 - 1) * half; x = r * Math.cos(pw); y = r * Math.sin(pw); z = (rnd() * 2 - 1) * (o.thick * r + 15); r = Math.sqrt(r * r + z * z); }
      else if (o.slab) { r = Math.sqrt(o.r0 * o.r0 + rnd() * (o.r1 * o.r1 - o.r0 * o.r0)); var ph = rnd() * 6.283185; x = r * Math.cos(ph); y = r * Math.sin(ph); z = (rnd() * 2 - 1) * o.slab; r = Math.sqrt(r * r + z * z); }
      else { var u = rnd() * 2 - 1, p2 = rnd() * 6.283185, w = Math.sqrt(1 - u * u); r = Math.cbrt(o.r0 * o.r0 * o.r0 + rnd() * (o.r1 * o.r1 * o.r1 - o.r0 * o.r0 * o.r0)); x = r * w * Math.cos(p2); y = r * w * Math.sin(p2); z = r * u; }
      var gx = x / cell, gy = y / cell, gz = z / cell, cx = Math.floor(gx) + R, cy = Math.floor(gy) + R, cz = Math.floor(gz) + R, d1 = 9, d2 = 9, d3 = 9;
      for (a = -1; a <= 1; a++) for (b = -1; b <= 1; b++) for (c = -1; c <= 1; c++) {
        var k = (((cx + a) * D + cy + b) * D + cz + c) * 3, dx = F[k] - gx, dy = F[k + 1] - gy, dz = F[k + 2] - gz, d = dx * dx + dy * dy + dz * dz;
        if (d < d1) { d3 = d2; d2 = d1; d1 = d; } else if (d < d2) { d3 = d2; d2 = d; } else if (d < d3) d3 = d;
      }
      var s1 = Math.sqrt(d1), wall = Math.sqrt(d2) - s1, fil = Math.sqrt(d3) - s1;
      if (rnd() > 0.92 * Math.exp(-fil / 0.06) + 0.16 * Math.exp(-wall / 0.03) + 0.002) continue;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; knot[i] = fil < 0.09 ? 1 : 0; rad[i] = r; i++;
    }
    var out = { pos: pos.slice(0, i * 3), knot: knot.slice(0, i), rad: rad.slice(0, i) }; postMessage(out, [out.pos.buffer, out.knot.buffer, out.rad.buffer]);
  };`;
  function webJob(target, o, unitGly, axes) {
    const finish = d => {
      const n = d.knot.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = d.pos[i * 3], y = d.pos[i * 3 + 1], z = d.pos[i * 3 + 2];
        pos.set(axes ? add(add(mul(axes.x, x), mul(axes.y, y)), mul(axes.z, z)) : [x, y, z], i * 3);
        const zz = zOfGly(d.rad[i] * unitGly), red = clamp(Math.log1p(zz) / Math.log(12), 0, 1), dim = 1 / (1 + zz * 0.35), kn = d.knot[i] ? 1.3 : 0.75;
        col.set([(0.95 - red * 0.05) * dim * kn, (0.85 - red * 0.55) * dim * kn, (0.8 - red * 0.72) * dim * kn], i * 3); size[i] = d.knot[i] ? 1.5 + G.rnd() : 0.9 + G.rnd() * 0.5;
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aColor', new T.BufferAttribute(col, 3)); g.setAttribute('aS', new T.BufferAttribute(size, 1));
      target.geometry.dispose(); target.geometry = g;
    };
    try {
      const url = URL.createObjectURL(new Blob([WEB_SRC], { type: 'text/javascript' })), w = new Worker(url);
      w.onmessage = ev => { finish(ev.data); w.terminate(); URL.revokeObjectURL(url); };
      w.onerror = () => { w.terminate(); URL.revokeObjectURL(url); inline(); };
      w.postMessage(o);
    } catch (e) { inline(); }
    function inline() { setTimeout(() => { let out = null; const me = {}; new Function('self', 'postMessage', WEB_SRC)(me, d => { out = d; }); me.onmessage({ data: o }); if (out) finish(out); }, 0); }
  }
  function buildCosmos() {
    const empty = () => placedPoints(new Float32Array(0), new Float32Array(0), new Float32Array(0), G.dust(), -16);
    L.webA = empty(); L.webB = empty();
    setTimeout(() => { webJob(L.webA, { n: 38000, r0: 180, r1: 1900, cell: 105, seed: 3, wedge: 42, thick: 0.035, fall: 1300 }, 1e-3, SG); webJob(L.webB, { n: 45000, r0: 1.6, r1: CMB_GLY * 0.995, cell: 2.4, seed: 7 }, 1, null); }, 1200);
    L.cos = new T.Group(); scene.add(L.cos);
    const shell = (r, color, mode, op) => { const m = new T.Mesh(new T.SphereGeometry(1, 96, 64), shellMat(color, mode)); m.scale.setScalar(r * GLY); m.userData.op = op; m.renderOrder = -15; L.cos.add(m); return m; };
    L.cmb = shell(CMB_GLY, '#ffffff', 1, 1); L.cmb.material.side = T.BackSide; L.edge = shell(EDGE_GLY, '#E8442C', 0, 0.9); L.hubble = shell(HUBBLE_GLY, '#8FA5D9', 0, 0.45); L.event = shell(EVENT_GLY, '#4FD8C4', 0, 0.4);
  }

  /* ── the scale rail ── */
  const RUNG_FOCUS = { 'scale-earth': 'earth', 'scale-moon': 'earth', 'scale-galaxy': 'milky-way', 'scale-local-group': 'milky-way', 'scale-laniakea': 'laniakea' };
  /* each rung, labelled by how old the light is at that scale: the site's one measure */
  const YR = 31557600, GYR = z => A.cosmo.lookbackGyr(z) * 1e9 * YR;
  const RUNG_LIGHT = { 'scale-earth': [0, 'the ground under you'], 'scale-moon': [1.282, 'the Moon'], 'scale-inner': [499, 'the Sun'], 'scale-planets': [15040, 'Neptune'],
    'scale-heliosphere': [86400, 'Voyager 1'], 'scale-oort': [1.6 * YR, 'the outer Oort cloud'], 'scale-neighbours': [4.2465 * YR, 'Proxima Centauri'], 'scale-bubble': [444 * YR, 'the Pleiades'],
    'scale-arm': [1344 * YR, 'the Orion Nebula'], 'scale-galaxy': [26670 * YR, 'the centre of the galaxy'], 'scale-local-group': [2.5e6 * YR, 'Andromeda'],
    'scale-laniakea': [53.8e6 * YR, 'the Virgo Cluster'], 'scale-web': [GYR(0.073), 'the Sloan Great Wall'], 'scale-universe': [GYR(1089.9), 'the cosmic microwave background'] };
  function rungLight(slug) {
    const L_ = RUNG_LIGHT[slug]; if (!L_ || !B.earth) return L_;
    const d = id => len(sub(B[id], B.earth)) / C;
    if (slug === 'scale-moon') return [d('moon'), L_[1]]; if (slug === 'scale-inner') return [d('sun'), L_[1]];
    if (slug === 'scale-planets') return [d('neptune'), L_[1]]; if (slug === 'scale-heliosphere') return [d('voyager-1'), L_[1]];
    return L_;
  }
  function shortAge(sec) {
    if (sec <= 0) return 'now'; if (sec < 60) return O.fmt.sig(sec, 2) + ' s'; if (sec < 3600) return Math.floor(sec / 60) + ' min ' + Math.round(sec % 60) + ' s';
    if (sec < 86000) return Math.floor(sec / 3600) + ' h ' + Math.round(sec % 3600 / 60) + ' min'; if (sec < 2 * YR) return sec < 2 * 86400 ? '1 day' : O.fmt.sig(sec / YR, 2) + ' yr';
    const y = sec / YR; return y < 100 ? O.fmt.sig(y, 2) + ' yr' : y < 1e6 ? O.fmt.num(y) + ' yr' : y < 1e9 ? O.fmt.sig(y / 1e6, 3) + ' million yr' : O.fmt.sig(y / 1e9, 3) + ' billion yr';
  }
  function buildRail() {
    const ol = $('#rungs'), lo = LMIN + 2.4, hi = LMAX;
    REG.SCALES.forEach(s => {
      const f = (Math.log10(s[2]) - lo) / (hi - lo), L_ = rungLight(s[0]);
      ol.append(el('li', { style: { top: (100 - f * 100) + '%' } }, el('button', { type: 'button', data: { slug: s[0] }, title: 'Light from ' + L_[1] + ' takes ' + shortAge(L_[0]) + ' to reach you', onclick: () => flyTo(R.find(s[0])) },
        s[1], el('span', { text: shortAge(L_[0]) }))));
    });
    $('#rail').append(el('div', { class: 'cap', text: 'how old the light is' }));
    S.railLo = lo; S.railHi = hi;
  }
  /* keep rung names from colliding on short screens: true log positions, nudged apart where they crowd */
  function layoutRail() {
    const ol = $('#rungs'), h = ol.clientHeight; if (!h) return;
    const lis = O.$$('li', ol), gap = 27, ys = REG.SCALES.map(s => (1 - (Math.log10(s[2]) - S.railLo) / (S.railHi - S.railLo)) * h);
    const n = ys.length;                                   /* SCALES runs from Earth (lowest on the rail) to the universe (highest) */
    for (let i = 1; i < n; i++) ys[i] = Math.min(ys[i], ys[i - 1] - gap);
    if (ys[n - 1] < 0) { ys[n - 1] = 0; for (let i = n - 2; i >= 0; i--) ys[i] = Math.max(ys[i], ys[i + 1] + gap); }
    lis.forEach((li, i) => { li.style.top = ys[i].toFixed(1) + 'px'; });
  }

  /* ── positions ── */
  const ISS = { rec: null, fetched: null };
  function loadTle() {
    O.load('data/tle.json').then(t => {
      const s = t && Array.isArray(t.sats) && t.sats.find(x => x.norad === 25544);
      if (!s || !s.l1 || !s.l2) return;
      const age = (Date.now() - new Date(t.fetched).getTime()) / 864e5; if (!(age < 7)) return;     /* older elements put it hundreds of km off */
      const go = () => { try { ISS.rec = window.satellite.twoline2satrec(s.l1, s.l2); ISS.fetched = t.fetched; } catch (e) { ISS.rec = null; } };
      if (window.satellite) return go();
      const sc = document.createElement('script'); sc.src = 'vendor/satellite.min.js'; sc.onload = go; document.head.append(sc);
    });
  }
  const GALILEAN = { io: 0, europa: 1, ganymede: 2, callisto: 3 };
  const poleOf = id => A.POLES[id] ? A.radec2v(A.POLES[id][0], A.POLES[id][1]) : A.ecl2scene([0, 0, 1]);
  function updateBodies() {
    const jd = S.jd, ecl = id => mul(A.ecl2scene(A.helio(id, jd)), AU);
    B.sun = [0, 0, 0]; for (const n of A.PLANETS) B[n] = ecl(n);
    const E = B.earth, m = A.moon(jd); B.moon = add(E, A.radec2v(m.ra, m.dec, m.distKm * 1000));
    const gal = A.galilean(jd);
    for (const b of bodies) {
      if (b.el) B[b.id] = mul(A.ecl2scene(A.elementsXYZ(b.el, jd)), AU);
      else if (b.kind === 'moon' && b.parentId && B[b.parentId]) {
        const pole = poleOf(b.parentId), toE = norm(sub(E, B[b.parentId])), e1 = norm(sub(toE, mul(pole, dot(toE, pole)))), e2 = cross(pole, e1);
        let ang = GALILEAN[b.id] != null ? gal[GALILEAN[b.id]].u * D2R : 2 * Math.PI * ((jd - 2451545) / b.period + hash01(b.id));
        if (b.id === 'triton') ang = -ang;
        B[b.id] = add(B[b.parentId], add(mul(e1, b.a * 1000 * Math.cos(ang)), mul(e2, b.a * 1000 * Math.sin(ang))));
      }
    }
    /* JWST loops around L2, 1.5 million km beyond Earth on the line from the Sun; where it is on that loop is not drawn */
    B.jwst = add(E, mul(norm(E), 1.5e9));
    /* the ISS only when today's orbital elements are on hand (data/tle.json, refreshed by the site's daily job) */
    if (ISS.rec) { const p = window.satellite.propagate(ISS.rec, A.dateOf ? A.dateOf(jd) : new Date());
      if (p && p.position) B.iss = add(E, [p.position.x * 1000, p.position.z * 1000, -p.position.y * 1000]); else delete B.iss; }
    for (const id in A.PROBES) B[id] = mul(A.ecl2scene(A.probe(id, jd).pos), AU);
  }
  const GC = A.radec2v(266.405, -28.936, 26670 * LY);
  /* fixed places are computed once; bodies in the Solar System move and are read live */
  const P_ = e => e._p || (e._p = A.radec2v(e.ra, e.dec, e.ly * LY));
  const U_ = e => e._u || (e._u = A.radec2v(e.ra, e.dec));
  function posOf(e) {
    if (!e) return [0, 0, 0];
    if (e.kind === 'scale') return posOf(R.find(RUNG_FOCUS[e.slug] || 'sun'));
    if (e.body) return (B[e.body] || (e.body === 'iss' ? B.earth : null) || [0, 0, 0]).slice();
    if (e.kind === 'horizon' || e.shell) return [0, 0, 0];
    if (e.home) return GC;
    if (e.ra != null && e.ly != null) return P_(e);
    return [0, 0, 0];
  }
  function radiusOf(e) {
    if (!e) return 0;
    if (e.radius) return e.radius * 1000;
    if ((e.kind === 'star' || e.kind === 'system') && e.absmag != null) return A.starRadius(e.absmag, e.bv == null ? 0.65 : e.bv) * RSUN;
    if (e.mass) return 2953 * e.mass;
    if (e.kind === 'pulsar') return 1.2e4;
    return 0;
  }
  function spanOf(e) {
    if (e.kind === 'scale') return e.span;
    if (e.kind === 'horizon' || e.shell) { const r = e.shell === 'hubble' ? HUBBLE_GLY : e.shell === 'event' ? EVENT_GLY : (e.ly || 0) / 1e9; return clamp(r * GLY * 2.7, 1e25, 1.2e27); }
    if (e.home) return 2.4e21;
    return REG.spanFor(e, A);
  }
  const findEntry = s => R.find(s) || R.find(O.slug(decodeURIComponent(s)));

  /* ── the focus layer: what an object looks like up close ── */
  const F = { mesh: new T.Group(), pts: null, front: null, e: null, hole: null, beams: null, glow: null, r: 0, planetsTilt: null };
  scene.add(F.mesh);
  /* a cone with its tip at the origin, opening along +Y to radius 1 at height 1: beams and jets */
  const coneGeo = (() => { const g = new T.ConeGeometry(1, 1, 40, 1, true); g.translate(0, -0.5, 0); g.rotateX(Math.PI); return g; })();
  function beam(dir, length, radius) { const m = new T.Mesh(coneGeo, beamMat); m.scale.set(radius, length, radius); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.clone().normalize()); return m; }
  /* B−V from temperature, inverting the same relation bv2rgb uses */
  function bvFromT(T0) { let lo = -0.4, hi = 2.0; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (A.tempFromBV(m) > T0) lo = m; else hi = m; } return (lo + hi) / 2; }
  const hexOf = c => '#' + new T.Color(c[0], c[1], c[2]).getHexString();
  function clearFocusLayer() {
    for (const c of [...F.mesh.children]) { F.mesh.remove(c); c.traverse(o => { if (o.geometry && o.geometry !== sphere && o.geometry !== coneGeo) o.geometry.dispose(); if (o.material && o.material !== beamMat) o.material.dispose(); }); }
    if (F.pts) { scene.remove(F.pts); F.pts.geometry.dispose(); F.pts.material.dispose(); F.pts = null; }
    for (const c of [...overlay.children]) overlay.remove(c);
    F.front = F.hole = F.beams = F.glow = F.planetsTilt = null; F.r = 0; post.u.uHole.value.w = 0;
    if (F.hidGal != null) { const a = L.gal.geometry.attributes.aLum; a.array[F.hidGal] = F.hidLum; a.needsUpdate = true; F.hidGal = null; }
  }
  /* the catalogue's own dot for a galaxy is hidden while its close-up model is shown */
  function hideGal(i) { const a = L.gal.geometry.attributes.aLum; F.hidGal = i; F.hidLum = a.array[i]; a.array[i] = 0; a.needsUpdate = true; }
  function holeAt(rs, normal) {                    /* a disc that bends around its own shadow: the lens itself is drawn in post */
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), normal);
    const back = new T.Mesh(new T.RingGeometry(3, 12, 200, 6), G.disc()); back.material.uniforms.uSide.value = -1; back.scale.setScalar(rs); back.quaternion.copy(q); F.mesh.add(back);
    const front = new T.Mesh(new T.RingGeometry(3, 12, 200, 6), G.disc()); front.material.uniforms.uSide.value = 1; front.material.uniforms.uOut.value = 1; front.scale.setScalar(rs); front.quaternion.copy(q);
    const og = new T.Group(); og.add(front); overlay.add(og); F.front = og; F.hole = rs;
  }
  function buildFocusLayer(e) {
    clearFocusLayer(); F.e = e; if (!e) return;
    const isStar = e.kind === 'star' || e.kind === 'system';
    if (isStar) {                                    /* a star at its true size and colour; its planets on their orbits */
      const bv = e.bv != null ? e.bv : e.system && e.system.teff ? bvFromT(e.system.teff) : 0.65;
      const c = A.bv2rgb(bv), hex = hexOf(c), r = e.body === 'sun' ? 695700e3 : (radiusOf(e) || RSUN);
      if (e.body !== 'sun') { const m = new T.Mesh(sphere, G.body([4, hex, '#000', '#fff', 1])); m.material.uniforms.uSeed.value = hash01(e.slug) * 30; m.scale.setScalar(r); F.mesh.add(m); }
      F.glow = new T.Sprite(G.glow(hex, 1.2)); F.glow.renderOrder = 3; F.mesh.add(F.glow); F.r = r;
      if (e.system) {
        const sys = e.system, tilt = new T.Group(); tilt.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3().fromArray(norm([hash01(e.slug) - 0.5, 1, hash01(e.slug + 'z') - 0.5]))); F.mesh.add(tilt);
        if (sys.hz) { const hz = new T.Mesh(new T.RingGeometry(sys.hz[0] * AU, sys.hz[1] * AU, 160, 1), new T.MeshBasicMaterial({ color: '#4FD8C4', transparent: true, opacity: 0.055, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
          hz.rotation.x = -Math.PI / 2; tilt.add(hz); }
        for (const p of sys.planets) {
          if (!p.a) continue;
          const o = new T.LineLoop(circleGeo(256), new T.LineBasicMaterial({ color: p.hz ? '#4FD8C4' : '#B3A696', transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending }));
          o.scale.setScalar(p.a * AU); tilt.add(o);
          const ph = 2 * Math.PI * ((S.jd / (p.period || 365)) % 1 + hash01(p.name));
          const look = [p.rE && p.rE < 1.8 ? 0 : 1, p.teq && p.teq > 900 ? '#D9775A' : p.hz ? '#8FB7C8' : '#C9B79C', '#6E635A', '#E6D9C1', p.rE && p.rE < 1.8 ? 1 : 6];
          const pm = new T.Mesh(sphere, G.body(look)); pm.material.uniforms.uSeed.value = hash01(p.name) * 40;
          pm.scale.setScalar((p.rE || (p.mE ? Math.pow(p.mE, 0.4) : 1)) * 6371e3); pm.position.set(Math.cos(ph) * p.a * AU, 0, Math.sin(ph) * p.a * AU); pm.userData.planet = p; tilt.add(pm);
        }
        F.planetsTilt = tilt;
      }
    } else if (/galaxy|satellite|quasar/.test(e.kind) && !e.home) {
      const sizeLy = e.sizeLy || (e.kind === 'quasar' ? 1.2e5 : 6e4);
      let type = 2, nrm = null;
      if (e.gi != null && S.galBin) { hideGal(e.gi); const o = e.gi * 14; type = S.galBin.getUint8(o + 8); nrm = galaxyNormal(e.ra, e.dec, S.galBin.getUint8(o + 13) / 255 * 180, S.galBin.getUint8(o + 12) / 255); }
      const mt = e.kind === 'quasar' ? 0 : e.kind === 'satellite' ? 4 : [0, 1, 2, 3, 4, 2][Math.min(5, type)];
      const axis = new T.Vector3().fromArray(nrm || norm([hash01(e.slug) - 0.5, hash01(e.slug + 'y') - 0.5, 0.6]));
      const m = G.galaxyModel(mt, 32000), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), axis);
      const v = new T.Vector3(), rad = sizeLy / 2, dim = e.kind === 'satellite' ? 0.3 : 0.5;
      for (let i = 0; i < m.size.length; i++) { v.set(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]).applyQuaternion(q).multiplyScalar(rad); m.pos[i * 3] = v.x; m.pos[i * 3 + 1] = v.y; m.pos[i * 3 + 2] = v.z; for (let k = 0; k < 3; k++) m.col[i * 3 + k] *= dim; }
      F.pts = placedPoints(m.pos, m.col, m.size, G.dust(), -6); F.ptsUnit = LY; F.ptsSize = sizeLy;
      if (e.kind === 'quasar') {                       /* the brightest things in the universe: a black hole feeding, jets out both poles */
        F.glow = new T.Sprite(G.glow('#CFE0FF', 2.2)); F.glow.renderOrder = 3; F.mesh.add(F.glow); F.r = e.mass ? 2953 * e.mass * 40 : 3e15;
        for (const s of [1, -1]) F.mesh.add(beam(axis.clone().multiplyScalar(s), sizeLy * 2.2 * LY, sizeLy * 0.014 * LY));
        if (e.mass) holeAt(2953 * e.mass, axis);
      }
    } else if (e.kind === 'cluster' && e.ly > 1e6) {    /* a cluster of galaxies: a swarm of tilted discs at their true sizes (the members drawn are illustrative) */
      const sizeLy = e.sizeLy || 1e7, N = 1400, c = G.clusterModel(N, 0.35), nrm = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N), lum = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        for (let k = 0; k < 3; k++) c.pos[i * 3 + k] *= sizeLy / 2;
        const u = G.rnd() * 2 - 1, th = G.rnd() * 6.2832, s = Math.sqrt(1 - u * u); nrm.set([s * Math.cos(th), u, s * Math.sin(th)], i * 3);
        const r = Math.hypot(c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]) / (sizeLy / 2), ell = G.rnd() < 0.85 - r * 0.6;
        col.set(TYPE_COL[ell ? 0 : 2], i * 3); sz[i] = (ell ? 25e3 : 40e3) * (0.4 + G.rnd() * G.rnd() * 2.2); lum[i] = 0.9 + G.rnd() * 1.6;
      }
      if (e.slug === 'virgo-cluster' || e.slug === 'coma-cluster' || e.slug === 'perseus-cluster') { c.pos.set([0, 0, 0], 0); sz[0] = 2.4e5; lum[0] = 2.6; col.set(TYPE_COL[0], 0); }   /* a giant elliptical at the heart */
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(c.pos, 3)); g.setAttribute('aN', new T.BufferAttribute(nrm, 3));
      g.setAttribute('aColor', new T.BufferAttribute(col, 3)); g.setAttribute('aSize', new T.BufferAttribute(sz, 1)); g.setAttribute('aLum', new T.BufferAttribute(lum, 1));
      F.pts = new T.Points(g, G.galaxies()); F.pts.material.uniforms.uMin.value = 3.2; F.pts.frustumCulled = false; F.pts.renderOrder = -6; scene.add(F.pts); F.ptsUnit = LY; F.ptsSize = sizeLy;
    } else if (e.kind === 'globular' || e.kind === 'cluster') {
      const sizeLy = e.sizeLy || 20, m = G.clusterModel(e.kind === 'globular' ? 9000 : 1500, e.kind === 'globular' ? 0.22 : 0.6);
      for (let i = 0; i < m.pos.length; i++) m.pos[i] *= sizeLy / 2;
      for (let i = 0; i < m.col.length; i++) m.col[i] *= 0.55;
      F.pts = placedPoints(m.pos, m.col, m.size, G.dust(), -6); F.ptsUnit = LY; F.ptsSize = sizeLy;
    } else if (e.kind === 'nebula' || e.kind === 'remnant' || e.kind === 'region') {
      const kind = e.sub === 'planetary' ? 2 : e.kind === 'remnant' ? 3 : e.sub === 'reflection' || e.kind === 'region' ? 1 : 0, sizeLy = e.sizeLy || 20;
      const m = new T.Mesh(new T.PlaneGeometry(2, 2), G.nebula(kind, hash01(e.slug) * 50)); m.scale.setScalar(sizeLy / 2 * LY); m.userData.billboard = true;
      if (e.kind === 'region') m.material.uniforms.uOp.value = 0.25;
      F.mesh.add(m);
    } else if (e.kind === 'blackhole' && e.mass) {
      holeAt(2953 * e.mass, new T.Vector3().fromArray(norm([0.25, 1, 0.12])));
    } else if (e.kind === 'pulsar') {                 /* a neutron star about 24 km across, sweeping two beams */
      const ns = new T.Mesh(sphere, G.body([4, '#CFE0FF', '#000', '#fff', 1])); ns.scale.setScalar(1.2e4); F.mesh.add(ns);
      F.glow = new T.Sprite(G.glow('#CFE0FF', 1.4)); F.glow.renderOrder = 3; F.mesh.add(F.glow); F.r = 1.2e4;
      const spin = new T.Group(), mag = new T.Group(); mag.rotation.z = 0.45; spin.add(mag); F.mesh.add(spin);
      for (const s of [1, -1]) mag.add(beam(new T.Vector3(0, s, 0), 1.6e5, 2.4e4));
      F.beams = spin; F.period = Math.max((e.sig || 1000) / 1000, 1.6);
    }
    if (F.pts) { F.pts.material.uniforms.uSize && (F.pts.material.uniforms.uSize.value = (S.k || 1) * 1.1); if (F.pts.material.uniforms.uPx) F.pts.material.uniforms.uPx.value = pxPerUnit * pr; }
  }

  /* ── focus and flight ── */
  /* the focus is what the view is centred on; a rung is a scale, centred on whatever that scale is about */
  function setFocus(e, opt) {
    if (!e) return; opt = opt || {};
    const rung = opt.rung || null, shown = F.e === e && S.rung === rung;
    S.focus = e; S.rung = rung; S.F = posOf(e); S.minLs = minLsOf(e);
    if (!shown) { buildFocusLayer(e); renderPanel(e, rung); renderCrumbs(e); }
    if (opt.instant) S.ls = S.lsT = clamp(Math.log10(spanOf(rung || e)), S.minLs, LMAX);
    if (e.kind !== 'scale') O.log.mark('obj:' + e.slug, e.name, 'ladder.html#' + e.slug);
    const want = '#' + (rung || e).slug; if (location.hash !== want) history.replaceState(null, '', want);
  }
  function setView(yaw, pitch) { const TAU = Math.PI * 2; S.tYaw = S.yaw + ((((yaw - S.yaw) % TAU) + TAU + Math.PI) % TAU - Math.PI); S.tPitch = pitch; S.vYaw = S.vPitch = 0; }
  const minLsOf = e => Math.max(LMIN, Math.log10(Math.max(radiusOf(e) * 2.6, 1)));
  function flyTo(e, opt) {
    if (!e) return; opt = opt || {};
    const rung = e.kind === 'scale' ? e : null, target = rung ? R.find(RUNG_FOCUS[e.slug] || 'sun') : e;
    const ls1 = clamp(opt.span ? Math.log10(opt.span) : Math.log10(spanOf(e)), minLsOf(target), LMAX);
    const P0 = S.F.slice(), P1 = posOf(target), d = len(sub(P1, P0));
    const lsTop = Math.max(S.ls, ls1, d > 0 ? Math.log10(d * 2.4) : -99);
    const dur = O.reduced ? 0.01 : clamp(0.9 + 0.32 * (Math.abs(lsTop - S.ls) + Math.abs(lsTop - ls1)), 1.1, 6);
    S.flight = { target, rung, P0, ls0: S.ls, ls1, lsTop, t: 0, dur };
    /* beyond the Solar System, turn so home is in the background: the Sun from another star, the Milky Way from another galaxy */
    if (!rung && !target.body && target.kind !== 'horizon' && !target.shell && len(P1) > 3e15 && !opt.keepView) { const c = norm(P1); setView(Math.atan2(c[0], c[2]) + 0.32, clamp(Math.asin(c[1]) + 0.14, -1.2, 1.2)); }
    if (F.e !== target) buildFocusLayer(target);
    renderPanel(target, rung); renderCrumbs(target); S.rung = rung;
    if (rung && /^scale-(laniakea|web)$/.test(rung.slug)) { const a = (rung.slug === 'scale-web' ? 28 : 55) * D2R, d = norm(add(mul(SG.z, Math.cos(a)), mul(SG.x, Math.sin(a)))); setView(Math.atan2(d[0], d[2]), Math.asin(d[1])); }
    if (rung && /^scale-(arm|galaxy|local-group)$/.test(rung.slug)) { const a = 38 * D2R, d = norm(sub(mul(A.GAL.z, Math.cos(a)), mul(A.GAL.x, Math.sin(a)))); setView(Math.atan2(d[0], d[2]), Math.asin(d[1])); }
  }
  function stepFlight(dt) {
    const f = S.flight; if (!f) return;
    f.t = Math.min(1, f.t + dt / f.dur); const u = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
    const hump = Math.max(0, f.lsTop - Math.max(f.ls0, f.ls1));
    S.ls = S.lsT = lerp(f.ls0, f.ls1, u) + hump * Math.sin(Math.PI * u);
    const P1 = posOf(f.target), w = sstep(0.12, 0.88, f.t);
    S.F = add(f.P0, mul(sub(P1, f.P0), w));
    if (f.t >= 1) { S.flight = null; setFocus(f.target, { rung: f.rung }); S.ls = S.lsT = f.ls1; }
  }

  /* ── input ── */
  function bindInput() {
    let drag = null, pinch = null; const pts = new Map();
    stage.addEventListener('pointerdown', e => { if (e.target.closest('button,a,#panel,#tour')) return; stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now() }; else if (pts.size === 2) { const p = [...pts.values()]; pinch = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); drag = null; }
      stage.classList.add('drag'); S.idle = 0; });
    stage.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch) { const p = [...pts.values()], d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); zoomBy(-Math.log10(d / pinch) * 1.6); pinch = d; return; }
      if (drag) { S.vYaw -= (e.clientX - drag.x) / W * 3.2; S.vPitch += (e.clientY - drag.y) / H * 2.4; drag.x = e.clientX; drag.y = e.clientY; } S.idle = 0; });
    const end = e => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (drag && pts.size === 0 && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5 && performance.now() - drag.t < 500) pick(e.clientX, e.clientY);
      if (pts.size < 2) pinch = null; if (pts.size === 0) { drag = null; stage.classList.remove('drag'); } };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    stage.addEventListener('wheel', e => { e.preventDefault(); const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1; zoomBy(e.deltaY * k * 0.0016); S.idle = 0; }, { passive: false });
    addEventListener('keydown', e => {
      if (O.palette.isOpen || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      const k = e.key;
      if (k === '+' || k === '=') zoomBy(-0.25); else if (k === '-' || k === '_') zoomBy(0.25);
      else if (k === 'ArrowLeft') S.vYaw += 0.06; else if (k === 'ArrowRight') S.vYaw -= 0.06; else if (k === 'ArrowUp') S.vPitch += 0.05; else if (k === 'ArrowDown') S.vPitch -= 0.05;
      else if (k === 'Escape') { if (S.tour) endTour(); else panel.classList.toggle('min'); }
      else if (k === 'Home') flyTo(R.find('earth'));
      else return;
      e.preventDefault(); S.idle = 0;
    });
    addEventListener('hashchange', () => { const s = location.hash.slice(1); if (!s || (S.focus && s === S.focus.slug)) return; const e = findEntry(s); if (e) flyTo(e); else showMissing(s); });
    const tog = (id, key, fn) => { const b = $(id); b.addEventListener('click', () => { S[key] = !S[key]; b.setAttribute('aria-pressed', S[key]); if (fn) fn(S[key]); }); };
    tog('#bLabels', 'labels'); tog('#bLines', 'lines');
    $('#bSound').addEventListener('click', () => { const on = !Snd.on; on ? Snd.start() : Snd.stop(); $('#bSound').setAttribute('aria-pressed', on); });
    $('#bHome').addEventListener('click', () => flyTo(R.find('earth')));
    $('#bTour').addEventListener('click', () => S.tour ? endTour() : startTour());
    $('#tNext').addEventListener('click', () => tourGo(S.tour.i + 1)); $('#tPrev').addEventListener('click', () => tourGo(S.tour.i - 1)); $('#tEnd').addEventListener('click', endTour);
  }
  function zoomBy(d) { if (S.flight) return; S.lsT = clamp(S.lsT + d, S.minLs, LMAX); }
  function pick(x, y) {
    const r = stage.getBoundingClientRect(); x -= r.left; y -= r.top; let best = null, bd = 24;
    for (const c of cands) { if (!c.e) continue; const d = Math.hypot(c.sx - x, c.sy - y); if (d < bd) { bd = d; best = c.e; } }
    if (best && best !== S.focus) flyTo(best);
  }

  /* ── labels and markers ── */
  let cands = [], shown = new Map(); const pool = [], mpool = [], _w = new T.Vector3();
  const _v = new T.Vector3();
  function project(view, out) {               /* view-space point → screen; false when behind the camera */
    _v.set(view[0], view[1], view[2]).project(camera); if (_v.z > 1 || _v.z < -1) return false;
    out.sx = (_v.x * 0.5 + 0.5) * W; out.sy = (-_v.y * 0.5 + 0.5) * H; return out.sx > -40 && out.sx < W + 40 && out.sy > -20 && out.sy < H + 20;
  }
  function marker(i, view, px, color) {
    let s = mpool[i]; if (!s) { s = new T.Sprite(new T.SpriteMaterial({ map: G.glowTex(), color: 0xffffff, blending: T.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true })); s.renderOrder = 5; markers.add(s); mpool[i] = s; }
    const dist = Math.max(0.01, camera.position.distanceTo(_v.set(view[0], view[1], view[2])));
    s.position.set(view[0], view[1], view[2]); s.scale.setScalar(px * dist / pxPerUnit); s.material.color.set(color).multiplyScalar(1.7); s.visible = true;
  }

  /* ── the frame ── */
  let last = performance.now(), hudT = 0, slow = 0, quality = Math.min(devicePixelRatio || 1, 1.75);
  function resize() {
    const r = stage.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); pr = quality;
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.fov = 2 * Math.atan(VIEW / 2 / CAM_D / Math.min(1, W / H)) / D2R; camera.updateProjectionMatrix();
    post.resize(Math.floor(W * pr), Math.floor(H * pr)); pxPerUnit = H / (2 * Math.tan(camera.fov * D2R / 2));
    const k = S.k = Math.min(2, Math.max(1, H / 700)) * pr;
    if (F.pts) { const u = F.pts.material.uniforms; if (u.uSize) u.uSize.value = k * 1.1; if (u.uPx) u.uPx.value = pxPerUnit * pr; }
    L.sky.material.uniforms.uSize.value = k * 0.95; L.local.material.uniforms.uSize.value = k * 0.95; exoMat.uniforms.uSize.value = k;
    for (const p of [L.dso, L.mw, L.belt, L.kuiper, L.oort, L.webA, L.webB]) p.material.uniforms.uSize.value = k * (p === L.mw ? 1.3 : 1.1);
    L.gal.material.uniforms.uPx.value = pxPerUnit * pr; L.mwDot.material.uniforms.uPx.value = pxPerUnit * pr;
    layoutRail();
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now; if (document.hidden) return;
    if (dt > 0.034) slow += dt; else slow = Math.max(0, slow - dt * 0.5);
    if (slow > 3 && quality > 1) { quality = 1; slow = 0; resize(); }
    S.jd = A.jdOf(new Date()); updateBodies(); stepTour(dt);
    stepFlight(dt);
    if (!S.flight) { S.ls += (S.lsT - S.ls) * (1 - Math.exp(-dt * 7)); if (S.focus) S.F = posOf(S.focus); }
    S.idle += dt; if (S.idle > 6 && !O.reduced && !S.tour) S.vYaw -= dt * 0.012;
    S.tYaw += S.vYaw; S.tPitch = clamp(S.tPitch + S.vPitch, -1.45, 1.45); S.vYaw *= Math.pow(0.86, dt * 60); S.vPitch *= Math.pow(0.86, dt * 60);
    S.yaw += (S.tYaw - S.yaw) * (1 - Math.exp(-dt * 10)); S.pitch += (S.tPitch - S.pitch) * (1 - Math.exp(-dt * 10));
    camera.position.set(CAM_D * Math.cos(S.pitch) * Math.sin(S.yaw), CAM_D * Math.sin(S.pitch), CAM_D * Math.cos(S.pitch) * Math.cos(S.yaw)); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const ls = S.ls, span = Math.pow(10, ls), kv = VIEW / span, Fp = S.F, fd = len(Fp), t = now / 1000;
    const inSolar = fd < 3e15, nearSun = fd < 2500 * LY, nearby = fd < 50 * LY, inGalaxy = fd < 6e4 * LY;
    const view = P => [(P[0] - Fp[0]) * kv, (P[1] - Fp[1]) * kv, (P[2] - Fp[2]) * kv];
    const sunDirOf = P => { const l = len(P); return l ? [-P[0] / l, -P[1] / l, -P[2] / l] : [1, 0, 0]; };

    /* sky (from the Sun) and the Milky Way band (from inside it) */
    const skyOp = inSolar ? 1 - sstep(15.0, 15.8, ls) : 0;
    L.sky.visible = skyOp > 0.003; L.sky.material.uniforms.uOp.value = skyOp; L.sky.material.uniforms.uTime.value = t; L.sky.material.uniforms.uTw.value = O.reduced ? 0 : 1 - sstep(9, 12, ls);
    const bandOp = nearSun ? 1 - sstep(19.0, 20.0, ls) : 0; L.band.visible = bandOp > 0.003; bandMat.uniforms.uOp.value = bandOp;
    /* stars with distances: a sky around the focus up close, a map farther out */
    const uT = nearSun ? sstep(15.2, 16.6, ls) : 1, locOp = inGalaxy ? (inSolar ? sstep(14.6, 15.4, ls) : 1) * (1 - sstep(20.2, 20.9, ls)) : 0;
    const Mlim = S.Mlim = clamp(14 - 9.5 * (ls - 17.6), -2.5, 14);      /* the faint stars drop out as the view widens, leaving the luminous ones that show the structure */
    L.local.visible = locOp > 0.003; placeUniforms(L.local.material, mul(Fp, 1 / LY), LY * kv, uT); L.local.material.uniforms.uOp.value = locOp; L.local.material.uniforms.uMlim.value = Mlim;
    const consOp = S.lines && nearSun ? win(ls, 18.2, 18.8, 19.7, 20.2) * 0.3 : 0;      /* the figures, once their stars have depth: they only hold their shape from here */
    L.cons.visible = consOp > 0.003; placeUniforms(L.cons.material, mul(Fp, 1 / LY), LY * kv, uT); L.cons.material.uniforms.uOp.value = consOp;
    const exoOp = fd < 200 * LY ? win(ls, 15.6, 16.4, 18.5, 19.1) * uT : 0;     /* the neighbourhood's planetary systems, seen from the neighbourhood */ L.exo.visible = exoOp > 0.003; placeUniforms(exoMat, mul(Fp, 1 / LY), LY * kv, 1); exoMat.uniforms.uOp.value = exoOp; exoMat.uniforms.uTime.value = t;
    const dsoOp = fd < 3e5 * LY ? win(ls, 16.6, 17.4, 21.3, 21.9) : 0; L.dso.visible = dsoOp > 0.003; placeUniforms(L.dso.material, mul(Fp, 1 / LY), LY * kv, 1); L.dso.material.uniforms.uOp.value = dsoOp;
    /* belts and the Oort cloud, in AU */
    for (const [p, a0, a1, b0, b1] of [[L.belt, 10.8, 11.5, 12.7, 13.3], [L.kuiper, 12.2, 13.0, 15.4, 16.0], [L.oort, 14.6, 15.4, 16.8, 17.3]]) {
      const op = inSolar || (ls > 16 && nearby) ? win(ls, a0, a1, b0, b1) : 0; p.visible = op > 0.003; placeUniforms(p.material, mul(Fp, 1 / AU), AU * kv, 1); p.material.uniforms.uOp.value = op * 0.9; }
    /* the galaxy, the galaxies, the web */
    const gcv = view(GC), galPx = 1.05e5 * LY * kv / Math.max(0.2, Math.hypot(gcv[0] - camera.position.x, gcv[1] - camera.position.y, gcv[2] - camera.position.z)) * pxPerUnit, big = sstep(28, 90, galPx);
    const mwOp = S.mwOp = win(ls, 19.3, 20.3, 99, 100) * big; L.mw.visible = mwOp > 0.003;
    const glOp = win(ls, 19.0, 19.9, 99, 100) * big; L.mwGlow.visible = glOp > 0.003; placeUniforms(L.mwGlow.material, mul(Fp, 1 / KLY), KLY * kv, 1); L.mwGlow.material.uniforms.uOp.value = glOp; L.mwGlow.material.uniforms.uPx.value = pxPerUnit * pr;
    const bbOp = nearSun ? win(ls, 18.4, 18.9, 19.7, 20.3) : 0; L.bubble.visible = bbOp > 0.003;
    if (L.bubble.visible) { const bo = view(mul(A.GAL.z, 60 * LY)); L.bubble.position.set(bo[0], bo[1], bo[2]); L.bubble.scale.set(360 * LY * kv, 600 * LY * kv, 300 * LY * kv); L.bubble.material.uniforms.uOp.value = bbOp * 0.35; } placeUniforms(L.mw.material, mul(Fp, 1 / KLY), KLY * kv, 1); L.mw.material.uniforms.uOp.value = mwOp;
    const galOp = win(ls, 20.7, 21.5, 26.3, 26.9); L.gal.visible = galOp > 0.003; placeUniforms(L.gal.material, mul(Fp, 1 / MLY), MLY * kv, 1); L.gal.material.uniforms.uOp.value = galOp;
    const dotOp = (1 - big) * sstep(20.0, 20.6, ls) * (1 - sstep(26.0, 26.6, ls)); L.mwDot.visible = dotOp > 0.003; placeUniforms(L.mwDot.material, mul(Fp, 1 / MLY), MLY * kv, 1); L.mwDot.material.uniforms.uOp.value = dotOp;
    const waOp = win(ls, 23.6, 24.4, 25.9, 26.5) * 0.9; L.webA.visible = waOp > 0.003; placeUniforms(L.webA.material, mul(Fp, 1 / MLY), MLY * kv, 1); L.webA.material.uniforms.uOp.value = waOp;
    const wbOp = sstep(24.9, 25.7, ls); L.webB.visible = wbOp > 0.003; placeUniforms(L.webB.material, mul(Fp, 1 / GLY), GLY * kv, 1); L.webB.material.uniforms.uOp.value = wbOp;
    L.cos.position.set(-Fp[0] * kv, -Fp[1] * kv, -Fp[2] * kv); L.cos.scale.setScalar(kv);
    const cosOp = sstep(25.3, 26.0, ls); L.cos.visible = cosOp > 0.003;
    for (const m of [L.hubble, L.event, L.edge]) m.material.uniforms.uOp.value = cosOp * m.userData.op;
    L.cmb.material.uniforms.uOp.value = sstep(25.9, 26.5, ls);

    /* the Solar System */
    const solOff = view([0, 0, 0]), solarOn = ls < 16.2 && fd < 1e16;      /* the group holds every body; each is placed relative to the focus in double precision */
    L.solar.visible = solarOn;
    if (solarOn) {
      L.solar.position.set(solOff[0], solOff[1], solOff[2]); L.solar.scale.setScalar(kv);
      sunMesh.scale.setScalar(695700e3); sunMesh.material.uniforms.uTime.value = t;
      sunGlow.scale.setScalar(Math.max(695700e3 * 9, 22 / pxPerUnit * CAM_D / kv)); sunGlow.material.opacity = 1;
      for (const b of bodies) {
        const P = B[b.id]; if (!P) { b.mesh.visible = false; continue; }
        b.mesh.position.set(P[0], P[1], P[2]); b.mesh.scale.setScalar(b.r); b.mesh.visible = true;
        const sd = sunDirOf(P); b.mesh.material.uniforms.uSun.value.set(sd[0], sd[1], sd[2]); b.mesh.material.uniforms.uTime.value = t;
        if (b.mesh.userData.ring) { const q = b.mesh.userData.ring.getWorldQuaternion(new T.Quaternion()).invert(); b.mesh.userData.ring.material.uniforms.uSun.value.set(sd[0], sd[1], sd[2]).applyQuaternion(q); }
      }
      const orbOp = win(ls, 9.6, 10.6, 15.0, 15.8);
      for (const o of L.orbits.children) {
        if (o.userData.moonOf) { const P = B[o.userData.moonOf]; o.position.set(P[0], P[1], P[2]); o.scale.setScalar(o.userData.a); o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3().fromArray(poleOf(o.userData.moonOf)));
          const pxs = o.userData.a * kv * pxPerUnit / CAM_D; o.material.opacity = clamp((pxs - 8) / 40, 0, 0.35) * (1 - sstep(11.5, 12.5, ls)); }
        else if (o.userData.probe) { const P = B[o.userData.probe], a = o.geometry.attributes.position; a.setXYZ(0, P[0] * 0.55, P[1] * 0.55, P[2] * 0.55); a.setXYZ(1, P[0], P[1], P[2]); a.needsUpdate = true; o.material.opacity = win(ls, 12, 12.8, 15.6, 16.2) * 0.5; }
        else o.material.opacity = orbOp * o.userData.op;
      }
      const ho = helio.userData.offset; helio.position.set(ho[0], ho[1], ho[2]); helio.material.uniforms.uOp.value = win(ls, 12.9, 13.7, 15.1, 15.8) * 0.22;
    }
    /* Earth and the Moon */
    const eOff = view(B.earth), earthOn = len(eOff) < 4000 && ls < 13.2;
    L.earth.visible = earthOn;
    if (earthOn) {
      L.earth.position.set(eOff[0], eOff[1], eOff[2]); const ke = ER * kv; L.earth.scale.setScalar(ke);
      earthMesh.rotation.y = A.gmst(S.jd) * D2R; const s = A.sun(S.jd), sd = A.radec2v(s.ra, s.dec);
      for (const m of [earthMesh, moonMesh]) { m.material.uniforms.uSun.value.set(sd[0], sd[1], sd[2]); m.material.uniforms.uTime.value = t; }
      const mp = sub(B.moon, B.earth); moonMesh.position.set(mp[0] / ER, mp[1] / ER, mp[2] / ER);
      if (Math.abs(S.jd - moonPathJd) > 0.04) refreshMoonPath();
      const rOp = win(ls, 6.8, 7.4, 10.3, 11.0); for (const r of L.earthRings) r.material.opacity = r.userData.op * (r === moonPath ? win(ls, 7.6, 8.4, 10.6, 11.3) : rOp);
    }
    /* the focus layer */
    const fe = F.e;
    if (fe) {
      const P = posOf(fe), off = view(P);
      F.mesh.visible = len(off) < 4000; F.mesh.position.set(off[0], off[1], off[2]); F.mesh.scale.setScalar(kv);
      F.mesh.traverse(o => { if (o.userData.billboard) o.quaternion.copy(camera.quaternion); if (o.material && o.material.uniforms && o.material.uniforms.uTime) o.material.uniforms.uTime.value = t;
        if (o.material && o.material.uniforms && o.material.uniforms.uSun && o.userData.planet) { const sd = norm(sub([0, 0, 0], o.position.toArray())); o.material.uniforms.uSun.value.set(sd[0], sd[1], sd[2]).applyQuaternion(F.planetsTilt.quaternion); } });
      if (F.pts) { placeUniforms(F.pts.material, mul(sub(Fp, P), 1 / F.ptsUnit), F.ptsUnit * kv, 1); const size = F.ptsSize * LY * kv; F.pts.material.uniforms.uOp.value = clamp((size - 0.02) / 0.15, 0, 1) * (1 - sstep(0.5, 3.5, Math.log10(size))); F.pts.visible = true; }
      if (F.beams) F.beams.rotation.y = (t / F.period) * Math.PI * 2;
      /* a star never shrinks below a point of light */
      if (F.glow) { const dist = Math.max(0.05, camera.position.distanceTo(F.mesh.position)); F.glow.scale.setScalar(Math.max(F.r * 7, 26 / pxPerUnit * dist / kv)); F.glow.visible = !(fe.body === 'sun' && L.solar.visible); }
      if (F.front) { F.front.position.copy(F.mesh.position); F.front.scale.setScalar(kv); F.front.children[0].material.uniforms.uTime.value = t; }
      let lens = 0;
      if (F.hole) {
        const rsv = F.hole * kv, dist = camera.position.distanceTo(F.mesh.position), sp = {};
        if (project(off, sp)) { const ruv = 2.6 * rsv / (2 * dist * Math.tan(camera.fov * D2R / 2)); lens = 1 - sstep(Math.log10(F.hole * 60), Math.log10(F.hole * 400), ls);
          post.u.uHole.value.set(sp.sx / W, 1 - sp.sy / H, ruv, lens); }
      }
      if (!lens) post.u.uHole.value.w = 0;
    }

    /* labels, markers, hud */
    gatherLabels(ls, kv, view, uT, inSolar);
    hudT += dt; if (hudT > 0.12) { hudT = 0; hud(ls, span); }
    Snd.set(ls);
    post.u.uGrain.value = O.reduced ? 0.015 : 0.026;
    post.render(scene, camera, t, F.front ? overlay : null);
  }

  /* survey designations rank below names people use */
  const CATNAME = /^(HD|HIP|HR|GJ|Gliese|Gl|LHS|LP|LTT|NLTT|BD|CD|CPD|EPIC|K2-|TOI|TIC|Kepler|KOI|WASP|HAT|HATS|XO|TrES|CoRoT|OGLE|MOA|KMT|TYC|2MASS|WISE|UCAC|LSPM|PM J|Gaia|G \d|L \d)/i;
  /* the page's own panels, so names never land under them */
  let obsT = 0, obs = [];
  function obstacles() {
    const now = performance.now(); if (now - obsT < 250) return obs; obsT = now;
    const sr = stage.getBoundingClientRect(); obs = [];
    for (const n of [panel, $('#rail'), $('#crumbs'), $('#readout'), $('#ctl'), $('#tour')]) {
      if (!n || n.hidden || !n.offsetParent) continue; const r = n.getBoundingClientRect(); if (!r.width) continue;
      obs.push([r.left - sr.left - 4, r.top - sr.top - 4, r.width + 8, r.height + 8]);
    }
    return obs;
  }
  /* which names to show: what is near the focus at this scale, brightest first, never overlapping */
  function gatherLabels(ls, kv, view, uT, inSolar) {
    cands = []; let mi = 0;
    const add_ = (e, v, pri, cls, text) => { const key = text || e.slug, c = { e, v, key, pri: pri + (shown.has(key) ? 1.5 : 0), cls, text: text || e.name }; if (project(v, c)) cands.push(c); return c; };
    const sky = (P, unit, t) => { const rel = mul(sub(P, S.F), 1 / unit), d = len(rel); if (!d) return [0, 0, 0]; const s = lerp(SKY, Math.min(d * unit * kv, 9000), t) / d; return mul(rel, s); };
    const fe = S.focus, skyMode = uT < 0.5;
    /* the Solar System's bodies and spacecraft, while it is in view */
    if (L.solar.visible || L.earth.visible) for (const id in B) {
      const e = R.find(id); if (!e || e === fe) continue;
      const v = view(B[id]), dv = len(v); if (dv > 60) continue;
      const kind = e.kind, pxR = (e.radius || 0) * 1000 * kv * pxPerUnit / CAM_D;
      let pri = { planet: 9, star: 10, dwarf: 6, probe: 6.5, moon: 4.5, asteroid: 4, comet: 4 }[kind] || 3;
      if (kind === 'moon' && id !== 'moon') { const par = B[O.slug(e.parent || '')]; if (!par || len(sub(B[id], par)) * kv * pxPerUnit / CAM_D < 26) continue; }
      if (id === 'iss' || id === 'jwst') { if (ls > 10.5) continue; pri = 5; }
      if (pxR < 3 && dv < 40) marker(mi++, v, kind === 'probe' ? 7 : kind === 'planet' ? 10 : 6.5, kind === 'probe' ? '#FFB13B' : e.look ? e.look[1] : '#E6D9C1');
      if (ls > 15.4 && kind !== 'star') continue;
      add_(e, v, pri, 'k-' + kind);
    }
    /* the planets of a focused system, which are far too small to see at this scale */
    if (F.planetsTilt && !S.flight) for (const o of F.planetsTilt.children) {
      const p = o.userData.planet; if (!p) continue;
      const w = o.getWorldPosition(_w), v = [w.x, w.y, w.z], dv = len(v); if (dv < 0.004 || dv > 30) continue;
      const short = p.name.indexOf(fe.name) === 0 ? p.name.slice(fe.name.length).trim() : p.name;
      marker(mi++, v, p.hz === 2 ? 7 : 5.5, p.hz === 2 ? '#4FD8C4' : p.hz ? '#8FA5D9' : '#C9B79C');
      add_(fe, v, 8 - dv, p.hz ? 'k-hz' : 'k-planet', short);
    }
    /* from inside the Solar System: the brightest stars of our own sky */
    if (inSolar && L.sky.visible && ls < 14.6) for (const e of R.bright) add_(e, mul(U_(e), SKY), 1.4 - e.mag * 0.4, 'k-sky');
    /* stars with distances: up close, the sky as seen from the focus, named by how bright they look from there; farther out, a map */
    if (L.local.visible && !(inSolar && skyMode)) for (const e of R.starsL) {
      if (e === fe) continue;
      const P = P_(e);
      if (skyMode) {
        const dLy = len(sub(P, S.F)) / LY; if (dLy < 1e-4) continue;
        const m = (e.absmag != null ? e.absmag : 4.5) + 5 * Math.log10(dLy / 32.6156); if (m > 1.6) continue;
        add_(e, sky(P, LY, uT), 3.4 - m * 0.8, 'k-sky');
      } else {
        const v = sky(P, LY, uT), dv = len(v); if (dv > 2.6 || dv < 0.02) continue;
        const hz = e.system && e.system.planets.some(p => p.hz === 2), cat = CATNAME.test(e.name);
        if (e.absmag != null && e.absmag > S.Mlim + 0.5 && !hz) continue;                 /* too faint to be drawn at this scale */
        if (e.kind === 'system' && !hz && !e.note) continue;
        add_(e, v, 2 + (e.absmag != null ? -e.absmag : 0) * 0.25 + (hz ? 2 : 0) - (cat ? (/^(GJ|Gliese|Gl) /.test(e.name) ? 1.5 : 3) : 0) - dv * 0.5, e.kind === 'system' ? 'k-system' : 'k-star');
      }
    }
    /* the Sun, from outside the Solar System: a star like the others, and home */
    if (!inSolar || ls > 15.6) {
      const sun = R.find('sun'), v = sky([0, 0, 0], LY, uT), dv = len(v);
      if (skyMode && !inSolar) { const m = 4.83 + 5 * Math.log10(len(S.F) / LY / 32.6156); add_(sun, v, 9, 'home', 'Sun · magnitude ' + m.toFixed(1) + ' from here'); }
      else if (!skyMode && dv > 0.02 && dv < 40) add_(sun, v, ls > 19.5 ? 9 : 7, 'home', ls > 19.5 ? 'Sun · you are here' : 'Sun');
    }
    /* landmarks and catalogue objects beyond the Solar System */
    for (const e of R.far) {
      if (e === fe) continue;
      const near = e.ly < 2500 && uT < 1; if (near && skyMode) continue;
      const P = P_(e), v = near ? sky(P, LY, uT) : view(P), dv = len(v);
      if (e.home) { if (S.mwOp < 0.5 && L.mwDot.visible && dv > 0.03 && dv < 40) add_(e, v, 8.5, 'home', 'Milky Way · home'); continue; }
      if (dv > 6 || dv < 0.03) continue;
      const sizeV = (e.sizeLy || 0) * LY * kv; if (sizeV > 6) continue;
      let pri = e.note ? 6 : 2.5;
      if (e.kind === 'galaxy') { if (!L.gal.visible && e.ly > 3e6) continue; const bare = !/[a-z]/.test(e.name) && !/^M\d+$/.test(e.name); if (bare && !e.note && sizeV < 0.05 && (ls > 23.4 || e.mag == null || e.mag > 11)) continue;
        pri = (e.note ? 6 : bare ? 1.5 : 4) - (e.mag != null ? (e.mag - 9) * 0.3 : 1); }
      else if (e.ly < 2e5 && e.kind !== 'pulsar' && e.kind !== 'blackhole' && e.kind !== 'satellite' && !L.dso.visible && !L.mw.visible) continue;
      if (e.kind === 'pulsar' && ls > 21.5) continue;
      add_(e, v, pri + (sizeV > 0.1 ? 2 : 0), 'k-' + e.kind);
    }
    /* the galaxy's arms; the horizons */
    if (L.mw.visible && ls > 20.2 && ls < 22.6) for (const a of armLabels) { const v = view(a.P); if (len(v) < 6) add_(null, v, 3, 'k-arm', a.name); }
    if (L.cos.visible) {
      const ring = (g, name, slug, ang) => { const e = R.find(slug), P = mul([Math.cos(ang), Math.sin(ang) * 0.3, Math.sin(ang)], g * GLY); add_(e, view(P), 7, 'k-horizon', name); };
      ring(CMB_GLY, 'Cosmic microwave background · 13.8 billion years ago', 'cmb', 0.4); ring(HUBBLE_GLY, 'Hubble sphere', 'hubble-sphere', 2.2); ring(EVENT_GLY, 'Cosmic event horizon', 'cosmic-event-horizon', 3.6);
      if (ls > 26.2) ring(EDGE_GLY, 'Edge of the observable universe', 'edge-of-the-observable-universe', 5.2);
    }
    /* the focus is always named */
    if (fe && !S.flight) { const c = { e: fe, v: [0, 0, 0], key: fe.slug, pri: 99, cls: 'focus', text: fe.name };
      if (project(c.v, c)) { const pxR = Math.max(radiusOf(fe), (fe.kind === 'galaxy' || fe.kind === 'cluster' || fe.kind === 'globular' || fe.kind === 'nebula' ? (fe.sizeLy || 0) * LY / 2 : 0)) * kv * pxPerUnit / CAM_D;
        if (pxR > 6) { const o = Math.min(pxR, H * 0.42) * 0.72; c.sx += o; c.sy -= o; } cands.push(c); } }
    for (let i = mi; i < mpool.length; i++) mpool[i].visible = false;
    if (!S.labels) { for (const p of pool) p.hidden = true; shown.clear(); return; }
    cands.sort((a, b) => b.pri - a.pri);
    const placed = obstacles().slice(), next = new Map(); let n = 0;
    for (const c of cands) {
      if (n >= (W < 700 ? 22 : 46)) break;
      if (next.has(c.key)) continue;
      const w = c.text.length * 6.6 + 14, h = 16, x = c.sx, y = c.sy - h / 2;
      if (y < 2 || y + h > H - 2 || x < 2 || x + w > W - 2) continue;
      if (placed.some(p => x < p[0] + p[2] && x + w > p[0] && y < p[1] + p[3] && y + h > p[1])) continue;
      placed.push([x, y, w, h]); let b = pool[n];
      if (!b) { b = el('button', { class: 'lb', type: 'button', tabindex: '-1' }); b.addEventListener('click', ev => { ev.stopPropagation(); const s = b.dataset.slug; if (s) { const e = R.find(s); if (e && e !== S.focus) flyTo(e); } }); labelsEl.append(b); pool[n] = b; }
      if (b.textContent !== c.text) b.textContent = c.text;
      b.className = 'lb ' + c.cls; b.dataset.slug = c.e ? c.e.slug : ''; b.hidden = false; b.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      next.set(c.key, 1); n++;
    }
    for (let i = n; i < pool.length; i++) pool[i].hidden = true;
    shown = next;
  }

  /* ── readout, breadcrumb, card ── */
  function fmtSpan(m) {
    if (m < 1e6) return O.fmt.sig(m / 1e3, 3) + ' km'; if (m < 1e8) return O.fmt.num(m / 1e3) + ' km'; if (m < 3e10) return O.fmt.sig(m / 1e9, 3) + ' million km';
    if (m < 0.05 * LY) return O.fmt.sig(m / AU, 3) + ' AU';
    return O.fmt.ly(m / LY);
  }
  /* the scale in words, whatever the view is centred on */
  const SCALE_BANDS = [[4e6, 'Up close'], [1.2e8, 'A planet'], [4e9, 'A planet and its moons'], [2.5e12, 'Planetary orbits'], [4e13, 'A planetary system'], [1e15, 'Where a star’s wind ends'],
    [1e17, 'Between the stars'], [3e18, 'Stellar neighbours'], [4e19, 'A stellar neighbourhood'], [6e20, 'A spiral arm'], [1.5e22, 'A galaxy'], [3e23, 'A group of galaxies'], [2e25, 'Superclusters'],
    [2e26, 'The cosmic web'], [Infinity, 'The observable universe']];
  function hud(ls, span) {
    let near = REG.SCALES[0], bd = 99; for (const s of REG.SCALES) { const d = Math.abs(Math.log10(s[2]) - ls); if (d < bd) { bd = d; near = s; } }
    const word = SCALE_BANDS.find(b => span < b[0])[1], rung = $('#rung'); if (rung.textContent !== word) rung.textContent = word;
    O.clear($('#span')).append('Across this view: ', el('b', { text: fmtSpan(span) }), ' · light crosses it in ', el('b', { text: A.lightTime(span / C) }));
    let illus = '';
    if (ls > 23.6) illus = 'The foam of filaments and voids is an illustration of the cosmic web’s texture, not a map of real galaxies. Farther points are redder because their light has been stretched on the way.';
    else if (S.mwOp > 0.15) illus = 'The Milky Way is a model built on measured spiral-arm positions. You cannot photograph it from outside; nobody ever has.';
    else if (ls > 10.8 && ls < 18.3 && len(S.F) < 3e15) illus = 'Belt and cloud dots show where those regions are, not individual objects.';
    const ie = $('#illus'); ie.hidden = !illus; if (ie.textContent !== illus) ie.textContent = illus;
    const f = (ls - S.railLo) / (S.railHi - S.railLo); $('#knob').style.top = clamp(100 - f * 100, 0, 100) + '%';
    for (const b of O.$$('#rungs button')) b.classList.toggle('on', b.dataset.slug === near[0]);
    if (S.focus && S.focus.body && panelLive) panelLive();
  }
  function chain(e) {
    const P = posOf(e), ly = len(P) / LY, out = [['scale-universe', 'Observable universe']];
    if (e.kind === 'horizon' || e.shell) return out;
    if (ly < 2.6e8) out.push(['scale-laniakea', 'Laniakea']);
    if (ly < 5e6) out.push(['scale-local-group', 'Local Group']);
    if (ly < 1.4e5 && e.kind !== 'satellite') out.push(['scale-galaxy', 'Milky Way']);
    if (ly < 3000) out.push(['scale-arm', 'Orion Arm']);
    if (e.group === 'solar' || e.group === 'craft' || ly < 2) out.push(['scale-planets', 'Solar System']);
    if (e.body === 'moon' || e.body === 'iss' || e.body === 'jwst') out.push(['earth', 'Earth']);
    return out;
  }
  function renderCrumbs(e) {
    const host = O.clear($('#crumbs')), ch = chain(e);
    ch.forEach(([slug, name], i) => { if (i) host.append(el('span', { class: 'sep', text: '›' })); host.append(el('a', { href: '#' + slug, text: name, onclick: ev => { ev.preventDefault(); flyTo(R.find(slug)); } })); });
    if (ch[ch.length - 1][1] !== e.name) { host.append(el('span', { class: 'sep', text: '›' })); host.append(el('span', { class: 'now', text: e.name })); }
  }
  let panelLive = null;
  function showMissing(s) { panel.hidden = false; O.clear(panel).append(el('div', { class: 'kind', text: 'Not found' }), el('h1', { text: decodeURIComponent(s) }), el('p', { class: 'note', text: 'Nothing on the Ladder goes by that name. Press / and search, or open the Atlas.' })); }
  /* what each rung shows, and which parts of it are measured */
  const RUNG_NOTES = {
    'scale-earth': 'Earth as it is right now: the day side, the terminator and the night side’s city lights, turned to this moment’s sidereal time. The teal ring is the space station’s track 420 km up; the red ring is geostationary orbit, 35,786 km up, where a satellite keeps pace with the turning Earth.',
    'scale-moon': 'The Moon is drawn where it is now, in its real phase, about 384,400 km away on average. The faint line is its path over the four weeks around today. Light makes the trip in about 1.3 seconds.',
    'scale-inner': 'Mercury, Venus, Earth and Mars, each placed for this moment from JPL orbital elements. Sunlight takes about 3 minutes to reach Mercury and about 12½ to reach Mars at its average distance.',
    'scale-planets': 'All eight planets, placed for this moment. Neptune is about four light-hours from the Sun. The dots between Mars and Jupiter show where the asteroid belt is, not individual asteroids.',
    'scale-heliosphere': 'The Kuiper belt, the far dwarf planets, and the heliopause, where the Sun’s wind gives way to interstellar gas. Voyager 1 crossed it in August 2012 at 121.6 AU, Voyager 2 in November 2018 at 119 AU. Both are drawn where they are now.',
    'scale-oort': 'The Oort cloud is inferred, never seen: a shell of icy bodies thought to reach from about 2,000 AU to 100,000 AU or more, known only from the orbits of comets that fall in from it. The dots mark where it is thought to be.',
    'scale-neighbours': 'Every star within about 20 light-years, at its measured distance. Rings mark stars known to have planets; teal rings mark a planet in the habitable zone.',
    'scale-bubble': 'The Local Bubble, a cavity of hot, thin gas about 1,000 light-years across, blown out by supernovae over the last 14 million years. The Sun is inside it. Turn the view: constellation figures stretch into depth and come apart.',
    'scale-arm': 'The Orion Spur, a short arm between the Sagittarius and Perseus arms. Stars out to 2,000 light-years are drawn from measured parallaxes; beyond them, nebulae and clusters are at their catalogued places.',
    'scale-galaxy': 'The Milky Way, a barred spiral about 100,000 light-years across holding 100 to 400 billion stars. The disc is a model built on measured arm positions; the globular clusters and satellite galaxies are where they have been measured to be.',
    'scale-local-group': 'The Local Group: the Milky Way, Andromeda, Triangulum and dozens of dwarf galaxies within about 5 million light-years. Andromeda is falling toward us at about 110 km/s.',
    'scale-laniakea': 'Laniakea, the supercluster we live in, about 520 million light-years across. Every point is a catalogued galaxy at its measured distance, its disc tilted the way we see it.',
    'scale-web': 'The cosmic web: galaxies gathered into filaments and walls around nearly empty voids. The named structures are real. The foam is an illustration of the texture, drawn as two thin fan-shaped slices the way redshift surveys first revealed it in 1986, because a whole sphere of it seen at once blurs into fog.',
    'scale-universe': 'The observable universe, with us at its centre, as every observer is at the centre of theirs. Its edge is about 46 billion light-years away, farther than 13.8 billion years of light travel, because space stretched while the light was on its way.'
  };
  /* what the close-up model is, so a drawing is never mistaken for a photograph */
  function modelNote(e) {
    if (e.body === 'jwst') return 'JWST circles the L2 point in a loop up to 800,000 km wide. It is drawn at L2 itself; its place on the loop is not.';
    if (e.body === 'iss') return ISS.rec ? 'Placed from orbital elements fetched ' + O.fmt.ago(new Date(ISS.fetched)) + '.' : 'Its live position needs today’s orbital elements, which this copy of the site does not have yet. Its orbit is drawn.';
    if (e.kind === 'moon' && e.body !== 'moon' && !GALILEAN.hasOwnProperty(e.body)) return 'Its orbit is drawn to scale; its place along the orbit is illustrative.';
    if (e.system) return 'Orbits are drawn to scale. Where each planet sits along its orbit, and the tilt of the system, are not known from these data and are illustrative.';
    if ((e.kind === 'star' || e.kind === 'system') && e.body !== 'sun') return e.absmag != null ? 'Drawn at a size worked out from its brightness and colour, which is rough for very hot or very cool stars.' : 'Drawn as a point of light; its size is not well known.';
    if (e.kind === 'galaxy' && !e.home) return e.gi != null ? 'Drawn as a model of its type, at its catalogued size and the tilt we see it from.' : 'Drawn as a model; its size and shape are illustrative.';
    if (e.kind === 'satellite') return 'Drawn as a model at its measured size.';
    if (e.kind === 'quasar') return 'Drawn as a host galaxy with jets from its core' + (e.mass ? ', and the black hole itself at true size' : '') + '. The host’s shape is illustrative.';
    if (e.kind === 'cluster' && e.ly > 1e6) return 'Drawn as a swarm of galaxies at the cluster’s measured size. The individual members drawn are illustrative.';
    if (e.kind === 'cluster' || e.kind === 'globular') return 'Drawn as a model at its measured size.';
    if (e.kind === 'nebula' || e.kind === 'remnant') return 'Drawn as an impression at its measured size, in the colours its gas actually glows: hydrogen red, oxygen teal.';
    if (e.kind === 'blackhole') return 'Shadow and disc are drawn to scale: the shadow is 2.6 times the event-horizon radius, the disc starts at the innermost stable orbit. The tilt is illustrative.';
    if (e.kind === 'pulsar') return F.period > (e.sig || 0) / 1000 + 0.01 ? 'Its beams are slowed down here so you can follow them.' : 'Its beams turn at their real rate.';
    return null;
  }
  function renderPanel(e, rung) {
    panel.hidden = false; panel.classList.remove('min'); O.clear(panel); panelLive = null;
    panel.append(el('button', { class: 'x', type: 'button', 'aria-label': 'Fold the card', onclick: () => panel.classList.toggle('min'), text: '–' }));
    if (rung) {                                         /* a scale: what you are looking at, and what is measured */
      const span = rung.span;
      const L_ = rungLight(rung.slug) || [span / C, 'across this view'];
      panel.append(el('div', { class: 'kind', text: 'Scale' }), el('h1', { text: rung.name }),
        el('div', { class: 'lt' }, el('div', { class: 'big', text: L_[0] ? A.lightTime(L_[0]) : 'now' }), el('div', { class: 'lab', text: L_[0] ? 'for light from ' + L_[1] + ' to reach you' : 'light from ' + L_[1] + ' reaches you in nanoseconds' })),
        el('p', { class: 'note', text: RUNG_NOTES[rung.slug] || rung.note }),
        el('p', { class: 'caveat', style: { color: 'var(--faint)' }, text: 'This view is ' + fmtSpan(span) + ' across; light takes ' + A.lightTime(span / C) + ' to cross it.' }));
      if (e && e.slug !== 'sun' && e.kind !== 'scale') panel.append(el('p', { class: 'left' }, 'Centred on ', el('a', { href: '#' + e.slug, text: e.name, onclick: ev => { ev.preventDefault(); flyTo(e); } }), '.'));
      const i = REG.SCALES.findIndex(s => s[0] === rung.slug), step = (j, label) => { const s = REG.SCALES[j]; return s ? el('button', { class: 'btn', type: 'button', onclick: () => flyTo(R.find(s[0])) }, label + ' ' + s[1]) : null; };
      panel.append(el('div', { class: 'acts' }, step(i - 1, '↓'), step(i + 1, '↑')));
      return;
    }
    panel.append(el('div', { class: 'kind', text: e.kind === 'cluster' && e.ly > 1e6 ? 'Galaxy cluster' : KIND[e.kind] || e.kind }), el('h1', { text: e.name }));
    const al = (e.alias || []).filter(a => a && a !== e.name).slice(0, 4); if (e.des && !al.includes(e.des)) al.unshift(e.des);
    if (al.length) panel.append(el('div', { class: 'alias', text: al.join(' · ') }));
    const lt = el('div', { class: 'lt' }), big = el('div', { class: 'big' }), lab = el('div', { class: 'lab' }); lt.append(big, lab); panel.append(lt);
    const left = el('p', { class: 'left' }); panel.append(left);
    let years = null, deep = false;
    if (e.body) {
      const at = () => B[e.body] || (e.body === 'iss' ? B.earth : null);
      panelLive = () => { const P = at(); if (!P) return; const d = e.body === 'earth' ? 0 : len(sub(P, B.earth));
        big.textContent = e.body === 'earth' ? '0 s' : A.lightTime(d / C);
        lab.textContent = e.body === 'earth' ? 'Light from the ground under you reaches your eyes in nanoseconds.' : 'of light between here and Earth, right now (' + fmtSpan(d) + ')'; };
      panelLive();
      if (e.body === 'earth') left.append('Every distance on this page is measured from here.');
      else if (at()) left.append('What you see of it left ', el('em', { text: A.lightTime(len(sub(at(), B.earth)) / C) + ' ago' }), '.');
    } else if (e.kind === 'horizon' || e.shell) {
      const r = e.shell === 'hubble' ? HUBBLE_GLY : e.shell === 'event' ? EVENT_GLY : (e.ly || 0) / 1e9;
      big.textContent = O.fmt.sig(r, 3) + ' billion light-years'; lab.textContent = 'from us, measured today (comoving distance)';
      if (e.z && e.z < 1e6) { years = A.cosmo.lookbackGyr(e.z) * 1e9; deep = true; left.append('Its light has been travelling for ', el('em', { text: O.fmt.sig(years / 1e9, 4) + ' billion years' }), '.'); }
    } else if (e.z != null) {
      years = e.ltYears; deep = true; const emit = A.cosmo.emitGly(e.z), now = A.cosmo.comovingGly(e.z), v = A.cosmo.recession(e.z);
      big.textContent = years < 1e9 ? O.fmt.sig(years / 1e6, 3) + ' million years' : O.fmt.sig(years / 1e9, 3) + ' billion years'; lab.textContent = 'since this light left (redshift ' + e.z + ')';
      const g = x => x < 1 ? O.fmt.sig(x * 1000, 3) + ' million light-years' : O.fmt.sig(x, 3) + ' billion light-years';
      left.append('When the light left, it was ', el('em', { text: g(emit) }), ' away. Space has stretched since: it is now ', el('em', { text: g(now) }), ' away, and receding ',
        el('em', { text: v >= 1 ? O.fmt.sig(v, 2) + ' times faster than light' : 'at ' + O.fmt.sig(v * 100, 2) + '% of the speed of light' }), '.');
    } else if (e.ly != null) {
      years = e.home ? 26670 : e.ly; big.textContent = e.ly ? A.lightTime(years * 31557600) : '—'; lab.textContent = e.home ? 'for light from the centre of the galaxy to reach us' : 'of light between here and Earth';
      if (!e.ly) left.append('We are inside it.');
    }
    if (years != null && years >= 1) O.lightLeft(years).then(r => { if (!panel.contains(left)) return;
      if (deep) { if (r.context) left.append(' When it left, ' + r.context + '.'); }
      else left.append(left.childNodes.length ? ' ' : '', 'The light now arriving from it left ', el('em', { text: r.when }), r.context ? ', when ' + r.context + '.' : '.'); });
    /* the note, then the numbers */
    let note = e.note;
    if (!note && e.kind === 'star') { const sp = e.sp ? e.sp.replace(/\.+$/, '') : ''; note = (sp ? (/^[AEFHILMNORSX]/i.test(sp) ? 'An ' : 'A ') + sp + ' ' : 'A ') + 'star in ' + (CONS[e.con] || e.con || 'the sky') + ', ' + REG.fmtLy(e.ly) + ' away.'; }
    if (!note && e.kind === 'system') note = 'A star with ' + e.system.planets.length + (e.system.planets.length === 1 ? ' known planet' : ' known planets') + ', ' + REG.fmtLy(e.ly) + ' away.';
    if (!note && e.kind === 'galaxy') note = (e.hubble ? 'A galaxy of type ' + e.hubble : 'A galaxy') + (e.cluster ? ' in the ' + e.cluster : '') + ', ' + REG.fmtLy(e.ly) + ' away.';
    if (note) panel.append(el('p', { class: 'note', text: note }));
    const kv = [];
    if (e.radius) kv.push(['Radius', O.fmt.num(e.radius) + ' km']);
    if (e.facts) for (const k in e.facts) kv.push([k, e.facts[k]]);
    if (e.sp) kv.push(['Spectral type', e.sp]); if (e.mag != null && e.kind !== 'galaxy') kv.push(['Brightness from Earth', 'magnitude ' + e.mag]);
    if (e.lum) kv.push(['Luminosity', O.fmt.sig(e.lum, 3) + ' Suns']);
    if ((e.kind === 'star' || e.kind === 'system') && e.ly > 0.1) { const m = 4.83 + 5 * Math.log10(e.ly / 32.6156); kv.push(['The Sun seen from here', 'magnitude ' + m.toFixed(1) + (m > 6.5 ? ', too faint to see' : '')]); }
    if (e.kind === 'galaxy' && e.dflag) kv.push(['Distance from', { 1: 'measured directly', 2: 'its cluster', 3: 'its redshift' }[e.dflag]]);
    if (e.hubble) kv.push(['Type', e.hubble]); if (e.mag != null && e.kind === 'galaxy') kv.push(['Brightness', 'magnitude ' + e.mag]);
    if (e.sizeLy && e.kind !== 'star' && !e.home) kv.push(['Across', REG.fmtLy(e.sizeLy)]);
    if (e.mass) kv.push(['Mass', O.fmt.sig(e.mass, 3) + ' Suns'], ['Event horizon', fmtSpan(2953 * e.mass * 2) + ' across']);
    if (e.sig) kv.push(['Spins', e.sig < 1000 ? O.fmt.sig(1000 / e.sig, 3) + ' times a second' : 'once every ' + O.fmt.sig(e.sig / 1000, 4) + ' s']);
    if (e.con && CONS[e.con]) kv.push(['Constellation', CONS[e.con]]);
    if (e.ra != null && e.kind !== 'horizon') kv.push(['Sky position', A.fmtRA(e.ra) + ' ' + A.fmtDec(e.dec)]);
    if (kv.length) panel.append(el('dl', { class: 'kv' }, kv.map(([k, v]) => [el('dt', { text: k }), el('dd', { text: String(v) })]).flat()));
    if (e.system) {
      const box = el('div', { class: 'sys' }, el('h2', { text: e.system.planets.length + (e.system.planets.length === 1 ? ' known planet' : ' known planets') }));
      box.append(el('ul', null, e.system.planets.slice(0, 12).map(p => el('li', null, el('span', { class: p.hz ? 'hz' : '', text: p.name + (p.hz === 2 ? ' · habitable zone' : p.hz === 1 ? ' · edge of habitable zone' : '') }),
        el('span', { class: 'num', text: (p.a ? p.a + ' AU' : '') + (p.teq ? ' · ' + p.teq + ' K' : '') }))))); panel.append(box);
    }
    const mn = modelNote(e); if (mn) panel.append(el('p', { class: 'caveat', text: mn }));
    if (e.approx) panel.append(el('p', { class: 'caveat', text: 'Its position or distance is known only roughly.' }));
    if (e.disputed) panel.append(el('p', { class: 'caveat', text: 'Whether this structure is real is disputed.' }));
    const th = el('div', { class: 'threads' }); panel.append(th); if (e.links && e.links.length) O.threads(th, e.links.map(l => l.startsWith('obj:') ? 'obj:' + ((R.find(l.slice(4)) || {}).slug || l.slice(4)) : l));
    if (e.kind !== 'scale' && e.kind !== 'horizon') panel.append(el('div', { class: 'acts' }, el('a', { class: 'btn', href: 'atlas.html#' + e.slug, text: 'Atlas entry' }),
      e.body ? el('a', { class: 'btn', href: 'deck.html', text: 'Flight Deck' }) : null, e.kind === 'star' && e.mag != null && e.mag < 6.5 ? el('a', { class: 'btn', href: 'sky.html#' + e.slug, text: 'Find it tonight' }) : null));
  }

  /* ── the tour ── */
  const TOUR = [['earth', null, 'This is now. Everything you can see from here arrived a moment ago, and the farther it came from, the longer ago it left.'],
    ['moon', 1.1e9, 'The Moon is about 1.3 light-seconds away. Its path is drawn for the month around today, and its phase is the real one.'],
    ['sun', 6.5e11, 'Sunlight is about 8 minutes 20 seconds old. If the Sun went out, nothing here would change for that long.'],
    ['jupiter', 4.6e9, 'Jupiter is 33 to 54 light-minutes away. Its four large moons are drawn where they are right now.'],
    ['scale-planets', null, 'Neptune is about four light-hours out. Every planet here is placed for this moment, from JPL orbital elements.'],
    ['voyager-1', 6e13, 'Voyager 1 left in 1977. On 18 November 2026 it becomes the first thing we have made that is one light-day from Earth.'],
    ['scale-oort', null, 'The Oort cloud may stretch more than a light-year from the Sun. Nothing has ever been seen while it was out there.'],
    ['proxima-centauri', null, 'Proxima Centauri, 4.2 light-years. Its planet Proxima b orbits in the habitable zone. From here the Sun is a bright star, and the constellations no longer hold their shapes.'],
    ['scale-bubble', null, 'Within a thousand light-years the stars of every constellation sit at wildly different depths. The figures only exist from where we stand.'],
    ['orion-nebula', null, 'The Orion Nebula, a nursery of new stars 1,344 light-years away. The light reaching Earth tonight left around the year 680.'],
    ['scale-galaxy', null, 'Our galaxy, about 100,000 light-years across. The Sun is the marked point 26,670 light-years from the centre.'],
    ['andromeda-galaxy', null, 'Andromeda, 2.5 million light-years. The light now arriving left before our species existed.'],
    ['scale-laniakea', null, 'Laniakea, our supercluster: about 100,000 galaxies drifting toward a common centre. Every point is a catalogued galaxy at its measured distance.'],
    ['cmb', null, 'The oldest light. It left 13.8 billion years ago, from matter now about 45 billion light-years away. Every direction ends here.']];
  function startTour() { S.tour = { i: -1, t: 0 }; $('#tour').hidden = false; $('#bTour').textContent = 'End the tour'; $('#bTour').setAttribute('aria-pressed', 'true'); tourGo(0); }
  function endTour() { S.tour = null; $('#tour').hidden = true; $('#bTour').textContent = 'Take the tour'; $('#bTour').setAttribute('aria-pressed', 'false'); }
  function tourGo(i) {
    if (!S.tour) return; i = clamp(i, 0, TOUR.length - 1); S.tour.i = i; S.tour.t = 0;
    const [slug, span, text] = TOUR[i], e = R.find(slug); $('#tourN').textContent = (i + 1) + ' of ' + TOUR.length; $('#tourP').textContent = text;
    $('#tPrev').disabled = i === 0; $('#tNext').disabled = i === TOUR.length - 1;
    if (e) flyTo(e, span ? { span } : null);
  }
  function stepTour(dt) { if (!S.tour || S.flight) return; S.tour.t += dt; if (S.tour.t > 11 && S.tour.i < TOUR.length - 1) tourGo(S.tour.i + 1); }

  /* ── sound: a low drone that deepens as you go out. Starts only when you ask. ── */
  const Snd = { on: false, ctx: null,
    start() { try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; this.ctx = this.ctx || new C(); const c = this.ctx; c.resume();
      if (!this.g) { this.g = c.createGain(); this.g.gain.value = 0; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.6; this.g.connect(lp); lp.connect(c.destination); this.lp = lp;
        this.o = [0, 1, 2].map(i => { const o = c.createOscillator(), g = c.createGain(); o.type = i === 2 ? 'triangle' : 'sine'; g.gain.value = [0.5, 0.32, 0.12][i]; o.connect(g); g.connect(this.g); o.start(); return o; });
        const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 300; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); }
      this.g.gain.setTargetAtTime(0.07, c.currentTime, 1.5); this.on = true; } catch (e) { this.on = false; } },
    stop() { if (this.ctx && this.g) this.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6); this.on = false; },
    set(ls) { if (!this.on || !this.o) return; const f = clamp(98 * Math.pow(2, -(ls - 7) / 9), 36, 160), t = this.ctx.currentTime;
      this.o[0].frequency.setTargetAtTime(f, t, 1.2); this.o[1].frequency.setTargetAtTime(f * 1.4983, t, 1.2); this.o[2].frequency.setTargetAtTime(f * 2.0039, t, 1.2); } };
})();

/* OWLT · gl.js — shaders and generators shared by the 3-D views. Needs vendor/three.min.js (r149).
   Everything renders linear into a float target; G.Post tone-maps once at the end. */
(function () {
  'use strict';
  const T = window.THREE, G = window.OWLT_GL = {};
  G.NOISE = `
    float h31(vec3 p){ p = fract(p*0.3183099 + vec3(0.71,0.113,0.419)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
                 mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a*n3(p); p = p*2.03 + vec3(1.7,9.2,3.1); a *= 0.5; } return s; }
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }`;
  /* points live in their own unit around the Sun; near the viewer they become a sky (direction only), farther out a map (true places) */
  G.PLACE = `
    uniform vec3 uFocus; uniform float uK, uT, uSky;
    vec3 place(vec3 p, out float d){ vec3 rel = p - uFocus; d = max(length(rel), 1e-7); return rel/d * mix(uSky, min(d*uK, 9000.0), uT); }`;
  const col = h => new T.Color(h);

  /* ── post: bloom at three scales, gravitational lens, lens fringe, vignette, sensor grain, ACES ── */
  G.Post = function (renderer) {
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), geo = new T.PlaneGeometry(2, 2);
    const mk = (frag, uni) => { const m = new T.ShaderMaterial({ uniforms: uni, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag, depthTest: false, depthWrite: false });
      const s = new T.Scene(), q = new T.Mesh(geo, m); q.frustumCulled = false; s.add(q); return { s, u: uni }; };
    const bright = mk(`varying vec2 vUv; uniform sampler2D tD; uniform float uThr;
      void main(){ vec3 c = texture2D(tD, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c*smoothstep(uThr, uThr*2.2, l), 1.0); }`, { tD: { value: null }, uThr: { value: 0.5 } });
    const blur = mk(`varying vec2 vUv; uniform sampler2D tD; uniform vec2 uDir;
      void main(){ vec3 s = texture2D(tD, vUv).rgb*0.227;
        s += (texture2D(tD, vUv+uDir*1.385).rgb + texture2D(tD, vUv-uDir*1.385).rgb)*0.316;
        s += (texture2D(tD, vUv+uDir*3.231).rgb + texture2D(tD, vUv-uDir*3.231).rgb)*0.070; gl_FragColor = vec4(s, 1.0); }`, { tD: { value: null }, uDir: { value: new T.Vector2() } });
    const comp = mk(`varying vec2 vUv; uniform sampler2D tD, tA, tB, tC; uniform float uTime, uBloom, uGrain, uFringe, uAspect, uFade; uniform vec4 uHole;
      ${G.NOISE}
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
      vec2 lens(vec2 uv){                      /* point-mass lens: a source at angle b appears at r where b = r - e*e/r */
        vec2 d = (uv - uHole.xy)*vec2(uAspect, 1.0); float r = max(length(d), 1e-5), e = uHole.z*1.9;
        return mix(uv, uHole.xy + d/r*(r - e*e/r)/vec2(uAspect, 1.0), uHole.w); }
      void main(){
        vec2 uv = uHole.w > 0.0 ? lens(vUv) : vUv; vec2 c0 = vUv - 0.5; float r2 = dot(c0, c0);
        vec2 off = c0*uFringe*r2; vec3 c;
        c.r = texture2D(tD, uv + off).r; c.g = texture2D(tD, uv).g; c.b = texture2D(tD, uv - off).b;
        c += (texture2D(tA, uv).rgb*0.55 + texture2D(tB, uv).rgb*0.4 + texture2D(tC, uv).rgb*0.35)*uBloom;
        if (uHole.w > 0.0) { float r = length((vUv - uHole.xy)*vec2(uAspect, 1.0)), s = uHole.z;
          c *= mix(1.0, smoothstep(s*0.97, s*1.03, r), uHole.w);                                   /* the shadow */
          c += vec3(1.0, 0.82, 0.6)*exp(-pow((r - s*1.045)/(s*0.03), 2.0))*0.9*uHole.w; }           /* the photon ring */
        c = aces(c*1.05); c = mix(c, c*vec3(1.04, 0.995, 0.955), 0.6);                             /* a warm grade: the sky is never neutral */
        c *= clamp(1.0 - r2*0.95, 0.0, 1.0);
        c += (h21(vUv*vec2(1733.0, 977.0) + fract(uTime)*37.0) - 0.5)*uGrain*(0.4 + 0.6*(1.0 - max(c.r, c.g)));
        gl_FragColor = vec4(pow(max(c, 0.0), vec3(1.0/2.2))*uFade, 1.0); }`,
      { tD: { value: null }, tA: { value: null }, tB: { value: null }, tC: { value: null }, uTime: { value: 0 }, uBloom: { value: 0.9 }, uGrain: { value: 0.045 }, uFringe: { value: 0.012 },
        uAspect: { value: 1 }, uFade: { value: 1 }, uHole: { value: new T.Vector4(0.5, 0.5, 0, 0) } });
    let rt, a1, a2, b1, b2, c1, c2;
    const float = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
    const target = (w, h, depth) => new T.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat,
      type: float ? T.HalfFloatType : T.UnsignedByteType, depthBuffer: !!depth, stencilBuffer: false });
    const pass = (p, src, dst) => { p.u.tD.value = src.texture; renderer.setRenderTarget(dst); renderer.render(p.s, cam); };
    const blurInto = (src, x, y) => { blur.u.uDir.value.set(1 / x.width, 0); pass(blur, src, x); blur.u.uDir.value.set(0, 1 / y.height); pass(blur, x, y); };
    return {
      u: comp.u, float,
      resize(w, h) { [rt, a1, a2, b1, b2, c1, c2].forEach(t => t && t.dispose());
        rt = target(w, h, true); a1 = target(w >> 1, h >> 1); a2 = target(w >> 1, h >> 1); b1 = target(w >> 2, h >> 2); b2 = target(w >> 2, h >> 2); c1 = target(w >> 3, h >> 3); c2 = target(w >> 3, h >> 3);
        comp.u.uAspect.value = w / h; },
      render(scene, camera, time, overlay) {
        renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
        pass(bright, rt, a1); blurInto(a1, a2, a1); blurInto(a1, b2, b1); blurInto(b1, c2, c1);
        comp.u.tD.value = rt.texture; comp.u.tA.value = a1.texture; comp.u.tB.value = b1.texture; comp.u.tC.value = c1.texture; comp.u.uTime.value = time;
        renderer.setRenderTarget(null); renderer.render(comp.s, cam);
        if (overlay) { const ac = renderer.autoClear; renderer.autoClear = false; renderer.render(overlay, camera); renderer.autoClear = ac; }
      }
    };
  };

  /* ── point clouds ── */
  /* the sky from Earth: unit directions, apparent magnitude, colour from B−V */
  G.skyStars = () => new T.ShaderMaterial({
    uniforms: { uSize: { value: 1 }, uOp: { value: 1 }, uTime: { value: 0 }, uTw: { value: 1 } }, transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false,
    vertexShader: `attribute float aMag; attribute vec3 aColor; varying vec3 vC; varying float vI, vB; uniform float uSize, uTime, uTw;
      void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0);
        float b = pow(pow(10.0, -0.4*(aMag - 6.6)), 0.30), tw = 1.0 + uTw*0.12*sin(uTime*2.3 + aMag*41.0 + position.x*3.7);
        gl_PointSize = clamp(uSize*(0.34 + b*0.62), 1.0, 40.0)*tw; vI = clamp(0.10 + b*0.17, 0.0, 1.3); vB = b/9.0; vC = aColor; }`,
    fragmentShader: `varying vec3 vC; varying float vI, vB; uniform float uOp;
      void main(){ vec2 p = gl_PointCoord*2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
        float a = exp(-r*r*9.0) + exp(-r*2.8)*0.26 + (exp(-abs(p.x)*22.0) + exp(-abs(p.y)*22.0))*exp(-r*2.6)*0.3*smoothstep(0.4, 0.9, vB);
        gl_FragColor = vec4(vC*a*vI*uOp*1.6, 1.0); }` });
  /* stars with real distances: position in light-years from the Sun, absolute magnitude, colour */
  G.spaceStars = () => new T.ShaderMaterial({
    uniforms: { uFocus: { value: new T.Vector3() }, uK: { value: 1 }, uT: { value: 0 }, uSky: { value: 60 }, uSize: { value: 1 }, uOp: { value: 1 } },
    transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false,
    vertexShader: `attribute float aAbs; attribute vec3 aColor; varying vec3 vC; varying float vI; uniform float uSize; ${G.PLACE}
      void main(){ float d; vec3 q = place(position, d); gl_Position = projectionMatrix*modelViewMatrix*vec4(q, 1.0);
        float m = aAbs + 5.0*log(d/32.6156)*0.4342945;                                   /* apparent magnitude seen from the focus */
        float bs = pow(pow(10.0, -0.4*(m - 6.6)), 0.30)*smoothstep(9.5, 7.0, m);          /* as a sky */
        float bm = pow(pow(10.0, -0.4*(aAbs - 9.0)), 0.22);                               /* as a map: by true luminosity */
        float b = mix(bs, bm, uT);
        gl_PointSize = clamp(uSize*(0.3 + b*0.6), 0.0, 36.0)*step(0.002, d); vI = clamp(mix(0.10, 0.16, uT) + b*0.17, 0.0, 1.3)*step(0.02, b); vC = aColor; }`,
    fragmentShader: `varying vec3 vC; varying float vI; uniform float uOp;
      void main(){ vec2 p = gl_PointCoord*2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
        gl_FragColor = vec4(vC*(exp(-r*r*9.0) + exp(-r*2.8)*0.26)*vI*uOp*1.6, 1.0); }` });
  /* soft dots for models and statistical fills: position in the layer's unit, colour, relative size */
  G.dust = () => new T.ShaderMaterial({
    uniforms: { uFocus: { value: new T.Vector3() }, uK: { value: 1 }, uT: { value: 1 }, uSky: { value: 60 }, uSize: { value: 1 }, uOp: { value: 1 }, uNear: { value: 1 } },
    transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false,
    vertexShader: `attribute vec3 aColor; attribute float aS; varying vec3 vC; varying float vI; uniform float uSize, uNear; ${G.PLACE}
      void main(){ float d; vec3 q = place(position, d); gl_Position = projectionMatrix*modelViewMatrix*vec4(q, 1.0);
        float near = mix(clamp(pow(uNear/d, 0.9), 0.25, 3.0), 1.0, uT);                  /* as a sky, nearer points are brighter */
        gl_PointSize = clamp(uSize*aS*near, 1.0, 24.0); vI = near; vC = aColor; }`,
    fragmentShader: `varying vec3 vC; varying float vI; uniform float uOp;
      void main(){ vec2 p = gl_PointCoord*2.0 - 1.0; float r = length(p); if (r > 1.0) discard; gl_FragColor = vec4(vC*exp(-r*r*4.0)*0.5*vI*uOp, 1.0); }` });
  /* catalogue galaxies: each a tilted disc, so its outline on screen is the ellipse you would really see from that side */
  G.galaxies = () => new T.ShaderMaterial({
    uniforms: { uFocus: { value: new T.Vector3() }, uK: { value: 1 }, uT: { value: 1 }, uSky: { value: 60 }, uPx: { value: 500 }, uOp: { value: 1 }, uMin: { value: 2.2 } },
    transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false,
    vertexShader: `attribute vec3 aN, aColor; attribute float aSize, aLum; varying vec3 vC; varying vec2 vAx; varying float vSq, vI, vCore; uniform float uPx, uMin; ${G.PLACE}
      void main(){ float d; vec3 q = place(position, d); vec4 mv = modelViewMatrix*vec4(q, 1.0); gl_Position = projectionMatrix*mv;
        vec3 n = normalize(mat3(modelViewMatrix)*aN); vSq = max(0.2, abs(n.z)); float l = length(n.xy); vAx = l > 1e-4 ? n.xy/l : vec2(1.0, 0.0);
        float px = aSize/d*length(q)*uPx/max(0.01, -mv.z);                                /* true size on screen */
        gl_PointSize = clamp(max(px, uMin), 1.0, 64.0); vCore = smoothstep(6.0, 30.0, px);
        vI = aLum*mix(clamp(uMin*1.5/max(px, 0.2), 0.35, 1.0), 1.0, 0.35); vC = aColor; }`,
    fragmentShader: `varying vec3 vC; varying vec2 vAx; varying float vSq, vI, vCore; uniform float uOp;
      void main(){ vec2 p = gl_PointCoord*2.0 - 1.0; p.y = -p.y;
        vec2 e = vec2(dot(p, vAx)/vSq, dot(p, vec2(-vAx.y, vAx.x))); float r = length(e); if (r > 1.0) discard;
        float a = exp(-r*r*5.0)*0.75 + exp(-r*r*40.0)*(0.5 + vCore);
        gl_FragColor = vec4(vC*a*vI*uOp, 1.0); }` });

  /* ── worlds: one material, six surface models (see data/catalog/solar.json "look") ── */
  G.body = function (look, map) {
    const L = look || [0, '#888', '#555', '#bbb', 1];
    return new T.ShaderMaterial({
      uniforms: { uMode: { value: L[0] }, uC1: { value: col(L[1]) }, uC2: { value: col(L[2]) }, uC3: { value: col(L[3]) }, uP: { value: L[4] }, uSeed: { value: 0 }, uTime: { value: 0 },
        uSun: { value: new T.Vector3(1, 0, 0) }, uMap: { value: map || null }, uLit: { value: 1 } },
      vertexShader: `varying vec3 vN, vO, vV; varying vec2 vUv;
        void main(){ vUv = uv; vO = position; vec4 w = modelMatrix*vec4(position, 1.0); vN = normalize(mat3(modelMatrix)*normal); vV = cameraPosition - w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vN, vO, vV; varying vec2 vUv; uniform float uMode, uP, uSeed, uTime, uLit; uniform vec3 uC1, uC2, uC3, uSun; uniform sampler2D uMap;
        ${G.NOISE}
        void main(){
          vec3 n = normalize(vN), o = normalize(vO), V = normalize(vV), L = normalize(uSun); float ndl = dot(n, L), mu = max(0.0, dot(n, V));
          vec3 alb = uC1, air = vec3(0.0); float haze = 0.0, night = 0.0; vec3 glow = vec3(0.0);
          if (uMode < 0.5) {                                              /* cratered rock */
            float big = fbm(o*2.2 + uSeed), mid = fbm(o*9.0 + uSeed*2.0), fine = fbm(o*34.0 + uSeed);
            alb = mix(uC1, uC2, smoothstep(0.42, 0.62, big)*min(1.0, uP*0.8)); alb = mix(alb, uC3, smoothstep(0.55, 0.8, mid)*0.35);
            alb *= (0.8 + fine*0.4)*(1.0 - smoothstep(0.64, 0.8, fbm(o*20.0 + 7.0 + uSeed))*0.25*min(uP, 1.5));
            float e = 0.02; vec3 g = vec3(fbm((o + vec3(e,0,0))*24.0) - fbm((o - vec3(e,0,0))*24.0), fbm((o + vec3(0,e,0))*24.0) - fbm((o - vec3(0,e,0))*24.0), fbm((o + vec3(0,0,e))*24.0) - fbm((o - vec3(0,0,e))*24.0));
            ndl = dot(normalize(n - g*1.6), L);
          } else if (uMode < 1.5) {                                       /* banded gas */
            float turb = fbm(vec3(o.x*3.0, o.y*uP*1.3, o.z*3.0) + uSeed);
            float bands = smoothstep(-0.6, 0.6, sin((o.y + turb*0.09)*uP*2.2));
            alb = mix(uC2, uC1, bands); alb = mix(alb, uC3, smoothstep(0.3, 0.9, sin(o.y*uP*5.1 + turb*3.0))*0.3);
            alb *= 0.88 + fbm(vec3(o.x*9.0, o.y*30.0, o.z*9.0) + uSeed)*0.24; air = uC3; haze = 0.45;
          } else if (uMode < 2.5) {                                       /* cracked ice */
            alb = mix(uC1, uC3, fbm(o*3.0 + uSeed));
            float l1 = 1.0 - smoothstep(0.0, 0.03, abs(fbm(o*5.0 + uSeed*3.0) - 0.5)), l2 = (1.0 - smoothstep(0.0, 0.018, abs(fbm(o*12.0 + uSeed) - 0.5)))*0.6;
            alb = mix(alb, uC2, clamp(max(l1, l2)*uP, 0.0, 0.9)); alb *= 0.9 + fbm(o*30.0)*0.2;
          } else if (uMode < 3.5) {                                       /* haze */
            alb = mix(uC1, uC2, fbm(vec3(o.x*2.0, o.y*5.0, o.z*2.0) + uSeed)*clamp(uP*2.0, 0.0, 1.0)); alb = mix(alb, uC3, smoothstep(0.6, 1.0, abs(o.y))*0.3); air = uC3; haze = 0.9;
          } else if (uMode < 4.5) {                                       /* a star: limb darkening, granulation, spots; lit by nothing */
            float gran = fbm(o*18.0 + uTime*0.04), spots = smoothstep(0.7, 0.8, fbm(o*4.0 + uSeed));
            gl_FragColor = vec4(uC1*(0.5 + 0.5*pow(mu, 0.5))*(0.9 + gran*0.2)*(1.0 - spots*0.45)*2.4, 1.0); return;
          } else {                                                        /* Earth: R land, G coastline, B city lights */
            vec4 t = texture2D(uMap, vUv); float land = smoothstep(0.35, 0.62, t.r);
            float cl = smoothstep(0.6, 1.0, fbm(vec3(o.x*3.2, o.y*4.6, o.z*3.2) + vec3(uTime*0.003, 0.0, 0.0))*1.25 + fbm(o*9.0)*0.35)*0.75;
            vec3 soil = mix(vec3(0.23, 0.19, 0.12), vec3(0.11, 0.17, 0.08), smoothstep(0.75, 0.25, abs(o.y))*fbm(o*6.0));
            soil = mix(soil, vec3(0.75), smoothstep(0.86, 0.95, abs(o.y)));
            alb = mix(mix(vec3(0.02, 0.07, 0.17), soil, land), vec3(0.92), cl);
            vec3 H = normalize(L + V); glow += vec3(1.0, 0.93, 0.8)*pow(max(0.0, dot(n, H)), 90.0)*(1.0 - land)*(1.0 - cl)*max(0.0, ndl)*0.8;
            float dark = 1.0 - smoothstep(-0.12, 0.1, ndl);
            glow += (vec3(1.0, 0.68, 0.32)*t.b*2.2*(1.0 - cl*0.6) + vec3(0.5, 0.62, 0.9)*t.g*0.3)*dark;   /* sodium city light, coastlines */
            glow += vec3(1.0, 0.4, 0.15)*exp(-pow(ndl*5.5, 2.0))*0.22; air = vec3(0.3, 0.55, 1.0); haze = 0.8;
          }
          float lam = max(0.0, ndl);
          vec3 c = alb*(lam*1.15*uLit + 0.006) + glow;
          c += air*pow(1.0 - mu, 3.0)*haze*(0.08 + smoothstep(-0.2, 0.3, ndl)*0.8)*0.7;
          gl_FragColor = vec4(c, 1.0); }` });
  };
  /* rings: radial structure from noise, and the planet's shadow falling across them */
  G.rings = function (inner, outer, tint) {      /* inner, outer in planet radii; uSun is the Sun's direction in the ring's own frame */
    return new T.ShaderMaterial({ side: T.DoubleSide, transparent: true, depthWrite: false,
      uniforms: { uIn: { value: inner }, uOut: { value: outer }, uSun: { value: new T.Vector3(1, 0, 0) }, uC: { value: col(tint || '#E3CF9F') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP; uniform float uIn, uOut; uniform vec3 uSun, uC; ${G.NOISE}
        void main(){ float r = length(vP.xy), t = (r - uIn)/(uOut - uIn); if (t < 0.0 || t > 1.0) discard;
          float d = 0.35 + 0.65*n3(vec3(t*42.0, 0.0, 0.0))*n3(vec3(t*170.0, 3.0, 0.0))*2.2;
          d *= smoothstep(0.0, 0.05, t)*smoothstep(1.0, 0.97, t)*(1.0 - 0.85*smoothstep(0.02, 0.0, abs(t - 0.71)));       /* a Cassini-style gap */
          vec3 L = normalize(uSun); float along = dot(vP, L);
          float shadow = (along < 0.0 && length(vP - along*L) < 1.0) ? 0.06 : 1.0;                                          /* behind the planet */
          gl_FragColor = vec4(uC*d*shadow*0.9, clamp(d, 0.0, 1.0)*0.92); }` });
  };
  /* a glow that keeps a minimum size on screen: suns, quasars, beacons */
  G.glow = (hex, strength) => new T.SpriteMaterial({ map: G.glowTex(), color: col(hex).multiplyScalar(strength || 1), blending: T.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
  let glowT = null;
  G.glowTex = function () {
    if (glowT) return glowT;
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.08, 'rgba(255,255,255,0.75)'); g.addColorStop(0.25, 'rgba(255,255,255,0.2)'); g.addColorStop(0.6, 'rgba(255,255,255,0.04)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); glowT = new T.CanvasTexture(c); return glowT;
  };
  /* gas: a billboard of drifting noise in emission-line colours. kind 0 emission, 1 reflection, 2 planetary ring, 3 supernova shell */
  G.nebula = function (kind, seed) {
    return new T.ShaderMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false, side: T.DoubleSide,
      uniforms: { uKind: { value: kind }, uSeed: { value: seed || 0 }, uTime: { value: 0 }, uOp: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float uKind, uSeed, uTime, uOp; ${G.NOISE}
        void main(){ float r = length(vUv); if (r > 1.0) discard; vec3 p = vec3(vUv*2.2, uSeed + uTime*0.006);
          float f = fbm(p + fbm(p*1.7)*1.1), g = fbm(p*2.6 + 4.0);
          vec3 ha = vec3(1.0, 0.27, 0.17), o3 = vec3(0.31, 0.85, 0.77), blue = vec3(0.45, 0.6, 1.0); vec3 c; float a;
          if (uKind < 0.5) { a = smoothstep(0.32, 0.8, f)*(1.0 - r*r); c = mix(ha, o3, smoothstep(0.45, 0.75, g)*0.7)*(0.6 + g); }
          else if (uKind < 1.5) { a = smoothstep(0.3, 0.8, f)*(1.0 - r*r); c = blue*(0.5 + g); }
          else if (uKind < 2.5) { float ring = exp(-pow((r - 0.62)/0.13, 2.0)); a = ring*(0.5 + f) + exp(-r*r*7.0)*0.25*g; c = mix(ha, o3, smoothstep(0.7, 0.4, r)); }
          else { float sh = exp(-pow((r - 0.8)/0.07, 2.0)); float fil = pow(1.0 - abs(fbm(p*4.0) - 0.5)*2.0, 6.0); a = sh*fil*2.0 + fil*0.12*(1.0 - r); c = mix(ha, o3, g); }
          gl_FragColor = vec4(c*a*uOp*1.5, 1.0); }` });
  };
  /* accretion disc: hot inside, cooler outside, brighter on the side turning toward you. uSide +1 draws only the half in front of the hole, −1 the half behind */
  G.disc = function () {
    return new T.ShaderMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false, side: T.DoubleSide,
      uniforms: { uTime: { value: 0 }, uSide: { value: 0 }, uOut: { value: 0 } },
      vertexShader: 'varying vec3 vP; varying float vF; void main(){ vP = position; vec4 w = modelMatrix*vec4(position, 1.0); vec3 c = modelMatrix[3].xyz; vF = dot(w.xyz - c, normalize(cameraPosition - c)); gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `varying vec3 vP; varying float vF; uniform float uTime, uSide, uOut; ${G.NOISE}
        void main(){ if (vF*uSide < 0.0) discard; float r = length(vP.xy), t = clamp((r - 3.0)/9.0, 0.0, 1.0); float ang = atan(vP.y, vP.x);
          float sw = fbm(vec3(cos(ang - uTime*1.6/pow(r, 1.5))*r*0.9, sin(ang - uTime*1.6/pow(r, 1.5))*r*0.9, r*0.6));
          vec3 c = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.36, 0.12), smoothstep(0.0, 0.8, t));
          float a = smoothstep(0.0, 0.05, t)*pow(1.0 - t, 1.6)*(0.45 + sw*1.1);
          a *= 1.0 + 0.75*sin(ang);                                                                 /* Doppler beaming */
          vec3 o = c*a*2.2; if (uOut > 0.5) { o = o/(1.0 + o); o = pow(o, vec3(1.0/2.2)); }           /* drawn straight to screen */
          gl_FragColor = vec4(o, 1.0); }` });
  };

  /* ── generators ── */
  const rnd = (function () { let s = 20261114; return () => { s = (s*1664525 + 1013904223) >>> 0; return s/4294967296; }; })();
  const gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += rnd(); return (u - 2)*0.866; };
  G.rnd = rnd; G.gauss = gauss;
  /* a spiral, lenticular, elliptical or irregular galaxy, radius 1, disc in the XY plane. Returns Float32Arrays. */
  G.galaxyModel = function (type, N) {
    const pos = new Float32Array(N*3), colr = new Float32Array(N*3), size = new Float32Array(N);
    const arms = type === 3 ? 2 : 4, spiral = type === 2 || type === 3;
    for (let i = 0; i < N; i++) {
      let x, y, z, warm;
      if (type === 0) { const r = Math.pow(rnd(), 1.8), u = rnd()*2 - 1, th = rnd()*6.2832, s = Math.sqrt(1 - u*u); x = r*s*Math.cos(th); y = r*s*Math.sin(th)*0.8; z = r*u*0.7; warm = 0.9; }
      else if (type === 4 || type === 5) { x = gauss()*0.4 + (rnd() < 0.3 ? 0.25 : 0); y = gauss()*0.3; z = gauss()*0.12; warm = rnd() < 0.5 ? 0.2 : 0.5; }
      else {
        const bulge = rnd() < (type === 1 ? 0.45 : 0.16);
        if (bulge) { const r = Math.pow(rnd(), 1.5)*0.22, u = rnd()*2 - 1, th = rnd()*6.2832, s = Math.sqrt(1 - u*u); x = r*s*Math.cos(th); y = r*s*Math.sin(th); z = r*u*0.7; warm = 1; }
        else { const r = Math.min(1, 0.05 - 0.27*Math.log(1 - rnd()*0.97)); let th = rnd()*6.2832;
          if (spiral) { const arm = Math.floor(rnd()*arms); th = arm/arms*6.2832 + Math.log(r/0.05)*2.3 + gauss()*(0.16 + 0.05/r); if (type === 3 && r < 0.3) th = Math.floor(rnd()*2)*3.1416 + gauss()*0.12; }
          x = r*Math.cos(th); y = r*Math.sin(th); z = gauss()*0.012*(1 + r); warm = Math.max(0, 0.75 - r*1.1) + rnd()*0.25; }
      }
      pos[i*3] = x; pos[i*3 + 1] = y; pos[i*3 + 2] = z;
      colr[i*3] = 0.62 + 0.38*warm; colr[i*3 + 1] = 0.7 + 0.1*warm; colr[i*3 + 2] = 1.0 - 0.45*warm;
      size[i] = rnd() < 0.03 ? 2.6 : 1.0;
    }
    return { pos, col: colr, size };
  };
  /* a star cluster: Plummer sphere of radius-scale 1 */
  G.clusterModel = function (N, concentration) {
    const pos = new Float32Array(N*3), colr = new Float32Array(N*3), size = new Float32Array(N);
    for (let i = 0; i < N; i++) { const r = Math.min(4, concentration/Math.sqrt(Math.pow(0.02 + rnd()*0.97, -2/3) - 1)), u = rnd()*2 - 1, th = rnd()*6.2832, s = Math.sqrt(1 - u*u);
      pos[i*3] = r*s*Math.cos(th); pos[i*3 + 1] = r*u; pos[i*3 + 2] = r*s*Math.sin(th); const w = rnd();
      colr[i*3] = 0.75 + 0.25*w; colr[i*3 + 1] = 0.8; colr[i*3 + 2] = 1.0 - 0.4*w; size[i] = rnd() < 0.05 ? 2.4 : 1.1; }
    return { pos, col: colr, size };
  };
  G.points = function (m, material) {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(m.pos, 3)); g.setAttribute('aColor', new T.BufferAttribute(m.col, 3)); g.setAttribute('aS', new T.BufferAttribute(m.size, 1));
    const p = new T.Points(g, material); p.frustumCulled = false; return p;
  };
  /* value noise in JS, for building the cosmic-web illustration */
  G.vnoise = (function () {
    const h = (x, y, z) => { let n = Math.sin(x*127.1 + y*311.7 + z*74.7)*43758.5453; return n - Math.floor(n); }, sm = t => t*t*(3 - 2*t);
    return (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi); const L = (a, b, t) => a + (b - a)*t;
      return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), xf), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf), L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf), zf); };
  })();
})();

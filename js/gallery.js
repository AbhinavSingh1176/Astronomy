/* OWLT · gallery.js — the slide room. One tray per phase of exploration (data/gallery.json, built from data/gallery-trays.json).
   The projector moves on every nine seconds; a slide comes up from its small copy, blurred, and sharpens when the full picture is in. */
(function () {
  'use strict';
  const O = window.OWLT, A = window.ASTRO, $ = O.$, el = O.el;
  O.nav();
  const DUR = 9000, C = 299792.458;
  const S = { trays: [], ti: 0, si: 0, playing: true, t0: 0, timer: null, sound: false, ctx: null, token: 0 };
  const screen = $('#screen'), img = $('#slide'), empty = $('#empty');
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const when = d => { if (!d) return ''; const [y, m, day] = String(d).split('-'); return day ? +day + ' ' + MONTHS[+m - 1] + ' ' + y : m ? MONTHS[+m - 1] + ' ' + y : y; };
  const pad = n => String(n).padStart(2, '0');

  /* how long light from the subject takes to reach you, for the places whose distance changes by the hour */
  const NAME = { moon: 'the Moon', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto', io: 'Io', europa: 'Europa',
    titan: 'Titan', miranda: 'Miranda', charon: 'Charon', 'voyager-1': 'Voyager 1' };
  const PARENT = { io: 'jupiter', europa: 'jupiter', titan: 'saturn', miranda: 'uranus', charon: 'pluto' };
  function lightLine(obj) {
    if (!NAME[obj]) return null;
    const jd = A.jdOf(new Date()), body = PARENT[obj] || obj;
    let sec = null;
    try { sec = body === 'moon' ? A.moon(jd).distKm / C : body === 'voyager-1' ? A.probe('voyager-1', jd).lightSec : A.planet(body, jd).lightMin * 60; } catch (e) { return null; }
    if (!(sec > 0)) return null;
    return obj === 'voyager-1' ? 'A signal from Voyager 1 takes ' + A.lightTime(sec) + ' to reach Earth now.' : 'Light from ' + NAME[obj] + ' takes ' + A.lightTime(sec) + ' to reach you now.';
  }

  O.load('data/gallery.json').then(d => {
    S.trays = (d && d.trays || []).filter(t => t.slides && t.slides.length);
    if (!S.trays.length) { empty.textContent = 'The slides have not been fetched yet. They arrive with the next data update.'; img.hidden = true; return; }
    buildTrays();
    const [tid, n] = (decodeURIComponent(location.hash.slice(1)) || '').split('/');
    let ti = S.trays.findIndex(t => t.id === tid);
    if (ti < 0) { let saved = null; try { saved = localStorage.getItem('owlt.gallery.tray'); } catch (e) {} ti = S.trays.findIndex(t => t.id === saved); }
    if (ti < 0) ti = Math.floor(Date.now() / 864e5) % S.trays.length;          /* a tray of the day */
    S.playing = !O.reduced;
    loadTray(ti, Math.max(0, (+n || 1) - 1));
    bind();
  });

  function buildTrays() {
    const host = O.clear($('#trays'));
    S.trays.forEach((t, i) => host.append(el('button', { class: 'tray', type: 'button', 'aria-pressed': 'false', onclick: () => { loadTray(i, 0); } },
      el('span', { class: 'top' }, el('span', { class: 'plate', text: 'Tray ' + (i + 1) }), el('i', { class: 'lamp' })),
      el('b', { text: t.name }), el('span', { class: 'y', text: t.years + ' · ' + t.slides.length + ' slides' }))));
  }
  function loadTray(ti, si) {
    S.ti = ti; const t = S.trays[ti];
    O.$$('.tray', $('#trays')).forEach((b, i) => { b.setAttribute('aria-pressed', String(i === ti)); b.querySelector('.lamp').className = 'lamp' + (i === ti ? ' on' : ''); });
    try { localStorage.setItem('owlt.gallery.tray', t.id); } catch (e) {}
    const film = O.clear($('#film'));
    t.slides.forEach((s, i) => film.append(el('button', { type: 'button', 'aria-label': (i + 1) + '. ' + s.title, title: s.title, style: { backgroundImage: 'url("' + (s.thumb || s.img) + '")' }, onclick: () => show(i) },
      el('span', { text: pad(i + 1) }))));
    show(Math.min(si, t.slides.length - 1), true);
  }

  function show(si, first) {
    const t = S.trays[S.ti], n = t.slides.length; si = (si + n) % n; S.si = si;
    const s = t.slides[si], token = ++S.token;
    $('#count').textContent = 'Slide ' + pad(si + 1) + ' / ' + pad(n);
    /* the lens: the small copy first, soft, then the full picture */
    const put = () => { if (token !== S.token) return; empty.hidden = true; img.hidden = false; img.alt = s.title; img.classList.add('soft'); img.src = s.thumb || s.img;
      const full = new Image(); full.decoding = 'async';
      full.onload = () => { if (token !== S.token) return; img.src = s.img; requestAnimationFrame(() => img.classList.remove('soft')); };
      full.onerror = () => { if (token === S.token) img.classList.remove('soft'); };
      full.src = s.img; };
    if (!first && !O.reduced) { screen.classList.remove('clunk'); void screen.offsetWidth; screen.classList.add('clunk'); clunk(); setTimeout(put, 120); } else put();
    record(t, s, si);
    O.$$('#film button').forEach((b, i) => b.setAttribute('aria-current', String(i === si)));
    /* centre the slide in the filmstrip by scrolling the strip alone: the page itself stays where the reader left it */
    const film = $('#film'), cur = film.children[si];
    if (cur) film.scrollBy({ left: cur.getBoundingClientRect().left - film.getBoundingClientRect().left - (film.clientWidth - cur.offsetWidth) / 2, behavior: O.reduced ? 'auto' : 'smooth' });
    const next = t.slides[(si + 1) % n]; if (next) { const p = new Image(); p.src = next.img; }      /* the next one, ready in the gate */
    history.replaceState(null, '', '#' + t.id + '/' + (si + 1));
    restartTimer();
  }
  function record(t, s, si) {
    const text = s.text && s.text.length > 460 ? s.text.slice(0, s.text.lastIndexOf('. ', 460) + 1 || 460) + (s.text.lastIndexOf('. ', 460) > 0 ? '' : '…') : s.text;
    O.clear($('#rec')).append(...[                    /* the DOM's own append writes a null as the word "null": leave the gaps out */
      el('div', null, el('span', { class: 'tape', text: s.id }), ' ', s.date ? el('span', { class: 'tape red', text: when(s.date) }) : null),
      el('h2', { text: s.title }),
      el('div', { class: 'meta' }, s.date ? [el('b', { text: when(s.date) }), ' · '] : null, 'Credit: ', el('b', { text: s.credit })),
      text ? el('p', { class: 't', text }) : null].filter(Boolean));
    const light = s.obj ? lightLine(s.obj) : null;
    O.clear($('#side')).append(...[
      el('span', { class: 'plate', text: 'Tray ' + (S.ti + 1) + ' · ' + t.name }),
      el('p', { class: 'blurb', text: t.blurb }),
      light ? el('p', { class: 'light', text: light }) : null,
      el('div', { class: 'links' }, s.obj ? el('a', { class: 'push', href: 'ladder.html#' + s.obj, text: 'On the Ladder' }) : null, O.ext(s.page, 'NASA’s record'))].filter(Boolean));
  }

  /* the projector's clock */
  function restartTimer() {
    clearTimeout(S.timer); const bar = $('#timer');
    bar.style.transition = 'none'; bar.style.width = '0%'; void bar.offsetWidth;
    if (!S.playing || document.hidden) return;
    bar.style.transition = 'width ' + DUR + 'ms linear'; bar.style.width = '100%';
    S.timer = setTimeout(() => show(S.si + 1), DUR);
  }
  function setPlaying(on) {
    S.playing = on; const b = $('#bPlay'); b.textContent = on ? 'Pause' : 'Play'; b.setAttribute('aria-pressed', String(on)); restartTimer();
  }

  /* a projector's clunk, made here: a click and a thump. Off until asked for */
  function clunk() {
    if (!S.sound) return;
    try { const AC = window.AudioContext || window.webkitAudioContext; S.ctx = S.ctx || new AC(); const c = S.ctx, t = c.currentTime;
      const len = Math.floor(c.sampleRate * 0.05), buf = c.createBuffer(1, len, c.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(); src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8; g.gain.value = 0.35;
      src.connect(bp); bp.connect(g); g.connect(c.destination); src.start(t);
      const o = c.createOscillator(), og = c.createGain(); o.frequency.setValueAtTime(110, t + 0.03); o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
      og.gain.setValueAtTime(0.0001, t + 0.03); og.gain.exponentialRampToValueAtTime(0.5, t + 0.045); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(og); og.connect(c.destination); o.start(t + 0.03); o.stop(t + 0.26); } catch (e) {}
  }

  function bind() {
    const step = d => show(S.si + d);
    $('#bPrev').addEventListener('click', () => step(-1)); $('#bNext').addEventListener('click', () => step(1));
    $('#sPrev').addEventListener('click', () => step(-1)); $('#sNext').addEventListener('click', () => step(1));
    $('#bPlay').addEventListener('click', () => setPlaying(!S.playing));
    $('#bSound').addEventListener('click', e => { S.sound = !S.sound; e.currentTarget.setAttribute('aria-pressed', String(S.sound)); if (S.sound) clunk(); });
    addEventListener('keydown', e => {
      if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || O.palette.isOpen) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === ' ' && e.target === document.body) { e.preventDefault(); setPlaying(!S.playing); }
      else if (/^[1-9]$/.test(e.key) && +e.key <= S.trays.length) loadTray(+e.key - 1, 0);
    });
    let x0 = null; screen.addEventListener('pointerdown', e => { x0 = e.clientX; });
    screen.addEventListener('pointerup', e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1); });
    document.addEventListener('visibilitychange', restartTimer);
    addEventListener('hashchange', () => { const [tid, n] = decodeURIComponent(location.hash.slice(1)).split('/'), ti = S.trays.findIndex(t => t.id === tid);
      if (ti >= 0 && (ti !== S.ti || (+n || 1) - 1 !== S.si)) loadTray(ti, Math.max(0, (+n || 1) - 1)); });
    setPlaying(S.playing);
  }
  O.footer(document.body, ['Slides: NASA Image and Video Library, fetched once a week.']);
})();

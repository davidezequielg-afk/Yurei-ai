// Música: lo que suena (SMTC de Windows), portada, controles, progreso, volumen y un visualizador de 5 bandas.
// El visualizador usa el audio del sistema (loopback) si Windows lo permite; si no, se anima con el estado de reproducción.

(() => {
  const mk = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); kids.flat().forEach((k) => k != null && n.append(k)); return n; };
  const $ = (id) => document.getElementById(id);
  const cfg = () => Island.state.cfg || {};
  let host = null;
  const ui = {};
  const M = { m: null, at: 0, art: '', key: '', lastPlaying: 0, vol: null, volOpen: false, seeking: false };
  let poll = null;
  let tick = null;
  let volTick = null;

  const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const playing = () => M.m?.available && M.m.status === 'Playing';
  const position = () => (M.m?.available ? Math.min(M.m.duration || 1e9, M.m.position + (playing() ? (Date.now() - M.at) / 1000 : 0)) : 0);

  /* ---------- visualizador ---------- */
  const Viz = (() => {
    const groups = new Set(); // cada grupo = 5 barras en pantalla
    let raf = null;
    let analyser = null;
    let stream = null;
    let tried = false;
    let peak = [0.05, 0.05, 0.05, 0.05, 0.05];
    const val = [0.18, 0.18, 0.18, 0.18, 0.18];
    const buf = new Uint8Array(512);

    function make(cls = '') {
      const g = mk('span', { className: `vizbars ${cls}` }, ...[0, 1, 2, 3, 4].map(() => mk('i')));
      groups.add(g);
      return g;
    }

    async function tryLoopback() {
      if (tried) return;
      tried = true;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); }); // solo el audio; el video no se usa
        if (!stream.getAudioTracks().length) throw new Error('sin audio');
        const ctx = new AudioContext();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        ctx.createMediaStreamSource(stream).connect(analyser);
      } catch { analyser = null; stream = null; }
    }

    // 5 bandas (graves a agudos) con más peso a los agudos; se normaliza contra un pico que baja despacio.
    const BANDS = [[1, 4], [4, 10], [10, 28], [28, 72], [72, 200]];
    const WEIGHT = [0.8, 1, 1.25, 1.7, 2.3];
    function sample(t) {
      const out = [];
      if (analyser) {
        analyser.getByteFrequencyData(buf);
        BANDS.forEach(([a, b], i) => {
          let sum = 0;
          for (let k = a; k < b; k++) sum += buf[k];
          let v = (sum / (b - a) / 255) * WEIGHT[i];
          peak[i] = Math.max(peak[i] * 0.99, v, 0.05);
          v = (v / peak[i]) ** 0.75;
          out.push(Math.max(0.18, Math.min(1, v)));
        });
      } else {
        for (let i = 0; i < 5; i++) out.push(0.25 + 0.55 * Math.abs(Math.sin(t / (210 + i * 55) + i * 1.7)) * (0.6 + 0.4 * Math.sin(t / 900 + i)));
      }
      return out;
    }

    function frame(t) {
      const on = playing();
      const target = on ? sample(t) : [0.1, 0.1, 0.1, 0.1, 0.1];
      for (let i = 0; i < 5; i++) val[i] += (target[i] - val[i]) * (target[i] > val[i] ? 0.55 : 0.18); // sube rápido, baja suave
      groups.forEach((g) => {
        if (!g.offsetParent) return;
        [...g.children].forEach((b, i) => { b.style.transform = `scaleY(${Math.max(0.2, val[i]).toFixed(3)})`; b.style.opacity = on ? 0.95 : 0.5; });
      });
      raf = on || val.some((v) => Math.abs(v - 0.1) > 0.02) ? requestAnimationFrame(frame) : null;
    }
    return { make, start() { if (cfg().mediaVisualizer !== false) { tryLoopback(); if (!raf) raf = requestAnimationFrame(frame); } }, stop() { if (raf) cancelAnimationFrame(raf); raf = null; } };
  })();

  /* ---------- datos ---------- */
  async function fetchMedia() {
    const r = await window.yurei.widgetData('media');
    M.m = r.ok ? r.data : { available: false };
    M.at = Date.now();
    if (playing()) M.lastPlaying = Date.now();
    const key = `${M.m.title}|${M.m.artist}|${M.m.app}`;
    if (M.m.available && key !== M.key) { M.key = key; fetchCover(key); }
    if (!M.m.available) { M.key = ''; setArt(''); }
    publish();
    if (Island.view === 'music') drawMusic();
  }

  async function fetchCover(key) {
    const r = await window.yurei.widgetData('cover');
    if (M.key !== key) return;
    setArt(r.ok && r.data.url ? r.data.url : '');
  }

  function setArt(url) {
    M.art = url;
    $('glow').firstElementChild?.remove();
    if (url) { const i = mk('i'); i.style.backgroundImage = `url("${url}")`; $('glow').append(i); }
    publish();
    if (Island.view === 'music') drawMusic();
  }

  // Lo que la píldora cerrada necesita saber: ¿hay actividad de música? (suena, o se pausó hace menos de 5 s)
  function publish() {
    const c = cfg();
    const enabled = c.musicEnabled !== false && c.musicCompact !== false;
    const active = enabled && !!M.m?.available && (playing() || Date.now() - M.lastPlaying < 5000);
    Island.setMusic({ active, viz: c.mediaVisualizer !== false && playing(), art: c.mediaAlbumArt !== false && !!M.art, artUrl: M.art, playing: playing() });
    const showViz = active && c.mediaVisualizer !== false;
    $('mviz').hidden = !showViz;
    $('mart').hidden = !(active && c.mediaAlbumArt !== false && !!M.art); // sin portada no se muestra (si no, queda un recuadro roto)
    if (M.art && !$('mart').hidden) $('mart').src = M.art;
    $('mart').classList.toggle('paused', !playing());
    $('mart').classList.toggle('glowy', c.mediaCompactGlow !== false);
    if (playing()) Viz.start();
  }

  /* ---------- acciones ---------- */
  const act = (action, arg) => window.yurei.widgetAction('media', { action, arg }).then(() => setTimeout(fetchMedia, 350));
  async function setVolume(v) { M.vol = v; await window.yurei.widgetAction('volume', { level: v }); }
  async function seekTo(sec) { const d = sec - position(); if (Math.abs(d) < 0.5) return; await act('seek', Math.round(d)); }

  /* ---------- pantalla ---------- */
  function ctrl(icon, title, onClick, size = 20, cls = '') {
    const b = mk('button', { className: `mbtn ${cls}`, type: 'button', title }, window.icon(icon, size));
    b.onclick = (e) => { e.stopPropagation(); onClick(); };
    return b;
  }

  function slideBtn(icon, title, onClick, dir) {
    const b = ctrl(icon, title, () => { b.classList.remove('slide-l', 'slide-r'); void b.offsetWidth; b.classList.add(dir < 0 ? 'slide-l' : 'slide-r'); onClick(); });
    return b;
  }

  function volumeRow() {
    const fill = mk('i');
    const track = mk('div', { className: 'vtrack' }, fill);
    const row = mk('div', { className: 'vrow' }, window.icon('volume', 12), track, window.icon('volume', 14));
    const set = (x, commit) => { const b = track.getBoundingClientRect(); const v = Math.max(0, Math.min(100, Math.round(((x - b.left) / b.width) * 100))); fill.style.width = `${v}%`; if (commit) setVolume(v); else M.vol = v; };
    let drag = false;
    track.onpointerdown = (e) => { drag = true; track.setPointerCapture(e.pointerId); set(e.clientX); Island.hold(true); };
    track.onpointermove = (e) => { if (drag) set(e.clientX); };
    track.onpointerup = (e) => { if (drag) { drag = false; set(e.clientX, true); Island.hold(false); } };
    row.sync = () => { if (!drag && M.vol != null) fill.style.width = `${M.vol}%`; };
    row.sync();
    return row;
  }

  function progress() {
    const fill = mk('i');
    const track = mk('div', { className: 'ptrack' }, fill);
    const el = mk('span', { textContent: '0:00' });
    const rem = mk('span', { textContent: '-0:00' });
    const row = mk('div', { className: 'prow' }, el, track, rem);
    let drag = false;
    const frac = (x) => { const b = track.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - b.left) / b.width)); };
    track.onpointerdown = (e) => { drag = true; M.seeking = true; track.setPointerCapture(e.pointerId); fill.style.width = `${frac(e.clientX) * 100}%`; Island.hold(true); };
    track.onpointermove = (e) => { if (drag) fill.style.width = `${frac(e.clientX) * 100}%`; };
    track.onpointerup = (e) => { if (!drag) return; drag = false; M.seeking = false; Island.hold(false); seekTo(frac(e.clientX) * (M.m.duration || 0)); };
    row.update = () => {
      const d = M.m?.duration || 0;
      row.hidden = !(d > 0);
      if (drag) return;
      const p = position();
      fill.style.width = `${Math.min(100, (p / d) * 100)}%`;
      el.textContent = fmt(p);
      rem.textContent = `-${fmt(d - p)}`;
    };
    return row;
  }

  function titleBlock(big) {
    const m = M.m || {};
    const span = mk('span', { textContent: m.title || m.app || t('Reproduciendo') });
    const title = mk('div', { className: `mt ${big ? 'big' : ''}` }, span);
    requestAnimationFrame(() => {
      const over = span.offsetWidth - title.clientWidth;
      title.classList.toggle('marquee', over > 0);
      if (over > 0) { title.style.setProperty('--over', `${over}px`); title.style.setProperty('--dur', `${Math.max(5, (span.offsetWidth / 30) * 2)}s`); }
    });
    return mk('div', { className: 'mtext' }, title, mk('div', { className: 'ma', textContent: m.artist || '' }));
  }

  let layoutNow = 'classic';
  function drawMusic() {
    if (!host) return;
    if (!M.m?.available) {
      host.replaceChildren(mk('div', { className: 'empty', textContent: t('Nada reproduciéndose') }));
      layoutNow = 'empty'; Island.refresh(); return;
    }
    const c = cfg();
    layoutNow = c.mediaLayout === 'compact' ? 'compact' : 'classic';
    const artBtn = mk('button', { className: 'martbig', type: 'button', title: layoutNow === 'classic' ? t('Cambiar a diseño compacto') : t('Cambiar a diseño clásico') });
    if (M.art) artBtn.append(mk('img', { src: M.art, alt: '' })); else artBtn.append(window.icon('music', layoutNow === 'classic' ? 34 : 22));
    artBtn.onclick = () => { window.yurei.saveSettings({ mediaLayout: layoutNow === 'classic' ? 'compact' : 'classic' }); };
    const playBtn = ctrl(playing() ? 'pause' : 'play', t('Pausar / reanudar'), () => act('toggle'), layoutNow === 'classic' ? 26 : 24, 'play');
    const prev = slideBtn('prev', t('Anterior'), () => act('prev'), -1);
    const next = slideBtn('next', t('Siguiente'), () => act('next'), 1);
    const out = ctrl('headphones', t('Salida de audio'), () => window.yurei.sysOpen('sound'), 16);
    const viz = Viz.make(layoutNow === 'compact' ? 'dim' : '');
    if (layoutNow === 'classic') {
      ui.vol = volumeRow();
      host.replaceChildren(mk('div', { className: 'mclassic' }, artBtn, mk('div', { className: 'mright' }, mk('div', { className: 'mtop' }, titleBlock(true), mk('span', { className: 'vizslot' }, viz, out)), mk('div', { className: 'mctl' }, prev, playBtn, next), ui.vol)));
      ui.prog = null;
    } else {
      ui.prog = progress();
      ui.vol = volumeRow();
      ui.volWrap = mk('div', { className: `vwrap${M.volOpen ? ' open' : ''}` }, ui.vol);
      const volBtn = ctrl('volume', t('Volumen'), () => { M.volOpen = !M.volOpen; ui.volWrap.classList.toggle('open', M.volOpen); Island.refresh(); }, 16);
      host.replaceChildren(mk('div', { className: 'mcompact' }, mk('div', { className: 'mhead' }, artBtn, titleBlock(false), viz), ui.prog, mk('div', { className: 'mctl' }, volBtn, prev, playBtn, next, out), ui.volWrap));
    }
    tickProgress();
    Island.refresh();
  }

  function tickProgress() { ui.prog?.update(); }

  function size() {
    if (layoutNow === 'empty') return { w: 300, h: 70, r: 22 };
    if (layoutNow === 'compact') return { w: 300, h: 134 + (M.m?.duration > 0 ? 0 : -22) + (M.volOpen ? 34 : 0), r: 22 };
    return { w: 340, h: 122, r: 22 };
  }

  function build(el) { host = el; }

  Island.register('music', {
    build,
    size,
    enter() {
      fetchMedia(); drawMusic(); Viz.start();
      tick = setInterval(() => { if (ui.prog && !M.seeking) tickProgress(); }, 250);
      const readVol = () => window.yurei.widgetData('volume').then((r) => { if (r.ok && typeof r.data.volume === 'number' && !ui.vol?.dragging) { M.vol = r.data.volume; ui.vol?.sync(); } });
      readVol();
      volTick = setInterval(readVol, 700); // el volumen también cambia desde Windows
    },
    leave() { clearInterval(tick); clearInterval(volTick); tick = null; volTick = null; }
  });

  // Ya se sabe qué suena aunque la isla esté cerrada: se consulta cada 3 s mientras la música esté activada.
  function startPolling() {
    clearInterval(poll);
    if (cfg().musicEnabled === false) { Island.setMusic(null); $('mviz').hidden = true; $('mart').hidden = true; return; }
    poll = setInterval(fetchMedia, 3000);
    fetchMedia();
  }
  Island.onMusicConfig = () => { startPolling(); if (Island.view === 'music') drawMusic(); };
  $('mviz').append(Viz.make());
  $('mart').onclick = (e) => { e.stopPropagation(); Island.open('music'); };
  $('mart').oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); act('prev'); };
  setTimeout(startPolling, 800);
})();

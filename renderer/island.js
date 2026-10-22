// Motor de la isla: tamaño con física de resorte, vistas (paneles y actividades), widgets de estado, pulsos y mouse.
// Cada vista se registra con Island.register(nombre, { build(el), size(), enter(), leave() }) desde su propio archivo.

const Island = (() => {
  const $ = (id) => document.getElementById(id);
  const el = $('island');
  const mk = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); kids.flat().forEach((k) => k != null && n.append(k)); return n; };

  /* ---------- resorte (rigidez, amortiguación, masa) ---------- */
  class Spring {
    constructor(x, k, c, m = 1) { this.x = x; this.t = x; this.v = 0; this.k = k; this.c = c; this.m = m; }
    step(dt) { const a = (-this.k * (this.x - this.t) - this.c * this.v) / this.m; this.v += a * dt; this.x += this.v * dt; }
    get settled() { return Math.abs(this.x - this.t) < 0.05 && Math.abs(this.v) < 0.05; }
    snap() { this.x = this.t; this.v = 0; }
  }
  const sp = { w: new Spring(34, 400, 31), h: new Spring(34, 450, 29), r: new Spring(17, 1000, 40), y: new Spring(-60, 550, 45, 0.8) };

  /* ---------- estado ---------- */
  const PANELS = ['yurei', 'calendar', 'control'];
  const st = {
    view: '', // '' | yurei | calendar | control | music | shelf | notice
    hot: false, tuck: false, hold: 0, phase: '', timer: false, pulse: null, notice: '', away: false,
    music: null, shelfCount: 0, attached: false, started: false, time24: false,
    widgets: { left: ['weather'], right: ['battery'] }, device: null, hoverOpen: true,
    last: 'yurei', remember: true, defPanel: 'calendar', calendarOn: true, controlOn: true, visibility: 'fixed',
    scale: 1
  };
  const mods = {};
  let hoverTimer = null;
  let leaveTimer = null;
  let raf = null;
  let lastRects = '';
  let lastSend = 0;

  const panels = () => PANELS.filter((p) => (p === 'calendar' ? st.calendarOn : p === 'control' ? st.controlOn : true));

  /* ---------- tamaño según lo que muestra ---------- */
  const widgetCount = () => st.widgets.left.length + st.widgets.right.length;
  const BASE_H = 36;

  // Ancho natural de la barra cerrada: lo que de verdad hay dentro (carita, cuenta atrás, visualizador, hora, portada…),
  // con 14 px de margen a cada lado y 12 entre grupos. Los widgets de estado no cuentan: solo se ven al pasar el mouse.
  function flowWidth() {
    const shown = (n) => n && !n.hidden && getComputedStyle(n).display !== 'none';
    const group = (root, skip = []) => {
      const kids = [...root.children].filter((n) => shown(n) && !skip.includes(n.id));
      return kids.length ? kids.reduce((a, n) => a + n.getBoundingClientRect().width, 0) + 8 * (kids.length - 1) : 0;
    };
    const parts = [group($('lslot'), ['lwidgets']), group($('center')), group($('rslot'), ['rwidgets', 'chev', 'gear', 'upd'])].filter((x) => x > 0);
    return 28 + parts.reduce((a, x) => a + x, 0) + 12 * Math.max(0, parts.length - 1) + (el.classList.contains('has-update') ? 11 : 0);
  }

  function collapsedWidth() {
    let w = Math.ceil(flowWidth());
    if ((st.hot || st.view === '') && st.hot && widgetCount()) w = Math.max(w, Math.min(200 + 50 * widgetCount(), 380));
    return w;
  }

  function noticeSize() {
    const r = $('reply');
    r.style.width = '312px';
    const h = Math.min(160, r.scrollHeight + 4);
    return { w: 340, h };
  }

  function target() {
    if (st.view === 'notice') { const n = noticeSize(); return { w: n.w, h: BASE_H + n.h, r: 18 }; }
    if (st.view && mods[st.view]) { const s = mods[st.view].size(); return { w: s.w, h: BASE_H + s.h, r: s.r || 18 }; }
    return { w: collapsedWidth(), h: BASE_H, r: 18 };
  }

  function refresh() {
    if (!st.started) return;
    const t = target();
    sp.w.t = t.w; sp.h.t = t.h; sp.r.t = t.r;
    // Escondida (modos inteligente / asomar): sube dejando 3 px visibles; no se esconde si está ocupada o el mouse está encima.
    const tucked = st.tuck && !st.hot && !st.view && !st.phase && !st.pulse && !st.notice;
    sp.y.t = st.away ? -100 : tucked ? -(t.h - 3) : 0;
    el.classList.toggle('tucked', tucked);
    el.classList.toggle('away', st.away);
    el.classList.toggle('open', !!st.view && st.view !== 'notice');
    el.classList.toggle('hot', st.hot || (!!st.view && st.view !== 'notice'));
    el.classList.toggle('pulsing', !!st.pulse);
    el.dataset.view = st.view;
    run();
  }

  /* ---------- animación ---------- */
  function run() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  let last = 0;
  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    while (dt > 0) { const s = Math.min(dt, 1 / 240); Object.values(sp).forEach((x) => x.step(s)); dt -= s; }
    apply();
    if (Object.values(sp).every((x) => x.settled)) { Object.values(sp).forEach((x) => x.snap()); apply(true); raf = null; return; }
    raf = requestAnimationFrame(frame);
  }

  function apply(force) {
    const r = Math.max(0, sp.r.x);
    el.style.width = `${Math.max(20, sp.w.x)}px`;
    el.style.height = `${Math.max(20, sp.h.x)}px`;
    el.style.top = `${sp.y.x}px`;
    el.style.borderRadius = st.attached ? `0 0 ${r}px ${r}px` : `${r}px`;
    positionBubbles();
    sendRects(force);
  }

  /* ---------- zonas que reciben el mouse (el resto es transparente al clic) ---------- */
  function rectOf(n) {
    if (!n || n.hidden) return null;
    const b = n.getBoundingClientRect();
    return b.width > 0 ? { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } : null;
  }
  function sendRects(force) {
    const now = performance.now();
    if (!force && now - lastSend < 30) return;
    const rects = [rectOf(el), rectOf($('bubbleL')), rectOf($('bubbleR'))].filter(Boolean);
    const key = JSON.stringify(rects);
    if (key === lastRects && !force) return;
    lastRects = key; lastSend = now;
    window.yurei.islandRects(rects);
  }

  /* ---------- burbujas (actividad aparte de la píldora) ---------- */
  function positionBubbles() {
    const cx = window.innerWidth / 2;
    const half = sp.w.x / 2;
    $('bubbleL').style.left = `${cx - half - 8 - ($('bubbleL').offsetWidth || 30)}px`;
    $('bubbleR').style.left = `${cx + half + 8}px`;
  }
  function updateBubbles() {
    const l = $('bubbleL');
    const r = $('bubbleR');
    const collapsed = !st.view || st.view === 'notice';
    l.hidden = !(collapsed && st.shelfCount > 0);
    l.textContent = st.shelfCount ? String(st.shelfCount) : '';
    // con un temporizador en marcha la música pasa a su propia burbuja
    const showMusic = collapsed && st.timer && st.music?.active;
    r.hidden = !showMusic;
    if (showMusic) { r.replaceChildren(st.music.artUrl ? mk('img', { src: st.music.artUrl, alt: '' }) : window.icon('music', 14)); }
    positionBubbles();
  }
  $('bubbleL').onclick = () => open('shelf');
  $('bubbleR').onclick = () => open('music');

  /* ---------- vistas ---------- */
  function register(name, mod) {
    mods[name] = mod;
    const host = name === 'yurei' ? $('panel') : $(`v-${name}`);
    if (mod.build && name !== 'yurei') mod.build(host);
  }

  function showView(name) {
    document.querySelectorAll('#views .view').forEach((v) => {
      const mine = (v.id === 'panel' && name === 'yurei') || v.dataset.v === name || (v.id === 'reply' && name === 'notice');
      if (mine) { v.hidden = false; requestAnimationFrame(() => v.classList.add('on')); } else { v.classList.remove('on'); }
    });
    setTimeout(() => {
      document.querySelectorAll('#views .view:not(.on)').forEach((v) => { v.hidden = true; });
    }, 220);
  }

  function setView(name) {
    if (st.view === name) { refresh(); return; }
    const prev = st.view;
    if (prev && mods[prev]?.leave) mods[prev].leave();
    st.view = name;
    if (PANELS.includes(name)) { st.last = name; if (st.remember) window.yurei.saveSettings({ notchLastPanel: name }); }
    el.classList.toggle('glowing', name === 'music' && st.cfg?.mediaAmbience !== false);
    $('glow').style.opacity = '';
    showView(name);
    if (name && mods[name]?.enter) mods[name].enter();
    updateBubbles();
    refresh();
    Island.onView?.(name, prev);
  }

  function open(name) { clearTimeout(leaveTimer); setView(name || startPanel()); }
  function close() { if (st.view) setView(''); }
  const startPanel = () => {
    const ok = panels();
    const pick = st.remember ? st.last : st.defPanel;
    return ok.includes(pick) ? pick : ok.includes('calendar') ? 'calendar' : ok[0];
  };
  function cycle(dir) {
    const ok = panels();
    if (!ok.length) return;
    const i = ok.indexOf(st.view);
    open(ok[(i < 0 ? 0 : i + dir + ok.length) % ok.length]);
  }

  /* ---------- aviso corto (respuestas y errores) ---------- */
  let noticeTimer = null;
  function notice(text, ms = 5000) {
    $('reply').textContent = text;
    if (st.view && st.view !== 'notice') return; // con un panel abierto no se tapa
    st.notice = text;
    setView('notice');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { if (st.view === 'notice') setView(''); }, ms);
  }

  /* ---------- pulsos: cargador, batería baja, actualización ---------- */
  let pulseTimer = null;
  function pulse(html, ms = 4000, accent) {
    if (st.view && st.view !== 'notice') return;
    const p = $('pulse');
    p.replaceChildren(...(Array.isArray(html) ? html : [html]));
    p.style.color = accent || '';
    st.pulse = true;
    refresh();
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => { st.pulse = null; refresh(); }, ms);
  }

  /* ---------- mouse ---------- */
  function hover(inside) {
    if (inside === st.hot) return;
    st.hot = inside;
    clearTimeout(hoverTimer);
    clearTimeout(leaveTimer);
    if (inside) {
      if (st.hoverOpen && !st.view && !st.pulse) hoverTimer = setTimeout(() => { if (st.hot && !st.view) open(); }, 380);
      Island.onHot?.(true);
    } else {
      leaveTimer = setTimeout(() => {
        if (st.hot || st.hold > 0) return;
        if (st.view && st.view !== 'notice') setView('');
      }, 450);
      Island.onHot?.(false);
    }
    refresh();
  }
  window.yurei.on('island-hover', hover);
  window.yurei.on('island-tuck', (v) => { st.tuck = !!v; refresh(); });

  let wheelAt = 0;
  el.addEventListener('wheel', (e) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 5 || performance.now() - wheelAt < 250) return;
    if (st.view && !PANELS.includes(st.view)) return;
    wheelAt = performance.now();
    cycle(d > 0 ? 1 : -1);
  }, { passive: true });

  $('bar').addEventListener('click', (e) => {
    // tocar la carita = hablar con Yurei (sin abrir nada); el resto de la barra abre o cierra el panel
    if (e.target.closest('#ring') && !st.view && Island.onFace) { Island.onFace(); return; }
    if (e.target.closest('button') && e.target.closest('button').id !== 'chev') return;
    if (e.target.closest('#chev')) return;
    if (st.view && st.view !== 'notice') { setView(''); st.hot = false; } else open();
  });
  $('chev').onclick = (e) => { e.stopPropagation(); cycle(1); };
  $('chev').appendChild(window.icon('chevron', 12));
  $('chev').hidden = false;
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  /* ---------- widgets de estado ---------- */
  const widgetData = {};
  const WDEF = {
    weather: { icon: 'cloud', text: () => (widgetData.weather ? `${widgetData.weather.temp}°` : '—'), tip: () => (widgetData.weather ? `${widgetData.weather.desc} · ${widgetData.weather.city}` : 'Clima') },
    cpu: { icon: 'cpu', text: () => (widgetData.cpu != null ? `${widgetData.cpu}%` : '—'), tip: () => 'Procesador' },
    ram: { icon: 'ram', text: () => (widgetData.ram != null ? `${widgetData.ram}%` : '—'), tip: () => 'Memoria' },
    disk: { icon: 'disk', text: () => (widgetData.disk != null ? `${widgetData.disk} GB` : '—'), tip: () => 'Disco libre' },
    net: { icon: 'net', text: () => (widgetData.net ? `↑${fmtSpeed(widgetData.net.up)} ↓${fmtSpeed(widgetData.net.down)}` : '—'), tip: () => 'Red' },
    battery: { custom: true }
  };
  const fmtSpeed = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)}M` : b >= 1e3 ? `${Math.round(b / 1e3)}K` : `${Math.round(b)}B`);

  function chip(id) {
    const d = WDEF[id];
    if (!d) return null;
    if (id === 'battery') {
      const b = widgetData.battery;
      if (!b) return null; // PC de escritorio: sin batería no hay widget
      const n = mk('span', { className: `sw bat${b.charging ? ' charging' : ''}${b.level * 100 <= st.lowBattery ? ' low' : ''}` },
        mk('span', { className: 'glyph' }, mk('i', { style: `width:${Math.round(b.level * 100) * 0.12}px` })),
        mk('span', { textContent: `${Math.round(b.level * 100)}%` }),
        mk('span', { className: 'tip', textContent: b.charging ? 'Cargando' : 'En batería' }));
      return n;
    }
    return mk('span', { className: 'sw' }, window.icon(d.icon, 12), mk('span', { textContent: d.text() }), mk('span', { className: 'tip', textContent: d.tip() }));
  }
  function drawWidgets() {
    $('lwidgets').replaceChildren(...st.widgets.left.map(chip).filter(Boolean));
    $('rwidgets').replaceChildren(...st.widgets.right.map(chip).filter(Boolean));
  }
  function setWidgetData(key, v) { widgetData[key] = v; drawWidgets(); }

  /* ---------- reloj ---------- */
  function tickClock() {
    const d = new Date();
    $('clock').textContent = st.time24
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([ap])\.?\s?m\.?/i, (_m, x) => ` ${x.toUpperCase()}M`);
  }
  const tickAndFit = () => { const n = $('clock').textContent.length; tickClock(); if ($('clock').textContent.length !== n) refresh(); };
  setInterval(tickAndFit, 1000);
  // el texto de estado cambia el ancho natural de la píldora ("Te escucho", "Pensando…")
  new MutationObserver(() => refresh()).observe($('status'), { childList: true, characterData: true, subtree: true });
  tickClock();

  /* ---------- arranque: sube desde arriba, se pega al borde y se estira ---------- */
  function start() {
    // Si la ventana todavía no se ve, el navegador pausa las animaciones: se espera a que aparezca.
    if (document.hidden) { document.addEventListener('visibilitychange', () => start(), { once: true }); return; }
    if (st.started) return;
    st.started = true;
    el.style.top = '-60px';
    sp.y.t = 0;
    sp.w.t = 34; sp.h.t = 34;
    run();
    setTimeout(() => { st.attached = true; el.classList.add('attached'); refresh(); }, 240);
    setTimeout(refresh, 420);
  }

  const api = {
    register, open, close, cycle, notice, pulse, refresh, setView, start, hover, setWidgetData, drawWidgets, updateBubbles,
    get view() { return st.view; }, get state() { return st; },
    hold(on) { st.hold = Math.max(0, st.hold + (on ? 1 : -1)); },
    panels,
    configure(cfg) {
      const prevScale = st.scale;
      st.cfg = cfg;
      st.time24 = !!cfg.time24;
      st.hoverOpen = cfg.hoverOpen !== false;
      st.remember = cfg.notchRememberPanel !== false;
      st.defPanel = cfg.notchDefaultPanel === 'control' ? 'control' : 'calendar';
      st.calendarOn = cfg.calendarEnabled !== false;
      st.controlOn = true;
      st.lowBattery = cfg.lowBattery || 20;
      Island.setTimerConfig?.(cfg);
      if (cfg.notchLastPanel && PANELS.includes(cfg.notchLastPanel)) st.last = cfg.notchLastPanel;
      st.device = cfg.device;
      const onlyHere = (l) => l.filter((w) => w !== 'battery' || cfg.device === 'notebook'); // la batería no existe en una PC de escritorio
      st.widgets = { left: onlyHere(cfg.statusWidgets?.left || ['weather']), right: onlyHere(cfg.statusWidgets?.right || ['battery']) };
      el.classList.toggle('has-update', !!cfg.updatePending);
      tickClock(); drawWidgets(); refresh();
      Island.onMusicConfig?.();
      return prevScale !== st.scale;
    },
    setPhase(phase) { st.phase = phase; el.dataset.phase = phase; ['listening', 'speaking', 'thinking'].forEach((p) => el.classList.toggle(p, p === phase)); refresh(); },
    setTimer(on) { st.timer = !!on; el.classList.toggle('timing', !!on); updateBubbles(); refresh(); },
    setMusic(m) { st.music = m; updateBubbles(); refresh(); },
    setShelfCount(n) { st.shelfCount = n; updateBubbles(); refresh(); },
    setAway(on) { if (st.away !== on) { st.away = on; refresh(); } }
  };
  return api;
})();

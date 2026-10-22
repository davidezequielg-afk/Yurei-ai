// Vista Calendario + temporizador: el mes a la izquierda; a la derecha un reloj de dígitos que giran, con presets.

(() => {
  const mk = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); kids.flat().forEach((k) => k != null && n.append(k)); return n; };
  const PRESETS = [5, 15, 25, 50];
  let host = null;
  const ui = {};
  const cfg = { duration: 1500 };
  let timer = null; // { kind, label, phase, cycle, cycles, paused, finished }
  let left = 0;
  let edit = null; // texto de dígitos mientras se edita
  let weeks = 5;

  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (sec) => `${Math.floor(sec / 60)}:${pad(sec % 60)}`;

  function weeksOfMonth(d = new Date()) {
    const offset = (new Date(d.getFullYear(), d.getMonth(), 1).getDay() + 6) % 7;
    return Math.ceil((offset + new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) / 7);
  }

  function drawMonth() {
    const now = new Date();
    weeks = weeksOfMonth(now);
    ui.title.textContent = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const initials = (LANG === 'en' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['L', 'M', 'X', 'J', 'V', 'S', 'D']);
    const cells = initials.map((d) => mk('b', { textContent: d }));
    for (let i = 0; i < offset; i++) cells.push(mk('span'));
    for (let d = 1; d <= days; d++) cells.push(mk('span', { textContent: d, className: d === now.getDate() ? 'today' : '' }));
    ui.grid.replaceChildren(...cells);
  }

  /* ---------- reloj de dígitos que giran ---------- */
  function setDigits(text) {
    if (ui.shown === text) return;
    const old = ui.shown || '';
    ui.shown = text;
    if (old.length !== text.length) {
      ui.odo.replaceChildren(...[...text].map((ch) => cell(ch)));
      return;
    }
    [...text].forEach((ch, i) => {
      const c = ui.odo.children[i];
      if (c && c.dataset.ch !== ch && ch !== ':') roll(c, ch);
    });
  }
  function cell(ch) {
    const c = mk('span', { className: ch === ':' ? 'od colon' : 'od' });
    c.dataset.ch = ch;
    c.append(mk('i', { textContent: ch }));
    return c;
  }
  function roll(c, ch) {
    // Si todavía giraba un dígito anterior (escribes rápido), se descarta: solo queda el actual saliendo.
    while (c.children.length > 1) c.firstElementChild.remove();
    const prev = c.lastElementChild;
    const next = mk('i', { textContent: ch, className: 'in' });
    prev.classList.add('out');
    c.dataset.ch = ch;
    c.append(next);
    setTimeout(() => { if (prev.isConnected) prev.remove(); next.classList.remove('in'); }, 420);
  }

  /* ---------- estado → pantalla ---------- */
  function mode() {
    if (!timer) return 'idle';
    if (timer.finished) return 'done';
    return timer.paused ? 'paused' : 'running';
  }

  function render() {
    if (!host) return;
    const m = mode();
    host.dataset.tmode = m;
    let secs;
    if (edit !== null) {
      const d = edit.padStart(4, '0').slice(-4);
      setDigits(`${d.slice(0, 2)}:${d.slice(2)}`);
      ui.clock.classList.toggle('bad', !validEdit());
    } else {
      secs = m === 'idle' ? cfg.duration : Math.ceil(left / 1000);
      setDigits(fmt(secs));
      ui.clock.classList.remove('bad');
    }
    ui.clock.classList.toggle('editing', edit !== null);
    ui.line.textContent = edit !== null ? t('Escribe los números y pulsa Enter')
      : m === 'idle' ? t('Toca el reloj para editarlo')
        : m === 'done' ? t('Se acabó el tiempo')
          : `${timer.kind === 'pomodoro' ? `Pomodoro ${timer.cycle}/${timer.cycles} · ${timer.phase === 'break' ? t('descanso') : t('foco')} · ` : ''}${m === 'paused' ? t('En pausa') + ' · ' : ''}${t('termina')} ${new Date(Date.now() + left).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    ui.main.textContent = m === 'idle' ? t('Iniciar') : m === 'running' ? t('Pausar') : m === 'paused' ? t('Reanudar') : t('Reiniciar');
    ui.reset.hidden = m === 'idle';
    ui.presets.forEach((b) => b.classList.toggle('on', m === 'idle' && Number(b.dataset.min) * 60 === cfg.duration));
    ui.bell.hidden = m !== 'done';
  }

  function editSeconds() {
    const d = (edit || '').padStart(4, '0').slice(-4);
    return Number(d.slice(0, 2)) * 60 + Number(d.slice(2));
  }
  const validEdit = () => { const d = (edit || '').padStart(4, '0').slice(-4); return Number(d.slice(2)) < 60 && editSeconds() > 0 && editSeconds() <= 180 * 60; };

  async function start(seconds) {
    const r = await window.yurei.timerStart(seconds / 60, 'Temporizador');
    if (r.ok) { cfg.duration = seconds; }
  }

  async function mainAction() {
    const m = mode();
    if (edit !== null) { commitEdit(); return; }
    if (m === 'idle') await start(cfg.duration);
    else if (m === 'running') await window.yurei.timerPause();
    else if (m === 'paused') await window.yurei.timerResume();
    else if (m === 'done') await start(cfg.duration);
  }

  function commitEdit() {
    if (edit === null) return;
    if (validEdit()) { cfg.duration = editSeconds(); window.yurei.saveSettings({ timerDuration: cfg.duration }); edit = null; render(); } else { ui.clock.classList.add('shake'); setTimeout(() => ui.clock.classList.remove('shake'), 400); }
  }

  function build(el) {
    host = el;
    ui.title = mk('div', { className: 'calTitle' });
    ui.grid = mk('div', { className: 'calGrid' });
    ui.odo = mk('div', { className: 'odo-row' });
    ui.clock = mk('button', { className: 'clockbtn', type: 'button', tabIndex: 0 }, ui.odo);
    ui.line = mk('div', { className: 'tline' });
    ui.main = mk('button', { className: 'pillbtn', type: 'button' });
    ui.reset = mk('button', { className: 'roundbtn', type: 'button', title: 'Reiniciar' }, window.icon('restart', 14));
    ui.bell = mk('span', { className: 'bell' }, window.icon('bell', 14));
    ui.presets = PRESETS.map((m) => { const b = mk('button', { type: 'button', className: 'preset', textContent: `${m}m` }); b.dataset.min = m; b.onclick = () => { if (mode() === 'idle') { cfg.duration = m * 60; edit = null; window.yurei.saveSettings({ timerDuration: cfg.duration }); render(); } }; return b; });
    ui.main.onclick = mainAction;
    ui.reset.onclick = async () => { await window.yurei.timerCancel(); edit = null; };
    ui.clock.onclick = () => { if (mode() === 'idle' && edit === null) { edit = ''; Island.hold(true); render(); ui.clock.focus(); } };
    ui.clock.onkeydown = (e) => {
      if (edit === null) return;
      if (/^\d$/.test(e.key)) { edit = (edit + e.key).slice(-4); e.preventDefault(); render(); } else if (e.key === 'Backspace') { edit = edit.slice(0, -1); e.preventDefault(); render(); } else if (e.key === 'Enter') { e.preventDefault(); commitEdit(); if (edit === null) Island.hold(false); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); edit = null; Island.hold(false); render(); }
    };
    ui.clock.onblur = () => { if (edit !== null) { edit = null; Island.hold(false); render(); } };
    el.append(
      mk('div', { className: 'calbox' }, ui.title, ui.grid),
      mk('div', { className: 'tbox' }, mk('div', { className: 'tline-row' }, ui.bell, ui.line), ui.clock,
        mk('div', { className: 'tctl' }, ui.main, ui.reset), mk('div', { className: 'presets' }, ...ui.presets)));
    drawMonth();
    render();
  }

  Island.register('calendar', {
    build,
    size: () => ({ w: 480, h: weeks === 6 ? 269 : 237, r: 28 }),
    enter() { drawMonth(); render(); Island.refresh(); },
    leave() { if (edit !== null) { edit = null; Island.hold(false); } }
  });

  // El temporizador lo lleva el proceso principal; aquí solo se dibuja.
  Island.timerTick = (t, secsLeft) => { timer = t; left = secsLeft || 0; if (edit === null) render(); };
  Island.onTimerGone = () => { timer = null; render(); };
  Island.setTimerConfig = (c) => { if (c.timerDuration) cfg.duration = c.timerDuration; };
})();

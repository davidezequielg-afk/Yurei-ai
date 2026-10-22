// Indicador vertical de volumen o brillo. Arrastrar o rueda del mouse cambia el nivel; en volumen, el ícono silencia
// y el porcentaje abre el mezclador por aplicación.
(() => {
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const H = 230;
  let kind = 'volume';
  let level = 0;
  let muted = false;
  let mixOpen = false;
  let sendTimer = null;
  let mixTimer = null;

  const ICON = (k, v, m) => (k === 'brightness' ? 'brightness' : m || v === 0 ? 'mute' : 'volume');

  function draw() {
    $('fill').style.height = `${muted && kind === 'volume' ? 0 : level}%`;
    $('pct').textContent = muted && kind === 'volume' ? '—' : `${Math.round(level)}%`;
    $('ico').replaceChildren(window.icon(ICON(kind, level, muted), 20));
    body.classList.toggle('volume', kind === 'volume');
  }

  function resize() { window.yureiHud.size(mixOpen ? 52 + 8 + 200 + 12 : 64, H + 12); }

  function setLevel(v, send = true) {
    level = Math.max(0, Math.min(100, Math.round(v)));
    if (muted && kind === 'volume' && level > 0) { muted = false; window.yureiHud.mute(false); }
    draw();
    if (send) { clearTimeout(sendTimer); sendTimer = setTimeout(() => window.yureiHud.set(kind, level), 40); }
  }

  const fromPointer = (e) => { const r = $('track').getBoundingClientRect(); return (1 - (e.clientY - r.top) / r.height) * 100; };
  $('track').addEventListener('pointerdown', (e) => {
    $('track').setPointerCapture(e.pointerId);
    body.classList.add('drag');
    window.yureiHud.busy(kind, true);
    setLevel(fromPointer(e));
    const move = (ev) => setLevel(fromPointer(ev));
    const up = () => { $('track').removeEventListener('pointermove', move); $('track').removeEventListener('pointerup', up); body.classList.remove('drag'); window.yureiHud.busy(kind, false); };
    $('track').addEventListener('pointermove', move);
    $('track').addEventListener('pointerup', up);
  });
  document.addEventListener('wheel', (e) => { e.preventDefault(); setLevel(level + (e.deltaY < 0 ? 4 : -4)); }, { passive: false });

  $('ico').onclick = () => { if (kind !== 'volume') return; muted = !muted; draw(); window.yureiHud.mute(muted); };
  $('pct').onclick = () => { if (kind === 'volume') toggleMixer(); };
  $('pct').style.cursor = 'pointer';

  function toggleMixer(force) {
    mixOpen = force ?? !mixOpen;
    $('mix').hidden = !mixOpen;
    resize();
    clearInterval(mixTimer);
    if (mixOpen) { loadMixer(); mixTimer = setInterval(() => { if (!body.classList.contains('drag')) loadMixer(); }, 2500); }
  }

  async function loadMixer() {
    const r = await window.yureiHud.mixerList();
    const box = $('mix');
    if (!r.ok) { box.replaceChildren(Object.assign(document.createElement('div'), { className: 'mempty', textContent: r.error || '' })); return; }
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // no mover lo que se está arrastrando
    const apps = r.data.apps || [];
    box.replaceChildren(...(apps.length ? apps.map((a) => {
      const row = document.createElement('div'); row.className = 'mrow';
      const name = document.createElement('div'); name.className = 'mname';
      const label = document.createElement('span'); label.textContent = a.name;
      const mute = document.createElement('button'); mute.type = 'button'; mute.append(window.icon(a.muted ? 'mute' : 'volume', 14));
      mute.onclick = () => { a.muted = !a.muted; mute.replaceChildren(window.icon(a.muted ? 'mute' : 'volume', 14)); window.yureiHud.mixerMute(a.pid, a.muted); };
      name.append(label, mute);
      const rng = document.createElement('input'); rng.type = 'range'; rng.min = 0; rng.max = 100; rng.value = a.volume;
      rng.oninput = () => window.yureiHud.mixerSet(a.pid, Number(rng.value));
      row.append(name, rng);
      return row;
    }) : [Object.assign(document.createElement('div'), { className: 'mempty', textContent: 'Nada suena ahora' })]));
  }

  window.yureiHud.onShow((s) => {
    if (s.hide) { body.classList.remove('on'); toggleMixer(false); return; }
    if (kind !== s.kind) { kind = s.kind; toggleMixer(false); }
    body.classList.toggle('right', s.side === 'right');
    if (!body.classList.contains('drag')) { level = s.level; muted = !!s.muted; draw(); }
    resize();
    requestAnimationFrame(() => body.classList.add('on'));
  });

  function applyAppearance(a) {
    if (!a?.vars) return;
    const v = a.vars;
    const r = document.documentElement.style;
    if (v['--bg']) r.setProperty('--bg', v['--bg']);
    if (v['--ink']) r.setProperty('--ink', v['--ink']);
    if (v['--accent']) r.setProperty('--accent', v['--accent']);
  }
  window.yureiHud.getAppearance().then((r) => r.ok && applyAppearance(r.data));
  window.yureiHud.onAppearance(applyAppearance);
  draw();
})();

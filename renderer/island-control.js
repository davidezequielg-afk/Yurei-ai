// Vista Centro de control: Wi-Fi, Dock, Bluetooth, Isla; botones de acceso; volumen y brillo. Con paneles de Wi-Fi y Bluetooth.

(() => {
  const mk = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); kids.flat().forEach((k) => k != null && n.append(k)); return n; };
  const MODES = ['fixed', 'smart', 'peek'];
  const MODE_LABEL = { fixed: 'Fijo', smart: 'Inteligente', peek: 'Asomar' };
  let host = null;
  let sub = ''; // '' | wifi | bt
  let poll = null;
  const S = { radios: { wifi: { present: false, on: false }, bluetooth: { present: false, on: false } }, ssid: '', bt: [], settings: {}, vol: null, bright: null, nets: [], scanning: false, open: '', msg: '' };
  const ui = {};

  const cfg = () => (window.__cfg || {});
  const save = (patch) => { Object.assign(S.settings, patch); window.yurei.saveSettings(patch); };

  /* ---------- piezas ---------- */
  function slider(icon, label, onInput, onCommit) {
    const fill = mk('i');
    const track = mk('div', { className: 'strack' }, fill);
    const pct = mk('span', { className: 'spct', textContent: '—' });
    const row = mk('div', { className: 'srow' }, mk('span', { className: 'slabel' }, window.icon(icon, 13), mk('span', { textContent: label })), track, pct);
    let drag = false;
    const set = (clientX, commit) => {
      const b = track.getBoundingClientRect();
      const v = Math.max(0, Math.min(100, Math.round(((clientX - b.left) / b.width) * 100)));
      api.value(v);
      onInput?.(v);
      if (commit) onCommit?.(v);
    };
    track.onpointerdown = (e) => { if (row.classList.contains('off')) return; drag = true; track.setPointerCapture(e.pointerId); set(e.clientX); Island.hold(true); };
    track.onpointermove = (e) => { if (drag) set(e.clientX); };
    track.onpointerup = (e) => { if (!drag) return; drag = false; set(e.clientX, true); Island.hold(false); };
    const api = { row, get dragging() { return drag; }, value(v) { fill.style.width = `${v}%`; pct.textContent = v == null ? '—' : `${v}%`; }, off(msg) { row.classList.toggle('off', !!msg); row.title = msg || ''; } };
    return api;
  }

  function tile(icon, title, onClick, onMore) {
    const status = mk('span', { className: 't-s' });
    const name = mk('span', { className: 't-t', textContent: title });
    const ic = mk('span', { className: 't-i' }, window.icon(icon, 14));
    const more = onMore ? mk('button', { className: 't-more', type: 'button', title: 'Opciones' }, window.icon('chevron', 12)) : null;
    const el = mk('div', { className: 'tile', role: 'button', tabIndex: 0 }, ic, mk('span', { className: 't-txt' }, name, status), more);
    el.onclick = (e) => { if (e.target.closest('.t-more')) return; onClick(); };
    if (more) { more.onclick = (e) => { e.stopPropagation(); onMore(); }; el.oncontextmenu = (e) => { e.preventDefault(); onMore(); }; }
    return { el, set(s, on) { status.textContent = s; el.classList.toggle('active', !!on); } };
  }

  function round(icon, title, onClick) {
    const b = mk('button', { className: 'rbtn', type: 'button', title }, window.icon(icon, 15));
    b.onclick = onClick;
    return b;
  }

  /* ---------- datos ---------- */
  async function load() {
    const [radios, wifi, st, vol, bright] = await Promise.all([
      window.yurei.radioGet(), window.yurei.wifiStatus(), window.yurei.getSettings(), window.yurei.widgetData('volume'), window.yurei.brightnessGet()
    ]);
    if (radios.ok) S.radios = radios.data;
    if (wifi.ok) S.ssid = wifi.data.ssid || '';
    if (st.ok) { S.settings = st.data; window.__cfg = st.data; }
    if (vol.ok && !ui.vol.dragging) { S.vol = vol.data.volume; }
    if (bright.ok) S.bright = bright.data;
    draw();
  }

  function draw() {
    if (!host) return;
    const R = S.radios;
    const w = R.wifi;
    ui.wifi.set(!w.present ? t('No disponible') : !w.on ? t('Apagado') : S.ssid || t('Sin conexión'), w.present && w.on);
    const b = R.bluetooth;
    const conn = S.bt.filter((d) => d.connected).map((d) => d.name);
    ui.bt.set(!b.present ? t('No disponible') : !b.on ? t('Apagado') : conn.length ? conn.join(', ') : t('Encendido'), b.present && b.on);
    const dm = S.settings.dockEnabled ? S.settings.dockMode || 'smart' : 'off';
    ui.dock.set(dm === 'off' ? t('Apagado') : t(MODE_LABEL[dm]), dm === 'fixed');
    const nm = S.settings.notchMode || 'fixed';
    ui.notch.set(t(MODE_LABEL[nm]), nm === 'fixed');
    ui.dnd.classList.toggle('active', !!S.settings.dnd);
    // Lo exclusivo de notebook (ahorro de energía y brillo) no se muestra en una PC de escritorio.
    const nb = S.settings.device === 'notebook';
    ui.energy.hidden = !nb;
    ui.bright.row.hidden = !nb;
    if (S.vol != null && !ui.vol.dragging) ui.vol.value(S.vol);
    if (S.bright?.available && !ui.bright.dragging) { ui.bright.off(''); ui.bright.value(S.bright.level); } else ui.bright.off(t('Esta pantalla no permite cambiar el brillo'));
  }

  /* ---------- acciones ---------- */
  async function toggleRadio(kind) {
    const r = S.radios[kind];
    if (!r.present) return;
    r.on = !r.on; draw();
    const res = await window.yurei.radioSet(kind, r.on);
    if (res.ok) S.radios = res.data; else { r.on = !r.on; flash(res.error); }
    draw();
    if (kind === 'wifi' && r.on) setTimeout(load, 2500);
  }
  function flash(text) { S.msg = text; ui.msg.textContent = text; ui.msg.classList.add('on'); clearTimeout(flash.t); flash.t = setTimeout(() => ui.msg.classList.remove('on'), 3500); }

  const cycleDock = () => {
    const cur = S.settings.dockEnabled ? S.settings.dockMode || 'smart' : 'off';
    const next = { off: 'fixed', fixed: 'smart', smart: 'peek', peek: 'off' }[cur];
    save(next === 'off' ? { dockEnabled: false } : { dockEnabled: true, dockMode: next });
    draw();
  };
  const cycleNotch = () => { save({ notchMode: MODES[(MODES.indexOf(S.settings.notchMode || 'fixed') + 1) % 3] }); draw(); };

  /* ---------- paneles ---------- */
  function showSub(name) {
    sub = name;
    host.dataset.sub = name;
    if (name === 'wifi') { renderWifi(); scan(); }
    if (name === 'bt') { renderBt(); loadBt(); }
    Island.refresh();
  }

  async function scan() {
    S.scanning = true; renderWifi();
    const r = await window.yurei.wifiScan();
    S.scanning = false;
    S.nets = r.ok ? r.data : [];
    if (!r.ok) S.msg = r.error;
    renderWifi();
  }

  function header(title, on, present, onSwitch, onRescan) {
    const sw = mk('button', { className: 'switch', role: 'switch', type: 'button' });
    sw.setAttribute('aria-checked', String(!!on));
    sw.disabled = !present;
    sw.onclick = onSwitch;
    return mk('div', { className: 'sh' }, mk('button', { className: 'rbtn small', type: 'button', title: 'Volver', onclick: () => showSub('') }, window.icon('back', 14)), mk('span', { className: 'sh-t', textContent: title }), mk('span', { className: 'sp' }), sw, onRescan ? mk('button', { className: 'rbtn small', type: 'button', title: 'Buscar de nuevo', onclick: onRescan }, window.icon('refresh', 13)) : null);
  }

  function renderWifi() {
    const w = S.radios.wifi;
    const list = mk('div', { className: 'nlist' });
    if (!w.present) list.append(mk('div', { className: 'empty', textContent: t('Este equipo no tiene Wi-Fi') }));
    else if (!w.on) list.append(mk('div', { className: 'empty', textContent: t('El Wi-Fi está apagado') }));
    else if (S.scanning && !S.nets.length) list.append(mk('div', { className: 'empty', textContent: t('Buscando redes…') }));
    else if (!S.nets.length) list.append(mk('div', { className: 'empty', textContent: S.msg || t('No encontré redes') }));
    S.nets.slice(0, 12).forEach((n) => list.append(netRow(n)));
    ui.sub.replaceChildren(header('Wi-Fi', w.on, w.present, () => toggleRadio('wifi').then(() => setTimeout(scan, 1500)), scan), list);
  }

  function bars(sig) { return mk('span', { className: 'sig' }, ...[25, 50, 75, 100].map((th) => mk('i', { className: sig >= th - 12 ? 'on' : '' }))); }

  function netRow(n) {
    const open = S.open === n.ssid;
    const sub = n.connected ? t('Conectada') : n.saved ? t('Guardada') : n.secured ? '' : t('Abierta');
    const row = mk('div', { className: `nrow${open ? ' open' : ''}${n.connected ? ' conn' : ''}` });
    const head = mk('div', { className: 'nhead' }, bars(n.signal), mk('span', { className: 'nname' }, mk('span', { textContent: n.ssid }), sub ? mk('small', { textContent: sub }) : null), n.secured ? window.icon('lock', 12) : null);
    head.onclick = () => { S.open = open ? '' : n.ssid; renderWifi(); };
    row.append(head);
    if (open) {
      const body = mk('div', { className: 'nbody' });
      if (n.enterprise) {
        body.append(mk('div', { className: 'note', textContent: t('Esta red es de empresa: conéctate desde Ajustes de Windows.') }), mk('button', { className: 'btn2', type: 'button', textContent: t('Abrir Ajustes de Windows'), onclick: () => window.yurei.sysOpen('wifi') }));
      } else if (n.connected) {
        body.append(mk('button', { className: 'btn2', type: 'button', textContent: t('Desconectar'), onclick: async () => { await window.yurei.wifiDisconnect(); setTimeout(() => { load(); scan(); }, 1200); } }), mk('button', { className: 'btn2 danger', type: 'button', textContent: t('Olvidar'), onclick: async () => { await window.yurei.wifiForget(n.ssid); scan(); } }));
      } else {
        const pw = mk('input', { type: 'password', placeholder: t('Clave de la red'), autocomplete: 'off', spellcheck: false });
        pw.onfocus = () => { Island.hold(true); window.yurei.islandFocus(); };
        pw.onblur = () => Island.hold(false);
        const go = async () => {
          if (n.secured && !n.saved && pw.value.length < 8) { flash(t('La clave debe tener al menos 8 caracteres')); return; }
          connectBtn.disabled = true; connectBtn.textContent = t('Conectando…');
          const r = await window.yurei.wifiConnect({ ssid: n.ssid, password: pw.value, secured: n.secured, wpa3: n.wpa3 });
          if (!r.ok) { flash(r.error); connectBtn.disabled = false; connectBtn.textContent = t('Conectar'); return; }
          setTimeout(() => { load(); scan(); }, 2500);
        };
        const connectBtn = mk('button', { className: 'btn2 primary', type: 'button', textContent: t('Conectar'), onclick: go });
        pw.onkeydown = (e) => { if (e.key === 'Enter') go(); };
        if (n.secured && !n.saved) body.append(pw);
        body.append(connectBtn);
        if (n.saved) body.append(mk('button', { className: 'btn2 danger', type: 'button', textContent: t('Olvidar'), onclick: async () => { await window.yurei.wifiForget(n.ssid); scan(); } }));
      }
      row.append(body);
    }
    return row;
  }

  async function loadBt() { const r = await window.yurei.btList(); S.bt = r.ok ? r.data.devices || [] : []; if (!r.ok) S.msg = r.error; renderBt(); draw(); }
  function renderBt() {
    const b = S.radios.bluetooth;
    const list = mk('div', { className: 'nlist' });
    if (!b.present) list.append(mk('div', { className: 'empty', textContent: t('Este equipo no tiene Bluetooth') }));
    else if (!b.on) list.append(mk('div', { className: 'empty', textContent: t('El Bluetooth está apagado') }));
    else if (!S.bt.length) list.append(mk('div', { className: 'empty', textContent: t('No hay dispositivos emparejados') }));
    S.bt.forEach((d) => list.append(mk('div', { className: `nrow${d.connected ? ' conn' : ''}` }, mk('div', { className: 'nhead' }, window.icon('bluetooth', 14), mk('span', { className: 'nname' }, mk('span', { textContent: d.name }), mk('small', { textContent: d.connected ? `${t('Conectado')}${d.battery != null ? ` · ${d.battery}%` : ''}` : t('Emparejado') }))))));
    if (b.present) list.append(mk('button', { className: 'btn2 wide', type: 'button', textContent: t('Añadir o administrar dispositivos…'), onclick: () => window.yurei.sysOpen('bluetooth') }));
    ui.sub.replaceChildren(header('Bluetooth', b.on, b.present, () => toggleRadio('bluetooth').then(() => setTimeout(loadBt, 1500)), loadBt), list);
  }

  /* ---------- armado ---------- */
  function build(el) {
    host = el;
    ui.wifi = tile('wifi', 'Wi-Fi', () => toggleRadio('wifi'), () => showSub('wifi'));
    ui.dock = tile('grid', 'Dock', cycleDock);
    ui.bt = tile('bluetooth', 'Bluetooth', () => toggleRadio('bluetooth'), () => showSub('bt'));
    ui.notch = tile('chevron', 'Isla', cycleNotch);
    ui.dnd = round('moon2', 'No molestar', () => { save({ dnd: !S.settings.dnd }); draw(); });
    const energy = round('battery', 'Ahorro de energía', () => window.yurei.sysOpen('batterysaver'));
    const row = mk('div', { className: 'rrow' }, ui.dnd, energy, round('bell', 'Centro de notificaciones', () => window.yurei.sysCombo('notifications')), round('tray', 'Bandeja del sistema', () => window.yurei.sysCombo('tray')),
      round('settings', 'Ajustes de Yurei', () => window.yurei.openSettings()), round('restart', 'Reiniciar Yurei', () => window.yurei.appRestart()));
    ui.energy = energy;
    ui.vol = slider('volume', 'Volumen', null, (v) => window.yurei.widgetAction('volume', { level: v }));
    ui.bright = slider('brightness', 'Brillo', null, (v) => window.yurei.brightnessSet(v).then((r) => { if (!r.ok) flash(r.error); }));
    ui.msg = mk('div', { className: 'cmsg' });
    ui.main = mk('div', { className: 'cmain' }, mk('div', { className: 'tgrid' }, ui.wifi.el, ui.dock.el, ui.bt.el, ui.notch.el), row, mk('div', { className: 'sliders' }, ui.vol.row, ui.bright.row));
    ui.sub = mk('div', { className: 'csub' });
    el.append(ui.main, ui.sub, ui.msg);
  }

  Island.register('control', {
    build,
    size: () => { const nb = S.settings.device === 'notebook'; return sub ? { w: 350, h: 264 } : { w: 350, h: nb ? 194 : 160 }; },
    enter() { sub = ''; host.dataset.sub = ''; load(); poll = setInterval(() => { if (!sub) load(); }, 4000); },
    leave() { clearInterval(poll); poll = null; sub = ''; if (host) host.dataset.sub = ''; S.open = ''; }
  });
  Island.reloadControl = load;
})();

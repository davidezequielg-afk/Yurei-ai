const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, globalShortcut, ipcMain, screen, clipboard, shell, desktopCapturer, Notification, nativeTheme, nativeImage, systemPreferences, dialog, safeStorage, session, Tray, Menu } = require('electron');
const { createStore } = require('./src/store');
const { createSystem } = require('./src/system');
const { createTools } = require('./src/tools');
const { createAssistant } = require('./src/assistant');
const { createScheduler } = require('./src/scheduler');
const { createFocus } = require('./src/focus');
const { createUpdater } = require('./src/updater');
const { generate } = require('./src/gemini');
const { createUsage } = require('./src/usage');
const { spawn } = require('child_process');
const { createTtsCache } = require('./src/ttscache');
const { resolveAppearance } = require('./src/theme');
const L = require('./src/launcher');
const S = require('./src/secure');
const { createWeather, nextSchedule, unavailableWidgets, sanitizeLayout, catalogFor } = require('./src/widgets');

const MODES = { idle: [120, 22], status: [260, 60], peek: [567, 132] };
const HOTKEYS = { talk: 'Control+Shift+Space', dictate: 'Control+Alt+D', circle: 'Control+Shift+C' };
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const POWER_TEXT = { shutdown: ['apagar', 'Apagar'], restart: ['reiniciar', 'Reiniciar'], sleep: ['suspender', 'Suspender'] };

// Todas las ventanas usan aislamiento, sin Node, en sandbox y con las herramientas de desarrollo apagadas.
if (!process.argv.includes('--no-sandbox')) app.enableSandbox(); // las ventanas ya llevan sandbox:true; esto lo extiende a todos los procesos (--no-sandbox solo se usa en pruebas como administrador)
app.setAppUserModelId('com.yurei.assistant');

const RENDERER_DIR = path.join(__dirname, 'renderer');
const trustedUrl = (url) => S.isTrustedUrl(url, RENDERER_DIR);
const webPrefs = (preload = 'preload.js') => ({
  preload: path.join(__dirname, preload),
  contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
  webviewTag: false, spellcheck: false, navigateOnDragDrop: false, devTools: !!process.env.YUREI_DEBUG
});

let win = null;
let overlay = null;
let settingsWin = null;
let pickerWin = null;
let system = null;
let finishCircle = null;
let tray = null;

// Nada puede abrir ventanas nuevas, navegar fuera de las páginas locales ni incrustar <webview>.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (e, url) => { if (!trustedUrl(url)) e.preventDefault(); });
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

// Icono de la bandeja del sistema: un círculo azul dibujado aquí mismo (sin archivos de imagen).
function trayIcon() {
  const size = 32;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      const a = Math.max(0, Math.min(1, 13 - d + 0.5)); // borde suave
      const i = (y * size + x) * 4;
      px[i] = 0xf0 - Math.round(d * 4); px[i + 1] = 0xb8 - Math.round(d * 3); px[i + 2] = 0x6c; px[i + 3] = Math.round(a * 255); // BGRA
    }
  }
  return nativeImage.createFromBitmap(px, { width: size, height: size, scaleFactor: 2 });
}

// Sin esto la app no tendría forma de cerrarse: la isla es solo un notch.
function createTray() {
  try {
    tray = new Tray(trayIcon());
    tray.setToolTip('Yurei');
    refreshTray();
    tray.on('click', () => openSettings());
  } catch (e) {
    console.warn('No se pudo crear el icono de la bandeja:', e.message);
  }
}

let trayState = { dnd: false, setDnd: () => {} };
function refreshTray() {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: 'No molestar', type: 'checkbox', checked: trayState.dnd, click: (i) => trayState.setDnd(i.checked) },
    { label: 'Ajustes', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Salir de Yurei', click: () => app.quit() }
  ]));
}

function placeIsland(mode) {
  const [w, h] = MODES[mode] || MODES.idle;
  const { x, y, width } = screen.getPrimaryDisplay().workArea;
  win.setBounds({ x: Math.round(x + (width - w) / 2), y, width: w, height: h });
}

function createWindow() {
  win = new BrowserWindow({
    width: MODES.idle[0], height: MODES.idle[1],
    frame: false, transparent: true, resizable: false, alwaysOnTop: true,
    skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: webPrefs()
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(RENDERER_DIR, 'index.html'));
  win.once('ready-to-show', () => { placeIsland('idle'); win.showInactive(); });
}

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({ width: 460, height: 720, title: 'Yurei · Ajustes', autoHideMenuBar: true, backgroundColor: '#101114', webPreferences: webPrefs() });
  settingsWin.loadFile(path.join(RENDERER_DIR, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function openPicker(slot) {
  if (pickerWin) pickerWin.close();
  pickerWin = new BrowserWindow({ width: 400, height: 560, title: 'Yurei · Elegir app', autoHideMenuBar: true, backgroundColor: '#101114', webPreferences: webPrefs() });
  pickerWin.loadFile(path.join(RENDERER_DIR, 'picker.html'), { query: { slot: String(slot) } });
  pickerWin.on('closed', () => { pickerWin = null; });
}

async function startCircle() {
  if (overlay) return;
  const display = screen.getPrimaryDisplay();
  const size = { width: display.size.width * display.scaleFactor, height: display.size.height * display.scaleFactor };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const shot = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  if (!shot) return;

  overlay = new BrowserWindow({
    x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height,
    frame: false, transparent: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, fullscreen: true,
    webPreferences: webPrefs('preload-overlay.js') // puente propio y mínimo: solo enviar el recuadro o cancelar
  });
  overlay.loadFile(path.join(RENDERER_DIR, 'overlay.html'));
  overlay.webContents.once('did-finish-load', () => overlay.webContents.send('overlay:image', shot.thumbnail.toDataURL()));
  overlay.on('closed', () => { overlay = null; finishCircle = null; });

  finishCircle = (rect) => {
    finishCircle = null;
    const k = display.scaleFactor;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || 0));
    let dataUrl = null;
    if (rect && [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) && rect.w > 8 && rect.h > 8) {
      const x = clamp(rect.x * k, 0, size.width - 1);
      const y = clamp(rect.y * k, 0, size.height - 1);
      dataUrl = shot.thumbnail.crop({ x, y, width: clamp(rect.w * k, 1, size.width - x), height: clamp(rect.h * k, 1, size.height - y) }).toDataURL();
    }
    overlay?.close();
    if (dataUrl) win?.webContents.send('circle-image', dataUrl.split(',')[1]);
  };
}

// Solo la ventana del recuadro puede responder (no cualquier ventana).
const fromOverlay = (e) => !!overlay && e.sender === overlay.webContents && trustedUrl(e.senderFrame?.url);
ipcMain.on('overlay:select', (e, rect) => { if (fromOverlay(e)) finishCircle?.(rect); });
ipcMain.on('overlay:cancel', (e) => { if (fromOverlay(e)) finishCircle?.(null); });

// Solo las páginas locales de la app pueden usar el puente; las respuestas siempre son { ok, data | error }.
function handle(channel, fn) {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!trustedUrl(e.senderFrame?.url)) return { ok: false, error: 'No autorizado' };
    try { return { ok: true, data: await fn(e, ...args) }; } catch (err) { return { ok: false, error: err.message }; }
  });
}

function hardenSession() {
  const ses = session.defaultSession;
  ses.setSpellCheckerEnabled?.(false); // el corrector descargaría diccionarios de internet
  // Único permiso: el micrófono, solo para las páginas de la app. Nada de cámara, ubicación, notificaciones, USB…
  ses.setPermissionRequestHandler((wc, permission, cb, details) => cb(permission === 'media' && trustedUrl(wc.getURL()) && (details?.mediaTypes || ['audio']).every((t) => t === 'audio')));
  ses.setPermissionCheckHandler((wc, permission, _origin, details) => permission === 'media' && !!wc && trustedUrl(wc.getURL()) && details?.mediaType !== 'video');
  ses.setDevicePermissionHandler(() => false);
  // Las ventanas no hacen NINGUNA petición de red (todo sale desde el proceso principal, a destinos fijos).
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] }, (_details, cb) => cb({ cancel: true }));
}

function start() {
  hardenSession();

  // La API key se guarda cifrada con el almacén seguro del sistema (DPAPI en Windows). Si no hay, se avisa en Ajustes.
  const keyring = safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
  const secret = keyring
    ? { encrypt: (s) => safeStorage.encryptString(s).toString('base64'), decrypt: (b) => safeStorage.decryptString(Buffer.from(b, 'base64')) }
    : null;
  const userData = app.getPath('userData');
  const store = createStore(path.join(userData, 'yurei.json'), { secret });

  // Apagar, reiniciar o suspender: confirmación en un cuadro del sistema. La IA no puede pulsarlo.
  const confirmPower = async (action) => {
    const [verb, label] = POWER_TEXT[action] || [];
    if (!verb) return false;
    const r = await dialog.showMessageBox({ type: 'warning', buttons: ['Cancelar', label], defaultId: 0, cancelId: 0, noLink: true, title: 'Yurei', message: `Yurei quiere ${verb} el equipo`, detail: 'Si no lo pediste tú, pulsa Cancelar.' });
    return r.response === 1;
  };
  system = createSystem({ shell, clipboard, dataDir: userData, confirm: confirmPower });
  // Temporizador / pomodoro: el notch dibuja el anillo y avisa en voz alta al terminar.
  const focus = createFocus({
    onChange: (t) => win?.webContents.send('timer', t),
    onDone: ({ finished, next }) => {
      const title = finished.kind === 'pomodoro'
        ? (next ? (next.phase === 'break' ? 'Hora de un descanso' : '¡A concentrarse otra vez!') : '¡Pomodoro completo!')
        : `Terminó: ${finished.label}`;
      new Notification({ title: `Yurei · ${title}`, silent: true }).show();
      win?.webContents.send('timer-done', { finished, next });
    }
  });
  const tools = createTools({ store, system, focus });
  const assistant = createAssistant({ store, tools });
  const weather = createWeather({ persist: { load: () => store.get('weatherCache'), save: (c) => store.set('weatherCache', c) } });
  const ttsCache = createTtsCache(path.join(userData, 'tts-cache'), { maxEntries: 60 }); // solo frases de relleno, nunca lo que dices
  const iconCache = createTtsCache(path.join(userData, 'icon-cache'), { maxEntries: 300 });
  const scheduler = createScheduler({
    store, tools,
    report: (r) => {
      if (store.get('settings').dnd) return; // no molestar: la rutina se ejecuta igual, pero sin avisos
      new Notification({ title: `Yurei · ${r.label}`, body: r.results.join('\n') }).show();
      win?.webContents.send('report', r);
    }
  });

  const unavailable = () => unavailableWidgets({ hasBattery: system.hasBattery(), hasMedia: system.hasMediaControl() });
  const settingsView = () => ({
    ...store.get('settings'),
    apiKey: store.get('settings').apiKey ? S.MASK : '', // la clave nunca sale del proceso principal
    keyEncrypted: store.encrypted(),
    launcher: L.normalizeLauncher(store.get('settings').launcher),
    widgets: sanitizeLayout(store.get('settings').widgets, unavailable()),
    widgetCatalog: catalogFor(unavailable())
  });

  // --- apariencia: tema, color y transparencia (propios o del sistema) ---
  let sysTransparency = null;
  const currentAppearance = () => {
    let accent = null;
    try { accent = systemPreferences.getAccentColor(); } catch { /* solo Windows y macOS */ }
    return resolveAppearance(store.get('settings'), { dark: nativeTheme.shouldUseDarkColors, accent, transparency: sysTransparency });
  };
  const broadcastAppearance = () => {
    const a = currentAppearance();
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('appearance', a);
  };
  nativeTheme.on('updated', broadcastAppearance);
  systemPreferences.on?.('accent-color-changed', broadcastAppearance);
  const pollTransparency = async () => {
    const t = await system.systemTransparency();
    if (t !== sysTransparency) { sysTransparency = t; broadcastAppearance(); }
  };
  pollTransparency();
  setInterval(pollTransparency, 10000);
  handle('appearance:get', () => currentAppearance());

  trayState = {
    dnd: !!store.get('settings').dnd,
    setDnd: (on) => { store.updateSettings({ dnd: !!on }); win?.webContents.send('settings-changed', settingsView()); trayState.dnd = !!on; refreshTray(); }
  };
  createWindow();
  createTray();
  scheduler.start();

  // Detectar si hay batería; si no (PC de escritorio), sacar ese widget del panel.
  system.detectBattery().then(() => {
    const current = store.get('settings').widgets;
    const fixed = sanitizeLayout(current, unavailable());
    if (fixed.join() !== current.join()) store.updateSettings({ widgets: fixed });
    win?.webContents.send('settings-changed', settingsView());
  });

  for (const [name, accel] of Object.entries(HOTKEYS)) {
    if (!globalShortcut.register(accel, () => (name === 'circle' ? startCircle() : win?.webContents.send('hotkey', name)))) {
      console.warn(`No se pudo registrar el atajo ${accel}`);
    }
  }

  // --- accesos a apps (4 lugares) ---
  let installedCache = null;
  let installedAt = 0;
  const installed = () => {
    if (!installedCache || Date.now() - installedAt > 60000) { installedCache = system.listApps(); installedAt = Date.now(); }
    return installedCache;
  };
  const iconFor = async (item) => {
    if (item.kind === 'app') {
      const img = await app.getFileIcon(item.target, { size: 'large' });
      return img.isEmpty() ? null : img.toDataURL();
    }
    if (!store.get('settings').fetchFavicons) return null; // privacidad: por defecto no se consulta a nadie por los sitios que añades
    const host = new URL(item.target).hostname;
    return iconCache.getOrCreate(`icon|${host}`, async () => {
      const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`icono ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 65536 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('icono no válido'); // solo PNG pequeños
      return `data:image/png;base64,${buf.toString('base64')}`;
    });
  };
  const saveLauncher = (launcher) => {
    store.updateSettings({ launcher });
    win?.webContents.send('settings-changed', settingsView());
  };
  handle('launcher:data', () => ({ installed: installed(), suggestions: L.SUGGESTIONS.map((x) => ({ ...L.resolveSuggestion(x, installed()), category: x.category })) }));
  handle('launcher:set', (_e, slot, item) => {
    const clean = L.sanitizeItem(item);
    if (!clean || !L.isAllowed(clean, installed())) throw new Error('App no válida');
    saveLauncher(L.setSlot(store.get('settings').launcher, S.validateSlot(slot), clean));
  });
  handle('launcher:clear', (_e, slot) => saveLauncher(L.setSlot(store.get('settings').launcher, S.validateSlot(slot), null)));
  handle('launcher:open', async (_e, slot) => {
    const item = L.normalizeLauncher(store.get('settings').launcher)[S.validateSlot(slot)];
    if (!item) throw new Error('Lugar vacío');
    if (item.kind === 'url') return system.openUrl(item.target);
    if (!L.isAllowed(item, installed())) throw new Error('Esa app ya no está instalada');
    const err = await shell.openPath(item.target);
    if (err) throw new Error(err);
  });
  handle('launcher:icon', async (_e, item) => {
    const clean = L.sanitizeItem(item);
    return clean && L.isAllowed(clean, installed()) ? iconFor(clean) : null;
  });
  handle('picker:open', (_e, slot) => openPicker(S.validateSlot(slot)));

  // --- asistente ---
  const syncTray = () => { const d = !!store.get('settings').dnd; if (d !== trayState.dnd) { trayState.dnd = d; refreshTray(); } };
  // Cada pedido a Gemini se cuenta (Ajustes → Privacidad muestra el uso de hoy y si se llegó al límite gratis).
  const usage = createUsage({ load: () => store.get('usage'), save: (u) => store.set('usage', u) });
  handle('usage:get', () => usage.get());
  handle('ask', async (_e, payload) => {
    const clean = S.validateAskPayload(payload);
    const out = await usage.track('ask', () => assistant.ask(clean));
    win?.webContents.send('settings-changed', settingsView()); // por si Yurei cambió un widget o la ciudad
    syncTray();
    return out;
  });
  handle('dictate', async (_e, audioB64) => {
    const audio = S.validateAudio(audioB64);
    const text = await usage.track('dictate', () => assistant.dictate(audio));
    if (text) { win?.blur(); await system.pasteText(text); }
    return text;
  });
  handle('timer:get', () => focus.get());
  handle('timer:cancel', () => focus.cancel());
  handle('translator:off', () => { tools.session.translator = null; });
  handle('wake', (_e, audioB64) => { const audio = S.validateAudio(audioB64); return usage.track('wake', () => assistant.wake(audio)); });
  handle('tts', (_e, text, opts) => {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Texto no válido');
    const t = text.slice(0, 1500);
    const speak = () => usage.track('voice', () => assistant.speak(t));
    if (opts?.cache !== true) return speak();
    if (t.length > 80) throw new Error('Texto demasiado largo para la caché'); // la caché es solo para frases de relleno cortas
    const { voice, ttsModel } = store.get('settings');
    return ttsCache.getOrCreate(`${ttsModel}|${voice || 'Kore'}|${t}`, speak); // de la caché no cuenta: no se pide a Google
  });

  // --- ajustes y datos ---
  handle('settings:get', () => settingsView());
  handle('settings:save', (_e, patch) => {
    store.updateSettings(S.validateSettingsPatch(patch, { unavailable: unavailable() }));
    win?.webContents.send('settings-changed', settingsView());
    syncTray();
    broadcastAppearance();
    return settingsView();
  });
  handle('settings:open', () => openSettings());
  // Bienvenida: comprobar la API key con una petición mínima (y guardarla si funciona) y abrir la página para crearla.
  handle('key:test', async (_e, key) => {
    const { apiKey } = S.validateSettingsPatch({ apiKey: key });
    if (!apiKey) throw new Error('Pega la clave primero');
    try {
      await generate({ apiKey, model: store.get('settings').model, body: { contents: [{ role: 'user', parts: [{ text: 'Responde solo: ok' }] }] }, timeoutMs: 20000 });
    } catch (e) {
      if (/API_KEY_INVALID|API key not valid|\b(400|401|403)\b/.test(e.message)) throw new Error('Esa clave no funciona. Revisa que la copiaste completa.');
      if (/\b429\b/.test(e.message)) throw new Error('La clave funciona, pero llegaste al límite gratis por ahora. Prueba en un rato.');
      throw new Error(`No pude comprobarla: ${e.message}`);
    }
    store.updateSettings({ apiKey });
    win?.webContents.send('settings-changed', settingsView());
    return true;
  });
  handle('key:page', () => shell.openExternal('https://aistudio.google.com/apikey'));
  handle('data:wipe', async () => {
    const r = await dialog.showMessageBox({ type: 'warning', buttons: ['Cancelar', 'Borrar todo'], defaultId: 0, cancelId: 0, noLink: true, title: 'Yurei', message: '¿Borrar todos tus datos de Yurei?', detail: 'Se eliminan los ajustes, la API key, los pendientes, las tareas, las rutinas y las cachés de este equipo. Yurei se reiniciará.' });
    if (r.response !== 1) return false;
    store.wipe();
    for (const d of ['tts-cache', 'icon-cache']) fs.rmSync(path.join(userData, d), { recursive: true, force: true });
    fs.rmSync(path.join(userData, 'yurei-winhelper.ps1'), { force: true });
    app.relaunch();
    app.exit(0);
    return true;
  });
  handle('diag:audio', () => system.diagnose());

  // --- actualizaciones (GitHub) ---
  const updater = createUpdater({ current: app.getVersion(), dir: path.join(app.getPath('temp'), 'yurei-update'), spawnImpl: process.platform === 'win32' ? spawn : null });
  let update = { status: 'idle', current: app.getVersion() };
  const setUpdate = (patch) => {
    update = { ...update, ...patch };
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('update', update);
  };
  const checkUpdate = async (manual = false) => {
    if (['downloading', 'installing'].includes(update.status)) return update;
    try {
      const r = await updater.check();
      setUpdate(r.available ? { status: 'available', version: r.version, notes: r.notes, error: null } : { status: 'latest', version: r.latest, error: null });
    } catch (e) {
      if (manual) setUpdate({ status: 'error', error: e.message }); // en segundo plano, un fallo de red no molesta
    }
    return update;
  };
  if (store.get('settings').autoUpdate !== false) {
    setTimeout(() => checkUpdate(), 30 * 1000);
    setInterval(() => { if (store.get('settings').autoUpdate !== false) checkUpdate(); }, 6 * 3600 * 1000);
  }
  handle('update:get', () => update);
  handle('update:check', () => checkUpdate(true));
  handle('update:install', async () => {
    if (update.status !== 'available') throw new Error('No hay ninguna actualización lista');
    setUpdate({ status: 'downloading', progress: 0 });
    try {
      let last = 0;
      const file = await updater.download((p) => { if (p - last >= 0.05 || p === 1) { last = p; setUpdate({ progress: p }); } });
      setUpdate({ status: 'installing' });
      updater.install(file);
      setTimeout(() => app.quit(), 800); // el instalador reemplaza esta versión
      return true;
    } catch (e) {
      setUpdate({ status: 'available', error: e.message });
      throw e;
    }
  });
  // --- memoria: lo que Yurei recuerda de ti (se ve y se borra desde Ajustes) ---
  handle('memory:list', () => store.get('memory') || []);
  handle('memory:remove', (_e, id) => {
    if (!Number.isInteger(id)) throw new Error('Recuerdo no válido');
    store.set('memory', (store.get('memory') || []).filter((m) => m.id !== id));
    return store.get('memory');
  });
  handle('memory:clear', () => { store.set('memory', []); return []; });
  handle('todos', () => store.get('todos'));
  handle('widget:data', async (_e, name) => {
    if (name === 'weather') return weather.get(store.get('settings').city);
    if (name === 'stats') return system.stats();
    if (name === 'media') return system.mediaInfo();
    if (name === 'cover') {
      const r = await system.mediaCover();
      return { url: S.coverDataUrl(r?.cover), title: r?.title || '', artist: r?.artist || '' };
    }
    if (name === 'volume') return system.getVolume();
    if (name === 'schedule') return nextSchedule({ tasks: store.get('tasks'), routines: store.get('routines') }, new Date());
    throw new Error('Widget desconocido');
  });
  // Acciones desde los propios widgets (botones y deslizador)
  handle('widget:action', async (_e, name, p = {}) => {
    if (name === 'media') {
      const { action, arg } = S.validateMediaAction(p);
      return system.media(action, arg);
    }
    if (name === 'volume' && p.mute !== undefined) return system.setMute(p.mute === true);
    if (name === 'volume') {
      const level = Number(p.level);
      if (!Number.isFinite(level)) throw new Error('Nivel no válido');
      return system.setVolume(Math.max(0, Math.min(100, Math.round(level))));
    }
    throw new Error('Acción desconocida');
  });
  handle('island:mode', (_e, mode) => {
    if (!Object.hasOwn(MODES, mode)) throw new Error('Modo no válido');
    placeIsland(mode);
  });
}

// Una sola instancia: abrir Yurei otra vez solo muestra sus ajustes en la que ya está en marcha.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());
  app.whenReady().then(start);
}

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('quit', () => system?.shutdown());
app.on('window-all-closed', () => app.quit());

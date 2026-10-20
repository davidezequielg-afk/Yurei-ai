const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, globalShortcut, ipcMain, screen, clipboard, shell, desktopCapturer, Notification, nativeTheme, systemPreferences, dialog, safeStorage, session } = require('electron');
const { createStore } = require('./src/store');
const { createSystem } = require('./src/system');
const { createTools } = require('./src/tools');
const { createAssistant } = require('./src/assistant');
const { createScheduler } = require('./src/scheduler');
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

// Nada puede abrir ventanas nuevas, navegar fuera de las páginas locales ni incrustar <webview>.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (e, url) => { if (!trustedUrl(url)) e.preventDefault(); });
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

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
  const tools = createTools({ store, system });
  const assistant = createAssistant({ store, tools });
  const weather = createWeather();
  const ttsCache = createTtsCache(path.join(userData, 'tts-cache'), { maxEntries: 60 }); // solo frases de relleno, nunca lo que dices
  const iconCache = createTtsCache(path.join(userData, 'icon-cache'), { maxEntries: 300 });
  const scheduler = createScheduler({
    store, tools,
    report: (r) => {
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

  createWindow();
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
  handle('ask', async (_e, payload) => {
    const out = await assistant.ask(S.validateAskPayload(payload));
    win?.webContents.send('settings-changed', settingsView()); // por si Yurei cambió un widget o la ciudad
    return out;
  });
  handle('dictate', async (_e, audioB64) => {
    const text = await assistant.dictate(S.validateAudio(audioB64));
    if (text) { win?.blur(); await system.pasteText(text); }
    return text;
  });
  handle('wake', (_e, audioB64) => assistant.wake(S.validateAudio(audioB64)));
  handle('tts', (_e, text, opts) => {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Texto no válido');
    const t = text.slice(0, 1500);
    if (opts?.cache !== true) return assistant.speak(t);
    if (t.length > 80) throw new Error('Texto demasiado largo para la caché'); // la caché es solo para frases de relleno cortas
    const { voice, ttsModel } = store.get('settings');
    return ttsCache.getOrCreate(`${ttsModel}|${voice || 'Kore'}|${t}`, () => assistant.speak(t));
  });

  // --- ajustes y datos ---
  handle('settings:get', () => settingsView());
  handle('settings:save', (_e, patch) => {
    store.updateSettings(S.validateSettingsPatch(patch, { unavailable: unavailable() }));
    win?.webContents.send('settings-changed', settingsView());
    broadcastAppearance();
    return settingsView();
  });
  handle('settings:open', () => openSettings());
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
  handle('todos', () => store.get('todos'));
  handle('widget:data', async (_e, name) => {
    if (name === 'weather') return weather.get(store.get('settings').city);
    if (name === 'stats') return system.stats();
    if (name === 'media') return system.mediaInfo();
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

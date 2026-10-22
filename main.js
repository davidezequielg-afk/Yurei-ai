const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, globalShortcut, ipcMain, screen, clipboard, shell, desktopCapturer, Notification, nativeTheme, nativeImage, systemPreferences, dialog, safeStorage, session, Tray, Menu, powerMonitor } = require('electron');
const { createStore } = require('./src/store');
const { createSystem } = require('./src/system');
const { createEdges } = require('./src/edges');
const { createTools } = require('./src/tools');
const { createAssistant } = require('./src/assistant');
const { createScheduler } = require('./src/scheduler');
const { createFocus } = require('./src/focus');
const { createUpdater } = require('./src/updater');
const { generate } = require('./src/gemini');
const { createUsage } = require('./src/usage');
const { testBrain, PRESETS: BRAIN_PRESETS } = require('./src/brains');
const { routing } = require('./src/assistant');
const { createReminders } = require('./src/reminders');
const { findFiles } = require('./src/files');
const { speedTest } = require('./src/speedtest');
const { createKeyWatch } = require('./src/keywatch');
const { createWifi } = require('./src/wifi');
const { createShelf } = require('./src/shelf');
const { nudges } = require('./src/nudges');
const { spawn } = require('child_process');
const { createTtsCache } = require('./src/ttscache');
const { resolveAppearance } = require('./src/theme');
const L = require('./src/launcher');
const S = require('./src/secure');
const { createWeather, nextSchedule, unavailableWidgets, sanitizeLayout, catalogFor } = require('./src/widgets');

// La isla vive en una ventana fija y transparente arriba al centro; solo la píldora y sus burbujas reciben el
// mouse (el resto deja pasar los clics al escritorio). Así la píldora puede crecer con animación de resorte.
const ISLAND = { w: 560, h: 360 };
const HOTKEYS = { talk: 'Control+Shift+Space', dictate: 'Control+Alt+D', circle: 'Control+Shift+C' };
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const POWER_TEXT = { shutdown: ['apagar', 'Apagar'], restart: ['reiniciar', 'Reiniciar'], sleep: ['suspender', 'Suspender'] };

// Idioma de la interfaz: el elegido, o el de Windows (español si empieza con "es"; si no, inglés).
const langOf = (settings) => (['es', 'en'].includes(settings?.language) ? settings.language : (app.getLocale() || 'es').toLowerCase().startsWith('es') ? 'es' : 'en');
let LANG = 'es';
const tr = (es, en) => (LANG === 'en' ? en : es);

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
let edges = { tick() {} }; // indicadores de volumen y brillo en los bordes (se crea al iniciar)
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
    { label: tr('No molestar', 'Do not disturb'), type: 'checkbox', checked: trayState.dnd, click: (i) => trayState.setDnd(i.checked) },
    { label: tr('Ajustes', 'Settings'), click: () => openSettings() },
    { type: 'separator' },
    { label: tr('Salir de Yurei', 'Quit Yurei'), click: () => app.quit() }
  ]));
}

let islandScale = 1;
let hitRects = []; // zonas que reciben el mouse, en coordenadas de la ventana
let mouseInside = false;

function placeIsland() {
  if (!win || win.isDestroyed()) return;
  const { bounds } = screen.getPrimaryDisplay();
  const w = Math.round(ISLAND.w * islandScale);
  const h = Math.round(ISLAND.h * islandScale);
  win.setBounds({ x: Math.round(bounds.x + (bounds.width - w) / 2), y: bounds.y, width: w, height: h });
}

function setIslandScale(scale) {
  islandScale = Math.max(0.8, Math.min(1.3, Number(scale) || 1));
  placeIsland();
  win?.webContents.setZoomFactor(islandScale);
}

// ¿El cursor está sobre la píldora? Si sí, la ventana recibe el mouse; si no, lo deja pasar.
function islandHitTest(cursor) {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const b = win.getBounds();
  const x = cursor.x - b.x;
  const y = cursor.y - b.y;
  const inside = hitRects.some((r) => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2);
  if (inside !== mouseInside) {
    mouseInside = inside;
    win.setIgnoreMouseEvents(!inside, { forward: true });
    win.webContents.send('island-hover', inside);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: ISLAND.w, height: ISLAND.h,
    frame: false, transparent: true, resizable: false, alwaysOnTop: true,
    skipTaskbar: true, hasShadow: false, show: false, backgroundColor: '#00000000',
    webPreferences: webPrefs()
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(RENDERER_DIR, 'index.html'));
  win.once('ready-to-show', () => { placeIsland(); win.showInactive(); });
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(islandScale));
  screen.on('display-metrics-changed', placeIsland);
}

// Zonas de la píldora que manda la ventana (como mucho 4 rectángulos dentro de la ventana).
ipcMain.on('island:rects', (e, rects) => {
  if (!win || e.sender !== win.webContents || !trustedUrl(e.senderFrame?.url) || !Array.isArray(rects)) return;
  const k = islandScale;
  hitRects = rects.slice(0, 4).filter((r) => r && [r.x, r.y, r.w, r.h].every(Number.isFinite))
    .map((r) => ({ x: r.x * k, y: r.y * k, w: Math.min(r.w, ISLAND.w) * k, h: Math.min(r.h, ISLAND.h) * k }));
  islandHitTest(screen.getCursorScreenPoint());
});

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
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    // El visualizador de música escucha el audio del sistema (loopback); solo la ventana de la isla puede pedirlo.
    if (permission === 'display-capture') { cb(!!win && wc === win.webContents && trustedUrl(wc.getURL())); return; }
    cb(permission === 'media' && trustedUrl(wc.getURL()) && (details?.mediaTypes || ['audio']).every((t) => t === 'audio'));
  });
  ses.setDisplayMediaRequestHandler(async (request, cb) => {
    try {
      if (!win || request.frame?.top?.url === undefined || !trustedUrl(request.frame.top.url) || request.frame.processId !== win.webContents.mainFrame.processId) { cb({}); return; }
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }); // sin capturar imágenes
      cb(sources[0] ? { video: sources[0], audio: 'loopback' } : {});
    } catch { cb({}); }
  });
  ses.setPermissionCheckHandler((wc, permission, _origin, details) => (permission === 'media' && !!wc && trustedUrl(wc.getURL()) && details?.mediaType !== 'video') || (permission === 'display-capture' && !!win && wc === win.webContents));
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
  // Concentración del día (pomodoros completos y minutos), últimos 30 días.
  const recordFocus = (minutes) => {
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const stats = { ...(store.get('focusStats') || {}) };
    const cur = stats[day] || { pomodoros: 0, minutes: 0 };
    stats[day] = { pomodoros: cur.pomodoros + 1, minutes: cur.minutes + Math.round(minutes) };
    store.set('focusStats', Object.fromEntries(Object.entries(stats).sort().slice(-30)));
  };
  // Temporizador / pomodoro: el notch dibuja el anillo y avisa en voz alta al terminar.
  const focus = createFocus({
    onChange: (t) => win?.webContents.send('timer', t),
    onDone: ({ finished, next }) => {
      if (finished.kind === 'pomodoro' && finished.phase === 'focus') recordFocus(finished.focusMin);
      const title = finished.kind === 'pomodoro'
        ? (next ? (next.phase === 'break' ? tr('Hora de un descanso', 'Time for a break') : tr('¡A concentrarse otra vez!', 'Back to focus!')) : tr('¡Pomodoro completo!', 'Pomodoro complete!'))
        : `${tr('Terminó', 'Done')}: ${finished.label}`;
      new Notification({ title: `Yurei · ${title}`, silent: true }).show();
      win?.webContents.send('timer-done', { finished, next });
    }
  });
  // Recordatorios hablados: a la hora, notificación + Yurei lo dice en voz alta.
  const reminders = createReminders({
    store,
    onDue: (r) => {
      new Notification({ title: tr('Yurei · Recordatorio', 'Yurei · Reminder'), body: r.text, silent: true }).show();
      win?.webContents.send('reminder', r);
    }
  });
  setInterval(() => reminders.tick(), 10 * 1000);
  setTimeout(() => reminders.tick(), 8000); // al abrir: los que vencieron con la PC apagada
  const weatherRef = { get: (c) => weather.get(c) };
  const tools = createTools({ store, system, focus, reminders, weather: weatherRef, speed: () => speedTest(), files: { find: (q) => findFiles(q) } });
  const assistant = createAssistant({ store, tools, langFor: () => langOf(store.get('settings')), deviceFor: () => (system.hasBattery() === true ? 'notebook' : system.hasBattery() === false ? 'pc' : null) });
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
    lang: langOf(store.get('settings')),
    device: system.hasBattery() === true ? 'notebook' : system.hasBattery() === false ? 'pc' : 'unknown', // notebook (con batería) o PC de escritorio
    version: app.getVersion(),
    apiKey: store.get('settings').apiKey ? S.MASK : '', // la clave nunca sale del proceso principal
    brainKey: store.get('settings').brainKey ? S.MASK : '',
    voiceSource: routing(store.get('settings')).speech, // 'system' → el notch habla con la voz de Windows
    hearingSource: routing(store.get('settings')).hearing,
    brainPresets: Object.fromEntries(Object.entries(BRAIN_PRESETS).map(([k, p]) => [k, { label: p.label, provider: p.provider, baseUrl: p.baseUrl || '', model: p.model || '', models: p.models || [], local: !!p.local, stt: p.stt || '', tts: p.tts || '' }])),
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

  LANG = langOf(store.get('settings'));
  trayState = {
    dnd: !!store.get('settings').dnd,
    setDnd: (on) => { store.updateSettings({ dnd: !!on }); win?.webContents.send('settings-changed', settingsView()); trayState.dnd = !!on; refreshTray(); }
  };
  // Abrir con Windows (solo en la app instalada; en desarrollo no se toca el inicio del sistema).
  const applyLogin = () => { if (app.isPackaged && process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: store.get('settings').openAtLogin !== false, args: ['--autostart'] }); };
  applyLogin();
  islandScale = Math.max(0.8, Math.min(1.3, (Number(store.get('settings').uiScale) || 100) / 100));
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

  // Atajos de teclado (configurables en Ajustes). Si otra app ya usa alguno, se avisa y se vuelve a los anteriores.
  const registerHotkeys = (keys) => {
    globalShortcut.unregisterAll();
    const failed = [];
    for (const [name, accel] of Object.entries(keys)) {
      if (!globalShortcut.register(accel, () => (name === 'circle' ? startCircle() : win?.webContents.send('hotkey', name)))) failed.push(accel);
    }
    return failed;
  };
  let hotkeys = { ...HOTKEYS, ...(store.get('settings').hotkeys || {}) };
  if (registerHotkeys(hotkeys).length) { hotkeys = { ...HOTKEYS }; registerHotkeys(hotkeys); }
  handle('hotkeys:set', (_e, keys) => {
    const next = S.validateHotkeys(keys);
    const failed = registerHotkeys(next);
    if (failed.length) {
      registerHotkeys(hotkeys);
      throw new Error(`${failed.join(', ')} ya lo usa otra app o Windows. Prueba otra combinación.`);
    }
    hotkeys = next;
    store.updateSettings({ hotkeys });
    win?.webContents.send('settings-changed', settingsView());
    return hotkeys;
  });

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
  const syncTray = () => {
    const d = !!store.get('settings').dnd;
    const l = langOf(store.get('settings'));
    if (d !== trayState.dnd || l !== LANG) { trayState.dnd = d; LANG = l; refreshTray(); }
  };
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
  handle('timer:start', (_e, minutes, label) => {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0 || m > 180) throw new Error('Duración no válida (hasta 180 minutos)');
    store.updateSettings({ timerDuration: Math.round(m * 60) });
    return focus.timer({ minutes: m, label: String(label || 'Temporizador').slice(0, 40) });
  });
  handle('timer:pause', () => focus.pause());
  handle('timer:resume', () => focus.resume());
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
    const clean = S.validateSettingsPatch(patch, { unavailable: unavailable() });
    store.updateSettings(clean);
    if ('openAtLogin' in clean) applyLogin();
    if ('uiScale' in clean) setIslandScale(clean.uiScale / 100);
    if ('pushToTalk' in clean) syncKeys();
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
  // "Probar conexión" con el cerebro elegido (usa lo guardado; la clave nunca llega a la ventana).
  handle('brain:test', async () => {
    const st = store.get('settings');
    const p = BRAIN_PRESETS[st.brainPreset] || {};
    if ((st.brainProvider || 'gemini') === 'gemini') throw new Error('Con Gemini usa "Comprobar" en la API key de Gemini');
    try {
      return await testBrain({ provider: st.brainProvider, baseUrl: st.brainBase || p.baseUrl, apiKey: st.brainKey, model: st.brainModel || p.model });
    } catch (e) {
      throw new Error(/ECONNREFUSED|fetch failed/i.test(e.message) && p.local ? `No encuentro ${p.label}: ¿está abierto en tu PC?` : e.message);
    }
  });
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

  // --- centro de control: radios, Wi-Fi, Bluetooth, brillo, teclas y páginas de Windows ---
  const wifi = createWifi();
  const str = (v, max = 100) => { if (typeof v !== 'string' || !v || v.length > max) throw new Error('Dato no válido'); return v; };
  // --- bandeja de la isla: archivos, carpetas y textos (solo referencias; nada se copia) ---
  const shelf = createShelf({ get: () => store.get('shelf'), set: (v) => store.set('shelf', v), persist: () => store.get('settings').shelfPersist === true });
  shelf.prune({ startup: true });
  const thumbs = new Map();
  const pushShelf = () => win?.webContents.send('shelf', shelf.list());
  handle('shelf:list', () => shelf.prune());
  handle('shelf:add', (_e, paths) => { const r = shelf.addPaths((Array.isArray(paths) ? paths : []).slice(0, 20)); pushShelf(); return r; });
  handle('shelf:text', (_e, text) => { const r = shelf.addText(typeof text === 'string' ? text.slice(0, 10000) : ''); pushShelf(); return r; });
  handle('shelf:remove', (_e, id) => { const r = shelf.remove(str(id, 40)); pushShelf(); return r; });
  handle('shelf:open', async (_e, id) => {
    const it = shelf.find(str(id, 40));
    if (!it) throw new Error('Ese elemento ya no está en la bandeja');
    if (it.kind === 'text') { clipboard.writeText(it.text); return { copied: true }; }
    const err = await shell.openPath(it.path);
    if (err) throw new Error(err);
    return { opened: true };
  });
  handle('shelf:thumb', async (_e, id) => {
    const it = shelf.find(str(id, 40));
    if (!it || it.kind === 'text') return null;
    if (thumbs.has(it.id)) return thumbs.get(it.id);
    let url = null;
    try {
      const img = await (nativeImage.createThumbnailFromPath ? nativeImage.createThumbnailFromPath(it.path, { width: 168, height: 168 }) : Promise.reject(new Error('sin miniaturas')));
      if (!img.isEmpty()) url = img.toDataURL();
    } catch { /* se usa el icono del archivo */ }
    if (!url) { try { const ic = await app.getFileIcon(it.path, { size: 'large' }); if (!ic.isEmpty()) url = ic.toDataURL(); } catch { /* sin icono */ } }
    thumbs.set(it.id, url);
    return url;
  });
  // Sacar un archivo de la bandeja hacia otra app: solo archivos que están en ella y que siguen existiendo.
  ipcMain.on('shelf:drag', (e, id) => {
    if (!win || e.sender !== win.webContents || !trustedUrl(e.senderFrame?.url) || typeof id !== 'string') return;
    const it = shelf.find(id);
    if (!it || it.kind === 'text' || !fs.existsSync(it.path)) return;
    const icon = thumbs.get(it.id) ? nativeImage.createFromDataURL(thumbs.get(it.id)) : nativeImage.createEmpty();
    e.sender.startDrag({ file: it.path, icon: icon.isEmpty() ? nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')) : icon });
  });
  handle('radio:get', () => system.radios());
  handle('radio:set', (_e, kind, on) => system.setRadio(str(kind, 12), on === true));
  handle('wifi:status', () => wifi.status());
  handle('wifi:scan', () => wifi.scan());
  handle('wifi:connect', (_e, p) => wifi.connect({ ssid: str(p?.ssid, 64), password: typeof p?.password === 'string' ? p.password.slice(0, 80) : '', secured: p?.secured !== false, wpa3: p?.wpa3 === true }));
  handle('wifi:disconnect', () => wifi.disconnect());
  handle('wifi:forget', (_e, ssid) => wifi.forget(str(ssid, 64)));
  handle('bt:list', () => system.btDevices());
  handle('sys:open', (_e, page) => system.openSettingsPage(str(page, 20)));
  handle('sys:combo', (_e, name) => system.combo(str(name, 20)));
  handle('brightness:get', async () => (system.hasBattery() === false ? { available: false, reason: 'pc' } : system.getBrightness()));
  handle('brightness:set', async (_e, level) => {
    if (system.hasBattery() === false) throw new Error('Es una PC de escritorio: el brillo se cambia con los botones del monitor');
    const n = Math.max(0, Math.min(100, Math.round(Number(level))));
    if (!Number.isFinite(n)) throw new Error('Nivel no válido');
    return system.setBrightness(n);
  });

  // --- indicadores de volumen (izquierda) y brillo (derecha) en los bordes de la pantalla ---
  const hudWins = {};
  const hudBusy = { volume: false, brightness: false };
  const hudInteractive = { volume: false, brightness: false };
  const HUD_SIDE = { volume: 'left', brightness: 'right' };
  const hudOf = (kind) => {
    if (hudWins[kind] && !hudWins[kind].isDestroyed()) return hudWins[kind];
    const w = new BrowserWindow({
      width: 64, height: 242, show: false, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false,
      focusable: false, hasShadow: false, webPreferences: webPrefs('preload-hud.js')
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setIgnoreMouseEvents(true);
    w.loadFile(path.join(RENDERER_DIR, 'hud.html'));
    hudWins[kind] = w;
    return w;
  };
  const hudPlace = (kind, display) => {
    const w = hudOf(kind);
    const [cw, ch] = w.getSize();
    const b = display.bounds;
    w.setBounds({ x: HUD_SIDE[kind] === 'left' ? b.x + 4 : b.x + b.width - cw - 4, y: Math.round(b.y + (b.height - ch) / 2), width: cw, height: ch });
  };
  const hudPayload = (kind, r) => ({ kind, side: HUD_SIDE[kind], level: r.level, muted: !!r.muted });
  const hudReady = (w) => (w.webContents.isLoading() ? new Promise((ok) => w.webContents.once('did-finish-load', ok)) : Promise.resolve());
  const hudBridge = {
    show(kind, r) {
      const w = hudOf(kind);
      hudPlace(kind, screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
      hudReady(w).then(() => { w.webContents.send('hud:state', hudPayload(kind, r)); w.showInactive(); });
    },
    update(kind, r) { const w = hudWins[kind]; if (w && !w.isDestroyed()) w.webContents.send('hud:state', hudPayload(kind, r)); },
    hide(kind) {
      const w = hudWins[kind];
      if (!w || w.isDestroyed()) return;
      w.webContents.send('hud:state', { hide: true });
      setTimeout(() => { if (!edges.state[kind].shown && !w.isDestroyed()) { w.hide(); w.setIgnoreMouseEvents(true); hudInteractive[kind] = false; } }, 350);
    },
    busy: (kind) => hudBusy[kind],
    contains(kind, c) { const w = hudWins[kind]; if (!w || w.isDestroyed() || !w.isVisible()) return false; const b = w.getBounds(); return c.x >= b.x && c.x <= b.x + b.width && c.y >= b.y && c.y <= b.y + b.height; },
    interactive(kind, on) { const w = hudWins[kind]; if (!w || w.isDestroyed() || hudInteractive[kind] === on) return; hudInteractive[kind] = on; w.setIgnoreMouseEvents(!on); }
  };
  edges = createEdges({
    settings: () => store.get('settings'),
    screenOf: (c) => screen.getDisplayNearestPoint(c),
    hud: hudBridge,
    hasBrightness: () => system.hasBattery() === true,
    readLevel: async (kind) => {
      if (kind === 'volume') { const v = await system.getVolume(); return v && Number.isFinite(v.volume) ? { level: v.volume, muted: v.muted } : null; }
      const b = await system.getBrightness();
      return b?.available ? { level: b.level } : null;
    }
  });
  if (process.platform === 'win32') setInterval(() => edges.poll(), edges.pollMs);
  handle('hud:set', async (_e, kind, level) => {
    if (!Number.isFinite(level)) throw new Error('Nivel no válido');
    const n = Math.max(0, Math.min(100, Math.round(level)));
    if (kind === 'brightness') { if (system.hasBattery() === false) throw new Error('PC de escritorio'); return system.setBrightness(n); }
    return system.setVolume(n);
  });
  handle('hud:mute', (_e, on) => system.setMute(on === true));
  handle('hud:mixer-list', () => system.mixerList());
  handle('hud:mixer-set', (_e, pid, level) => system.mixerSet(pid, level));
  handle('hud:mixer-mute', (_e, pid, on) => system.mixerMute(pid, on));
  ipcMain.on('hud:size', (e, w, h) => {
    const kind = Object.keys(hudWins).find((k) => hudWins[k]?.webContents === e.sender);
    if (!kind || !Number.isFinite(w) || !Number.isFinite(h)) return;
    const win2 = hudWins[kind];
    const b = win2.getBounds();
    const nw = Math.max(40, Math.min(320, Math.round(w)));
    const nh = Math.max(40, Math.min(400, Math.round(h)));
    win2.setBounds({ x: HUD_SIDE[kind] === 'left' ? b.x : b.x + b.width - nw, y: b.y, width: nw, height: nh });
    if (kind === 'volume') edges.setMixerOpen(nw > 100);
  });
  ipcMain.on('hud:busy', (e, kind, on) => { if (kind in hudBusy) hudBusy[kind] = on === true; });
  handle('app:restart', () => { app.relaunch(); setTimeout(() => app.exit(0), 100); });

  // --- vida de la carita y avisos amables (ver src/nudges.js) ---
  const nudge = (payload) => win?.webContents.send('nudge', payload);
  const life = nudges({
    settings: () => store.get('settings'),
    get: (k) => store.get(k),
    set: (k, v) => store.set(k, v),
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    cpu: () => system.stats().cpu,
    onNudge: nudge
  });
  setInterval(life.minute, 60 * 1000);
  setInterval(life.cpuTick, 5 * 1000);
  setTimeout(life.maybeBrief, 12 * 1000);
  powerMonitor.on('unlock-screen', life.maybeBrief);
  powerMonitor.on('resume', life.maybeBrief);

  // Cada 50 ms: ¿el mouse está sobre la píldora? y los ojitos siguen al mouse cuando pasa cerca (solo se manda
  // la dirección, nunca dónde está).
  let lastLook = null;
  setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const c = screen.getCursorScreenPoint();
    islandHitTest(c);
    edges.tick(c);
    const b = win.getBounds();
    const cx = b.x + b.width / 2;
    const cy = b.y + 18 * islandScale;
    const dx = c.x - cx;
    const dy = c.y - cy;
    const dist = Math.hypot(dx, dy);
    const look = dist > 600 ? null : { x: +(dx / Math.max(dist, 60)).toFixed(2), y: +(dy / Math.max(dist, 60)).toFixed(2) };
    const key = JSON.stringify(look);
    if (key !== lastLook) { lastLook = key; win.webContents.send('cursor', look); }
  }, 50);

  // Mantener apretado para hablar (tecla elegida en Ajustes).
  const keys = createKeyWatch({
    spawn,
    dataDir: userData,
    onDown: () => win?.webContents.send('hotkey', 'ptt-down'),
    onUp: () => win?.webContents.send('hotkey', 'ptt-up')
  });
  keys.start(store.get('settings').pushToTalk || 'off');
  app.on('quit', () => keys.stop());
  const syncKeys = () => { const k = store.get('settings').pushToTalk || 'off'; if (k !== keys.key) keys.start(k); };

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
    if (name === 'net') return system.netSpeed();
    if (name === 'media') return system.mediaInfo();
    if (name === 'cover') {
      const r = await system.mediaCover();
      return { url: S.coverDataUrl(r?.cover), title: r?.title || '', artist: r?.artist || '' };
    }
    if (name === 'volume') return system.getVolume();
    if (name === 'notes') return (store.get('notes') || []).slice(-4).reverse();
    if (name === 'focus') return tools.execute('focus_stats');
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
  handle('island:focus', () => { win?.focus(); }); // para escribir (p. ej. la clave del Wi-Fi)
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

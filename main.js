const path = require('path');
const { app, BrowserWindow, globalShortcut, ipcMain, screen, clipboard, shell, desktopCapturer, Notification, nativeTheme, systemPreferences } = require('electron');
const { createStore } = require('./src/store');
const { createSystem } = require('./src/system');
const { createTools } = require('./src/tools');
const { createAssistant } = require('./src/assistant');
const { createScheduler } = require('./src/scheduler');
const { createTtsCache } = require('./src/ttscache');
const { THEMES, TRANSPARENCY, HEX, resolveAppearance } = require('./src/theme');
const L = require('./src/launcher');
const { validateLayout, createWeather, nextSchedule, unavailableWidgets, sanitizeLayout, catalogFor } = require('./src/widgets');

const MODES = { idle: [120, 22], status: [260, 60], peek: [567, 132] };
const HOTKEYS = { talk: 'Control+Shift+Space', dictate: 'Control+Alt+D', circle: 'Control+Shift+C' };

let win = null;
let overlay = null;
let settingsWin = null;
let pickerWin = null;

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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer/index.html'));
  win.once('ready-to-show', () => { placeIsland('idle'); win.showInactive(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 460, height: 680, title: 'Yurei · Ajustes', autoHideMenuBar: true, backgroundColor: '#101114',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer/settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function openPicker(slot) {
  if (pickerWin) pickerWin.close();
  pickerWin = new BrowserWindow({
    width: 400, height: 560, title: 'Yurei · Elegir app', autoHideMenuBar: true, backgroundColor: '#101114',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  pickerWin.loadFile(path.join(__dirname, 'renderer/picker.html'), { query: { slot: String(slot) } });
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true }
  });
  overlay.loadFile(path.join(__dirname, 'renderer/overlay.html'));
  overlay.webContents.once('did-finish-load', () => overlay.webContents.send('overlay:image', shot.thumbnail.toDataURL()));
  overlay.on('closed', () => { overlay = null; });

  const finish = (rect) => {
    ipcMain.removeAllListeners('overlay:select');
    ipcMain.removeAllListeners('overlay:cancel');
    const dataUrl = rect && rect.w > 8 && rect.h > 8
      ? shot.thumbnail.crop({
          x: Math.round(rect.x * display.scaleFactor), y: Math.round(rect.y * display.scaleFactor),
          width: Math.round(rect.w * display.scaleFactor), height: Math.round(rect.h * display.scaleFactor)
        }).toDataURL()
      : null;
    overlay?.close();
    if (dataUrl) win.webContents.send('circle-image', dataUrl.split(',')[1]);
  };
  ipcMain.once('overlay:select', (_e, rect) => finish(rect));
  ipcMain.once('overlay:cancel', () => finish(null));
}

let system = null;

app.whenReady().then(() => {
  const store = createStore(path.join(app.getPath('userData'), 'yurei.json'));
  system = createSystem({ shell, clipboard, dataDir: app.getPath('userData') });
  const tools = createTools({ store, system });
  const assistant = createAssistant({ store, tools });
  const weather = createWeather();
  const ttsCache = createTtsCache(path.join(app.getPath('userData'), 'tts-cache'));
  const scheduler = createScheduler({
    store, tools,
    report: (r) => {
      new Notification({ title: `Yurei · ${r.label}`, body: r.results.join('\n') }).show();
      win?.webContents.send('report', r);
    }
  });

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
    if (!globalShortcut.register(accel, () => (name === 'circle' ? startCircle() : win.webContents.send('hotkey', name)))) {
      console.warn(`No se pudo registrar el atajo ${accel}`);
    }
  }

  const safe = (fn) => async (...a) => {
    try { return { ok: true, data: await fn(...a) }; } catch (e) { return { ok: false, error: e.message }; }
  };
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
  ipcMain.handle('appearance:get', () => ({ ok: true, data: currentAppearance() }));

  // --- accesos a apps (4 lugares) ---
  let installedCache = null;
  let installedAt = 0;
  const installed = () => {
    if (!installedCache || Date.now() - installedAt > 60000) { installedCache = system.listApps(); installedAt = Date.now(); }
    return installedCache;
  };
  const iconCache = createTtsCache(path.join(app.getPath('userData'), 'icon-cache')); // guarda el icono (base64) de cada web
  const iconFor = async (item) => {
    if (item.kind === 'app') {
      const img = await app.getFileIcon(item.target, { size: 'large' });
      return img.isEmpty() ? null : img.toDataURL();
    }
    const host = new URL(item.target).hostname;
    return iconCache.getOrCreate(`icon|${host}`, async () => {
      const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
      if (!res.ok) throw new Error(`icono ${res.status}`);
      return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
    });
  };
  const saveLauncher = (launcher) => {
    store.updateSettings({ launcher });
    win?.webContents.send('settings-changed', settingsView());
  };
  ipcMain.handle('launcher:data', safe(() => ({ installed: installed(), suggestions: L.SUGGESTIONS.map((x) => L.resolveSuggestion(x, installed())) })));
  ipcMain.handle('launcher:set', safe((_e, slot, item) => {
    const clean = L.sanitizeItem(item);
    if (!clean || !L.isAllowed(clean, installed())) throw new Error('App no válida');
    saveLauncher(L.setSlot(store.get('settings').launcher, slot, clean));
  }));
  ipcMain.handle('launcher:clear', safe((_e, slot) => saveLauncher(L.setSlot(store.get('settings').launcher, slot, null))));
  ipcMain.handle('launcher:open', safe(async (_e, slot) => {
    const item = L.normalizeLauncher(store.get('settings').launcher)[Number(slot)];
    if (!item) throw new Error('Lugar vacío');
    if (item.kind === 'url') return shell.openExternal(item.target);
    if (!L.isAllowed(item, installed())) throw new Error('Esa app ya no está instalada');
    const err = await shell.openPath(item.target);
    if (err) throw new Error(err);
  }));
  ipcMain.handle('launcher:icon', safe(async (_e, item) => {
    const clean = L.sanitizeItem(item);
    return clean && L.isAllowed(clean, installed()) ? iconFor(clean) : null;
  }));
  ipcMain.handle('picker:open', safe((_e, slot) => openPicker(Number(slot))));

  const unavailable = () => unavailableWidgets({ hasBattery: system.hasBattery(), hasMedia: system.hasMediaControl() });
  const settingsView = () => ({ ...store.get('settings'), apiKey: store.get('settings').apiKey ? '••••••••' : '', launcher: L.normalizeLauncher(store.get('settings').launcher), widgets: sanitizeLayout(store.get('settings').widgets, unavailable()), widgetCatalog: catalogFor(unavailable()) });

  ipcMain.handle('ask', safe(async (_e, payload) => {
    const out = await assistant.ask(payload);
    win?.webContents.send('settings-changed', settingsView()); // por si Yurei cambió un widget o la ciudad
    return out;
  }));
  ipcMain.handle('dictate', safe(async (_e, audioB64) => {
    const text = await assistant.dictate(audioB64);
    if (text) { win.blur(); await system.pasteText(text); }
    return text;
  }));
  ipcMain.handle('tts', safe((_e, text, opts = {}) => {
    const t = String(text).slice(0, 1500);
    if (!opts.cache) return assistant.speak(t); // las frases de relleno se guardan en disco por voz y modelo
    const { voice, ttsModel } = store.get('settings');
    return ttsCache.getOrCreate(`${ttsModel}|${voice || 'Kore'}|${t}`, () => assistant.speak(t));
  }));
  ipcMain.handle('wake', safe((_e, audioB64) => assistant.wake(audioB64)));
  ipcMain.handle('settings:get', safe(() => settingsView()));
  ipcMain.handle('settings:save', safe((_e, patch) => {
    const clean = { ...patch };
    if (clean.apiKey === '••••••••') delete clean.apiKey;
    delete clean.widgetCatalog;
    delete clean.launcher; // solo se cambia con los controles del widget (se valida allí)
    if ('widgets' in clean) clean.widgets = validateLayout(clean.widgets, unavailable());
    if ('city' in clean) clean.city = String(clean.city || '').trim().slice(0, 80);
    if ('theme' in clean && !THEMES.includes(clean.theme)) clean.theme = 'dark';
    if ('transparency' in clean && !TRANSPARENCY.includes(clean.transparency)) clean.transparency = 'off';
    for (const k of ['customBg', 'customAccent']) if (k in clean && !HEX.test(String(clean[k]))) delete clean[k];
    if ('opacity' in clean) clean.opacity = Math.max(30, Math.min(100, Math.round(Number(clean.opacity)) || 78));
    if ('fillers' in clean) clean.fillers = clean.fillers === true;
    if ('fillerPhrases' in clean) clean.fillerPhrases = (Array.isArray(clean.fillerPhrases) ? clean.fillerPhrases : []).map((x) => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 20);
    if ('wakeWord' in clean) clean.wakeWord = clean.wakeWord === true;
    if ('conversationSeconds' in clean) clean.conversationSeconds = Math.max(5, Math.min(120, Number(clean.conversationSeconds) || 20));
    store.updateSettings(clean);
    win?.webContents.send('settings-changed', settingsView());
    broadcastAppearance();
    return settingsView();
  }));
  ipcMain.handle('todos', safe(() => store.get('todos')));
  ipcMain.handle('widget:data', safe(async (_e, name) => {
    if (name === 'weather') return weather.get(store.get('settings').city);
    if (name === 'stats') return system.stats();
    if (name === 'media') return system.mediaInfo();
    if (name === 'volume') return system.getVolume();
    if (name === 'schedule') return nextSchedule({ tasks: store.get('tasks'), routines: store.get('routines') }, new Date());
    throw new Error('Widget desconocido');
  }));
  // Acciones desde los propios widgets (botones y deslizador)
  ipcMain.handle('widget:action', safe(async (_e, name, p = {}) => {
    if (name === 'media') return system.media(String(p.action), p.arg ?? '');
    if (name === 'volume' && p.mute !== undefined) return system.setMute(p.mute === true);
    if (name === 'volume') return system.setVolume(Math.max(0, Math.min(100, Number(p.level))));
    throw new Error('Acción desconocida');
  }));
  ipcMain.handle('settings:open', safe(() => openSettings()));
  ipcMain.handle('island:mode', safe((_e, mode) => placeIsland(mode)));
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('quit', () => system?.shutdown());
app.on('window-all-closed', () => app.quit());

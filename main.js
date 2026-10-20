const path = require('path');
const { app, BrowserWindow, globalShortcut, ipcMain, screen, clipboard, shell, desktopCapturer, Notification } = require('electron');
const { createStore } = require('./src/store');
const { createSystem } = require('./src/system');
const { createTools } = require('./src/tools');
const { createAssistant } = require('./src/assistant');
const { createScheduler } = require('./src/scheduler');
const { validateLayout, createWeather, nextSchedule, unavailableWidgets, sanitizeLayout, catalogFor } = require('./src/widgets');

const MODES = { idle: [120, 22], status: [260, 60], peek: [567, 132] };
const HOTKEYS = { talk: 'Control+Shift+Space', dictate: 'Control+Alt+D', circle: 'Control+Shift+C' };

let win = null;
let overlay = null;
let settingsWin = null;

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

app.whenReady().then(() => {
  const store = createStore(path.join(app.getPath('userData'), 'yurei.json'));
  const system = createSystem({ shell, clipboard });
  const tools = createTools({ store, system });
  const assistant = createAssistant({ store, tools });
  const weather = createWeather();
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
  const unavailable = () => unavailableWidgets({ hasBattery: system.hasBattery() });
  const settingsView = () => ({ ...store.get('settings'), apiKey: store.get('settings').apiKey ? '••••••••' : '', widgets: sanitizeLayout(store.get('settings').widgets, unavailable()), widgetCatalog: catalogFor(unavailable()) });

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
  ipcMain.handle('tts', safe((_e, text) => assistant.speak(String(text).slice(0, 1500))));
  ipcMain.handle('wake', safe((_e, audioB64) => assistant.wake(audioB64)));
  ipcMain.handle('settings:get', safe(() => settingsView()));
  ipcMain.handle('settings:save', safe((_e, patch) => {
    const clean = { ...patch };
    if (clean.apiKey === '••••••••') delete clean.apiKey;
    delete clean.widgetCatalog;
    if ('widgets' in clean) clean.widgets = validateLayout(clean.widgets, unavailable());
    if ('city' in clean) clean.city = String(clean.city || '').trim().slice(0, 80);
    if ('wakeWord' in clean) clean.wakeWord = clean.wakeWord === true;
    if ('conversationSeconds' in clean) clean.conversationSeconds = Math.max(5, Math.min(120, Number(clean.conversationSeconds) || 20));
    store.updateSettings(clean);
    win?.webContents.send('settings-changed', settingsView());
    return settingsView();
  }));
  ipcMain.handle('todos', safe(() => store.get('todos')));
  ipcMain.handle('widget:data', safe(async (_e, name) => {
    if (name === 'weather') return weather.get(store.get('settings').city);
    if (name === 'stats') return system.stats();
    if (name === 'schedule') return nextSchedule({ tasks: store.get('tasks'), routines: store.get('routines') }, new Date());
    throw new Error('Widget desconocido');
  }));
  ipcMain.handle('settings:open', safe(() => openSettings()));
  ipcMain.handle('island:mode', safe((_e, mode) => placeIsland(mode)));
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

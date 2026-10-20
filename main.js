const path = require('path');
const { app, BrowserWindow, globalShortcut, ipcMain, screen, clipboard, shell, desktopCapturer, Notification, nativeImage } = require('electron');
const { createStore } = require('./src/store');
const { createSystem } = require('./src/system');
const { createTools } = require('./src/tools');
const { createAssistant } = require('./src/assistant');
const { createScheduler } = require('./src/scheduler');

const MODES = { idle: [120, 22], status: [260, 60], full: [270, 180] };
const HOTKEYS = { talk: 'Control+Shift+Space', dictate: 'Control+Alt+D', circle: 'Control+Shift+C' };

let win = null;
let overlay = null;
let clipHistory = [];

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

function pollClipboard() {
  let last = '';
  setInterval(() => {
    const text = clipboard.readText();
    const img = text ? null : clipboard.readImage();
    const key = text || (img && !img.isEmpty() ? `img:${img.getSize().width}x${img.getSize().height}:${img.toBitmap().length}` : '');
    if (!key || key === last) return;
    last = key;
    const item = text
      ? { kind: /^https?:\/\/\S+$/.test(text.trim()) ? 'link' : 'text', value: text.slice(0, 2000), at: Date.now() }
      : { kind: 'image', value: img.resize({ width: 160 }).toDataURL(), at: Date.now() };
    clipHistory = [item, ...clipHistory.filter((c) => c.value !== item.value)].slice(0, 50);
  }, 800);
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
  const scheduler = createScheduler({
    store, tools,
    report: (r) => {
      new Notification({ title: `Yurei · ${r.label}`, body: r.results.join('\n') }).show();
      win?.webContents.send('report', r);
    }
  });

  createWindow();
  pollClipboard();
  scheduler.start();

  for (const [name, accel] of Object.entries(HOTKEYS)) {
    if (!globalShortcut.register(accel, () => (name === 'circle' ? startCircle() : win.webContents.send('hotkey', name)))) {
      console.warn(`No se pudo registrar el atajo ${accel}`);
    }
  }

  const safe = (fn) => async (...a) => {
    try { return { ok: true, data: await fn(...a) }; } catch (e) { return { ok: false, error: e.message }; }
  };
  const settingsView = () => ({ ...store.get('settings'), apiKey: store.get('settings').apiKey ? '••••••••' : '' });

  ipcMain.handle('ask', safe((_e, payload) => assistant.ask(payload)));
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
    if ('wakeWord' in clean) clean.wakeWord = clean.wakeWord === true;
    if ('conversationSeconds' in clean) clean.conversationSeconds = Math.max(5, Math.min(120, Number(clean.conversationSeconds) || 20));
    store.updateSettings(clean);
    return settingsView();
  }));
  ipcMain.handle('todos', safe(() => store.get('todos')));
  ipcMain.handle('todo:action', safe(async (_e, { action, ref, text }) => {
    const map = { add: ['add_todo', { text }], done: ['complete_todo', { ref }], remove: ['remove_todo', { ref }] };
    if (!map[action]) throw new Error('Acción no válida');
    return tools.execute(...map[action]);
  }));
  ipcMain.handle('schedule', safe(() => tools.execute('list_schedule')));
  ipcMain.handle('clipboard:history', safe(() => clipHistory));
  ipcMain.handle('clipboard:copy', safe((_e, i) => {
    const item = clipHistory[i];
    if (!item) return;
    if (item.kind === 'image') clipboard.writeImage(nativeImage.createFromDataURL(item.value));
    else clipboard.writeText(item.value);
  }));
  ipcMain.handle('apps', safe(() => system.listApps()));
  ipcMain.handle('apps:launch', safe((_e, name) => system.launchApp(name)));
  ipcMain.handle('stats', safe(() => system.stats()));
  ipcMain.handle('power', safe((_e, action) => tools.execute('power_action', { action, confirmed: true })));
  ipcMain.handle('island:mode', safe((_e, mode) => placeIsland(mode)));
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

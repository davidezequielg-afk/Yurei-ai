const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('yurei', {
  ask: invoke('ask'),
  dictate: invoke('dictate'),
  wake: invoke('wake'),
  tts: invoke('tts'),
  getSettings: invoke('settings:get'),
  saveSettings: invoke('settings:save'),
  openSettings: invoke('settings:open'),
  todos: invoke('todos'),
  widgetData: invoke('widget:data'),
  widgetAction: invoke('widget:action'),
  setMode: invoke('island:mode'),
  on: (channel, cb) => {
    const allowed = ['hotkey', 'report', 'circle-image', 'settings-changed'];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => cb(payload));
  }
});

contextBridge.exposeInMainWorld('yureiOverlay', {
  onImage: (cb) => ipcRenderer.on('overlay:image', (_e, dataUrl) => cb(dataUrl)),
  select: (rect) => ipcRenderer.send('overlay:select', rect),
  cancel: () => ipcRenderer.send('overlay:cancel')
});

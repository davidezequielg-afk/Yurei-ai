const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('yurei', {
  ask: invoke('ask'),
  dictate: invoke('dictate'),
  wake: invoke('wake'),
  tts: invoke('tts'),
  getSettings: invoke('settings:get'),
  saveSettings: invoke('settings:save'),
  todos: invoke('todos'),
  todoAction: invoke('todo:action'),
  schedule: invoke('schedule'),
  clipboardHistory: invoke('clipboard:history'),
  clipboardCopy: invoke('clipboard:copy'),
  apps: invoke('apps'),
  launchApp: invoke('apps:launch'),
  stats: invoke('stats'),
  power: invoke('power'),
  setMode: invoke('island:mode'),
  on: (channel, cb) => {
    const allowed = ['hotkey', 'report', 'circle-image'];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => cb(payload));
  }
});

contextBridge.exposeInMainWorld('yureiOverlay', {
  onImage: (cb) => ipcRenderer.on('overlay:image', (_e, dataUrl) => cb(dataUrl)),
  select: (rect) => ipcRenderer.send('overlay:select', rect),
  cancel: () => ipcRenderer.send('overlay:cancel')
});

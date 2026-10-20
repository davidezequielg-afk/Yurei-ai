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
  wipeData: invoke('data:wipe'),
  getAppearance: invoke('appearance:get'),
  todos: invoke('todos'),
  widgetData: invoke('widget:data'),
  widgetAction: invoke('widget:action'),
  launcherData: invoke('launcher:data'),
  launcherSet: invoke('launcher:set'),
  launcherClear: invoke('launcher:clear'),
  launcherOpen: invoke('launcher:open'),
  launcherIcon: invoke('launcher:icon'),
  pickerOpen: invoke('picker:open'),
  setMode: invoke('island:mode'),
  on: (channel, cb) => {
    const allowed = ['hotkey', 'report', 'circle-image', 'settings-changed', 'appearance'];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => cb(payload));
  }
});


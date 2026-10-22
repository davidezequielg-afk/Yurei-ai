// Puente mínimo SOLO para los indicadores de volumen y brillo: leer/cambiar el nivel y, en volumen, el mezclador.
const { contextBridge, ipcRenderer } = require('electron');

const kindOk = (k) => (k === 'brightness' ? 'brightness' : 'volume');
contextBridge.exposeInMainWorld('yureiHud', {
  onShow: (cb) => ipcRenderer.on('hud:state', (_e, s) => cb(s)),
  onAppearance: (cb) => ipcRenderer.on('appearance', (_e, a) => cb(a)),
  getAppearance: () => ipcRenderer.invoke('appearance:get'),
  set: (kind, level) => ipcRenderer.invoke('hud:set', kindOk(kind), Number(level)),
  mute: (on) => ipcRenderer.invoke('hud:mute', on === true),
  mixerList: () => ipcRenderer.invoke('hud:mixer-list'),
  mixerSet: (pid, level) => ipcRenderer.invoke('hud:mixer-set', Number(pid), Number(level)),
  mixerMute: (pid, on) => ipcRenderer.invoke('hud:mixer-mute', Number(pid), on === true),
  size: (w, h) => ipcRenderer.send('hud:size', Number(w), Number(h)),
  busy: (kind, on) => ipcRenderer.send('hud:busy', kindOk(kind), on === true)
});

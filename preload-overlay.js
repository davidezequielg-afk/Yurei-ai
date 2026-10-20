// Puente mínimo SOLO para la ventana de "Circle to Ask": nada más que enviar el recuadro elegido o cancelar.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yureiOverlay', {
  onImage: (cb) => ipcRenderer.on('overlay:image', (_e, dataUrl) => cb(dataUrl)),
  select: (rect) => ipcRenderer.send('overlay:select', { x: Number(rect.x), y: Number(rect.y), w: Number(rect.w), h: Number(rect.h) }),
  cancel: () => ipcRenderer.send('overlay:cancel')
});

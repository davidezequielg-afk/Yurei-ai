const shot = document.getElementById('shot');
const box = document.getElementById('box');
let start = null;

window.yureiOverlay.onImage((dataUrl) => { shot.src = dataUrl; });

const rectOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

window.addEventListener('mousedown', (e) => { start = { x: e.clientX, y: e.clientY }; box.style.display = 'block'; });
window.addEventListener('mousemove', (e) => {
  if (!start) return;
  const r = rectOf(start, { x: e.clientX, y: e.clientY });
  Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
});
window.addEventListener('mouseup', (e) => {
  if (start) window.yureiOverlay.select(rectOf(start, { x: e.clientX, y: e.clientY }));
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.yureiOverlay.cancel(); });

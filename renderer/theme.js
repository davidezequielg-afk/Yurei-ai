// Aplica la apariencia (variables CSS) que calcula el proceso principal; se actualiza sola.
function applyAppearance(a) {
  if (!a || !a.vars) return;
  for (const [key, value] of Object.entries(a.vars)) document.documentElement.style.setProperty(key, value);
  document.documentElement.dataset.mode = a.mode;
}
window.yurei.getAppearance().then((r) => r.ok && applyAppearance(r.data));
window.yurei.on('appearance', applyAppearance);

// Aplica la apariencia (variables CSS) que calcula el proceso principal; se actualiza sola.
function applyAppearance(a) {
  if (!a || !a.vars) return;
  for (const [key, value] of Object.entries(a.vars)) document.documentElement.style.setProperty(key, value);
  document.documentElement.dataset.mode = a.mode;
}
window.yurei.getAppearance().then((r) => r.ok && applyAppearance(r.data));
window.yurei.on('appearance', applyAppearance);

// Accesorio de la carita (gorro, lentes…): se aplica en todas las ventanas que la muestran.
function applyAccessory(acc) {
  if (acc && acc !== 'none') document.documentElement.dataset.acc = acc;
  else delete document.documentElement.dataset.acc;
}
window.yurei.getSettings().then((r) => { if (r.ok) { applyAccessory(r.data.accessory); setLang(r.data.lang); } });
window.yurei.on('settings-changed', (s) => { applyAccessory(s.accessory); setLang(s.lang); });

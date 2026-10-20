const slot = Number(new URLSearchParams(location.search).get('slot') || 0);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.flat().forEach((k) => n.append(k));
  return n;
};

document.getElementById('title').textContent = `Elegir app para el lugar ${slot + 1}`;
let data = { installed: [], suggestions: [] };
const icons = new Map();

async function iconFor(item) {
  const key = `${item.kind}|${item.target}`;
  if (!icons.has(key)) {
    const r = await window.yurei.launcherIcon(item);
    icons.set(key, r.ok ? r.data : null);
  }
  return icons.get(key);
}

function row(item, tag) {
  const art = el('span', { className: 'tile', textContent: item.name[0].toUpperCase() });
  iconFor(item).then((src) => { if (src) art.replaceWith(el('img', { src, alt: '' })); });
  return el('button', {
    className: 'item',
    onclick: async () => {
      const r = await window.yurei.launcherSet(slot, item);
      if (r.ok) window.close();
    }
  }, art, el('span', { className: 'name', textContent: item.name }), el('span', { className: 'tag', textContent: tag }));
}

function render() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const list = document.getElementById('list');
  const sug = data.suggestions.filter((x) => !q || x.name.toLowerCase().includes(q));
  const shown = new Set(sug.map((x) => x.target)); // lo que ya sale en Sugeridas no se repite abajo
  const apps = data.installed.filter((a) => !shown.has(a.file) && (!q || a.name.toLowerCase().includes(q))).slice(0, 80)
    .map((a) => ({ kind: 'app', name: a.name, target: a.file }));
  list.replaceChildren(
    ...(sug.length ? [el('h2', { textContent: 'Sugeridas' }), ...sug.map((x) => row(x, x.kind === 'app' ? 'instalada' : 'web'))] : []),
    ...(apps.length ? [el('h2', { textContent: 'Instaladas' }), ...apps.map((x) => row(x, ''))] : []),
    ...(!sug.length && !apps.length ? [el('div', { className: 'empty', textContent: 'No encontré nada con ese nombre.' })] : [])
  );
}

document.getElementById('q').oninput = render;
window.yurei.launcherData().then((r) => { if (r.ok) { data = r.data; render(); } });

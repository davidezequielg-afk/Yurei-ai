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
  const brand = item.brand && window.brandIcon(item.brand, 24);
  const art = brand || el('span', { className: 'tile', textContent: item.name[0].toUpperCase() });
  if (!(item.kind === 'url' && brand)) iconFor(item).then((src) => { if (src) art.replaceWith(el('img', { src, alt: '' })); });
  return el('button', {
    className: 'item',
    onclick: async () => {
      const r = await window.yurei.launcherSet(slot, item);
      if (r.ok) window.close();
    }
  }, art, el('span', { className: 'name', textContent: item.name }), el('span', { className: 'tag', textContent: tag }));
}

let view = 'sug';

function section(title, items, tag) {
  return items.length ? [el('h2', { textContent: title }), ...items.map((x) => row(x, tag(x)))] : [];
}

function render() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const list = document.getElementById('list');
  const match = (name) => !q || name.toLowerCase().includes(q);
  const sug = data.suggestions.filter((x) => match(x.name));
  const shown = new Set(sug.map((x) => x.target)); // lo que ya sale en Sugeridas no se repite en Instaladas
  const toItem = (a) => ({ kind: 'app', name: a.name, target: a.file });
  const apps = data.installed.filter((a) => match(a.name) && (view === 'inst' || !shown.has(a.file))).slice(0, 120).map(toItem);
  const tag = (x) => (x.kind === 'app' ? 'instalada' : 'web');
  let out;
  if (q) {
    out = [...section('Sugeridas', sug, tag), ...section('Instaladas', apps, () => '')];
  } else if (view === 'sug') {
    const cats = [...new Set(data.suggestions.map((x) => x.category))];
    out = cats.flatMap((c) => section(c, data.suggestions.filter((x) => x.category === c), tag));
  } else {
    out = apps.length ? apps.map((x) => row(x, '')) : [el('div', { className: 'empty', textContent: 'No hay apps instaladas para listar (esto solo funciona en Windows).' })];
  }
  list.replaceChildren(...(out.length ? out : [el('div', { className: 'empty', textContent: 'No encontré nada con ese nombre.' })]));
}

document.getElementById('tabs').onclick = (e) => {
  if (!e.target.dataset.v) return;
  view = e.target.dataset.v;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b === e.target));
  render();
};
document.getElementById('q').oninput = render;
window.yurei.launcherData().then((r) => { if (r.ok) { data = r.data; render(); } });

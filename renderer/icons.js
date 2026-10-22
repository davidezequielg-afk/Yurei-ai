// Iconos de línea fina (un solo color, heredan el color del texto).
const ICONS = {
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5"/><path d="M21 9.5l-5 5"/>',
  prev: '<path d="M6.5 5v14"/><path d="M18 5.5L9.5 12l8.5 6.5z" fill="currentColor"/>',
  next: '<path d="M17.5 5v14"/><path d="M6 5.5l8.5 6.5L6 18.5z" fill="currentColor"/>',
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
  pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/>',
  rewind: '<path d="M11 7l-7 5 7 5z"/><path d="M20 7l-7 5 7 5z"/>',
  forward: '<path d="M13 7l7 5-7 5z"/><path d="M4 7l7 5-7 5z"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  close: '<path d="M7 7l10 10M17 7L7 17"/>',
  settings: '<path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/>',
  plug: '<path d="M9 3v5"/><path d="M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  cloud: '<path d="M6.5 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 9.2a4.7 4.7 0 0 0-.1 9.3z"/>',
  partly: '<circle cx="8" cy="8" r="2.6"/><path d="M8 2.5v1.4M2.5 8h1.4M4.1 4.1l1 1M11.9 4.1l-1 1"/><path d="M9.5 19h8a3.5 3.5 0 0 0 .5-6.96A4.8 4.8 0 0 0 9 12.3 3.4 3.4 0 0 0 9.5 19z"/>',
  rain: '<path d="M6.5 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 5.2a4.7 4.7 0 0 0-.1 9.3z"/><path d="M8 17.5l-1 3M12 17.5l-1 3M16 17.5l-1 3"/>',
  snow: '<path d="M6.5 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 5.2a4.7 4.7 0 0 0-.1 9.3z"/><circle cx="8" cy="18.5" r=".7" fill="currentColor"/><circle cx="12" cy="20" r=".7" fill="currentColor"/><circle cx="16" cy="18.5" r=".7" fill="currentColor"/>',
  storm: '<path d="M6.5 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 5.2a4.7 4.7 0 0 0-.1 9.3z"/><path d="M12.5 15.5L10 19h3l-2 3.5"/>',
  fog: '<path d="M4 8h16M6 12h12M4 16h16M7 20h10"/>',
  download: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v6M9 12l3 3 3-3"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  cpu: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3"/>',
  ram: '<rect x="3.5" y="8" width="17" height="8" rx="1.5"/><path d="M7 12v.01M11 12v.01M15 12v.01M7 16v2M12 16v2M17 16v2"/>',
  disk: '<rect x="4" y="7" width="16" height="10" rx="2"/><path d="M7 14h4"/><circle cx="16.5" cy="14" r=".6" fill="currentColor"/>',
  net: '<path d="M8 20V6M5 9l3-3 3 3M16 4v14M13 15l3 3 3-3"/>',
  wifi: '<path d="M3.5 9.5a12 12 0 0 1 17 0"/><path d="M6.5 12.8a7.7 7.7 0 0 1 11 0"/><path d="M9.6 16a3.4 3.4 0 0 1 4.8 0"/><circle cx="12" cy="19" r=".8" fill="currentColor"/>',
  bluetooth: '<path d="M7 7l10 10-5 4V3l5 4L7 17"/>',
  brightness: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  moon2: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  battery: '<rect x="3" y="8" width="16" height="9" rx="2"/><path d="M21 11v3"/>',
  tray: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 14h4l1.5 2h5L16 14h4"/>',
  power: '<path d="M12 4v8"/><path d="M7 7a7 7 0 1 0 10 0"/>',
  restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4v4h4"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.4-5.5"/><path d="M19.5 4v4h-4"/>',
  folder: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
  file: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5z"/><path d="M14 3.5V8h4"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  drive: '<rect x="3.5" y="10" width="17" height="6" rx="1.5"/><circle cx="17" cy="13" r=".7" fill="currentColor"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
  windows: '<path d="M4 6.5l7-1v6H4zM12 5.4l8-1.4v7.5h-8zM4 12.5h7v6l-7-1zM12 12.5h8V20l-8-1.4z" fill="currentColor" stroke="none"/>',
  music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>'
};

function icon(name, size = 16) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.cloud}</svg>`;
  return span;
}

// Batería con nivel (0-1) y, si carga, un rayo encima.
function batteryIcon(level, charging, size = 28) {
  const w = Math.max(0, Math.min(1, level)) * 13;
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="18" height="10" rx="2.5"/><path d="M22 10.5v3"/><rect x="4.5" y="9.5" width="${w}" height="5" rx="1" fill="currentColor" stroke="none"/>${charging ? '<path class="bolt" d="M12.5 8.5l-2.2 3.5h3l-2.2 3.5" stroke-width="1.8"/>' : ''}</svg>`;
  return span;
}

// Logo oficial de una marca (de brandicons.js). Si su color se pierde sobre el fondo del tema, usa el color del texto.
function brandIcon(slug, size = 26) {
  const b = typeof BRAND_ICONS !== 'undefined' && BRAND_ICONS[slug];
  if (!b) return null;
  const [r, g, bl] = [0, 2, 4].map((i) => parseInt(b.hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  const dark = document.documentElement.dataset.mode !== 'light';
  const fill = (dark && lum < 0.1) || (!dark && lum > 0.85) ? 'var(--ink)' : `#${b.hex}`;
  const span = document.createElement('span');
  span.className = 'brand';
  span.title = b.title;
  const safe = (v) => String(v).replace(/[^A-Za-z0-9 .,'+-]/g, ''); // los datos son propios, pero nunca se inserta nada sin limpiar
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" role="img" aria-label="${safe(b.title)}"><path d="${String(b.path).replace(/[^A-Za-z0-9 .,-]/g, '')}" fill="${/^#[0-9a-f]{6}$/i.test(fill) || fill === 'var(--ink)' ? fill : '#888'}"/></svg>`;
  return span;
}

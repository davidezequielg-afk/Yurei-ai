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
  fog: '<path d="M4 8h16M6 12h12M4 16h16M7 20h10"/>'
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

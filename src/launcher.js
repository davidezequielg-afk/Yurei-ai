// Accesos a apps: 4 lugares dentro de un widget. Cada uno es una app instalada o una web.

const SLOTS = 4;

// Sugeridas: si la app está instalada se abre la app; si no, la versión web.
const SUGGESTIONS = [
  { name: 'WhatsApp', match: ['whatsapp'], url: 'https://web.whatsapp.com' },
  { name: 'Instagram', match: ['instagram'], url: 'https://www.instagram.com' },
  { name: 'Chrome', match: ['google chrome', 'chrome'], url: 'https://www.google.com' },
  { name: 'Discord', match: ['discord'], url: 'https://discord.com/app' },
  { name: 'Spotify', match: ['spotify'], url: 'https://open.spotify.com' },
  { name: 'YouTube', match: ['youtube'], url: 'https://www.youtube.com' },
  { name: 'Gmail', match: [], url: 'https://mail.google.com' },
  { name: 'Telegram', match: ['telegram'], url: 'https://web.telegram.org' },
  { name: 'Netflix', match: ['netflix'], url: 'https://www.netflix.com' },
  { name: 'Notion', match: ['notion'], url: 'https://www.notion.so' },
  { name: 'GitHub', match: ['github desktop', 'github'], url: 'https://github.com' },
  { name: 'X', match: [], url: 'https://x.com' }
];

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function sanitizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  const name = String(item.name || '').trim().slice(0, 40);
  const target = String(item.target || '');
  if (!name || !target) return null;
  if (item.kind === 'app') return { kind: 'app', name, target };
  if (item.kind === 'url') {
    try {
      const u = new URL(target);
      return ['http:', 'https:'].includes(u.protocol) ? { kind: 'url', name, target: u.href } : null;
    } catch {
      return null;
    }
  }
  return null;
}

const normalizeLauncher = (list) => Array.from({ length: SLOTS }, (_, i) => sanitizeItem(list?.[i]));

function findApp(name, installed) {
  const n = norm(name);
  if (!n) return null;
  return installed.find((a) => norm(a.name) === n) || installed.find((a) => norm(a.name).includes(n)) || null;
}

function resolveSuggestion(suggestion, installed) {
  for (const m of suggestion.match) {
    const app = findApp(m, installed);
    if (app) return { kind: 'app', name: app.name, target: app.file };
  }
  return { kind: 'url', name: suggestion.name, target: new URL(suggestion.url).href };
}

// Resuelve lo que el usuario nombra ("whatsapp", "mi discord") a una app o web.
function resolveByName(name, installed) {
  const n = norm(name);
  const words = n.split(/\s+/);
  // exacto, o una palabra del texto ("mi discord"), o el comienzo ("insta"); nunca una letra suelta dentro de otra palabra
  const sug = SUGGESTIONS.find((s) => norm(s.name) === n) || SUGGESTIONS.find((s) => words.includes(norm(s.name))) || SUGGESTIONS.find((s) => n.length > 2 && norm(s.name).startsWith(n));
  if (sug) return resolveSuggestion(sug, installed);
  const app = findApp(name, installed);
  return app ? { kind: 'app', name: app.name, target: app.file } : null;
}

const searchApps = (query, installed, limit = 60) => {
  const q = norm(query);
  return installed.filter((a) => !q || norm(a.name).includes(q)).slice(0, limit);
};

function setSlot(list, slot, item) {
  const i = Number(slot);
  if (!Number.isInteger(i) || i < 0 || i >= SLOTS) throw new Error('Lugar no válido: son 4, del 1 al 4');
  const out = normalizeLauncher(list);
  if (item === null) {
    out[i] = null;
    return out;
  }
  const clean = sanitizeItem(item);
  if (!clean) throw new Error('App o dirección no válida');
  out[i] = clean;
  return out;
}

const firstFree = (list) => normalizeLauncher(list).findIndex((x) => x === null);

// Una app solo se abre si es una de las instaladas (no se ejecutan rutas arbitrarias).
const isAllowed = (item, installed) => item.kind !== 'app' || installed.some((a) => a.file === item.target);

module.exports = { SLOTS, SUGGESTIONS, sanitizeItem, normalizeLauncher, findApp, resolveSuggestion, resolveByName, searchApps, setSlot, firstFree, isAllowed };

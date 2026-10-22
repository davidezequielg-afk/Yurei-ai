// Validación de todo lo que entra al proceso principal desde las ventanas (IPC) y de los ajustes guardados.
// Principio: lo que no se reconoce se descarta o se rechaza; nada se confía por venir "de dentro".

const path = require('path');
const { fileURLToPath } = require('url');
const { THEMES, TRANSPARENCY, HEX } = require('./theme');
const { validateLayout } = require('./widgets');

const MAX_AUDIO_B64 = 12 * 1024 * 1024; // ~9 MB de audio: de sobra para 2 minutos de dictado
const MAX_IMAGE_B64 = 24 * 1024 * 1024;
const MAX_TEXT = 4000;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MASK = '••••••••';

// ¿Esta URL es una página local de la app (dentro de `root`)? Solo esas pueden usar el puente IPC.
function isTrustedUrl(url, root) {
  try {
    if (typeof url !== 'string' || !url.startsWith('file:')) return false;
    const fold = (v) => (process.platform === 'win32' ? v.toLowerCase() : v); // c:\ y C:\ son la misma ruta en Windows
    const file = fold(path.resolve(fileURLToPath(url)));
    const base = fold(path.resolve(root));
    return file === base || file.startsWith(base + path.sep);
  } catch {
    return false;
  }
}

function b64(value, max, what) {
  if (typeof value !== 'string' || !value.length) throw new Error(`${what} vacío`);
  if (value.length > max) throw new Error(`${what} demasiado grande`);
  if (!B64.test(value)) throw new Error(`${what} no válido`);
  return value;
}

const validateAudio = (v) => b64(v, MAX_AUDIO_B64, 'Audio');

function validateAskPayload(p) {
  if (!p || typeof p !== 'object') throw new Error('Petición no válida');
  const out = {};
  if (p.text !== undefined) {
    if (typeof p.text !== 'string') throw new Error('Texto no válido');
    out.text = p.text.slice(0, MAX_TEXT);
  }
  if (p.audioB64 !== undefined) out.audioB64 = validateAudio(p.audioB64);
  if (p.imageB64 !== undefined) out.imageB64 = b64(p.imageB64, MAX_IMAGE_B64, 'Imagen');
  if (!out.text && !out.audioB64) throw new Error('Nada que procesar');
  return out;
}

const text = (v, max, name) => {
  if (typeof v !== 'string') throw new Error(`${name} no válido`);
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
};
const bool = (v) => v === true;
const MODEL = /^[a-z0-9][a-z0-9._-]{1,79}$/i;
const VOICE = /^[A-Za-z]{2,30}$/;
const KEY = /^[\w.-]{10,200}$/;

const ACCESSORIES = ['none', 'gorro', 'lentes', 'mono', 'corona', 'flor'];
const PTT_KEYS = ['off', 'rctrl', 'ralt', 'f8', 'f9'];
const { PRESETS: BRAIN_PRESETS } = require('./brains');

// Dirección de la IA: https a cualquier sitio, o http solo a tu propia PC (OmniRoute, Ollama, LM Studio).
// Nunca con usuario/contraseña dentro de la dirección.
function validateBrainUrl(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return '';
  if (raw.length > 200) throw new Error('Dirección demasiado larga');
  let u;
  try { u = new URL(raw); } catch { throw new Error('Dirección no válida'); }
  if (u.username || u.password) throw new Error('No pongas usuario ni contraseña en la dirección');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) throw new Error('Usa https (o http solo para algo que corre en tu PC)');
  return u.href.replace(/\/+$/, '');
}

// Atajos: modificadores + una tecla, en el formato de Electron. Nada de teclas solas (romperían la escritura).
const HOTKEY = /^(?:(?:Control|Alt|Shift|Super)\+){1,3}(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Space|Enter|Tab|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete|Plus|-|=|,|\.|\/|;|')$/;
function validateHotkeys(v) {
  if (!v || typeof v !== 'object') throw new Error('Atajos no válidos');
  const out = {};
  for (const k of ['talk', 'dictate', 'circle']) {
    const a = String(v[k] || '').trim();
    if (!HOTKEY.test(a)) throw new Error(`Atajo no válido: ${a || '(vacío)'}`);
    out[k] = a;
  }
  if (new Set(Object.values(out)).size !== 3) throw new Error('Dos acciones no pueden tener el mismo atajo');
  return out;
}

// Modos: lista corta, nombres simples, cada campo con su tope.
function validateModes(v) {
  if (!Array.isArray(v)) throw new Error('Modos no válidos');
  const seen = new Set();
  return v.slice(0, 8).map((m) => {
    const name = String(m?.name || '').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 24).toLowerCase();
    if (!name || seen.has(name)) return null;
    seen.add(name);
    const vol = m.volume === null || m.volume === undefined || m.volume === '' ? null : Math.max(0, Math.min(100, Math.round(Number(m.volume)) || 0));
    return {
      name,
      apps: (Array.isArray(m.apps) ? m.apps : []).map((a) => String(a).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40)).filter(Boolean).slice(0, 6),
      volume: vol,
      media: ['play', 'pause'].includes(m.media) ? m.media : null,
      pomodoro: Math.max(0, Math.min(180, Math.round(Number(m.pomodoro)) || 0)),
      dnd: m.dnd === true
    };
  }).filter(Boolean);
}

const STATUS_WIDGETS = ['weather', 'battery', 'cpu', 'ram', 'disk', 'net'];
function validateStatusWidgets(v) {
  const clean = (a) => [...new Set((Array.isArray(a) ? a : []).filter((x) => STATUS_WIDGETS.includes(x)))];
  const left = clean(v?.left);
  const right = clean(v?.right).filter((x) => !left.includes(x));
  if (left.length + right.length > 4) throw new Error('Como mucho 4 widgets en la isla');
  return { left, right };
}

// Lista blanca de ajustes que pueden cambiar las ventanas. Lo demás (tareas, rutinas, accesos…) tiene sus propios canales.
function validateSettingsPatch(patch, { unavailable = [] } = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Ajustes no válidos');
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    switch (k) {
      case 'apiKey':
        if (v === MASK) break; // la clave nunca vuelve a la ventana: la máscara significa "sin cambios"
        if (typeof v !== 'string') throw new Error('Clave no válida');
        if (v.trim() && !KEY.test(v.trim())) throw new Error('La API key tiene un formato no válido');
        out.apiKey = v.trim();
        break;
      case 'model': case 'ttsModel':
        if (typeof v !== 'string' || !MODEL.test(v.trim())) throw new Error(`Nombre de modelo no válido (${k})`);
        out[k] = v.trim();
        break;
      case 'voice':
        if (typeof v !== 'string' || !VOICE.test(v)) throw new Error('Voz no válida');
        out.voice = v;
        break;
      case 'soul': out.soul = text(v, 40, 'Nombre') || 'Yurei'; break;
      case 'personality': out.personality = text(v, 500, 'Personalidad'); break;
      case 'city': out.city = text(v, 80, 'Ciudad'); break;
      case 'abilities':
        if (!Array.isArray(v)) throw new Error('Habilidades no válidas');
        out.abilities = v.slice(0, 20).map((x) => text(String(x), 300, 'Habilidad')).filter(Boolean);
        break;
      case 'fillerPhrases':
        if (!Array.isArray(v)) throw new Error('Frases no válidas');
        out.fillerPhrases = v.slice(0, 20).map((x) => text(String(x), 80, 'Frase')).filter(Boolean);
        break;
      case 'systemVoice': case 'wakeWord': case 'fillers': case 'fetchFavicons': case 'dnd': case 'bargeIn': case 'autoUpdate': case 'onboarded': case 'time24': case 'hoverOpen': case 'notchRememberPanel': case 'calendarEnabled': case 'timerSound': case 'musicEnabled': case 'musicCompact': case 'mediaAmbience': case 'mediaCompactGlow': case 'mediaVisualizer': case 'mediaAlbumArt': case 'shelfPersist': case 'showUpdateDot': case 'volumeHud': case 'volumeEdge': case 'brightnessHud': case 'brightnessEdge': case 'openAtLogin': case 'morningBrief': case 'seasonal': case 'reactions': out[k] = bool(v); break;
      case 'breakEvery': out[k] = [0, 30, 45, 60, 90, 120].includes(Number(v)) ? Number(v) : 60; break;
      case 'birthday': if (v !== '' && !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(v))) throw new Error('Cumpleaños no válido (MM-DD)'); out[k] = String(v); break;
      case 'pushToTalk': if (!PTT_KEYS.includes(v)) throw new Error('Tecla no válida'); out[k] = v; break;      case 'conversationSeconds': out[k] = Math.max(5, Math.min(120, Math.round(Number(v)) || 20)); break;
      case 'opacity': out[k] = Math.max(30, Math.min(100, Math.round(Number(v)) || 78)); break;
      case 'notchMode': if (!['fixed', 'smart', 'peek'].includes(v)) throw new Error('Modo no válido'); out[k] = v; break;
      case 'notchEdgeDelay': out[k] = Math.max(0, Math.min(800, Math.round(Number(v) / 50) * 50 || 0)); break;
      case 'notchDefaultPanel': if (!['calendar', 'control'].includes(v)) throw new Error('Panel no válido'); out[k] = v; break;
      case 'notchLastPanel': if (!['yurei', 'calendar', 'control'].includes(v)) throw new Error('Panel no válido'); out[k] = v; break;
      case 'mediaLayout': if (!['classic', 'compact'].includes(v)) throw new Error('Diseño no válido'); out[k] = v; break;
      case 'lowBattery': out[k] = Math.max(5, Math.min(50, Math.round(Number(v) / 5) * 5 || 20)); break;
      case 'statusWidgets': out[k] = validateStatusWidgets(v); break;
      case 'timerDuration': out[k] = Math.max(1, Math.min(180 * 60, Math.round(Number(v)) || 1500)); break;
      case 'uiScale': out[k] = [80, 90, 100, 110, 120, 130].includes(Math.round(Number(v))) ? Math.round(Number(v)) : 100; break;
      case 'themeSat': case 'themeBright': out[k] = Math.max(0, Math.min(100, Math.round(Number(v)) || 0)); break;
      case 'theme': if (!THEMES.includes(v)) throw new Error('Tema no válido'); out[k] = v; break;
      case 'transparency': if (!TRANSPARENCY.includes(v)) throw new Error('Transparencia no válida'); out[k] = v; break;
      case 'customBg': case 'customAccent': if (!HEX.test(String(v))) throw new Error('Color no válido'); out[k] = String(v).toLowerCase(); break;
      case 'modes': out.modes = validateModes(v); break;
      case 'brainPreset': if (!Object.hasOwn(BRAIN_PRESETS, v)) throw new Error('IA no válida'); out[k] = v; break;
      case 'brainProvider': if (!['gemini', 'anthropic', 'openai'].includes(v)) throw new Error('Proveedor no válido'); out[k] = v; break;
      case 'brainBase': out[k] = validateBrainUrl(v); break;
      case 'brainModel': case 'sttModel': case 'brainTtsModel':
        if (typeof v !== 'string' || !/^[\w.:@/-]{0,100}$/.test(v.trim())) throw new Error('Nombre de modelo no válido');
        out[k] = v.trim();
        break;
      case 'brainKey':
        if (v === MASK) break;
        if (typeof v !== 'string' || v.length > 400 || /[\s\u0000-\u001f]/.test(v.trim())) throw new Error('Clave no válida');
        out[k] = v.trim();
        break;
      case 'hearing': if (!['auto', 'gemini', 'brain'].includes(v)) throw new Error('Opción no válida'); out[k] = v; break;
      case 'speech': if (!['auto', 'gemini', 'brain', 'system'].includes(v)) throw new Error('Opción no válida'); out[k] = v; break;
      case 'brainVoice': if (typeof v !== 'string' || !/^[\w-]{1,30}$/.test(v)) throw new Error('Voz no válida'); out[k] = v; break;
      case 'language': if (!['auto', 'es', 'en'].includes(v)) throw new Error('Idioma no válido'); out[k] = v; break;
      case 'accessory': if (!ACCESSORIES.includes(v)) throw new Error('Accesorio no válido'); out[k] = v; break;
      case 'widgets': out.widgets = validateLayout(v, unavailable); break;
      default: break; // clave desconocida (incluye launcher y widgetCatalog): se descarta
    }
  }
  return out;
}

const MEDIA_ACTIONS = ['play', 'pause', 'toggle', 'next', 'prev', 'seek'];

function validateMediaAction(p) {
  const action = String(p?.action);
  if (!MEDIA_ACTIONS.includes(action)) throw new Error('Acción de reproducción no válida');
  if (action !== 'seek') return { action, arg: '' };
  const secs = Math.max(-600, Math.min(600, Math.round(Number(p.arg))));
  if (Number.isNaN(secs)) throw new Error('Segundos no válidos');
  return { action, arg: secs };
}

// Solo números enteros de verdad: Number(null), Number('') o Number([]) valen 0 y colarían como el lugar 0.
const validateSlot = (v) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 3) throw new Error('Lugar no válido');
  return v;
};

// Tapa del disco que entrega Windows: solo PNG/JPEG/BMP pequeños y que de verdad lo sean (se miran los primeros bytes).
const IMAGE_MAGIC = [['image/png', [0x89, 0x50, 0x4e, 0x47]], ['image/jpeg', [0xff, 0xd8, 0xff]], ['image/bmp', [0x42, 0x4d]]];
function coverDataUrl(cover, maxBytes = 716800) {
  if (!cover || typeof cover.b64 !== 'string' || cover.b64.length > Math.ceil(maxBytes / 3) * 4 + 4) return null;
  const buf = Buffer.from(cover.b64, 'base64');
  if (!buf.length || buf.length > maxBytes) return null;
  const hit = IMAGE_MAGIC.find(([, sig]) => sig.every((b, i) => buf[i] === b));
  return hit ? `data:${hit[0]};base64,${buf.toString('base64')}` : null;
}

module.exports = { validateStatusWidgets, validateBrainUrl, validateHotkeys, PTT_KEYS, validateModes, coverDataUrl, isTrustedUrl, validateAudio, validateAskPayload, validateSettingsPatch, validateMediaAction, validateSlot, MASK, MAX_AUDIO_B64 };

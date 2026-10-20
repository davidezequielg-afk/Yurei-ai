const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  settings: {
    apiKey: '',
    model: 'gemini-3.5-flash-lite',
    ttsModel: 'gemini-3.8-flash-tts',
    soul: 'Yurei',
    personality: 'Amable, directo y breve. Responde en el idioma del usuario.',
    voice: 'Kore',
    systemVoice: false,
    abilities: [],
    wakeWord: false,
    launcher: [null, null, null, null],
    theme: 'dark',
    customBg: '#101114',
    customAccent: '#6cb8f0',
    transparency: 'off',
    opacity: 78,
    fetchFavicons: false,
    fillers: true,
    fillerPhrases: [],
    widgets: ['yurei', 'clock', 'todos'],
    city: '',
    conversationSeconds: 20,
    dnd: false
  },
  todos: [],
  tasks: [],
  routines: [],
  memory: [] // lo que Yurei recuerda de ti: [{ id, text, at }]
};

// Modelos que Google ya no ofrece a cuentas nuevas: se migran al guardar/cargar.
const LEGACY = {
  model: ['gemini-2.5-flash', 'gemini-2.0-flash'],
  ttsModel: ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview']
};

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

// `secret` (opcional): { encrypt(texto) → base64, decrypt(base64) → texto }, p. ej. el almacén seguro de Windows (DPAPI).
// Con él, la API key nunca se escribe en disco en claro.
function createStore(file, { secret = null } = {}) {
  let data = clone(DEFAULTS);
  let migrate = false;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const s = { ...(saved.settings || {}) };
    if (typeof s.apiKeyEnc === 'string') {
      try { s.apiKey = secret ? secret.decrypt(s.apiKeyEnc) : ''; } catch { s.apiKey = ''; } // otro usuario o equipo: hay que volver a escribirla
    } else if (s.apiKey && secret) {
      migrate = true; // venía en claro de una versión anterior: se reescribe cifrada
    }
    delete s.apiKeyEnc;
    data = { ...data, ...saved, settings: { ...data.settings, ...s } };
    for (const [key, old] of Object.entries(LEGACY)) {
      if (old.includes(data.settings[key])) data.settings[key] = DEFAULTS.settings[key];
    }
  } catch {
    // primer arranque o archivo corrupto: se usan los valores por defecto
  }

  function save() {
    const out = clone(data);
    if (secret && out.settings.apiKey) {
      out.settings.apiKeyEnc = secret.encrypt(out.settings.apiKey);
      delete out.settings.apiKey;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2), { mode: 0o600 }); // solo el usuario (en sistemas POSIX)
    fs.renameSync(tmp, file); // atómico: nunca queda un archivo a medias
  }

  if (migrate) save();

  return {
    get: (key) => data[key],
    set(key, value) {
      data[key] = value;
      save();
    },
    updateSettings(patch) {
      data.settings = { ...data.settings, ...patch };
      save();
    },
    save,
    nextId: (key) => (data[key] || []).reduce((m, x) => Math.max(m, x.id), 0) + 1,
    encrypted: () => !!secret,
    // Borra todo lo guardado y vuelve a los valores de fábrica.
    wipe() {
      data = clone(DEFAULTS);
      fs.rmSync(file, { force: true });
    }
  };
}

module.exports = { createStore, DEFAULTS };

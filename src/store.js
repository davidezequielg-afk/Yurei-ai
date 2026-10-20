const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  settings: {
    apiKey: '',
    model: 'gemini-3.5-flash-lite',
    soul: 'Yurei',
    personality: 'Amable, directo y breve. Responde en el idioma del usuario.',
    voice: 'Kore',
    ttsModel: 'gemini-3.8-flash-tts',
    systemVoice: false,
    abilities: [],
    wakeWord: false,
    theme: 'dark',
    customBg: '#101114',
    customAccent: '#6cb8f0',
    transparency: 'off',
    opacity: 78,
    fillers: true,
    fillerPhrases: [],
    widgets: ['yurei', 'clock', 'todos'],
    city: '',
    conversationSeconds: 20
  },
  todos: [],
  tasks: [],
  routines: []
};

// Modelos que Google ya no ofrece a cuentas nuevas: se migran al guardar/cargar.
const LEGACY = {
  model: ['gemini-2.5-flash', 'gemini-2.0-flash'],
  ttsModel: ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview']
};

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function createStore(file) {
  let data = clone(DEFAULTS);
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = { ...data, ...saved, settings: { ...data.settings, ...(saved.settings || {}) } };
    for (const [key, old] of Object.entries(LEGACY)) {
      if (old.includes(data.settings[key])) data.settings[key] = DEFAULTS.settings[key];
    }
  } catch {
    // primer arranque o archivo corrupto: se usan los valores por defecto
  }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

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
    nextId: (key) => data[key].reduce((m, x) => Math.max(m, x.id), 0) + 1
  };
}

module.exports = { createStore, DEFAULTS };

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  settings: {
    apiKey: '',
    model: 'gemini-2.5-flash',
    soul: 'Yurei',
    personality: 'Amable, directo y breve. Responde en el idioma del usuario.',
    voice: 'Kore',
    ttsModel: 'gemini-2.5-flash-preview-tts',
    systemVoice: false,
    abilities: [],
    wakeWord: false,
    conversationSeconds: 20
  },
  todos: [],
  tasks: [],
  routines: []
};

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function createStore(file) {
  let data = clone(DEFAULTS);
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = { ...data, ...saved, settings: { ...data.settings, ...(saved.settings || {}) } };
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

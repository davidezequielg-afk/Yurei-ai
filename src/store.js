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
    transparency: 'on', // como Bloom: negro translúcido al 80 %
    opacity: 80,
    time24: false,
    hoverOpen: true, // abrir el panel al pasar el mouse (si no, solo con clic)
    notchMode: 'fixed', // fixed | smart | peek
    notchEdgeDelay: 200,
    notchRememberPanel: true,
    notchDefaultPanel: 'calendar',
    notchLastPanel: 'yurei',
    calendarEnabled: true,
    timerSound: true,
    timerDuration: 1500, // último tiempo usado, en segundos
    musicEnabled: true,
    musicCompact: true, // visualizador y portada en la píldora cerrada
    mediaLayout: 'classic', // classic | compact
    mediaAmbience: true,
    mediaCompactGlow: true,
    mediaVisualizer: true,
    mediaAlbumArt: true,
    shelfPersist: false,
    showUpdateDot: true,
    lowBattery: 20,
    statusWidgets: { left: ['weather'], right: ['battery'] },
    volumeHud: true, volumeEdge: true, brightnessHud: true, brightnessEdge: true,
    uiScale: 100, // tamaño de la interfaz (80 a 130 %)
    themeSat: 50,
    themeBright: 15,
    fetchFavicons: false,
    fillers: true,
    fillerPhrases: [],
    widgets: ['yurei', 'clock', 'todos'],
    city: '',
    conversationSeconds: 20,
    dnd: false,
    accessory: 'none',
    bargeIn: true, // interrumpirla hablándole encima
    autoUpdate: true, // buscar versiones nuevas en GitHub
    onboarded: false, // ya vio la bienvenida
    language: 'auto', // idioma de la interfaz: auto | es | en
    openAtLogin: true, // abrir Yurei al iniciar Windows
    morningBrief: false, // resumen hablado la primera vez que se abre a la mañana
    breakEvery: 60, // minutos de uso entre sugerencias de pausa (0 = nunca)
    seasonal: true, // disfraces según la fecha (Halloween, Navidad, cumpleaños)
    birthday: '', // MM-DD
    reactions: true, // reacciona al cargador, batería baja y CPU al máximo
    pushToTalk: 'off', // tecla para mantener apretada y hablar: off | rctrl | ralt | f8 | f9
    // Cerebro: con qué IA piensa Yurei. 'gemini' usa la clave de arriba; el resto, brainKey/brainBase/brainModel.
    brainPreset: 'gemini',
    brainProvider: 'gemini', // gemini | anthropic | openai (compatible)
    brainBase: '',
    brainModel: '',
    brainKey: '',
    hearing: 'auto', // voz → texto: auto | gemini | brain (transcripción del proveedor)
    sttModel: '',
    speech: 'auto', // texto → voz: auto | gemini | brain | system
    brainTtsModel: '',
    brainVoice: 'alloy',
    hotkeys: { talk: 'Control+Shift+Space', dictate: 'Control+Alt+D', circle: 'Control+Shift+C' },
    // Modos con nombre: "modo gamer" abre sus apps, ajusta el volumen, etc.
    modes: [
      { name: 'gamer', apps: ['Discord', 'Steam'], volume: 60, media: null, pomodoro: 0, dnd: false },
      { name: 'estudio', apps: [], volume: 25, media: 'pause', pomodoro: 25, dnd: true },
      { name: 'cine', apps: [], volume: 80, media: null, pomodoro: 0, dnd: true }
    ]
  },
  todos: [],
  tasks: [],
  routines: [],
  memory: [], // lo que Yurei recuerda de ti: [{ id, text, at }]
  reminders: [], // recordatorios hablados: [{ id, text, at, done }]
  shelf: [], // bandeja de la isla
  notes: [], // notas rápidas: [{ id, text, at }]
  focusStats: {} // concentración por día: { 'YYYY-MM-DD': { pomodoros, minutes } }
};

// Modelos que Google ya no ofrece a cuentas nuevas: se migran al guardar/cargar.
const LEGACY = {
  model: ['gemini-2.5-flash', 'gemini-2.0-flash'],
  ttsModel: ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview']
};

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

// Claves que nunca se escriben en claro: la de Gemini y la del "cerebro" elegido (Claude, OpenAI…).
const SECRET_KEYS = ['apiKey', 'brainKey'];

// `secret` (opcional): { encrypt(texto) → base64, decrypt(base64) → texto }, p. ej. el almacén seguro de Windows (DPAPI).
// Con él, la API key nunca se escribe en disco en claro.
function createStore(file, { secret = null } = {}) {
  let data = clone(DEFAULTS);
  let migrate = false;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const s = { ...(saved.settings || {}) };
    for (const k of SECRET_KEYS) {
      if (typeof s[`${k}Enc`] === 'string') {
        try { s[k] = secret ? secret.decrypt(s[`${k}Enc`]) : ''; } catch { s[k] = ''; } // otro usuario o equipo: hay que volver a escribirla
      } else if (s[k] && secret) {
        migrate = true; // venía en claro de una versión anterior: se reescribe cifrada
      }
      delete s[`${k}Enc`];
    }
    data = { ...data, ...saved, settings: { ...data.settings, ...s } };
    for (const [key, old] of Object.entries(LEGACY)) {
      if (old.includes(data.settings[key])) data.settings[key] = DEFAULTS.settings[key];
    }
  } catch {
    // primer arranque o archivo corrupto: se usan los valores por defecto
  }

  function save() {
    const out = clone(data);
    for (const k of SECRET_KEYS) {
      if (secret && out.settings[k]) {
        out.settings[`${k}Enc`] = secret.encrypt(out.settings[k]);
        delete out.settings[k];
      }
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

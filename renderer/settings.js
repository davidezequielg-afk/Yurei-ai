// Voces de Gemini con su carácter (según la documentación de Google), para elegir sin probar a ciegas.
const GEMINI_VOICES = [
  ['Kore', 'firme'], ['Puck', 'alegre'], ['Charon', 'informativa'], ['Zephyr', 'luminosa'], ['Fenrir', 'animada'], ['Leda', 'juvenil'],
  ['Orus', 'firme'], ['Aoede', 'fresca'], ['Callirrhoe', 'tranquila'], ['Autonoe', 'luminosa'], ['Enceladus', 'susurrante'], ['Iapetus', 'clara'],
  ['Umbriel', 'tranquila'], ['Algieba', 'suave'], ['Despina', 'suave'], ['Erinome', 'clara'], ['Algenib', 'ronca'], ['Rasalgethi', 'informativa'],
  ['Laomedeia', 'alegre'], ['Achernar', 'dulce'], ['Alnilam', 'firme'], ['Schedar', 'pareja'], ['Gacrux', 'madura'], ['Pulcherrima', 'directa'],
  ['Achird', 'amigable'], ['Zubenelgenubi', 'casual'], ['Vindemiatrix', 'amable'], ['Sadachbia', 'vivaz'], ['Sadaltager', 'sabia'], ['Sulafat', 'cálida']
];
const ACCENTS = ['#6cb8f0', '#8b8cf6', '#c084fc', '#f472b6', '#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf'];

const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.flat().forEach((k) => k != null && n.append(k));
  return n;
};
const $ = (id) => document.getElementById(id);

/* ---------- guardado automático ---------- */

const toast = (() => {
  let t = null;
  return (text, err = false) => {
    const n = $('toast');
    n.textContent = text;
    n.className = `toast show${err ? ' err' : ''}`;
    clearTimeout(t);
    t = setTimeout(() => { n.className = 'toast'; }, err ? 4000 : 1400);
  };
})();

let pending = {};
let saveTimer = null;
async function flush() {
  const patch = pending;
  pending = {};
  if (!Object.keys(patch).length) return null;
  const r = await window.yurei.saveSettings(patch);
  if (r.ok) toast('Guardado ✓'); else toast(`No se pudo guardar: ${r.error}`, true);
  return r;
}
// Los cambios se guardan solos; los textos esperan a que dejes de escribir.
function save(patch, delay = 0) {
  Object.assign(pending, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, delay);
}
window.addEventListener('beforeunload', () => { if (Object.keys(pending).length) window.yurei.saveSettings(pending); });

/* ---------- piezas ---------- */

const row = (title, desc, control, stack = false) => el('div', { className: `row${stack ? ' stack' : ''}` },
  el('div', { className: 'txt' }, el('div', { className: 't', textContent: title }), desc ? el('div', { className: 'd', textContent: desc }) : null), control);
const card = (title, lead, ...rows) => el('div', { className: 'card' }, el('h2', { textContent: title }), lead ? el('p', { className: 'lead', textContent: lead }) : null, ...rows);

function toggle(checked, onChange) {
  const b = el('button', { className: 'switch', role: 'switch', type: 'button' });
  b.setAttribute('aria-checked', String(!!checked));
  b.onclick = () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); onChange(v); };
  return b;
}

// Grupo de opciones de una sola elección (fichas, temas, colores). Flechas ← → para moverse.
function choice(className, items, current, onPick) {
  const wrap = el('div', { className, role: 'radiogroup' });
  const nodes = items.map(({ value, node }) => {
    node.setAttribute('role', 'radio');
    node.type = 'button';
    node.setAttribute('aria-checked', String(value === current));
    node.onclick = () => { nodes.forEach((n) => n.setAttribute('aria-checked', 'false')); node.setAttribute('aria-checked', 'true'); onPick(value); };
    return node;
  });
  wrap.onkeydown = (e) => {
    const i = nodes.indexOf(document.activeElement);
    if (i < 0 || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const next = nodes[(i + (e.key === 'ArrowRight' ? 1 : nodes.length - 1)) % nodes.length];
    next.focus(); next.click(); e.preventDefault();
  };
  wrap.append(...nodes);
  return wrap;
}

const text = (value, key, props = {}) => {
  const n = el(props.rows ? 'textarea' : 'input', { value: value ?? '', ...props });
  n.oninput = () => save({ [key]: props.map ? props.map(n.value) : n.value }, 700);
  return n;
};

function slider(min, max, value, unit, onChange) {
  const out = el('span', { className: 'val', textContent: `${value}${unit}` });
  const input = el('input', { type: 'range', min, max, value });
  input.oninput = () => { out.textContent = `${input.value}${unit}`; onChange(Number(input.value)); };
  return { input, out };
}

// Reproduce el PCM de Gemini (24 kHz) limpio, igual que el notch.
let audioCtx = null;
function playPcm(b64) {
  audioCtx ||= new AudioContext();
  const bin = atob(b64);
  const raw = new Float32Array(bin.length >> 1);
  for (let i = 0; i < raw.length; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    raw[i] = v / 32768;
  }
  const { samples } = cleanTts(raw, 24000);
  const buf = audioCtx.createBuffer(1, samples.length, 24000);
  buf.copyToChannel(samples, 0);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioCtx.destination);
  src.start();
  return new Promise((r) => { src.onended = r; });
}

// Campo que captura una combinación de teclas ("Control+Shift+Space").
const KEYNAMES = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Enter', Tab: 'Tab', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete' };
function accelFrom(e) {
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
  let k = KEYNAMES[e.key] || (/^F([1-9]|1[0-2])$/.test(e.key) ? e.key : /^[a-z0-9]$/i.test(e.key) ? e.key.toUpperCase() : null);
  if (/^Key[A-Z]$/.test(e.code) && !k) k = e.code.slice(3);
  if (/^Digit\d$/.test(e.code) && !k) k = e.code.slice(5);
  return mods.length && k ? [...mods, k].join('+') : null;
}
const prettyKeys = (a) => a.replace('Control', 'Ctrl').replace('Super', 'Win').replace('Space', 'Espacio').split('+').join(' + ');

/* ---------- páginas ---------- */

(async () => {
  const s = (await window.yurei.getSettings()).data || {};
  const setReady = (hasKey) => {
    $('ready').textContent = hasKey ? 'Lista para charlar' : 'Falta tu API key de Gemini para empezar';
    $('ready').classList.toggle('warn', !hasKey);
  };
  const setName = (n) => { $('hello').textContent = `Hola, soy ${n || 'Yurei'}`; };
  setName(s.soul);
  const brainReady = () => (s.brainProvider && s.brainProvider !== 'gemini' ? !!s.brainKey || !!(s.brainPresets?.[s.brainPreset]?.local) : !!s.apiKey);
  setReady(brainReady());
  // Primera vez: bienvenida paso a paso (renderer/welcome.js). Al terminar se recarga con los ajustes normales.
  if (!s.onboarded && typeof runWelcome === 'function') { runWelcome(s); return; }

  // --- General ---
  const key = text(s.apiKey, 'apiKey', { type: 'password', placeholder: 'Pega tu API key de Google AI Studio', autocomplete: 'off', spellcheck: false });
  key.oninput = () => setReady(!!key.value.trim()); // la clave se guarda al terminar (pegarla o salir del campo), no a medias
  key.onchange = () => save({ apiKey: key.value });
  const eye = el('button', { className: 'btn small', type: 'button', textContent: 'Ver', onclick: () => { const show = key.type === 'password'; key.type = show ? 'text' : 'password'; eye.textContent = show ? 'Ocultar' : 'Ver'; } });
  const soul = text(s.soul, 'soul', { placeholder: 'Yurei', map: (v) => v.trim() || 'Yurei' });
  soul.addEventListener('input', () => setName(soul.value.trim()));
  const startCard = card('Inicio', null,
    row('Abrir con Windows', 'Yurei arranca sola al prender la PC.', toggle(s.openAtLogin !== false, (v) => save({ openAtLogin: v }))),
    row('Resumen de la mañana', 'La primera vez que abres la PC entre las 5 y las 12, te cuenta el clima, tus pendientes y lo programado.', toggle(s.morningBrief, (v) => save({ morningBrief: v }))));
  const wellCard = card('Bienestar', 'Cada tanto te sugiere una pausa: estirarte, tomar agua o mirar lejos. Cuenta solo el tiempo que de verdad usas la PC.',
    el('div', { className: 'row stack' }, choice('seg', [[0, 'Nunca'], [30, '30 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h']].map(([v, l]) => ({ value: v, node: el('button', { className: 'chip', textContent: l }) })),
      [0, 30, 60, 90, 120].includes(s.breakEvery) ? s.breakEvery : 60, (v) => save({ breakEvery: v }))));
  // --- Cerebro: con qué IA piensa (Gemini, Claude o cualquiera compatible con OpenAI) ---
  const presets = s.brainPresets || {};
  const brainBox = el('div', {});
  const brain = { preset: s.brainPreset || 'gemini', provider: s.brainProvider || 'gemini', base: s.brainBase || '', model: s.brainModel || '', hasKey: !!s.brainKey };
  function renderBrain() {
    const p = presets[brain.preset] || {};
    const rows = [];
    if (brain.provider === 'gemini') {
      rows.push(el('div', { className: 'd', textContent: 'Usa tu API key de Gemini (arriba). Es gratis y también te escucha y te habla con voz natural.' }));
    } else {
      const model = el('input', { value: brain.model, placeholder: p.model || 'nombre del modelo', spellcheck: false });
      model.setAttribute('list', 'brainModels'); // `list` solo se puede poner como atributo
      model.oninput = () => { brain.model = model.value.trim(); save({ brainModel: brain.model }, 700); };
      const list = el('datalist', { id: 'brainModels' }, ...(p.models || []).map((m) => el('option', { value: m })));
      rows.push(row('Modelo', p.models?.length ? 'Elige uno de la lista o escribe otro.' : 'El nombre exacto del modelo en ese servicio. Puedes cambiarlo.', el('div', {}, model, list), true));
      if (brain.provider === 'openai') {
        const base = el('input', { value: brain.base, placeholder: p.baseUrl || 'https://…/v1', spellcheck: false });
        base.onchange = () => { brain.base = base.value.trim(); save({ brainBase: brain.base }); };
        rows.push(row('Dirección', p.local ? 'Corre en tu PC: tiene que estar abierto mientras uses Yurei.' : 'La dirección del servicio (termina en /v1).', base, true));
      }
      const key = el('input', { type: 'password', placeholder: brain.hasKey ? '•••••••• (guardada; pega otra para cambiarla)' : p.local ? 'Opcional' : 'Pega la clave', autocomplete: 'off', spellcheck: false });
      key.onchange = () => { if (key.value.trim()) { save({ brainKey: key.value.trim() }); brain.hasKey = true; s.brainKey = '•'; setReady(brainReady()); } };
      rows.push(row('Clave', s.keyEncrypted ? 'Se guarda cifrada en este equipo, igual que la de Gemini.' : 'Se guarda solo en este equipo.', key, true));
      const status = el('div', { className: 'd' });
      const test = el('button', { className: 'btn small', type: 'button', textContent: 'Probar conexión' });
      test.onclick = async () => {
        test.disabled = true; status.textContent = 'Probando…'; status.className = 'd';
        await flush();
        const r = await window.yurei.testBrain();
        test.disabled = false;
        status.textContent = r.ok ? `¡Funciona! ✓ (${r.data.model})` : r.error;
        status.className = r.ok ? 'd okc' : 'd errc';
      };
      rows.push(el('div', { className: 'row' }, status, test));
      // Oído y voz cuando no piensa Gemini.
      const needGemini = brain.provider === 'anthropic';
      rows.push(row('Oírte con', needGemini ? 'Claude no entiende audio: usa la clave de Gemini (gratis) para pasar tu voz a texto.' : 'Para pasar tu voz a texto.',
        choice('seg', [['auto', 'Automático'], ['gemini', 'Gemini'], ...(needGemini ? [] : [['brain', 'Este servicio']])].map(([v, l]) => ({ value: v, node: el('button', { className: 'chip', textContent: l }) })), s.hearing || 'auto', (v) => { s.hearing = v; save({ hearing: v }); }), true));
      rows.push(row('Hablar con', 'La voz de las respuestas. Si no hay voz natural disponible, usa la de Windows.',
        choice('seg', [['auto', 'Automático'], ['gemini', 'Gemini'], ...(needGemini ? [] : [['brain', 'Este servicio']]), ['system', 'Windows']].map(([v, l]) => ({ value: v, node: el('button', { className: 'chip', textContent: l }) })), s.speech || 'auto', (v) => { s.speech = v; save({ speech: v }); }), true));
      if (!needGemini) {
        const stt = el('input', { value: s.sttModel || '', placeholder: p.stt || 'whisper-1', spellcheck: false });
        stt.oninput = () => save({ sttModel: stt.value.trim() }, 700);
        const tts = el('input', { value: s.brainTtsModel || '', placeholder: p.tts || 'tts-1', spellcheck: false });
        tts.oninput = () => save({ brainTtsModel: tts.value.trim() }, 700);
        rows.push(el('details', { className: 'more' }, el('summary', { textContent: 'Modelos de voz (opcional)' }),
          row('Transcripción', 'Modelo para pasar tu voz a texto en este servicio.', stt, true),
          row('Voz', 'Modelo de texto a voz en este servicio.', tts, true)));
      }
    }
    brainBox.replaceChildren(...rows);
  }
  const brainChips = choice('chips', Object.entries(presets).map(([k, p]) => ({ value: k, node: el('button', { className: 'chip', textContent: p.label }) })), brain.preset, (k) => {
    const p = presets[k] || {};
    Object.assign(brain, { preset: k, provider: p.provider, base: p.baseUrl || '', model: p.model || '' });
    s.brainProvider = p.provider; s.brainPreset = k;
    save({ brainPreset: k, brainProvider: p.provider, brainBase: brain.base, brainModel: brain.model });
    renderBrain();
    setReady(brainReady());
  });
  renderBrain();
  const brainCard = card('Cerebro', 'Con qué IA piensa Yurei. Funciona con Gemini, Claude o cualquier servicio compatible con OpenAI (incluidos OmniRoute, Ollama y LM Studio en tu PC).',
    el('div', { className: 'row stack' }, brainChips), brainBox);

  const general = [
    card('Conexión', s.keyEncrypted ? 'Tu clave se guarda cifrada con el almacén seguro de Windows: solo tu usuario, en este equipo, puede leerla.' : 'Este sistema no ofrece almacén seguro: la clave se guarda en un archivo sin cifrar.',
      row('API key de Gemini', 'Se consigue gratis en Google AI Studio.', el('div', { className: 'with-btn' }, key, eye), true),
      el('details', { className: 'more' }, el('summary', { textContent: 'Opciones avanzadas' }),
        row('Modelo', 'Solo cámbialo si sabes cuál usar.', text(s.model, 'model', { spellcheck: false, map: (v) => v.trim() }), true))),
    card('Idioma', 'Idioma de la interfaz y de las frases de Yurei.',
      el('div', { className: 'row stack' }, choice('seg', [['auto', 'Automático'], ['es', 'Español'], ['en', 'English']].map(([v, l]) => ({ value: v, node: el('button', { className: 'chip', textContent: l }) })),
        s.language || 'auto', (v) => { save({ language: v }); flush().then(() => location.reload()); }))),
    card('Personalidad', 'Cómo se llama y cómo te habla.',
      row('Nombre', 'También es la palabra para llamarla por voz.', soul, true),
      row('Forma de ser', null, text(s.personality, 'personality', { rows: 2 }), true),
      row('Habilidades extra', 'Una instrucción por línea, p. ej. "cuando diga modo cine, baja el volumen a 20".',
        text((s.abilities || []).join('\n'), 'abilities', { rows: 3, map: (v) => v.split('\n').map((x) => x.trim()).filter(Boolean) }), true)),
    startCard,
    wellCard
  ];
  general.splice(1, 0, brainCard); // justo debajo de la API key de Gemini

  // --- Voz y charla ---
  let voice = s.voice || 'Kore';
  const tryBtn = el('button', { className: 'btn primary small', type: 'button', textContent: '▶ Probar voz' });
  tryBtn.onclick = async () => {
    tryBtn.disabled = true;
    tryBtn.textContent = 'Preparando…';
    await flush(); // la prueba usa la voz guardada
    const r = await window.yurei.tts(t(`Hola, soy ${soul.value.trim() || 'Yurei'}. ¿En qué te ayudo?`));
    if (r.ok) { tryBtn.textContent = 'Sonando…'; await playPcm(r.data); } else toast(r.error, true);
    tryBtn.disabled = false;
    tryBtn.textContent = '▶ Probar voz';
  };
  const voices = choice('chips voices', GEMINI_VOICES.map(([v, d]) => ({ value: v, node: el('button', { className: 'chip' }, v, el('small', { textContent: d })) })), voice,
    (v) => { voice = v; save({ voice: v }); });
  const phrases = row('Frases propias', 'Una por línea. Vacío = las de siempre ("A ver…", "Un segundo…").',
    text((s.fillerPhrases || []).join('\n'), 'fillerPhrases', { rows: 3, map: (v) => v.split('\n') }), true);
  phrases.hidden = s.fillers === false;
  const secs = slider(5, 120, s.conversationSeconds || 20, ' s', (v) => save({ conversationSeconds: v }, 300));
  // Teclas: mantener apretado para hablar y atajos.
  const ptt = choice('seg', [['off', 'Apagado'], ['rctrl', 'Ctrl der.'], ['ralt', 'Alt der.'], ['f8', 'F8'], ['f9', 'F9']].map(([v, l]) => ({ value: v, node: el('button', { className: 'chip', textContent: l }) })),
    s.pushToTalk || 'off', (v) => save({ pushToTalk: v }));
  const hk = { ...(s.hotkeys || { talk: 'Control+Shift+Space', dictate: 'Control+Alt+D', circle: 'Control+Shift+C' }) };
  const hkInput = (name) => {
    const inp = el('input', { className: 'keycap', readOnly: true, value: prettyKeys(hk[name]) });
    inp.onfocus = () => { inp.value = 'Aprieta la combinación…'; };
    inp.onblur = () => { inp.value = prettyKeys(hk[name]); };
    inp.onkeydown = async (e) => {
      e.preventDefault();
      if (e.key === 'Escape') { inp.blur(); return; }
      const a = accelFrom(e);
      if (!a) return; // falta un modificador (Ctrl, Alt, Shift o Win) o la tecla
      const r = await window.yurei.setHotkeys({ ...hk, [name]: a });
      if (r.ok) { Object.assign(hk, r.data); toast('Guardado ✓'); } else toast(r.error, true);
      inp.blur();
    };
    return inp;
  };
  const keysCard = card('Teclas', null,
    row('Mantener apretado para hablar', 'Mientras tengas apretada la tecla, te escucha; al soltarla, responde. Solo mira esa tecla.', ptt, true),
    row('Hablar', 'Abre o cierra la charla.', hkInput('talk')),
    row('Dictado', 'Escribe lo que dices en la ventana activa.', hkInput('dictate')),
    row('Rodear y preguntar', 'Rodea algo de la pantalla y pregunta.', hkInput('circle')));

  // --- Voz de Yurei: voces propias que hablan en tu PC (Piper), sin internet ni cuota ---
  const yureiVoice = el('div', { className: 'vlist' });
  const voiceLead = el('p', { className: 'lead', textContent: '' });
  let vstate = null;
  const speechNow = () => (s.systemVoice ? 'system' : s.speech === 'gemini' ? 'gemini' : 'auto');
  const progressBtns = {};
  async function drawYureiVoices() {
    const r = await window.yurei.voicesList();
    if (!r.ok) { voiceLead.textContent = r.error; return; }
    vstate = r.data;
    voiceLead.textContent = !vstate.supported ? 'Las voces propias de Yurei funcionan en Windows.'
      : vstate.bundled ? 'Vienen dentro de Yurei y hablan en tu PC: sin internet, sin cuota y siempre con la misma voz.'
        : 'Se descargan una vez (con verificación de huella) y hablan en tu PC: sin internet, sin cuota y siempre con la misma voz.';
    // Dos motores: se muestran en grupos, con una línea que explica cómo suenan y cuánto pesan.
    const ENGINES = [
      ['piper', 'Piper', 'Livianas y rápidas (usan poca memoria). Daniela es la voz rioplatense.'],
      ['kokoro', 'Kokoro', 'Más naturales y expresivas, pero más pesadas y lentas: usan más memoria y la primera respuesta tarda un poco más.']
    ];
    const rows = (v) => {
      const inUse = vstate.selected === v.id && speechNow() === 'auto';
      const name = el('div', { className: 'vname' }, el('b', { textContent: v.name }), el('span', { className: 'vtag', textContent: `${v.gender === 'f' ? 'Femenina' : 'Masculina'} · ${v.accent}` }));
      const actions = el('div', { className: 'vact' });
      if (!v.installed) {
        const b = el('button', { className: 'btn small', type: 'button', textContent: `Descargar (${v.mb} MB)`, disabled: !vstate.supported });
        progressBtns[v.id] = b;
        b.onclick = async () => { b.disabled = true; b.textContent = 'Bajando…'; const x = await window.yurei.voicesInstall(v.id); if (!x.ok) toast(x.error, true); drawYureiVoices(); };
        actions.append(b);
      } else {
        const test = el('button', { className: 'btn small', type: 'button', textContent: 'Probar' });
        test.onclick = async () => { test.disabled = true; test.textContent = '…'; const x = await window.yurei.voicesPreview(v.id); test.disabled = false; test.textContent = 'Probar'; if (!x.ok) toast(x.error, true); else await playPcm(x.data); };
        const use = el('button', { className: `btn small${inUse ? ' on' : ''}`, type: 'button', textContent: inUse ? 'En uso ✓' : 'Usar' });
        use.onclick = () => { s.localVoice = v.id; s.speech = 'auto'; s.systemVoice = false; save({ localVoice: v.id, speech: 'auto', systemVoice: false }); setTimeout(drawYureiVoices, 200); refreshSpeechSeg(); };
        actions.append(test, use);
        if (!v.bundled) {
          const rm = el('button', { className: 'btn small', type: 'button', textContent: 'Quitar', onclick: async () => { const x = await window.yurei.voicesRemove(v.id); if (!x.ok) toast(x.error, true); drawYureiVoices(); } });
          actions.append(rm);
        }
      }
      return el('div', { className: 'vrow' }, name, actions);
    };
    yureiVoice.replaceChildren(...ENGINES.flatMap(([eng, title, note]) => [
      el('div', { className: 'vgroup' }, el('b', { textContent: title }), el('span', { textContent: note })),
      ...vstate.voices.filter((v) => v.engine === eng).map(rows)
    ]));
  }
  window.yurei.on('voices-progress', (p) => { const b = progressBtns[p.id]; if (b && p.phase !== 'listo') b.textContent = `${p.phase === 'motor' ? 'Motor' : 'Voz'}… ${Math.round(p.fraction * 100)} %`; });
  // Velocidad y tono de la voz de Yurei (valen para las cuatro voces)
  const fmtPitch = (v) => (v === 0 ? 'Normal' : `${v > 0 ? '+' : ''}${v}`);
  const spd = slider(70, 160, s.voiceSpeed || 100, ' %', (v) => { s.voiceSpeed = v; save({ voiceSpeed: v }, 300); });
  spd.input.step = 5;
  const ptc = slider(-6, 6, s.voicePitch || 0, '', (v) => { s.voicePitch = v; ptc.out.textContent = fmtPitch(v); save({ voicePitch: v }, 300); });
  ptc.out.textContent = fmtPitch(s.voicePitch || 0);
  const trySpeed = el('button', { className: 'btn small', type: 'button', textContent: 'Probar con estos valores' });
  trySpeed.onclick = async () => {
    trySpeed.disabled = true;
    const x = await window.yurei.voicesPreview(vstate?.selected || s.localVoice || 'daniela', { speed: Number(spd.input.value), pitch: Number(ptc.input.value) });
    trySpeed.disabled = false;
    if (!x.ok) toast(x.error, true); else await playPcm(x.data);
  };
  const resetSpeed = el('button', { className: 'btn small', type: 'button', textContent: 'Restablecer', onclick: () => {
    spd.input.value = 100; spd.out.textContent = '100 %'; ptc.input.value = 0; ptc.out.textContent = fmtPitch(0);
    s.voiceSpeed = 100; s.voicePitch = 0; save({ voiceSpeed: 100, voicePitch: 0 }, 100);
  } });
  const speechSeg = choice('seg', [['auto', 'Voz de Yurei'], ['gemini', 'Gemini'], ['system', 'Windows']].map(([v, l]) => ({ value: v, node: el('button', { className: 'chip', textContent: l }) })), speechNow(),
    (v) => { s.speech = v; s.systemVoice = v === 'system'; save({ speech: v, systemVoice: v === 'system' }); setTimeout(drawYureiVoices, 200); });
  const refreshSpeechSeg = () => [...speechSeg.children].forEach((n) => n.setAttribute('aria-checked', String(n.textContent === 'Voz de Yurei')));
  drawYureiVoices();

  const voicePage = [
    card('Voz de Yurei', null, voiceLead, el('div', { className: 'row stack' }, yureiVoice),
      row('Velocidad', 'Más alta, habla más rápido. También se aplica a la voz de Windows.', spd.out),
      el('div', { className: 'row tight' }, spd.input),
      row('Tono', 'Negativo, más grave; positivo, más agudo. Sirve para acercar una voz femenina o masculina a como la querés.', ptc.out),
      el('div', { className: 'row tight' }, ptc.input),
      el('div', { className: 'row' }, el('div', { className: 'txt' }), el('div', { className: 'vact' }, resetSpeed, trySpeed)), row('Con qué voz habla', 'La voz de Yurei es la que se queda fija. Gemini o la de Windows solo si lo eliges aquí.', el('div', {}, speechSeg), true)),
    card('Voz de Gemini', 'Solo se usa si eliges Gemini arriba. Toca una voz y pruébala.',
      el('div', { className: 'row stack' }, voices, el('div', {}, tryBtn)),),
    card('Charla', 'Cómo se da la conversación.',
      row('Responder al saludo o a mi nombre', 'Manos libres: di "hola" o su nombre y empieza a charlar. El micrófono queda abierto y los fragmentos con voz se envían a Google para detectarlo.',
        toggle(s.wakeWord, (v) => save({ wakeWord: v }))),
      row('Interrumpirla hablando', 'Si le hablas encima mientras responde, se calla y te escucha. Si se corta sola por el eco de los parlantes, apágalo o usa auriculares.',
        toggle(s.bargeIn !== false, (v) => save({ bargeIn: v }))),
      row('Frases mientras piensa', '"Mmm, déjame ver…" para que la charla fluya. Nunca en la respuesta a tu saludo.',
        toggle(s.fillers !== false, (v) => { phrases.hidden = !v; save({ fillers: v }); })),
      phrases,
      row('Tiempo de charla abierta', 'Cuánto espera tu siguiente frase antes de dormirse.', secs.out),
      el('div', { className: 'row tight' }, secs.input)),
    keysCard
  ];

  // --- Apariencia (se ve al instante) ---
  const look = { themeSat: s.themeSat ?? 50, themeBright: s.themeBright ?? 15, theme: s.theme || 'dark', customBg: s.customBg || '#101114', customAccent: s.customAccent || '#6cb8f0', transparency: s.transparency || 'off', opacity: s.opacity || 78 };
  const applyLook = (patch) => { Object.assign(look, patch); customRow.hidden = look.theme !== 'custom'; adaptRow.hidden = look.theme !== 'adaptive'; opRow.hidden = opSlider.hidden = look.transparency === 'off'; save(patch, 120); };
  const themes = choice('themes', [['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro'], ['custom', 'A tu gusto'], ['adaptive', 'Adaptativo']].map(([v, t]) => ({ value: v, node: el('button', { className: 'theme' }, el('div', { className: `mini ${v}` }), t) })),
    look.theme, (v) => applyLook({ theme: v }));
  const picker = el('input', { type: 'color', value: look.customAccent, title: 'Otro color' });
  const dots = choice('swatches', ACCENTS.map((c) => { const n = el('button', { className: 'dot', title: c }); n.style.setProperty('--c', c); return { value: c, node: n }; }), look.customAccent.toLowerCase(),
    (c) => { picker.value = c; applyLook({ customAccent: c }); });
  dots.append(picker);
  picker.oninput = () => { dots.querySelectorAll('.dot').forEach((d) => d.setAttribute('aria-checked', 'false')); applyLook({ customAccent: picker.value }); };
  const bg = el('input', { type: 'color', value: look.customBg, title: 'Color de fondo' });
  bg.oninput = () => applyLook({ customBg: bg.value });
  const customRow = el('div', {}, row('Color de acento', null, dots, true), row('Color de fondo', null, bg));
  const sat = slider(0, 100, look.themeSat, ' %', (v) => applyLook({ themeSat: v }));
  const bri = slider(0, 40, look.themeBright, ' %', (v) => applyLook({ themeBright: v }));
  const adaptRow = el('div', {}, row('Usa el color de acento de Windows', 'Elige cuánto color y cuánta luz tiene el fondo.', null), row('Saturación', null, sat.out), el('div', { className: 'row tight' }, sat.input), row('Brillo del fondo', null, bri.out), el('div', { className: 'row tight' }, bri.input));
  const op = slider(30, 100, look.opacity, ' %', (v) => applyLook({ opacity: v }));
  const opRow = row('Opacidad', null, op.out);
  const opSlider = el('div', { className: 'row tight' }, op.input);
  const accs = choice('chips', [['none', 'Nada'], ['gorro', '🎉 Gorrito'], ['lentes', '👓 Lentes'], ['mono', '🎀 Moño'], ['corona', '👑 Corona'], ['flor', '🌸 Flor']].map(([v, t]) => ({ value: v, node: el('button', { className: 'chip', textContent: t }) })),
    s.accessory || 'none', (v) => { applyAccessory(v); save({ accessory: v }); });
  // Vida de la carita: reacciones y disfraces. Lo de batería y cargador depende de si es notebook o PC.
  const device = s.device === 'notebook' ? 'notebook' : s.device === 'pc' ? 'pc' : null;
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const [bm, bd] = (s.birthday || '').split('-');
  const bMonth = el('select', {}, el('option', { value: '', textContent: 'Mes' }), ...months.map((m, i) => el('option', { value: String(i + 1).padStart(2, '0'), textContent: m, selected: bm === String(i + 1).padStart(2, '0') })));
  const bDay = el('select', {}, el('option', { value: '', textContent: 'Día' }), ...Array.from({ length: 31 }, (_, i) => el('option', { value: String(i + 1).padStart(2, '0'), textContent: String(i + 1), selected: bd === String(i + 1).padStart(2, '0') })));
  const saveBirthday = () => save({ birthday: bMonth.value && bDay.value ? `${bMonth.value}-${bDay.value}` : '' });
  bMonth.onchange = saveBirthday;
  bDay.onchange = saveBirthday;
  const lifeCard = card('Vida de la carita', device === 'notebook' ? 'Tu equipo: notebook. Reacciona al cargador y a la batería baja.' : null,
    row('Reacciones', device !== 'notebook' ? 'Se sorprende si la CPU está al máximo.' : 'Se alegra al enchufar el cargador, se preocupa con poca batería y se sorprende si la CPU está al máximo.', toggle(s.reactions !== false, (v) => save({ reactions: v }))),
    row('Disfraces de temporada', 'Calabaza en Halloween, gorro navideño en diciembre y gorrito de fiesta en tu cumpleaños.', toggle(s.seasonal !== false, (v) => save({ seasonal: v }))),
    row('Tu cumpleaños', 'Para festejarlo ese día.', el('div', { className: 'bday' }, bDay, bMonth)));
  const lookPage = [
    card('Tu Yurei', 'Ponle algo a la carita (mírala arriba).', el('div', { className: 'row stack' }, accs)),
    lifeCard,
    card('Tema', null, el('div', { className: 'row stack' }, themes), customRow, adaptRow),
    card('Transparencia', null,
      el('div', { className: 'row stack' }, choice('seg', [['off', 'Opaco'], ['on', 'Translúcido'], ['system', 'Como Windows']].map(([v, t]) => ({ value: v, node: el('button', { className: 'chip', textContent: t }) })),
        look.transparency, (v) => applyLook({ transparency: v }))),
      opRow, opSlider),
    card('Tamaño y hora', null,
      row('Tamaño de la isla', 'Escala toda la interfaz de la isla.', el('div', {}, choice('seg', [80, 90, 100, 110, 120, 130].map((v) => ({ value: v, node: el('button', { className: 'chip', textContent: `${v} %` }) })), s.uiScale || 100, (v) => save({ uiScale: v }))), true),
      row('Reloj de 24 horas', null, toggle(!!s.time24, (v) => save({ time24: v }))))
  ];
  applyLook({});
  pending = {};

  // --- Panel ---
  const catalog = s.widgetCatalog || [];
  const layout = [...(s.widgets || ['yurei', 'clock', 'todos'])];
  const slots = el('div', { className: 'slots' }, ...['Izquierda', 'Centro', 'Derecha'].map((name, i) => {
    const sel = el('select', {}, ...catalog.map((w) => el('option', { value: w.id, textContent: w.disabled ? `${w.name} (no disponible)` : w.name, title: w.reason || '', disabled: !!w.disabled, selected: w.id === layout[i] })));
    sel.onchange = () => { layout[i] = sel.value; save({ widgets: [...layout] }); };
    return el('label', {}, name, sel);
  }));
  const panelPage = [
    card('Lo que ves al abrir el notch', 'Elige qué va en cada uno de los tres lugares.', el('div', { className: 'row stack' }, slots)),
    card('Mis apps', null, row('Iconos de las webs', 'Descarga el icono de las webs que añades (consulta a Google el nombre del sitio).', toggle(s.fetchFavicons, (v) => save({ fetchFavicons: v }))))
  ];

  // --- Modos: "modo gamer", "modo estudio"… ---
  let modes = (s.modes || []).map((m) => ({ ...m }));
  const modesBox = el('div', {});
  const saveModes = (delay = 600) => save({ modes: modes.map((m) => ({ ...m })) }, delay);
  function modeCard(m) {
    const name = el('input', { value: m.name, placeholder: 'p. ej. gamer', maxLength: 24 });
    name.oninput = () => { m.name = name.value; saveModes(); };
    const apps = el('input', { value: m.apps.join(', '), placeholder: 'Discord, Steam, Spotify…' });
    apps.oninput = () => { m.apps = apps.value.split(',').map((x) => x.trim()).filter(Boolean); saveModes(); };
    const vol = slider(0, 100, m.volume ?? 50, ' %', (v) => { m.volume = v; saveModes(300); });
    const volRow = el('div', { className: 'row tight' }, vol.input);
    volRow.hidden = m.volume === null;
    const media = choice('seg', [['none', 'No tocar'], ['play', 'Reproducir'], ['pause', 'Pausar']].map(([v, t]) => ({ value: v, node: el('button', { className: 'chip', textContent: t }) })),
      m.media || 'none', (v) => { m.media = v === 'none' ? null : v; saveModes(0); });
    const pomo = slider(0, 90, m.pomodoro || 0, ' min', (v) => { m.pomodoro = v; pomo.out.textContent = v ? `${v} min` : 'No'; saveModes(300); });
    if (!m.pomodoro) pomo.out.textContent = 'No';
    const del = el('button', { className: 'btn small danger', type: 'button', textContent: 'Quitar', onclick: () => { modes = modes.filter((x) => x !== m); renderModes(); saveModes(0); } });
    return card(`Modo ${m.name || 'nuevo'}`, `Di "modo ${m.name || '…'}" y Yurei lo activa. "Modo normal" lo deshace.`,
      row('Nombre', null, name, true),
      row('Abrir estas apps', 'Separadas por comas.', apps, true),
      row('Cambiar el volumen', null, toggle(m.volume !== null, (on) => { m.volume = on ? Number(vol.input.value) : null; volRow.hidden = !on; saveModes(0); })),
      volRow,
      row('Música', null, media, true),
      row('Pomodoro', 'Bloques de concentración con descansos.', pomo.out),
      el('div', { className: 'row tight' }, pomo.input),
      row('No molestar', null, toggle(m.dnd, (on) => { m.dnd = on; saveModes(0); })),
      el('div', { className: 'row' }, el('span'), del));
  }
  function renderModes() {
    modesBox.replaceChildren(...modes.map(modeCard),
      modes.length < 8 ? el('button', { className: 'btn primary', type: 'button', textContent: '+ Nuevo modo', onclick: () => { modes.push({ name: `nuevo ${modes.length + 1}`, apps: [], volume: null, media: null, pomodoro: 0, dnd: false }); renderModes(); saveModes(0); } }) : null);
  }
  renderModes();
  const modesPage = [modesBox];

  // --- Privacidad y ayuda ---
  const diagOut = el('pre', { className: 'diag', hidden: true });
  const diagBtn = el('button', { className: 'btn', type: 'button', textContent: 'Probar audio' });
  diagBtn.onclick = async () => {
    diagBtn.textContent = 'Probando…';
    const r = await window.yurei.diagnoseAudio();
    diagBtn.textContent = 'Probar audio';
    diagOut.hidden = false;
    diagOut.textContent = r.ok ? JSON.stringify(r.data, null, 2) : `Error: ${r.error}`;
  };
  // Lo que recuerda: cada recuerdo con su X para olvidarlo.
  const memList = el('div', { className: 'mems' });
  const renderMem = (items) => {
    memList.replaceChildren(...(items.length
      ? items.map((m) => el('div', { className: 'mem' }, el('span', { textContent: m.text }),
        el('button', { className: 'x', type: 'button', title: 'Olvidar', textContent: '×', onclick: async () => { const r = await window.yurei.memoryRemove(m.id); if (r.ok) { renderMem(r.data); toast('Olvidado'); } } })))
      : [el('div', { className: 'd', textContent: 'Todavía no recuerda nada. Cuéntale algo, p. ej. "me llamo…" o "me gusta…".' })]));
  };
  window.yurei.memoryList().then((r) => renderMem(r.ok ? r.data : []));

  // Actualizaciones: versión actual, buscar ahora e instalar.
  const updText = el('div', { className: 'd' });
  const updBtn = el('button', { className: 'btn', type: 'button', textContent: 'Buscar ahora' });
  const showUpd = (u) => {
    const lines = {
      idle: `Tienes la versión ${u.current}.`,
      latest: `Tienes la última versión (${u.current}).`,
      available: `Hay una versión nueva: ${u.version}.`,
      downloading: `Bajando ${u.version}… ${Math.round((u.progress || 0) * 100)}%`,
      installing: 'Abriendo el instalador…',
      error: `No se pudo comprobar: ${u.error}`
    };
    updText.textContent = lines[u.status] || '';
    if (u.error && u.status === 'available') updText.textContent += ` (⚠ ${u.error})`;
    updBtn.textContent = u.status === 'available' ? `Instalar ${u.version}` : 'Buscar ahora';
    updBtn.className = u.status === 'available' ? 'btn primary' : 'btn';
    updBtn.disabled = ['downloading', 'installing'].includes(u.status);
    updBtn.dataset.status = u.status;
  };
  updBtn.onclick = async () => {
    if (updBtn.dataset.status === 'available') { const r = await window.yurei.updateInstall(); if (!r.ok) toast(r.error, true); return; }
    updBtn.textContent = 'Buscando…';
    const r = await window.yurei.updateCheck();
    if (r.ok) showUpd(r.data); else toast(r.error, true);
  };
  window.yurei.on('update', showUpd);
  window.yurei.updateGet().then((r) => r.ok && showUpd(r.data));
  // Uso de hoy: Google no dice cuánto queda, así que Yurei cuenta lo que pide.
  const usageStats = el('div', { className: 'stats' });
  const usageNote = el('div', { className: 'd' });
  window.yurei.usageGet().then((r) => {
    if (!r.ok) return;
    const u = r.data;
    const stat = (n, label) => el('div', { className: 'stat' }, el('b', { textContent: String(n) }), el('span', { textContent: label }));
    usageStats.replaceChildren(stat(u.ask, 'preguntas'), stat(u.voice, 'respuestas habladas'), stat(u.wake + u.dictate, 'escuchas y dictados'));
    usageNote.textContent = u.limitedAt
      ? `Hoy llegaste al límite gratis de Gemini a las ${new Date(u.limitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Se renueva solo.`
      : 'El plan gratis de Gemini tiene un tope diario que depende del modelo. Si se llega, Yurei te avisa y se renueva solo.';
  });
  const usageCard = card('Uso de hoy', 'Pedidos que Yurei hizo a Gemini con tu clave.', el('div', { className: 'row stack' }, usageStats, usageNote));
  const updCard = card('Actualizaciones', 'Las versiones nuevas se bajan de GitHub y se verifica su huella antes de instalarlas.',
    el('div', { className: 'row' }, el('div', { className: 'txt' }, el('div', { className: 't', textContent: 'Yurei' }), updText), updBtn),
    row('Buscar actualizaciones solo', 'Una consulta a GitHub al abrir Yurei y cada cierto tiempo. Nunca se instala nada sin que lo elijas.', toggle(s.autoUpdate !== false, (v) => save({ autoUpdate: v }))),
    row('Buscar cada', null, el('div', {}, choice('seg', [[3, '3 horas'], [6, '6 horas'], [12, '12 horas'], [24, '1 día']].map(([v, l]) => ({ value: v, node: el('button', { className: 'chip', textContent: l }) })), s.updateEvery || 3, (v) => save({ updateEvery: v }))), true),
    row('Avisarme con una notificación', 'Cuando hay una versión nueva, una sola vez por versión: en la isla y en Windows. Tú decides si instalarla.', toggle(s.updateNotify !== false, (v) => save({ updateNotify: v }))));
  const privacyPage = [
    card('Lo que recuerda de ti', 'Para charlar mejor, guarda lo que le cuentas de ti. Vive solo en este equipo.',
      el('div', { className: 'row stack' }, memList),
      row('Olvidar todo', null, el('button', { className: 'btn', type: 'button', textContent: 'Olvidar todo', onclick: async () => { const r = await window.yurei.memoryClear(); if (r.ok) { renderMem([]); toast('Olvidé todo'); } } }))),
    usageCard,
    updCard,
    card('Volumen y música', 'Si el volumen o los controles de música no responden, esto muestra qué falla.', row('Diagnóstico', null, diagBtn), el('div', { className: 'row stack tight' }, diagOut)),
    card('Tus datos', 'Todo lo tuyo vive solo en este equipo.',
      row('Borrar todo', 'Ajustes, API key, pendientes y cachés. Yurei se reinicia.', el('button', { className: 'btn danger', type: 'button', textContent: 'Borrar…', onclick: () => window.yurei.wipeData() })))
  ];


  // --- Isla: cómo se muestra, qué lleva dentro y sus accesorios ---
  const seg = (items, cur, onPick) => choice('seg', items.map(([v, l]) => ({ value: v, node: el('button', { className: 'chip', textContent: l }) })), cur, onPick);
  const nb = device === 'notebook'; // lo de batería solo existe en notebooks: en una PC no se muestra
  const SW = [['weather', 'Clima'], ['cpu', 'CPU'], ['ram', 'RAM'], ['disk', 'Disco'], ['net', 'Red'], ...(nb ? [['battery', 'Batería']] : [])];
  const sw = { left: [...(s.statusWidgets?.left || [])], right: [...(s.statusWidgets?.right || [])] };
  const swNote = el('p', { className: 'lead', textContent: '' });
  const swRows = SW.map(([id, name]) => {
    const cur = sw.left.includes(id) ? 'left' : sw.right.includes(id) ? 'right' : 'off';
    return row(name, null, seg([['off', 'No'], ['left', 'Izquierda'], ['right', 'Derecha']], cur, (v) => {
      sw.left = sw.left.filter((x) => x !== id); sw.right = sw.right.filter((x) => x !== id);
      if (v !== 'off') sw[v].push(id);
      if (sw.left.length + sw.right.length > 4) { swNote.textContent = 'Como mucho 4 en la isla: quita uno primero.'; return; }
      swNote.textContent = '';
      save({ statusWidgets: { left: [...sw.left], right: [...sw.right] } });
    }));
  });
  const edge = row('Retardo al tocar el borde', 'Cuánto espera antes de mostrarse.', null);
  const delay = slider(0, 800, s.notchEdgeDelay ?? 200, ' ms', (v) => save({ notchEdgeDelay: v }, 300));
  edge.append(delay.out);
  const delayBar = el('div', { className: 'row tight' }, delay.input);
  const showDelay = (m) => { edge.hidden = delayBar.hidden = m === 'fixed'; };
  showDelay(s.notchMode || 'fixed');
  const lowSl = slider(5, 50, s.lowBattery || 20, ' %', (v) => save({ lowBattery: v }, 300));
  const islandPage = [
    card('Visibilidad', 'Fija se ve siempre. Inteligente se esconde con una ventana maximizada. Asomar solo aparece al tocar el borde de arriba.',
      el('div', { className: 'row stack' }, seg([['fixed', 'Fija'], ['smart', 'Inteligente'], ['peek', 'Asomar']], s.notchMode || 'fixed', (v) => { showDelay(v); save({ notchMode: v }); })),
      edge, delayBar),
    card('Comportamiento', null,
      row('Abrir al pasar el mouse', 'Si lo apagas, solo se abre con clic.', toggle(s.hoverOpen !== false, (v) => save({ hoverOpen: v }))),
      row('Recordar el último panel', 'Al abrir, vuelve donde lo dejaste.', toggle(s.notchRememberPanel !== false, (v) => save({ notchRememberPanel: v }))),
      row('Panel de inicio', null, seg([['calendar', 'Calendario'], ['control', 'Control']], s.notchDefaultPanel || 'calendar', (v) => save({ notchDefaultPanel: v }))),
      row('Punto de actualización', 'Muestra un punto cuando hay una versión nueva.', toggle(s.showUpdateDot !== false, (v) => save({ showUpdateDot: v })))),
    card('Widgets de estado', 'Hasta 4 datos pequeños a los lados de la isla.', ...swRows, swNote,
      ...(nb ? [row('Aviso de batería baja', 'A partir de qué nivel se pone en rojo.', lowSl.out), el('div', { className: 'row tight' }, lowSl.input)] : [])),
    card('Calendario y temporizador', null,
      row('Mostrar el calendario', null, toggle(s.calendarEnabled !== false, (v) => save({ calendarEnabled: v }))),
      row('Sonido al terminar el temporizador', null, toggle(s.timerSound !== false, (v) => save({ timerSound: v })))),
    card('Música', 'Lo que suena en Windows (Spotify, el navegador…).',
      row('Mostrar la música', null, toggle(s.musicEnabled !== false, (v) => save({ musicEnabled: v }))),
      row('Diseño', null, seg([['classic', 'Clásico'], ['compact', 'Compacto']], s.mediaLayout || 'classic', (v) => save({ mediaLayout: v }))),
      row('Visualizador y portada en la isla cerrada', null, toggle(s.musicCompact !== false, (v) => save({ musicCompact: v }))),
      row('Visualizador de ondas', 'Escucha el audio del sistema solo para dibujar las barras. No lo guarda ni lo envía.', toggle(s.mediaVisualizer !== false, (v) => save({ mediaVisualizer: v }))),
      row('Portada del álbum', null, toggle(s.mediaAlbumArt !== false, (v) => save({ mediaAlbumArt: v }))),
      row('Colores de la portada', 'Tiñe la isla con los colores de la canción.', toggle(s.mediaAmbience !== false, (v) => save({ mediaAmbience: v }))),
      row('Brillo de la isla cerrada', null, toggle(s.mediaCompactGlow !== false, (v) => save({ mediaCompactGlow: v })))),
    card('Bandeja', 'Suelta archivos o texto sobre la isla para tenerlos a mano. Son referencias: no se copian.',
      row('Mantener al reiniciar', 'Si lo apagas, la bandeja empieza vacía.', toggle(!!s.shelfPersist, (v) => save({ shelfPersist: v })))),
    card('Clima', null, row('Ciudad', 'Se actualiza cada media hora.', text(s.city, 'city', { placeholder: 'p. ej. Buenos Aires' }), true))
  ];

  // --- Superposiciones: indicadores en los bordes de la pantalla ---
  const overlaysPage = [
    card('Volumen', 'Un indicador en el borde izquierdo de la pantalla.',
      row('Mostrar al cambiar el volumen', 'Con las teclas del teclado o desde otra app.', toggle(s.volumeHud !== false, (v) => save({ volumeHud: v }))),
      row('Mostrar al tocar el borde izquierdo', 'Arrástralo o usa la rueda. Toca el porcentaje para ver el volumen de cada app.', toggle(s.volumeEdge !== false, (v) => save({ volumeEdge: v })))),
    ...(nb ? [card('Brillo', 'Un indicador en el borde derecho de la pantalla.',
      row('Mostrar al cambiar el brillo', null, toggle(s.brightnessHud !== false, (v) => save({ brightnessHud: v }))),
      row('Mostrar al tocar el borde derecho', null, toggle(s.brightnessEdge !== false, (v) => save({ brightnessEdge: v }))))] : [])
  ];

  // --- pestañas ---
  const pages = [['General', general], ['Voz', voicePage], ['Apariencia', lookPage], ['Isla', islandPage], ['Superposiciones', overlaysPage], ['Panel', panelPage], ['Modos', modesPage], ['Privacidad', privacyPage]];
  const tabs = pages.map(([name], i) => {
    const b = el('button', { role: 'tab', type: 'button', textContent: name });
    b.onclick = () => show(i);
    return b;
  });
  function show(i) {
    tabs.forEach((t, j) => t.setAttribute('aria-selected', String(i === j)));
    $('form').replaceChildren(el('section', { className: 'page', role: 'tabpanel' }, ...pages[i][1]));
    window.scrollTo({ top: 0 });
    try { sessionStorage.setItem('tab', String(i)); } catch { /* sin almacenamiento */ }
  }
  $('tabs').append(...tabs);
  $('tabs').onkeydown = (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0 || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const n = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    tabs[n].focus(); show(n);
  };
  let start = 0;
  try { start = Number(sessionStorage.getItem('tab')) || 0; } catch { /* sin almacenamiento */ }
  show(Math.min(start, pages.length - 1));
})();

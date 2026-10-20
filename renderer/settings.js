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

/* ---------- páginas ---------- */

(async () => {
  const s = (await window.yurei.getSettings()).data || {};
  const setReady = (hasKey) => {
    $('ready').textContent = hasKey ? 'Lista para charlar' : 'Falta tu API key de Gemini para empezar';
    $('ready').classList.toggle('warn', !hasKey);
  };
  const setName = (n) => { $('hello').textContent = `Hola, soy ${n || 'Yurei'}`; };
  setName(s.soul);
  setReady(!!s.apiKey);
  // Primera vez: bienvenida paso a paso (renderer/welcome.js). Al terminar se recarga con los ajustes normales.
  if (!s.onboarded && typeof runWelcome === 'function') { runWelcome(s); return; }

  // --- General ---
  const key = text(s.apiKey, 'apiKey', { type: 'password', placeholder: 'Pega tu API key de Google AI Studio', autocomplete: 'off', spellcheck: false });
  key.oninput = () => setReady(!!key.value.trim()); // la clave se guarda al terminar (pegarla o salir del campo), no a medias
  key.onchange = () => save({ apiKey: key.value });
  const eye = el('button', { className: 'btn small', type: 'button', textContent: 'Ver', onclick: () => { const show = key.type === 'password'; key.type = show ? 'text' : 'password'; eye.textContent = show ? 'Ocultar' : 'Ver'; } });
  const soul = text(s.soul, 'soul', { placeholder: 'Yurei', map: (v) => v.trim() || 'Yurei' });
  soul.addEventListener('input', () => setName(soul.value.trim()));
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
        text((s.abilities || []).join('\n'), 'abilities', { rows: 3, map: (v) => v.split('\n').map((x) => x.trim()).filter(Boolean) }), true))
  ];

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
  const voicePage = [
    card('Voz', 'Toca una voz y pruébala.',
      el('div', { className: 'row stack' }, voices, el('div', {}, tryBtn)),
      row('Voz del sistema', 'Más robótica, pero no gasta cuota de Gemini.', toggle(s.systemVoice, (v) => save({ systemVoice: v })))),
    card('Charla', 'Cómo se da la conversación.',
      row('Responder al saludo o a mi nombre', 'Manos libres: di "hola" o su nombre y empieza a charlar. El micrófono queda abierto y los fragmentos con voz se envían a Google para detectarlo.',
        toggle(s.wakeWord, (v) => save({ wakeWord: v }))),
      row('Interrumpirla hablando', 'Si le hablas encima mientras responde, se calla y te escucha. Si se corta sola por el eco de los parlantes, apágalo o usa auriculares.',
        toggle(s.bargeIn !== false, (v) => save({ bargeIn: v }))),
      row('Frases mientras piensa', '"Mmm, déjame ver…" para que la charla fluya. Nunca en la respuesta a tu saludo.',
        toggle(s.fillers !== false, (v) => { phrases.hidden = !v; save({ fillers: v }); })),
      phrases,
      row('Tiempo de charla abierta', 'Cuánto espera tu siguiente frase antes de dormirse.', secs.out),
      el('div', { className: 'row tight' }, secs.input))
  ];

  // --- Apariencia (se ve al instante) ---
  const look = { theme: s.theme || 'dark', customBg: s.customBg || '#101114', customAccent: s.customAccent || '#6cb8f0', transparency: s.transparency || 'off', opacity: s.opacity || 78 };
  const applyLook = (patch) => { Object.assign(look, patch); customRow.hidden = look.theme !== 'custom'; opRow.hidden = opSlider.hidden = look.transparency === 'off'; save(patch, 120); };
  const themes = choice('themes', [['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro'], ['custom', 'A tu gusto']].map(([v, t]) => ({ value: v, node: el('button', { className: 'theme' }, el('div', { className: `mini ${v}` }), t) })),
    look.theme, (v) => applyLook({ theme: v }));
  const picker = el('input', { type: 'color', value: look.customAccent, title: 'Otro color' });
  const dots = choice('swatches', ACCENTS.map((c) => { const n = el('button', { className: 'dot', title: c }); n.style.setProperty('--c', c); return { value: c, node: n }; }), look.customAccent.toLowerCase(),
    (c) => { picker.value = c; applyLook({ customAccent: c }); });
  dots.append(picker);
  picker.oninput = () => { dots.querySelectorAll('.dot').forEach((d) => d.setAttribute('aria-checked', 'false')); applyLook({ customAccent: picker.value }); };
  const bg = el('input', { type: 'color', value: look.customBg, title: 'Color de fondo' });
  bg.oninput = () => applyLook({ customBg: bg.value });
  const customRow = el('div', {}, row('Color de acento', null, dots, true), row('Color de fondo', null, bg));
  const op = slider(30, 100, look.opacity, ' %', (v) => applyLook({ opacity: v }));
  const opRow = row('Opacidad', null, op.out);
  const opSlider = el('div', { className: 'row tight' }, op.input);
  const accs = choice('chips', [['none', 'Nada'], ['gorro', '🎉 Gorrito'], ['lentes', '👓 Lentes'], ['mono', '🎀 Moño'], ['corona', '👑 Corona'], ['flor', '🌸 Flor']].map(([v, t]) => ({ value: v, node: el('button', { className: 'chip', textContent: t }) })),
    s.accessory || 'none', (v) => { applyAccessory(v); save({ accessory: v }); });
  const lookPage = [
    card('Tu Yurei', 'Ponle algo a la carita (mírala arriba).', el('div', { className: 'row stack' }, accs)),
    card('Tema', null, el('div', { className: 'row stack' }, themes), customRow),
    card('Transparencia', null,
      el('div', { className: 'row stack' }, choice('seg', [['off', 'Opaco'], ['on', 'Translúcido'], ['system', 'Como Windows']].map(([v, t]) => ({ value: v, node: el('button', { className: 'chip', textContent: t }) })),
        look.transparency, (v) => applyLook({ transparency: v }))),
      opRow, opSlider)
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
    card('Clima', null, row('Ciudad', 'Se actualiza cada media hora.', text(s.city, 'city', { placeholder: 'p. ej. Buenos Aires' }), true)),
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
    row('Buscar actualizaciones solo', 'Una consulta a GitHub al abrir y cada 6 horas.', toggle(s.autoUpdate !== false, (v) => save({ autoUpdate: v }))));
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

  // --- pestañas ---
  const pages = [['General', general], ['Voz', voicePage], ['Apariencia', lookPage], ['Panel', panelPage], ['Modos', modesPage], ['Privacidad', privacyPage]];
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

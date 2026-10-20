const $ = (id) => document.getElementById(id);
const island = $('island');
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.flat().forEach((k) => n.append(k));
  return n;
};

const state = { mode: 'idle', recording: null, pendingImage: null, autoStop: null, soul: 'Yurei', stateText: 'Toca para hablar', layout: ['yurei', 'clock', 'todos'], city: '', fillers: true, fillerPhrases: [], hasKey: false };

const isPanel = (m) => m === 'peek';

// idle: solo el notch · status: aviso corto · peek: panel de widgets
function setMode(mode) {
  const wasPanel = isPanel(state.mode);
  state.mode = mode;
  island.className = `${mode} ${island.dataset.phase || ''}`.trim();
  $('panel').hidden = !isPanel(mode);
  $('reply').hidden = mode !== 'status';
  window.yurei.setMode(mode);
  if (isPanel(mode) && !wasPanel) startWidgets();
  if (!isPanel(mode) && wasPanel) stopWidgets();
}

/* ---------- widgets: 3 lugares fijos, cada uno con el widget que elijas ---------- */

const toggleConversation = () => (conv.active ? wakeIdle() : enterConversation());
const fmtTime = (iso) => {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? hm : `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${hm}`;
};
const gauge = (label) => {
  const txt = el('div', { className: 'sub', textContent: label });
  const fill = el('i');
  return { txt, fill, nodes: [txt, el('div', { className: 'gauge' }, fill)] };
};

const WIDGETS = {
  yurei: {
    build(c) {
      c.append(
        el('button', { id: 'orb', title: 'Hablar con Yurei', onclick: toggleConversation }),
        el('div', { id: 'wName', className: 'name', textContent: state.soul }),
        el('div', { id: 'wState', className: 'sub', textContent: state.stateText })
      );
    }
  },

  clock: {
    every: 1,
    build(c) {
      const t = el('div', { className: 'big' });
      const d = el('div', { className: 'sub date' });
      c.append(t, d);
      return { t, d };
    },
    update(r) {
      const n = new Date();
      r.t.textContent = n.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      r.d.textContent = n.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    }
  },

  todos: {
    every: 5,
    build(c) {
      c.classList.add('list');
      const head = el('div', { className: 'head' });
      const ul = el('ul');
      c.append(el('h4', { textContent: 'Pendientes' }), head, ul);
      return { head, ul };
    },
    async update(r) {
      const open = ((await window.yurei.todos()).data || []).filter((t) => !t.done);
      r.head.textContent = open.length ? `${open.length} pendiente${open.length === 1 ? '' : 's'}` : 'Sin pendientes';
      r.ul.replaceChildren(...open.slice(0, 3).map((t) => el('li', { textContent: t.text })));
    }
  },

  weather: {
    every: 600,
    build(c) {
      const icon = el('div', { className: 'icon' });
      const temp = el('div', { className: 'big' });
      const desc = el('div', { className: 'sub' });
      const place = el('div', { className: 'sub dim' });
      c.append(icon, temp, desc, place);
      return { icon, temp, desc, place };
    },
    async update(r) {
      const res = await window.yurei.widgetData('weather');
      if (!res.ok) {
        r.icon.textContent = '🌡️';
        r.temp.textContent = '';
        r.desc.textContent = res.error;
        r.place.textContent = '';
        return;
      }
      const w = res.data;
      r.icon.textContent = w.emoji;
      r.temp.textContent = `${w.temp}°`;
      r.desc.textContent = w.desc;
      r.place.textContent = `${w.city} · ${w.min}° / ${w.max}°`;
    }
  },

  schedule: {
    every: 30,
    build(c) {
      c.classList.add('list');
      const ul = el('ul');
      c.append(el('h4', { textContent: 'Próximo' }), ul);
      return { ul };
    },
    async update(r) {
      const items = (await window.yurei.widgetData('schedule')).data || [];
      r.ul.replaceChildren(...(items.length
        ? items.map((i) => el('li', { textContent: `${fmtTime(i.when)} · ${i.label}` }))
        : [el('li', { className: 'dim', textContent: 'Nada programado. Pídeselo a Yurei.' })]));
    }
  },

  stats: {
    every: 2,
    build(c) {
      c.classList.add('list');
      const cpu = gauge('CPU');
      const ram = gauge('RAM');
      c.append(el('h4', { textContent: 'Tu PC' }), ...cpu.nodes, ...ram.nodes);
      return { cpu, ram };
    },
    async update(r) {
      const res = await window.yurei.widgetData('stats');
      if (!res.ok) return;
      const { cpu, ramUsedGb, ramTotalGb } = res.data;
      r.cpu.txt.textContent = `CPU · ${cpu}%`;
      r.cpu.fill.style.width = `${cpu}%`;
      r.ram.txt.textContent = `RAM · ${ramUsedGb} / ${ramTotalGb} GB`;
      r.ram.fill.style.width = `${Math.round((ramUsedGb / ramTotalGb) * 100)}%`;
    }
  },

  calendar: {
    every: 3600,
    build(c) {
      c.classList.add('cal');
      const title = el('div', { className: 'calTitle' });
      const grid = el('div', { className: 'calGrid' });
      c.append(title, grid);
      return { title, grid };
    },
    update(r) {
      const now = new Date();
      r.title.textContent = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const offset = (first.getDay() + 6) % 7; // semana desde lunes
      const cells = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => el('b', { textContent: d }));
      for (let i = 0; i < offset; i++) cells.push(el('span'));
      for (let d = 1; d <= days; d++) cells.push(el('span', { textContent: d, className: d === now.getDate() ? 'today' : '' }));
      r.grid.replaceChildren(...cells);
    }
  },

  media: {
    every: 2,
    build(c) {
      c.classList.add('media');
      const titleText = el('span');
      const title = el('div', { className: 'mTitle' }, titleText);
      const artist = el('div', { className: 'sub dim' });
      const bar = el('div', { className: 'gauge thin' }, el('i'));
      const act = (action, arg) => () => { window.yurei.widgetAction('media', { action, arg }).then(() => setTimeout(() => this.update(refs), 500)); };
      const toggle = el('button', { title: 'Pausar / reanudar', onclick: act('toggle') });
      const refs = { title, titleText, artist, bar, toggle };
      c.append(title, artist, bar, el('div', { className: 'ctrl' },
        el('button', { title: 'Anterior', textContent: '⏮', onclick: act('prev') }),
        el('button', { title: 'Retroceder 10 s', textContent: '⏪', onclick: act('seek', -10) }),
        toggle,
        el('button', { title: 'Adelantar 10 s', textContent: '⏩', onclick: act('seek', 10) }),
        el('button', { title: 'Siguiente', textContent: '⏭', onclick: act('next') })));
      return refs;
    },
    async update(r) {
      const res = await window.yurei.widgetData('media');
      const m = res.ok ? res.data : { available: false };
      r.toggle.textContent = m.available && m.status === 'Playing' ? '⏸' : '▶';
      const setTitle = (text) => {
        if (r.titleText.textContent === text) return;
        r.titleText.textContent = text;
        const over = r.titleText.offsetWidth - r.title.clientWidth; // título más ancho que el widget: se desliza para leerlo
        r.title.classList.toggle('marquee', over > 0);
        if (over > 0) r.title.style.setProperty('--over', `${over}px`);
      };
      if (!m.available) {
        setTitle(res.ok ? 'Nada reproduciéndose' : res.error);
        r.artist.textContent = '';
        r.bar.firstChild.style.width = '0%';
        return;
      }
      setTitle(m.title || m.app || 'Reproduciendo');
      r.artist.textContent = m.artist || '';
      r.bar.firstChild.style.width = m.duration > 0 ? `${Math.min(100, Math.round((m.position / m.duration) * 100))}%` : '0%';
    }
  },

  volume: {
    every: 3,
    build(c) {
      const icon = el('div', { className: 'icon', style: 'cursor:pointer', title: 'Silenciar / reactivar' });
      const pct = el('div', { className: 'big' });
      const slider = el('input', { type: 'range', min: 0, max: 100, step: 1, className: 'slider' });
      const refs = { icon, pct, slider, dragging: false, muted: false };
      slider.oninput = () => { refs.dragging = true; pct.textContent = `${slider.value}%`; };
      slider.onchange = async () => {
        await window.yurei.widgetAction('volume', { level: Number(slider.value) });
        refs.dragging = false;
        refs.muted = false;
        icon.textContent = '🔊';
      };
      icon.onclick = async () => {
        const res = await window.yurei.widgetAction('volume', { mute: !refs.muted });
        if (res.ok) { refs.muted = res.data.muted; icon.textContent = refs.muted ? '🔇' : '🔊'; }
      };
      c.append(icon, pct, slider);
      return refs;
    },
    async update(r) {
      if (r.dragging) return; // no pisar lo que el usuario está moviendo
      const res = await window.yurei.widgetData('volume');
      if (!res.ok) { r.pct.textContent = ''; r.icon.textContent = '🔇'; return; }
      r.muted = res.data.muted;
      r.icon.textContent = r.muted ? '🔇' : '🔊';
      r.pct.textContent = `${res.data.volume}%`;
      r.slider.value = res.data.volume;
    }
  },

  battery: {
    every: 30,
    build(c) {
      const icon = el('div', { className: 'icon' });
      const pct = el('div', { className: 'big' });
      const sub = el('div', { className: 'sub' });
      c.append(icon, pct, sub);
      return { icon, pct, sub };
    },
    async update(r) {
      const b = await navigator.getBattery?.().catch(() => null);
      if (!b) {
        r.icon.textContent = '🔌';
        r.pct.textContent = '';
        r.sub.textContent = 'Sin batería';
        return;
      }
      r.icon.textContent = b.charging ? '⚡' : '🔋';
      r.pct.textContent = `${Math.round(b.level * 100)}%`;
      r.sub.textContent = b.charging ? 'Cargando' : 'En batería';
    }
  }
};

let slots = [];
let widgetTimer = null;
let tickN = 0;

function tickWidgets(force) {
  tickN++;
  slots.forEach(({ def, refs }) => {
    if (!def.update) return;
    if (force || (def.every && tickN % def.every === 0)) Promise.resolve(def.update(refs)).catch(() => {});
  });
}

function buildWidgets() {
  const box = $('widgets');
  box.replaceChildren();
  slots = state.layout.map((id) => {
    const def = WIDGETS[id] || WIDGETS.clock;
    const node = el('div', { className: `widget w-${id}` });
    box.append(node);
    return { def, refs: def.build(node) || {} };
  });
  tickWidgets(true);
}

function startWidgets() {
  buildWidgets();
  widgetTimer = setInterval(() => tickWidgets(false), 1000);
}

function stopWidgets() {
  clearInterval(widgetTimer);
  slots = [];
}

function setPhase(phase, label) {
  island.dataset.phase = phase;
  island.className = `${state.mode} ${phase}`.trim();
  if (label) $('status').textContent = label;
  state.stateText = phase ? label : 'Toca para hablar';
  const ws = $('wState');
  if (ws) ws.textContent = state.stateText;
  animateBars();
}

/* ---------- barras del notch (reaccionan a la voz) ---------- */

const bars = [...document.querySelectorAll('#bars i')];
let barsRaf = null;

function currentLevel(phase) {
  if (phase === 'speaking') return voice.fake ? 0.12 + 0.1 * Math.abs(Math.sin(performance.now() / 140)) : analyserLevel(voice.analyser);
  if (phase === 'listening') return state.recording ? Recorder.level() : Listener.level();
  return 0.1; // pensando: ondulación suave
}

function animateBars() {
  if (barsRaf) return;
  const frame = (t) => {
    const phase = island.dataset.phase;
    if (!['listening', 'speaking', 'thinking'].includes(phase)) {
      barsRaf = null;
      bars.forEach((b) => { b.style.transform = ''; });
      const o = $('orb');
      if (o) o.style.transform = '';
      return;
    }
    const lvl = Math.min(1, currentLevel(phase) * 5);
    const o = $('orb');
    if (o) o.style.transform = `scale(${1 + lvl * 0.3})`;
    bars.forEach((b, i) => {
      const wave = 0.55 + 0.45 * Math.sin(t / 110 + i * 1.3);
      b.style.transform = `scaleY(${Math.max(0.15, Math.min(1, lvl * wave * 1.4 + 0.12 * wave))})`;
    });
    barsRaf = requestAnimationFrame(frame);
  };
  barsRaf = requestAnimationFrame(frame);
}

/* ---------- voz ---------- */

const voice = { token: 0, ctx: null, sources: [], analyser: null, fake: false, head: 0, filler: false };
const FADE_MS = 8; // fundido de entrada/salida de cada trozo: evita el clic al cortar el audio en seco
const TAIL_MS = 350; // espera tras hablar antes de volver a escuchar (no oírse a sí mismo)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stopSpeaking() {
  voice.token++;
  voice.head = 0;
  speechSynthesis.cancel();
  voice.sources.splice(0).forEach((src) => { try { src.stop(); } catch { /* ya terminó */ } });
}

// Trozos de 1-2 frases: el primero suena enseguida mientras se genera el siguiente.
function chunkSentences(text) {
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*/g) || [text];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > 140) { chunks.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

// PCM 16-bit mono 24 kHz (base64) → AudioBuffer con fundidos en los extremos.
function decodePcm(ctx, b64) {
  const bin = atob(b64);
  const n = bin.length >> 1;
  const buf = ctx.createBuffer(1, n, 24000);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    ch[i] = v / 32768;
  }
  const fade = Math.min(Math.round((24000 * FADE_MS) / 1000), n >> 1);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    ch[i] *= g;
    ch[n - 1 - i] *= g;
  }
  return buf;
}

// Encola el trozo justo detrás del anterior (sin huecos). Resuelve cuando termina de sonar.
function schedulePcm(b64) {
  voice.ctx ||= new AudioContext();
  if (!voice.analyser) {
    voice.analyser = voice.ctx.createAnalyser();
    voice.analyser.fftSize = 512;
    voice.analyser.connect(voice.ctx.destination);
  }
  const buf = decodePcm(voice.ctx, b64);
  const src = voice.ctx.createBufferSource();
  src.buffer = buf;
  src.connect(voice.analyser);
  const when = Math.max(voice.ctx.currentTime + 0.03, voice.head);
  voice.head = when + buf.duration;
  voice.sources.push(src);
  return new Promise((resolve) => {
    src.onended = () => {
      const i = voice.sources.indexOf(src);
      if (i >= 0) voice.sources.splice(i, 1);
      resolve();
    };
    src.start(when);
  });
}

async function speakGemini(text, token) {
  const chunks = chunkSentences(text);
  const fetchChunk = async (t) => {
    const r = await window.yurei.tts(t);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  };
  let next = fetchChunk(chunks[0]);
  await next; // si falla el primero, se propaga y se usa la voz del sistema
  const playing = [];
  for (let i = 0; i < chunks.length; i++) {
    let audio;
    try { audio = await next; } catch { break; }
    if (token !== voice.token) return;
    if (i + 1 < chunks.length) {
      next = fetchChunk(chunks[i + 1]);
      next.catch(() => {}); // el fallo se maneja al esperarlo; esto evita un rechazo sin captura
    }
    playing.push(schedulePcm(audio)); // se encola nada más llegar: el audio sigue sin cortes
  }
  await Promise.all(playing);
}

function speakSystem(text) {
  voice.fake = true;
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const done = () => { clearTimeout(guard); voice.fake = false; resolve(); };
    const guard = setTimeout(done, 30000);
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  });
}

// Habla y resuelve al terminar, para no escucharse a sí mismo.
async function say(text) {
  if (!text) return;
  if (voice.filler) voice.token++; // hay un "mmm, déjame ver" sonando: la respuesta se encola detrás sin cortarlo
  else stopSpeaking();
  const token = voice.token;
  voice.fake = false;
  setPhase('speaking', 'Hablando');
  try {
    let spoken = false;
    if (!state.systemVoice) {
      try {
        await speakGemini(text, token);
        spoken = true;
      } catch (e) {
        log('act', `⚠ voz de Gemini no disponible (${e.message}); uso la del sistema`);
      }
    }
    if (!spoken && token === voice.token) await speakSystem(text);
    if (token === voice.token) await sleep(TAIL_MS); // que se apague el eco antes de volver a escuchar
  } finally {
    if (token === voice.token) setPhase(conv.active ? 'listening' : '', conv.active ? 'Te escucho' : 'Yurei');
  }
}

/* ---------- frases de relleno mientras piensa ---------- */

const FILLERS = {
  first: ['Mmm, déjame ver.', 'A ver…', 'Un segundo…', 'Claro, un momento.', 'Ahora mismo lo miro.', 'Buena pregunta, déjame pensar.'],
  more: ['Sigo en ello, ya casi.', 'Un momentito más.', 'Perdona la espera, ya casi lo tengo.']
};
const FILLER_DELAY_MS = 1200; // si la respuesta llega antes, no se dice nada
const FILLER_MORE_MS = 7000;
const fillerAudio = new Map(); // frase → audio (base64); la voz se genera una vez y queda en disco
let lastFiller = '';

const fillerPool = (kind) => (kind === 'first' && state.fillerPhrases?.length ? state.fillerPhrases : FILLERS[kind]);

// Precarga en segundo plano: la primera vez genera los audios; después salen del disco al instante.
async function prefetchFillers() {
  if (!state.fillers || state.systemVoice || !state.hasKey) return;
  for (const text of [...fillerPool('first'), ...fillerPool('more')]) {
    if (fillerAudio.has(text)) continue;
    const r = await window.yurei.tts(text, { cache: true });
    if (!r.ok) return; // sin red o sin cuota: no insistir
    fillerAudio.set(text, r.data);
  }
}

function pickFiller(kind) {
  const ready = fillerPool(kind).filter((t) => fillerAudio.has(t) && t !== lastFiller);
  return ready.length ? ready[Math.floor(Math.random() * ready.length)] : null;
}

// Devuelve una función para cancelar los rellenos cuando llega la respuesta.
function startFillers() {
  if (!state.fillers) return () => {};
  let done = false;
  const speak = (kind) => {
    const text = done ? null : pickFiller(kind);
    if (!text) return;
    lastFiller = text;
    voice.filler = true;
    setPhase('speaking', 'Hablando');
    schedulePcm(fillerAudio.get(text)).then(() => {
      voice.filler = voice.sources.length > 0;
      if (!done) setPhase('thinking', 'Pensando…');
    });
  };
  const timers = [setTimeout(() => speak('first'), FILLER_DELAY_MS), setTimeout(() => speak('more'), FILLER_MORE_MS)];
  return () => { done = true; timers.forEach(clearTimeout); };
}

const log = (kind, text) => console.debug(kind, text);

// El notch pequeño no se agranda por cada respuesta (se oyen); solo para avisos y errores.
function showReply(text) {
  $('reply').textContent = text;
  if (state.mode === 'idle' && /^(⚠|⏰)/.test(text)) {
    setMode('status');
    setTimeout(() => { if (state.mode === 'status') setMode('idle'); }, 8000);
  }
}

/* ---------- conversación manos libres ---------- */

const conv = { active: false, timer: null, busy: false };

function wakeIdle() {
  conv.active = false;
  
  clearTimeout(conv.timer);
  setPhase('', 'Yurei');
  if (state.mode === 'status') setMode('idle');
  if (!state.wakeWord) Listener.stop();
}

function armConversationTimeout() {
  clearTimeout(conv.timer);
  conv.timer = setTimeout(wakeIdle, (state.conversationSeconds || 20) * 1000);
}

async function ensureListening() {
  if (Listener.running) return true;
  try {
    await Listener.start({ onUtterance: handleUtterance, onSpeechStart: () => { if (conv.active) clearTimeout(conv.timer); } });
    return true;
  } catch (e) {
    showReply(`No pude acceder al micrófono: ${e.message}`);
    return false;
  }
}

async function enterConversation() {
  if (!(await ensureListening())) return;
  stopSpeaking();
  conv.active = true;
  setPhase('listening', 'Te escucho');
  armConversationTimeout();
}

async function handleUtterance({ b64 }) {
  if (conv.busy) return;
  conv.busy = true;
  try {
    if (conv.active) {
      clearTimeout(conv.timer);
      const image = state.pendingImage;
      state.pendingImage = null;
      await handleAsk({ audioB64: b64, imageB64: image || undefined }, image ? '🎤 (voz + captura)' : '🎤 (voz)');
      if (conv.active) {
        setPhase('listening', 'Te escucho');
        armConversationTimeout();
      }
      return;
    }
    // Escucha pasiva: ¿dijeron el nombre?
    setPhase('thinking', '…');
    const r = await window.yurei.wake(b64);
    if (!r.ok || !r.data.woke) { setPhase('', 'Yurei'); return; }
    await enterConversation();
    if (r.data.command) {
      clearTimeout(conv.timer);
      await handleAsk({ text: r.data.command }, r.data.command);
      if (conv.active) { setPhase('listening', 'Te escucho'); armConversationTimeout(); }
    }
  } finally {
    conv.busy = false;
  }
}

async function handleAsk(payload, userLabel) {
  Listener.pause();
  setPhase('thinking', 'Pensando…');
  log('user', userLabel);
  const stopFillers = startFillers();
  const r = await window.yurei.ask(payload);
  stopFillers();
  setPhase(conv.active ? 'listening' : '', conv.active ? 'Te escucho' : 'Yurei');
  if (!r.ok) {
    log('bot', `⚠ ${r.error}`);
    showReply(`⚠ ${r.error}`);
  } else {
    r.data.actions.forEach((a) => log('act', `⚙ ${a.name}${a.result?.error ? ` — ${a.result.error}` : ''}`));
    log('bot', r.data.reply);
    showReply(r.data.reply);
    await say(r.data.reply);
  }
  Listener.resume();
  if (isPanel(state.mode)) renderTodos();
}

/* ---------- dictado (manual: pausas largas permitidas) ---------- */

async function toggleDictation() {
  if (state.recording) {
    clearTimeout(state.autoStop);
    state.recording = null;
    const { b64, seconds } = await Recorder.stop();
    Listener.resume();
    if (seconds < 0.4) { setPhase('', 'Yurei'); return; }
    setPhase('thinking', 'Transcribiendo…');
    const r = await window.yurei.dictate(b64);
    setPhase('', 'Yurei');
    if (!r.ok) showReply(`⚠ ${r.error}`);
    return;
  }
  try {
    Listener.pause();
    await Recorder.start();
  } catch (e) {
    Listener.resume();
    showReply(`No pude acceder al micrófono: ${e.message}`);
    return;
  }
  stopSpeaking();
  state.recording = 'dictate';
  setPhase('listening', 'Dictado');
  state.autoStop = setTimeout(toggleDictation, 120000);
}

/* ---------- eventos ---------- */

$('bar').onclick = () => setMode(isPanel(state.mode) ? 'idle' : 'peek');
$('gear').onclick = () => window.yurei.openSettings();
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMode('idle'); });

window.yurei.on('hotkey', (name) => {
  if (name === 'dictate') toggleDictation();
  else if (conv.active) wakeIdle();
  else enterConversation();
});
window.yurei.on('circle-image', (b64) => {
  state.pendingImage = b64;
  enterConversation();
});
window.yurei.on('report', ({ label, results }) => {
  log('act', `⏰ ${label}: ${results.join(', ')}`);
  showReply(`⏰ ${label} — ${results.join(', ')}`);
});

function applySettings(cfg) {
  const voiceChanged = cfg.voice !== state.voiceName || JSON.stringify(cfg.fillerPhrases || []) !== JSON.stringify(state.fillerPhrases || []);
  state.voiceName = cfg.voice;
  state.systemVoice = cfg.systemVoice;
  state.fillers = cfg.fillers !== false;
  state.fillerPhrases = cfg.fillerPhrases || [];
  state.hasKey = !!cfg.apiKey;
  if (voiceChanged) { fillerAudio.clear(); setTimeout(prefetchFillers, 3000); }
  state.wakeWord = cfg.wakeWord;
  state.conversationSeconds = cfg.conversationSeconds;
  state.soul = cfg.soul || 'Yurei';
  const wn = $('wName');
  if (wn) wn.textContent = state.soul;
  const layoutChanged = cfg.widgets && JSON.stringify(cfg.widgets) !== JSON.stringify(state.layout);
  const cityChanged = (cfg.city || '') !== state.city;
  if (cfg.widgets) state.layout = cfg.widgets;
  state.city = cfg.city || '';
  if (isPanel(state.mode) && (layoutChanged || cityChanged)) buildWidgets();
  if (cfg.wakeWord) ensureListening();
  else if (!conv.active) Listener.stop();
}
window.yurei.on('settings-changed', applySettings);
window.yurei.getSettings().then((r) => {
  if (!r.ok) return;
  applySettings(r.data);
  if (!r.data.apiKey) window.yurei.openSettings(); // primer arranque: pedir la API key
});
setMode('idle');

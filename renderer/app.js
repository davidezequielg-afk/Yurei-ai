const $ = (id) => document.getElementById(id);
const island = $('island');
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.flat().forEach((k) => n.append(k));
  return n;
};

const state = { mode: 'idle', recording: null, pendingImage: null, tab: 'chat', timers: [], autoStop: null };

const isPanel = (m) => m === 'peek' || m === 'full';

// idle: notch · status: aviso · peek: panel compacto · full: panel ampliado (al escribir)
function setMode(mode) {
  const entering = isPanel(mode) && !isPanel(state.mode);
  state.mode = mode;
  island.className = `${mode} ${island.dataset.phase || ''}`.trim();
  $('panel').hidden = !isPanel(mode);
  $('reply').hidden = mode !== 'status';
  window.yurei.setMode(mode);
  if (entering) showTab(state.tab); // no re-renderizar al crecer: borraría lo que se está escribiendo
}

function setPhase(phase, label) {
  island.dataset.phase = phase;
  island.className = `${state.mode} ${phase}`.trim();
  if (label) $('status').textContent = label;
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
      return;
    }
    const lvl = Math.min(1, currentLevel(phase) * 5);
    bars.forEach((b, i) => {
      const wave = 0.55 + 0.45 * Math.sin(t / 110 + i * 1.3);
      b.style.transform = `scaleY(${Math.max(0.15, Math.min(1, lvl * wave * 1.4 + 0.12 * wave))})`;
    });
    barsRaf = requestAnimationFrame(frame);
  };
  barsRaf = requestAnimationFrame(frame);
}

/* ---------- voz ---------- */

const GEMINI_VOICES = ['Kore', 'Puck', 'Charon', 'Zephyr', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'];
const voice = { token: 0, ctx: null, source: null, analyser: null, fake: false };

function stopSpeaking() {
  voice.token++;
  speechSynthesis.cancel();
  try { voice.source?.stop(); } catch { /* ya terminó */ }
}

// Trozos de 1-2 frases: el primero suena enseguida mientras se genera el siguiente.
function chunkSentences(text) {
  const sentences = text.match(/[^.!?¿¡\n]+[.!?]*\s*/g) || [text];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > 140) { chunks.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

function playPcm(b64) {
  return new Promise((resolve) => {
    voice.ctx ||= new AudioContext();
    const bin = atob(b64);
    const n = bin.length >> 1;
    const buf = voice.ctx.createBuffer(1, n, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
      if (v >= 0x8000) v -= 0x10000;
      ch[i] = v / 32768;
    }
    const src = voice.ctx.createBufferSource();
    src.buffer = buf;
    if (!voice.analyser) {
      voice.analyser = voice.ctx.createAnalyser();
      voice.analyser.fftSize = 512;
      voice.analyser.connect(voice.ctx.destination);
    }
    src.connect(voice.analyser);
    src.onended = resolve;
    voice.source = src;
    src.start();
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
  for (let i = 0; i < chunks.length; i++) {
    let audio;
    try { audio = await next; } catch { return; }
    if (token !== voice.token) return;
    if (i + 1 < chunks.length) {
      next = fetchChunk(chunks[i + 1]);
      next.catch(() => {}); // el fallo se maneja al esperarlo; esto evita un rechazo sin captura
    }
    await playPcm(audio);
    if (token !== voice.token) return;
  }
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
  stopSpeaking();
  const token = voice.token;
  voice.fake = false;
  setPhase('speaking', 'Hablando');
  try {
    if (!state.systemVoice) {
      try { await speakGemini(text, token); return; } catch (e) { log('act', `⚠ voz de Gemini no disponible (${e.message}); uso la del sistema`); }
    }
    if (token === voice.token) await speakSystem(text);
  } finally {
    if (token === voice.token) setPhase(conv.active ? 'listening' : '', conv.active ? 'Te escucho' : 'Yurei');
  }
}

function log(kind, text) {
  $('log').append(el('div', { className: `msg ${kind}`, textContent: text }));
  $('log').scrollTop = 1e9;
}

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
  $('micBtn').classList.remove('on');
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
  $('micBtn').classList.add('on');
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
  const r = await window.yurei.ask(payload);
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

/* ---------- pestañas ---------- */

const views = {
  async today() {
    const v = $('today');
    const todos = (await window.yurei.todos()).data || [];
    const sched = (await window.yurei.schedule()).data || { tasks: [], routines: [] };
    const now = new Date();
    const form = el('form', { className: 'row' }, el('input', { id: 'todoIn', placeholder: 'Nueva tarea' }), el('button', { textContent: '+' }));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const text = $('todoIn').value.trim();
      if (text) { await window.yurei.todoAction({ action: 'add', text }); views.today(); }
    };
    v.replaceChildren(
      el('h4', { textContent: `${now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` }),
      el('h4', { textContent: `Pendientes (${todos.filter((t) => t.done).length}/${todos.length})` }),
      form,
      ...todos.map((t) => el('div', { className: `row ${t.done ? 'done' : ''}` },
        el('input', { type: 'checkbox', checked: t.done, style: 'width:auto', onchange: async () => { if (!t.done) { await window.yurei.todoAction({ action: 'done', ref: t.id }); views.today(); } } }),
        el('span', { className: 'grow', textContent: t.text }),
        el('button', { textContent: '✕', onclick: async () => { await window.yurei.todoAction({ action: 'remove', ref: t.id }); views.today(); } }))),
      el('h4', { textContent: 'Programado' }),
      ...sched.tasks.map((t) => el('div', { className: 'row' }, el('span', { className: 'grow', textContent: `${new Date(t.at).toLocaleString()} — ${t.label}` }))),
      ...sched.routines.map((r) => el('div', { className: 'row' }, el('span', { className: 'grow', textContent: `🔁 ${r.time} — ${r.label} (${r.actions.length} acciones)` }))),
      !sched.tasks.length && !sched.routines.length ? el('div', { className: 'row', textContent: 'Pídele a Yurei: "todos los días a las 9 abre YouTube".' }) : ''
    );
  },

  async stats() {
    const r = await window.yurei.stats();
    if (!r.ok) return;
    const { cpu, ramUsedGb, ramTotalGb, uptimeH } = r.data;
    const gauge = (label, pct, text) => [el('div', { textContent: `${label} · ${text}` }), el('div', { className: 'gauge' }, el('i', { style: `width:${pct}%` }))];
    $('stats').replaceChildren(
      ...gauge('CPU', cpu, `${cpu}%`),
      ...gauge('RAM', Math.round((ramUsedGb / ramTotalGb) * 100), `${ramUsedGb} / ${ramTotalGb} GB`),
      el('div', { textContent: `Encendido hace ${uptimeH} h` })
    );
    state.timers.push(setTimeout(() => state.tab === 'stats' && views.stats(), 2000));
  },

  async clip() {
    const items = (await window.yurei.clipboardHistory()).data || [];
    $('clip').replaceChildren(...(items.length ? items : [{ kind: 'text', value: 'El historial está vacío.', empty: true }]).map((it, i) =>
      el('div', { className: 'row' },
        it.kind === 'image' ? el('img', { className: 'thumb', src: it.value }) : el('span', { className: 'grow', textContent: it.value }),
        it.empty ? '' : el('button', { textContent: 'Copiar', onclick: () => window.yurei.clipboardCopy(i) }))));
  },

  async apps() {
    const apps = (await window.yurei.apps()).data || [];
    const input = el('input', { placeholder: apps.length ? 'Buscar app…' : 'El lanzador solo lista apps en Windows' });
    const list = el('div');
    const render = () => list.replaceChildren(...apps.filter((a) => a.name.toLowerCase().includes(input.value.toLowerCase())).slice(0, 60)
      .map((a) => el('div', { className: 'row' }, el('span', { className: 'grow', textContent: a.name }), el('button', { textContent: 'Abrir', onclick: () => window.yurei.launchApp(a.name) }))));
    input.oninput = render;
    render();
    $('apps').replaceChildren(input, list);
  },

  async soul() {
    const s = (await window.yurei.getSettings()).data || {};
    const field = (label, node) => [el('label', { textContent: label }), node];
    const key = el('input', { type: 'password', value: s.apiKey || '', placeholder: 'Pega tu API key de Google AI Studio' });
    const model = el('input', { value: s.model });
    const soul = el('input', { value: s.soul });
    const pers = el('textarea', { rows: 2, value: s.personality });
    const voiceSel = el('select', {}, ...GEMINI_VOICES.map((v) => el('option', { value: v, textContent: v, selected: v === (s.voice || 'Kore') })));
    const sysVoice = el('input', { type: 'checkbox', checked: !!s.systemVoice, style: 'width:auto' });
    const wake = el('input', { type: 'checkbox', checked: !!s.wakeWord, style: 'width:auto' });
    const convSecs = el('input', { type: 'number', min: 5, max: 120, value: s.conversationSeconds || 20 });
    const abil = el('textarea', { rows: 3, value: (s.abilities || []).join('\n'), placeholder: 'Una instrucción por línea, p. ej. "Cuando diga \'modo cine\' baja el volumen a 20"' });
    const save = el('button', {
      textContent: 'Guardar',
      onclick: async () => {
        const r = await window.yurei.saveSettings({ apiKey: key.value, model: model.value.trim(), soul: soul.value.trim() || 'Yurei', personality: pers.value, voice: voiceSel.value, systemVoice: sysVoice.checked, wakeWord: wake.checked, conversationSeconds: Number(convSecs.value) || 20, abilities: abil.value.split('\n').map((x) => x.trim()).filter(Boolean) });
        if (r.ok) applySettings(r.data);
        save.textContent = r.ok ? 'Guardado ✓' : `Error: ${r.error}`;
      }
    });
    $('soul').replaceChildren(...field('API key de Gemini (se guarda solo en este PC)', key), ...field('Modelo', model), ...field('Alma (nombre)', soul), ...field('Personalidad', pers), ...field('Voz (Gemini, natural y expresiva)', voiceSel), el('label', {}, sysVoice, ' Usar la voz del sistema (robótica, pero no gasta cuota)'), el('label', {}, wake, ' Escuchar siempre mi nombre (manos libres). El micrófono queda abierto y los fragmentos con voz se envían a Google para detectar el nombre.'), ...field('Segundos de conversación abierta', convSecs), ...field('Habilidades', abil), el('p', {}, save));
  },

  power() {
    const tile = (label, action) => el('button', {
      textContent: label,
      onclick(e) {
        if (e.target.dataset.armed) return window.yurei.power(action);
        e.target.dataset.armed = '1';
        e.target.textContent = '¿Seguro?';
        setTimeout(() => { delete e.target.dataset.armed; e.target.textContent = label; }, 3000);
      }
    });
    $('power').replaceChildren(el('div', { className: 'tiles' }, tile('Bloquear', 'lock'), tile('Suspender', 'sleep'), tile('Reiniciar', 'restart'), tile('Apagar', 'shutdown')));
  },

  chat() {}
};

function showTab(tab) {
  state.tab = tab;
  state.timers.forEach(clearTimeout);
  state.timers = [];
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== tab; });
  views[tab]();
}

/* ---------- eventos ---------- */

$('tabs').onclick = (e) => e.target.dataset.tab && showTab(e.target.dataset.tab);
$('bar').onclick = () => setMode(isPanel(state.mode) ? 'idle' : 'peek');

// Crece al escribir y vuelve a compacto al terminar.
let shrinkTimer = null;
document.addEventListener('focusin', (e) => {
  if (!e.target.matches('input:not([type=checkbox]), textarea, select')) return;
  clearTimeout(shrinkTimer);
  if (isPanel(state.mode)) setMode('full');
});
document.addEventListener('focusout', () => {
  clearTimeout(shrinkTimer);
  shrinkTimer = setTimeout(() => { if (state.mode === 'full' && !document.activeElement?.matches?.('input:not([type=checkbox]), textarea, select')) setMode('peek'); }, 250);
});
$('chatForm').onsubmit = (e) => {
  e.preventDefault();
  const text = $('chatInput').value.trim();
  if (!text) return;
  $('chatInput').value = '';
  const image = state.pendingImage;
  state.pendingImage = null;
  handleAsk({ text, imageB64: image || undefined }, text);
};
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMode('idle'); });
$('micBtn').onclick = () => (conv.active ? wakeIdle() : enterConversation());
log('bot', 'Habla con 🎤 o Ctrl+Shift+Espacio y haz una pausa. Dictado: Ctrl+Alt+D · Pantalla: Ctrl+Shift+C.');

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
  state.systemVoice = cfg.systemVoice;
  state.wakeWord = cfg.wakeWord;
  state.conversationSeconds = cfg.conversationSeconds;
  if (cfg.wakeWord) ensureListening();
  else if (!conv.active) Listener.stop();
}
window.yurei.getSettings().then((r) => {
  if (!r.ok) return;
  applySettings(r.data);
  if (!r.data.apiKey) {
    log('bot', 'Pega tu API key de Gemini en ⚙️ y pulsa Guardar.');
    state.tab = 'soul';
    setMode('full');
  }
});
setMode('idle');

const $ = (id) => document.getElementById(id);
const island = $('island');
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.flat().forEach((k) => n.append(k));
  return n;
};

const state = { mode: 'idle', recording: null, pendingImage: null, autoStop: null };

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

/* ---------- widgets (3 lugares fijos: Yurei · hora · pendientes) ---------- */

let widgetTimer = null;

function renderClock() {
  const d = new Date();
  $('wClock').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('wDate').textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

async function renderTodos() {
  const r = await window.yurei.todos();
  const open = (r.data || []).filter((t) => !t.done);
  $('wTodoCount').textContent = open.length ? `${open.length} pendiente${open.length === 1 ? '' : 's'}` : 'Sin pendientes';
  $('wTodoList').replaceChildren(...open.slice(0, 3).map((t) => el('li', { textContent: t.text })));
}

function startWidgets() {
  renderClock();
  renderTodos();
  let tick = 0;
  widgetTimer = setInterval(() => { renderClock(); if (++tick % 5 === 0) renderTodos(); }, 1000);
}

function stopWidgets() {
  clearInterval(widgetTimer);
}

function setPhase(phase, label) {
  island.dataset.phase = phase;
  island.className = `${state.mode} ${phase}`.trim();
  if (label) $('status').textContent = label;
  $('wState').textContent = phase ? label : 'Toca para hablar';
  animateBars();
}

/* ---------- barras del notch (reaccionan a la voz) ---------- */

const bars = [...document.querySelectorAll('#bars i')];
const orb = $('orb');
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
      orb.style.transform = '';
      return;
    }
    const lvl = Math.min(1, currentLevel(phase) * 5);
    orb.style.transform = `scale(${1 + lvl * 0.3})`;
    bars.forEach((b, i) => {
      const wave = 0.55 + 0.45 * Math.sin(t / 110 + i * 1.3);
      b.style.transform = `scaleY(${Math.max(0.15, Math.min(1, lvl * wave * 1.4 + 0.12 * wave))})`;
    });
    barsRaf = requestAnimationFrame(frame);
  };
  barsRaf = requestAnimationFrame(frame);
}

/* ---------- voz ---------- */

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
$('orb').onclick = () => (conv.active ? wakeIdle() : enterConversation());
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
  state.systemVoice = cfg.systemVoice;
  state.wakeWord = cfg.wakeWord;
  state.conversationSeconds = cfg.conversationSeconds;
  $('wName').textContent = cfg.soul || 'Yurei';
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

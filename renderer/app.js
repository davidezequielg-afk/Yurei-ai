const $ = (id) => document.getElementById(id);
const island = $('island');
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.flat().forEach((k) => n.append(k));
  return n;
};

const state = { mode: 'idle', recording: null, pendingImage: null, tab: 'chat', timers: [], autoStop: null };

function setMode(mode) {
  state.mode = mode;
  island.className = `${mode} ${island.dataset.phase || ''}`.trim();
  $('panel').hidden = mode !== 'full';
  $('reply').hidden = mode !== 'status';
  window.yurei.setMode(mode);
  if (mode === 'full') showTab(state.tab);
}

function setPhase(phase, label) {
  island.dataset.phase = phase;
  island.className = `${state.mode} ${phase}`.trim();
  if (label) $('status').textContent = label;
}

// Habla y resuelve al terminar (con tope de seguridad) para no escucharse a sí mismo.
function say(text) {
  return new Promise((resolve) => {
    if (!text) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const voice = speechSynthesis.getVoices().find((v) => v.name === state.voice);
    if (voice) u.voice = voice;
    const done = () => { clearTimeout(guard); resolve(); };
    const guard = setTimeout(done, 30000);
    u.onend = done;
    u.onerror = done;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}

function log(kind, text) {
  $('log').append(el('div', { className: `msg ${kind}`, textContent: text }));
  $('log').scrollTop = 1e9;
}

function showReply(text) {
  $('reply').textContent = text;
  if (state.mode === 'idle') setMode('status');
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
  speechSynthesis.cancel();
  conv.active = true;
  setMode('status');
  $('reply').textContent = 'Te escucho… (habla y haré una pausa para responder)';
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
  if (!conv.active) setTimeout(() => { if (state.mode === 'status' && !conv.active) setMode('idle'); }, 8000);
}

/* ---------- dictado (manual: pausas largas permitidas) ---------- */

async function toggleDictation() {
  if (state.recording) {
    clearTimeout(state.autoStop);
    state.recording = null;
    const { b64, seconds } = await Recorder.stop();
    Listener.resume();
    if (seconds < 0.4) { setPhase('', 'Yurei'); setMode('idle'); return; }
    setPhase('thinking', 'Transcribiendo…');
    const r = await window.yurei.dictate(b64);
    setPhase('', r.ok ? 'Yurei' : `⚠ ${r.error}`);
    setTimeout(() => setMode('idle'), 2500);
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
  speechSynthesis.cancel();
  state.recording = 'dictate';
  setMode('status');
  $('reply').textContent = 'Dictando… pulsa Ctrl+Alt+D para terminar.';
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
    const voices = speechSynthesis.getVoices();
    const field = (label, node) => [el('label', { textContent: label }), node];
    const key = el('input', { type: 'password', value: s.apiKey || '', placeholder: 'Pega tu API key de Google AI Studio' });
    const model = el('input', { value: s.model });
    const soul = el('input', { value: s.soul });
    const pers = el('textarea', { rows: 2, value: s.personality });
    const voice = el('select', {}, el('option', { value: '', textContent: 'Predeterminada' }), ...voices.map((v) => el('option', { value: v.name, textContent: v.name, selected: v.name === s.voice })));
    const wake = el('input', { type: 'checkbox', checked: !!s.wakeWord, style: 'width:auto' });
    const convSecs = el('input', { type: 'number', min: 5, max: 120, value: s.conversationSeconds || 20 });
    const abil = el('textarea', { rows: 3, value: (s.abilities || []).join('\n'), placeholder: 'Una instrucción por línea, p. ej. "Cuando diga \'modo cine\' baja el volumen a 20"' });
    const save = el('button', {
      textContent: 'Guardar',
      onclick: async () => {
        const r = await window.yurei.saveSettings({ apiKey: key.value, model: model.value.trim(), soul: soul.value.trim() || 'Yurei', personality: pers.value, voice: voice.value, wakeWord: wake.checked, conversationSeconds: Number(convSecs.value) || 20, abilities: abil.value.split('\n').map((x) => x.trim()).filter(Boolean) });
        if (r.ok) applySettings(r.data);
        save.textContent = r.ok ? 'Guardado ✓' : `Error: ${r.error}`;
      }
    });
    $('soul').replaceChildren(...field('API key de Gemini (se guarda solo en este PC)', key), ...field('Modelo', model), ...field('Alma (nombre)', soul), ...field('Personalidad', pers), ...field('Voz', voice), el('label', {}, wake, ' Escuchar siempre mi nombre (manos libres). El micrófono queda abierto y los fragmentos con voz se envían a Google para detectar el nombre.'), ...field('Segundos de conversación abierta', convSecs), ...field('Habilidades', abil), el('p', {}, save));
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
$('bar').onclick = () => setMode(state.mode === 'full' ? 'idle' : 'full');
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
  state.voice = cfg.voice;
  state.wakeWord = cfg.wakeWord;
  state.conversationSeconds = cfg.conversationSeconds;
  if (cfg.wakeWord) ensureListening();
  else if (!conv.active) Listener.stop();
}
window.yurei.getSettings().then((r) => { if (r.ok) applySettings(r.data); });
setMode('idle');

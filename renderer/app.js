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

function say(text) {
  if (!text) return;
  const u = new SpeechSynthesisUtterance(text);
  const voice = speechSynthesis.getVoices().find((v) => v.name === state.voice);
  if (voice) u.voice = voice;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function log(kind, text) {
  $('log').append(el('div', { className: `msg ${kind}`, textContent: text }));
  $('log').scrollTop = 1e9;
}

function showReply(text) {
  $('reply').textContent = text;
  if (state.mode === 'idle') setMode('status');
}

async function handleAsk(payload, userLabel) {
  setPhase('thinking', 'Pensando…');
  log('user', userLabel);
  const r = await window.yurei.ask(payload);
  setPhase('', 'Yurei');
  if (!r.ok) { log('bot', `⚠ ${r.error}`); showReply(`⚠ ${r.error}`); return; }
  r.data.actions.forEach((a) => log('act', `⚙ ${a.name}${a.result?.error ? ` — ${a.result.error}` : ''}`));
  log('bot', r.data.reply);
  showReply(r.data.reply);
  say(r.data.reply);
  setTimeout(() => { if (state.mode === 'status' && !state.recording) setMode('idle'); }, 12000);
}

async function toggleRecording(kind) {
  if (state.recording) {
    clearTimeout(state.autoStop);
    const mode = state.recording;
    state.recording = null;
    const { b64, seconds } = await Recorder.stop();
    if (seconds < 0.4) { setPhase('', 'Yurei'); setMode('idle'); return; }
    if (mode === 'dictate') {
      setPhase('thinking', 'Transcribiendo…');
      const r = await window.yurei.dictate(b64);
      setPhase('', r.ok ? 'Yurei' : `⚠ ${r.error}`);
      setTimeout(() => setMode('idle'), 2500);
    } else {
      const image = state.pendingImage;
      state.pendingImage = null;
      await handleAsk({ audioB64: b64, imageB64: image || undefined }, image ? '🎤 (voz + captura)' : '🎤 (voz)');
    }
    return;
  }
  try {
    await Recorder.start();
  } catch (e) {
    showReply(`No pude acceder al micrófono: ${e.message}`);
    return;
  }
  speechSynthesis.cancel();
  state.recording = kind;
  setMode('status');
  $('reply').textContent = kind === 'dictate' ? 'Dictando… pulsa Ctrl+Alt+D para terminar.' : 'Escuchando… pulsa Ctrl+Shift+Espacio para enviar.';
  setPhase('listening', kind === 'dictate' ? 'Dictado' : 'Escuchando');
  state.autoStop = setTimeout(() => toggleRecording(kind), 60000);
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
    const abil = el('textarea', { rows: 3, value: (s.abilities || []).join('\n'), placeholder: 'Una instrucción por línea, p. ej. "Cuando diga \'modo cine\' baja el volumen a 20"' });
    const save = el('button', {
      textContent: 'Guardar',
      onclick: async () => {
        const r = await window.yurei.saveSettings({ apiKey: key.value, model: model.value.trim(), soul: soul.value.trim() || 'Yurei', personality: pers.value, voice: voice.value, abilities: abil.value.split('\n').map((x) => x.trim()).filter(Boolean) });
        state.voice = voice.value;
        save.textContent = r.ok ? 'Guardado ✓' : `Error: ${r.error}`;
      }
    });
    $('soul').replaceChildren(...field('API key de Gemini (se guarda solo en este PC)', key), ...field('Modelo', model), ...field('Alma (nombre)', soul), ...field('Personalidad', pers), ...field('Voz', voice), ...field('Habilidades', abil), el('p', {}, save));
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

window.yurei.on('hotkey', (name) => toggleRecording(name === 'dictate' ? 'dictate' : 'talk'));
window.yurei.on('circle-image', (b64) => {
  state.pendingImage = b64;
  toggleRecording('talk');
});
window.yurei.on('report', ({ label, results }) => {
  log('act', `⏰ ${label}: ${results.join(', ')}`);
  showReply(`⏰ ${label} — ${results.join(', ')}`);
});

window.yurei.getSettings().then((r) => { if (r.ok) state.voice = r.data.voice; });
setMode('idle');

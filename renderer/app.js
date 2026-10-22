const $ = (id) => document.getElementById(id);
const island = $('island');
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.flat().forEach((k) => n.append(k));
  return n;
};

const state = { mode: 'idle', recording: null, pendingImage: null, autoStop: null, soul: 'Yurei', stateText: 'Toca para hablar', layout: ['yurei', 'clock', 'todos'], launcher: [null, null, null, null], city: '', fillers: true, fillerPhrases: [], hasKey: false };

const isPanel = (m) => m === 'peek';

// idle: solo la píldora · status: aviso corto · peek: panel de Yurei (los demás paneles los maneja la isla)
function setMode(mode) {
  state.mode = mode;
  if (mode === 'peek') Island.open('yurei');
  else if (mode === 'idle') Island.close();
  // 'status' lo muestra Island.notice() con su texto
}

// Cuando la isla cambia de vista: los widgets del panel de Yurei solo corren mientras se ven.
Island.onView = (view, prev) => {
  state.mode = view === 'yurei' ? 'peek' : view === 'notice' ? 'status' : 'idle';
  state.view = view;
  if (view === 'yurei' && prev !== 'yurei') startWidgets();
  if (view !== 'yurei' && prev === 'yurei') stopWidgets();
  armSleep();
};
Island.onHot = () => armSleep();
Island.register('yurei', { size: () => ({ w: 500, h: 124 }), enter() {}, leave() {} });

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

const iconCache = new Map(); // clave → dataURL | null

async function appIcon(item) {
  const key = `${item.kind}|${item.target}`;
  if (!iconCache.has(key)) {
    const r = await window.yurei.launcherIcon(item);
    iconCache.set(key, r.ok ? r.data : null);
  }
  return iconCache.get(key);
}

// Logo de la marca al instante (sin red); si es una app instalada, después se reemplaza por su icono real de Windows.
function appArt(item) {
  const brand = item.brand && window.brandIcon(item.brand, 26);
  const art = brand || el('span', { className: 'tile', textContent: item.name[0].toUpperCase() });
  if (!(item.kind === 'url' && brand)) {
    appIcon(item).then((src) => { if (src) art.replaceWith(el('img', { src, alt: '' })); });
  }
  return art;
}

function filledCell(item, i) {
  const remove = el('span', { className: 'x', title: 'Quitar', onclick: (e) => { e.stopPropagation(); window.yurei.launcherClear(i); } }, window.icon('close', 10));
  return el('button', { className: 'cell', title: `Abrir ${item.name}`, onclick: () => window.yurei.launcherOpen(i) }, appArt(item), el('span', { className: 'cl', textContent: item.name }), remove);
}

function emptyCell(i) {
  return el('button', { className: 'cell empty', title: 'Añadir una app', onclick: () => window.yurei.pickerOpen(i) },
    el('span', { className: 'plus' }, window.icon('plus', 14)), el('span', { className: 'cl', textContent: 'Añadir' }));
}

// La carita (misma estructura que la del notch; face.css la dibuja).
const faceNode = () => el('span', { className: 'face' }, el('i', { className: 'e l' }), el('i', { className: 'e r' }), el('i', { className: 'm' }), el('i', { className: 'acc' }));

const WIDGETS = {
  yurei: {
    build(c) {
      c.append(
        el('button', { id: 'orb', title: 'Hablar con Yurei', onclick: toggleConversation }, faceNode()),
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
    every: 1800, // cada media hora (el proceso principal guarda el último dato, así que se sigue viendo)
    build(c) {
      const icon = el('div', { className: 'icon' });
      const temp = el('div', { className: 'big' });
      const desc = el('div', { className: 'sub' });
      const place = el('div', { className: 'sub dim' });
      c.append(icon, temp, desc, place);
      return { icon, temp, desc, place };
    },
    async update(r) {
      clearTimeout(r.retry);
      const res = await window.yurei.widgetData('weather');
      // Si falla sin nada que mostrar, se reintenta al minuto; si se ve un dato anterior, a los 5 minutos.
      if (!res.ok || res.data.stale) r.retry = setTimeout(() => this.update(r), res.ok ? 300000 : 60000);
      if (!res.ok) {
        r.icon.replaceChildren(window.icon('cloud', 28));
        r.temp.textContent = '';
        r.desc.textContent = res.error;
        r.place.textContent = '';
        return;
      }
      const w = res.data;
      r.icon.replaceChildren(window.icon(w.icon, 28));
      r.temp.textContent = `${w.temp}°`;
      r.desc.textContent = w.desc;
      r.place.textContent = w.stale ? `${w.city} · hace ${w.ageMin} min` : `${w.city} · ${w.min}° / ${w.max}°`;
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
      const cells = (LANG === 'en' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['L', 'M', 'X', 'J', 'V', 'S', 'D']).map((d) => el('b', { textContent: d }));
      for (let i = 0; i < offset; i++) cells.push(el('span'));
      for (let d = 1; d <= days; d++) cells.push(el('span', { textContent: d, className: d === now.getDate() ? 'today' : '' }));
      r.grid.replaceChildren(...cells);
    }
  },

  media: {
    every: 1,
    build(c) {
      c.classList.add('media');
      const cover = el('div', { className: 'cover' }, window.icon('music', 18));
      const titleText = el('span');
      const title = el('div', { className: 'mTitle' }, titleText);
      const artist = el('div', { className: 'sub dim' });
      const bar = el('div', { className: 'gauge thin' }, el('i'));
      const times = el('div', { className: 'times' }, el('span'), el('span'));
      const act = (action, arg) => () => { window.yurei.widgetAction('media', { action, arg }).then(() => setTimeout(() => this.update(refs, true), 400)); };
      const btn = (title, name, onclick, size = 15) => el('button', { title, onclick }, window.icon(name, size));
      const toggle = btn('Pausar / reanudar', 'play', act('toggle'), 17);
      const refs = { cover, title, titleText, artist, bar, times, toggle, key: '', m: null, at: 0, n: 0 };
      c.append(el('div', { className: 'mHead' }, cover, el('div', { className: 'mText' }, title, artist)), bar, times, el('div', { className: 'ctrl' },
        btn('Anterior', 'prev', act('prev')),
        btn('Retroceder 10 s', 'rewind', act('seek', -10)),
        toggle,
        btn('Adelantar 10 s', 'forward', act('seek', 10)),
        btn('Siguiente', 'next', act('next'))));
      return refs;
    },
    // Cada segundo avanza la barra por su cuenta; a Windows se le pregunta cada 3 s (o al tocar un botón).
    async update(r, force) {
      r.n++;
      if (force || !r.m || r.n % 3 === 1) {
        const res = await window.yurei.widgetData('media');
        r.m = res.ok ? res.data : { available: false, error: res.error };
        r.at = Date.now();
      }
      const m = r.m;
      r.toggle.replaceChildren(window.icon(m.available && m.status === 'Playing' ? 'pause' : 'play', 17));
      const setTitle = (text) => {
        if (r.titleText.textContent === text) return;
        r.titleText.textContent = text;
        const over = r.titleText.offsetWidth - r.title.clientWidth; // título más ancho que el widget: se desliza para leerlo
        r.title.classList.toggle('marquee', over > 0);
        if (over > 0) r.title.style.setProperty('--over', `${over}px`);
      };
      if (!m.available) {
        setTitle(m.error || 'Nada reproduciéndose');
        r.artist.textContent = '';
        r.bar.firstChild.style.width = '0%';
        r.times.hidden = true;
        if (r.key) { r.key = ''; r.cover.replaceChildren(window.icon('music', 18)); }
        return;
      }
      setTitle(m.title || m.app || 'Reproduciendo');
      r.artist.textContent = m.artist || '';
      const pos = Math.min(m.duration || 0, m.position + (m.status === 'Playing' ? (Date.now() - r.at) / 1000 : 0));
      r.bar.firstChild.style.width = m.duration > 0 ? `${Math.min(100, (pos / m.duration) * 100)}%` : '0%';
      r.times.hidden = !(m.duration > 0);
      r.times.firstChild.textContent = fmtLeft(pos * 1000);
      r.times.lastChild.textContent = fmtLeft(m.duration * 1000);
      // Tapa del disco: se pide una vez por canción.
      const key = `${m.title}|${m.artist}|${m.app}`;
      if (key !== r.key) {
        r.key = key;
        window.yurei.widgetData('cover').then((c) => {
          if (r.key !== key) return;
          r.cover.replaceChildren(c.ok && c.data.url ? el('img', { src: c.data.url, alt: '' }) : window.icon('music', 18));
        });
      }
    }
  },

  volume: {
    every: 3,
    build(c) {
      const icon = el('button', { className: 'ghost', title: 'Silenciar / reactivar' }, window.icon('volume', 20));
      const pct = el('div', { className: 'big' });
      const slider = el('input', { type: 'range', min: 0, max: 100, step: 1, className: 'slider' });
      const note = el('div', { className: 'sub note' }); // explica si algo falla o si va en modo teclas
      const refs = { icon, pct, slider, note, dragging: false, muted: false, level: null };
      const show = (data) => {
        refs.muted = !!data.muted;
        icon.replaceChildren(window.icon(refs.muted ? 'mute' : 'volume', 20));
        if (typeof data.volume === 'number') refs.level = data.volume;
        pct.textContent = refs.level === null ? '—' : `${refs.level}%`;
        if (refs.level !== null) slider.value = refs.level;
        note.textContent = data.mode === 'teclas' ? 'Modo teclas (aprox.)' : '';
      };
      const fail = (error) => { note.textContent = error.length > 60 ? `${error.slice(0, 57)}…` : error; note.title = error; };
      slider.oninput = () => { refs.dragging = true; pct.textContent = `${slider.value}%`; };
      slider.onchange = async () => {
        const res = await window.yurei.widgetAction('volume', { level: Number(slider.value) });
        refs.dragging = false;
        if (res.ok) show(res.data); else fail(res.error);
      };
      icon.onclick = async () => {
        const res = await window.yurei.widgetAction('volume', { mute: !refs.muted });
        if (res.ok) show(res.data); else fail(res.error);
      };
      refs.show = show;
      refs.fail = fail;
      c.append(icon, pct, slider, note);
      return refs;
    },
    async update(r) {
      if (r.dragging) return; // no pisar lo que el usuario está moviendo
      const res = await window.yurei.widgetData('volume');
      if (res.ok) r.show(res.data); else { r.pct.textContent = r.level === null ? '—' : `${r.level}%`; r.fail(res.error); }
    }
  },

  apps: {
    build(c) {
      c.classList.add('apps');
      const grid = el('div', { className: 'appGrid' });
      c.append(grid);
      state.launcher.forEach((item, i) => grid.append(item ? filledCell(item, i) : emptyCell(i)));
      return { grid };
    }
  },

  notes: {
    every: 5,
    build(c) {
      c.classList.add('list');
      const ul = el('ul');
      c.append(el('h4', { textContent: 'Notas' }), ul);
      return { ul };
    },
    async update(r) {
      const notes = (await window.yurei.widgetData('notes')).data || [];
      r.ul.replaceChildren(...(notes.length
        ? notes.slice(0, 3).map((n) => el('li', { textContent: n.text, title: n.text }))
        : [el('li', { className: 'dim', textContent: 'Di "anota que…"' })]));
    }
  },

  focus: {
    every: 20,
    build(c) {
      c.classList.add('focusW');
      const big = el('div', { className: 'big' });
      const sub = el('div', { className: 'sub' });
      const week = el('div', { className: 'week' });
      c.append(big, sub, week);
      return { big, sub, week };
    },
    async update(r) {
      const res = await window.yurei.widgetData('focus');
      if (!res.ok) return;
      const { today, week } = res.data;
      r.big.textContent = `🍅 ${today.pomodoros}`;
      r.sub.textContent = `${today.minutes} min hoy`;
      const max = Math.max(1, ...week.map((d) => d.minutes));
      r.week.replaceChildren(...week.map((d, i) => {
        const bar = el('i', { title: `${d.day}: ${d.minutes} min` });
        bar.style.height = `${Math.max(2, Math.round((d.minutes / max) * 18))}px`;
        if (i === week.length - 1) bar.className = 'now';
        return bar;
      }));
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
        r.icon.replaceChildren(window.icon('plug', 26));
        r.pct.textContent = '';
        r.sub.textContent = 'Sin batería';
        return;
      }
      r.icon.replaceChildren(batteryIcon(b.level, b.charging));
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

function clearWidgetTimers() {
  slots.forEach(({ refs }) => clearTimeout(refs.retry));
}

function buildWidgets() {
  clearWidgetTimers(); // los reintentos del panel anterior no deben quedar vivos
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
  clearWidgetTimers();
  slots = [];
}

function setPhase(phase, label) {
  Island.setPhase(phase);
  island.classList.toggle('dnd', !!state.dnd);
  if (label) $('status').textContent = label;
  armSleep();
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
      $('eye').style.removeProperty('--talk');
      return;
    }
    const lvl = Math.min(1, currentLevel(phase) * 5);
    const o = $('orb');
    if (o) o.style.transform = `scale(${1 + lvl * 0.3})`;
    if (phase === 'speaking') $('eye').style.setProperty('--talk', lvl.toFixed(2)); // la boquita se mueve con la voz
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
const SENTENCE_PAUSE = 0.2; // pausa natural entre frases (el silencio que traía el audio se recorta y se pone a propósito)
const TAIL_MS = 350; // espera tras hablar antes de volver a escuchar (no oírse a sí mismo)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stopSpeaking() {
  voice.token++;
  voice.head = 0;
  speechSynthesis.cancel();
  // Se apaga en ~20 ms en vez de cortar en seco: un corte brusco suena como un clic.
  const t = voice.ctx ? voice.ctx.currentTime : 0;
  voice.sources.splice(0).forEach((src) => {
    try {
      src.gain?.gain.setTargetAtTime(0, t, 0.006);
      src.stop(t + 0.04);
    } catch { /* ya terminó */ }
  });
}

// Abre la salida de audio antes de que haga falta, con un instante de silencio: muchos equipos hacen "pop" al
// encender el parlante, y así no coincide con el principio de la voz.
function warmAudio() {
  voice.ctx ||= new AudioContext();
  if (voice.ctx.state === 'suspended') voice.ctx.resume().catch(() => {});
  const src = voice.ctx.createBufferSource();
  src.buffer = voice.ctx.createBuffer(1, Math.round(voice.ctx.sampleRate * 0.3), voice.ctx.sampleRate);
  src.connect(voice.ctx.destination);
  src.start();
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

// PCM 16-bit mono 24 kHz (base64) → AudioBuffer. Antes se limpia: la voz de Gemini trae silencio al principio
// y ~140 ms de ruido al final de cada audio (ver renderer/pcm.js).
function decodePcm(ctx, b64) {
  const bin = atob(b64);
  const n = bin.length >> 1;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    raw[i] = v / 32768;
  }
  const { samples } = cleanTts(raw, 24000);
  const buf = ctx.createBuffer(1, samples.length, 24000);
  buf.copyToChannel(samples, 0);
  return buf;
}

// Encola el trozo justo detrás del anterior (sin huecos). Resuelve cuando termina de sonar.
function schedulePcm(b64, gap = 0) {
  voice.ctx ||= new AudioContext();
  if (!voice.analyser) {
    voice.analyser = voice.ctx.createAnalyser();
    voice.analyser.fftSize = 512;
    voice.analyser.connect(voice.ctx.destination);
  }
  const buf = decodePcm(voice.ctx, b64);
  const src = voice.ctx.createBufferSource();
  src.buffer = buf;
  src.gain = voice.ctx.createGain(); // para poder apagarlo suave si se interrumpe
  src.connect(src.gain).connect(voice.analyser);
  const when = Math.max(voice.ctx.currentTime + 0.03, voice.head + gap);
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

async function speakGemini(text, token, firstGap = 0) {
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
    playing.push(schedulePcm(audio, i === 0 ? firstGap : SENTENCE_PAUSE)); // se encola nada más llegar
    if (i === 0) setPhase('speaking', 'Hablando'); // recién ahora suena algo
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
  const afterFiller = voice.filler; // si sonaba un "mmm", la respuesta entra tras una pausa corta
  if (!afterFiller) setPhase('thinking', 'Pensando…'); // hasta que haya audio de verdad
  try {
    let spoken = false;
    if (!state.systemVoice) {
      try {
        await speakGemini(text, token, afterFiller ? 0.15 : 0);
        spoken = true;
      } catch (e) {
        log('act', `⚠ voz de Gemini no disponible (${e.message}); uso la del sistema`);
      }
    }
    if (!spoken && token === voice.token) {
      setPhase('speaking', 'Hablando');
      await speakSystem(text);
    }
    if (token === voice.token) await sleep(TAIL_MS); // que se apague el eco antes de volver a escuchar
  } finally {
    if (token === voice.token) setPhase(conv.active ? 'listening' : '', conv.active ? listenLabel() : 'Yurei');
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

const FILLERS_EN = {
  first: ['Hmm, let me see.', 'Let\'s see…', 'One second…', 'Sure, one moment.', 'Checking right now.', 'Good question, let me think.'],
  more: ['Still on it, almost there.', 'Just a moment more.', 'Sorry for the wait, nearly got it.']
};
const fillerPool = (kind) => (kind === 'first' && state.fillerPhrases?.length ? state.fillerPhrases : (LANG === 'en' ? FILLERS_EN : FILLERS)[kind]);

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

// La isla no se agranda por cada respuesta (se oyen); solo para avisos y errores.
function notice(text, ms = 5000) {
  if (state.dnd) return;
  Island.notice(text, ms);
}

function showReply(text) {
  $('reply').textContent = text;
  if (/^(⚠|⏰)/.test(text)) Island.notice(text, 8000);
}

/* ---------- conversación manos libres ---------- */

const conv = { active: false, timer: null, busy: false, turns: 0 }; // turns: cuántas preguntas van en esta conversación
const listenLabel = () => (state.translator ? `Traduciendo → ${state.translator}` : 'Te escucho');

// ¿Es un saludo para arrancar la charla ("hola, ¿cómo estás?")? Con audio no hay texto: un primer mensaje muy corto cuenta como saludo.
const GREETING = /^[\s¡!¿,.]*(hola|holi|buenas|buen d[ií]a|buenos d[ií]as|buenas tardes|buenas noches|hey|ey|qu[eé] tal|c[oó]mo (est[aá]s|and[aá]s|va)|hi|hello|good (morning|afternoon|evening)|how are you)\b/i;
const isGreeting = ({ text, seconds }) => (text ? GREETING.test(text) && text.length < 40 : seconds > 0 && seconds < 2.2);

function wakeIdle() {
  conv.active = false;
  if (state.translator) { state.translator = null; window.yurei.translatorOff(); } // al terminar la charla se apaga el traductor
  state.pendingImage = null; // una captura de pantalla vieja no debe viajar con una pregunta posterior
  
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
    await Listener.start({
      onUtterance: handleUtterance,
      onSpeechStart: () => { if (conv.active) clearTimeout(conv.timer); },
      // Interrumpirla: si le hablas encima mientras responde, se calla y te escucha.
      canBarge: () => state.bargeIn !== false && conv.active && island.dataset.phase === 'speaking',
      onBargeIn: () => { stopSpeaking(); setPhase('listening', listenLabel()); clearTimeout(conv.timer); }
    });
    return true;
  } catch (e) {
    showReply(`No pude acceder al micrófono: ${e.message}`);
    return false;
  }
}

async function enterConversation() {
  if (!(await ensureListening())) return;
  stopSpeaking();
  warmAudio();
  if (!conv.active) conv.turns = 0; // conversación nueva: el primer turno (saludo) vuelve a ir sin relleno
  conv.active = true;
  setPhase('listening', listenLabel());
  armConversationTimeout();
}

async function handleUtterance(utt) {
  // Si llega mientras termina el turno anterior (p. ej. tras interrumpirla), espera su turno en vez de perderse.
  if (conv.busy) { conv.queued = utt; return; }
  conv.busy = true;
  const { b64, seconds } = utt;
  try {
    if (conv.active) {
      clearTimeout(conv.timer);
      const image = state.pendingImage;
      state.pendingImage = null;
      await handleAsk({ audioB64: b64, imageB64: image || undefined }, image ? '🎤 (voz + captura)' : '🎤 (voz)', isGreeting({ seconds }));
      if (conv.active) {
        setPhase('listening', listenLabel());
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
      await handleAsk({ text: r.data.command }, r.data.command, isGreeting({ text: r.data.command }));
      if (conv.active) { setPhase('listening', listenLabel()); armConversationTimeout(); }
    }
  } finally {
    conv.busy = false;
    const next = conv.queued;
    conv.queued = null;
    if (next && conv.active) handleUtterance(next);
  }
}

async function handleAsk(payload, userLabel, greeting = false) {
  Listener.pause();
  warmAudio(); // mientras piensa, la salida de audio ya queda abierta
  setPhase('thinking', 'Pensando…');
  log('user', userLabel);
  // Si la charla arranca con un saludo, esa respuesta va sin frases de relleno: si tarda, tarda. Al terminar de
  // responder, la charla sigue sola (manos libres). Si arranca con una pregunta directa, sí lleva relleno.
  const quiet = conv.turns === 0 && greeting;
  conv.turns += 1;
  const stopFillers = quiet || state.translator ? () => {} : startFillers(); // traduciendo no hay "mmm, déjame ver"
  const r = await window.yurei.ask(payload);
  stopFillers();
  if (!r.ok) {
    setPhase(conv.active ? 'listening' : '', conv.active ? listenLabel() : 'Yurei');
    log('bot', `⚠ ${r.error}`);
    showReply(`⚠ ${r.error}`);
  } else {
    state.translator = r.data.translator || null;
    r.data.actions.forEach((a) => log('act', `⚙ ${a.name}${a.result?.error ? ` — ${a.result.error}` : ''}`));
    log('bot', r.data.reply);
    showReply(r.data.reply);
    setMood(r.data.mood);
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

// El mouse, la rueda, el clic y los paneles los maneja la isla (island.js).
$('gear').replaceChildren(window.icon('settings', 14));
$('gear').onclick = () => window.yurei.openSettings();

window.yurei.on('hotkey', (name) => {
  if (name === 'ptt-down') { pttDown(); return; }
  if (name === 'ptt-up') { pttUp(); return; }
  if (name === 'dictate') toggleDictation();
  else if (conv.active) wakeIdle();
  else enterConversation();
});
window.yurei.on('circle-image', (b64) => {
  state.pendingImage = b64;
  enterConversation();
});
window.yurei.on('report', ({ label, results }) => {
  if (state.dnd) return;
  log('act', `⏰ ${label}: ${results.join(', ')}`);
  showReply(`⏰ ${label} — ${results.join(', ')}`);
});

/* ---------- ánimo y sueño de la carita ---------- */

let moodTimer = null;
function setMood(mood) {
  clearTimeout(moodTimer);
  if (!mood || mood === 'neutral' || mood === 'pensativa') { delete island.dataset.mood; return; }
  island.dataset.mood = mood;
  moodTimer = setTimeout(() => { delete island.dataset.mood; }, 7000);
}

// Si nadie la usa en un rato, se duerme (ojos cerrados y una "z"). Cualquier cosa la despierta.
const SLEEP_MS = 5 * 60 * 1000;
let sleepTimer = null;
function nap() {
  const busy = conv.active || state.recording || isPanel(state.mode) || timer.cur;
  if (busy) { armSleep(); return; }
  island.classList.add('sleep');
}
function armSleep() {
  island.classList.remove('sleep');
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(nap, SLEEP_MS);
}
document.documentElement.addEventListener('mouseenter', armSleep);

/* ---------- temporizador / pomodoro ---------- */

const timer = { cur: null, raf: null, base: 0 };
const fmtLeft = (ms) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function drawTimer() {
  const ring = $('ring');
  const tl = $('tleft');
  const t = timer.cur;
  Island.setTimer(!!t);
  tl.hidden = !t;
  if (!t) { timer.raf = null; Island.timerTick?.(null, 0); return; }
  const left = t.paused ? t.left : Math.max(0, t.left - (performance.now() - timer.base));
  tl.textContent = t.finished ? '0:00' : fmtLeft(left);
  tl.classList.toggle('break', t.phase === 'break');
  tl.classList.toggle('done', !!t.finished);
  ring.title = `${t.kind === 'pomodoro' ? (t.phase === 'break' ? 'Descanso' : `Pomodoro ${t.cycle}/${t.cycles}`) : t.label} · faltan ${fmtLeft(left)}`;
  tl.title = ring.title;
  const ws = $('wState');
  if (ws && !island.dataset.phase) ws.textContent = `⏱ ${fmtLeft(left)}`;
  Island.timerTick?.(t, left);
  timer.raf = setTimeout(drawTimer, 250);
}
function setTimerState(t) {
  timer.cur = t;
  timer.base = performance.now();
  clearTimeout(timer.raf);
  drawTimer();
  if (!t) { const ws = $('wState'); if (ws) ws.textContent = state.stateText; }
}

// Campanita suave (dos notas) antes de avisar con la voz.
function chime() {
  voice.ctx ||= new AudioContext();
  const c = voice.ctx;
  [[880, 0], [1318.5, 0.18]].forEach(([f, d]) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0, c.currentTime + d);
    g.gain.linearRampToValueAtTime(0.18, c.currentTime + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d + 0.9);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + d);
    o.stop(c.currentTime + d + 1);
  });
}

window.yurei.on('timer', setTimerState);

/* ---------- vida: ojitos, reacciones, pausas, disfraces ---------- */

// Los ojitos miran hacia el mouse cuando pasa cerca (el proceso principal manda solo la dirección).
window.yurei.on('cursor', (look) => {
  island.style.setProperty('--lx', look ? look.x : 0);
  island.style.setProperty('--ly', look ? look.y : 0);
});

const BREAK_TIPS = [
  'Llevas un buen rato con la pantalla. ¿Te estiras un poquito y tomas agua?',
  'Hora de una pausa: mira algo lejos por veinte segundos, tus ojos te lo agradecen.',
  '¿Una pausa corta? Párate, mueve los hombros y respira hondo.',
  'Te propongo un descanso de dos minutos. Yo te espero acá.'
];
window.yurei.on('nudge', async (n) => {
  if (n.kind === 'cpu') {
    setMood('sorprendida');
    notice(t(`Uf, la CPU está al ${n.cpu}%`));
  } else if (n.kind === 'break') {
    if (conv.active || conv.busy || state.dnd) return;
    setMood('tierna');
    say(t(BREAK_TIPS[Math.floor(Math.random() * BREAK_TIPS.length)]));
  } else if (n.kind === 'brief') {
    if (conv.active || conv.busy || !state.hasKey) return;
    conv.busy = true;
    try { await handleAsk({ text: t('Buen día. Dame el resumen de hoy en pocas frases.') }, '☀️ resumen de la mañana'); }
    finally { conv.busy = false; setPhase('', 'Yurei'); }
  }
});

// Reacciones a la batería y al cargador: SOLO en notebooks (una PC de escritorio no tiene batería).
let batteryWatch = null;
async function watchBattery(on) {
  if (!on || batteryWatch) return;
  const b = await navigator.getBattery?.().catch(() => null);
  if (!b) return;
  batteryWatch = b;
  let warned = false;
  const pct = () => Math.round(b.level * 100);
  b.addEventListener('chargingchange', () => {
    if (state.reactions === false || state.device !== 'notebook') return;
    if (b.charging) { warned = false; setMood('feliz'); notice(t(`⚡ ¡Gracias! Cargando · ${pct()}%`), 3500); }
    else notice(t(`🔋 En batería · ${pct()}%`), 3500);
  });
  b.addEventListener('levelchange', () => {
    if (state.reactions === false || state.device !== 'notebook' || b.charging) return;
    if (pct() <= 15 && !warned) {
      warned = true;
      setMood('triste');
      if (pct() <= 10 && !conv.busy && !state.dnd) say(t(`Me queda poca batería, ${pct()} por ciento. ¿Enchufamos el cargador?`));
      else notice(t(`🪫 Batería baja: ${pct()}%. ¿Enchufamos el cargador?`), 6000);
    }
  });
}

// Disfraces según la fecha (si están activados): calabaza en Halloween, gorro navideño y gorrito el día del cumple.
function seasonalAccessory(cfg, d = new Date()) {
  if (cfg.seasonal === false) return null;
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (cfg.birthday && cfg.birthday === md) return 'gorro';
  if (md >= '10-24' && md <= '10-31') return 'calabaza';
  if (md >= '12-15' && md <= '12-26') return 'navidad';
  return null;
}
let birthdayGreeted = null;
function applySeason(cfg) {
  const acc = seasonalAccessory(cfg);
  if (acc) document.documentElement.dataset.acc = acc; // se impone al accesorio elegido solo esos días
  const now = new Date();
  const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (acc === 'gorro' && cfg.birthday && birthdayGreeted !== md) {
    birthdayGreeted = md;
    setTimeout(() => { setMood('feliz'); notice(t('🎂 ¡Feliz cumpleaños!'), 8000); }, 4000);
  }
}
setInterval(() => window.yurei.getSettings().then((r) => r.ok && applySeason(r.data)), 3600 * 1000);

// Mantener apretado para hablar: se graba mientras la tecla esté apretada (desde ~¼ s, para no saltar con atajos).
const ptt = { timer: null, on: false };
async function pttDown() {
  if (ptt.on || state.recording) return;
  clearTimeout(ptt.timer);
  ptt.timer = setTimeout(async () => {
    try {
      stopSpeaking();
      Listener.pause();
      await Recorder.start();
      ptt.on = true;
      state.recording = 'ptt';
      setPhase('listening', t('Te escucho… suelta para enviar'));
    } catch (e) { Listener.resume(); showReply(`⚠ ${e.message}`); }
  }, 250);
}
async function pttUp() {
  clearTimeout(ptt.timer);
  if (!ptt.on) return;
  ptt.on = false;
  state.recording = null;
  const { b64, seconds } = await Recorder.stop();
  if (seconds < 0.4) { Listener.resume(); setPhase(conv.active ? 'listening' : '', conv.active ? listenLabel() : 'Yurei'); return; }
  conv.busy = true;
  try { await handleAsk({ audioB64: b64 }, '🎤 (mantener apretado)'); }
  finally { conv.busy = false; setPhase(conv.active ? 'listening' : '', conv.active ? listenLabel() : 'Yurei'); }
}
window.yurei.on('timer-done', async ({ finished, next }) => {
  const ring = $('ring');
  ring.classList.remove('ding'); void ring.offsetWidth; ring.classList.add('ding');
  if (state.timerSound !== false) chime();
  let text;
  if (finished.kind === 'pomodoro') {
    if (!next) text = '¡Pomodoro completo! Muy buen trabajo.';
    else if (next.phase === 'break') text = `¡Bien hecho! Descansa ${Math.round(next.total / 60000)} minutos.`;
    else text = `Se terminó el descanso. Vamos con el bloque ${next.cycle} de ${next.cycles}.`;
  } else text = finished.label && finished.label !== 'Temporizador' ? `¡Listo! Terminó el tiempo de ${finished.label}.` : '¡Listo! Terminó el temporizador.';
  await sleep(1100);
  text = t(text); // en inglés, la frase sale traducida
  if (!conv.busy) say(text);
  else showReply(`⏰ ${text}`);
});
window.yurei.timerGet().then((r) => r.ok && setTimerState(r.data));

// Recordatorio que vence: campanita y Yurei lo dice (si estaba la PC apagada, aclara que es tarde).
window.yurei.on('reminder', async (r) => {
  chime();
  setMood('sorprendida');
  const text = r.lateMin > 2
    ? t(`Perdón, te lo tenía que recordar hace ${r.lateMin} minutos: ${r.text}.`)
    : t(`¡Te recuerdo! ${r.text}.`);
  await sleep(1000);
  if (!conv.busy) say(text);
  else showReply(`⏰ ${text}`);
});

/* ---------- actualizaciones ---------- */

let announcedUpdate = null;
function showUpdate(u) {
  const b = $('upd');
  b.hidden = !['available', 'downloading', 'installing'].includes(u.status);
  b.disabled = u.status !== 'available';
  if (u.status === 'available') b.textContent = `Actualizar a ${u.version}`;
  if (u.status === 'downloading') b.textContent = `Bajando… ${Math.round((u.progress || 0) * 100)}%`;
  if (u.status === 'installing') b.textContent = 'Instalando…';
  b.title = u.error ? `⚠ ${u.error}` : 'Baja la versión nueva desde GitHub, verifica su huella y la instala';
  island.classList.toggle('has-update', ['available', 'downloading', 'installing'].includes(u.status) && state.showUpdateDot !== false);
  // Se avisa una sola vez por versión, sin interrumpir.
  if (u.status === 'available' && announcedUpdate !== u.version && !state.dnd) {
    announcedUpdate = u.version;
    Island.pulse([window.icon('download', 14), el('span', { textContent: t('Actualización disponible') })], 6000, '#32d74b');
  }
}
$('upd').onclick = async (e) => {
  e.stopPropagation();
  const r = await window.yurei.updateInstall();
  if (!r.ok) showReply(`⚠ ${r.error}`);
};
Island.onFace = () => toggleConversation();
window.yurei.on('update', showUpdate);
window.yurei.updateGet().then((r) => r.ok && showUpdate(r.data));

/* ---------- datos de los widgets de estado de la isla ---------- */

let statusTimers = [];
function startStatusFeeds() {
  statusTimers.forEach(clearInterval);
  statusTimers = [];
  const wanted = () => new Set([...(Island.state.widgets.left || []), ...(Island.state.widgets.right || [])]);
  const weather = async () => {
    if (!wanted().has('weather')) return;
    const r = await window.yurei.widgetData('weather');
    Island.setWidgetData('weather', r.ok ? r.data : null);
  };
  const stats = async () => {
    const w = wanted();
    if (!(w.has('cpu') || w.has('ram') || w.has('disk'))) return;
    if (!Island.state.hot && Island.state.view === '') return; // solo mientras se ven
    const r = await window.yurei.widgetData('stats');
    if (!r.ok) return;
    Island.setWidgetData('cpu', r.data.cpu);
    Island.setWidgetData('ram', Math.round((r.data.ramUsedGb / r.data.ramTotalGb) * 100));
    Island.setWidgetData('disk', r.data.diskFreeGb);
  };
  const net = async () => {
    if (!wanted().has('net') || (!Island.state.hot && Island.state.view === '')) return;
    const r = await window.yurei.widgetData('net');
    if (r.ok && r.data) Island.setWidgetData('net', r.data);
  };
  weather(); stats(); net();
  statusTimers.push(setInterval(weather, 30 * 60 * 1000), setInterval(stats, 3000), setInterval(net, 2000));
}

// Batería: solo en notebooks (una PC de escritorio no tiene, y entonces no hay widget ni avisos).
async function startBatteryFeed() {
  if (state.batteryFeed || state.device !== 'notebook') return;
  const b = await navigator.getBattery?.().catch(() => null);
  if (!b) return;
  state.batteryFeed = true;
  const push = () => Island.setWidgetData('battery', { level: b.level, charging: b.charging });
  push();
  b.addEventListener('levelchange', push);
  b.addEventListener('chargingchange', push);
}

function applySettings(cfg) {
  const voiceChanged = cfg.voice !== state.voiceName || cfg.lang !== state.lang || JSON.stringify(cfg.fillerPhrases || []) !== JSON.stringify(state.fillerPhrases || []);
  state.lang = cfg.lang;
  state.voiceName = cfg.voice;
  state.systemVoice = cfg.systemVoice || cfg.voiceSource === 'system'; // sin voz natural configurada, la de Windows
  state.fillers = cfg.fillers !== false;
  state.fillerPhrases = cfg.fillerPhrases || [];
  state.hasKey = !!cfg.apiKey;
  if (voiceChanged) { fillerAudio.clear(); setTimeout(prefetchFillers, 3000); }
  state.wakeWord = cfg.wakeWord;
  state.conversationSeconds = cfg.conversationSeconds;
  state.bargeIn = cfg.bargeIn !== false;
  state.soul = cfg.soul || 'Yurei';
  const wn = $('wName');
  if (wn) wn.textContent = state.soul;
  const layoutChanged = cfg.widgets && JSON.stringify(cfg.widgets) !== JSON.stringify(state.layout);
  const cityChanged = (cfg.city || '') !== state.city;
  const launcherChanged = JSON.stringify(cfg.launcher || []) !== JSON.stringify(state.launcher);
  if (cfg.launcher) state.launcher = cfg.launcher;
  if (cfg.widgets) state.layout = cfg.widgets;
  state.city = cfg.city || '';
  if (isPanel(state.mode) && (layoutChanged || cityChanged || (launcherChanged && state.layout.includes('apps')))) buildWidgets();
  state.dnd = !!cfg.dnd;
  state.device = cfg.device;
  state.showUpdateDot = cfg.showUpdateDot !== false;
  Island.configure(cfg);
  startStatusFeeds();
  startBatteryFeed();
  state.reactions = cfg.reactions !== false;
  state.timerSound = cfg.timerSound !== false;
  watchBattery(cfg.device === 'notebook');
  applySeason(cfg);
  island.classList.toggle('dnd', state.dnd);
  // No molestar: deja de escuchar el saludo (si estás charlando, la charla sigue).
  if (cfg.wakeWord && !state.dnd) ensureListening();
  else if (!conv.active) Listener.stop();
}
window.yurei.on('settings-changed', applySettings);
window.yurei.getSettings().then((r) => {
  if (!r.ok) return;
  applySettings(r.data);
  if (!r.data.apiKey || !r.data.onboarded) window.yurei.openSettings(); // primer arranque: bienvenida paso a paso
});
Island.start();
armSleep();

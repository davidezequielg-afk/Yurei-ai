// Catálogo de widgets y reglas de los 3 lugares fijos del panel.

const CATALOG = [
  { id: 'yurei', name: 'Yurei (icono, toca para hablar)' },
  { id: 'clock', name: 'Hora y fecha' },
  { id: 'todos', name: 'Pendientes' },
  { id: 'weather', name: 'Clima' },
  { id: 'schedule', name: 'Próximas tareas y rutinas' },
  { id: 'stats', name: 'Estado del PC (CPU y RAM)' },
  { id: 'calendar', name: 'Calendario del mes' },
  { id: 'battery', name: 'Batería' },
  { id: 'media', name: 'Reproduciendo (música y video)' },
  { id: 'volume', name: 'Volumen' },
  { id: 'apps', name: 'Mis apps (4 accesos)' },
  { id: 'notes', name: 'Notas' },
  { id: 'focus', name: 'Concentración (pomodoros)' }
];

const DEFAULT_LAYOUT = ['yurei', 'clock', 'todos'];
const SLOT_NAMES = { izquierda: 0, centro: 1, derecha: 2 };
const IDS = CATALOG.map((w) => w.id);

// Widgets que dependen del hardware: si el PC no los soporta, no se pueden elegir.
const UNAVAILABLE_REASON = { battery: 'Este PC no tiene batería', media: 'Solo funciona en Windows', volume: 'Solo funciona en Windows' };
const FALLBACKS = ['clock', 'todos', 'calendar', 'weather', 'schedule', 'stats'];

function unavailableWidgets({ hasBattery, hasMedia } = {}) {
  return [...(hasBattery === false ? ['battery'] : []), ...(hasMedia === false ? ['media', 'volume'] : [])];
}

function checkAvailable(id, unavailable) {
  if (unavailable.includes(id)) throw new Error(`${UNAVAILABLE_REASON[id] || 'No disponible'}, así que el widget "${id}" no está disponible`);
}

// Reemplaza los widgets no disponibles por el primer reemplazo libre.
function sanitizeLayout(layout, unavailable = []) {
  const next = [...layout];
  next.forEach((id, i) => {
    if (!unavailable.includes(id)) return;
    next[i] = FALLBACKS.find((f) => !next.includes(f) && !unavailable.includes(f));
  });
  return next;
}

function catalogFor(unavailable = []) {
  return CATALOG.map((w) => (unavailable.includes(w.id) ? { ...w, disabled: true, reason: UNAVAILABLE_REASON[w.id] } : w));
}

function slotIndex(slot) {
  const s = String(slot).trim().toLowerCase();
  if (s in SLOT_NAMES) return SLOT_NAMES[s];
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 3) return n - 1;
  throw new Error('Lugar no válido: usa izquierda, centro o derecha');
}

function validateLayout(layout, unavailable = []) {
  if (!Array.isArray(layout) || layout.length !== 3) throw new Error('Son exactamente 3 lugares');
  for (const id of layout) {
    if (!IDS.includes(id)) throw new Error(`Widget desconocido: ${id}`);
    checkAvailable(id, unavailable);
  }
  if (new Set(layout).size !== 3) throw new Error('No se puede repetir un widget');
  if (!layout.includes('yurei')) throw new Error('El icono de Yurei tiene que quedarse en algún lugar');
  return [...layout];
}

// Pone `id` en el lugar `slot`. Si ya estaba en otro, intercambian lugares.
function setWidget(layout, slot, id, unavailable = []) {
  if (!IDS.includes(id)) throw new Error(`Widget desconocido: ${id}. Opciones: ${IDS.join(', ')}`);
  checkAvailable(id, unavailable);
  const i = slotIndex(slot);
  const next = [...layout];
  const from = next.indexOf(id);
  if (from === i) return next;
  const previous = next[i];
  if (from >= 0) {
    next[from] = previous;
    next[i] = id;
    return next;
  }
  if (previous === 'yurei') throw new Error('El icono de Yurei no se puede quitar: ponlo en otro lugar para moverlo');
  next[i] = id;
  return next;
}

/* ---------- clima (Open-Meteo, sin API key) ---------- */

const WEATHER = [
  [[0], 'Despejado', 'sun'], [[1], 'Casi despejado', 'sun'], [[2], 'Parcialmente nublado', 'partly'], [[3], 'Nublado', 'cloud'],
  [[45, 48], 'Niebla', 'fog'], [[51, 53, 55, 56, 57], 'Llovizna', 'rain'], [[61, 63, 65, 66, 67], 'Lluvia', 'rain'],
  [[71, 73, 75, 77, 85, 86], 'Nieve', 'snow'], [[80, 81, 82], 'Chubascos', 'rain'], [[95, 96, 99], 'Tormenta', 'storm']
];

function describeWeather(code, isDay = true) {
  const hit = WEATHER.find(([codes]) => codes.includes(code));
  if (!hit) return { desc: 'Sin datos', icon: 'cloud' };
  return { desc: hit[1], icon: hit[2] === 'sun' && !isDay ? 'moon' : hit[2] };
}

// Códigos del servicio de respaldo (wttr.in, formato WorldWeatherOnline).
const WWO = [
  [[113], 'Despejado', 'sun'], [[116], 'Parcialmente nublado', 'partly'], [[119, 122], 'Nublado', 'cloud'], [[143, 248, 260], 'Niebla', 'fog'],
  [[176, 185, 263, 266, 281, 284, 293, 296, 311, 353], 'Llovizna', 'rain'], [[299, 302, 305, 308, 314, 356, 359], 'Lluvia', 'rain'],
  [[179, 182, 227, 230, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377], 'Nieve', 'snow'], [[200, 386, 389, 392, 395], 'Tormenta', 'storm']
];

function describeWwo(code, isDay = true) {
  const hit = WWO.find(([codes]) => codes.includes(Number(code)));
  if (!hit) return { desc: 'Sin datos', icon: 'cloud' };
  return { desc: hit[1], icon: hit[2] === 'sun' && !isDay ? 'moon' : hit[2] };
}

function weatherError(e) {
  if (e?.notFound) return e.message;
  if (e?.status === 429) return 'El servicio del clima recibió demasiadas consultas; reintento en un minuto';
  if (e?.status >= 500) return 'El servicio del clima no está disponible ahora; reintento en un minuto';
  return 'El servicio del clima no responde; reintento en un minuto';
}

// Clima con dos servicios sin API key (Open-Meteo y, si falla, wttr.in), un reintento ante fallos pasajeros
// y el último dato bueno si ambos fallan. Se actualiza cada 30 minutos; entretanto se sigue viendo lo último.
// `persist` (opcional) guarda ese último dato para que siga visible al volver a abrir la app.
function createWeather({
  fetchImpl = fetch, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), persist = null,
  ttlMs = 30 * 60 * 1000, // cada cuánto se actualiza
  retryMs = 60 * 1000, // tras un fallo sin nada que mostrar, se reintenta al minuto…
  retryStaleMs = 5 * 60 * 1000, // …y si hay un dato anterior a la vista, a los 5 minutos
  staleMaxMs = 24 * 3600 * 1000, // un dato de más de un día ya no se muestra
  timeoutMs = 8000
} = {}) {
  const places = new Map();
  let cache = null;
  try {
    const saved = persist?.load();
    if (saved && typeof saved.city === 'string' && Number.isFinite(saved.at) && saved.data) cache = saved;
  } catch { /* sin dato guardado */ }
  let failedAt = null; // instante del último fallo total (null = ninguno)
  let lastError = null;

  async function getJson(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: ctl.signal, headers: { 'user-agent': 'Yurei (asistente de escritorio de codigo abierto)' } });
      if (!res.ok) throw Object.assign(new Error(`Servicio del clima: ${res.status}`), { status: res.status });
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') throw Object.assign(new Error('Servicio del clima: sin respuesta'), { status: 0 });
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  // Un reintento si el fallo parece pasajero (5xx o sin respuesta).
  async function getJsonRetry(url) {
    try {
      return await getJson(url);
    } catch (e) {
      if (!(e.status === 0 || e.status >= 500)) throw e;
      await sleep(600);
      return getJson(url);
    }
  }

  async function openMeteo(city) {
    let p = places.get(city);
    if (!p) {
      const data = await getJsonRetry(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=es`);
      const hit = data.results?.[0];
      if (!hit) throw Object.assign(new Error(`No encontré la ciudad "${city}"`), { notFound: true });
      p = { name: hit.name, lat: hit.latitude, lon: hit.longitude };
      places.set(city, p);
    }
    const w = await getJsonRetry(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`);
    const cur = w.current;
    return {
      city: p.name,
      temp: Math.round(cur.temperature_2m),
      min: Math.round(w.daily.temperature_2m_min[0]),
      max: Math.round(w.daily.temperature_2m_max[0]),
      ...describeWeather(cur.weather_code, cur.is_day === 1)
    };
  }

  async function wttr(city) {
    const d = await getJson(`https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=es`);
    const cur = d.current_condition?.[0];
    const day = d.weather?.[0];
    if (!cur || cur.temp_C === undefined) throw new Error('Servicio del clima: respuesta no válida');
    const hour = new Date(now()).getHours();
    const { desc, icon } = describeWwo(cur.weatherCode, hour >= 7 && hour < 20);
    return {
      city,
      temp: Math.round(Number(cur.temp_C)),
      min: Math.round(Number(day?.mintempC ?? cur.temp_C)),
      max: Math.round(Number(day?.maxtempC ?? cur.temp_C)),
      desc: cur.lang_es?.[0]?.value || desc,
      icon,
      source: 'wttr.in'
    };
  }

  function fallback(city) {
    if (cache && cache.city === city && now() - cache.at < staleMaxMs) {
      return { ...cache.data, stale: true, ageMin: Math.round((now() - cache.at) / 60000) };
    }
    throw new Error(weatherError(lastError));
  }

  return {
    async get(city) {
      const c = String(city || '').trim();
      if (!c) throw new Error('Dile a Yurei tu ciudad o ponla en Ajustes');
      if (cache && cache.city === c && now() - cache.at < ttlMs) return cache.data;
      const wait = cache && cache.city === c ? retryStaleMs : retryMs;
      if (failedAt !== null && now() - failedAt < wait) return fallback(c); // servicio caído hace poco: no insistir
      let notFound = null;
      for (const provider of [openMeteo, wttr]) {
        try {
          const data = await provider(c);
          cache = { city: c, at: now(), data };
          try { persist?.save(cache); } catch { /* si no se puede guardar, sigue en memoria */ }
          failedAt = null;
          return data;
        } catch (e) {
          lastError = e;
          if (e.notFound) notFound = e;
        }
      }
      if (notFound) lastError = notFound;
      failedAt = now();
      return fallback(c);
    }
  };
}

/* ---------- próximas tareas y rutinas ---------- */

function nextSchedule({ tasks = [], routines = [] }, now = new Date(), limit = 2) {
  const items = [];
  for (const t of tasks) {
    if (!t.done && new Date(t.at) >= now) items.push({ when: new Date(t.at), label: t.label, kind: 'tarea' });
  }
  for (const r of routines) {
    const [h, m] = r.time.split(':').map(Number);
    for (let d = 0; d <= 7; d++) {
      const day = new Date(now);
      day.setDate(now.getDate() + d);
      day.setHours(h, m, 0, 0);
      if (day >= now && r.days.includes(day.getDay())) {
        items.push({ when: day, label: r.label, kind: 'rutina' });
        break;
      }
    }
  }
  return items.sort((a, b) => a.when - b.when).slice(0, limit).map((i) => ({ ...i, when: i.when.toISOString() }));
}

module.exports = { CATALOG, DEFAULT_LAYOUT, unavailableWidgets, sanitizeLayout, catalogFor, slotIndex, validateLayout, setWidget, describeWeather, describeWwo, createWeather, nextSchedule };

// Catálogo de widgets y reglas de los 3 lugares fijos del panel.

const CATALOG = [
  { id: 'yurei', name: 'Yurei (icono, toca para hablar)' },
  { id: 'clock', name: 'Hora y fecha' },
  { id: 'todos', name: 'Pendientes' },
  { id: 'weather', name: 'Clima' },
  { id: 'schedule', name: 'Próximas tareas y rutinas' },
  { id: 'stats', name: 'Estado del PC (CPU y RAM)' },
  { id: 'calendar', name: 'Calendario del mes' },
  { id: 'battery', name: 'Batería' }
];

const DEFAULT_LAYOUT = ['yurei', 'clock', 'todos'];
const SLOT_NAMES = { izquierda: 0, centro: 1, derecha: 2 };
const IDS = CATALOG.map((w) => w.id);

function slotIndex(slot) {
  const s = String(slot).trim().toLowerCase();
  if (s in SLOT_NAMES) return SLOT_NAMES[s];
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 3) return n - 1;
  throw new Error('Lugar no válido: usa izquierda, centro o derecha');
}

function validateLayout(layout) {
  if (!Array.isArray(layout) || layout.length !== 3) throw new Error('Son exactamente 3 lugares');
  for (const id of layout) if (!IDS.includes(id)) throw new Error(`Widget desconocido: ${id}`);
  if (new Set(layout).size !== 3) throw new Error('No se puede repetir un widget');
  if (!layout.includes('yurei')) throw new Error('El icono de Yurei tiene que quedarse en algún lugar');
  return [...layout];
}

// Pone `id` en el lugar `slot`. Si ya estaba en otro, intercambian lugares.
function setWidget(layout, slot, id) {
  if (!IDS.includes(id)) throw new Error(`Widget desconocido: ${id}. Opciones: ${IDS.join(', ')}`);
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
  [[0], 'Despejado', '☀️'], [[1], 'Casi despejado', '🌤️'], [[2], 'Parcialmente nublado', '⛅'], [[3], 'Nublado', '☁️'],
  [[45, 48], 'Niebla', '🌫️'], [[51, 53, 55, 56, 57], 'Llovizna', '🌦️'], [[61, 63, 65, 66, 67], 'Lluvia', '🌧️'],
  [[71, 73, 75, 77, 85, 86], 'Nieve', '🌨️'], [[80, 81, 82], 'Chubascos', '🌧️'], [[95, 96, 99], 'Tormenta', '⛈️']
];

function describeWeather(code, isDay = true) {
  const hit = WEATHER.find(([codes]) => codes.includes(code));
  if (!hit) return { desc: 'Sin datos', emoji: '🌡️' };
  return { desc: hit[1], emoji: code === 0 && !isDay ? '🌙' : hit[2] };
}

function createWeather({ fetchImpl = fetch, now = () => Date.now(), ttlMs = 10 * 60 * 1000 } = {}) {
  const places = new Map();
  let cache = null;

  async function getJson(url) {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`Servicio del clima: ${res.status}`);
    return res.json();
  }

  async function place(city) {
    if (places.has(city)) return places.get(city);
    const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=es`);
    const hit = data.results?.[0];
    if (!hit) throw new Error(`No encontré la ciudad "${city}"`);
    const p = { name: hit.name, lat: hit.latitude, lon: hit.longitude };
    places.set(city, p);
    return p;
  }

  return {
    async get(city) {
      const c = String(city || '').trim();
      if (!c) throw new Error('Dile a Yurei tu ciudad o ponla en Ajustes');
      if (cache && cache.city === c && now() - cache.at < ttlMs) return cache.data;
      const p = await place(c);
      const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`);
      const cur = w.current;
      const data = {
        city: p.name,
        temp: Math.round(cur.temperature_2m),
        min: Math.round(w.daily.temperature_2m_min[0]),
        max: Math.round(w.daily.temperature_2m_max[0]),
        ...describeWeather(cur.weather_code, cur.is_day === 1)
      };
      cache = { city: c, at: now(), data };
      return data;
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

module.exports = { CATALOG, DEFAULT_LAYOUT, slotIndex, validateLayout, setWidget, describeWeather, createWeather, nextSchedule };

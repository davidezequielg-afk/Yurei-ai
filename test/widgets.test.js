const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/store');
const { createTools } = require('../src/tools');
const { DEFAULT_LAYOUT, setWidget, validateLayout, slotIndex, createWeather, nextSchedule, describeWeather } = require('../src/widgets');

test('setWidget cambia un lugar, intercambia si ya estaba y protege a Yurei', () => {
  assert.deepEqual(setWidget(DEFAULT_LAYOUT, 'derecha', 'weather'), ['yurei', 'clock', 'weather']);
  assert.deepEqual(setWidget(DEFAULT_LAYOUT, 'izquierda', 'todos'), ['todos', 'clock', 'yurei']); // intercambio
  assert.deepEqual(setWidget(DEFAULT_LAYOUT, 'centro', 'clock'), DEFAULT_LAYOUT);
  assert.throws(() => setWidget(DEFAULT_LAYOUT, 'izquierda', 'weather'), /no se puede quitar/);
  assert.throws(() => setWidget(DEFAULT_LAYOUT, 'derecha', 'nope'), /desconocido/);
  assert.throws(() => setWidget(DEFAULT_LAYOUT, 'arriba', 'weather'), /Lugar/);
  assert.equal(slotIndex('2'), 1);
});

test('validateLayout exige 3 únicos, conocidos y con Yurei', () => {
  assert.deepEqual(validateLayout(['calendar', 'yurei', 'battery']), ['calendar', 'yurei', 'battery']);
  assert.throws(() => validateLayout(['clock', 'clock', 'yurei']), /repetir/);
  assert.throws(() => validateLayout(['clock', 'todos', 'weather']), /Yurei/);
  assert.throws(() => validateLayout(['yurei', 'clock']), /3 lugares/);
  assert.throws(() => validateLayout(['yurei', 'clock', 'x']), /desconocido/);
});

test('clima: geocodifica, consulta y cachea', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const json = url.includes('geocoding')
      ? { results: [{ name: 'Buenos Aires', latitude: -34.6, longitude: -58.4 }] }
      : { current: { temperature_2m: 21.6, weather_code: 3, is_day: 1 }, daily: { temperature_2m_max: [24.2], temperature_2m_min: [15.1] } };
    return { ok: true, json: async () => json };
  };
  const clock = { t: 0 };
  const weather = createWeather({ fetchImpl, now: () => clock.t });
  const w = await weather.get('buenos aires');
  assert.deepEqual(w, { city: 'Buenos Aires', temp: 22, min: 15, max: 24, desc: 'Nublado', emoji: '☁️' });
  await weather.get('buenos aires');
  assert.equal(urls.length, 2); // el segundo llamado sale de la caché
  clock.t = 11 * 60 * 1000;
  await weather.get('buenos aires');
  assert.equal(urls.length, 3); // venció: solo repite el pronóstico, no la geocodificación
  await assert.rejects(weather.get(''), /ciudad/);
  const none = createWeather({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  await assert.rejects(none.get('Zzzz'), /No encontré/);
  assert.equal(describeWeather(0, false).emoji, '🌙');
});

test('nextSchedule ordena tareas y rutinas futuras', () => {
  const now = new Date('2026-03-02T08:00:00'); // lunes
  const out = nextSchedule({
    tasks: [{ at: new Date('2026-03-02T10:00:00').toISOString(), label: 'cita', done: false }, { at: new Date('2026-03-01T10:00:00').toISOString(), label: 'vieja', done: false }, { at: new Date('2026-03-02T09:00:00').toISOString(), label: 'hecha', done: true }],
    routines: [{ time: '07:00', days: [1], label: 'mañana' }, { time: '09:30', days: [0, 1, 2, 3, 4, 5, 6], label: 'café' }]
  }, now, 3);
  assert.deepEqual(out.map((i) => i.label), ['café', 'cita', 'mañana']);
  assert.equal(out[2].kind, 'rutina'); // el lunes de la semana siguiente
});

test('tools set_widget y set_city guardan en los ajustes', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yurei-')), 's.json');
  const store = createStore(file);
  const tools = createTools({ store, system: {} });
  assert.deepEqual((await tools.execute('set_widget', { slot: 'derecha', widget: 'weather' })).widgets, ['yurei', 'clock', 'weather']);
  assert.deepEqual(createStore(file).get('settings').widgets, ['yurei', 'clock', 'weather']);
  await assert.rejects(tools.execute('set_widget', { slot: 'izquierda', widget: 'stats' }), /no se puede quitar/);
  assert.deepEqual(await tools.execute('set_city', { city: ' Rosario ' }), { city: 'Rosario' });
  await assert.rejects(tools.execute('set_city', { city: '  ' }), /ciudad/);
});

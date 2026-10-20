const test = require('node:test');
const assert = require('node:assert/strict');
const { createWeather, describeWwo } = require('../src/widgets');

const GEO = { results: [{ name: 'Isidro Casanova', latitude: -34.7, longitude: -58.58 }] };
const FC = { current: { temperature_2m: 12.4, weather_code: 0, is_day: 1 }, daily: { temperature_2m_max: [20.1], temperature_2m_min: [9.6] } };
const WTTR = { current_condition: [{ temp_C: '13', weatherCode: '116', lang_es: [{ value: 'Parcialmente nublado' }] }], weather: [{ mintempC: '10', maxtempC: '19' }] };

// Servidor simulado: cada servicio responde lo que se le diga (código o JSON)
function fakeNet(plan) {
  const calls = [];
  const fetchImpl = async (url) => {
    const host = new URL(url).hostname;
    calls.push(host);
    const step = (plan[host] || []).length > 1 ? plan[host].shift() : (plan[host] || [503])[0];
    if (step === 'timeout') { const e = new Error('abort'); e.name = 'AbortError'; throw e; }
    if (typeof step === 'number') return { ok: false, status: step, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => step };
  };
  return { fetchImpl, calls };
}
const opts = (net, clock) => ({ fetchImpl: net.fetchImpl, now: () => clock.t, sleep: async () => {} });

test('si Open-Meteo responde 503 (lo que pasó), se usa wttr.in y el widget muestra el clima', async () => {
  const net = fakeNet({ 'geocoding-api.open-meteo.com': [GEO], 'api.open-meteo.com': [503], 'wttr.in': [WTTR] });
  const w = await createWeather(opts(net, { t: 0 })).get('Isidro Casanova');
  assert.deepEqual({ ...w }, { city: 'Isidro Casanova', temp: 13, min: 10, max: 19, desc: 'Parcialmente nublado', icon: 'partly', source: 'wttr.in' });
  assert.equal(net.calls.filter((h) => h === 'api.open-meteo.com').length, 2); // reintentó una vez antes de pasar al respaldo
});

test('un fallo pasajero se resuelve con un reintento, sin necesitar el respaldo', async () => {
  const net = fakeNet({ 'geocoding-api.open-meteo.com': [GEO], 'api.open-meteo.com': [503, FC], 'wttr.in': [WTTR] });
  const w = await createWeather(opts(net, { t: 0 })).get('Isidro Casanova');
  assert.equal(w.temp, 12);
  assert.equal(w.source, undefined);
  assert.ok(!net.calls.includes('wttr.in'));
});

test('sin respuesta o límite de consultas (429): también pasa al respaldo', async () => {
  for (const failure of ['timeout', 429]) {
    const net = fakeNet({ 'geocoding-api.open-meteo.com': [failure], 'api.open-meteo.com': [failure], 'wttr.in': [WTTR] });
    assert.equal((await createWeather(opts(net, { t: 0 })).get('Rosario')).temp, 13, String(failure));
  }
});

test('si los DOS servicios fallan, se muestra el último dato bueno indicando su antigüedad', async () => {
  const plan = { 'geocoding-api.open-meteo.com': [GEO], 'api.open-meteo.com': [FC], 'wttr.in': [WTTR] };
  const net = fakeNet(plan);
  const clock = { t: 0 };
  const weather = createWeather(opts(net, clock));
  await weather.get('Isidro Casanova');
  plan['api.open-meteo.com'] = [503]; plan['wttr.in'] = [503];
  clock.t = 40 * 60 * 1000; // pasó la media hora: toca actualizar, pero los dos servicios fallan
  const w = await weather.get('Isidro Casanova');
  assert.equal(w.stale, true);
  assert.equal(w.ageMin, 40);
  assert.equal(w.temp, 12);
});

test('si los dos fallan y no hay dato previo, el mensaje es claro (no "error 503")', async () => {
  const net = fakeNet({ 'geocoding-api.open-meteo.com': [503], 'api.open-meteo.com': [503], 'wttr.in': [503] });
  await assert.rejects(createWeather(opts(net, { t: 0 })).get('Isidro Casanova'), /no está disponible ahora; reintento en un minuto/);
  const busy = fakeNet({ 'geocoding-api.open-meteo.com': [429], 'api.open-meteo.com': [429], 'wttr.in': [429] });
  await assert.rejects(createWeather(opts(busy, { t: 0 })).get('X'), /demasiadas consultas/);
  const down = fakeNet({ 'geocoding-api.open-meteo.com': ['timeout'], 'api.open-meteo.com': ['timeout'], 'wttr.in': ['timeout'] });
  await assert.rejects(createWeather(opts(down, { t: 0 })).get('X'), /no responde/);
});

test('con el servicio caído no se insiste: espera un minuto antes de volver a probar', async () => {
  const net = fakeNet({ 'geocoding-api.open-meteo.com': [503], 'api.open-meteo.com': [503], 'wttr.in': [503] });
  const clock = { t: 0 };
  const weather = createWeather(opts(net, clock));
  await assert.rejects(weather.get('X'));
  const n = net.calls.length;
  clock.t = 30 * 1000;
  await assert.rejects(weather.get('X'));
  assert.equal(net.calls.length, n, 'a los 30 s no debe haber hecho ninguna consulta nueva');
  clock.t = 61 * 1000;
  await assert.rejects(weather.get('X'));
  assert.ok(net.calls.length > n, 'pasado el minuto vuelve a intentarlo');
});

test('una ciudad que no existe se informa como tal', async () => {
  const net = fakeNet({ 'geocoding-api.open-meteo.com': [{ results: [] }], 'wttr.in': [404] });
  await assert.rejects(createWeather(opts(net, { t: 0 })).get('Ciudad Inventada'), /No encontré la ciudad "Ciudad Inventada"/);
});

test('los códigos del respaldo se traducen a los iconos de la app', () => {
  assert.equal(describeWwo(113).icon, 'sun');
  assert.equal(describeWwo(113, false).icon, 'moon');
  assert.equal(describeWwo('302').icon, 'rain');
  assert.equal(describeWwo(389).icon, 'storm');
  assert.equal(describeWwo(338).icon, 'snow');
  assert.equal(describeWwo(9999).icon, 'cloud');
});

test('se actualiza cada media hora: antes no consulta, después sí', async () => {
  const net = fakeNet({ 'geocoding-api.open-meteo.com': [GEO], 'api.open-meteo.com': [FC], 'wttr.in': [WTTR] });
  const clock = { t: 0 };
  const weather = createWeather(opts(net, clock));
  await weather.get('Isidro Casanova');
  const n = net.calls.length;
  for (const min of [1, 10, 20, 29]) {
    clock.t = min * 60 * 1000;
    assert.equal((await weather.get('Isidro Casanova')).temp, 12);
  }
  assert.equal(net.calls.length, n, 'en los primeros 30 minutos no hace ninguna consulta');
  clock.t = 31 * 60 * 1000;
  await weather.get('Isidro Casanova');
  assert.equal(net.calls.length, n + 1, 'pasada la media hora, actualiza (solo el pronóstico)');
});

test('el último dato se guarda y sigue a la vista al volver a abrir la app', async () => {
  let disk = null;
  const persist = { load: () => disk, save: (c) => { disk = JSON.parse(JSON.stringify(c)); } };
  const clock = { t: 0 };
  const first = fakeNet({ 'geocoding-api.open-meteo.com': [GEO], 'api.open-meteo.com': [FC], 'wttr.in': [WTTR] });
  await createWeather({ ...opts(first, clock), persist }).get('Isidro Casanova');
  // "se cierra y se vuelve a abrir" 10 minutos después, sin internet: se ve el dato guardado sin consultar
  clock.t = 10 * 60 * 1000;
  const offline = fakeNet({ 'geocoding-api.open-meteo.com': ['timeout'], 'api.open-meteo.com': ['timeout'], 'wttr.in': ['timeout'] });
  const again = createWeather({ ...opts(offline, clock), persist });
  assert.equal((await again.get('Isidro Casanova')).temp, 12);
  assert.equal(offline.calls.length, 0);
  // un dato guardado roto no rompe nada
  assert.equal((await createWeather({ ...opts(first, clock), persist: { load: () => ({ basura: 1 }), save() {} } }).get('Isidro Casanova')).temp, 12);
});

test('con un dato a la vista y el servicio caído, reintenta cada 5 minutos (no cada minuto)', async () => {
  const plan = { 'geocoding-api.open-meteo.com': [GEO], 'api.open-meteo.com': [FC], 'wttr.in': [WTTR] };
  const net = fakeNet(plan);
  const clock = { t: 0 };
  const weather = createWeather(opts(net, clock));
  await weather.get('Isidro Casanova');
  plan['api.open-meteo.com'] = [503]; plan['wttr.in'] = [503];
  clock.t = 31 * 60 * 1000;
  await weather.get('Isidro Casanova'); // falla: muestra el anterior
  const n = net.calls.length;
  clock.t = 33 * 60 * 1000;
  assert.equal((await weather.get('Isidro Casanova')).stale, true);
  assert.equal(net.calls.length, n, 'a los 2 minutos no insiste');
  clock.t = 37 * 60 * 1000;
  await weather.get('Isidro Casanova');
  assert.ok(net.calls.length > n, 'a los 5 minutos vuelve a intentarlo');
});

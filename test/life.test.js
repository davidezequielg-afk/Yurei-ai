const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createReminders, whenFrom } = require('../src/reminders');
const { findFiles } = require('../src/files');
const { speedTest } = require('../src/speedtest');
const { createTools } = require('../src/tools');

const memStore = (init = {}) => {
  const data = { settings: {}, todos: [], tasks: [], routines: [], reminders: [], notes: [], focusStats: {}, ...init };
  return { data, get: (k) => data[k], set: (k, v) => { data[k] = v; }, save() {}, updateSettings: (p) => Object.assign(data.settings, p), nextId: (k) => (data[k] || []).reduce((m, x) => Math.max(m, x.id), 0) + 1 };
};

test('recordatorios: suenan a su hora, sobreviven y avisan tarde si la PC estaba apagada', () => {
  const store = memStore();
  const clock = { t: new Date(2026, 9, 20, 10, 0) };
  const due = [];
  const r = createReminders({ store, now: () => clock.t, onDue: (x) => due.push(x) });
  r.add({ text: 'sacar la ropa', at: whenFrom({ inMinutes: 20 }, clock.t) });
  r.add({ text: 'llamar al médico', at: new Date(2026, 9, 21, 9, 0) });
  assert.throws(() => r.add({ text: 'x', at: new Date(2026, 9, 20, 9) }), /pasó/);
  clock.t = new Date(2026, 9, 20, 10, 19); r.tick();
  assert.equal(due.length, 0);
  clock.t = new Date(2026, 9, 20, 10, 20); r.tick();
  assert.equal(due[0].text, 'sacar la ropa');
  // "reinicio": otro objeto con el mismo almacén; la PC estuvo apagada y vuelve 30 min tarde
  clock.t = new Date(2026, 9, 21, 9, 30);
  const again = createReminders({ store, now: () => clock.t, onDue: (x) => due.push(x) });
  again.tick();
  assert.equal(due[1].text, 'llamar al médico');
  assert.equal(due[1].lateMin, 30);
  assert.equal(again.list().length, 0);
  // muy viejo (más de 12 h): se descarta sin hablar
  again.add({ text: 'viejo', at: new Date(2026, 9, 21, 10) });
  clock.t = new Date(2026, 9, 22, 10); again.tick();
  assert.equal(due.length, 2);
  assert.throws(() => whenFrom({}, clock.t), /cuándo/);
});

test('archivos: busca por nombre, tipo y fecha solo en las carpetas dadas, y open_file solo abre lo encontrado', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yf-'));
  const docs = path.join(home, 'Documentos');
  fs.mkdirSync(path.join(docs, 'trabajo'), { recursive: true });
  fs.writeFileSync(path.join(docs, 'trabajo', 'Contrato alquiler.pdf'), 'x');
  fs.writeFileSync(path.join(docs, 'notas.txt'), 'x');
  const pics = path.join(home, 'Imágenes');
  fs.mkdirSync(pics);
  fs.writeFileSync(path.join(pics, 'IMG_001.jpg'), 'x');
  const old = path.join(pics, 'vieja.jpg');
  fs.writeFileSync(old, 'x');
  fs.utimesSync(old, new Date(2020, 0, 1), new Date(2020, 0, 1));
  const roots = [docs, pics, path.join(home, 'NoExiste')];
  assert.equal(findFiles({ query: 'contrato', roots })[0].name, 'Contrato alquiler.pdf');
  assert.deepEqual(findFiles({ kind: 'imagen', days: 2, roots }).map((f) => f.name), ['IMG_001.jpg']);
  assert.throws(() => findFiles({ roots }), /qué buscar/);
  const opened = [];
  const tools = createTools({ store: memStore(), system: { openPath: async (p) => opened.push(p) }, files: { find: (q) => findFiles({ ...q, roots }) } });
  await assert.rejects(tools.execute('open_file', { path: path.join(docs, 'notas.txt') }), /búscalo/);
  const r = await tools.execute('find_files', { query: 'notas' });
  await tools.execute('open_file', { path: r.files[0].path });
  assert.equal(opened[0], path.join(docs, 'notas.txt'));
});

test('velocidad: mediana de latencia y Mbps de bajada', async () => {
  let t = 0;
  const pingTimes = [30, 10, 20, 50, 40];
  let i = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith('=0')) { t += pingTimes[i++]; return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }; }
    return { ok: true, body: (async function* () { yield new Uint8Array(1_000_000); t += 1000; yield new Uint8Array(1_500_000); })() };
  };
  const r = await speedTest({ fetchImpl, clock: () => t });
  assert.equal(r.pingMs, 30);
  assert.equal(r.downloadMbps, 20); // 2,5 MB en 1 s (desde el primer byte) = 20 Mbps
  assert.equal(r.quality, 'buena');
});

test('notas, sorteo justo, brillo en PC de escritorio, resumen del día y "léeme esto"', async () => {
  const store = memStore({ todos: [{ id: 1, text: 'comprar pan', done: false }], focusStats: { '2026-10-20': { pomodoros: 3, minutes: 75 } } });
  const pc = createTools({ store, system: { hasBattery: () => false, readClipboard: () => 'Texto largo para leer.' }, now: () => new Date(2026, 9, 20, 9) });
  await pc.execute('add_note', { text: 'El código del wifi es 1234' });
  assert.equal((await pc.execute('list_notes')).notes[0].text, 'El código del wifi es 1234');
  const picks = new Set();
  for (let k = 0; k < 60; k++) picks.add((await pc.execute('random_choice', { options: ['piedra', 'papel', 'tijera'] })).choice);
  assert.equal(picks.size, 3);
  await assert.rejects(pc.execute('set_brightness', { level: 50 }), /PC de escritorio/);
  const sum = await pc.execute('daily_summary');
  assert.deepEqual(sum.todos, ['comprar pan']);
  assert.equal(sum.focus.pomodoros, 3);
  assert.equal(sum.device, 'pc de escritorio');
  assert.equal(sum.battery, undefined); // en PC no se habla de batería
  await pc.execute('read_aloud');
  assert.equal(pc.session.readAloud, 'Texto largo para leer.');
  const nb = createTools({ store, system: { hasBattery: () => true, battery: async () => ({ level: 40, charging: false }), getBrightness: async () => ({ available: true, level: 50 }), setBrightness: async (l) => ({ level: l }) } });
  assert.equal((await nb.execute('set_brightness', { delta: -20 })).level, 30);
  assert.deepEqual((await nb.execute('daily_summary')).battery, { level: 40, charging: false });
  await nb.execute('set_birthday', { month: 3, day: 7 });
  assert.equal(store.data.settings.birthday, '03-07');
});

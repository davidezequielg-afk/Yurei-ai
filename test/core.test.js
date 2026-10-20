const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/store');
const { createTools, parseDays } = require('../src/tools');
const { createScheduler } = require('../src/scheduler');
const { runAgent, transcribe } = require('../src/gemini');

function setup(nowDate = new Date('2026-03-02T08:00:00')) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yurei-')), 's.json');
  const store = createStore(file);
  const calls = [];
  const system = {
    openUrl: async (u) => calls.push(['url', u]),
    launchApp: async (n) => calls.push(['app', n]),
    setVolume: async (n) => calls.push(['vol', n]),
    power: async (a) => calls.push(['power', a]),
    readClipboard: () => 'clip'
  };
  const clock = { t: nowDate };
  const tools = createTools({ store, system, now: () => clock.t });
  return { store, tools, calls, clock, file };
}

test('store persiste y recarga', () => {
  const { store, file } = setup();
  store.updateSettings({ soul: 'Kitsune' });
  assert.equal(createStore(file).get('settings').soul, 'Kitsune');
});

test('todos: agregar, completar, borrar', async () => {
  const { tools } = setup();
  await tools.execute('add_todo', { text: 'comprar leche' });
  await tools.execute('complete_todo', { ref: 'leche' });
  assert.deepEqual((await tools.execute('list_todos')).completed, 1);
  await tools.execute('remove_todo', { ref: '1' });
  assert.equal((await tools.execute('list_todos')).total, 0);
});

test('site_search codifica la consulta y open_url rechaza otros protocolos', async () => {
  const { tools, calls } = setup();
  await tools.execute('site_search', { site: 'youtube', query: 'lo fi & chill' });
  assert.equal(calls[0][1], 'https://www.youtube.com/results?search_query=lo%20fi%20%26%20chill');
  await assert.rejects(tools.execute('open_url', { url: 'file:///etc/passwd' }));
  await assert.rejects(tools.execute('open_url', { url: 'javascript:alert(1)' }));
  await assert.rejects(tools.execute('nope'));
});

test('power_action exige confirmación', async () => {
  const { tools, calls } = setup();
  assert.equal((await tools.execute('power_action', { action: 'shutdown', confirmed: false })).executed, false);
  assert.equal(calls.length, 0);
  await tools.execute('power_action', { action: 'lock', confirmed: true });
  assert.deepEqual(calls[0], ['power', 'lock']);
});

test('parseDays', () => {
  assert.deepEqual(parseDays('weekdays'), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseDays('mon, Wed'), [1, 3]);
  assert.throws(() => parseDays('xyz'));
});

test('tareas programadas se ejecutan una vez', async () => {
  const { store, tools, calls, clock } = setup();
  await tools.execute('schedule_task', { label: 'buscar', at: '2026-03-02T09:00', action: 'web_search', target: 'clima' });
  const reports = [];
  const sch = createScheduler({ store, tools, report: (r) => reports.push(r), now: () => clock.t });
  await sch.tick();
  assert.equal(calls.length, 0);
  clock.t = new Date('2026-03-02T09:01:00');
  await sch.tick();
  await sch.tick();
  assert.equal(calls.length, 1);
  assert.equal(reports.length, 1);
});

test('rutinas: una vez al día, respetan días y juntan acciones', async () => {
  const { store, tools, calls, clock } = setup(new Date('2026-03-02T07:00:00')); // lunes
  await tools.execute('create_routine', { label: 'mañana', time: '08:30', days: 'weekdays', action: 'open_app', target: 'notepad' });
  await tools.execute('create_routine', { label: 'Mañana', time: '08:30', action: 'open_url', target: 'https://example.com' });
  assert.equal(store.get('routines').length, 1);
  const sch = createScheduler({ store, tools, report() {}, now: () => clock.t });
  clock.t = new Date('2026-03-02T08:31:00');
  await sch.tick();
  await sch.tick();
  assert.equal(calls.length, 2);
  clock.t = new Date('2026-03-07T08:31:00'); // sábado
  await sch.tick();
  assert.equal(calls.length, 2);
});

test('runAgent ejecuta function calls y devuelve el texto final', async () => {
  const replies = [
    { candidates: [{ content: { parts: [{ functionCall: { name: 'add_todo', args: { text: 'x' } } }] } }] },
    { candidates: [{ content: { parts: [{ text: 'Listo.' }] } }] }
  ];
  const bodies = [];
  const fetchImpl = async (_url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, json: async () => replies.shift() }; };
  const executed = [];
  const out = await runAgent({
    apiKey: 'k', model: 'm', system: 's', userParts: [{ text: 'hola' }], declarations: [{ name: 'add_todo' }],
    executeTool: async (n, a) => { executed.push([n, a]); return { id: 1 }; }, fetchImpl
  });
  assert.equal(out.text, 'Listo.');
  assert.deepEqual(executed, [['add_todo', { text: 'x' }]]);
  assert.equal(bodies[1].contents.at(-1).parts[0].functionResponse.name, 'add_todo');
});

test('errores de API y falta de key', async () => {
  await assert.rejects(transcribe({ apiKey: '', model: 'm', audioB64: '' }), /API key/);
  const fetchImpl = async () => ({ ok: false, status: 429, text: async () => 'quota' });
  await assert.rejects(transcribe({ apiKey: 'k', model: 'm', audioB64: '', fetchImpl }), /429/);
});

test('parseWake extrae la orden tras el nombre', () => {
  const { parseWake } = require('../src/assistant');
  assert.deepEqual(parseWake('WAKE: abre youtube'), { woke: true, command: 'abre youtube' });
  assert.deepEqual(parseWake('WAKE:'), { woke: true, command: '' });
  assert.deepEqual(parseWake('NONE'), { woke: false, command: '' });
  assert.deepEqual(parseWake(''), { woke: false, command: '' });
});

test('assistant.wake llama a Gemini con el nombre configurado', async () => {
  const { createAssistant } = require('../src/assistant');
  const { store } = setup();
  store.updateSettings({ apiKey: 'k', soul: 'Kitsune' });
  let sent;
  const fetchImpl = async (_u, init) => { sent = JSON.parse(init.body); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'WAKE: hola' }] } }] }) }; };
  const out = await createAssistant({ store, tools: {}, fetchImpl }).wake('AAAA');
  assert.deepEqual(out, { woke: true, command: 'hola' });
  assert.match(sent.contents[0].parts[0].text, /Kitsune/);
  assert.equal(sent.contents[0].parts[1].inlineData.mimeType, 'audio/wav');
});

test('synthesize pide audio con la voz elegida y devuelve el PCM', async () => {
  const { synthesize } = require('../src/gemini');
  let sent;
  const fetchImpl = async (_u, init) => { sent = JSON.parse(init.body); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: 'UENN' } }] } }] }) }; };
  assert.equal(await synthesize({ apiKey: 'k', model: 'm', text: 'hola', voiceName: 'Charon', fetchImpl }), 'UENN');
  assert.deepEqual(sent.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(sent.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Charon');
  assert.match(sent.contents[0].parts[0].text, /hola$/);
  const empty = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }) });
  await assert.rejects(synthesize({ apiKey: 'k', model: 'm', text: 'a', voiceName: 'Kore', fetchImpl: empty }), /audio/);
});

test('store migra modelos obsoletos a los actuales', () => {
  const { DEFAULTS } = require('../src/store');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yurei-')), 's.json');
  fs.writeFileSync(file, JSON.stringify({ settings: { model: 'gemini-2.5-flash', ttsModel: 'gemini-2.5-flash-preview-tts', soul: 'X' } }));
  const st = createStore(file).get('settings');
  assert.equal(st.model, DEFAULTS.settings.model);
  assert.equal(st.ttsModel, DEFAULTS.settings.ttsModel);
  assert.equal(st.soul, 'X');
  fs.writeFileSync(file, JSON.stringify({ settings: { model: 'gemini-3.8-flash' } }));
  assert.equal(createStore(file).get('settings').model, 'gemini-3.8-flash');
});

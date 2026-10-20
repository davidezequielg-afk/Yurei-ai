const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { toJsonSchema, runClaude, runOpenAI, transcribeOpenAI, speakOpenAI } = require('../src/brains');
const { createAssistant, routing } = require('../src/assistant');
const { declarations } = require('../src/tools');

const DECL = [{ name: 'set_volume', description: 'Volumen', parameters: { type: 'OBJECT', properties: { level: { type: 'NUMBER', description: 'Nivel' } }, required: ['level'] } }];

test('las herramientas se convierten a JSON Schema (Claude/OpenAI)', () => {
  assert.deepEqual(toJsonSchema(DECL[0].parameters), { type: 'object', properties: { level: { type: 'number', description: 'Nivel' } }, required: ['level'] });
  assert.deepEqual(toJsonSchema({ type: 'OBJECT', properties: {} }), { type: 'object', properties: {} });
  // todas las de Yurei se convierten sin tipos en mayúscula
  const all = JSON.stringify(declarations.map((d) => toJsonSchema(d.parameters)));
  assert.doesNotMatch(all, /"type":"[A-Z]/);
});

test('Claude: bucle de herramientas con el SDK, historial solo texto y red de seguridad en Opus 5.5', async () => {
  const sent = [];
  const replies = [
    { stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'tool_use', id: 't1', name: 'set_volume', input: { level: 30 } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: '[feliz] Listo, volumen al 30.' }] }
  ];
  const client = { beta: { messages: { create: async (p) => { sent.push(JSON.parse(JSON.stringify(p))); return replies.shift(); } } } };
  const calls = [];
  const out = await runClaude({ apiKey: 'k', model: 'claude-opus-5-5', system: 'S', text: 'baja el volumen', history: [{ role: 'user', parts: [{ text: 'hola' }] }, { role: 'model', parts: [{ text: 'hola!' }] }], declarations: DECL, executeTool: async (n, a) => { calls.push([n, a]); return { ok: true }; }, client });
  assert.equal(out.text, '[feliz] Listo, volumen al 30.');
  assert.deepEqual(calls, [['set_volume', { level: 30 }]]);
  assert.equal(sent[0].system, 'S');
  assert.equal(sent[0].tools[0].input_schema.type, 'object');
  assert.deepEqual(sent[0].messages.slice(0, 2), [{ role: 'user', content: 'hola' }, { role: 'assistant', content: 'hola!' }]);
  assert.equal(sent[0].fallbacks, 'default');
  assert.deepEqual(sent[0].betas, ['server-side-fallback-2026-07-01']);
  // segundo pedido: se reenvía el turno completo del asistente (con su razonamiento) y los resultados juntos
  assert.equal(sent[1].messages[3].content[0].type, 'thinking');
  assert.equal(sent[1].messages[4].content[0].type, 'tool_result');
  assert.equal(sent[1].messages[4].content[0].tool_use_id, 't1');
  // Haiku: sin parámetro de red de seguridad (no la admite)
  const sent2 = [];
  await runClaude({ apiKey: 'k', model: 'claude-haiku-5-5', system: 'S', text: 'x', declarations: DECL, executeTool: async () => ({}), client: { beta: { messages: { create: async (p) => { sent2.push(p); return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }; } } } } });
  assert.equal(sent2[0].fallbacks, undefined);
  // si se niega, se avisa sin leer contenido
  const refused = await runClaude({ apiKey: 'k', model: 'claude-opus-5-5', system: 'S', text: 'x', declarations: DECL, executeTool: async () => ({}), client: { beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } } } });
  assert.match(refused.text, /no puedo/);
  await assert.rejects(runClaude({ apiKey: '', model: 'claude-opus-5-5', system: 'S', text: 'x', declarations: DECL, executeTool: async () => ({}) }), /API key de Claude/);
});

test('compatible con OpenAI: bucle de herramientas, tope de acciones y errores claros', async () => {
  const bodies = [];
  const plan = [
    { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'set_volume', arguments: '{"level":50}' } }] } }] },
    { choices: [{ message: { content: '[neutral] Hecho.' } }] }
  ];
  const fetchImpl = async (url, init) => { bodies.push({ url, auth: init.headers.authorization, body: JSON.parse(init.body) }); return { ok: true, json: async () => plan.shift() }; };
  const calls = [];
  const out = await runOpenAI({ baseUrl: 'http://localhost:20128/v1/', apiKey: '', model: 'auto', system: 'S', text: 'sube a 50', declarations: DECL, executeTool: async (n, a) => { calls.push([n, a]); return { ok: 1 }; }, fetchImpl });
  assert.equal(out.text, '[neutral] Hecho.');
  assert.deepEqual(calls, [['set_volume', { level: 50 }]]);
  assert.equal(bodies[0].url, 'http://localhost:20128/v1/chat/completions');
  assert.equal(bodies[0].auth, undefined); // sin clave: no se manda cabecera
  assert.equal(bodies[0].body.messages[0].role, 'system');
  assert.equal(bodies[0].body.tools[0].function.parameters.type, 'object');
  assert.equal(bodies[1].body.messages.at(-1).role, 'tool');
  // tope: un modelo que pide herramientas sin parar no hace más de 12 acciones
  let n = 0;
  const loopy = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '', tool_calls: Array.from({ length: 5 }, (_, i) => ({ id: `x${n}${i}`, function: { name: 'set_volume', arguments: '{}' } })) } }] }) });
  const done = [];
  await runOpenAI({ baseUrl: 'https://x.ai/v1', apiKey: 'k', model: 'm', system: 'S', text: 't', declarations: DECL, executeTool: async () => { n++; done.push(1); return {}; }, fetchImpl: loopy });
  assert.equal(done.length, 12);
  const bad = async () => ({ ok: false, status: 401, text: async () => '{"error":{"message":"bad key sk-123"}}' });
  await assert.rejects(runOpenAI({ baseUrl: 'https://x/v1', apiKey: 'sk-123', model: 'm', system: 'S', text: 't', declarations: DECL, executeTool: async () => ({}), fetchImpl: bad }), /rechazó la clave/);
});

test('transcripción y voz por el formato de OpenAI', async () => {
  let got;
  const t = await transcribeOpenAI({ baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'k', model: 'whisper-large-v3-turbo', audioB64: Buffer.from('RIFF').toString('base64'), fetchImpl: async (url, init) => { got = { url, form: init.body, auth: init.headers.authorization }; return { ok: true, json: async () => ({ text: ' hola yurei ' }) }; } });
  assert.equal(t, 'hola yurei');
  assert.equal(got.url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(got.form.get('model'), 'whisper-large-v3-turbo');
  assert.equal(got.auth, 'Bearer k');
  let body;
  const pcm = await speakOpenAI({ baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'tts-1', voice: 'alloy', text: 'hola', fetchImpl: async (_u, init) => { body = JSON.parse(init.body); return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }; } });
  assert.equal(body.response_format, 'pcm');
  assert.equal(pcm, Buffer.from([1, 2, 3, 4]).toString('base64'));
});

test('ruteo: qué IA piensa, con cuál oye y con cuál habla', () => {
  assert.deepEqual(routing({ brainProvider: 'gemini', apiKey: 'g' }).hearing, 'gemini');
  const claudeWithGemini = routing({ brainProvider: 'anthropic', brainPreset: 'claude', apiKey: 'g' });
  assert.deepEqual([claudeWithGemini.hearing, claudeWithGemini.speech], ['gemini', 'gemini']);
  const claudeAlone = routing({ brainProvider: 'anthropic', brainPreset: 'claude' });
  assert.deepEqual([claudeAlone.hearing, claudeAlone.speech], ['none', 'system']);
  const omni = routing({ brainProvider: 'openai', brainPreset: 'omniroute' });
  assert.deepEqual([omni.hearing, omni.speech], ['brain', 'brain']);
  const ollama = routing({ brainProvider: 'openai', brainPreset: 'ollama' });
  assert.equal(ollama.speech, 'system'); // sin modelo de voz conocido: la de Windows
});

test('asistente con otra IA: transcribe la voz, piensa con ella y no usa Gemini', async () => {
  const settings = { brainProvider: 'openai', brainPreset: 'omniroute', brainBase: 'http://localhost:20128/v1', brainModel: 'auto', brainKey: '', soul: 'Yurei', personality: 'x' };
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.endsWith('/audio/transcriptions')) return { ok: true, json: async () => ({ text: 'Yurei, ¿qué hora es?' }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '[feliz] Son las diez.' } }] }) };
  };
  const a = createAssistant({ store: { get: (k) => (k === 'settings' ? settings : []) }, tools: { declarations: DECL, execute: async () => ({}), session: {} }, fetchImpl });
  const r = await a.ask({ audioB64: Buffer.from('RIFF').toString('base64') });
  assert.equal(r.reply, 'Son las diez.');
  assert.equal(r.mood, 'feliz');
  assert.equal(r.heard, 'Yurei, ¿qué hora es?');
  assert.ok(urls.every((u) => u.startsWith('http://localhost:20128/v1/')));
  const w = await a.wake(Buffer.from('RIFF').toString('base64'));
  assert.deepEqual(w, { woke: true, command: '¿qué hora es?' });
});

test('la clave de la otra IA se guarda cifrada y nunca vuelve a la ventana', () => {
  const { createStore } = require('../src/store');
  const S = require('../src/secure');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yb-')), 'y.json');
  const secret = { encrypt: (t) => Buffer.from(`enc:${t}`).toString('base64'), decrypt: (b) => Buffer.from(b, 'base64').toString().slice(4) };
  const store = createStore(file, { secret });
  store.updateSettings(S.validateSettingsPatch({ brainKey: 'sk-ant-secreta', brainPreset: 'claude', brainProvider: 'anthropic', brainModel: 'claude-opus-5-5' }));
  const disk = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(disk, /sk-ant-secreta/);
  assert.match(disk, /brainKeyEnc/);
  assert.equal(createStore(file, { secret }).get('settings').brainKey, 'sk-ant-secreta');
  assert.deepEqual(S.validateSettingsPatch({ brainKey: S.MASK }), {}); // la máscara = sin cambios
  assert.throws(() => S.validateSettingsPatch({ brainBase: 'http://otro-sitio.com/v1' }), /https/);
  assert.throws(() => S.validateSettingsPatch({ brainPreset: 'inventado' }));
});

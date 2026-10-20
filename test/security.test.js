const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/store');
const { createSystem } = require('../src/system');
const { createTtsCache } = require('../src/ttscache');
const { runAgent } = require('../src/gemini');
const S = require('../src/secure');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'yurei-sec-'));
const ROOT = path.join(__dirname, '..', 'renderer');

test('solo las páginas locales de la app pueden usar el puente IPC', () => {
  const url = (p) => `file://${p}`;
  assert.equal(S.isTrustedUrl(url(path.join(ROOT, 'index.html')), ROOT), true);
  assert.equal(S.isTrustedUrl(url(path.join(ROOT, 'sub', 'x.html')), ROOT), true);
  assert.equal(S.isTrustedUrl('https://evil.example/renderer/index.html', ROOT), false);
  assert.equal(S.isTrustedUrl('data:text/html,<script>1</script>', ROOT), false);
  assert.equal(S.isTrustedUrl('about:blank', ROOT), false);
  assert.equal(S.isTrustedUrl(url(path.join(ROOT, '..', 'main.js')), ROOT), false); // otro archivo local
  assert.equal(S.isTrustedUrl(url(`${ROOT}-evil/index.html`), ROOT), false); // prefijo parecido
  assert.equal(S.isTrustedUrl(url(`${ROOT}/../secret.html`), ROOT), false); // escape con ..
  assert.equal(S.isTrustedUrl(undefined, ROOT), false);
  assert.equal(S.isTrustedUrl(12, ROOT), false);
});

test('las peticiones a la IA se validan: tipo, tamaño y formato', () => {
  assert.deepEqual(S.validateAskPayload({ text: 'hola' }), { text: 'hola' });
  assert.deepEqual(S.validateAskPayload({ audioB64: 'QUJD', imageB64: 'QUJD' }), { audioB64: 'QUJD', imageB64: 'QUJD' });
  assert.equal(S.validateAskPayload({ text: 'x'.repeat(10000) }).text.length, 4000);
  assert.throws(() => S.validateAskPayload(null), /no válida/);
  assert.throws(() => S.validateAskPayload({}), /Nada que procesar/);
  assert.throws(() => S.validateAskPayload({ text: 5 }), /no válido/);
  assert.throws(() => S.validateAskPayload({ audioB64: 'no es base64!!' }), /no válido/);
  assert.throws(() => S.validateAskPayload({ audioB64: 'A'.repeat(S.MAX_AUDIO_B64 + 4) }), /demasiado grande/);
  assert.throws(() => S.validateAskPayload({ text: 'a', imageB64: { a: 1 } }), /vacío/);
  assert.throws(() => S.validateAudio(''), /vacío/);
});

test('los ajustes usan lista blanca: lo desconocido se descarta y lo inválido se rechaza', () => {
  const clean = S.validateSettingsPatch({ soul: ' Yurei\u0000 ', theme: 'light', fillers: 'sí', launcher: [{ kind: 'app' }], tasks: [1], __proto__: { x: 1 }, widgetCatalog: [], conversationSeconds: 9999, opacity: 1, apiKey: S.MASK });
  assert.deepEqual(clean, { soul: 'Yurei', theme: 'light', fillers: false, conversationSeconds: 120, opacity: 30 });
  assert.equal(Object.hasOwn(clean, 'launcher'), false);
  assert.equal(Object.hasOwn(clean, 'apiKey'), false); // la máscara = sin cambios
  assert.throws(() => S.validateSettingsPatch({ model: 'x/../../etc' }), /modelo/);
  assert.throws(() => S.validateSettingsPatch({ model: 'm?key=1' }), /modelo/);
  assert.throws(() => S.validateSettingsPatch({ apiKey: 'tiene espacios y símbolos <script>' }), /formato/);
  assert.throws(() => S.validateSettingsPatch({ theme: 'rojo' }), /Tema/);
  assert.throws(() => S.validateSettingsPatch({ customBg: 'red; background:url(x)' }), /Color/);
  assert.throws(() => S.validateSettingsPatch({ voice: 'Kore"}' }), /Voz/);
  assert.throws(() => S.validateSettingsPatch([]), /no válidos/);
  assert.equal(S.validateSettingsPatch({ apiKey: '  AIzaSyD-example_key_1234567890  ' }).apiKey, 'AIzaSyD-example_key_1234567890');
  assert.equal(S.validateSettingsPatch({ apiKey: '' }).apiKey, ''); // borrar la clave
  assert.equal(S.validateSettingsPatch({ abilities: Array.from({ length: 50 }, (_, i) => `a${i}`) }).abilities.length, 20);
  assert.deepEqual(S.validateSettingsPatch({ widgets: ['calendar', 'yurei', 'clock'] }).widgets, ['calendar', 'yurei', 'clock']);
  assert.throws(() => S.validateSettingsPatch({ widgets: ['battery', 'yurei', 'clock'] }, { unavailable: ['battery'] }), /batería/);
});

test('acciones de reproducción y lugares se validan', () => {
  assert.deepEqual(S.validateMediaAction({ action: 'seek', arg: 9999 }), { action: 'seek', arg: 600 });
  assert.deepEqual(S.validateMediaAction({ action: 'pause' }), { action: 'pause', arg: '' });
  assert.throws(() => S.validateMediaAction({ action: 'seek; calc' }), /no válida/);
  assert.throws(() => S.validateMediaAction({ action: 'seek', arg: 'abc' }), /no válidos/);
  assert.throws(() => S.validateMediaAction(null), /no válida/);
  assert.equal(S.validateSlot(3), 3);
  for (const bad of [-1, 4, 1.5, 'x', '2', '', null, undefined, true, [], [1], NaN, Infinity, {}]) assert.throws(() => S.validateSlot(bad), /no válido/);
});

test('la API key se guarda cifrada, nunca en claro, y se migra la de versiones anteriores', () => {
  const file = path.join(tmp(), 'yurei.json');
  const secret = { encrypt: (s) => Buffer.from(`ENC:${[...s].reverse().join('')}`).toString('base64'), decrypt: (b) => [...Buffer.from(b, 'base64').toString().slice(4)].reverse().join('') };
  const store = createStore(file, { secret });
  store.updateSettings({ apiKey: 'AIzaSyD-ejemplo-123456' });
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(!raw.includes('AIzaSyD-ejemplo-123456'), 'la clave no debe estar en claro en el disco');
  assert.ok(raw.includes('apiKeyEnc'));
  assert.equal(createStore(file, { secret }).get('settings').apiKey, 'AIzaSyD-ejemplo-123456');
  assert.equal(createStore(file, { secret: { ...secret, decrypt: () => { throw new Error('otro usuario'); } } }).get('settings').apiKey, ''); // no descifrable: se pide de nuevo
  // migración: archivo viejo con la clave en claro
  const old = path.join(tmp(), 'old.json');
  fs.writeFileSync(old, JSON.stringify({ settings: { apiKey: 'CLAVE-VIEJA-EN-CLARO-1' } }));
  assert.equal(createStore(old, { secret }).get('settings').apiKey, 'CLAVE-VIEJA-EN-CLARO-1');
  assert.ok(!fs.readFileSync(old, 'utf8').includes('CLAVE-VIEJA-EN-CLARO-1'));
  assert.equal(createStore(path.join(tmp(), 'x.json'), { secret }).encrypted(), true);
  assert.equal(createStore(path.join(tmp(), 'y.json')).encrypted(), false);
});

test('el guardado es atómico, sin restos, y se puede borrar todo', () => {
  const dir = tmp();
  const file = path.join(dir, 'yurei.json');
  const store = createStore(file);
  store.updateSettings({ soul: 'Otra' });
  store.set('todos', [{ id: 1, text: 'secreto', done: false }]);
  assert.deepEqual(fs.readdirSync(dir), ['yurei.json']); // sin .tmp olvidados
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  store.wipe();
  assert.equal(fs.existsSync(file), false);
  assert.equal(store.get('todos').length, 0);
  assert.equal(store.get('settings').soul, 'Yurei');
  fs.writeFileSync(file, '{ esto no es json');
  assert.equal(createStore(file).get('settings').soul, 'Yurei'); // archivo corrupto: valores de fábrica, sin caerse
});

function winSystem(over = {}) {
  const spawned = [];
  const opened = [];
  const sys = createSystem({
    platform: 'win32', dataDir: tmp(), clipboard: { readText: () => 'previo', writeText() {} },
    shell: { openPath: async (p) => { opened.push(p); return ''; }, openExternal: async (u) => { opened.push(u); } },
    spawnImpl: (cmd, args) => { spawned.push([cmd, args]); return { unref() {} }; },
    ...over
  });
  sys.listApps = () => [{ name: 'Discord', file: 'C:\\Start\\Discord.lnk' }, { name: 'Calculadora Pro', file: 'C:\\Start\\Calc Pro.lnk' }];
  return { sys, spawned, opened };
}

test('abrir apps no pasa nunca texto por un intérprete de comandos (inyección de comandos)', async () => {
  const { sys, spawned, opened } = winSystem();
  await sys.launchApp('discord');
  assert.deepEqual(opened, ['C:\\Start\\Discord.lnk']); // se abre el acceso real, con shell.openPath
  await sys.launchApp('Bloc de notas');
  assert.deepEqual(spawned, [['notepad.exe', []]]); // ejecutable fijo, sin argumentos del usuario
  const attacks = ['x&calc', 'discord & calc.exe', 'a|b', 'x" & calc & "', '%COMSPEC% /c calc', '..\\..\\Windows\\System32\\cmd.exe', 'C:\\Windows\\System32\\cmd.exe', '$(calc)', 'x\ncalc', 'cmd', 'powershell', '', 'a'.repeat(500)];
  for (const name of attacks) {
    await assert.rejects(sys.launchApp(name), /No encontré|no válido/, `debía rechazar: ${JSON.stringify(name)}`);
  }
  assert.deepEqual(spawned, [['notepad.exe', []]]); // ningún ataque llegó a ejecutar nada
  assert.equal(opened.length, 1);
  assert.ok(!spawned.some(([cmd]) => /cmd|powershell/i.test(cmd)));
});

test('apagar, reiniciar y suspender exigen confirmación del usuario fuera de la IA', async () => {
  const asked = [];
  const { sys, spawned } = winSystem({ confirm: async (action) => { asked.push(action); return false; } });
  for (const action of ['shutdown', 'restart', 'sleep']) await assert.rejects(sys.power(action), /Cancelado/);
  assert.deepEqual(spawned, []); // sin confirmación no se ejecuta nada
  assert.deepEqual(asked, ['shutdown', 'restart', 'sleep']);
  const ok = winSystem({ confirm: async () => true });
  await ok.sys.power('shutdown');
  assert.deepEqual(ok.spawned, [['shutdown.exe', ['/s', '/t', '5']]]);
  const lock = winSystem({ confirm: async () => { throw new Error('no debía preguntar'); } });
  await lock.sys.power('lock'); // bloquear no es destructivo: no pregunta
  assert.equal(lock.spawned[0][0], 'rundll32.exe');
  const dflt = winSystem({ confirm: undefined });
  await assert.rejects(dflt.sys.power('shutdown'), /Cancelado/); // por defecto: denegar
});

test('solo se abren URLs http/https', async () => {
  const { sys, opened } = winSystem();
  await sys.openUrl('https://example.com/a?b=1');
  for (const bad of ['file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', 'ms-msdt:/id PCWDiagnostic', 'ssh://x', 'calc.exe', '']) {
    assert.throws(() => sys.openUrl(bad), /URL no válida|http/);
  }
  assert.deepEqual(opened, ['https://example.com/a?b=1']);
});

test('dictar no pierde lo que el usuario tenía copiado', async () => {
  const clip = { text: 'mi contraseña copiada', readText() { return this.text; }, writeText(t) { this.text = t; } };
  const { sys } = winSystem({ clipboard: clip });
  sys.pasteText = sys.pasteText.bind(sys);
  // en Linux de pruebas no hay PowerShell: se comprueba la restauración con la plataforma simulada sin tocar el sistema
  const lin = createSystem({ platform: 'linux', clipboard: clip, shell: {} });
  await lin.pasteText('texto dictado');
  assert.equal(clip.text, 'mi contraseña copiada');
});

test('la caché no crece sin límite', async () => {
  const dir = path.join(tmp(), 'c');
  const cache = createTtsCache(dir, { maxEntries: 2 });
  for (const k of ['a', 'b', 'c', 'd']) assert.equal(await cache.getOrCreate(k, async () => `v-${k}`), `v-${k}`);
  assert.equal(fs.readdirSync(dir).length, 2);
});

test('una orden maliciosa no puede disparar decenas de acciones ni colgar la petición', async () => {
  const many = { candidates: [{ content: { parts: Array.from({ length: 30 }, () => ({ functionCall: { name: 'open_url', args: { url: 'https://x.com' } } })) } }] };
  const done = { candidates: [{ content: { parts: [{ text: 'ok' }] } }] };
  const replies = [many, done];
  let executed = 0;
  const out = await runAgent({
    apiKey: 'k', model: 'm', system: 's', userParts: [{ text: 'x' }], declarations: [{ name: 'open_url' }],
    executeTool: async () => { executed++; return {}; }, fetchImpl: async () => ({ ok: true, json: async () => replies.shift() })
  });
  assert.equal(executed, 12);
  assert.equal(out.actions.filter((a) => a.result.error).length, 18);
  // la clave nunca aparece en los errores
  const leak = async () => ({ ok: false, status: 400, text: async () => 'API key not valid: SECRETA-123' });
  await assert.rejects(runAgent({ apiKey: 'SECRETA-123', model: 'm', system: 's', userParts: [{ text: 'x' }], fetchImpl: leak }), (e) => !e.message.includes('SECRETA-123'));
  // tiempo límite
  const { generate } = require('../src/gemini');
  const hang = (_u, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))));
  await assert.rejects(generate({ apiKey: 'k', model: 'm', body: {}, fetchImpl: hang, timeoutMs: 50 }), /tardó demasiado/);
});

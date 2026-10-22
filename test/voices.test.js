const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { createVoices, download, VOICES, ENGINE, KOKORO } = require('../src/voices');
const { createKokoro } = require('../src/kokoro');
const { createPiper, wavToPcm24, cleanText } = require('../src/piper');
const { routing } = require('../src/assistant');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'yvoices-'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const bodyOf = (buf, chunk = 7) => ({ getReader() { let i = 0; return { read: async () => (i >= buf.length ? { done: true } : { done: false, value: buf.subarray(i, (i += chunk)) }) }; } });
const okFetch = (buf) => async () => ({ ok: true, status: 200, body: bodyOf(buf) });

function wav(rate, samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(v, i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

test('hay 4 voces (2 de Piper y 2 de Kokoro, una femenina y una masculina de cada una), con huellas completas', () => {
  assert.equal(VOICES.length, 4);
  for (const eng of ['piper', 'kokoro']) {
    const own = VOICES.filter((v) => v.engine === eng);
    assert.equal(own.length, 2);
    assert.deepEqual(own.map((v) => v.gender).sort(), ['f', 'm']);
  }
  assert.ok(VOICES.find((v) => v.id === 'daniela' && v.accent === 'Argentina')); // la rioplatense se queda
  for (const v of VOICES.filter((x) => x.engine === 'piper')) { assert.match(v.sha256.onnx, /^[0-9a-f]{64}$/); assert.match(v.sha256.json, /^[0-9a-f]{64}$/); }
  assert.equal(KOKORO.files.length, 3);
  for (const f of KOKORO.files) assert.match(f.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(VOICES.filter((x) => x.engine === 'kokoro').map((x) => x.sid), [28, 29]); // ef_dora y em_alex en la tabla de voces
  assert.match(ENGINE.sha256, /^[0-9a-f]{64}$/);
  assert.ok(ENGINE.url.startsWith('https://github.com/rhasspy/piper/releases/download/'));
});

test('download deja el archivo solo si la huella coincide', async () => {
  const dir = tmp();
  const data = crypto.randomBytes(5000);
  const dest = path.join(dir, 'a.bin');
  await download({ url: 'https://x/a', dest, sha256: sha(data), fetchImpl: okFetch(data) });
  assert.deepEqual(fs.readFileSync(dest), data);
  const dest2 = path.join(dir, 'b.bin');
  await assert.rejects(download({ url: 'https://x/b', dest: dest2, sha256: sha(Buffer.from('otra cosa')), fetchImpl: okFetch(data) }), /huella/);
  assert.ok(!fs.existsSync(dest2) && !fs.existsSync(`${dest2}.part`)); // no queda nada a medias
  await assert.rejects(download({ url: 'https://x/c', dest: path.join(dir, 'c.bin'), sha256: 'x', fetchImpl: async () => ({ ok: false, status: 404 }) }), /404/);
});

test('las voces incluidas en el instalador cuentan como instaladas y no se pueden quitar ni hace falta bajarlas', async () => {
  const dir = tmp();
  const bundled = tmp();
  const v = VOICES[0];
  fs.mkdirSync(path.join(bundled, 'engine', 'piper'), { recursive: true });
  fs.writeFileSync(path.join(bundled, 'engine', 'piper', 'piper.exe'), 'x');
  fs.writeFileSync(path.join(bundled, `${v.file}.onnx`), 'm');
  fs.writeFileSync(path.join(bundled, `${v.file}.onnx.json`), '{}');
  const voices = createVoices({ dir, bundledDir: bundled, platform: 'win32', fetchImpl: async () => { throw new Error('no debe bajar nada'); } });
  const st = voices.status();
  assert.equal(st.bundled, true);
  assert.equal(st.voices.find((x) => x.id === v.id).installed, true);
  assert.equal(st.voices.find((x) => x.id === VOICES[1].id).installed, false);
  assert.equal(st.voices.find((x) => x.id === 'dora').installed, false); // sin los archivos de Kokoro
  assert.equal(voices.ready(v.id), true);
  assert.ok(voices.paths(v.id).model.startsWith(bundled));
  await voices.install(v.id); // ya está: no baja nada
  assert.throws(() => voices.paths('nope'), /desconocida/);
});

test('install baja motor y voz, verifica y deja todo listo (y rechaza un motor alterado)', async () => {
  const dir = tmp();
  const v = VOICES[1];
  const fake = { engine: Buffer.from('zip-falso'), onnx: crypto.randomBytes(300), json: Buffer.from('{"ok":1}') };
  // se prueba con huellas propias: la lista real es fija, así que se reemplazan solo dentro del test
  const saved = { e: ENGINE.sha256, o: v.sha256.onnx, j: v.sha256.json, size: v.size, esize: ENGINE.size };
  ENGINE.sha256 = sha(fake.engine); ENGINE.size = fake.engine.length; v.sha256.onnx = sha(fake.onnx); v.sha256.json = sha(fake.json); v.size = fake.onnx.length;
  try {
    const fetchImpl = async (url) => ({ ok: true, status: 200, body: bodyOf(url.endsWith('.zip') ? fake.engine : url.endsWith('.json') ? fake.json : fake.onnx) });
    const extract = async (_zip, dest) => { fs.mkdirSync(path.join(dest, 'piper'), { recursive: true }); fs.writeFileSync(path.join(dest, 'piper', 'piper.exe'), 'bin'); };
    const voices = createVoices({ dir, platform: 'win32', fetchImpl, extract });
    const steps = [];
    await voices.install(v.id, (p) => steps.push(p));
    assert.equal(voices.ready(v.id), true);
    assert.equal(steps.at(-1).phase, 'listo');
    assert.ok(steps.every((p, i) => i === 0 || p.fraction >= steps[i - 1].fraction));
    voices.remove(v.id);
    assert.equal(voices.installed(v.id), false);
    const bad = createVoices({ dir: tmp(), platform: 'win32', fetchImpl: async () => ({ ok: true, status: 200, body: bodyOf(Buffer.from('motor alterado')) }), extract });
    await assert.rejects(bad.install(v.id), /huella/);
    assert.equal(bad.engineReady(), false);
    await assert.rejects(createVoices({ dir: tmp(), platform: 'linux' }).install(v.id), /Windows/);
  } finally {
    ENGINE.sha256 = saved.e; ENGINE.size = saved.esize; v.sha256.onnx = saved.o; v.sha256.json = saved.j; v.size = saved.size;
  }
});

test('wavToPcm24 pasa de 22,05 kHz a 24 kHz y rechaza audio inválido', () => {
  const sine = Array.from({ length: 22050 }, (_, i) => Math.round(Math.sin((2 * Math.PI * 440 * i) / 22050) * 12000));
  const pcm = wavToPcm24(wav(22050, sine));
  assert.equal(pcm.length / 2, 24000); // 1 s
  const peak = Math.max(...Array.from({ length: 24000 }, (_, i) => Math.abs(pcm.readInt16LE(i * 2))));
  assert.ok(peak > 11000 && peak < 13000);
  assert.throws(() => wavToPcm24(Buffer.from('no es un wav')), /no válido/);
  assert.throws(() => wavToPcm24(wav(22050, [])), /no produjo/);
});

test('cleanText quita emojis, marcas y caracteres de control', () => {
  assert.equal(cleanText('Hola 😊 **mundo**\n\n`código` # fin\u0007'), 'Hola mundo código fin');
  assert.equal(cleanText(null), '');
  assert.equal(cleanText('a'.repeat(5000)).length, 1500);
});

// Piper falso: por cada línea JSON escribe un wav y avisa su ruta, como el real.
function fakeSpawn(log) {
  return (exe, args) => {
    const p = new EventEmitter();
    p.stdin = new PassThrough(); p.stdout = new PassThrough(); p.stderr = new PassThrough();
    p.killed = false;
    p.kill = () => { p.killed = true; setImmediate(() => p.emit('exit', 0)); };
    log.push({ exe, args });
    let buf = '';
    p.stdin.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
        log.push({ text: msg.text });
        fs.writeFileSync(msg.output_file, wav(22050, Array.from({ length: 2205 }, (_, k) => (k % 50) * 100)));
        p.stdout.write(`${msg.output_file}\n`);
      }
    });
    return p;
  };
}
const readyVoices = () => {
  const dir = tmp();
  const bundled = tmp();
  fs.mkdirSync(path.join(bundled, 'engine', 'piper'), { recursive: true });
  fs.writeFileSync(path.join(bundled, 'engine', 'piper', 'piper'), 'x');
  for (const v of VOICES.filter((x) => x.engine === 'piper')) { fs.writeFileSync(path.join(bundled, `${v.file}.onnx`), 'm'); fs.writeFileSync(path.join(bundled, `${v.file}.onnx.json`), '{}'); }
  fs.mkdirSync(path.join(bundled, 'kokoro'), { recursive: true });
  for (const f of KOKORO.files) fs.writeFileSync(path.join(bundled, 'kokoro', f.name), 'x');
  return createVoices({ dir, bundledDir: bundled, platform: 'linux' });
};

test('createPiper habla frase por frase, cambia de voz sin errores y no deja archivos', async () => {
  const log = [];
  const voices = readyVoices();
  const tmpDir = tmp();
  const piper = createPiper({ voices, tmpDir, spawnImpl: fakeSpawn(log), idleMs: 60000 });
  const [a, b] = await Promise.all([piper.speak('daniela', 'Primera 😊'), piper.speak('daniela', 'Segunda')]);
  assert.equal(Buffer.from(a, 'base64').length / 2, 2400); // 0,1 s a 24 kHz
  assert.ok(b);
  assert.deepEqual(log.filter((l) => l.text).map((l) => l.text), ['Primera', 'Segunda']);
  assert.equal(log.filter((l) => l.exe).length, 1); // un solo proceso para la misma voz
  const c = await piper.speak('ald', 'Otra voz'); // cambia de voz: el proceso anterior se cierra sin afectar a este pedido
  assert.ok(c);
  assert.equal(log.filter((l) => l.exe).length, 2);
  assert.ok(log.find((l) => l.args && l.args.some((x) => x.includes('ald'))));
  assert.deepEqual(fs.readdirSync(tmpDir), []);
  await assert.rejects(piper.speak('ald', '   '), /vacío/);
  piper.stop();
});

test('createPiper: un precalentado de otra voz no interrumpe a la que está hablando', async () => {
  const piper = createPiper({ voices: readyVoices(), tmpDir: tmp(), spawnImpl: fakeSpawn([]), idleMs: 60000 });
  const talking = piper.speak('ald', 'frase en curso');
  piper.prewarm('daniela'); // llega mientras 'ald' habla
  assert.ok(await talking);
  piper.stop();
});

test('createPiper avisa si la voz no está instalada o tarda demasiado', async () => {
  const voices = createVoices({ dir: tmp(), platform: 'linux' });
  const piper = createPiper({ voices, tmpDir: tmp(), spawnImpl: fakeSpawn([]) });
  await assert.rejects(piper.speak('daniela', 'hola'), /no está instalada/);
  const silent = () => { const p = new EventEmitter(); p.stdin = new PassThrough(); p.stdout = new PassThrough(); p.stderr = new PassThrough(); p.kill = () => setImmediate(() => p.emit('exit', 0)); return p; };
  const slow = createPiper({ voices: readyVoices(), tmpDir: tmp(), spawnImpl: silent, timeoutMs: 80 });
  await assert.rejects(slow.speak('daniela', 'hola'), /tardó demasiado/);
  slow.stop();
});

test('la voz propia manda cuando está lista y la elección es automática; Gemini o Windows solo si se eligen', () => {
  const base = { brainProvider: 'gemini', apiKey: 'k', speech: 'auto' };
  assert.equal(routing(base, { localReady: true }).speech, 'local');
  assert.equal(routing(base, { localReady: false }).speech, 'gemini');
  assert.equal(routing({ ...base, speech: 'gemini' }, { localReady: true }).speech, 'gemini');
  assert.equal(routing({ ...base, brainProvider: 'claude' }, { localReady: true }).speech, 'local');
  assert.equal(routing({ ...base, speech: 'local' }).speech, 'local');
  assert.equal(routing({ brainProvider: 'openai', speech: 'auto' }, { localReady: false }).speech, 'system');
});

test('voiceParams: más rápida acorta el largo de frase, el tono lo compensa, y todo queda acotado', () => {
  const { voiceParams } = require('../src/piper');
  const normal = voiceParams({});
  assert.equal(normal.length, 1);
  assert.equal(normal.factor, 1);
  assert.ok(voiceParams({ speed: 1.3 }).length < 1);
  assert.ok(voiceParams({ speed: 0.8 }).length > 1);
  const agudo = voiceParams({ pitch: 3 });
  assert.ok(agudo.factor > 1.18 && agudo.factor < 1.2); // +3 semitonos
  assert.ok(agudo.length > 1); // se genera más largo y luego se acorta al subir el tono
  assert.ok(voiceParams({ pitch: -3 }).factor < 1);
  const extremo = voiceParams({ speed: 99, pitch: 99 });
  assert.ok(extremo.length >= 0.3 && extremo.length <= 2.5 && extremo.factor <= 2 ** (8 / 12) + 1e-9);
  assert.deepEqual(voiceParams({ speed: 'x', pitch: 'y' }), normal); // valores raros → normal
});

test('wavToPcm24 recorta el silencio de los extremos y sube/baja el tono según el factor', () => {
  const tone = Array.from({ length: 4410 }, (_, i) => Math.round(Math.sin((2 * Math.PI * 440 * i) / 22050) * 12000));
  const padded = wav(22050, [...new Array(11025).fill(0), ...tone, ...new Array(11025).fill(0)]); // 0,5 s de silencio a cada lado
  const pcm = wavToPcm24(padded);
  const seconds = pcm.length / 2 / 24000;
  assert.ok(seconds > 0.2 && seconds < 0.45, `quedó en ${seconds} s`); // 0,2 s de tono + márgenes cortos
  const plain = wavToPcm24(wav(22050, tone));
  const higher = wavToPcm24(wav(22050, tone), 1.2);
  assert.ok(higher.length < plain.length); // más agudo = se lee más rápido = más corto
  assert.ok(Math.abs(higher.length / plain.length - 1 / 1.2) < 0.02);
});

test('createPiper abre el proceso con la velocidad pedida y lo reabre si cambia', async () => {
  const log = [];
  const piper = createPiper({ voices: readyVoices(), tmpDir: tmp(), spawnImpl: fakeSpawn(log), idleMs: 60000 });
  await piper.speak('daniela', 'uno', { speed: 1 });
  await piper.speak('daniela', 'dos', { speed: 1 }); // mismo ajuste: no reabre
  await piper.speak('daniela', 'tres', { speed: 1.4 }); // ajuste distinto: reabre con otro largo
  const opens = log.filter((l) => l.exe);
  assert.equal(opens.length, 2);
  const ls = (o) => Number(o.args[o.args.indexOf('--length_scale') + 1]);
  assert.ok(ls(opens[1]) < ls(opens[0]));
  piper.stop();
});

test('los ajustes de velocidad y tono se validan y se acotan', () => {
  const S = require('../src/secure');
  assert.deepEqual(S.validateSettingsPatch({ voiceSpeed: 112, voicePitch: 2.6 }), { voiceSpeed: 110, voicePitch: 3 });
  assert.deepEqual(S.validateSettingsPatch({ voiceSpeed: 999, voicePitch: -99 }), { voiceSpeed: 160, voicePitch: -6 });
  assert.deepEqual(S.validateSettingsPatch({ voiceSpeed: 'x', voicePitch: 'y' }), { voiceSpeed: 100, voicePitch: 0 });
});

test('Kokoro: ruta de archivos, velocidad/tono y salida a 24 kHz con un motor falso', async () => {
  const bundled = tmp();
  fs.mkdirSync(path.join(bundled, 'engine', 'piper', 'espeak-ng-data'), { recursive: true });
  fs.writeFileSync(path.join(bundled, 'engine', 'piper', 'piper'), 'x');
  fs.mkdirSync(path.join(bundled, 'kokoro'), { recursive: true });
  for (const f of KOKORO.files) fs.writeFileSync(path.join(bundled, 'kokoro', f.name), 'x');
  const voices = createVoices({ dir: tmp(), bundledDir: bundled, platform: 'linux' });
  assert.equal(voices.ready('dora'), true);
  const p = voices.paths('dora');
  assert.equal(p.engine, 'kokoro');
  assert.equal(p.sid, 28);
  assert.equal(p.lang, 'es-419');
  assert.ok(p.dataDir.endsWith('espeak-ng-data') && p.model.endsWith('model.int8.onnx'));
  const calls = [];
  const loads = [];
  const sherpa = { OfflineTts: class { constructor(cfg) { loads.push(cfg); } async generateAsync(a) { calls.push(a); const tone = new Float32Array(24000).map((_, i) => Math.sin((2 * Math.PI * 300 * i) / 24000) * 0.5); return { samples: tone, sampleRate: 24000 }; } } };
  const k = createKokoro({ voices, loadSherpa: () => sherpa, idleMs: 60000 });
  const a = await k.speak('dora', 'Hola 😊 mundo');
  assert.equal(Buffer.from(a, 'base64').length / 2 > 20000, true);
  await k.speak('alex', 'otra');
  assert.equal(loads.length, 1); // el modelo se carga una sola vez para las dos voces
  assert.equal(calls[0].enableExternalBuffer, false); // Electron no admite buffers externos
  assert.equal(calls[0].sid, 28);
  assert.equal(calls[1].sid, 29);
  assert.equal(calls[0].text, 'Hola mundo');
  await k.speak('dora', 'rápida', { speed: 1.5 });
  assert.ok(calls[2].speed > 1.5 && calls[2].speed < 2.2); // más rápido que lo pedido al motor (compensa las pausas fijas)
  const agudo = await k.speak('dora', 'aguda', { pitch: 3 });
  assert.ok(calls[3].speed < 1); // el tono se compensa con la velocidad del motor
  assert.ok(Buffer.from(agudo, 'base64').length < Buffer.from(a, 'base64').length); // más agudo = se lee más rápido
  await assert.rejects(k.speak('dora', '   '), /vacío/);
  await assert.rejects(createKokoro({ voices: createVoices({ dir: tmp(), platform: 'linux' }), loadSherpa: () => sherpa }).speak('dora', 'hola'), /no está instalada/);
  await assert.rejects(createKokoro({ voices, loadSherpa: () => { throw new Error('sin módulo'); } }).speak('dora', 'hola'), /no está disponible/);
  k.stop();
});

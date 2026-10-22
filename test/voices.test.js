const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { createVoices, download, VOICES, ENGINE } = require('../src/voices');
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

test('hay 4 voces: 2 femeninas y 2 masculinas, con huellas completas', () => {
  assert.equal(VOICES.length, 4);
  assert.equal(VOICES.filter((v) => v.gender === 'f').length, 2);
  assert.equal(VOICES.filter((v) => v.gender === 'm').length, 2);
  for (const v of VOICES) { assert.match(v.sha256.onnx, /^[0-9a-f]{64}$/); assert.match(v.sha256.json, /^[0-9a-f]{64}$/); }
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
  assert.equal(voices.ready(v.id), true);
  assert.ok(voices.paths(v.id).model.startsWith(bundled));
  await voices.install(v.id); // ya está: no baja nada
  assert.throws(() => voices.paths('nope'), /desconocida/);
});

test('install baja motor y voz, verifica y deja todo listo (y rechaza un motor alterado)', async () => {
  const dir = tmp();
  const v = VOICES[2];
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
  for (const v of VOICES) { fs.writeFileSync(path.join(bundled, `${v.file}.onnx`), 'm'); fs.writeFileSync(path.join(bundled, `${v.file}.onnx.json`), '{}'); }
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
  await assert.rejects(piper.speak('dave', '   '), /vacío/);
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

// Voces propias de Yurei: motor Piper (corre en la PC, sin internet) y 4 voces en español. Todo se descarga desde la app a
// la carpeta de datos del usuario y se verifica con SHA-256 fijo en este archivo: si la huella no coincide, se descarta.
// Las direcciones son fijas (no hay nada que el usuario o la IA pueda cambiar). Piper es MIT; las voces vienen del
// repositorio rhasspy/piper-voices (licencia MIT en el repositorio, ver README para los créditos).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REVISION = '5041a7a49ae5b3a0f30e6837769eb03fdbb231bd'; // versión exacta del repositorio de voces
const HF = `https://huggingface.co/rhasspy/piper-voices/resolve/${REVISION}`;

const ENGINE = {
  url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
  sha256: 'f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea',
  size: 22477236
};

// Dos motores: Piper (una voz por modelo, liviano y rápido) y Kokoro (un modelo compartido por todas sus voces, más natural
// pero más pesado y lento). Kokoro corre con sherpa-onnx y usa los datos de pronunciación (espeak-ng) que ya trae Piper.
const KOKORO_REVISION = '2a360693d79b88b49b88e29aec2b53577f41f206';
const KOKORO = {
  base: `https://huggingface.co/csukuangfj/kokoro-int8-multi-lang-v1_0/resolve/${KOKORO_REVISION}`,
  lang: 'es-419', // español latinoamericano (seseo)
  files: [
    { name: 'model.int8.onnx', size: 114203756, sha256: '4b86207ef680e394d8343bee22dfc4c512e5c707c6d9578e3f35ab09bffd6b36' },
    { name: 'voices.bin', size: 28200960, sha256: '1c5a5b983d3d50d8586d437a51f3faa2da7919ce76a013c081e65671a3447c29' },
    { name: 'tokens.txt', size: 687, sha256: '6ebb6bb288f20f3ae8d004d3c2ca27697da27c037d75e81a60e2a6a663f95425' }
  ]
};
const KOKORO_BYTES = KOKORO.files.reduce((a, f) => a + f.size, 0);

const VOICES = [
  { id: 'daniela', engine: 'piper', name: 'Daniela', gender: 'f', accent: 'Argentina', quality: 'alta', dir: 'es/es_AR/daniela/high', file: 'es_AR-daniela-high', size: 114199011,
    sha256: { onnx: '7ceb1fc0dab349418c5b54a639ae9ee595212d7c9ea422220d8419163d5cc985', json: 'aedbf69647e1d754c62ecf8e0366ca5f16af3e768e3c6b5329af6eb6bde3852b' } },
  { id: 'ald', engine: 'piper', name: 'Ald', gender: 'm', accent: 'México', quality: 'media', dir: 'es/es_MX/ald/medium', file: 'es_MX-ald-medium', size: 63201294,
    sha256: { onnx: '019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63', json: '5a71498158e04afc8099bfd019c7e87c68eb9d042505a2b1a87e5c1ac2b1a61d' } },
  { id: 'dora', engine: 'kokoro', name: 'Dora', gender: 'f', accent: 'Español neutro', quality: 'natural', sid: 28, size: KOKORO_BYTES },
  { id: 'alex', engine: 'kokoro', name: 'Alex', gender: 'm', accent: 'Español neutro', quality: 'natural', sid: 29, size: KOKORO_BYTES }
];
const VOICE_IDS = VOICES.map((v) => v.id);
const byId = (id) => VOICES.find((v) => v.id === id) || null;
const voiceUrl = (v, ext) => `${HF}/${v.dir}/${v.file}.${ext}`;

// Descarga a un archivo temporal, comprueba tamaño y huella, y solo entonces lo deja con su nombre final.
async function download({ url, dest, sha256, fetchImpl = fetch, fsImpl = fs, onBytes = () => {}, timeoutMs = 15 * 60 * 1000 }) {
  const part = `${dest}.part`;
  fsImpl.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!res.ok) throw new Error(`La descarga falló (${res.status})`);
  const hash = crypto.createHash('sha256');
  const out = fsImpl.createWriteStream(part);
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      onBytes(value.length);
      if (!out.write(value)) await new Promise((ok) => out.once('drain', ok));
    }
    await new Promise((ok, bad) => { out.once('error', bad); out.end(ok); });
  } catch (e) {
    out.destroy();
    try { fsImpl.rmSync(part, { force: true }); } catch { /* ya no está */ }
    throw e;
  }
  if (hash.digest('hex') !== sha256) {
    fsImpl.rmSync(part, { force: true });
    throw new Error('El archivo descargado no es el original (la huella no coincide): se descartó');
  }
  fsImpl.renameSync(part, dest);
}

function powershellExtract(zip, dest) {
  const { spawn } = require('child_process');
  return new Promise((ok, bad) => {
    // Las rutas viajan por variables de entorno (no dentro del texto del comando): así ningún carácter raro de la ruta puede romper ni colar nada.
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:YUREI_ZIP -DestinationPath $env:YUREI_DEST -Force'],
      { windowsHide: true, stdio: 'ignore', env: { ...process.env, YUREI_ZIP: zip, YUREI_DEST: dest } });
    p.on('error', bad);
    p.on('exit', (c) => (c === 0 ? ok() : bad(new Error('No se pudo descomprimir el motor de voz'))));
  });
}

// bundledDir: carpeta con el motor y las voces que van dentro del instalador (resources/voices). Si está, no hay que descargar
// nada; dir es la carpeta del usuario, donde se baja lo que falte (versiones sin voces incluidas, p. ej. en desarrollo).
function createVoices({ dir, bundledDir = null, fetchImpl = fetch, fsImpl = fs, extract = powershellExtract, platform = process.platform }) {
  const exeName = platform === 'win32' ? 'piper.exe' : 'piper';
  const userRoot = path.join(dir, 'engine', 'piper');
  const bundledRoot = bundledDir ? path.join(bundledDir, 'engine', 'piper') : null;
  const filesIn = (base, v) => ({ model: path.join(base, `${v.file}.onnx`), config: path.join(base, `${v.file}.onnx.json`) });
  const files = (v) => filesIn(dir, v);
  const exists = (p) => { try { return fsImpl.statSync(p).isFile(); } catch { return false; } };
  const hasBundledEngine = () => !!bundledRoot && exists(path.join(bundledRoot, exeName));
  const engineRoot = () => (hasBundledEngine() ? bundledRoot : userRoot);
  const exe = path.join(userRoot, exeName); // dónde queda el motor si se descarga
  const bundledVoice = (v) => !!bundledDir && exists(filesIn(bundledDir, v).model) && exists(filesIn(bundledDir, v).config);
  // Kokoro: un solo juego de archivos para todas sus voces (carpeta kokoro/ dentro del instalador o de los datos del usuario).
  const kokoroIn = (base) => KOKORO.files.map((f) => path.join(base, 'kokoro', f.name));
  const kokoroBundled = () => !!bundledDir && kokoroIn(bundledDir).every(exists);
  const kokoroUser = () => kokoroIn(dir).every(exists);
  const kokoroBase = () => (kokoroBundled() ? bundledDir : dir);
  let busy = null;

  const isBundled = (v) => (v.engine === 'kokoro' ? kokoroBundled() : bundledVoice(v));

  const api = {
    dir,
    get exe() { return path.join(engineRoot(), exeName); },
    get engineRoot() { return engineRoot(); },
    list: () => VOICES,
    get: byId,
    engineReady: () => hasBundledEngine() || exists(exe), // el motor de Piper también aporta los datos de pronunciación de Kokoro
    installed(id) {
      const v = byId(id);
      if (!v) return false;
      if (v.engine === 'kokoro') return kokoroBundled() || kokoroUser();
      return bundledVoice(v) || (exists(files(v).model) && exists(files(v).config));
    },
    ready(id) { return api.engineReady() && api.installed(id); },
    paths(id) {
      const v = byId(id);
      if (!v) throw new Error('Voz desconocida');
      if (v.engine === 'kokoro') {
        const b = path.join(kokoroBase(), 'kokoro');
        return { engine: 'kokoro', model: path.join(b, 'model.int8.onnx'), voices: path.join(b, 'voices.bin'), tokens: path.join(b, 'tokens.txt'), dataDir: path.join(engineRoot(), 'espeak-ng-data'), sid: v.sid, lang: KOKORO.lang };
      }
      return { engine: 'piper', exe: path.join(engineRoot(), exeName), engineRoot: engineRoot(), ...(bundledVoice(v) ? filesIn(bundledDir, v) : files(v)) };
    },
    status() {
      return {
        supported: platform === 'win32', bundled: hasBundledEngine(), engine: api.engineReady(), busy,
        voices: VOICES.map((v) => ({ id: v.id, engine: v.engine, name: v.name, gender: v.gender, accent: v.accent, quality: v.quality, mb: Math.round(v.size / 1048576), installed: api.installed(v.id), bundled: isBundled(v) }))
      };
    },

    // Baja el motor (si falta) y la voz. onProgress recibe { phase, fraction } con fraction de 0 a 1.
    async install(id, onProgress = () => {}) {
      const v = byId(id);
      if (!v) throw new Error('Voz desconocida');
      if (platform !== 'win32') throw new Error('Las voces de Yurei se instalan solo en Windows');
      if (api.ready(id)) return;
      if (busy) throw new Error('Ya se está descargando una voz: espera a que termine');
      busy = id;
      try {
        const needEngine = !api.engineReady();
        const needVoice = !api.installed(id);
        const total = (needEngine ? ENGINE.size : 0) + (needVoice ? v.size : 0);
        let done = 0;
        const tick = (phase) => (n) => { done += n; onProgress({ phase, fraction: Math.min(1, done / total) }); };
        if (needEngine) {
          // (solo si el instalador no trajo el motor)
          onProgress({ phase: 'motor', fraction: 0 });
          const zip = path.join(dir, 'engine.zip');
          await download({ url: ENGINE.url, dest: zip, sha256: ENGINE.sha256, fetchImpl, fsImpl, onBytes: tick('motor') });
          fsImpl.rmSync(path.join(dir, 'engine'), { recursive: true, force: true });
          await extract(zip, path.join(dir, 'engine'));
          fsImpl.rmSync(zip, { force: true });
          if (!api.engineReady()) throw new Error('El motor de voz no quedó completo');
        }
        if (needVoice && v.engine === 'kokoro') {
          for (const f of KOKORO.files) await download({ url: `${KOKORO.base}/${f.name}`, dest: path.join(dir, 'kokoro', f.name), sha256: f.sha256, fetchImpl, fsImpl, onBytes: tick('voz') });
        } else if (needVoice) {
          const f = files(v);
          await download({ url: voiceUrl(v, 'onnx'), dest: f.model, sha256: v.sha256.onnx, fetchImpl, fsImpl, onBytes: tick('voz') });
          await download({ url: voiceUrl(v, 'onnx.json'), dest: f.config, sha256: v.sha256.json, fetchImpl, fsImpl, onBytes: () => {} });
        }
        onProgress({ phase: 'listo', fraction: 1 });
      } finally { busy = null; }
    },

    remove(id) {
      const v = byId(id);
      if (!v) throw new Error('Voz desconocida');
      if (v.engine === 'kokoro') { for (const p of kokoroIn(dir)) fsImpl.rmSync(p, { force: true }); return; } // las voces de Kokoro comparten archivos
      for (const p of Object.values(files(v))) fsImpl.rmSync(p, { force: true });
    }
  };
  return api;
}

module.exports = { VOICES, VOICE_IDS, ENGINE, KOKORO, REVISION, createVoices, download, voiceUrl, powershellExtract };

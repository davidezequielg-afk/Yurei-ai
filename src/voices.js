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

const VOICES = [
  { id: 'daniela', name: 'Daniela', gender: 'f', accent: 'Argentina', quality: 'alta', dir: 'es/es_AR/daniela/high', file: 'es_AR-daniela-high', size: 114199011,
    sha256: { onnx: '7ceb1fc0dab349418c5b54a639ae9ee595212d7c9ea422220d8419163d5cc985', json: 'aedbf69647e1d754c62ecf8e0366ca5f16af3e768e3c6b5329af6eb6bde3852b' } },
  { id: 'claude', name: 'Claude', gender: 'f', accent: 'México', quality: 'alta', dir: 'es/es_MX/claude/high', file: 'es_MX-claude-high', size: 63122309,
    sha256: { onnx: '3ef40a71ea63852cd8ab7e6fa7d2ecdcfa67a0b47c9c48e3f10e02ee02083ea0', json: '1afc81f703c0e4cb3b4d7c0dca096b8b54a98806807f0170cf5eb5557723c12d' } },
  { id: 'ald', name: 'Ald', gender: 'm', accent: 'México', quality: 'media', dir: 'es/es_MX/ald/medium', file: 'es_MX-ald-medium', size: 63201294,
    sha256: { onnx: '019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63', json: '5a71498158e04afc8099bfd019c7e87c68eb9d042505a2b1a87e5c1ac2b1a61d' } },
  { id: 'dave', name: 'Dave', gender: 'm', accent: 'España', quality: 'media', dir: 'es/es_ES/davefx/medium', file: 'es_ES-davefx-medium', size: 63201294,
    sha256: { onnx: '6658b03b1a6c316ee4c265a9896abc1393353c2d9e1bca7d66c2c442e222a917', json: '0e0dda87c732f6f38771ff274a6380d9252f327dca77aa2963d5fbdf9ec54842' } }
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
  let busy = null;

  const api = {
    dir,
    get exe() { return path.join(engineRoot(), exeName); },
    get engineRoot() { return engineRoot(); },
    list: () => VOICES,
    get: byId,
    engineReady: () => hasBundledEngine() || exists(exe),
    installed(id) { const v = byId(id); return !!v && (bundledVoice(v) || (exists(files(v).model) && exists(files(v).config))); },
    ready(id) { return api.engineReady() && api.installed(id); },
    paths(id) { const v = byId(id); if (!v) throw new Error('Voz desconocida'); return { exe: path.join(engineRoot(), exeName), engineRoot: engineRoot(), ...(bundledVoice(v) ? filesIn(bundledDir, v) : files(v)) }; },
    status() { return { supported: platform === 'win32', bundled: hasBundledEngine(), engine: api.engineReady(), busy: busy, voices: VOICES.map((v) => ({ id: v.id, name: v.name, gender: v.gender, accent: v.accent, quality: v.quality, mb: Math.round(v.size / 1048576), installed: api.installed(v.id), bundled: bundledVoice(v) })) }; },

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
        const total = (needEngine ? ENGINE.size : 0) + v.size;
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
        const f = files(v);
        await download({ url: voiceUrl(v, 'onnx'), dest: f.model, sha256: v.sha256.onnx, fetchImpl, fsImpl, onBytes: tick('voz') });
        await download({ url: voiceUrl(v, 'onnx.json'), dest: f.config, sha256: v.sha256.json, fetchImpl, fsImpl, onBytes: () => {} });
        onProgress({ phase: 'listo', fraction: 1 });
      } finally { busy = null; }
    },

    remove(id) {
      const v = byId(id);
      if (!v) throw new Error('Voz desconocida');
      for (const p of Object.values(files(v))) fsImpl.rmSync(p, { force: true });
    }
  };
  return api;
}

module.exports = { VOICES, VOICE_IDS, ENGINE, REVISION, createVoices, download, voiceUrl, powershellExtract };

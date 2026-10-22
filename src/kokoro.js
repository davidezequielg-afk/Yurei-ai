// Habla con Kokoro (voz local más natural, pero más pesada y lenta que Piper) usando sherpa-onnx. El modelo se carga una vez
// (unos 2 s y ~300 MB de memoria) y se libera tras unos minutos sin uso. Las voces comparten el mismo modelo.
// Entrada: texto; salida: PCM Int16 mono a 24 kHz en base64, igual que Piper, para usar el mismo reproductor.

const os = require('os');
const { floatToPcm24, pitchFactor, clampSpeed, cleanText } = require('./audio');

function createKokoro({ voices, loadSherpa = () => require('sherpa-onnx-node'), threads = Math.max(2, Math.min(4, Math.floor(os.cpus().length / 2))), idleMs = 5 * 60 * 1000 }) {
  let tts = null;
  let key = null;
  let idle = null;
  let chain = Promise.resolve();

  const drop = () => { clearTimeout(idle); tts = null; key = null; }; // se suelta la referencia: la memoria se libera sola

  function engine(p) {
    const k = `${p.model}|${p.voices}|${p.dataDir}|${p.lang}`;
    if (tts && key === k) return tts;
    let sherpa;
    try { sherpa = loadSherpa(); } catch (e) { throw new Error(`El motor Kokoro no está disponible en este equipo: ${e.message}`); }
    tts = new sherpa.OfflineTts({
      model: { kokoro: { model: p.model, voices: p.voices, tokens: p.tokens, dataDir: p.dataDir, lang: p.lang }, numThreads: threads, provider: 'cpu', debug: false },
      maxNumSentences: 1
    });
    key = k;
    return tts;
  }

  async function run(id, raw, opts) {
    const text = cleanText(raw);
    if (!text) throw new Error('Texto vacío');
    if (!voices.ready(id)) throw new Error('La voz no está instalada');
    const p = voices.paths(id);
    const speed = clampSpeed(opts.speed);
    const factor = pitchFactor(opts.pitch);
    // El tono se logra leyendo el audio más rápido o más lento (cambia la duración): se compensa con la velocidad de la voz.
    // La duración responde a la velocidad del motor más o menos como velocidad^0.85 (hay pausas fijas), medido: se corrige con
    // el exponente inverso para que 1,3× suene de verdad 1,3× más rápido.
    const gen = Math.max(0.4, Math.min(3, (speed / factor) ** (1 / 0.85)));
    clearTimeout(idle);
    const r = await engine(p).generateAsync({ text, sid: p.sid, speed: gen, enableExternalBuffer: false }) // Electron no admite buffers externos;
    idle = setTimeout(drop, idleMs);
    return floatToPcm24(Float32Array.from(r.samples), r.sampleRate, factor).toString('base64');
  }

  return {
    speak(id, text, opts = {}) {
      const job = chain.then(() => run(id, text, opts));
      chain = job.catch(() => {});
      return job;
    },
    // Carga el modelo en segundo plano para que la primera respuesta no espere.
    prewarm(id) { if (voices.ready(id)) { try { engine(voices.paths(id)); } catch { /* se reintenta al hablar */ } } },
    stop: drop
  };
}

module.exports = { createKokoro };

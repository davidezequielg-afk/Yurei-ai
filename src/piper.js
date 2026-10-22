// Habla con Piper (voz local). Un proceso queda abierto con la voz cargada y recibe una frase por línea (JSON); Piper escribe un
// .wav por frase y avisa su ruta. Aquí se lee, se pasa a 24 kHz (lo que espera el reproductor del notch) y se devuelve en base64.
// Sin shell: el texto viaja solo por la entrada estándar del proceso, nunca en la línea de comandos.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT_RATE = 24000;
const SILENCE = 0.012; // por debajo de esto (≈ -38 dB) se considera silencio
const MAX_TEXT = 1500;

// "wav" → muestras Int16 mono a 24 kHz (interpolación lineal). pitch > 1 sube el tono (y acorta el audio: quien lo pide ya
// compensó el largo al generarlo, ver lengthFor); pitch < 1 lo baja.
function wavToPcm24(buf, pitch = 1) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Audio de voz no válido');
  let rate = 22050;
  let channels = 1;
  let data = null;
  for (let off = 12; off + 8 <= buf.length;) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      if (buf.readUInt16LE(off + 22) !== 16) throw new Error('Formato de audio no soportado');
      channels = buf.readUInt16LE(off + 10);
      rate = buf.readUInt32LE(off + 12);
    } else if (id === 'data') { data = buf.subarray(off + 8, Math.min(buf.length, off + 8 + size)); break; }
    off += 8 + size + (size % 2);
  }
  if (!data || !data.length) throw new Error('La voz no produjo audio');
  const total = Math.floor(data.length / (2 * channels));
  const all = new Float32Array(total);
  for (let i = 0; i < total; i++) all[i] = data.readInt16LE(i * 2 * channels) / 32768; // si hubiera más canales, se toma el primero
  // Piper deja silencio al principio y al final: se recorta (con un margen corto) para que la voz arranque enseguida y la velocidad se note.
  let first = 0;
  let last = total - 1;
  while (first < total && Math.abs(all[first]) < SILENCE) first++;
  while (last > first && Math.abs(all[last]) < SILENCE) last--;
  const from = first >= total ? 0 : Math.max(0, first - Math.round(rate * 0.04));
  const to = first >= total ? total : Math.min(total, last + 1 + Math.round(rate * 0.1));
  const src = all.subarray(from, to);
  const n = src.length;
  const srcRate = rate * pitch; // leer más rápido = más agudo
  const outLen = Math.max(1, Math.round((n * OUT_RATE) / srcRate));
  const out = Buffer.alloc(outLen * 2);
  for (let i = 0; i < outLen; i++) {
    const t = (i * srcRate) / OUT_RATE;
    const k = Math.min(n - 1, Math.floor(t));
    const a = src[k];
    const b = src[Math.min(n - 1, k + 1)];
    const v = a + (b - a) * (t - k);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  return out;
}

// Velocidad (1 = normal, 1.25 = un 25 % más rápida) y tono (semitonos, positivo = más agudo) → cómo se le pide a Piper.
// El tono se logra leyendo el audio más rápido o más lento, lo que también cambia la duración: se compensa alargando o acortando
// la frase al generarla (length_scale), así velocidad y tono se ajustan por separado.
function voiceParams({ speed = 1, pitch = 0 } = {}) {
  const sp = Math.max(0.5, Math.min(2, Number(speed) || 1));
  const st = Math.max(-8, Math.min(8, Number(pitch) || 0));
  const factor = 2 ** (st / 12);
  // La duración de Piper no crece en proporción exacta con length_scale (hay partes fijas): medido, responde más o menos a
  // length^0.7, así que se corrige con el exponente inverso para que 1,3× suene de verdad 1,3× más rápido.
  const length = Math.max(0.3, Math.min(2.5, ((1 / sp) * factor) ** (1 / 0.7)));
  return { length: Math.round(length * 1000) / 1000, factor };
}

// Quita lo que Piper leería mal: emojis, marcas de formato y caracteres de control.
function cleanText(text) {
  return String(text ?? '')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[\u0000-\u001f\u007f*_`#~<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

function createPiper({ voices, tmpDir, spawnImpl = spawn, fsImpl = fs, timeoutMs = 30000, idleMs = 5 * 60 * 1000 }) {
  let proc = null;
  let procVoice = null; // identifica el proceso abierto: voz + largo de frase (cambia con la velocidad)
  let lines = [];       // rutas que Piper ya avisó
  let waiter = null;    // quien espera la próxima ruta
  let tail = '';
  let errTail = '';
  let seq = 0;
  let chain = Promise.resolve();
  let idle = null;

  const fail = (err) => { if (waiter) { const w = waiter; waiter = null; w.reject(err); } };

  function stop() {
    clearTimeout(idle);
    if (proc) { const p = proc; proc = null; procVoice = null; try { p.kill(); } catch { /* ya terminó */ } }
    lines = []; tail = '';
    fail(new Error('La voz se detuvo'));
  }

  function start(id, length, key) {
    stop();
    const { exe, engineRoot, model, config } = voices.paths(id);
    fsImpl.mkdirSync(tmpDir, { recursive: true });
    for (const f of fsImpl.readdirSync(tmpDir)) { try { fsImpl.rmSync(path.join(tmpDir, f), { force: true }); } catch { /* en uso */ } }
    const p = spawnImpl(exe, ['--model', model, '--config', config, '--json-input', '--espeak_data', path.join(engineRoot, 'espeak-ng-data'), '--length_scale', String(length), '--sentence_silence', '0.1'], { cwd: engineRoot, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    proc = p;
    procVoice = key;
    errTail = '';
    p.stdout.on('data', (d) => {
      tail += d.toString('utf8');
      let i;
      while ((i = tail.indexOf('\n')) >= 0) {
        const line = tail.slice(0, i).replace(/\r$/, '');
        tail = tail.slice(i + 1);
        if (!line) continue;
        if (waiter) { const w = waiter; waiter = null; w.resolve(line); } else lines.push(line);
      }
    });
    p.stderr.on('data', (d) => { errTail = (errTail + d.toString('utf8')).slice(-600); });
    // Solo cuenta si es el proceso actual: el de una voz anterior, ya reemplazado, puede cerrarse sin afectar a la que habla ahora.
    p.on('error', (e) => { if (proc !== p) return; proc = null; procVoice = null; fail(new Error(`No se pudo iniciar la voz: ${e.message}`)); });
    p.on('exit', () => { if (proc !== p) return; proc = null; procVoice = null; fail(new Error(`La voz se cerró inesperadamente${errTail ? `: ${errTail.trim().split('\n').pop()}` : ''}`)); });
  }

  const nextLine = () => new Promise((resolve, reject) => {
    if (lines.length) { resolve(lines.shift()); return; }
    waiter = { resolve, reject };
  });

  async function run(id, raw, opts) {
    const text = cleanText(raw);
    if (!text) throw new Error('Texto vacío');
    if (!voices.ready(id)) throw new Error('La voz no está instalada');
    const { length, factor } = voiceParams(opts);
    const key = `${id}|${length}`;
    if (!proc || procVoice !== key) start(id, length, key);
    clearTimeout(idle);
    const out = path.join(tmpDir, `${process.pid}-${++seq}.wav`);
    proc.stdin.write(`${JSON.stringify({ text, output_file: out })}\n`);
    let timer;
    const done = await Promise.race([
      nextLine(),
      new Promise((_, bad) => { timer = setTimeout(() => { bad(new Error('La voz tardó demasiado')); stop(); }, timeoutMs); })
    ]).finally(() => clearTimeout(timer));
    void done;
    try {
      return wavToPcm24(fsImpl.readFileSync(out), factor).toString('base64');
    } finally {
      try { fsImpl.rmSync(out, { force: true }); } catch { /* ya no está */ }
      idle = setTimeout(stop, idleMs); // libera la memoria si no se usa
    }
  }

  return {
    // Una frase a la vez: las siguientes esperan su turno.
    speak(id, text, opts = {}) {
      const job = chain.then(() => run(id, text, opts));
      chain = job.catch(() => {});
      return job;
    },
    prewarm(id, opts = {}) { const { length } = voiceParams(opts); const key = `${id}|${length}`; if (voices.ready(id) && (!proc || procVoice !== key)) { try { start(id, length, key); } catch { /* se reintenta al hablar */ } } },
    stop
  };
}

module.exports = { createPiper, wavToPcm24, cleanText, voiceParams, OUT_RATE };

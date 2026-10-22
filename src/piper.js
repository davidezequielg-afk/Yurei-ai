// Habla con Piper (voz local). Un proceso queda abierto con la voz cargada y recibe una frase por línea (JSON); Piper escribe un
// .wav por frase y avisa su ruta. Aquí se lee, se pasa a 24 kHz (lo que espera el reproductor del notch) y se devuelve en base64.
// Sin shell: el texto viaja solo por la entrada estándar del proceso, nunca en la línea de comandos.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT_RATE = 24000;
const MAX_TEXT = 1500;

// "wav" → muestras Int16 mono a 24 kHz (interpolación lineal).
function wavToPcm24(buf) {
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
  const n = Math.floor(data.length / (2 * channels));
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) src[i] = data.readInt16LE(i * 2 * channels) / 32768; // si hubiera más canales, se toma el primero
  const outLen = Math.max(1, Math.round((n * OUT_RATE) / rate));
  const out = Buffer.alloc(outLen * 2);
  for (let i = 0; i < outLen; i++) {
    const t = (i * rate) / OUT_RATE;
    const k = Math.min(n - 1, Math.floor(t));
    const a = src[k];
    const b = src[Math.min(n - 1, k + 1)];
    const v = a + (b - a) * (t - k);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  return out;
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
  let procVoice = null;
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

  function start(id) {
    stop();
    const { exe, engineRoot, model, config } = voices.paths(id);
    fsImpl.mkdirSync(tmpDir, { recursive: true });
    for (const f of fsImpl.readdirSync(tmpDir)) { try { fsImpl.rmSync(path.join(tmpDir, f), { force: true }); } catch { /* en uso */ } }
    const p = spawnImpl(exe, ['--model', model, '--config', config, '--json-input', '--espeak_data', path.join(engineRoot, 'espeak-ng-data')], { cwd: engineRoot, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    proc = p;
    procVoice = id;
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

  async function run(id, raw) {
    const text = cleanText(raw);
    if (!text) throw new Error('Texto vacío');
    if (!voices.ready(id)) throw new Error('La voz no está instalada');
    if (!proc || procVoice !== id) start(id);
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
      return wavToPcm24(fsImpl.readFileSync(out)).toString('base64');
    } finally {
      try { fsImpl.rmSync(out, { force: true }); } catch { /* ya no está */ }
      idle = setTimeout(stop, idleMs); // libera la memoria si no se usa
    }
  }

  return {
    // Una frase a la vez: las siguientes esperan su turno.
    speak(id, text) {
      const job = chain.then(() => run(id, text));
      chain = job.catch(() => {});
      return job;
    },
    prewarm(id) { if (voices.ready(id) && (!proc || procVoice !== id)) { try { start(id); } catch { /* se reintenta al hablar */ } } },
    stop
  };
}

module.exports = { createPiper, wavToPcm24, cleanText, OUT_RATE };

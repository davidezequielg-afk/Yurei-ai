// Limpieza del audio de la voz de Gemini antes de reproducirlo.
// Hallazgo (medido en una grabación real): cada audio termina con ~140 ms de ruido de nivel constante,
// separado de la voz por ~200 ms de silencio. Además empieza con 0,25-0,45 s de silencio.
// Aquí se recorta el silencio inicial y final y se descarta ese ruido final, sin tocar la voz.

const PCM_FRAME_MS = 10;

// FFT en sitio (radix-2). re/im: Float64Array de largo potencia de 2.
function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// Mide un trozo de audio: nivel (dBFS), planitud espectral (0 tono … 1 ruido blanco), parte de energía bajo 1 kHz.
function frameStats(x, start, len, rate) {
  let sum = 0;
  for (let i = 0; i < len; i++) sum += x[start + i] * x[start + i];
  const db = 10 * Math.log10(sum / len + 1e-12);
  const N = 256;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < Math.min(len, N); i++) re[i] = x[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (Math.min(len, N) - 1)));
  fftInPlace(re, im);
  let logSum = 0;
  let total = 0;
  let low = 0;
  const bins = N / 2;
  const lowBin = Math.ceil((1000 / rate) * N);
  for (let k = 1; k < bins; k++) {
    const p = re[k] * re[k] + im[k] * im[k] + 1e-18;
    logSum += Math.log(p);
    total += p;
    if (k < lowBin) low += p;
  }
  return { db, flat: Math.exp(logSum / (bins - 1)) / (total / (bins - 1)), low: low / total };
}

// ¿Hay un tono (voz sonora)? Autocorrelación normalizada entre 75 y 500 Hz.
function periodicity(x, start, len, rate) {
  const minLag = Math.floor(rate / 500);
  const maxLag = Math.min(Math.floor(rate / 75), len - 1);
  let e0 = 0;
  for (let i = 0; i < len; i++) e0 += x[start + i] * x[start + i];
  if (e0 < 1e-12) return 0;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i + lag < len; i++) c += x[start + i] * x[start + i + lag];
    best = Math.max(best, c / e0);
  }
  return best;
}

// Devuelve { samples, trimmedStartMs, trimmedEndMs, droppedNoiseMs }. No modifica la entrada.
function cleanTts(x, rate = 24000, opts = {}) {
  const hop = Math.round((rate * PCM_FRAME_MS) / 1000);
  const n = Math.floor(x.length / hop);
  const none = { samples: x, trimmedStartMs: 0, trimmedEndMs: 0, droppedNoiseMs: 0 };
  if (n < 4) return none;

  const st = [];
  let peak = -200;
  for (let i = 0; i < n; i++) {
    const s = frameStats(x, i * hop, hop, rate);
    st.push(s);
    if (s.db > peak) peak = s.db;
  }
  const thr = Math.max(-85, Math.min(-45, peak - 45)); // relativo a lo más fuerte: no depende del volumen
  const minGap = opts.minGapFrames ?? 10; // 100 ms de silencio separan bloques

  // Bloques de sonido: rachas de frames activos; huecos menores a 100 ms no los separan.
  const blocks = [];
  let cur = null;
  let quiet = 0;
  for (let i = 0; i < n; i++) {
    if (st[i].db > thr) {
      if (cur && quiet < minGap) cur.end = i + 1;
      else { cur = { start: i, end: i + 1 }; blocks.push(cur); }
      quiet = 0;
    } else if (cur) quiet++;
  }
  if (!blocks.length) return none;

  // Clics sueltos (≤ 20 ms) separados de la voz por silencio, al principio o al final: no cuentan como sonido.
  const isClick = (b, neighbor, before) => b.end - b.start <= 2 && (before ? neighbor.start - b.end : b.start - neighbor.end) >= minGap;
  while (blocks.length >= 2 && isClick(blocks[0], blocks[1], true)) blocks.shift();
  while (blocks.length >= 2 && isClick(blocks[blocks.length - 1], blocks[blocks.length - 2], false)) blocks.pop();

  // ¿El último bloque es ruido suelto? Corto, tras un silencio, y que no es voz ni una "s" de final de palabra.
  let droppedFrames = 0;
  if (blocks.length >= 2) {
    const last = blocks[blocks.length - 1];
    const prev = blocks[blocks.length - 2];
    const len = last.end - last.start;
    if (len <= 30 && last.start - prev.end >= minGap) {
      let noisy = 0;
      let voiced = 0;
      for (let i = last.start; i < last.end; i++) {
        if (st[i].flat >= 0.1 && st[i].low >= 0.25) noisy++; // ancho de banda completo y con graves: no es una "s" (sin graves) ni vocal (tono puro)
        const w = Math.min(hop * 2, x.length - i * hop);
        if (w > hop && periodicity(x, i * hop, w, rate) >= 0.5) voiced++;
      }
      if (noisy / len >= 0.6 || (voiced / len < 0.2 && len <= 25 && last.start - prev.end >= 15)) {
        droppedFrames = len;
        blocks.pop();
      }
    }
  }

  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  const startFrame = Math.max(0, first.start - 3); // 30 ms de aire antes de la voz
  const endFrame = Math.min(n, last.end + 5); // 50 ms de cola natural después
  const from = startFrame * hop;
  const to = endFrame * hop;
  const out = Float32Array.from(x.subarray(from, to));

  // Fundidos: 6 ms al entrar y 25 ms al salir (la cola natural se apaga sola; esto evita cualquier chasquido).
  const fin = Math.min(Math.round(rate * 0.006), out.length >> 1);
  const fout = Math.min(Math.round(rate * 0.025), out.length >> 1);
  for (let i = 0; i < fin; i++) out[i] *= i / fin;
  for (let i = 0; i < fout; i++) out[out.length - 1 - i] *= i / fout;

  return {
    samples: out,
    trimmedStartMs: Math.round((from / rate) * 1000),
    trimmedEndMs: Math.round(((x.length - to) / rate) * 1000),
    droppedNoiseMs: droppedFrames * PCM_FRAME_MS
  };
}

if (typeof module !== 'undefined') module.exports = { cleanTts, frameStats, periodicity };

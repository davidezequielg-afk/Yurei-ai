const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanTts, frameStats } = require('../renderer/pcm');

const RATE = 24000;
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 - 0.5; }; // ruido determinista
const secs = (s) => Math.round(s * RATE);
const silence = (s) => new Float32Array(secs(s));
const cat = (...parts) => { const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

// Voz sintética: armónicos de un tono (150 Hz) con sílabas (la amplitud sube y baja).
function voiced(s, f0 = 150, amp = 0.3) {
  const n = secs(s); const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE; const syl = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * t);
    let v = 0; for (let h = 1; h <= 12; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
    out[i] = amp * syl * v * 0.5;
  }
  return out;
}
// "s" de final de palabra: ruido de agudos, sin graves ni tono.
function fricative(s, amp = 0.1) {
  const n = secs(s); const out = new Float32Array(n); let p1 = 0, p2 = 0;
  for (let i = 0; i < n; i++) { const w = rnd(); const hp = w - p1; const hp2 = hp - p2; p1 = w; p2 = hp; out[i] = amp * hp2; }
  return out;
}
// Ruido del final de la voz de Gemini (medido): amplitud constante, mezcla de graves y banda ancha, empieza y acaba de golpe.
function burst(s, peak = 0.06) {
  const n = secs(s); const out = new Float32Array(n); const w = []; let acc = 0;
  for (let i = 0; i < n; i++) { const r = rnd(); w.push(r); acc += r; if (i >= 60) acc -= w[i - 60]; out[i] = 0.55 * (acc / 60) * 5 + 0.45 * r; }
  const m = out.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
  return out.map((v) => (v / m) * peak);
}
const rms = (x) => Math.sqrt(x.reduce((t, v) => t + v * v, 0) / x.length);
const lastLoud = (x, thrDb) => { const hop = 240; let last = -1; for (let i = 0; i + hop <= x.length; i += hop) if (frameStats(x, i, hop, RATE).db > thrDb) last = (i + hop) / RATE; return last; };

test('el ruido sintético imita las medidas reales (graves + banda ancha) y una "s" no', () => {
  const b = burst(0.14); const s = fricative(0.14); const v = voiced(0.14);
  const fb = frameStats(b, 480, 240, RATE); const fs = frameStats(s, 480, 240, RATE); const fv = frameStats(v, 480, 240, RATE);
  assert.ok(fb.flat >= 0.1 && fb.low >= 0.25, `ruido: planitud ${fb.flat.toFixed(3)} graves ${fb.low.toFixed(2)}`);
  assert.ok(fs.low < 0.25, `"s": graves ${fs.low.toFixed(2)}`);
  assert.ok(fv.flat < 0.05, `voz: planitud ${fv.flat.toFixed(3)}`);
});

test('se descarta el ruido final aislado y se conserva toda la voz', () => {
  const speech = voiced(1.5);
  const audio = cat(silence(0.35), speech, silence(0.22), burst(0.14));
  const r = cleanTts(audio, RATE);
  assert.ok(r.droppedNoiseMs >= 120 && r.droppedNoiseMs <= 150, `descartó ${r.droppedNoiseMs} ms`);
  assert.ok(r.trimmedStartMs >= 300 && r.trimmedStartMs <= 340, `quitó ${r.trimmedStartMs} ms del inicio`);
  assert.ok(r.samples.length / RATE < 1.5 + 0.12, `dura ${(r.samples.length / RATE).toFixed(2)} s`);
  assert.ok(lastLoud(r.samples, -50) <= 1.5 + 0.12, 'no queda sonido fuerte tras la voz');
  const kept = r.samples.slice(secs(0.05), secs(1.4)); const orig = speech.slice(secs(0.05 + (0.35 - r.trimmedStartMs / 1000 - 0)), secs(1.4 + 0.35 - r.trimmedStartMs / 1000));
  assert.ok(rms(kept) > 0.9 * rms(orig.length ? orig : kept), 'la voz queda intacta');
});

test('no se confunde la voz con ruido: una sílaba corta tras una pausa se conserva', () => {
  const audio = cat(voiced(1.2), silence(0.18), voiced(0.2, 180, 0.3)); // "…ahora. Sí."
  const r = cleanTts(audio, RATE);
  assert.equal(r.droppedNoiseMs, 0);
  assert.ok(r.samples.length / RATE > 1.55, `dura ${(r.samples.length / RATE).toFixed(2)} s (debe conservar la sílaba final)`);
});

test('una "s" pegada al final de la voz no se recorta', () => {
  const audio = cat(voiced(1.0), fricative(0.16), silence(0.3));
  const r = cleanTts(audio, RATE);
  assert.equal(r.droppedNoiseMs, 0);
  assert.ok(r.samples.length / RATE >= 1.1, `dura ${(r.samples.length / RATE).toFixed(2)} s`);
});

test('quita el silencio inicial (la respuesta empieza antes) y deja un poco de aire', () => {
  const r = cleanTts(cat(silence(0.45), voiced(0.8), silence(0.1)), RATE);
  assert.ok(r.trimmedStartMs >= 400 && r.trimmedStartMs <= 430, `${r.trimmedStartMs}`);
  const lead = lastLoud(r.samples.slice(0, secs(0.03)), -60);
  assert.equal(lead, -1, 'los 30 ms de aire siguen en silencio');
});

test('no depende del volumen: mismo resultado a 1/10 y a 3 veces el nivel', () => {
  const base = cat(silence(0.3), voiced(1.2), silence(0.25), burst(0.14));
  const dropped = [0.1, 1, 3].map((g) => cleanTts(base.map((v) => Math.max(-1, Math.min(1, v * g))), RATE).droppedNoiseMs);
  assert.ok(dropped.every((d) => d >= 120 && d <= 150), `descartes: ${dropped}`);
});

test('fundidos en los extremos, silencio total y entradas raras no rompen nada', () => {
  const r = cleanTts(cat(silence(0.2), voiced(1), silence(0.2)), RATE);
  assert.equal(r.samples[0], 0);
  assert.ok(Math.abs(r.samples[r.samples.length - 1]) < 1e-3);
  const quiet = silence(1);
  assert.equal(cleanTts(quiet, RATE).samples, quiet); // todo silencio: se devuelve igual
  assert.equal(cleanTts(new Float32Array(10), RATE).samples.length, 10); // demasiado corto
  assert.equal(cleanTts(burst(0.14), RATE).droppedNoiseMs, 0); // solo ruido, sin voz antes: no hay nada que comparar
  const input = cat(voiced(0.5), silence(0.2), burst(0.14)); const copy = Float32Array.from(input);
  cleanTts(input, RATE); assert.deepEqual(input, copy); // no modifica la entrada
});

test('un clic suelto antes o después de la voz no impide recortar el silencio', () => {
  const click = (a = 0.04) => { const c = new Float32Array(12); c[3] = a; c[4] = -a; return c; };
  const lead = cleanTts(cat(silence(0.05), click(), silence(0.27), voiced(0.8), silence(0.1)), RATE);
  assert.ok(lead.trimmedStartMs >= 280, `recortó ${lead.trimmedStartMs} ms del inicio (debía saltarse el clic)`);
  const tail = cleanTts(cat(voiced(0.8), silence(0.2), click(), silence(0.1)), RATE);
  assert.ok(tail.samples.length / RATE < 0.8 + 0.12, `dura ${(tail.samples.length / RATE).toFixed(2)} s`);
  // pero un bloque corto de voz de verdad sí se conserva
  const sylab = cleanTts(cat(voiced(0.8), silence(0.2), voiced(0.12, 200)), RATE);
  assert.ok(sylab.samples.length / RATE > 1.0, 'la sílaba final debe conservarse');
});

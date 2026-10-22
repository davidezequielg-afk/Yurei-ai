// Audio común de las voces propias: recorta el silencio de los extremos y pasa a 24 kHz (lo que espera el reproductor del
// notch), subiendo o bajando el tono si se pide. Entrada: muestras en coma flotante (-1 a 1); salida: Int16 mono 24 kHz.

const OUT_RATE = 24000;
const SILENCE = 0.012; // por debajo de esto (≈ -38 dB) se considera silencio

// pitch > 1 sube el tono (el audio se lee más rápido y queda más corto: quien lo pide ya compensó el largo al generarlo);
// pitch < 1 lo baja.
function floatToPcm24(all, rate, pitch = 1) {
  const total = all.length;
  let first = 0;
  let last = total - 1;
  while (first < total && Math.abs(all[first]) < SILENCE) first++;
  while (last > first && Math.abs(all[last]) < SILENCE) last--;
  const from = first >= total ? 0 : Math.max(0, first - Math.round(rate * 0.04));
  const to = first >= total ? total : Math.min(total, last + 1 + Math.round(rate * 0.1));
  const src = all.subarray(from, to);
  const n = src.length;
  if (!n) throw new Error('La voz no produjo audio');
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

// Velocidad (1 = normal) y tono (semitonos, positivo = más agudo) → factor de tono y velocidad que se le pide al motor.
function pitchFactor(pitch) {
  const st = Math.max(-8, Math.min(8, Number(pitch) || 0));
  return 2 ** (st / 12);
}
const clampSpeed = (speed) => Math.max(0.5, Math.min(2, Number(speed) || 1));

// Quita lo que las voces leerían mal: emojis, marcas de formato y caracteres de control.
function cleanText(text, max = 1500) {
  return String(text ?? '')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[\u0000-\u001f\u007f*_`#~<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

module.exports = { floatToPcm24, pitchFactor, clampSpeed, cleanText, OUT_RATE, SILENCE };

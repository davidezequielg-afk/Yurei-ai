// Escucha continua con detección de voz: emite un enunciado cuando dejas de hablar.
const Listener = (() => {
  const FRAME = 4096; // ~256 ms a 16 kHz
  const END_SILENCE = 5; // ~1,3 s de silencio cierran el enunciado
  const MIN_SPEECH = 3; // descarta ruidos de menos de ~0,8 s
  const MAX_FRAMES = 80; // tope de ~20 s por enunciado

  const BARGE_MIN = 0.07; // nivel mínimo para considerar que le hablas encima
  const BARGE_FACTOR = 7; // …y bien por encima del ruido de fondo
  const BARGE_FRAMES = 2; // ~0,5 s seguidos

  let ctx, stream, node, cb, starting, analyser, paused = false;
  let barge = [];
  let barged = false; // se activó por interrupción: al reanudar no se borra lo que ya se está grabando
  let noise = 0.01;
  let preroll = null;
  let cur = null;
  let silent = 0;
  let speechFrames = 0;

  const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);

  function reset() {
    cur = null;
    silent = 0;
    speechFrames = 0;
    preroll = null;
  }

  function finish() {
    const frames = cur;
    const enough = speechFrames >= MIN_SPEECH;
    reset();
    if (!enough) return;
    const all = new Float32Array(frames.length * FRAME);
    frames.forEach((f, i) => all.set(f, i * FRAME));
    cb.onUtterance({ b64: encodeWav(all), seconds: all.length / WAV_RATE });
  }

  // Mientras Yurei habla, el micrófono queda en pausa salvo para notar si le hablas encima: hace falta voz
  // claramente más fuerte que el ruido (y que el eco de su propia voz) durante ~0,5 s seguidos.
  function bargeCheck(frame) {
    if (!cb.canBarge?.()) { barge = []; return; }
    const level = rms(frame);
    if (level > Math.max(BARGE_MIN, noise * BARGE_FACTOR)) barge.push(frame);
    else barge = [];
    if (barge.length < BARGE_FRAMES) return;
    paused = false;
    barged = true;
    cur = barge;
    speechFrames = barge.length;
    silent = 0;
    barge = [];
    cb.onBargeIn?.();
  }

  function onFrame(frame) {
    if (paused) { bargeCheck(frame); return; }
    const level = rms(frame);
    const threshold = Math.max(0.02, noise * 3.5);
    const loud = level > threshold;
    if (!loud && !cur) noise = noise * 0.95 + level * 0.05;

    if (!cur) {
      if (!loud) { preroll = frame; return; }
      cur = preroll ? [preroll] : [];
      cb.onSpeechStart?.();
    }
    cur.push(frame);
    if (loud) { silent = 0; speechFrames++; } else { silent++; }
    if (silent >= END_SILENCE || cur.length >= MAX_FRAMES) finish();
  }

  return {
    get running() { return !!ctx; },
    start(callbacks) {
      if (ctx) return Promise.resolve();
      starting ||= this.open(callbacks).finally(() => { starting = null; });
      return starting;
    },
    async open(callbacks) {
      cb = callbacks;
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      ctx = new AudioContext({ sampleRate: WAV_RATE });
      const src = ctx.createMediaStreamSource(stream);
      node = ctx.createScriptProcessor(FRAME, 1, 1);
      node.onaudioprocess = (e) => onFrame(new Float32Array(e.inputBuffer.getChannelData(0)));
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      src.connect(node);
      node.connect(ctx.destination);
      reset();
    },
    level: () => (ctx && !paused ? analyserLevel(analyser) : 0),
    pause() { paused = true; barged = false; barge = []; reset(); },
    resume() {
      if (barged) { barged = false; return; } // ya está escuchando lo que dijiste al interrumpir
      paused = false;
      reset();
    },
    async stop() {
      if (!ctx) return;
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
      ctx = null;
      paused = false;
      reset();
    }
  };
})();

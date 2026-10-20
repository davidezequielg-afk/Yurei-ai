// Escucha continua con detección de voz: emite un enunciado cuando dejas de hablar.
const Listener = (() => {
  const FRAME = 4096; // ~256 ms a 16 kHz
  const END_SILENCE = 5; // ~1,3 s de silencio cierran el enunciado
  const MIN_SPEECH = 3; // descarta ruidos de menos de ~0,8 s
  const MAX_FRAMES = 80; // tope de ~20 s por enunciado

  let ctx, stream, node, cb, starting, paused = false;
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

  function onFrame(frame) {
    if (paused) return;
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
      src.connect(node);
      node.connect(ctx.destination);
      reset();
    },
    pause() { paused = true; reset(); },
    resume() { paused = false; reset(); },
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

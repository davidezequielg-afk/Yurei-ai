// Grabación de micrófono → WAV PCM 16-bit mono a 16 kHz (formato que Gemini acepta).
const Recorder = (() => {
  const RATE = 16000;
  let ctx, stream, node, chunks;

  function encode(samples) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, samples.length * 2, true);
    samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
    let bin = '';
    new Uint8Array(buf).forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
      ctx = new AudioContext({ sampleRate: RATE });
      const src = ctx.createMediaStreamSource(stream);
      node = ctx.createScriptProcessor(4096, 1, 1);
      chunks = [];
      node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(node);
      node.connect(ctx.destination);
    },
    async stop() {
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
      const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
      let o = 0;
      chunks.forEach((c) => { all.set(c, o); o += c.length; });
      return { b64: encode(all), seconds: all.length / RATE };
    }
  };
})();

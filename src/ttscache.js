// Caché en disco de audios de voz que se repiten (frases de relleno): se generan una vez y se reutilizan.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function createTtsCache(dir) {
  const fileFor = (key) => path.join(dir, `${crypto.createHash('sha1').update(key).digest('hex')}.pcm`);

  return {
    // Devuelve el audio (base64) de la caché o lo genera con `synth()` y lo guarda.
    async getOrCreate(key, synth) {
      const file = fileFor(key);
      try {
        return fs.readFileSync(file, 'utf8');
      } catch {
        // no estaba en caché
      }
      const audio = await synth();
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, audio);
      return audio;
    }
  };
}

module.exports = { createTtsCache };

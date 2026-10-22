// Se ejecuta antes de armar el instalador (predist): baja el motor Piper para Windows y las 4 voces con las huellas SHA-256 fijadas
// en src/voices.js, y las deja en build-voices/ para que electron-builder las meta en el instalador (resources/voices).
// Si algo no coincide con la huella, se detiene el build.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { VOICES, ENGINE, download, voiceUrl, powershellExtract } = require('../src/voices');

const OUT = path.join(__dirname, '..', 'build-voices');
const sizeIs = (p, n) => { try { return fs.statSync(p).size === n; } catch { return false; } };

// Créditos y licencias de lo que viaja dentro del instalador junto a las voces (Yurei en sí es MIT).
const NOTICES = `Voces y motor de voz incluidos con Yurei
==========================================

Yurei es software MIT. Esta carpeta contiene componentes de terceros que conservan sus propias licencias.

MOTOR: Piper (https://github.com/rhasspy/piper), licencia MIT. Versión 2023.11.14-2 para Windows.
  Incluye espeak-ng (https://github.com/espeak-ng/espeak-ng), licencia GPL-3.0-o-posterior, que Yurei ejecuta como programa aparte
  (no se enlaza con Yurei). Código fuente: https://github.com/espeak-ng/espeak-ng
  Incluye ONNX Runtime (MIT, https://github.com/microsoft/onnxruntime).

VOCES (https://huggingface.co/rhasspy/piper-voices, revisión ${require('../src/voices').REVISION}):
  Daniela (es_AR, alta calidad) - datos: OpenSLR 61, licencia CC BY-SA 4.0. Entrenada por larcanio (https://huggingface.co/larcanio/piper-voices)
    sobre la voz inglesa lessac. Se redistribuye sin cambios, con atribución, bajo la misma licencia CC BY-SA 4.0.
    https://creativecommons.org/licenses/by-sa/4.0/
  Claude (es_MX, alta calidad) - licencia Apache-2.0. https://huggingface.co/spaces/HirCoir/Piper-TTS-Spanish
  Ald (es_MX, calidad media) - datos de rmcpantoja (Ald_Mexican_Spanish_speech_dataset), dominio público (Unlicense).
  Dave (es_ES, calidad media) - datos de OHF-Voice/voice-datasets, licencia CC0.
`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'LICENCIAS.txt'), NOTICES);
  const exe = path.join(OUT, 'engine', 'piper', 'piper.exe');
  if (!fs.existsSync(exe)) {
    const zip = path.join(OUT, 'engine.zip');
    console.log('Motor Piper…');
    await download({ url: ENGINE.url, dest: zip, sha256: ENGINE.sha256 });
    fs.rmSync(path.join(OUT, 'engine'), { recursive: true, force: true });
    if (process.platform === 'win32') await powershellExtract(zip, path.join(OUT, 'engine'));
    else if (spawnSync('unzip', ['-q', zip, '-d', path.join(OUT, 'engine')]).status !== 0) throw new Error('No se pudo descomprimir el motor de voz');
    fs.rmSync(zip, { force: true });
    if (!fs.existsSync(exe)) throw new Error('El motor de voz no quedó completo');
  }
  for (const v of VOICES) {
    const model = path.join(OUT, `${v.file}.onnx`);
    const config = `${model}.json`;
    if (!sizeIs(model, v.size)) { console.log(`Voz ${v.name}…`); await download({ url: voiceUrl(v, 'onnx'), dest: model, sha256: v.sha256.onnx }); }
    if (!fs.existsSync(config)) await download({ url: voiceUrl(v, 'onnx.json'), dest: config, sha256: v.sha256.json });
  }
  console.log('Voces listas en build-voices/');
}

main().catch((e) => { console.error(`No se pudieron preparar las voces: ${e.message}`); process.exit(1); });

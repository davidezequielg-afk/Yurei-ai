// Proceso aparte que avisa cuando se aprieta o se suelta la tecla de "mantener apretado para hablar".

const fs = require('fs');
const path = require('path');

const VK = { rctrl: 0xa3, ralt: 0xa5, f8: 0x77, f9: 0x78 };

function createKeyWatch({ spawn, dataDir, onDown = () => {}, onUp = () => {}, platform = process.platform }) {
  let child = null;
  let key = 'off';

  function stop() {
    const c = child;
    child = null;
    c?.kill();
  }

  function start(name) {
    stop();
    key = name;
    if (platform !== 'win32' || !Object.hasOwn(VK, name)) return false;
    const script = path.join(dataDir, 'yurei-keywatch.ps1');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(script, `﻿${fs.readFileSync(path.join(__dirname, 'keywatch.ps1'), 'utf8')}`);
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-vk', String(VK[name])], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    child = proc;
    let buf = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line === 'down') onDown();
        else if (line === 'up') onUp();
      }
    });
    // Si se cae, se vuelve a lanzar a los pocos segundos (mientras siga elegida esa tecla).
    proc.on('exit', () => { if (child === proc) { child = null; setTimeout(() => { if (!child && key === name) start(name); }, 3000); } });
    proc.on('error', () => {});
    return true;
  }

  return { start, stop, get key() { return key; } };
}

module.exports = { createKeyWatch, VK };

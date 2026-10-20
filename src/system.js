// Integración con el SO (pensada para Windows; en otros sistemas degrada con gracia).
const { spawn, execFile } = require('child_process');

const isWin = process.platform === 'win32';
const SAFE_NAME = /^[\w .\-()&+]{1,80}$/;

function ps(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

function createSystem({ shell, clipboard }) {
  return {
    openUrl: (url) => shell.openExternal(url),

    async launchApp(name) {
      if (!SAFE_NAME.test(name)) throw new Error('Nombre de app no válido');
      const [cmd, args] = isWin ? ['cmd.exe', ['/c', 'start', '""', name]] : ['xdg-open', [name]];
      spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    },

    // Windows no expone un "set volume" simple sin módulos nativos: se usan las teclas multimedia.
    async setVolume(level) {
      if (!isWin) throw new Error('Control de volumen solo disponible en Windows');
      const steps = Math.round(level / 2);
      await ps(`$w=New-Object -ComObject WScript.Shell; 1..50|%{$w.SendKeys([char]174)}; if(${steps}-gt 0){1..${steps}|%{$w.SendKeys([char]175)}}`);
    },

    async power(action) {
      if (!isWin) throw new Error('Control de energía solo disponible en Windows');
      const commands = {
        lock: ['rundll32.exe', ['user32.dll,LockWorkStation']],
        sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']],
        restart: ['shutdown.exe', ['/r', '/t', '5']],
        shutdown: ['shutdown.exe', ['/s', '/t', '5']]
      };
      const [cmd, args] = commands[action];
      spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    },

    readClipboard: () => clipboard.readText(),

    // Escribe en el portapapeles y envía Ctrl+V a la ventana activa.
    async pasteText(text) {
      clipboard.writeText(text);
      if (isWin) await ps('(New-Object -ComObject WScript.Shell).SendKeys("^v")');
    }
  };
}

module.exports = { createSystem };

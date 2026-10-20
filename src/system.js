// Integración con el SO (pensada para Windows; en otros sistemas degrada con gracia).
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHelper } = require('./winhelper');

const isWin = process.platform === 'win32';
const SAFE_NAME = /^[\w .\-()&+]{1,80}$/;

function ps(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

function createSystem({ shell, clipboard, dataDir = os.tmpdir() }) {
  let battery = null; // null = todavía no se sabe
  let helper = null;

  // Ayudante persistente de PowerShell (volumen real y reproductores). Se crea la primera vez que se usa.
  function win() {
    if (!isWin) throw new Error('Esto solo funciona en Windows');
    if (!helper) {
      const script = path.join(dataDir, 'yurei-winhelper.ps1');
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(script, `\ufeff${fs.readFileSync(path.join(__dirname, 'winhelper.ps1'), 'utf8')}`); // BOM: PowerShell 5.1 lo lee como UTF-8
      helper = createHelper({ spawn, args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], timeoutMs: 15000 });
    }
    return helper;
  }

  return {
    // ¿Este equipo tiene batería? (portátil) o no (PC de escritorio)
    async detectBattery() {
      try {
        if (isWin) {
          const out = await ps('(Get-CimInstance -ClassName Win32_Battery | Measure-Object).Count');
          battery = Number(out.trim()) > 0;
        } else if (process.platform === 'linux') {
          battery = fs.readdirSync('/sys/class/power_supply').some((n) => n.startsWith('BAT'));
        }
      } catch {
        battery = null; // si no se puede saber, no se bloquea el widget
      }
      return battery;
    },
    hasBattery: () => battery,

    openUrl: (url) => shell.openExternal(url),

    async launchApp(name) {
      if (!SAFE_NAME.test(name)) throw new Error('Nombre de app no válido');
      const [cmd, args] = isWin ? ['cmd.exe', ['/c', 'start', '""', name]] : ['xdg-open', [name]];
      spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    },

    hasMediaControl: () => isWin,
    getVolume: () => win().request('vol.get'),
    setVolume: (level) => win().request('vol.set', level),
    changeVolume: (delta) => win().request('vol.step', delta),
    setMute: (muted) => win().request('vol.mute', muted ? 'true' : 'false'),
    mediaInfo: () => win().request('media.get'),
    // action: play | pause | toggle | next | prev | seek (arg = segundos, negativo para retroceder)
    media: (action, arg = '') => win().request('media.cmd', arg === '' ? action : `${action}:${arg}`),
    shutdown: () => helper?.stop(),

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
    },

    stats: (() => {
      let prev = os.cpus();
      return () => {
        const cur = os.cpus();
        let idle = 0;
        let total = 0;
        cur.forEach((c, i) => {
          for (const k of Object.keys(c.times)) total += c.times[k] - prev[i].times[k];
          idle += c.times.idle - prev[i].times.idle;
        });
        prev = cur;
        return {
          cpu: total ? Math.round(100 * (1 - idle / total)) : 0,
          ramUsedGb: +((os.totalmem() - os.freemem()) / 2 ** 30).toFixed(1),
          ramTotalGb: +(os.totalmem() / 2 ** 30).toFixed(1)
        };
      };
    })()
  };
}

module.exports = { createSystem };

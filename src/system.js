// Integración con el SO (pensada para Windows; en otros sistemas degrada con gracia).
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHelper } = require('./winhelper');
const { findApp } = require('./launcher');

// Programas del propio Windows que se pueden abrir por nombre. Son ejecutables fijos: nunca se pasa texto del usuario a un intérprete de comandos.
const BUILTINS = {
  'bloc de notas': 'notepad.exe', notepad: 'notepad.exe', calculadora: 'calc.exe', calculator: 'calc.exe', calc: 'calc.exe',
  paint: 'mspaint.exe', 'administrador de tareas': 'taskmgr.exe', 'task manager': 'taskmgr.exe', explorador: 'explorer.exe', explorer: 'explorer.exe'
};
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ps(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

// `confirm(acción)` debe pedir confirmación al usuario FUERA de la IA (un cuadro del sistema): lo destructivo no depende de lo que diga el modelo.
function createSystem({ shell, clipboard, dataDir = os.tmpdir(), confirm = async () => false, platform = process.platform, spawnImpl = spawn }) {
  const isWin = platform === 'win32';
  let battery = null; // null = todavía no se sabe
  let helper = null;

  // Ayudante persistente de PowerShell (volumen real y reproductores). Se crea la primera vez que se usa.
  function win() {
    if (!isWin) throw new Error('Esto solo funciona en Windows');
    if (!helper) {
      const script = path.join(dataDir, 'yurei-winhelper.ps1');
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(script, `\ufeff${fs.readFileSync(path.join(__dirname, 'winhelper.ps1'), 'utf8')}`); // BOM: PowerShell 5.1 lo lee como UTF-8
      helper = createHelper({ spawn: spawnImpl, args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], timeoutMs: 15000 });
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

    openUrl(url) {
      let u;
      try { u = new URL(url); } catch { throw new Error('URL no válida'); }
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Solo se permiten URLs http/https');
      return shell.openExternal(u.href);
    },

    // Solo abre apps instaladas (accesos del menú Inicio) o programas básicos de Windows. Sin intérprete de comandos.
    async launchApp(name) {
      const n = norm(name);
      if (!n || n.length > 80) throw new Error('Nombre de app no válido');
      const app = findApp(n, this.listApps());
      if (app) {
        const err = await shell.openPath(app.file);
        if (err) throw new Error(err);
        return;
      }
      const exe = isWin && Object.hasOwn(BUILTINS, n) ? BUILTINS[n] : null;
      if (!exe) throw new Error(`No encontré una app instalada llamada "${name}"`);
      spawnImpl(exe, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    },

    // ¿Tiene Windows activados los "efectos de transparencia"? null = no se sabe / no es Windows
    systemTransparency: () => new Promise((resolve) => {
      if (!isWin) { resolve(null); return; }
      execFile('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'EnableTransparency'], { windowsHide: true }, (err, out) => {
        const m = !err && /EnableTransparency\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(out);
        resolve(m ? parseInt(m[1], 16) !== 0 : null);
      });
    }),
    // Apps instaladas = accesos del menú Inicio (.lnk), sin desinstaladores ni ayudas
    listApps() {
      if (!isWin) return [];
      const roots = [
        path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft/Windows/Start Menu/Programs'),
        path.join(process.env.APPDATA || '', 'Microsoft/Windows/Start Menu/Programs')
      ];
      const skip = /uninstall|desinstal|readme|l[eé]eme|\bhelp\b|ayuda|manual|license|licencia/i;
      const apps = new Map();
      const walk = (dir) => {
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else if (e.name.toLowerCase().endsWith('.lnk') && !skip.test(e.name)) apps.set(e.name.slice(0, -4), full);
        }
      };
      roots.forEach(walk);
      return [...apps].map(([name, file]) => ({ name, file })).sort((a, b) => a.name.localeCompare(b.name));
    },
    hasMediaControl: () => isWin,
    getVolume: () => win().request('vol.get'),
    diagnose: () => win().request('diag'),
    setVolume: (level) => win().request('vol.set', level),
    changeVolume: (delta) => win().request('vol.step', delta),
    setMute: (muted) => win().request('vol.mute', muted ? 'true' : 'false'),
    mediaInfo: () => win().request('media.get'),
    mediaCover: () => win().request('media.cover'),
    async openPath(p) {
      const err = await shell.openPath(p);
      if (err) throw new Error(err);
    },
    // Batería (solo notebooks): nivel y si está enchufada.
    battery: () => (isWin ? ps('$b = Get-CimInstance Win32_Battery | Select-Object -First 1; if ($b) { "$($b.EstimatedChargeRemaining)|$($b.BatteryStatus)" }').then((o) => { const [lvl, st] = o.trim().split('|').map(Number); return Number.isFinite(lvl) ? { level: lvl, charging: [2, 6, 7, 8, 9].includes(st) } : null; }) : Promise.resolve(null)),
    // Radios (Wi-Fi y Bluetooth), dispositivos Bluetooth emparejados, teclas del sistema y páginas de Ajustes de Windows.
    radios: () => win().request('radio.get'),
    setRadio: (kind, on) => {
      if (!['wifi', 'bluetooth'].includes(kind)) throw new Error('Radio desconocida');
      return win().request('radio.set', `${kind}:${on ? 'true' : 'false'}`);
    },
    btDevices: () => win().request('bt.list'),
    combo(name) {
      const keys = { notifications: [91, 78], tray: [91, 66], taskview: [91, 9], start: [91] }[name]; // Win+N, Win+B, Win+Tab, Win
      if (!keys) throw new Error('Combinación no permitida');
      return win().request('keys.combo', keys.join(','));
    },
    openSettingsPage(page) {
      const uri = { sound: 'sound', bluetooth: 'bluetooth', wifi: 'network-wifi', batterysaver: 'batterysaver', nightlight: 'nightlight', taskbar: 'taskbar', apps: 'appsfeatures', notifications: 'notifications' }[page];
      if (!uri) throw new Error('Página no permitida');
      if (!isWin) throw new Error('Solo en Windows');
      return shell.openExternal(`ms-settings:${uri}`);
    },
    // Mezclador por aplicación (solo Windows) y ventana en primer plano.
    mixerList: () => (isWin ? win().request('mix.list') : Promise.reject(new Error('Solo en Windows'))),
    mixerSet(pid, level) {
      if (!Number.isInteger(pid) || pid < 0 || !Number.isFinite(level)) throw new Error('Datos no válidos');
      return win().request('mix.set', `${pid}:${Math.max(0, Math.min(100, Math.round(level)))}`);
    },
    mixerMute(pid, on) {
      if (!Number.isInteger(pid) || pid < 0) throw new Error('Datos no válidos');
      return win().request('mix.mute', `${pid}:${on ? 'true' : 'false'}`);
    },
    foreground: () => (isWin ? win().request('fg.info') : Promise.resolve(null)),
    getBrightness: () => (isWin ? win().request('bright.get') : Promise.resolve({ available: false })),
    setBrightness: (level) => win().request('bright.set', level),
    openNightLight: () => (isWin ? shell.openExternal('ms-settings:nightlight') : Promise.reject(new Error('Solo en Windows'))),
    // action: play | pause | toggle | next | prev | seek (arg = segundos, negativo para retroceder)
    media: (action, arg = '') => win().request('media.cmd', arg === '' ? action : `${action}:${arg}`),
    shutdown: () => helper?.stop(),

    async power(action) {
      if (!isWin) throw new Error('Control de energía solo disponible en Windows');
      if (action !== 'lock' && !(await confirm(action))) throw new Error('Cancelado: no se confirmó en pantalla');
      const commands = {
        lock: ['rundll32.exe', ['user32.dll,LockWorkStation']],
        sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']],
        restart: ['shutdown.exe', ['/r', '/t', '5']],
        shutdown: ['shutdown.exe', ['/s', '/t', '5']]
      };
      const [cmd, args] = commands[action];
      spawnImpl(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    },

    // Portapapeles: solo se lee cuando el usuario lo pide ("resume lo que copié").
    readClipboard: () => clipboard.readText(),
    writeClipboard: (text) => clipboard.writeText(text),

    // Escribe en el portapapeles y envía Ctrl+V a la ventana activa.
    async pasteText(text) {
      const previous = clipboard.readText(); // se devuelve lo que el usuario tenía copiado: dictar no debe pisarle el portapapeles
      clipboard.writeText(text);
      try {
        if (isWin) await ps('(New-Object -ComObject WScript.Shell).SendKeys("^v")');
        await sleep(300);
      } finally {
        if (clipboard.readText() === text) clipboard.writeText(previous);
      }
    },

    // Velocidad de red (bytes por segundo) a partir de los contadores del sistema.
    netSpeed: (() => {
      let prev = null;
      const read = () => new Promise((resolve) => {
        if (isWin) {
          execFile('netstat.exe', ['-e'], { windowsHide: true }, (err, out) => {
            const m = !err && /^\s*(?:Bytes|Octetos)\s+(\d+)\s+(\d+)/im.exec(out);
            resolve(m ? { rx: Number(m[1]), tx: Number(m[2]) } : null);
          });
        } else {
          try {
            let rx = 0;
            let tx = 0;
            for (const line of fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2)) {
              const [name, rest] = line.split(':');
              if (!rest || name.trim() === 'lo') continue;
              const c = rest.trim().split(/\s+/).map(Number);
              rx += c[0]; tx += c[8];
            }
            resolve({ rx, tx });
          } catch { resolve(null); }
        }
      });
      return async () => {
        const cur = await read();
        const t = Date.now();
        if (!cur) return null;
        const out = prev && t > prev.t ? { down: Math.max(0, (cur.rx - prev.rx) / ((t - prev.t) / 1000)), up: Math.max(0, (cur.tx - prev.tx) / ((t - prev.t) / 1000)) } : { down: 0, up: 0 };
        prev = { ...cur, t };
        return out;
      };
    })(),

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
        let diskFreeGb = null;
        try { const f = fs.statfsSync(isWin ? `${(process.env.SystemDrive || 'C:')}\\` : '/'); diskFreeGb = Math.round((f.bavail * f.bsize) / 2 ** 30); } catch { /* sin dato */ }
        return {
          cpu: total ? Math.round(100 * (1 - idle / total)) : 0,
          ramUsedGb: +((os.totalmem() - os.freemem()) / 2 ** 30).toFixed(1),
          ramTotalGb: +(os.totalmem() / 2 ** 30).toFixed(1),
          diskFreeGb
        };
      };
    })()
  };
}

module.exports = { createSystem };

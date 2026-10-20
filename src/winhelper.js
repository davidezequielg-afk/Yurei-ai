// Proceso PowerShell persistente: se compila el código de audio una vez y luego atiende peticiones por línea.
// Protocolo: "id|comando|argumento\n" → una línea JSON {id, ok, data | error}.

function createHelper({ spawn, command = 'powershell.exe', args = [], timeoutMs = 6000 }) {
  let child = null;
  let buf = '';
  let nextId = 1;
  const pending = new Map();

  // Tira el proceso actual (colgado o muerto) y rechaza todo lo pendiente; el siguiente pedido arranca uno nuevo.
  function reset(message) {
    const proc = child;
    child = null;
    buf = '';
    proc?.kill();
    failAll(message);
  }

  function failAll(message) {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(message));
    }
    pending.clear();
  }

  function onData(chunk) {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; } // ruido de PowerShell: se ignora
      const p = pending.get(String(msg.id));
      if (!p) continue;
      pending.delete(String(msg.id));
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.data);
      else p.reject(new Error(msg.error || 'Error del ayudante de Windows'));
    }
  }

  function ensure() {
    if (child) return;
    const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    child = proc;
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', onData);
    const gone = () => {
      if (child === proc) reset('El ayudante de Windows se detuvo');
    };
    proc.on('exit', gone);
    proc.on('error', gone);
    proc.stdin.on('error', () => {}); // escribir en un proceso muerto no debe tumbar la app
  }

  return {
    request(cmd, arg = '') {
      return new Promise((resolve, reject) => {
        try { ensure(); } catch (e) { reject(e); return; }
        const id = String(nextId++);
        const timer = setTimeout(() => reset('El ayudante de Windows no respondió a tiempo'), timeoutMs);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(`${id}|${cmd}|${String(arg).replace(/[\r\n|]/g, ' ')}\n`);
      });
    },
    stop() {
      reset('Detenido');
    }
  };
}

module.exports = { createHelper };

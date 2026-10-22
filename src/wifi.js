// Wi-Fi con las herramientas de Windows (netsh). Todo se llama con argumentos separados (nunca por una consola),
// el SSID y la clave se validan, y el perfil con la clave se escribe en un archivo temporal solo el instante necesario.

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OPEN_WORDS = /\b(open|abiert[ao]|aberta|offen|ouvert|aperta)\b/i;

function run(args, { timeout = 12000, exec = execFile } = {}) {
  return new Promise((resolve, reject) => {
    exec('netsh.exe', args, { windowsHide: true, timeout, encoding: 'utf8' }, (err, out, errOut) => (err ? reject(new Error(String(errOut || out || err.message).trim().split(/\r?\n/)[0] || 'netsh falló')) : resolve(String(out))));
  });
}

// Red actual: "SSID : nombre" (no "BSSID"); la etiqueta SSID es igual en todos los idiomas.
function parseInterfaces(out) {
  const ssid = /^\s*SSID\s*:\s*(.+?)\s*$/im.exec(out)?.[1] || '';
  const hasIface = /^\s*(?:Name|Nombre|Nom)\s*:/im.test(out) || /SSID|BSSID/i.test(out);
  return { present: hasIface, connected: !!ssid, ssid };
}

// Lista de redes: se lee por posición (el texto de cada línea depende del idioma de Windows).
function parseNetworks(out) {
  const lines = String(out).split(/\r?\n/);
  const nets = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*SSID\s+\d+\s*:\s*(.*)$/i.exec(lines[i]);
    if (!m) continue;
    const ssid = m[1].trim();
    let auth = '';
    let signal = 0;
    for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
      if (/^\s*SSID\s+\d+\s*:/i.test(lines[j])) break;
      if (!auth && j === i + 2) auth = (lines[j].split(':')[1] || '').trim(); // 1.ª línea: tipo de red, 2.ª: autenticación
      const sg = /(\d{1,3})\s*%/.exec(lines[j]);
      if (sg) signal = Math.max(signal, Number(sg[1]));
    }
    if (!ssid) continue;
    const prev = nets.get(ssid);
    if (!prev || signal > prev.signal) {
      const secured = !OPEN_WORDS.test(auth);
      nets.set(ssid, { ssid, secured, enterprise: /enterprise|empresa|802\.1x|unternehmen|entreprise/i.test(auth), wpa3: /wpa3/i.test(auth), signal });
    }
  }
  return [...nets.values()].sort((a, b) => b.signal - a.signal);
}

// Perfiles guardados: "Perfil de todos los usuarios : nombre".
function parseProfiles(out) {
  return String(out).split(/\r?\n/).map((l) => /^\s*[^:]*(?:profile|perfil|profil)[^:]*:\s*(.+?)\s*$/i.exec(l)?.[1]).filter(Boolean);
}

const esc = (v) => String(v).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

function validSsid(ssid) {
  const s = String(ssid ?? '');
  if (!s || Buffer.byteLength(s) > 32 || /[\u0000-\u001f]/.test(s)) throw new Error('Nombre de red no válido');
  return s;
}
function validPassword(pw) {
  const p = String(pw ?? '');
  if (/[\u0000-\u001f]/.test(p)) throw new Error('Clave no válida');
  if (!(p.length >= 8 && p.length <= 63) && !/^[0-9a-f]{64}$/i.test(p)) throw new Error('La clave debe tener entre 8 y 63 caracteres');
  return p;
}

function profileXml({ ssid, password, wpa3 = false }) {
  const head = `<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>${esc(ssid)}</name><SSIDConfig><SSID><name>${esc(ssid)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security>`;
  const tail = '</security></MSM></WLANProfile>';
  if (!password) return `${head}<authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption>${tail}`;
  return `${head}<authEncryption><authentication>${wpa3 ? 'WPA3SAE' : 'WPA2PSK'}</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${esc(password)}</keyMaterial></sharedKey>${tail}`;
}

function createWifi({ exec = execFile, tmp = os.tmpdir(), fsImpl = fs, platform = process.platform } = {}) {
  const netsh = (args, opts) => run(args, { ...opts, exec });
  const need = () => { if (platform !== 'win32') throw new Error('El Wi-Fi solo se maneja en Windows'); };

  return {
    async status() {
      need();
      return parseInterfaces(await netsh(['wlan', 'show', 'interfaces']).catch(() => ''));
    },
    async scan() {
      need();
      const [nets, profiles, cur] = await Promise.all([
        netsh(['wlan', 'show', 'networks', 'mode=bssid']).then(parseNetworks).catch(() => []),
        netsh(['wlan', 'show', 'profiles']).then(parseProfiles).catch(() => []),
        this.status().catch(() => ({ ssid: '' }))
      ]);
      return nets.map((n) => ({ ...n, saved: profiles.includes(n.ssid), connected: n.ssid === cur.ssid }));
    },
    // Conecta: con perfil guardado directo; si no, se crea con la clave que diste (no se guarda en ningún otro lado).
    async connect({ ssid, password, secured = true, wpa3 = false }) {
      need();
      validSsid(ssid);
      const profiles = await netsh(['wlan', 'show', 'profiles']).then(parseProfiles).catch(() => []);
      if (!profiles.includes(ssid)) {
        const xml = profileXml({ ssid, password: secured ? validPassword(password) : '', wpa3 });
        const file = path.join(tmp, `yurei-wifi-${process.pid}-${Date.now()}.xml`);
        fsImpl.writeFileSync(file, xml, { mode: 0o600 });
        try { await netsh(['wlan', 'add', 'profile', `filename=${file}`, 'user=current']); } finally { try { fsImpl.unlinkSync(file); } catch { /* ya no está */ } }
      }
      await netsh(['wlan', 'connect', `name=${ssid}`, `ssid=${ssid}`]);
      return { requested: true };
    },
    async disconnect() { need(); await netsh(['wlan', 'disconnect']); return { done: true }; },
    async forget(ssid) { need(); validSsid(ssid); await netsh(['wlan', 'delete', 'profile', `name=${ssid}`]); return { done: true }; }
  };
}

module.exports = { createWifi, parseInterfaces, parseNetworks, parseProfiles, profileXml, validSsid, validPassword };

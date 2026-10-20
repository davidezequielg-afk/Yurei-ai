// Actualizaciones: mira el último release del repositorio en GitHub, baja el instalador y, antes de abrirlo,
// comprueba que su SHA-256 coincide con el que publica GitHub (o con SHA256SUMS.txt del mismo release).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO = 'davidezequielg-afk/Yurei-ai';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const ASSET = /^Yurei-Setup-(\d+\.\d+\.\d+)\.exe$/;
// Solo se descarga de GitHub (los archivos de los releases se sirven desde estos dominios tras una redirección).
const HOSTS = ['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];
const MAX_BYTES = 400 * 1024 * 1024;

// ¿a es más nueva que b? ("1.2.0" > "1.1.9")
function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

const allowedUrl = (u) => {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && HOSTS.includes(url.hostname);
  } catch { return false; }
};

function createUpdater({ current, dir, fetchImpl = fetch, spawnImpl = null, timeoutMs = 15000 }) {
  let found = null;

  const get = async (url, opts = {}) => {
    const res = await fetchImpl(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'Yurei' }, signal: AbortSignal.timeout(opts.timeout || timeoutMs) });
    if (!res.ok) throw new Error(`GitHub respondió ${res.status}`);
    if (res.url && !allowedUrl(res.url)) throw new Error('Descarga redirigida fuera de GitHub');
    return res;
  };

  async function sha256For(release, asset) {
    const m = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest || '');
    if (m) return m[1].toLowerCase();
    const sums = (release.assets || []).find((a) => a.name === 'SHA256SUMS.txt');
    if (!sums || !allowedUrl(sums.browser_download_url)) return null;
    const text = await (await get(sums.browser_download_url)).text();
    const line = text.split(/\r?\n/).find((l) => l.trim().endsWith(asset.name));
    const h = line && /^([0-9a-f]{64})\b/i.exec(line.trim());
    return h ? h[1].toLowerCase() : null;
  }

  return {
    // { available:false } o { available:true, version, notes, size }
    async check() {
      const release = await (await get(API)).json();
      if (release.draft || release.prerelease) return { available: false, current };
      const asset = (release.assets || []).find((a) => ASSET.test(a.name));
      const version = asset ? ASSET.exec(asset.name)[1] : String(release.tag_name || '').replace(/^v/, '');
      if (!asset || !newer(version, current)) { found = null; return { available: false, current, latest: version }; }
      if (!allowedUrl(asset.browser_download_url)) throw new Error('El instalador no está en GitHub');
      const sha256 = await sha256For(release, asset);
      if (!sha256) throw new Error('El release no publica la huella SHA-256 del instalador');
      found = { version, url: asset.browser_download_url, name: asset.name, size: asset.size, sha256, notes: String(release.body || '').slice(0, 600) };
      return { available: true, current, version, notes: found.notes, size: found.size };
    },

    // Baja el instalador y verifica su huella. Devuelve la ruta del archivo listo para abrir.
    async download(onProgress = () => {}) {
      if (!found) throw new Error('No hay ninguna actualización pendiente');
      const res = await get(found.url, { timeout: 10 * 60 * 1000 });
      const total = Number(res.headers?.get?.('content-length')) || found.size || 0;
      if (total > MAX_BYTES) throw new Error('El instalador es demasiado grande');
      const hash = crypto.createHash('sha256');
      const chunks = [];
      let got = 0;
      for await (const chunk of res.body) {
        got += chunk.length;
        if (got > MAX_BYTES) throw new Error('El instalador es demasiado grande');
        hash.update(chunk);
        chunks.push(Buffer.from(chunk));
        if (total) onProgress(Math.min(1, got / total));
      }
      const digest = hash.digest('hex');
      if (digest !== found.sha256) throw new Error('La descarga no coincide con la huella publicada: no se instala');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, found.name);
      fs.writeFileSync(file, Buffer.concat(chunks));
      return file;
    },

    // Abre el instalador (separado de Yurei) para que reemplace la versión actual. Quien llama cierra la app.
    install(file) {
      if (!spawnImpl) throw new Error('Instalar solo está disponible en Windows');
      if (path.dirname(file) !== path.resolve(dir) || !ASSET.test(path.basename(file))) throw new Error('Instalador no válido');
      spawnImpl(file, ['--updated'], { detached: true, stdio: 'ignore' }).unref();
    },

    pending: () => (found ? { version: found.version, notes: found.notes, size: found.size } : null)
  };
}

module.exports = { createUpdater, newer, REPO };

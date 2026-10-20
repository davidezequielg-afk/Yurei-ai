// Buscar archivos por voz ("abre el PDF del contrato", "la foto de ayer"). Solo en tus carpetas personales,
// con tope de tiempo y de archivos revisados. Solo se pueden abrir archivos que salieron en una búsqueda.

const fs = require('fs');
const path = require('path');
const os = require('os');

const KINDS = {
  imagen: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.bmp'],
  video: ['.mp4', '.mov', '.mkv', '.avi', '.webm'],
  audio: ['.mp3', '.wav', '.m4a', '.flac', '.ogg'],
  documento: ['.pdf', '.doc', '.docx', '.odt', '.txt', '.rtf', '.md'],
  hoja: ['.xls', '.xlsx', '.ods', '.csv'],
  presentacion: ['.ppt', '.pptx', '.odp'],
  pdf: ['.pdf'],
  comprimido: ['.zip', '.rar', '.7z']
};
const SKIP_DIRS = /^(\.|node_modules$|AppData$|\$RECYCLE\.BIN$|System Volume Information$)/i;
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function userRoots(home = os.homedir()) {
  return ['Desktop', 'Escritorio', 'Documents', 'Documentos', 'Downloads', 'Descargas', 'Pictures', 'Imágenes', 'Videos', 'Vídeos', 'Music', 'Música', 'OneDrive']
    .map((d) => path.join(home, d));
}

function findFiles({ query = '', kind = '', days = 0, roots = userRoots(), limit = 8, now = Date.now(), maxEntries = 40000, maxMs = 3000, fsImpl = fs }) {
  const words = norm(query).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 1);
  const exts = KINDS[norm(kind).replace(/s$/, '')] || null;
  const since = days > 0 ? now - days * 86400000 : 0;
  if (!words.length && !exts && !since) throw new Error('Dime qué buscar: un nombre, un tipo o una fecha');
  const started = Date.now();
  const found = [];
  let seen = 0;
  const seenRoots = new Set();
  const stack = roots.filter((r) => { try { const real = fsImpl.realpathSync(r); if (seenRoots.has(real)) return false; seenRoots.add(real); return fsImpl.statSync(r).isDirectory(); } catch { return false; } }).map((r) => [r, 0]);
  while (stack.length && seen < maxEntries && Date.now() - started < maxMs) {
    const [dir, depth] = stack.pop();
    let entries;
    try { entries = fsImpl.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      seen++;
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (depth < 6 && !SKIP_DIRS.test(e.name)) stack.push([full, depth + 1]); continue; }
      if (!e.isFile()) continue;
      const name = norm(e.name);
      if (exts && !exts.includes(path.extname(name))) continue;
      const hits = words.filter((w) => name.includes(w)).length;
      if (words.length && hits === 0) continue;
      let mtime = 0;
      try { mtime = fsImpl.statSync(full).mtimeMs; } catch { continue; }
      if (since && mtime < since) continue;
      found.push({ path: full, name: e.name, folder: path.basename(dir), modified: new Date(mtime).toISOString(), score: hits * 10 + mtime / 1e13 });
    }
  }
  found.sort((a, b) => b.score - a.score);
  return found.slice(0, limit).map(({ score, ...f }) => f);
}

module.exports = { findFiles, userRoots, KINDS };

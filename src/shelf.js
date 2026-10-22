// Bandeja de la isla: hasta 10 elementos (archivos, carpetas o textos), el más nuevo primero. Los archivos se guardan
// como referencias a su ruta (nunca se copian); los que ya no existen se descartan. Sin duplicados.

const fs = require('fs');
const path = require('path');

const MAX = 10;
const TEXT_MAX = 2000;

function createShelf({ get, set, fsImpl = fs, persist = () => false }) {
  const list = () => get() || [];

  function exists(p) { try { return fsImpl.statSync(p); } catch { return null; } }

  const api = {
    max: MAX,
    list: () => list(),

    // Quita los archivos que ya no existen; sin "mantener elementos", la bandeja arranca vacía.
    prune({ startup = false } = {}) {
      const keep = startup && !persist() ? [] : list().filter((i) => i.kind === 'text' || exists(i.path));
      if (keep.length !== list().length) set(keep);
      return keep;
    },

    addPaths(paths) {
      const cur = list();
      const added = [];
      let full = false;
      for (const p of [...new Set(Array.isArray(paths) ? paths : [])]) {
        if (typeof p !== 'string' || !path.isAbsolute(p) || p.length > 1000 || p.includes('\0')) continue;
        if (cur.some((i) => i.path === p) || added.some((i) => i.path === p)) continue;
        const st = exists(p);
        if (!st) continue;
        if (cur.length + added.length >= MAX) { full = true; break; }
        added.unshift({ id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind: st.isDirectory() ? 'folder' : 'file', path: p, name: path.basename(p) || p, at: Date.now() });
      }
      if (added.length) set([...added, ...cur]);
      return { items: list(), added: added.length, full };
    },

    addText(text) {
      const t = String(text ?? '').replace(/\r\n/g, '\n').trim().slice(0, TEXT_MAX);
      if (!t) return { items: list(), added: 0, full: false };
      const cur = list();
      if (cur.some((i) => i.kind === 'text' && i.text === t)) return { items: cur, added: 0, full: false };
      if (cur.length >= MAX) return { items: cur, added: 0, full: true };
      set([{ id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind: 'text', name: t.split('\n')[0].slice(0, 40), text: t, at: Date.now() }, ...cur]);
      return { items: list(), added: 1, full: false };
    },

    remove(id) { set(list().filter((i) => i.id !== id)); return list(); },
    clear() { set([]); return []; },
    find(id) { return list().find((i) => i.id === id) || null; }
  };
  return api;
}

module.exports = { createShelf, MAX };

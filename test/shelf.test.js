const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createShelf } = require('../src/shelf');

function setup(persist = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ysh-'));
  const mk = (n) => { const p = path.join(dir, n); fs.writeFileSync(p, 'x'); return p; };
  let data = [];
  const shelf = createShelf({ get: () => data, set: (v) => { data = v; }, persist: () => persist });
  return { dir, mk, shelf, get: () => data };
}

test('bandeja: guarda referencias, el más nuevo primero, sin duplicados y sin rutas falsas', () => {
  const { dir, mk, shelf } = setup();
  const a = mk('a.txt');
  const b = mk('b.png');
  assert.equal(shelf.addPaths([a, b, a]).added, 2);
  assert.deepEqual(shelf.list().map((i) => i.name), ['b.png', 'a.txt']);
  assert.equal(shelf.addPaths([a]).added, 0); // ya estaba
  const folder = shelf.addPaths([dir]);
  assert.equal(shelf.list()[0].kind, 'folder');
  assert.equal(folder.added, 1);
  // rutas inventadas, relativas o raras: se ignoran
  assert.equal(shelf.addPaths(['/no/existe/jamas.txt', 'relativa.txt', 'a\0b', 42, null]).added, 0);
  assert.equal(shelf.addPaths('no es lista').added, 0);
});

test('bandeja: tope de 10 con aviso de "llena"; textos con límite', () => {
  const { mk, shelf } = setup();
  const files = Array.from({ length: 12 }, (_, i) => mk(`f${i}.txt`));
  const r = shelf.addPaths(files);
  assert.equal(shelf.list().length, 10);
  assert.equal(r.full, true);
  assert.equal(shelf.addText('hola').full, true);
  const t = setup();
  assert.equal(t.shelf.addText('  \n  ').added, 0);
  assert.equal(t.shelf.addText('Línea uno\nlínea dos').added, 1);
  assert.equal(t.shelf.list()[0].name, 'Línea uno');
  assert.equal(t.shelf.addText('Línea uno\nlínea dos').added, 0);
  t.shelf.addText('x'.repeat(5000));
  assert.equal(t.shelf.list()[0].text.length, 2000); // un texto enorme se recorta
});

test('bandeja: quitar, descartar archivos que ya no existen y vaciar al arrancar salvo "mantener"', () => {
  const s = setup();
  const a = s.mk('a.txt');
  s.shelf.addPaths([a]);
  s.shelf.addText('nota');
  fs.unlinkSync(a);
  assert.deepEqual(s.shelf.prune().map((i) => i.kind), ['text']); // el archivo borrado se va, el texto se queda
  const id = s.shelf.list()[0].id;
  assert.equal(s.shelf.remove(id).length, 0);
  const keep = setup(true);
  keep.shelf.addText('queda');
  assert.equal(keep.shelf.prune({ startup: true }).length, 1); // con "mantener elementos"
  const drop = setup(false);
  drop.shelf.addText('se va');
  assert.equal(drop.shelf.prune({ startup: true }).length, 0);
});

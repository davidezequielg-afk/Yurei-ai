const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/store');
const { createTools } = require('../src/tools');
const L = require('../src/launcher');
const vm = require('vm');

// brandicons.js es un script de navegador: se carga en un contexto aislado
const ctx = {};
vm.runInNewContext(`${fs.readFileSync(path.join(__dirname, '..', 'renderer', 'brandicons.js'), 'utf8')}\nthis.BRAND_ICONS = BRAND_ICONS;`, ctx);
const BRANDS = ctx.BRAND_ICONS;

const installed = [
  { name: 'Discord', file: 'C:\\Start\\Discord.lnk' },
  { name: 'Google Chrome', file: 'C:\\Start\\Google Chrome.lnk' },
  { name: 'Chrome Remote Desktop', file: 'C:\\Start\\Chrome Remote Desktop.lnk' },
  { name: 'Calculadora', file: 'C:\\Start\\Calculadora.lnk' }
];

test('sugeridas: abre la app si está instalada y la web si no', () => {
  const byName = (n) => L.SUGGESTIONS.find((s) => s.name === n);
  assert.deepEqual(L.resolveSuggestion(byName('Discord'), installed), { kind: 'app', name: 'Discord', target: 'C:\\Start\\Discord.lnk', brand: 'discord' });
  assert.deepEqual(L.resolveSuggestion(byName('Chrome'), installed), { kind: 'app', name: 'Google Chrome', target: 'C:\\Start\\Google Chrome.lnk', brand: 'googlechrome' }); // no "Chrome Remote Desktop"
  assert.deepEqual(L.resolveSuggestion(byName('WhatsApp'), installed), { kind: 'url', name: 'WhatsApp', target: 'https://web.whatsapp.com/', brand: 'whatsapp' });
  assert.deepEqual(L.resolveSuggestion(byName('Instagram'), []), { kind: 'url', name: 'Instagram', target: 'https://www.instagram.com/', brand: 'instagram' });
  assert.ok(['WhatsApp', 'Instagram', 'Chrome', 'Discord'].every((n) => byName(n)));
});

test('nombres con acentos, mayúsculas o texto de más se resuelven', () => {
  assert.equal(L.resolveByName('CALCULADORA', installed).name, 'Calculadora');
  assert.equal(L.resolveByName('calculadóra', installed).name, 'Calculadora');
  assert.equal(L.resolveByName('insta', installed).name, 'Instagram'); // el comienzo del nombre
  assert.equal(L.resolveByName('x', installed).name, 'X');
  assert.equal(L.resolveByName('texto con x suelta', installed)?.name, 'X'); // una palabra entera sí cuenta
  assert.equal(L.resolveByName('exacto', installed), null); // pero una x dentro de otra palabra no
  assert.equal(L.resolveByName('mi discord', installed).kind, 'app');
  assert.equal(L.resolveByName('instagram', installed).kind, 'url');
  assert.equal(L.resolveByName('app inexistente', installed), null);
  assert.deepEqual(L.searchApps('chrome', installed).map((a) => a.name), ['Google Chrome', 'Chrome Remote Desktop']);
  assert.equal(L.searchApps('', installed).length, 4);
});

test('los 4 lugares: se rellenan, se vacían y se validan', () => {
  assert.deepEqual(L.normalizeLauncher(undefined), [null, null, null, null]);
  assert.deepEqual(L.normalizeLauncher([{ kind: 'url', name: 'X', target: 'javascript:alert(1)' }, { kind: 'cmd', name: 'Y', target: 'calc' }, { kind: 'app', name: '', target: 'a' }]), [null, null, null, null]);
  let list = L.setSlot(undefined, 1, { kind: 'url', name: 'YouTube', target: 'https://www.youtube.com' });
  assert.equal(L.firstFree(list), 0);
  list = L.setSlot(list, 0, { kind: 'app', name: 'Discord', target: 'C:\\Start\\Discord.lnk' });
  assert.equal(L.firstFree(list), 2);
  assert.equal(L.setSlot(list, 1, null)[1], null);
  assert.throws(() => L.setSlot(list, 4, { kind: 'url', name: 'a', target: 'https://a.com' }), /1 al 4/);
  assert.throws(() => L.setSlot(list, 0, { kind: 'url', name: 'a', target: 'file:///c:/x' }), /no válida/);
  assert.equal(L.firstFree([1, 2, 3, 4].map((n) => ({ kind: 'url', name: `n${n}`, target: `https://n${n}.com` }))), -1);
});

test('solo se abren apps instaladas (no rutas arbitrarias)', () => {
  assert.equal(L.isAllowed({ kind: 'app', name: 'Discord', target: 'C:\\Start\\Discord.lnk' }, installed), true);
  assert.equal(L.isAllowed({ kind: 'app', name: 'Malo', target: 'C:\\Windows\\System32\\cmd.exe' }, installed), false);
  assert.equal(L.isAllowed({ kind: 'url', name: 'Web', target: 'https://a.com/' }, []), true);
});

test('por voz: agregar y quitar apps del widget', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yurei-')), 's.json');
  const store = createStore(file);
  const tools = createTools({ store, system: { listApps: () => installed } });
  assert.equal((await tools.execute('add_launcher_app', { name: 'WhatsApp' })).slot, 1);
  assert.equal((await tools.execute('add_launcher_app', { name: 'discord' })).app.kind, 'app');
  assert.equal((await tools.execute('add_launcher_app', { name: 'Mi blog', url: 'https://blog.example.com' })).slot, 3);
  assert.equal((await tools.execute('add_launcher_app', { name: 'Calculadora', slot: 2 })).app.name, 'Calculadora'); // reemplaza el lugar 2
  assert.equal((await tools.execute('add_launcher_app', { name: 'Instagram' })).slot, 4);
  await assert.rejects(tools.execute('add_launcher_app', { name: 'YouTube' }), /ocupados/);
  await assert.rejects(tools.execute('add_launcher_app', { name: 'zzz nada' }), /No encontré/);
  assert.equal(createStore(file).get('settings').launcher[0].name, 'WhatsApp');
  assert.equal((await tools.execute('remove_launcher_app', { name: 'instagram' })).removed.name, 'Instagram');
  assert.equal((await tools.execute('remove_launcher_app', { slot: 1 })).removed.name, 'WhatsApp');
  await assert.rejects(tools.execute('remove_launcher_app', { name: 'nada' }), /No encontré/);
  await assert.rejects(tools.execute('remove_launcher_app', {}), /No encontré/);
});

test('todas las sugeridas tienen su logo oficial incluido (y válido)', () => {
  for (const s of L.SUGGESTIONS) {
    const b = BRANDS[s.brand];
    assert.ok(b, `falta el logo de ${s.name}`);
    assert.match(b.hex, /^[0-9A-F]{6}$/i);
    assert.match(b.path, /^[Mm][\d .,\-a-zA-Z]+$/, `ruta SVG rara en ${s.name}`); // solo comandos de trazo: nada de scripts
  }
  for (const n of ['WhatsApp', 'Instagram', 'Chrome', 'Discord']) assert.ok(L.SUGGESTIONS.some((s) => s.name === n && BRANDS[s.brand]));
});

test('el logo de la marca viaja con el acceso, sea app instalada o web', () => {
  const wa = L.resolveByName('whatsapp', installed);
  assert.equal(wa.brand, 'whatsapp');
  assert.equal(L.resolveByName('discord', installed).brand, 'discord'); // app instalada, con su logo de respaldo
  assert.equal(L.sanitizeItem({ kind: 'url', name: 'Mi blog', target: 'https://blog.example.com' }).brand, undefined);
  assert.equal(L.sanitizeItem({ kind: 'url', name: 'X', target: 'https://x.com', brand: '<script>' }).brand, undefined); // slug inválido: se descarta
  assert.equal(L.sanitizeItem({ kind: 'url', name: 'X', target: 'https://x.com', brand: 'x' }).brand, 'x');
});

test('hay 179 sugeridas, sin repetidos y con direcciones válidas', () => {
  const S = L.SUGGESTIONS;
  assert.equal(S.length, 179);
  assert.equal(new Set(S.map((x) => x.name)).size, 179);
  assert.equal(new Set(S.map((x) => x.brand)).size, 179);
  for (const x of S) {
    assert.ok(x.category && x.name && x.brand, `datos incompletos en ${x.name}`);
    assert.equal(new URL(x.url).protocol, 'https:', `${x.name} debe abrirse por https`);
  }
  assert.equal(new Set(S.map((x) => x.category)).size, 18);
  // cada una se puede guardar en un lugar del widget
  for (const x of S) assert.ok(L.sanitizeItem(L.resolveSuggestion(x, [])), `no se puede guardar ${x.name}`);
});

test('los nombres cortos de las apps instaladas no confunden a otras', () => {
  const apps = [{ name: 'Online Banking Helper', file: 'a' }, { name: 'Linea de comandos', file: 'b' }, { name: 'Steamless Tool', file: 'c' }];
  const S = L.SUGGESTIONS;
  assert.equal(L.resolveSuggestion(S.find((x) => x.name === 'LINE'), apps).kind, 'url'); // "line" no coincide con "Online…"
  assert.equal(L.resolveSuggestion(S.find((x) => x.name === 'X'), apps).kind, 'url');
});

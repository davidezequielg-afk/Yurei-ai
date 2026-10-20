const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/store');
const { createTools } = require('../src/tools');
const L = require('../src/launcher');

const installed = [
  { name: 'Discord', file: 'C:\\Start\\Discord.lnk' },
  { name: 'Google Chrome', file: 'C:\\Start\\Google Chrome.lnk' },
  { name: 'Chrome Remote Desktop', file: 'C:\\Start\\Chrome Remote Desktop.lnk' },
  { name: 'Calculadora', file: 'C:\\Start\\Calculadora.lnk' }
];

test('sugeridas: abre la app si está instalada y la web si no', () => {
  const byName = (n) => L.SUGGESTIONS.find((s) => s.name === n);
  assert.deepEqual(L.resolveSuggestion(byName('Discord'), installed), { kind: 'app', name: 'Discord', target: 'C:\\Start\\Discord.lnk' });
  assert.deepEqual(L.resolveSuggestion(byName('Chrome'), installed), { kind: 'app', name: 'Google Chrome', target: 'C:\\Start\\Google Chrome.lnk' }); // no "Chrome Remote Desktop"
  assert.deepEqual(L.resolveSuggestion(byName('WhatsApp'), installed), { kind: 'url', name: 'WhatsApp', target: 'https://web.whatsapp.com/' });
  assert.deepEqual(L.resolveSuggestion(byName('Instagram'), []), { kind: 'url', name: 'Instagram', target: 'https://www.instagram.com/' });
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

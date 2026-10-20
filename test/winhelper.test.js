const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('child_process');
const { createHelper } = require('../src/winhelper');

const fake = () => createHelper({ spawn, command: process.execPath, args: [path.join(__dirname, '..', 'fixtures', 'helper-fake.js')], timeoutMs: 800 });

test('el ayudante responde, conserva el estado y atiende peticiones en paralelo', async () => {
  const h = fake();
  try {
    assert.deepEqual(await h.request('vol.get'), { volume: 40, muted: false });
    const [a, b] = await Promise.all([h.request('vol.set', 75), h.request('echo', 'hola')]);
    assert.equal(a.volume, 75);
    assert.deepEqual(b, { arg: 'hola' });
    assert.equal((await h.request('vol.get')).volume, 75); // mismo proceso: se compila una sola vez
  } finally { h.stop(); }
});

test('los errores del ayudante llegan como errores y el ruido en stdout se ignora', async () => {
  const h = fake();
  try {
    await assert.rejects(h.request('fail'), /No hay reproductor/);
    assert.deepEqual(await h.request('echo', 'a|b\nc'), { arg: 'a b c' }); // el separador no rompe el protocolo
    await h.request('noise');
    assert.equal((await h.request('vol.get')).volume, 40);
  } finally { h.stop(); }
});

test('si el proceso muere o se cuelga, se rechaza y el siguiente pedido arranca uno nuevo', async () => {
  const h = fake();
  try {
    await h.request('vol.set', 90);
    await assert.rejects(h.request('die'), /se detuvo/);
    assert.equal((await h.request('vol.get')).volume, 40); // proceso nuevo: estado inicial
    await assert.rejects(h.request('hang'), /no respondió a tiempo/);
    assert.equal((await h.request('vol.get')).volume, 40); // se reinició tras el cuelgue, sin perder la petición siguiente
  } finally { h.stop(); }
});

test('si el ejecutable no existe, el error llega y no tumba nada', async () => {
  const h = createHelper({ spawn, command: 'no-existe-yurei', timeoutMs: 500 });
  await assert.rejects(h.request('vol.get'));
  h.stop();
});

test('si el ayudante se cae, el error explica por qué (lo que escribió en stderr)', async () => {
  const h = fake();
  try {
    await assert.rejects(h.request('crash'), /se detuvo: Excepción al establecer OutputEncoding: El identificador no es válido/);
    assert.equal((await h.request('vol.get')).volume, 40); // y el siguiente pedido arranca uno nuevo
  } finally { h.stop(); }
});

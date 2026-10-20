const test = require('node:test');
const assert = require('node:assert/strict');
const { nudges } = require('../src/nudges');

const setup = (settings = {}, start = new Date(2026, 9, 20, 9, 0)) => {
  const ctx = { idle: 0, cpu: 10, t: start, data: {}, got: [], s: { breakEvery: 60, reactions: true, morningBrief: true, apiKey: 'k', ...settings } };
  ctx.n = nudges({ settings: () => ctx.s, get: (k) => ctx.data[k], set: (k, v) => { ctx.data[k] = v; }, idleSeconds: () => ctx.idle, cpu: () => ctx.cpu, onNudge: (x) => ctx.got.push(x), now: () => ctx.t });
  return ctx;
};

test('pausa activa tras 60 minutos de uso; alejarse 5 minutos cuenta como pausa', () => {
  const c = setup();
  for (let i = 0; i < 59; i++) c.n.minute();
  assert.equal(c.got.length, 0);
  c.idle = 400; c.n.minute(); // se fue un rato
  c.idle = 0;
  for (let i = 0; i < 59; i++) c.n.minute();
  assert.equal(c.got.length, 0);
  c.n.minute();
  assert.deepEqual(c.got[0], { kind: 'break', minutes: 60 });
  const off = setup({ breakEvery: 0 });
  for (let i = 0; i < 200; i++) off.n.minute();
  assert.equal(off.got.length, 0);
  const dnd = setup({ dnd: true });
  for (let i = 0; i < 60; i++) dnd.n.minute();
  assert.equal(dnd.got.length, 0);
});

test('CPU al máximo 15 s seguidos: una reacción, y no otra hasta 10 minutos después', () => {
  const c = setup();
  c.cpu = 97;
  c.n.cpuTick(); c.n.cpuTick();
  assert.equal(c.got.length, 0);
  c.n.cpuTick();
  assert.equal(c.got[0].kind, 'cpu');
  for (let i = 0; i < 10; i++) c.n.cpuTick();
  assert.equal(c.got.length, 1);
  c.t = new Date(c.t.getTime() + 11 * 60 * 1000);
  c.n.cpuTick();
  assert.equal(c.got.length, 2);
});

test('resumen de la mañana: una vez por día, solo de 5 a 12 h y si está activado', () => {
  const c = setup();
  c.n.maybeBrief(); c.n.maybeBrief();
  assert.equal(c.got.filter((x) => x.kind === 'brief').length, 1);
  c.t = new Date(2026, 9, 21, 14, 0); c.n.maybeBrief(); // a la tarde no
  c.t = new Date(2026, 9, 21, 7, 30); c.n.maybeBrief();
  assert.equal(c.got.filter((x) => x.kind === 'brief').length, 2);
  const off = setup({ morningBrief: false });
  off.n.maybeBrief();
  assert.equal(off.got.length, 0);
});

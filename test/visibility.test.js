const test = require('node:test');
const assert = require('node:assert');
const { createVisibility } = require('../src/visibility');

const B = { x: 0, y: 0, width: 1920, height: 1080 };
const rig = (settings, covers = false) => {
  let t = 1000;
  let fg = covers;
  const v = createVisibility({ settings: () => settings, fgCovers: () => fg, now: () => t });
  return { v, adv: (ms) => { t += ms; }, cover: (x) => { fg = x; } };
};

test('fixed: nunca se esconde', () => {
  const r = rig({ notchMode: 'fixed' }, true);
  assert.strictEqual(r.v.tick({ x: 500, y: 500 }, B, false), false);
});

test('smart: se esconde solo con una ventana maximizada', () => {
  const r = rig({ notchMode: 'smart' }, false);
  assert.strictEqual(r.v.tick({ x: 500, y: 500 }, B, false), false);
  r.cover(true);
  assert.strictEqual(r.v.tick({ x: 500, y: 500 }, B, false), true);
});

test('peek: se esconde, aparece tras el retardo en el borde y se queda un rato', () => {
  const r = rig({ notchMode: 'peek', notchEdgeDelay: 200 });
  assert.strictEqual(r.v.tick({ x: 960, y: 0 }, B, false), true); // recién llegó: aún no
  r.adv(250);
  assert.strictEqual(r.v.tick({ x: 960, y: 0 }, B, false), false);
  r.adv(300);
  assert.strictEqual(r.v.tick({ x: 960, y: 400 }, B, false), false); // se aleja pero aún se queda
  r.adv(1000);
  assert.strictEqual(r.v.tick({ x: 960, y: 400 }, B, false), true);
});

test('el borde fuera de la zona de la isla no la muestra; encima de la isla sí', () => {
  const r = rig({ notchMode: 'peek', notchEdgeDelay: 0 });
  r.adv(100);
  assert.strictEqual(r.v.tick({ x: 100, y: 0 }, B, false), true);
  assert.strictEqual(r.v.tick({ x: 100, y: 400 }, B, true), false);
});

const test = require('node:test');
const assert = require('node:assert');
const { createEdges } = require('../src/edges');

function rig(over = {}) {
  let t = 1000;
  const log = [];
  const levels = { volume: { level: 40, muted: false }, brightness: { level: 70 } };
  const hudState = { busy: false, inside: false };
  const e = createEdges({
    settings: () => ({ volumeHud: true, volumeEdge: true, brightnessHud: true, brightnessEdge: true, ...over.settings }),
    screenOf: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
    hasBrightness: () => over.brightness !== false,
    readLevel: async (k) => levels[k],
    now: () => t,
    hud: {
      show: (k, r) => log.push(['show', k, r.level]), update: (k, r) => log.push(['update', k, r.level]), hide: (k) => log.push(['hide', k]),
      busy: () => hudState.busy, contains: () => hudState.inside, interactive: () => {}
    }
  });
  return { e, log, levels, hudState, advance: (ms) => { t += ms; }, flush: () => new Promise((r) => setImmediate(r)) };
}

test('tocar el borde izquierdo muestra el volumen y se esconde al alejarse', async () => {
  const r = rig();
  r.e.tick({ x: 0, y: 540 });
  await r.flush();
  assert.deepStrictEqual(r.log[0], ['show', 'volume', 40]);
  r.e.tick({ x: 500, y: 540 });
  r.advance(1000); r.e.tick({ x: 500, y: 540 });
  assert.ok(!r.log.some((l) => l[0] === 'hide'));
  r.advance(1000); r.e.tick({ x: 500, y: 540 });
  assert.deepStrictEqual(r.log.at(-1), ['hide', 'volume']);
});

test('el borde derecho es el brillo y solo en notebooks', async () => {
  const a = rig();
  a.e.tick({ x: 1919, y: 540 }); await a.flush();
  assert.deepStrictEqual(a.log[0], ['show', 'brightness', 70]);
  const pc = rig({ brightness: false });
  pc.e.tick({ x: 1919, y: 540 }); await pc.flush();
  assert.strictEqual(pc.log.length, 0);
});

test('fuera de la franja central o con el ajuste apagado no aparece', async () => {
  const r = rig({ settings: { volumeEdge: false } });
  r.e.tick({ x: 0, y: 540 }); await r.flush();
  assert.strictEqual(r.log.length, 0);
  const s = rig();
  s.e.tick({ x: 0, y: 10 }); await s.flush();
  assert.strictEqual(s.log.length, 0);
});

test('un cambio externo del volumen lo muestra y no se esconde mientras se arrastra', async () => {
  const r = rig();
  await r.e.poll();                       // primera lectura: solo recuerda
  assert.strictEqual(r.log.length, 0);
  r.levels.volume = { level: 55, muted: false };
  await r.e.poll();
  assert.deepStrictEqual(r.log[0], ['show', 'volume', 55]);
  r.hudState.busy = true;
  r.advance(5000); r.e.tick({ x: 800, y: 500 });
  assert.ok(!r.log.some((l) => l[0] === 'hide'));
});

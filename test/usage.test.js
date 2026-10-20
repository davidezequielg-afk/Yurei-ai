const test = require('node:test');
const assert = require('node:assert/strict');
const { createUsage } = require('../src/usage');

test('cuenta los pedidos del día y empieza de cero al día siguiente', async () => {
  let saved = null;
  const clock = { d: new Date(2026, 9, 20, 10) };
  const u = createUsage({ save: (x) => { saved = { ...x }; }, now: () => clock.d });
  await u.track('ask', async () => 'ok');
  await u.track('ask', async () => 'ok');
  await u.track('voice', async () => 'ok');
  assert.deepEqual([u.get().ask, u.get().voice], [2, 1]);
  assert.equal(saved.ask, 2);
  clock.d = new Date(2026, 9, 21, 8);
  assert.equal(u.get().ask, 0);
  assert.equal(u.get().day, '2026-10-21');
});

test('al llegar al límite (429) lo anota y da un mensaje claro; otros errores pasan igual', async () => {
  const u = createUsage({ now: () => new Date(2026, 9, 20, 15, 30) });
  await assert.rejects(u.track('ask', async () => { throw new Error('Gemini 429: RESOURCE_EXHAUSTED'); }), /límite gratis/);
  assert.ok(u.get().limitedAt);
  await assert.rejects(u.track('ask', async () => { throw new Error('Gemini 500: boom'); }), /500/);
  await assert.rejects(u.track('otro', async () => 1), /desconocido/);
});

test('recupera lo guardado si es del mismo día', () => {
  const u = createUsage({ load: () => ({ day: '2026-10-20', ask: 7, voice: 3, wake: 0, dictate: 0, limitedAt: null }), now: () => new Date(2026, 9, 20, 22) });
  assert.equal(u.get().ask, 7);
});

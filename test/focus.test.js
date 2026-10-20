const test = require('node:test');
const assert = require('node:assert');
const { createFocus } = require('../src/focus');

function fakeClock() {
  const c = { t: 0, timers: [] };
  c.now = () => c.t;
  c.setTimer = (fn, ms) => { const h = { fn, at: c.t + ms }; c.timers.push(h); return h; };
  c.clearTimer = (h) => { c.timers = c.timers.filter((x) => x !== h); };
  c.advance = (ms) => { c.t += ms; for (;;) { const due = c.timers.filter((x) => x.at <= c.t); if (!due.length) break; c.timers = c.timers.filter((x) => !due.includes(x)); due.forEach((x) => x.fn()); } };
  return c;
}

test('temporizador: cuenta, avisa al terminar y se puede cancelar', () => {
  const c = fakeClock();
  const done = [];
  const f = createFocus({ ...c, onDone: (d) => done.push(d) });
  f.timer({ minutes: 2, label: 'los fideos' });
  c.advance(60000);
  assert.equal(f.get().left, 60000);
  c.advance(60000);
  assert.equal(done.length, 1);
  assert.equal(done[0].finished.label, 'los fideos');
  assert.equal(f.get(), null);
  f.timer({ minutes: 1 });
  assert.equal(f.cancel().cancelled, true);
  c.advance(120000);
  assert.equal(done.length, 1);
  assert.throws(() => f.timer({ minutes: -3 }));
});

test('pomodoro: foco → descanso → foco… y termina tras los ciclos', () => {
  const c = fakeClock();
  const seen = [];
  const f = createFocus({ ...c, onDone: ({ next }) => seen.push(next && `${next.phase}${next.cycle}`) });
  f.pomodoro({ focus: 25, rest: 5, cycles: 2 });
  c.advance(25 * 60000); // fin foco 1
  c.advance(5 * 60000); // fin descanso 1
  c.advance(25 * 60000); // fin foco 2 → descanso largo
  c.advance(15 * 60000); // fin
  assert.deepEqual(seen, ['break1', 'focus2', 'break2', null]);
  assert.equal(f.get(), null);
});

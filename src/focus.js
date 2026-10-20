// Temporizador y pomodoro (uno a la vez). El proceso principal lleva el tiempo; las ventanas solo lo dibujan.

const MAX_MIN = 24 * 60;

function createFocus({ now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, onChange = () => {}, onDone = () => {} } = {}) {
  let cur = null; // { kind, label, total, endsAt, phase, cycle, cycles, focusMin, breakMin }
  let handle = null;

  const view = () => (cur ? { ...cur, left: Math.max(0, cur.endsAt - now()) } : null);

  function arm() {
    clearTimer(handle);
    handle = null;
    if (cur) handle = setTimer(finish, Math.max(0, cur.endsAt - now()));
    onChange(view());
  }

  function phaseOf(kind, label, minutes, extra = {}) {
    const total = Math.round(minutes * 60000);
    return { kind, label, total, endsAt: now() + total, ...extra };
  }

  // Al terminar: un temporizador se acaba; el pomodoro pasa de foco a descanso y vuelve, hasta completar los ciclos.
  function finish() {
    if (!cur) return;
    const done = cur;
    if (done.kind === 'pomodoro') {
      if (done.phase === 'focus') {
        const last = done.cycle >= done.cycles;
        cur = phaseOf('pomodoro', done.label, last ? done.breakMin * 3 : done.breakMin, { ...pick(done), phase: 'break', cycle: done.cycle });
      } else if (done.cycle < done.cycles) {
        cur = phaseOf('pomodoro', done.label, done.focusMin, { ...pick(done), phase: 'focus', cycle: done.cycle + 1 });
      } else cur = null;
    } else cur = null;
    arm();
    onDone({ finished: done, next: view() });
  }

  const pick = ({ cycles, focusMin, breakMin }) => ({ cycles, focusMin, breakMin });
  const minutes = (v, def, max = MAX_MIN) => {
    const n = Number(v ?? def);
    if (!Number.isFinite(n) || n <= 0) throw new Error('Duración no válida');
    return Math.min(max, n);
  };

  return {
    timer({ minutes: m, label = 'Temporizador' }) {
      cur = phaseOf('timer', String(label).slice(0, 60), minutes(m));
      arm();
      return view();
    },
    pomodoro({ focus = 25, rest = 5, cycles = 4, label = 'Pomodoro' } = {}) {
      const f = minutes(focus, 25, 180);
      cur = phaseOf('pomodoro', String(label).slice(0, 60), f, { phase: 'focus', cycle: 1, cycles: Math.max(1, Math.min(12, Math.round(Number(cycles) || 4))), focusMin: f, breakMin: minutes(rest, 5, 60) });
      arm();
      return view();
    },
    cancel() {
      const had = !!cur;
      cur = null;
      arm();
      return { cancelled: had };
    },
    get: view
  };
}

module.exports = { createFocus };

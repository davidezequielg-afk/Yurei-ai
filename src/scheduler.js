// Ejecuta tareas programadas y rutinas sin supervisión. Llama a tick() periódicamente.

const CATCH_UP_MINUTES = 120;

function createScheduler({ store, tools, report, now = () => new Date() }) {
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  async function run(label, actions) {
    const results = [];
    for (const { tool, args } of actions) {
      try {
        await tools.execute(tool, args);
        results.push(`${tool}: ok`);
      } catch (e) {
        results.push(`${tool}: error (${e.message})`);
      }
    }
    report({ label, results });
  }

  async function tick() {
    const t = now();
    const ran = [];

    for (const task of store.get('tasks')) {
      if (!task.done && new Date(task.at) <= t) {
        task.done = true;
        store.save();
        await run(task.label, [task.action]);
        ran.push(task.label);
      }
    }

    for (const routine of store.get('routines')) {
      if (!routine.days.includes(t.getDay()) || routine.lastRun === dayKey(t)) continue;
      const [h, m] = routine.time.split(':').map(Number);
      const due = new Date(t);
      due.setHours(h, m, 0, 0);
      const lateMin = (t - due) / 60000;
      if (lateMin >= 0 && lateMin <= CATCH_UP_MINUTES) {
        routine.lastRun = dayKey(t);
        store.save();
        await run(routine.label, routine.actions);
        ran.push(routine.label);
      }
    }
    return ran;
  }

  let timer = null;
  return {
    tick,
    start(ms = 30000) { tick(); timer = setInterval(tick, ms); },
    stop() { clearInterval(timer); }
  };
}

module.exports = { createScheduler };

// Recordatorios hablados ("recuérdame en 20 minutos sacar la ropa"). Se guardan en disco y sobreviven a reinicios;
// si la PC estaba apagada a la hora, se avisa al volver (hasta 12 horas tarde; más viejos se descartan).

const LATE_MAX_MS = 12 * 3600 * 1000;
const MAX = 50;

function createReminders({ store, now = () => new Date(), onDue = () => {} }) {
  const list = () => store.get('reminders') || [];
  const put = (l) => store.set('reminders', l);

  return {
    add({ text, at }) {
      const msg = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!msg) throw new Error('Falta qué recordar');
      const when = at instanceof Date ? at : new Date(at);
      if (Number.isNaN(when.getTime())) throw new Error('Fecha no válida');
      if (when <= now()) throw new Error('Esa hora ya pasó');
      const pending = list().filter((r) => !r.done);
      if (pending.length >= MAX) throw new Error(`Ya hay ${MAX} recordatorios pendientes`);
      const item = { id: store.nextId('reminders'), text: msg, at: when.toISOString(), done: false };
      put([...pending, item]);
      return item;
    },
    list: () => list().filter((r) => !r.done).sort((a, b) => a.at.localeCompare(b.at)),
    cancel(ref) {
      const r = String(ref).trim().toLowerCase();
      const pending = list().filter((x) => !x.done);
      const hit = pending.find((x) => String(x.id) === r) || pending.find((x) => x.text.toLowerCase().includes(r));
      if (!hit) throw new Error('No encontré ese recordatorio');
      put(pending.filter((x) => x !== hit));
      return hit;
    },
    // Llamar cada pocos segundos: avisa los que vencieron y los saca de la lista.
    tick() {
      const t = now();
      const due = [];
      const keep = [];
      for (const r of list()) {
        if (r.done) continue;
        const late = t - new Date(r.at);
        if (late < 0) keep.push(r);
        else if (late <= LATE_MAX_MS) due.push({ ...r, lateMin: Math.round(late / 60000) });
      }
      if (due.length || keep.length !== list().length) put(keep);
      due.forEach((r) => onDue(r));
      return due;
    }
  };
}

// "en 20 minutos" o "a las 18:30" → Date. Acepta minutos relativos o una fecha/hora local.
function whenFrom({ inMinutes, at }, now = new Date()) {
  if (inMinutes !== undefined && inMinutes !== null && inMinutes !== '') {
    const m = Number(inMinutes);
    if (!Number.isFinite(m) || m <= 0 || m > 60 * 24 * 60) throw new Error('Minutos no válidos');
    return new Date(now.getTime() + m * 60000);
  }
  if (at) {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) throw new Error('Fecha no válida, usa YYYY-MM-DDTHH:mm');
    return d;
  }
  throw new Error('Dime cuándo: en cuántos minutos o a qué hora');
}

module.exports = { createReminders, whenFrom };

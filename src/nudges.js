// Avisos amables que no pide nadie: pausas activas, CPU al máximo y el resumen de la mañana.
// (Las reacciones al cargador y a la batería baja las maneja la ventana, solo en notebooks.)

const dayOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function nudges({ settings, get, set, idleSeconds, cpu, onNudge, now = () => new Date() }) {
  let active = 0; // minutos seguidos usando la PC
  let hot = 0; // lecturas seguidas con la CPU al máximo
  let lastCpu = 0;

  return {
    // Cada minuto: si estás usando la PC suma; si te alejaste 5 minutos, ya hiciste una pausa.
    minute() {
      const idle = idleSeconds();
      if (idle >= 300) { active = 0; return; }
      if (idle < 120) active++;
      const s = settings();
      if (s.breakEvery > 0 && active >= s.breakEvery) {
        active = 0;
        if (!s.dnd) onNudge({ kind: 'break', minutes: s.breakEvery });
      }
    },
    // Cada 5 s: CPU ≥ 90 % durante 15 s seguidos → la carita se sorprende (como mucho cada 10 minutos).
    cpuTick() {
      const c = cpu();
      hot = c >= 90 ? hot + 1 : 0;
      const s = settings();
      if (hot >= 3 && s.reactions !== false && now() - lastCpu > 10 * 60 * 1000) {
        lastCpu = now().getTime();
        onNudge({ kind: 'cpu', cpu: c });
      }
    },
    // Al abrir o desbloquear la PC por la mañana (5 a 12 h), una vez por día, si está activado.
    maybeBrief() {
      const s = settings();
      if (!s.morningBrief || !s.apiKey || s.dnd) return;
      const t = now();
      if (t.getHours() < 5 || t.getHours() >= 12) return;
      if (get('lastBrief') === dayOf(t)) return;
      set('lastBrief', dayOf(t));
      onNudge({ kind: 'brief' });
    },
    get activeMinutes() { return active; }
  };
}

module.exports = { nudges };

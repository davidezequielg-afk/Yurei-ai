// Indicadores de volumen (borde izquierdo) y brillo (borde derecho): aparecen al acercar el mouse al borde de la
// pantalla o cuando el nivel cambia por otro medio (teclas del teclado), y se esconden solos.
// Toda la lógica de ventanas va por inyección para poder probarla sin Electron.

const EDGE_PX = 6;          // distancia al borde que cuenta como "tocar el borde"
const BAND = 0.5;           // franja vertical central de la pantalla donde se activa
const HIDE_CHANGE_MS = 2000;
const HIDE_LEAVE_MS = 1500;
const HIDE_MIXER_MS = 700;
const POLL_MS = 1500;

function createEdges({ settings, screenOf, hud, readLevel, hasBrightness, now = Date.now }) {
  const state = {
    volume: { shown: false, last: null, hideAt: 0, atEdge: false },
    brightness: { shown: false, last: null, hideAt: 0, atEdge: false }
  };
  let mixerOpen = false;
  let polling = false;

  const enabled = (kind, how) => {
    const s = settings();
    if (kind === 'brightness' && !hasBrightness()) return false;
    return s[`${kind}${how}`] !== false;
  };

  function show(kind, level, ms) {
    const st = state[kind];
    st.hideAt = now() + ms;
    if (!st.shown) { st.shown = true; hud.show(kind, level); } else hud.update(kind, level);
  }

  function hide(kind) {
    const st = state[kind];
    if (!st.shown) return;
    st.shown = false;
    hud.hide(kind);
  }

  async function poll() {
    if (polling) return;
    polling = true;
    try {
      for (const kind of ['volume', 'brightness']) {
        if (!enabled(kind, 'Hud')) continue;
        const r = await readLevel(kind).catch(() => null);
        if (!r || !Number.isFinite(r.level)) continue;
        const key = `${r.level}|${r.muted ? 1 : 0}`;
        const st = state[kind];
        if (st.last !== null && st.last !== key && !hud.busy(kind)) show(kind, r);
        else if (st.shown) hud.update(kind, r);
        st.last = key;
      }
    } finally { polling = false; }
  }

  return {
    state,
    poll,
    pollMs: POLL_MS,
    setMixerOpen(v) { mixerOpen = !!v; },
    // Llamado cada 50 ms con la posición del cursor.
    tick(cursor) {
      const t = now();
      const d = screenOf(cursor);
      if (!d) return;
      const b = d.bounds;
      const inBand = cursor.y >= b.y + b.height * (1 - BAND) / 2 && cursor.y <= b.y + b.height * (1 + BAND) / 2;
      const at = { volume: cursor.x <= b.x + EDGE_PX && inBand, brightness: cursor.x >= b.x + b.width - EDGE_PX - 1 && inBand };
      for (const kind of ['volume', 'brightness']) {
        const st = state[kind];
        const over = st.shown && hud.contains(kind, cursor);
        if (at[kind] && enabled(kind, 'Edge') && !st.atEdge) {
          readLevel(kind).then((r) => { if (r && Number.isFinite(r.level)) { st.last = `${r.level}|${r.muted ? 1 : 0}`; show(kind, r, 60 * 1000); } }).catch(() => {});
        }
        // Mientras el mouse esté en el borde o sobre el indicador, no se esconde.
        if (at[kind] || over) st.hideAt = Math.max(st.hideAt, t + (mixerOpen && kind === 'volume' ? HIDE_MIXER_MS : HIDE_LEAVE_MS));
        else if (st.atEdge && st.shown && st.hideAt > t + HIDE_LEAVE_MS) st.hideAt = t + HIDE_LEAVE_MS;
        st.atEdge = at[kind];
        hud.interactive(kind, over);
        if (st.shown && t >= st.hideAt && !hud.busy(kind)) hide(kind);
      }
    },
    flash: (kind, level) => show(kind, level, HIDE_CHANGE_MS),
    hide
  };
}

module.exports = { createEdges, EDGE_PX, HIDE_CHANGE_MS, HIDE_LEAVE_MS };

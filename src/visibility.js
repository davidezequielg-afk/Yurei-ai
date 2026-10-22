// Cuándo la isla se esconde. fixed: siempre visible. smart: se esconde mientras una ventana está maximizada o a pantalla
// completa. peek: se esconde siempre, hasta que el mouse toca el borde superior. En ambos, tocar el borde superior (tras
// el retardo elegido) la muestra, y se queda mientras el mouse está encima. El proceso de la ventana decide además si está
// ocupada (hablando, avisando…): en ese caso no se esconde.

const REVEAL_ZONE = 260; // ancho (px) alrededor del centro que cuenta como "el borde donde vive la isla"
const LINGER_MS = 900;   // cuánto se queda visible después de que el mouse se aleja

function createVisibility({ settings, fgCovers, now = Date.now }) {
  let tucked = false;
  let atTopSince = 0;
  let shownUntil = 0;
  return {
    get tucked() { return tucked; },
    // cursor, display.bounds y hot (mouse sobre la isla) → ¿escondida? Devuelve el estado nuevo.
    tick(cursor, bounds, hot) {
      const s = settings();
      const mode = s.notchMode || 'fixed';
      const t = now();
      const cx = bounds.x + bounds.width / 2;
      const atTop = cursor.y <= bounds.y + 2 && Math.abs(cursor.x - cx) <= REVEAL_ZONE / 2;
      if (atTop) { if (!atTopSince) atTopSince = t; } else atTopSince = 0;
      if (hot || (atTopSince && t - atTopSince >= (s.notchEdgeDelay ?? 200))) shownUntil = t + LINGER_MS;
      let want = false;
      if (mode === 'peek') want = true;
      else if (mode === 'smart') want = !!fgCovers();
      if (t < shownUntil) want = false;
      tucked = want;
      return tucked;
    }
  };
}

module.exports = { createVisibility, REVEAL_ZONE, LINGER_MS };

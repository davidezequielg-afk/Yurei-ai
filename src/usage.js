// Cuántos pedidos se hicieron hoy a Gemini (Google no informa la cuota restante, así que se cuentan aquí)
// y si hoy se llegó al límite gratis (error 429).

const KINDS = ['ask', 'voice', 'wake', 'dictate'];
const dayOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isLimit = (err) => /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(String(err?.message || err));

function createUsage({ load = () => null, save = () => {}, now = () => new Date() } = {}) {
  let u = load();
  const today = () => {
    const day = dayOf(now());
    if (!u || u.day !== day) u = { day, ask: 0, voice: 0, wake: 0, dictate: 0, limitedAt: null };
    return u;
  };

  return {
    // Envuelve un pedido: lo cuenta y, si Google dice que se acabó la cuota, lo anota y da un mensaje claro.
    async track(kind, fn) {
      if (!KINDS.includes(kind)) throw new Error(`Tipo de uso desconocido: ${kind}`);
      const t = today();
      t[kind] += 1;
      save(t);
      try {
        return await fn();
      } catch (e) {
        if (isLimit(e)) {
          today().limitedAt = now().toISOString();
          save(u);
          throw new Error('Llegaste al límite gratis de Gemini por ahora. Se renueva solo: prueba en un rato.');
        }
        throw e;
      }
    },
    get: () => ({ ...today() })
  };
}

module.exports = { createUsage, isLimit };

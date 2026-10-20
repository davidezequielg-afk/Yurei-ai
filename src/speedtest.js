// Velocidad de internet con el servidor de pruebas de Cloudflare. Solo cuando lo pides; no se envía nada tuyo.

const BASE = 'https://speed.cloudflare.com/__down?bytes=';

async function speedTest({ fetchImpl = fetch, clock = () => performance.now(), bytes = 15_000_000, pings = 5 } = {}) {
  // Latencia: varias descargas vacías; se toma la mediana.
  const times = [];
  for (let i = 0; i < pings; i++) {
    const t0 = clock();
    const r = await fetchImpl(`${BASE}0`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    await r.arrayBuffer();
    times.push(clock() - t0);
  }
  times.sort((a, b) => a - b);
  const ping = Math.round(times[Math.floor(times.length / 2)]);

  // Bajada: un archivo de prueba; se mide desde el primer byte para no contar la latencia.
  const res = await fetchImpl(`${BASE}${bytes}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`El servidor de prueba respondió ${res.status}`);
  let got = 0;
  let start = null;
  for await (const chunk of res.body) {
    if (start === null) start = clock();
    got += chunk.length;
  }
  const secs = Math.max(0.001, (clock() - start) / 1000);
  const mbps = +((got * 8) / secs / 1e6).toFixed(1);
  return { downloadMbps: mbps, pingMs: ping, quality: mbps >= 50 ? 'muy buena' : mbps >= 15 ? 'buena' : mbps >= 5 ? 'regular' : 'lenta' };
}

module.exports = { speedTest };

// Proceso falso que habla el protocolo del ayudante de Windows (para probar el cliente sin Windows).
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
let volume = 40;
rl.on('line', (line) => {
  const [id, cmd, arg = ''] = line.split('|');
  const out = (o) => process.stdout.write(`${JSON.stringify({ id, ...o })}\n`);
  if (cmd === 'hang') return; // no responde nunca
  if (cmd === 'die') process.exit(1);
  if (cmd === 'noise') process.stdout.write('esto no es JSON\n');
  if (cmd === 'vol.get') return out({ ok: true, data: { volume, muted: false } });
  if (cmd === 'vol.set') { volume = Number(arg); return out({ ok: true, data: { volume, muted: false } }); }
  if (cmd === 'echo') return out({ ok: true, data: { arg } });
  if (cmd === 'fail') return out({ ok: false, error: 'No hay reproductor' });
  return out({ ok: true, data: null });
});

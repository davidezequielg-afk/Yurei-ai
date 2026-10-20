const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTtsCache } = require('../src/ttscache');

test('la caché genera una vez y reutiliza (también entre arranques)', async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yurei-')), 'cache');
  let calls = 0;
  const synth = async () => { calls++; return 'QVVESU8='; };
  const cache = createTtsCache(dir);
  assert.equal(await cache.getOrCreate('m|Kore|Un segundo', synth), 'QVVESU8=');
  assert.equal(await cache.getOrCreate('m|Kore|Un segundo', synth), 'QVVESU8=');
  assert.equal(calls, 1);
  assert.equal(await createTtsCache(dir).getOrCreate('m|Kore|Un segundo', synth), 'QVVESU8='); // otro arranque
  assert.equal(calls, 1);
  await cache.getOrCreate('m|Puck|Un segundo', synth); // otra voz: otra entrada
  assert.equal(calls, 2);
  await assert.rejects(cache.getOrCreate('x', async () => { throw new Error('sin red'); }), /sin red/);
});

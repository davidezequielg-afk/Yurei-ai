const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createUpdater, newer } = require('../src/updater');

const EXE = Buffer.from('MZ instalador de prueba');
const SHA = crypto.createHash('sha256').update(EXE).digest('hex');
const DL = 'https://github.com/davidezequielg-afk/Yurei-ai/releases/download/v1.1.0/Yurei-Setup-1.1.0.exe';

function fakeFetch({ release, exe = EXE, finalUrl, sums }) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    if (url.includes('/releases/latest')) return { ok: true, url, json: async () => release };
    if (url.endsWith('SHA256SUMS.txt')) return { ok: true, url, text: async () => sums };
    return { ok: true, url: finalUrl || 'https://objects.githubusercontent.com/x', headers: { get: () => String(exe.length) }, body: (async function* () { yield exe.subarray(0, 5); yield exe.subarray(5); })() };
  };
  fn.calls = calls;
  return fn;
}
const rel = (assets, extra = {}) => ({ tag_name: 'v1.1.0', body: 'Novedades', assets, ...extra });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'yu-'));

test('compara versiones', () => {
  assert.equal(newer('1.1.0', '1.0.0'), true);
  assert.equal(newer('1.0.10', '1.0.9'), true);
  assert.equal(newer('v1.0.0', '1.0.0'), false);
  assert.equal(newer('0.9.9', '1.0.0'), false);
});

test('encuentra la versión nueva, la baja, verifica la huella y la abre', async () => {
  const dir = tmp();
  const spawned = [];
  const u = createUpdater({ current: '1.0.0', dir, fetchImpl: fakeFetch({ release: rel([{ name: 'Yurei-Setup-1.1.0.exe', browser_download_url: DL, size: EXE.length, digest: `sha256:${SHA}` }]) }), spawnImpl: (f, a) => { spawned.push([f, a]); return { unref() {} }; } });
  const c = await u.check();
  assert.equal(c.available, true);
  assert.equal(c.version, '1.1.0');
  const progress = [];
  const file = await u.download((p) => progress.push(p));
  assert.deepEqual(fs.readFileSync(file), EXE);
  assert.equal(progress.at(-1), 1);
  u.install(file);
  assert.equal(spawned[0][0], file);
  assert.throws(() => u.install(path.join(os.tmpdir(), 'otro.exe')), /no válido/);
});

test('sin digest usa SHA256SUMS.txt del mismo release', async () => {
  const sums = `${SHA}  Yurei-Setup-1.1.0.exe\n`;
  const u = createUpdater({ current: '1.0.0', dir: tmp(), fetchImpl: fakeFetch({ sums, release: rel([{ name: 'Yurei-Setup-1.1.0.exe', browser_download_url: DL, size: EXE.length }, { name: 'SHA256SUMS.txt', browser_download_url: 'https://github.com/davidezequielg-afk/Yurei-ai/releases/download/v1.1.0/SHA256SUMS.txt' }]) }) });
  assert.equal((await u.check()).available, true);
  assert.ok(await u.download());
});

test('no instala si la descarga no coincide, si sale de GitHub o si no hay huella', async () => {
  const asset = { name: 'Yurei-Setup-1.1.0.exe', browser_download_url: DL, size: EXE.length, digest: `sha256:${SHA}` };
  const bad = createUpdater({ current: '1.0.0', dir: tmp(), fetchImpl: fakeFetch({ release: rel([asset]), exe: Buffer.from('MZ manipulado!!!!!!!!!!') }) });
  await bad.check();
  await assert.rejects(bad.download(), /no coincide/);

  const away = createUpdater({ current: '1.0.0', dir: tmp(), fetchImpl: fakeFetch({ release: rel([asset]), finalUrl: 'https://evil.example/x.exe' }) });
  await away.check();
  await assert.rejects(away.download(), /fuera de GitHub/);

  const noHash = createUpdater({ current: '1.0.0', dir: tmp(), fetchImpl: fakeFetch({ release: rel([{ ...asset, digest: undefined }]) }) });
  await assert.rejects(noHash.check(), /huella/);

  const offsite = createUpdater({ current: '1.0.0', dir: tmp(), fetchImpl: fakeFetch({ release: rel([{ ...asset, browser_download_url: 'https://evil.example/Yurei-Setup-1.1.0.exe' }]) }) });
  await assert.rejects(offsite.check(), /no está en GitHub/);
});

test('misma versión, borrador o prerelease: nada que instalar', async () => {
  const asset = { name: 'Yurei-Setup-1.0.0.exe', browser_download_url: DL, digest: `sha256:${SHA}` };
  assert.equal((await createUpdater({ current: '1.0.0', dir: tmp(), fetchImpl: fakeFetch({ release: rel([asset]) }) }).check()).available, false);
  const pre = { ...asset, name: 'Yurei-Setup-2.0.0.exe' };
  assert.equal((await createUpdater({ current: '1.0.0', dir: tmp(), fetchImpl: fakeFetch({ release: rel([pre], { prerelease: true }) }) }).check()).available, false);
});

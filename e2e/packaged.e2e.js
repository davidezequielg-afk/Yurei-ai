// Pruebas de ataque contra el instalador ya empaquetado (conecta por CDP porque el fusible bloquea --inspect).
// Uso: EXEC=dist/win-unpacked/Yurei.exe node e2e/packaged.e2e.js   (requiere: npm i --no-save playwright)
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');
const { spawn } = require('child_process');
const EXEC = process.env.EXEC;
const DATA = fs.mkdtempSync(path.join(require('os').tmpdir(), 'yurei-pk-'));
let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`); if (!ok) fails++; };
const portOpen = (port) => new Promise((r) => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const hits = [];
  const server = http.createServer((req, res) => { hits.push(req.url); res.end('x'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const EVIL = `http://127.0.0.1:${server.address().port}`;

  // depurador de Node: debe estar muerto en el paquete
  const probe = spawn(EXEC, ['--no-sandbox', '--disable-gpu', '--inspect=9445', `--user-data-dir=${DATA}-a`], { stdio: 'ignore', env: { ...process.env, DISPLAY: process.env.DISPLAY } });
  await sleep(4000);
  check('el depurador de Node (--inspect) no se puede activar en el paquete', (await portOpen(9445)) === false);
  probe.kill();
  await sleep(500);

  const child = spawn(EXEC, ['--no-sandbox', '--disable-gpu', '--use-fake-device-for-media-stream', '--remote-debugging-port=9333', `--user-data-dir=${DATA}`], { stdio: 'ignore' });
  let browser;
  for (let i = 0; i < 40 && !browser; i++) { await sleep(500); try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); } catch { /* aún arrancando */ } }
  if (!browser) throw new Error('no se pudo conectar a la app empaquetada');
  await sleep(2500);
  const pages = browser.contexts()[0].pages();
  const win = pages.find((p) => p.url().includes('index.html'));
  check('la app empaquetada carga sus páginas desde app.asar', !!win && win.url().includes('app.asar'), win?.url().slice(-45));
  check('se abre también la ventana de ajustes (no hay API key)', pages.some((p) => p.url().includes('settings.html')));
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));

  const iso = await win.evaluate(() => ({ req: typeof require, proc: typeof process, api: Object.keys(window.yurei).length, overlay: typeof window.yureiOverlay }));
  check('sin Node en la ventana; el puente funciona desde dentro del paquete', iso.req === 'undefined' && iso.proc === 'undefined' && iso.api === 20 && iso.overlay === 'undefined', JSON.stringify(iso));
  const ipc = await win.evaluate(async () => (await window.yurei.getSettings()));
  check('el puente IPC responde a la página de la app (la ruta dentro de app.asar se reconoce como de confianza)', ipc.ok === true, JSON.stringify(ipc).slice(0, 60));

  const perms = await win.evaluate(async () => {
    const m = async (c) => { try { (await navigator.mediaDevices.getUserMedia(c)).getTracks().forEach((t) => t.stop()); return 'permitido'; } catch (e) { return e.name; } };
    return { mic: await m({ audio: true }), cam: await m({ video: true }), notif: await Notification.requestPermission(), geo: await new Promise((r) => navigator.geolocation.getCurrentPosition(() => r('permitido'), () => r('denegado'), { timeout: 3000 })) };
  });
  check('permisos en el paquete: micrófono sí; cámara, ubicación y notificaciones no', perms.mic === 'permitido' && perms.cam !== 'permitido' && perms.geo === 'denegado' && perms.notif !== 'granted', JSON.stringify(perms));

  const net1 = await win.evaluate(async (u) => { try { await fetch(u, { mode: 'no-cors' }); return 'salió'; } catch { return 'bloqueado'; } }, EVIL);
  await win.evaluate((u) => { window.location.href = u; }, EVIL);
  await sleep(1000);
  const pop = await win.evaluate((u) => (window.open(u) === null ? 'denegado' : 'abierto'), EVIL).catch(() => 'denegado');
  await sleep(500);
  check('sin red y sin navegación externa en el paquete (el servidor enemigo recibe 0 peticiones)', net1 === 'bloqueado' && hits.length === 0 && win.url().startsWith('file:') && pop === 'denegado', `fetch=${net1} peticiones=${hits.length} popup=${pop}`);

  const bad = await win.evaluate(async () => {
    const y = window.yurei;
    return [await y.ask({ text: 5 }), await y.ask({ audioB64: 'no es base64!!' }), await y.saveSettings({ model: '../x' }), await y.saveSettings({ theme: 'rojo' }), await y.launcherOpen(null), await y.pickerOpen('x'), await y.widgetAction('media', { action: 'seek; calc' }), await y.setMode('__proto__'), await y.widgetData('../x')];
  });
  check('9 entradas malformadas rechazadas en el paquete', bad.every((r) => r.ok === false), String(bad.filter((r) => r.ok !== false).length) + ' aceptadas');
  const key = await win.evaluate(async () => { await window.yurei.saveSettings({ apiKey: 'AIzaSyD-clave-de-prueba-123456789' }); return JSON.stringify((await window.yurei.getSettings()).data); });
  check('la clave no vuelve a la ventana', !key.includes('clave-de-prueba') && key.includes('••••••••'));
  check('sin errores de página', errors.length === 0, JSON.stringify(errors));

  console.log(`\n${fails === 0 ? 'TODO CORRECTO' : fails + ' FALLO(S)'}`);
  await browser.close().catch(() => {});
  child.kill();
  server.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR DE LA PRUEBA', e.message.slice(0, 400)); process.exit(2); });

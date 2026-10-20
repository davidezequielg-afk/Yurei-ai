// Pruebas de ataque contra la app REAL en ejecución (Electron). Uso: npm i --no-save playwright && node e2e/security.e2e.js
// En Linux sin pantalla: xvfb-run -a node e2e/security.e2e.js   (como root añade --no-sandbox; ya se pasa abajo)
// Variables: ELECTRON=ruta al binario de Electron (si no está instalado) · EXEC=ruta a Yurei ya empaquetado.
const { _electron } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');
const APP = path.join(__dirname, '..');
const EL = process.env.EXEC || process.env.ELECTRON || require('electron'); // EXEC = app empaquetada · ELECTRON = binario de Electron para el código fuente
const APPARG = process.env.EXEC ? [] : [APP]; // con EXEC se prueba el paquete ya compilado
const DATA = fs.mkdtempSync(path.join(require('os').tmpdir(), 'yurei-e2e-'));
let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`); if (!ok) fails++; };

(async () => {
  // servidor "enemigo": cuenta cualquier petición que reciba
  const hits = [];
  const server = http.createServer((req, res) => { hits.push(req.url); res.end('x'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const EVIL = `http://127.0.0.1:${server.address().port}`;

  const args = ['--no-sandbox', '--disable-gpu', '--use-fake-device-for-media-stream', `--user-data-dir=${DATA}`, ...APPARG];
  const app = await _electron.launch({ executablePath: EL, args, timeout: 60000 });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await win.waitForLoadState('load');
  await win.waitForTimeout(2000);

  // ---- 1. aislamiento ----
  const iso = await win.evaluate(() => ({ req: typeof require, proc: typeof process, mod: typeof module, overlayApi: typeof window.yureiOverlay, api: Object.keys(window.yurei).length }));
  check('la ventana no tiene Node (require/process/module) ni el puente del recuadro', iso.req === 'undefined' && iso.proc === 'undefined' && iso.mod === 'undefined' && iso.overlayApi === 'undefined', JSON.stringify(iso));
  check('sin errores en la consola de la página (CSP, scripts…)', errors.length === 0, JSON.stringify(errors));
  check('se abrieron las ventanas esperadas (isla + ajustes por no haber clave)', app.windows().length === 2, String(app.windows().length));

  // ---- 2. una página AJENA con el puente no puede usarlo ----
  await app.evaluate(async ({ BrowserWindow }, { preload }) => {
    globalThis.rogue = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, sandbox: true } });
    await globalThis.rogue.loadURL('data:text/html,<h1>pagina ajena</h1>');
  }, { preload: process.env.PRELOAD || `${APP}/preload.js` });
  const rogue = app.windows().find((w) => w.url().startsWith('data:'));
  const stolen = await rogue.evaluate(async () => ({ settings: await window.yurei.getSettings(), save: await window.yurei.saveSettings({ apiKey: 'AIzaROBADA-1234567890' }), ask: await window.yurei.ask({ text: 'hola' }), open: await window.yurei.launcherOpen(0), wipe: await window.yurei.wipeData() }));
  check('una página que no es de la app NO puede usar el puente IPC', Object.values(stolen).every((r) => r.ok === false && r.error === 'No autorizado'), JSON.stringify(stolen).slice(0, 140));

  // ---- 3. permisos ----
  const perms = await win.evaluate(async () => {
    const out = {};
    const tryMedia = async (c) => { try { (await navigator.mediaDevices.getUserMedia(c)).getTracks().forEach((t) => t.stop()); return 'permitido'; } catch (e) { return e.name; } };
    out.mic = await tryMedia({ audio: true });
    out.cam = await tryMedia({ video: true });
    out.geo = await new Promise((r) => navigator.geolocation.getCurrentPosition(() => r('permitido'), (e) => r(`denegado(${e.code})`), { timeout: 3000 }));
    out.notif = await Notification.requestPermission();
    return out;
  });
  check('micrófono: permitido solo para la app', perms.mic === 'permitido', perms.mic);
  check('cámara denegada', perms.cam !== 'permitido', perms.cam);
  check('ubicación denegada', perms.geo.startsWith('denegado'), perms.geo);
  check('notificaciones del navegador denegadas', perms.notif !== 'granted', perms.notif);
  // página ajena desde un archivo local FUERA de la app (sí tiene API de micrófono): la regla la debe denegar
  const ROGUE = path.join(DATA, 'rogue-page.html');
  fs.writeFileSync(ROGUE, '<h1>ajena</h1>');
  await app.evaluate(async ({ BrowserWindow }, file) => { globalThis.rogue2 = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } }); await globalThis.rogue2.loadFile(file); }, ROGUE);
  const rogue2 = app.windows().find((w) => w.url().includes('rogue-page'));
  const roguePerm = await rogue2.evaluate(async () => { if (!navigator.mediaDevices) return 'sin API'; try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); return 'permitido'; } catch (e) { return e.name; } });
  check('una página ajena (archivo local fuera de la app) NO obtiene el micrófono', roguePerm === 'NotAllowedError', roguePerm);

  // ---- 4. red: las ventanas no hacen peticiones ----
  const netTrusted = await win.evaluate(async (url) => { try { await fetch(url, { mode: 'no-cors' }); return 'salió'; } catch { return 'bloqueado'; } }, EVIL);
  const netRogue = await rogue.evaluate(async (url) => { try { await fetch(url, { mode: 'no-cors' }); return 'salió'; } catch { return 'bloqueado'; } }, EVIL);
  await win.evaluate((u) => { const i = new Image(); i.src = `${u}/pixel.png`; document.body.append(i); }, EVIL);
  await win.waitForTimeout(700);
  check('la ventana de la app no puede hacer peticiones de red (CSP + bloqueo)', netTrusted === 'bloqueado', netTrusted);
  check('ni siquiera una página ajena (sin CSP) puede: lo corta el bloqueo de la sesión', netRogue === 'bloqueado', netRogue);
  check('el servidor enemigo recibió 0 peticiones', hits.length === 0, JSON.stringify(hits));

  // ---- 5. navegación ----
  await win.evaluate((u) => { window.location.href = u; }, EVIL);
  await win.waitForTimeout(800);
  const pop = await win.evaluate((u) => { const w = window.open(u); return w === null ? 'denegado' : 'abierto'; }, EVIL);
  await win.waitForTimeout(500);
  check('la ventana no puede navegar a un sitio externo ni abrir ventanas nuevas', win.url().startsWith('file:') && pop === 'denegado' && hits.length === 0, `${win.url().slice(0, 30)} · ${pop} · peticiones=${hits.length}`);

  // ---- 6. entradas malformadas por IPC real ----
  const bad = await win.evaluate(async () => {
    const y = window.yurei;
    return {
      ask1: await y.ask({ text: 5 }), ask2: await y.ask({ audioB64: 'no es base64!!' }), ask3: await y.ask(null), ask4: await y.ask({ audioB64: 'A'.repeat(13 * 1024 * 1024) }),
      model: await y.saveSettings({ model: '../../etc/passwd' }), key: await y.saveSettings({ apiKey: '<script>alert(1)</script>' }), theme: await y.saveSettings({ theme: 'rojo' }),
      color: await y.saveSettings({ customBg: 'red;background:url(//evil)' }), slot: await y.launcherOpen(null), slot2: await y.launcherClear(9), picker: await y.pickerOpen('x'),
      media: await y.widgetAction('media', { action: 'seek; calc' }), mode: await y.setMode('__proto__'), widget: await y.widgetData('../../x'), tts: await y.tts('x'.repeat(200), { cache: true })
    };
  });
  const allRejected = Object.entries(bad).filter(([, r]) => r.ok !== false).map(([k]) => k);
  check('15 entradas maliciosas o malformadas por el puente real: todas rechazadas', allRejected.length === 0, allRejected.join(',') || Object.keys(bad).length + ' rechazadas');

  const mass = await win.evaluate(async () => {
    const r = await window.yurei.saveSettings({ soul: 'Prueba', launcher: [{ kind: 'url', name: 'Evil', target: 'https://evil.example' }], tasks: [{ id: 1 }], __proto__: { polluted: true }, widgetCatalog: [], keyEncrypted: true });
    return { ok: r.ok, soul: r.data?.soul, launcher: r.data?.launcher, polluted: ({}).polluted };
  });
  check('asignación masiva: lo que no está en la lista blanca (launcher, tareas…) se descarta', mass.ok && mass.soul === 'Prueba' && mass.launcher.every((x) => x === null) && mass.polluted === undefined, JSON.stringify(mass));

  // ---- 7. la clave no vuelve a la ventana ----
  const keyRes = await win.evaluate(async () => { await window.yurei.saveSettings({ apiKey: 'AIzaSyD-clave-de-prueba-123456789' }); const v = (await window.yurei.getSettings()).data; return { apiKey: v.apiKey, enc: v.keyEncrypted, text: JSON.stringify(v) }; });
  check('la API key nunca se devuelve a la ventana (solo una máscara)', keyRes.apiKey === '••••••••' && !keyRes.text.includes('clave-de-prueba'), `apiKey=${keyRes.apiKey} · cifrada=${keyRes.enc}`);
  const disk = fs.readFileSync(`${DATA}/yurei.json`, 'utf8');
  console.log(`INFO  almacén seguro del sistema disponible en este equipo de pruebas: ${keyRes.enc} (en Windows usa DPAPI; el cifrado se prueba con tests unitarios) · clave en claro en disco: ${disk.includes('clave-de-prueba')}`);

  // ---- 8. herramientas de desarrollo ----
  const dev = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('index.html')); w.webContents.openDevTools(); return w.webContents.isDevToolsOpened(); });
  check('las herramientas de desarrollo no se pueden abrir', dev === false, String(dev));

  // ---- 9. una sola instancia ----
  const t0 = Date.now();
  const second = spawn(EL, ['--no-sandbox', '--disable-gpu', `--user-data-dir=${DATA}`, ...APPARG], { stdio: 'ignore' });
  const code = await new Promise((r) => { second.on('exit', (c) => r(c)); setTimeout(() => { second.kill(); r('colgada'); }, 15000); });
  check('abrir la app por segunda vez no crea otra instancia', code === 0 && Date.now() - t0 < 14000, `salió con ${code} en ${Date.now() - t0} ms`);

  console.log(`\n${fails === 0 ? 'TODO CORRECTO' : fails + ' FALLO(S)'}`);
  await app.close();
  server.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR DE LA PRUEBA', e.message.slice(0, 500)); process.exit(2); });

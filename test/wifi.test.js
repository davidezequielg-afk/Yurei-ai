const test = require('node:test');
const assert = require('node:assert/strict');
const { createWifi, parseInterfaces, parseNetworks, parseProfiles, profileXml, validSsid, validPassword } = require('../src/wifi');

const NETS_EN = `
Interface name : Wi-Fi
There are 3 networks currently visible.

SSID 1 : HomeNet
    Network type            : Infrastructure
    Authentication          : WPA2-Personal
    Encryption              : CCMP
    BSSID 1                 : aa:bb:cc:dd:ee:ff
         Signal             : 92%
         Radio type         : 802.11ac
    BSSID 2                 : aa:bb:cc:dd:ee:01
         Signal             : 40%

SSID 2 : Café Libre
    Network type            : Infrastructure
    Authentication          : Open
    Encryption              : None
    BSSID 1                 : 11:22:33:44:55:66
         Signal             : 61%

SSID 3 : Oficina
    Network type            : Infrastructure
    Authentication          : WPA2-Enterprise
    Encryption              : CCMP
    BSSID 1                 : 77:88:99:aa:bb:cc
         Signal             : 30%
`;
const NETS_ES = `
SSID 1 : Casa
    Tipo de red             : Infraestructura
    Autenticación           : WPA3-Personal
    Cifrado                 : CCMP
    BSSID 1                 : aa:bb:cc:dd:ee:ff
         Señal              : 80%
SSID 2 : Bar
    Tipo de red             : Infraestructura
    Autenticación           : Abierta
    Cifrado                 : Ninguno
    BSSID 1                 : 11:22:33:44:55:66
         Señal              : 55%
`;

test('lista de redes: señal, seguridad y tipo, en inglés y en español', () => {
  const en = parseNetworks(NETS_EN);
  assert.deepEqual(en.map((n) => [n.ssid, n.signal, n.secured, n.enterprise]), [['HomeNet', 92, true, false], ['Café Libre', 61, false, false], ['Oficina', 30, true, true]]);
  const es = parseNetworks(NETS_ES);
  assert.deepEqual(es.map((n) => [n.ssid, n.secured, n.wpa3]), [['Casa', true, true], ['Bar', false, false]]);
});

test('red actual y perfiles guardados (varios idiomas)', () => {
  assert.deepEqual(parseInterfaces('    Name : Wi-Fi\n    State : connected\n    SSID : HomeNet\n    BSSID : aa:bb\n'), { present: true, connected: true, ssid: 'HomeNet' });
  assert.equal(parseInterfaces('    Name : Wi-Fi\n    State : disconnected\n').connected, false);
  assert.deepEqual(parseProfiles('Profiles on interface Wi-Fi:\n\nGroup policy profiles (read only)\n    <None>\n\nUser profiles\n    All User Profile     : HomeNet\n    All User Profile     : Café Libre\n'), ['HomeNet', 'Café Libre']);
  assert.deepEqual(parseProfiles('    Perfil de todos los usuarios     : Casa\n'), ['Casa']);
});

test('perfil de conexión: se escapan los caracteres especiales y se valida lo que entra', () => {
  const xml = profileXml({ ssid: 'A&B <x>', password: 'p"ss&<>word1' });
  assert.match(xml, /<name>A&amp;B &lt;x&gt;<\/name>/);
  assert.match(xml, /<keyMaterial>p&quot;ss&amp;&lt;&gt;word1<\/keyMaterial>/);
  assert.match(xml, /WPA2PSK/);
  assert.match(profileXml({ ssid: 'x', password: 'password1', wpa3: true }), /WPA3SAE/);
  assert.match(profileXml({ ssid: 'Abierta' }), /<authentication>open<\/authentication>/);
  assert.doesNotMatch(profileXml({ ssid: 'Abierta' }), /sharedKey/);
  assert.throws(() => validSsid(''), /no válido/);
  assert.throws(() => validSsid('x'.repeat(40)), /no válido/);
  assert.throws(() => validSsid('a\nb'), /no válido/);
  assert.throws(() => validPassword('corta'), /entre 8 y 63/);
  assert.equal(validPassword('12345678'), '12345678');
});

test('conectar: crea el perfil solo si no existe, sin dejar la clave en disco, con argumentos separados', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const calls = [];
  const files = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yw-'));
  const exec = (cmd, args, _o, cb) => {
    calls.push(args);
    if (args[0] === 'wlan' && args[1] === 'add') { const f = args.find((a) => a.startsWith('filename=')).slice(9); files.push(f); assert.match(fs.readFileSync(f, 'utf8'), /keyMaterial>secreta123</); }
    cb(null, args[1] === 'show' ? '    All User Profile     : Guardada\n' : 'ok', '');
  };
  const wifi = createWifi({ exec, tmp, platform: 'win32' });
  await wifi.connect({ ssid: 'Nueva "red"', password: 'secreta123' });
  assert.equal(calls.some((a) => a[1] === 'add'), true);
  assert.deepEqual(calls.at(-1), ['wlan', 'connect', 'name=Nueva "red"', 'ssid=Nueva "red"']); // un solo argumento: no hay inyección
  assert.equal(fs.existsSync(files[0]), false); // el archivo con la clave se borró
  calls.length = 0;
  await wifi.connect({ ssid: 'Guardada' });
  assert.equal(calls.some((a) => a[1] === 'add'), false); // ya tenía perfil: no se pide ni se escribe clave
  await assert.rejects(wifi.connect({ ssid: 'Otra', password: '' }), /entre 8 y 63/);
  await assert.rejects(createWifi({ platform: 'linux' }).status(), /solo se maneja en Windows/);
});

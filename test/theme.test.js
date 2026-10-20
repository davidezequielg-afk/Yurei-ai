const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAppearance, parseSystemAccent, mix, luminance } = require('../src/theme');

test('oscuro y claro usan su paleta y son opacos por defecto', () => {
  const dark = resolveAppearance({ theme: 'dark' });
  assert.equal(dark.mode, 'dark');
  assert.equal(dark.vars['--bg'], 'rgba(0, 0, 0, 1)');
  assert.equal(dark.vars['--ink'], '#ececec');
  const light = resolveAppearance({ theme: 'light' });
  assert.equal(light.mode, 'light');
  assert.equal(light.vars['--bg-solid'], '#f4f4f6');
  assert.equal(light.vars['--ink'], '#1c1c1e');
});

test('"como el sistema" sigue el tema claro/oscuro y el color de acento de Windows', () => {
  assert.equal(resolveAppearance({ theme: 'system' }, { dark: false }).mode, 'light');
  assert.equal(resolveAppearance({ theme: 'system' }, { dark: true }).mode, 'dark');
  assert.equal(resolveAppearance({ theme: 'system' }, {}).mode, 'dark'); // sin datos: oscuro
  assert.equal(resolveAppearance({ theme: 'system' }, { dark: true, accent: 'ff8800ff' }).vars['--accent'], '#ff8800');
  assert.equal(resolveAppearance({ theme: 'system' }, { dark: true, accent: 'basura' }).vars['--accent'], '#6cb8f0');
  assert.equal(parseSystemAccent('#0A84FFcc'), '#0a84ff');
  assert.equal(parseSystemAccent(null), null);
  // el acento del sistema solo aplica al tema "sistema"
  assert.equal(resolveAppearance({ theme: 'dark' }, { accent: 'ff8800ff' }).vars['--accent'], '#6cb8f0');
});

test('personalizado: usa los colores elegidos y elige texto claro u oscuro según el fondo', () => {
  const purple = resolveAppearance({ theme: 'custom', customBg: '#2a1b4d', customAccent: '#ff5fa2' });
  assert.equal(purple.mode, 'dark');
  assert.equal(purple.vars['--bg-solid'], '#2a1b4d');
  assert.equal(purple.vars['--accent'], '#ff5fa2');
  assert.equal(purple.vars['--ink'], '#ececec');
  const cream = resolveAppearance({ theme: 'custom', customBg: '#fff4d6' });
  assert.equal(cream.mode, 'light');
  assert.equal(cream.vars['--ink'], '#1c1c1e');
  // colores inválidos no rompen nada
  assert.equal(resolveAppearance({ theme: 'custom', customBg: 'rojo; background:url(x)', customAccent: '<x>' }).vars['--bg-solid'], '#101114');
  assert.equal(resolveAppearance({ theme: 'nope' }).mode, 'dark');
});

test('transparencia: sí, no o como el sistema, con opacidad limitada', () => {
  assert.equal(resolveAppearance({ theme: 'dark', transparency: 'off' }, { transparency: true }).translucent, false);
  assert.equal(resolveAppearance({ theme: 'dark', transparency: 'on', opacity: 60 }).vars['--bg'], 'rgba(0, 0, 0, 0.6)');
  assert.equal(resolveAppearance({ theme: 'dark', transparency: 'system' }, { transparency: true }).translucent, true);
  assert.equal(resolveAppearance({ theme: 'dark', transparency: 'system' }, { transparency: false }).translucent, false);
  assert.equal(resolveAppearance({ theme: 'dark', transparency: 'system' }, {}).translucent, false); // desconocido: opaco
  assert.equal(resolveAppearance({ transparency: 'on', opacity: 5 }).vars['--bg'], 'rgba(0, 0, 0, 0.3)'); // mínimo 30 %
  assert.equal(resolveAppearance({ transparency: 'on', opacity: 500 }).vars['--bg'], 'rgba(0, 0, 0, 1)');
});

test('los grises derivados se mezclan entre el texto y el fondo', () => {
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.ok(luminance('#ffffff') > 0.99 && luminance('#000000') === 0);
  const v = resolveAppearance({ theme: 'dark' }).vars;
  assert.ok(luminance(v['--ink2']) > luminance(v['--mute']) && luminance(v['--mute']) > luminance(v['--faint']) && luminance(v['--faint']) > luminance(v['--line']));
});

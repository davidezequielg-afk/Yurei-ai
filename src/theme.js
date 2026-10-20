// Apariencia: tema (sistema/claro/oscuro/personalizado) y transparencia → variables CSS para las ventanas.

const HEX = /^#[0-9a-f]{6}$/i;
const THEMES = ['system', 'light', 'dark', 'custom'];
const TRANSPARENCY = ['system', 'on', 'off'];

const PALETTE = {
  dark: { bg: '#000000', ink: '#ececec', accent: '#6cb8f0' },
  light: { bg: '#f4f4f6', ink: '#1c1c1e', accent: '#0a7ad9' }
};

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => toHex(toRgb(a).map((v, i) => v * (1 - t) + toRgb(b)[i] * t)); // t=0 → a, t=1 → b
const luminance = (hex) => {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const rgba = (hex, a) => `rgba(${toRgb(hex).join(', ')}, ${a})`;
const color = (value, fallback) => (HEX.test(String(value)) ? String(value).toLowerCase() : fallback);

// Windows da el acento como RRGGBBAA (sin #).
function parseSystemAccent(raw) {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(raw || ''));
  return m ? `#${m[1].toLowerCase()}` : null;
}

function resolveAppearance(settings = {}, system = {}) {
  const theme = THEMES.includes(settings.theme) ? settings.theme : 'dark';
  let mode;
  let bg;
  let accent;
  if (theme === 'custom') {
    bg = color(settings.customBg, '#101114');
    accent = color(settings.customAccent, PALETTE.dark.accent);
    mode = luminance(bg) > 0.4 ? 'light' : 'dark';
  } else {
    mode = theme === 'system' ? (system.dark === false ? 'light' : 'dark') : theme;
    bg = PALETTE[mode].bg;
    accent = (theme === 'system' && parseSystemAccent(system.accent)) || PALETTE[mode].accent;
  }
  const ink = PALETTE[mode].ink;
  const transparency = TRANSPARENCY.includes(settings.transparency) ? settings.transparency : 'off';
  const translucent = transparency === 'on' || (transparency === 'system' && system.transparency === true);
  const opacity = Math.max(30, Math.min(100, Math.round(Number(settings.opacity) || 78)));
  const alpha = translucent ? opacity / 100 : 1;
  return {
    mode,
    translucent,
    vars: {
      '--bg': rgba(bg, alpha),
      '--bg-solid': bg,
      '--ink': ink,
      '--ink2': mix(ink, bg, 0.25),
      '--mute': mix(ink, bg, 0.55),
      '--faint': mix(ink, bg, 0.75),
      '--line': mix(ink, bg, 0.9),
      '--track': mix(ink, bg, 0.88),
      '--accent': accent
    }
  };
}

module.exports = { THEMES, TRANSPARENCY, HEX, resolveAppearance, parseSystemAccent, mix, luminance };

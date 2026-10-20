// Fuente única de las apps sugeridas. Genera src/suggestions.js (datos) y renderer/brandicons.js (logos de Simple Icons, CC0).
// Uso: npm i --no-save simple-icons && node scripts/build-suggestions.js
// Cada fila: [nombre, título en Simple Icons, dirección web, nombres de la app instalada en el menú Inicio]
const fs = require('fs');
const path = require('path');
const si = require('simple-icons');

const TABLE = {
  'Mensajería y llamadas': [
    ['WhatsApp', 'WhatsApp', 'https://web.whatsapp.com', ['whatsapp']],
    ['Telegram', 'Telegram', 'https://web.telegram.org', ['telegram']],
    ['Discord', 'Discord', 'https://discord.com/app', ['discord']],
    ['Messenger', 'Messenger', 'https://www.messenger.com', ['messenger']],
    ['Signal', 'Signal', 'https://signal.org', ['signal']],
    ['Zoom', 'Zoom', 'https://zoom.us', ['zoom']],
    ['Google Meet', 'Google Meet', 'https://meet.google.com', []],
    ['Viber', 'Viber', 'https://www.viber.com', ['viber']],
    ['LINE', 'LINE', 'https://line.me', []],
    ['WeChat', 'WeChat', 'https://www.wechat.com', ['wechat']]
  ],
  'Redes sociales': [
    ['Instagram', 'Instagram', 'https://www.instagram.com', ['instagram']],
    ['Facebook', 'Facebook', 'https://www.facebook.com', ['facebook']],
    ['X', 'X', 'https://x.com', []],
    ['TikTok', 'TikTok', 'https://www.tiktok.com', ['tiktok']],
    ['Snapchat', 'Snapchat', 'https://www.snapchat.com', []],
    ['Reddit', 'Reddit', 'https://www.reddit.com', []],
    ['Pinterest', 'Pinterest', 'https://www.pinterest.com', []],
    ['Threads', 'Threads', 'https://www.threads.net', []],
    ['Tumblr', 'Tumblr', 'https://www.tumblr.com', []],
    ['Bluesky', 'Bluesky', 'https://bsky.app', []]
  ],
  'Navegadores': [
    ['Chrome', 'Google Chrome', 'https://www.google.com/chrome', ['google chrome', 'chrome']],
    ['Firefox', 'Firefox', 'https://www.mozilla.org/firefox', ['firefox']],
    ['Opera', 'Opera', 'https://www.opera.com', ['opera']],
    ['Brave', 'Brave', 'https://brave.com', ['brave']],
    ['Safari', 'Safari', 'https://www.apple.com/safari', []],
    ['Vivaldi', 'Vivaldi', 'https://vivaldi.com', ['vivaldi']],
    ['DuckDuckGo', 'DuckDuckGo', 'https://duckduckgo.com', ['duckduckgo']]
  ],
  'Música y audio': [
    ['Spotify', 'Spotify', 'https://open.spotify.com', ['spotify']],
    ['YouTube Music', 'YouTube Music', 'https://music.youtube.com', []],
    ['Apple Music', 'Apple Music', 'https://music.apple.com', ['apple music']],
    ['SoundCloud', 'SoundCloud', 'https://soundcloud.com', []],
    ['Deezer', 'Deezer', 'https://www.deezer.com', ['deezer']],
    ['Tidal', 'Tidal', 'https://tidal.com', ['tidal']],
    ['Shazam', 'Shazam', 'https://www.shazam.com', ['shazam']],
    ['Bandcamp', 'Bandcamp', 'https://bandcamp.com', []]
  ],
  'Video y streaming': [
    ['YouTube', 'YouTube', 'https://www.youtube.com', []],
    ['Netflix', 'Netflix', 'https://www.netflix.com', ['netflix']],
    ['Twitch', 'Twitch', 'https://www.twitch.tv', ['twitch']],
    ['HBO Max', 'HBO Max', 'https://www.hbomax.com', []],
    ['Crunchyroll', 'Crunchyroll', 'https://www.crunchyroll.com', ['crunchyroll']],
    ['Vimeo', 'Vimeo', 'https://vimeo.com', []],
    ['Plex', 'Plex', 'https://app.plex.tv', ['plex']],
    ['Apple TV', 'Apple TV', 'https://tv.apple.com', ['apple tv']],
    ['Kick', 'Kick', 'https://kick.com', []]
  ],
  'Productividad y nube': [
    ['Notion', 'Notion', 'https://www.notion.so', ['notion']],
    ['Gmail', 'Gmail', 'https://mail.google.com', []],
    ['Google Drive', 'Google Drive', 'https://drive.google.com', ['google drive']],
    ['Google Calendar', 'Google Calendar', 'https://calendar.google.com', []],
    ['Google Docs', 'Google Docs', 'https://docs.google.com/document', []],
    ['Google Sheets', 'Google Sheets', 'https://docs.google.com/spreadsheets', []],
    ['Google Slides', 'Google Slides', 'https://docs.google.com/presentation', []],
    ['Google Keep', 'Google Keep', 'https://keep.google.com', []],
    ['Dropbox', 'Dropbox', 'https://www.dropbox.com', ['dropbox']],
    ['Evernote', 'Evernote', 'https://evernote.com', ['evernote']],
    ['Trello', 'Trello', 'https://trello.com', []],
    ['Todoist', 'Todoist', 'https://app.todoist.com', ['todoist']]
  ],
  'Inteligencia artificial': [
    ['Claude', 'Claude', 'https://claude.ai', ['claude']],
    ['Gemini', 'Google Gemini', 'https://gemini.google.com', []],
    ['Perplexity', 'Perplexity', 'https://www.perplexity.ai', ['perplexity']],
    ['GitHub Copilot', 'GitHub Copilot', 'https://github.com/features/copilot', []],
    ['Mistral AI', 'Mistral AI', 'https://chat.mistral.ai', []]
  ],
  'Desarrollo': [
    ['GitHub', 'GitHub', 'https://github.com', ['github desktop']],
    ['GitLab', 'GitLab', 'https://gitlab.com', []],
    ['Stack Overflow', 'Stack Overflow', 'https://stackoverflow.com', []],
    ['Docker', 'Docker', 'https://www.docker.com', ['docker desktop']],
    ['Postman', 'Postman', 'https://www.postman.com', ['postman']],
    ['npm', 'npm', 'https://www.npmjs.com', []],
    ['Jira', 'Jira', 'https://www.atlassian.com/software/jira', []],
    ['Vercel', 'Vercel', 'https://vercel.com', []]
  ],
  'Juegos': [
    ['Steam', 'Steam', 'https://store.steampowered.com', ['steam']],
    ['Epic Games', 'Epic Games', 'https://store.epicgames.com', ['epic games launcher', 'epic games']],
    ['PlayStation', 'PlayStation', 'https://www.playstation.com', ['playstation']],
    ['Battle.net', 'Battle.net', 'https://battle.net', ['battle.net']],
    ['Roblox', 'Roblox', 'https://www.roblox.com', ['roblox']],
    ['Riot Games', 'Riot Games', 'https://www.riotgames.com', ['riot client', 'riot games']],
    ['EA', 'EA', 'https://www.ea.com', ['ea app', 'ea desktop']]
  ],
  'Compras': [
    ['eBay', 'eBay', 'https://www.ebay.com', []],
    ['AliExpress', 'AliExpress', 'https://www.aliexpress.com', []],
    ['Etsy', 'Etsy', 'https://www.etsy.com', []],
    ['Shopify', 'Shopify', 'https://www.shopify.com', []]
  ],
  'Finanzas y pagos': [
    ['PayPal', 'PayPal', 'https://www.paypal.com', []],
    ['Mercado Pago', 'Mercado Pago', 'https://www.mercadopago.com', []],
    ['Binance', 'Binance', 'https://www.binance.com', ['binance']],
    ['Coinbase', 'Coinbase', 'https://www.coinbase.com', []],
    ['Revolut', 'Revolut', 'https://www.revolut.com', []],
    ['Wise', 'Wise', 'https://wise.com', []]
  ],
  'Viajes, transporte y comida': [
    ['Google Maps', 'Google Maps', 'https://maps.google.com', []],
    ['Waze', 'Waze', 'https://www.waze.com/live-map', []],
    ['Uber', 'Uber', 'https://m.uber.com', []],
    ['Airbnb', 'Airbnb', 'https://www.airbnb.com', []],
    ['Booking.com', 'Booking.com', 'https://www.booking.com', []],
    ['Tripadvisor', 'Tripadvisor', 'https://www.tripadvisor.com', []],
    ['Glovo', 'Glovo', 'https://glovoapp.com', []],
    ['Deliveroo', 'Deliveroo', 'https://deliveroo.com', []]
  ],
  'Noticias y lectura': [
    ['Wikipedia', 'Wikipedia', 'https://www.wikipedia.org', []],
    ['Medium', 'Medium', 'https://medium.com', []],
    ['Quora', 'Quora', 'https://www.quora.com', []],
    ['Substack', 'Substack', 'https://substack.com', []],
    ['Google News', 'Google News', 'https://news.google.com', []],
    ['Goodreads', 'Goodreads', 'https://www.goodreads.com', []]
  ],
  'Diseño y creatividad': [
    ['Figma', 'Figma', 'https://www.figma.com', ['figma']],
    ['Behance', 'Behance', 'https://www.behance.net', []],
    ['Dribbble', 'Dribbble', 'https://dribbble.com', []],
    ['Blender', 'Blender', 'https://www.blender.org', ['blender']]
  ],
  'Aprendizaje': [
    ['Duolingo', 'Duolingo', 'https://www.duolingo.com', []],
    ['Coursera', 'Coursera', 'https://www.coursera.org', []],
    ['Udemy', 'Udemy', 'https://www.udemy.com', []],
    ['Khan Academy', 'Khan Academy', 'https://www.khanacademy.org', []]
  ],
  'Utilidades': [
    ['Google Translate', 'Google Translate', 'https://translate.google.com', []],
    ['Google Photos', 'Google Photos', 'https://photos.google.com', []],
    ['OBS Studio', 'OBS Studio', 'https://obsproject.com', ['obs studio']],
    ['VLC', 'VLC media player', 'https://www.videolan.org/vlc', ['vlc media player', 'vlc']],
    ['Bitwarden', 'Bitwarden', 'https://vault.bitwarden.com', ['bitwarden']],
    ['1Password', '1Password', 'https://1password.com', ['1password']],
    ['Proton Mail', 'Proton Mail', 'https://mail.proton.me', ['proton mail']],
    ['Proton VPN', 'Proton VPN', 'https://protonvpn.com', ['proton vpn']],
    ['LibreOffice', 'LibreOffice', 'https://www.libreoffice.org', ['libreoffice']]
  ]
};

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
const byTitle = new Map(Object.values(si).filter((i) => i && i.title).map((i) => [norm(i.title), i]));

const suggestions = [];
const brands = {};
for (const [category, rows] of Object.entries(TABLE)) {
  for (const [name, title, url, match] of rows) {
    const icon = byTitle.get(norm(title));
    if (!icon) throw new Error(`Simple Icons no tiene "${title}" (quizá lo retiraron): quítalo o cámbialo de la tabla`);
    brands[icon.slug] = { title: icon.title, hex: icon.hex, path: icon.path };
    suggestions.push({ category, name, brand: icon.slug, match, url });
  }
}

const out = (file, text) => fs.writeFileSync(path.join(__dirname, '..', file), text);
out('src/suggestions.js', `// Generado por scripts/build-suggestions.js: no editar a mano.\nmodule.exports = ${JSON.stringify(suggestions, null, 2)};\n`);
out('renderer/brandicons.js', `// Generado por scripts/build-suggestions.js con Simple Icons (CC0-1.0, https://simpleicons.org).\n// Las marcas y logos pertenecen a sus dueños y se usan solo para identificar cada app.\nconst BRAND_ICONS = ${JSON.stringify(brands)};\n`);
console.log(`${suggestions.length} sugeridas, ${Object.keys(brands).length} logos`);

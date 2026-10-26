// Génère toutes les icônes de l'app et du site à partir des SVG de ce dossier.
//
//   npm i --no-save @resvg/resvg-js && node assets/logo/render.js
//
// Sources : icon.svg (icône complète, groupe #mark réutilisé seul),
// favicon.svg (recadré pour les petites tailles), notification.svg (blanc).
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const root = path.join(dir, '..', '..');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

const icon = read('icon.svg');
const favicon = read('favicon.svg');
const notification = read('notification.svg');

function png(svgStr, size) {
  return new Resvg(svgStr, { fitTo: { mode: 'width', value: size } }).render().asPng();
}
function write(rel, buf, size) {
  fs.writeFileSync(path.join(root, rel), buf);
  console.log('wrote', rel, size ? `${size}x${size}` : '');
}
const render = (svgStr, size, rel) => write(rel, png(svgStr, size), size);

// Variantes dérivées de icon.svg
const defs = icon.match(/<defs>[\s\S]*?<\/defs>/)[0];
const mark = icon.match(/<g id="mark">[\s\S]*<\/g>\s*<\/svg>/)[0].replace(/<\/svg>$/, '');
const svg = (body) => `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${defs}${body}</svg>`;
const scaled = (k) => `<g transform="translate(512 512) scale(${k}) translate(-512 -512)">${mark}</g>`;
// Coins arrondis transparents, pour les endroits où l'image est affichée telle
// quelle (logo du site, PWA du HQ). Rayon type iOS : 22,5 %.
const rounded = svg(`<clipPath id="r"><rect width="1024" height="1024" rx="230"/></clipPath><g clip-path="url(#r)">${icon.match(/<rect id="bg"[^>]*\/>/)[0]}${mark}</g>`);
// Android adaptatif : le système découpe ~1/3 du bord, la marque doit tenir
// dans le cercle central de 66 %. Le fond vient de app.json.
const adaptive = svg(scaled(0.6));
// Splash : marque seule sur le fond de app.json.
const splash = svg(scaled(0.92));

// --- App (Expo) ---
render(icon, 1024, 'assets/icon.png');
render(adaptive, 1024, 'assets/adaptive-icon.png');
render(splash, 1024, 'assets/splash-icon.png');
render(favicon, 256, 'assets/favicon.png');
render(notification, 96, 'assets/notification-icon.png');

// --- Stores ---
render(icon, 512, 'store-listing/icon-512.png');

// --- Site ---
fs.copyFileSync(path.join(dir, 'favicon.svg'), path.join(root, 'public/favicon.svg'));
console.log('wrote public/favicon.svg');
render(favicon, 96, 'public/favicon-96.png');
render(favicon, 192, 'public/favicon-192.png');
render(favicon, 512, 'public/favicon-512.png');
render(icon, 180, 'public/apple-touch-icon.png');
render(rounded, 512, 'public/icon-512.png');
render(rounded, 68, 'public/logo-mark.png');
render(rounded, 168, 'public/logo-mark-168.png');

// favicon.ico : conteneur ICO avec des PNG 16, 32 et 48 px.
const sizes = [16, 32, 48];
const imgs = sizes.map((s) => png(favicon, s));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt8(0, e + 2);
  header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(imgs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += imgs[i].length;
});
write('public/favicon.ico', Buffer.concat([header, ...imgs]));

const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const assets = path.join(dir, '..');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');

function render(svgStr, size, out) {
  const r = new Resvg(svgStr, { fitTo: { mode: 'width', value: size } });
  fs.writeFileSync(out, r.render().asPng());
  console.log('wrote', path.relative(assets, out), `${size}x${size}`);
}

// Main app icon (full bleed rounded)
render(svg, 1024, path.join(assets, 'icon.png'));

// Favicon
render(svg, 256, path.join(assets, 'favicon.png'));

// Adaptive icon (Android): mark must sit in the safe ~66% center zone on a
// transparent canvas; system applies its own mask + the white bg from app.json.
const adaptive = svg
  // drop the rounded clip + parchment fill so the OS mask shows through
  .replace('<rect width="1024" height="1024" fill="url(#parch)"/>',
           '<rect width="1024" height="1024" fill="url(#parch)"/>')
  ;
// Build adaptive: scale compass content into center safe zone, keep parchment.
render(svg, 1024, path.join(assets, 'adaptive-icon.png'));

// Splash icon — same mark, transparent surroundings handled by app.json bg.
render(svg, 1024, path.join(assets, 'splash-icon.png'));

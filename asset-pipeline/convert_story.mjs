// Convert the story-map renders (out/story/, from render_story_kit.py) into
// the app's shipped assets: assets/story/band_*.webp (@2x of 390×1180 logical)
// and coin sprites. Run after a re-render:  node convert_story.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'out/story');
const DEST = path.join(ROOT, '../assets/story');
fs.mkdirSync(DEST, { recursive: true });

const BIOMES = ['prairie', 'desert', 'volcan', 'glace', 'jungle', 'archipel', 'savane', 'cosmos'];

let total = 0;
async function convert(src, dest, { width, quality, trim }) {
  let img = sharp(path.join(SRC, src));
  if (trim) {
    // sprites are rendered small/offset in their 512² frame — crop to content
    // so the coin fills the medallion box, then pad back to a square
    const buf0 = await img.trim().toBuffer();
    const m = await sharp(buf0).metadata();
    const side = Math.max(m.width, m.height);
    img = sharp(buf0).extend({
      top: Math.floor((side - m.height) / 2),
      bottom: Math.ceil((side - m.height) / 2),
      left: Math.floor((side - m.width) / 2),
      right: Math.ceil((side - m.width) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  if (width) img = img.resize({ width });
  const buf = await img.webp({ quality }).toBuffer();
  fs.writeFileSync(path.join(DEST, dest), buf);
  total += buf.length;
  console.log(dest.padEnd(26), (buf.length / 1024).toFixed(0) + ' Ko');
}

for (const b of BIOMES) {
  await convert(`band_${b}.png`, `band_${b}.webp`, { quality: 80 });
  await convert(`coin_${b}.png`, `coin_${b}.webp`, { width: 192, quality: 88, trim: true });
}
await convert('coin_locked.png', 'coin_locked.webp', { width: 192, quality: 88, trim: true });
console.log('TOTAL', (total / 1024).toFixed(0), 'Ko');

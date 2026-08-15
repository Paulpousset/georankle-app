// PNG/JPG → WebP (métadonnées retirées, redimension optionnelle).
//   node convert.mjs <in> <out.webp> [--size N] [--quality Q]
//   node convert.mjs --dir <inDir> <outDir> [--size N] [--quality Q]
import { mkdirSync, readdirSync } from 'fs';
import { basename, extname, join } from 'path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const size = flag('--size', null);
const quality = flag('--quality', 80);

async function convertOne(input, output) {
  let img = sharp(input);
  if (size) img = img.resize(size, size, { fit: 'inside', withoutEnlargement: true });
  const info = await img.webp({ quality }).toFile(output);
  console.log(`${basename(input)} → ${basename(output)} (${(info.size / 1024).toFixed(0)} KB)`);
}

if (args[0] === '--dir') {
  const [inDir, outDir] = [args[1], args[2]];
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(inDir)) {
    if (!/\.(png|jpe?g)$/i.test(f)) continue;
    await convertOne(join(inDir, f), join(outDir, `${basename(f, extname(f))}.webp`));
  }
} else {
  await convertOne(args[0], args[1]);
}

// Rend la vidéo d'aperçu des portails : node render-portal.mjs <Landscape|Portrait> <props.json> <out.mp4>
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [orient, propsFile, out] = process.argv.slice(2);
const id = `PortalTrailer${orient}`;
const serveUrl = await bundle({ entryPoint: join(import.meta.dirname, 'src', 'index.ts') });
const browserExecutable = process.env.CHROME_PATH || null;
const extra = JSON.parse(readFileSync(propsFile, 'utf8'));
const composition = await selectComposition({ serveUrl, id, inputProps: extra, browserExecutable });
await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: out, inputProps: extra, browserExecutable, muted: true, crf: 18 });
console.log('✔', out, (composition.durationInFrames / composition.fps).toFixed(1), 's');

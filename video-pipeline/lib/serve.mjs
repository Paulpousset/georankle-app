// Sert le build web exporté, en local, le temps d'une prise.
//
// Pourquoi pas `expo start --web` : Metro recompile, injecte un client de
// rafraîchissement et ouvre une websocket. Trois sources de micro-saccades qui
// se voient à l'image. Un export statique rend toujours la même chose.
import { createServer } from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join, normalize } from 'path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2',
};

/** @returns {Promise<{ url: string, close: () => Promise<void> }>} */
export function serve(dist, port) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    // `normalize` puis retrait des `..` : le serveur ne sort pas de `dist`,
    // même appelé à la main pendant une session de mise au point.
    let file = join(dist, normalize(rel).replace(/^(\.\.[/\\])+/, ''));

    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    // Repli SPA : toute route inconnue rend l'app, comme le fait Vercel.
    if (!existsSync(file)) file = join(dist, 'index.html');

    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      // Pas de cache : deux prises d'affilée ne doivent pas différer parce que
      // l'une a tapé dans le cache disque et l'autre non.
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      }),
    );
  });
}

// `node lib/serve.mjs` pour ouvrir le build à la main dans un vrai navigateur.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { WEB_DIST, PORT } = await import('../config.mjs');
  const { url } = await serve(WEB_DIST, PORT);
  console.log('→', url);
}

// L'enregistreur : screencast Chrome → cadence constante → H.264.
//
// Playwright sait déjà filmer (`recordVideo`), mais il rend du VP8 en WebM à
// cadence variable. Les stores veulent du H.264 en MP4 à cadence fixe, et le
// ffmpeg fourni avec Playwright est compilé sans x264. D'où ce chemin-là.
//
// Le point délicat est la cadence. `Page.startScreencast` n'émet une image que
// lorsque le rendu change : une app immobile n'envoie rien pendant deux
// secondes. Si on encodait les images reçues telles quelles, ces deux secondes
// de lecture disparaîtraient et la vidéo aurait l'air d'un montage nerveux.
// La pompe ci-dessous republie donc la dernière image reçue autant de fois
// qu'il le faut pour tenir 30 i/s — et elle se cale sur l'horloge murale, pas
// sur un compteur, pour qu'une machine lente produise une vidéo au bon rythme
// plutôt qu'un ralenti.
import { spawn } from 'child_process';
import { once } from 'events';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import ffmpegPath from 'ffmpeg-static';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {import('playwright').Page} page
 * @param {import('playwright').CDPSession} cdp
 */
export async function record(page, cdp, { out, width, height, fps, quality, crf, preset, log = () => {} }) {
  mkdirSync(dirname(out), { recursive: true });

  const ff = spawn(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0',
    // Le screencast peut rendre une image à un pixel près de la cible selon
    // l'arrondi du device pixel ratio. On force la taille exacte attendue par
    // le store, en complétant au besoin plutôt qu'en déformant.
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,` +
           `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf),
    '-profile:v', 'high', '-level', '4.2', '-r', String(fps),
    '-movflags', '+faststart',
    out,
  ]);
  ff.stderr.on('data', (b) => log('ffmpeg:', String(b).trim()));

  let latest = null;
  let received = 0;
  let emitted = 0;
  let running = true;
  let t0 = null;
  let stopTarget = null;

  cdp.on('Page.screencastFrame', async (frame) => {
    latest = Buffer.from(frame.data, 'base64');
    received++;
    if (t0 === null) t0 = Date.now(); // l'horloge démarre à la première image
    // L'accusé de réception est obligatoire : sans lui Chrome cesse d'émettre
    // après quelques images et la vidéo se fige sans erreur.
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    } catch { /* la page s'est fermée : plus rien à acquitter */ }
  });

  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality,
    maxWidth: width,
    maxHeight: height,
    everyNthFrame: 1,
  });

  const write = async (buf) => {
    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
  };

  const pump = (async () => {
    while (running || (latest && emitted < dueFrames())) {
      if (!latest) { await sleep(5); continue; }
      const due = dueFrames();
      // Plafond de rattrapage : si l'encodeur a pris du retard, on préfère
      // perdre quelques images plutôt que d'inonder le tuyau et de faire
      // enfler la mémoire jusqu'au bout de la prise.
      const target = Math.min(due, emitted + fps * 2);
      while (emitted < target) {
        await write(latest);
        emitted++;
      }
      if (emitted >= due) await sleep(1000 / fps / 2);
    }
  })();

  /**
   * Combien d'images DEVRAIENT être sorties à cet instant.
   *
   * `stopTarget` fige ce compte au moment de l'arrêt, et ce n'est pas un
   * détail : sans lui, la vidange finale court après une cible qui avance avec
   * l'horloge murale. Tant que l'encodeur est plus rapide que le temps réel,
   * elle la rattrape et personne ne voit rien ; dès qu'il est plus lent — un
   * conteneur chargé, un preset x264 exigeant — elle ne la rattrape jamais et
   * continue de republier la dernière image. Une prise de onze minutes est
   * ainsi sortie en dix-neuf, avec huit minutes d'écran figé en queue.
   */
  function dueFrames() {
    if (t0 === null) return 0;
    const n = Math.floor(((Date.now() - t0) / 1000) * fps);
    return stopTarget === null ? n : Math.min(n, stopTarget);
  }

  return {
    /** L'instant courant dans la vidéo finale, en secondes. Exact à l'image. */
    at: () => emitted / fps,
    stats: () => ({ received, emitted, seconds: emitted / fps }),

    async stop() {
      stopTarget = dueFrames(); // on fige la cible AVANT de couper le flux
      running = false;
      try { await cdp.send('Page.stopScreencast'); } catch {}
      await pump;
      ff.stdin.end();
      const [code] = await once(ff, 'close');
      if (code !== 0) throw new Error(`ffmpeg a rendu ${code}`);
      if (received === 0) throw new Error('aucune image reçue du screencast');
      return { received, emitted, seconds: emitted / fps, out };
    },
  };
}

// Réglages du pipeline vidéo : appareils, cadence, chemins.
//
// Les tailles d'appareil sont celles que l'App Store attend pour une
// « app preview », pas des approximations : une vidéo au mauvais format est
// refusée à l'upload, et c'est la seule erreur du pipeline qui ne se voit pas
// avant la soumission. `viewport × scale` DOIT donner exactement `out`.
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PIPELINE = join(ROOT, 'video-pipeline');

/** Où le build web exporté est servi pendant l'enregistrement. */
export const WEB_DIST = process.env.WEB_DIST || join(PIPELINE, '.dist');
export const PORT = Number(process.env.PORT || 5577);

/** Où atterrissent les rushes. Ignoré par git : ce sont des artefacts. */
export const OUT = process.env.OUT || join(PIPELINE, 'out');

export const DEVICES = {
  /** iPhone 6.9" (15/16/17 Pro Max) — le format de référence de l'App Store. */
  iphone69: { viewport: { width: 430, height: 932 }, scale: 3, out: { width: 1290, height: 2796 } },
  /** iPhone 6.5" (11 Pro Max / XS Max) — deuxième format encore demandé. */
  iphone65: { viewport: { width: 428, height: 926 }, scale: 3, out: { width: 1284, height: 2778 } },
  /** Play Store + Reels/Shorts/TikTok : le 9:16 universel. */
  social: { viewport: { width: 360, height: 640 }, scale: 3, out: { width: 1080, height: 1920 } },
};

export const DEVICE = process.env.DEVICE || 'iphone69';

/**
 * 30 i/s. Le screencast Chrome n'émet une image que lorsque le rendu change ;
 * l'encodeur republie donc la dernière image reçue pour tenir la cadence. Une
 * app immobile produit une vidéo immobile, pas une vidéo qui accélère.
 */
export const FPS = Number(process.env.FPS || 30);

/** Qualité JPEG du screencast. En dessous de 90 le texte fin bave. */
export const SCREENCAST_QUALITY = Number(process.env.QUALITY || 92);

/** CRF x264. 18 = visuellement sans perte, ce que méritent les stores. */
export const CRF = Number(process.env.CRF || 18);
export const X264_PRESET = process.env.X264_PRESET || 'slow';

/**
 * La graine du générateur pseudo-aléatoire qui pilote les hésitations, le
 * rythme de frappe et le tremblement du doigt. Une graine fixe = deux prises
 * identiques à l'image près : indispensable pour comparer deux montages sans
 * se demander si c'est le hasard qui a changé.
 */
export const SEED = Number(process.env.SEED || 20260910);

/** La langue de la prise. L'app détecte la locale du navigateur. */
export const LOCALE = process.env.LOCALE || 'fr-FR';

/** `1` pour voir le navigateur (utile en local sur Mac, impossible en CI). */
export const HEADED = process.env.HEADED === '1';

/** Ralentit ou accélère globalement toutes les pauses humaines. */
export const TEMPO = Number(process.env.TEMPO || 1);

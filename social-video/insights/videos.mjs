// Ce qu'on sait d'une vidéo publiée à partir de son nom de fichier
// (clé de posted.json, ex. shorts-next/44-court-frontieres-maroc-h2-fr-v1.mp4).
//   concept : frontieres, devine, rankle, globe, plus-ou-moins, capitales, drapeaux…
//   format  : court (~20 s), long (lot de 26 à 42 s), app (tournage de l'app)
//   hook    : accroche testée (h0 = accroche d'origine, h1, h2… = tuning.json ;
//             v1 / v2 pour les vidéos de l'app)
const CONCEPTS = [
  ['frontieres', /frontieres|borders/],
  ['devine', /devine/],
  ['rankle', /rankle/],
  ['globe', /^globe/],
  ['plus-ou-moins', /plusmoins|higher-lower/],
  ['echelle', /echelle|to-scale/],
  ['capitales', /capitals|capitales/],
  ['drapeaux', /flags|drapeaux/],
  ['silhouettes', /silhouette|shapes/],
  ['bande-annonce', /bande-annonce|trailer/],
];

export function describe(key) {
  const file = key.split('/').pop();
  const m = file.match(/^(.+)-([a-z]{2})-(v\d+)\.mp4$/);
  if (!m) return { concept: 'autre', format: 'autre', hook: null, lang: null };
  const [, base, lang, variant] = m;
  const name = base.replace(/^\d+-/, '');
  const concept = CONCEPTS.find(([, re]) => re.test(name))?.[0] ?? 'autre';
  // Vidéos concepts (concepts.mjs) : court-… ou lot-…, ou les premiers lots
  // numérotés (03-frontieres-maroc). Le reste vient du tournage de l'app.
  const court = /(^|-)court-/.test(name);
  const atlas = court || /^lot-/.test(name) || ['frontieres', 'devine', 'rankle', 'bande-annonce'].includes(concept);
  const format = !atlas ? 'app' : court ? 'court' : 'long';
  const h = name.match(/-(h\d+)$/);
  return { concept, format, hook: atlas ? (h ? h[1] : 'h0') : variant, lang };
}

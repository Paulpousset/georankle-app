// Fiches des nouveaux concepts (dossier src/concepts), sans capture de l'app :
// tout est dessiné dans le style « atlas » de l'app (parchemin, Playfair,
// Space Mono) à partir des données du jeu.
//
//   node concepts.mjs        # → ../out/episodes/concept-*.json
//   node render.mjs           # rend toutes les fiches
//
// - concept-bande-annonce : présentation de l'app, un mode par plan ;
// - concept-devine        : « Devine le pays » joué, indices qui se retournent ;
// - concept-frontieres    : relier deux pays par le moins de frontières ;
// - concept-rankle        : chaque pays dans sa meilleure catégorie, rang mondial.
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { feature } from 'topojson-client';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const EPISODES = join(HERE, '..', 'out', 'episodes');
const PUBLIC = join(HERE, 'public');
mkdirSync(EPISODES, { recursive: true });
mkdirSync(join(PUBLIC, 'shots'), { recursive: true });
mkdirSync(join(PUBLIC, 'app-sfx'), { recursive: true });

const stats = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, 'assets', 'countries_stats.json'), 'utf8')).map((c) => [c.cca3, c]));
const game = JSON.parse(readFileSync(join(ROOT, 'assets', 'game_data.json'), 'utf8'));
const cca2 = Object.fromEntries(
  [...readFileSync(join(ROOT, 'src', 'data', 'countryCodes.ts'), 'utf8').matchAll(/([A-Z]{3}): '([A-Z]{2})'/g)].map((m) => [m[1], m[2].toLowerCase()]),
);
const fr = (c) => stats[c].name;

// Captures de l'app actuelle (build web, viewport iPhone, assets/captures) et
// bruitages de l'app, copiés dans public/ avant le bundle.
cpSync(join(HERE, 'assets', 'captures'), join(PUBLIC, 'shots'), { recursive: true });
for (const s of ['correct', 'wrong', 'tap', 'tick', 'win', 'stamp', 'found', 'go', 'star', 'draw', 'lose', 'levelup']) {
  copyFileSync(join(ROOT, 'assets', 'sounds', `${s}.mp3`), join(PUBLIC, 'app-sfx', `${s}.mp3`));
}
copyFileSync(join(ROOT, 'assets', 'icon.png'), join(PUBLIC, 'icon.png'));

const write = (name, ep) => {
  writeFileSync(join(EPISODES, `${name}.json`), JSON.stringify(ep, null, 2));
  console.log('•', name);
};
const POST_TAGS = '#geographie #quiz #culturegenerale #geog #jeu';

// ───────────────────────────── Bande-annonce ─────────────────────────────
write('concept-bande-annonce', {
  composition: 'AppTrailer',
  hook: ['12 jeux de géo.', 'Une seule app.'],
  shots: [
    { file: 'shots/01-home.jpg', title: 'GeoGames', sub: 'Toute la géo dans ta poche' },
    { file: 'shots/02-histoire.jpg', title: 'Mode Histoire', sub: '500 niveaux, de plus en plus durs' },
    { file: 'shots/03-globe.jpg', title: 'Globe Géo', sub: 'Trouve le pays sur le globe 3D' },
    { file: 'shots/04-pinpoint.jpg', title: 'Point sur le Globe', sub: 'Un point, quel pays ?' },
    { file: 'shots/05-silhouette.jpg', title: 'Silhouette', sub: 'Devine le pays à sa forme' },
    { file: 'shots/06-devine.jpg', title: 'Devine le Pays', sub: 'Neuf indices, un pays' },
    { file: 'shots/07-frontieres.jpg', title: 'Frontières', sub: 'Relie deux pays' },
    { file: 'shots/08-plusoumoins.jpg', title: 'Plus ou Moins', sub: '' },
    { file: 'shots/09-rankle.jpg', title: 'Rankle', sub: '' },
    { file: 'shots/10-capitales.jpg', title: 'Capitales', sub: '' },
    { file: 'shots/11-drapeaux.jpg', title: 'Drapeaux', sub: '' },
    { file: 'shots/12-defispays.jpg', title: 'Défis Pays', sub: 'Joue région par région' },
    { file: 'shots/13-defi.jpg', title: 'Défi du Jour', sub: 'Un puzzle par mode, chaque jour' },
    { file: 'shots/14-enligne.jpg', title: 'En ligne', sub: 'Affronte le monde entier' },
  ],
  outro: 'GeoG',
  cta: 'Gratuit sur iOS et Android',
  ctaSub: 'Lien dans la bio',
  icon: 'icon.png',
  post: `12 jeux de géo dans une seule app 🌍 Lequel tu testes en premier ?\n\n${POST_TAGS}`,
});

// ───────────────────────────── Devine le pays ─────────────────────────────
const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
function distance(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
const CONT = { Africa: 'Afrique', Asia: 'Asie', Europe: 'Europe', Oceania: 'Océanie', Americas: 'Amériques' };
const contOf = (s) => (s.region === 'Americas' ? (s.subregion === 'South America' ? 'Am. du Sud' : 'Am. du Nord') : CONT[s.region] ?? s.region);
const short = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(1).replace('.', ',')} Md` : v >= 1e6 ? `${Math.round(v / 1e6)} M` : `${Math.round(v / 1e3)} k`);
const km2 = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.', ',')} M km²` : `${Math.round(v / 1e3)}k km²`);
function guessRow(g, t) {
  const a = stats[g];
  const b = stats[t];
  const same = g === t;
  return {
    cc: cca2[g],
    name: fr(g),
    tiles: [
      { label: 'Continent', value: contOf(a), state: contOf(a) === contOf(b) ? 'ok' : 'ko' },
      { label: 'Direction', value: same ? '🎯' : '', arrow: same ? null : Math.round(bearing(a, b)), state: same ? 'ok' : 'info' },
      { label: 'Distance', value: same ? '0 km' : `${Math.round(distance(a, b)).toLocaleString('fr-FR').replace(/\s/g, ' ')} km`, state: same ? 'ok' : distance(a, b) < 1500 ? 'near' : 'info' },
      { label: 'Population', value: short(a.population), dir: same ? 0 : b.population > a.population ? 1 : -1, state: same ? 'ok' : 'ko' },
      { label: 'Superficie', value: km2(a.area), dir: same ? 0 : b.area > a.area ? 1 : -1, state: same ? 'ok' : 'ko' },
      { label: 'Côtes', value: a.coastline ? 'Côtier' : 'Enclavé', state: a.coastline === b.coastline ? 'ok' : 'ko' },
    ],
  };
}
const target = 'MNG';
write('concept-devine', {
  composition: 'DevineConcept',
  hook: ['Trouve ce pays', 'avant moi 🕵️'],
  intro: 'Six indices par essai',
  rows: ['FRA', 'IND', 'KAZ', 'RUS', 'MNG'].map((g) => guessRow(g, target)),
  pause: 'Tu l’as ?',
  answer: { cc: cca2[target], name: fr(target) },
  outro: 'Trouvé en combien d’essais ?',
  outroSub: 'Dis-le en commentaire 👇',
  cta: 'Gratuit sur iOS et Android',
  icon: 'icon.png',
  post: `Un pays mystère, six indices par essai. Tu le trouves en combien ? 🕵️\n\n${POST_TAGS}`,
});

// ───────────────────────────── Frontières ─────────────────────────────
const pairs = readFileSync(join(ROOT, 'src', 'data', 'borders.ts'), 'utf8').match(/\b[A-Z]{3}-[A-Z]{3}\b/g);
const adj = {};
for (const p of pairs) {
  const [a, b] = p.split('-');
  (adj[a] ??= new Set()).add(b);
  (adj[b] ??= new Set()).add(a);
}
function shortest(from, to) {
  const prev = { [from]: null };
  const q = [from];
  while (q.length) {
    const c = q.shift();
    if (c === to) break;
    for (const n of adj[c] ?? []) if (!(n in prev)) { prev[n] = c; q.push(n); }
  }
  const path = [];
  for (let c = to; c; c = prev[c]) path.unshift(c);
  return path;
}
// Correspondance cca3 → identifiant world-atlas (par le nom anglais).
const atlas = JSON.parse(readFileSync(join(HERE, 'node_modules', 'world-atlas', 'countries-50m.json'), 'utf8'));
const byName = Object.fromEntries(feature(atlas, atlas.objects.countries).features.map((f) => [f.properties.name, f.id]));
const ALIAS = { USA: 'United States of America', CZE: 'Czechia', COD: 'Dem. Rep. Congo', CAF: 'Central African Rep.', SSD: 'S. Sudan', BIH: 'Bosnia and Herz.', DOM: 'Dominican Rep.', MKD: 'Macedonia', GNQ: 'Eq. Guinea', SWZ: 'eSwatini', CIV: "Côte d'Ivoire", COG: 'Congo', LAO: 'Laos', PRK: 'North Korea', KOR: 'South Korea', RUS: 'Russia', VNM: 'Vietnam', SYR: 'Syria', IRN: 'Iran', TZA: 'Tanzania', BOL: 'Bolivia', VEN: 'Venezuela', MDA: 'Moldova', BRN: 'Brunei', TLS: 'Timor-Leste' };
const atlasId = (c) => byName[ALIAS[c] ?? stats[c].name_en] ?? byName[stats[c].name_en.replace(/^The /, '')];
function frontierRound(from, to, level, view) {
  const path = shortest(from, to);
  const miss = path.filter((c) => !atlasId(c));
  if (miss.length) throw new Error(`world-atlas : pas d'identifiant pour ${miss.join(', ')}`);
  return { level, view, path: path.map((c) => ({ id: atlasId(c), cc: cca2[c], name: fr(c) })) };
}
const fRounds = [
  // view : [ouest, sud, est, nord] en degrés, la zone de carte cadrée.
  frontierRound('FRA', 'CHN', 'MOYEN', [-12, 12, 138, 72]),
  frontierRound('CAN', 'ARG', 'EXPERT', [-135, -56, -30, 62]),
];
for (const r of fRounds) console.log('  ', r.path.map((p) => p.name).join(' → '));
write('concept-frontieres', {
  composition: 'FrontieresConcept',
  hook: ['Combien de frontières', 'minimum ? 🧭'],
  rounds: fRounds,
  ask: 'Combien de pays à traverser ?',
  outro: 'Tu avais trouvé les deux ?',
  outroSub: 'Ton score en commentaire 👇',
  cta: 'Gratuit sur iOS et Android',
  icon: 'icon.png',
  post: `De la France à la Chine sans avion : combien de pays minimum ? 🧭\n\n${POST_TAGS}`,
});

// ───────────────────────────── Rankle ─────────────────────────────
const THEMES = ['population', 'area', 'passport_power', 'fifa_ranking', 'tourist_arrivals', 'life_expectancy'];
// Dans les données du jeu, plus grand = mieux classé pour tous ces thèmes
// (points FIFA, pays sans visa…) : le rang 1 est la plus grande valeur.
const rankOf = {};
for (const t of THEMES) {
  const rows = game.countries.filter((c) => c.data?.[t]?.value != null).map((c) => [c.cca3, c.data[t].value]);
  rows.sort((a, b) => b[1] - a[1]);
  rankOf[t] = Object.fromEntries(rows.map(([c], i) => [c, i + 1]));
}
// Une partie jouée : 6 pays, chacun posé dans un thème libre (le dernier est raté exprès).
const PLAY = [
  ['BRA', 'fifa_ranking'],
  ['CHN', 'population'],
  ['JPN', 'life_expectancy'],
  ['RUS', 'area'],
  ['FRA', 'tourist_arrivals'],
  ['NGA', 'passport_power'],
];
const rankleTurns = PLAY.map(([c, t]) => ({ cc: cca2[c], name: fr(c), theme: THEMES.indexOf(t), rank: rankOf[t][c] }));
console.log('  ', rankleTurns.map((r) => `${r.name} #${r.rank}`).join(', '));
write('concept-rankle', {
  composition: 'RankleConcept',
  hook: ['Chaque pays dans', 'sa meilleure catégorie'],
  rule: 'Le plus petit total gagne',
  themes: THEMES.map((t) => ({ emoji: game.themes[t].emoji, label: game.themes[t].label.fr })),
  turns: rankleTurns,
  outro: 'Tu fais mieux ?',
  outroSub: 'Ton total en commentaire 👇',
  cta: 'Gratuit sur iOS et Android',
  icon: 'icon.png',
  post: `Place chaque pays dans la catégorie où il est le mieux classé au monde. Le Nigeria m'a eu 😭\n\n${POST_TAGS}`,
});

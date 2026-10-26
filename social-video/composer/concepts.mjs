// Fiches des concepts « atlas » (dossier src/concepts), sans tournage : tout est
// dessiné dans le style de l'app (parchemin, Playfair, Space Mono) à partir des
// données du jeu, avec les répliques de voix off (voice.mjs les synthétise).
//
//   node concepts.mjs                     # les 4 vidéos vitrine → ../out/episodes/concept-*.json
//   node concepts.mjs --batch 24 --seed 7 # un lot : Devine, Frontières, Rankle en alternance
//   node concepts.mjs --batch 12 --short --mix echelle:4,plus-ou-moins:3,frontieres:3,devine:2
//   node concepts.mjs --batch 2 --mix partage:1           # deux « Partage équitable »
//   node voice.mjs && node render.mjs
//   node concepts.mjs --assets            # seulement public/ (captures, bruitages)
//
// - bande-annonce : présentation de l'app, un mode par plan (captures de l'app actuelle) ;
// - devine        : « Devine le pays » joué, indices qui se retournent ;
// - frontieres    : relier deux pays par le moins de frontières ;
// - rankle        : chaque pays dans sa meilleure catégorie, rang mondial ;
// - plus-ou-moins : cinq manches population / superficie, la série casse à la fin ;
// - echelle       : mode « À l'échelle », trois paires remises à la même échelle ;
// - partage       : mode « Partage équitable », trois cartes coupées en parts de population égales.
import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { geoArea, geoBounds, geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const EPISODES = join(HERE, '..', 'out', 'episodes');
const PUBLIC = join(HERE, 'public');
mkdirSync(EPISODES, { recursive: true });
mkdirSync(join(PUBLIC, 'shots'), { recursive: true });
mkdirSync(join(PUBLIC, 'app-sfx'), { recursive: true });
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BATCH = Number(arg('batch', 0));
// --tuning fichier : réglages tirés des stats (social-video/insights/analyze.mjs,
// tuning.json de la release shorts-state) : mélange des concepts d'un lot,
// accroches à tester et leurs poids, format court ou long.
const TUNING = arg('tuning') ? JSON.parse(readFileSync(arg('tuning'), 'utf8')) : null;
// --short : lot de vidéos d'environ 20 s (stats du 15/10 : on décroche avant la
// moitié des vidéos de 26 à 42 s). Frontières en une manche, Devine en trois
// essais, deux Frontières pour un Devine (Frontières est le plus regardé).
const SHORT = process.argv.includes('--short') || TUNING?.short === true;
let seed = Number(arg('seed', Date.now() % 100000));
// --lang en : mêmes vidéos en anglais (voix, textes à l'écran, noms de pays,
// légende). Sans --lang, sortie française inchangée.
const LANG = arg('lang', 'fr');
const EN = LANG === 'en';

const stats = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, 'assets', 'countries_stats.json'), 'utf8')).map((c) => [c.cca3, c]));
const game = JSON.parse(readFileSync(join(ROOT, 'assets', 'game_data.json'), 'utf8'));
const cca2 = Object.fromEntries(
  [...readFileSync(join(ROOT, 'src', 'data', 'countryCodes.ts'), 'utf8').matchAll(/([A-Z]{3}): '([A-Z]{2})'/g)].map((m) => [m[1], m[2].toLowerCase()]),
);
const fr = EN ? (c) => stats[c].name_en : (c) => stats[c].name;
// Nom à dire à voix haute (« Congo (Rép. dém.) » se lit mal).
const say = (name) => name.replace('Congo (Rép. dém.)', 'RDC');
// Choix d'un texte selon la langue : L('français', 'English').
const L = (f, e) => (EN ? e : f);

// Captures de l'app actuelle (build web, viewport iPhone, assets/captures) et
// bruitages de l'app, copiés dans public/ avant le bundle.
cpSync(join(HERE, 'assets', 'captures'), join(PUBLIC, 'shots'), { recursive: true });
for (const s of ['correct', 'wrong', 'tap', 'tick', 'win', 'stamp', 'found', 'go', 'star', 'draw', 'lose', 'levelup']) {
  copyFileSync(join(ROOT, 'assets', 'sounds', `${s}.mp3`), join(PUBLIC, 'app-sfx', `${s}.mp3`));
}
copyFileSync(join(ROOT, 'assets', 'icon.png'), join(PUBLIC, 'icon.png'));
// --assets : seulement préparer public/ (rendu d'un lot déjà écrit, voix comprises).
if (process.argv.includes('--assets')) process.exit(0);

const write = (name, ep) => {
  writeFileSync(join(EPISODES, `${name}.json`), JSON.stringify(ep, null, 2));
  console.log('•', name);
};
const POST_TAGS = L('#geographie #quiz #culturegenerale #geog #jeu', '#geography #quiz #trivia #geog #geographyquiz');
const COMMON = { cta: L('Gratuit sur iOS et Android', 'Free on iOS & Android'), icon: 'icon.png', lang: LANG };
const END_LINE = L('GeoG, gratuit sur iOS et Android.', 'GeoG, free on iOS and Android.');

// Hasard reproductible (--seed) : un même lot se régénère à l'identique.
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const NUM = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze'];
const ORD = ['', 'Premier', 'Deuxième', 'Troisième', 'Quatrième', 'Cinquième', 'Sixième', 'Septième', 'Huitième', 'Neuvième', 'Dixième'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Pays que le public situe à peu près : cibles et essais crédibles.
const KNOWN = ('FRA DEU ITA ESP GBR PRT BEL NLD CHE AUT POL SWE NOR FIN DNK IRL GRC TUR UKR ROU HUN CZE HRV SRB ' +
  'EGY MAR DZA TUN NGA ZAF KEN ETH SEN GHA CMR MDG COD TZA AGO ' +
  'USA CAN MEX BRA ARG COL PER CHL VEN BOL ECU URY PRY CUB ' +
  'RUS CHN JPN KOR IND PAK BGD IDN THA PHL VNM MYS NPL MNG KAZ AFG IRN IRQ SAU ISR JOR SYR ' +
  'AUS NZL').split(' ');

// ───────────────────────────── Bande-annonce ─────────────────────────────
function trailer() {
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
    ctaSub: 'Lien dans la bio',
    ...COMMON,
    post: `12 jeux de géo dans une seule app 🌍 Lequel tu testes en premier ?\n\n${POST_TAGS}`,
  });
}

// ───────────────────────────── Devine le pays ─────────────────────────────
// Mêmes durées que src/concepts/DevineConcept.tsx (placement de la voix off).
const DV = { FIRST: 1.0, GUESS: 3.4, TYPE: 0.55, FLIP: 0.2, PAUSE: 2.8, REVEAL: 5 };
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
const CONT = EN ? { Americas: 'Americas' } : { Africa: 'Afrique', Asia: 'Asie', Europe: 'Europe', Oceania: 'Océanie', Americas: 'Amériques' };
const contOf = (s) => (s.region === 'Americas' ? (s.subregion === 'South America' ? L('Am. du Sud', 'S. America') : L('Am. du Nord', 'N. America')) : CONT[s.region] ?? s.region);
const dec = (x) => (EN ? x.toFixed(1) : x.toFixed(1).replace('.', ','));
const short = (v) => (v >= 1e9 ? `${dec(v / 1e9)} ${L('Md', 'B')}` : v >= 1e6 ? `${Math.round(v / 1e6)} M` : `${Math.round(v / 1e3)} k`);
const km2 = (v) => (v >= 1e6 ? `${dec(v / 1e6)} M km²` : `${Math.round(v / 1e3)}k km²`);
const km = (c, t) => distance(stats[c], stats[t]);
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
      { label: 'Distance', value: same ? '0 km' : `${EN ? Math.round(distance(a, b)).toLocaleString('en-US') : Math.round(distance(a, b)).toLocaleString('fr-FR').replace(/\s/g, ' ')} km`, state: same ? 'ok' : distance(a, b) < 1500 ? 'near' : 'info' },
      { label: 'Population', value: short(a.population), dir: same ? 0 : b.population > a.population ? 1 : -1, state: same ? 'ok' : 'ko' },
      { label: L('Superficie', 'Area'), value: km2(a.area), dir: same ? 0 : b.area > a.area ? 1 : -1, state: same ? 'ok' : 'ko' },
      { label: L('Côtes', 'Coast'), value: a.coastline ? L('Côtier', 'Coastal') : L('Enclavé', 'Landlocked'), state: a.coastline === b.coastline ? 'ok' : 'ko' },
    ],
  };
}
function reaction(g, t) {
  const d = km(g, t);
  const sameCont = contOf(stats[g]) === contOf(stats[t]);
  if (EN) {
    if (d < 1500) return pick(['So close!', 'Burning hot!', 'Really close!']);
    if (sameCont) return pick(['Right continent.', 'Getting closer.', 'Getting warmer.']);
    if (d < 3500) return 'Close, but wrong continent.';
    return pick(['Way off.', 'Cold, ice cold.', 'Not even close.', 'Missed, by a mile.']);
  }
  if (d < 1500) return pick(['Tout près !', 'Brûlant !', 'Ça brûle !']);
  if (sameCont) return pick(['Bon continent.', 'On se rapproche.', 'Ça chauffe.']);
  if (d < 3500) return 'Proche, mais pas le bon continent.';
  return pick(['Très loin.', 'Froid, très froid.', 'Pas du tout.', 'Raté, et de loin.']);
}
function devine(name, target, guesses, hook = null) {
  const n = guesses.length;
  const guessAt = (i) => DV.FIRST + i * DV.GUESS + (i === n - 1 ? DV.PAUSE : 0);
  const pauseStart = guessAt(n - 2) + DV.GUESS;
  const revealAt = guessAt(n - 1) + DV.TYPE + 6 * DV.FLIP + 0.4;
  const end = guessAt(n - 1) + 1.8 + DV.REVEAL;
  const voice = [{ text: hook?.say ?? L('Trouve ce pays avant moi.', 'Find this country before I do.'), at: 0 }];
  guesses.forEach((g, i) => {
    if (i === n - 1) return;
    voice.push({ text: `${say(fr(g))}${L(' ', '')}?`, at: guessAt(i) + 0.1, maxLate: i === 0 ? 1.3 : 0.7 });
    voice.push({ text: reaction(g, target), at: guessAt(i) + DV.TYPE + 6 * DV.FLIP + 0.1, maxLate: 0.8 });
  });
  voice.push({ text: L('Tu l’as ? Trois, deux, un…', 'Got it? Three, two, one…'), at: pauseStart + 0.1, maxLate: 0.5 });
  voice.push({ text: L(`Réponse : ${say(fr(target))} !`, `It's ${say(fr(target))}!`), at: revealAt, maxLate: 0.6 });
  voice.push({ text: L('Trouvé en combien d’essais ?', 'How many guesses did you need?'), at: revealAt + 1.8, maxLate: 1 });
  voice.push({ text: END_LINE, at: end + 0.4, maxLate: 1 });
  write(name, {
    composition: 'DevineConcept',
    hook: hook?.text ?? L(['Trouve ce pays', 'avant moi 🕵️'], ['Find this country', 'before I do 🕵️']),
    intro: L('Six indices par essai', 'Six clues per guess'),
    rows: guesses.map((g) => guessRow(g, target)),
    pause: L('Tu l’as ?', 'Got it?'),
    answer: { cc: cca2[target], name: fr(target) },
    outro: L('Trouvé en combien d’essais ?', 'How many guesses did you need?'),
    outroSub: L('Dis-le en commentaire 👇', 'Tell me in the comments 👇'),
    ...COMMON,
    voice,
    post: L(`Un pays mystère, six indices par essai. Tu le trouves en combien ? 🕵️\n\n${POST_TAGS}`, `A mystery country, six clues per guess. How many tries do you need? 🕵️\n\n${POST_TAGS}`),
  });
}
// Quatre essais de plus en plus proches (loin, moyen, même continent, voisin), puis la cible.
function devineGuesses(target) {
  const pool = KNOWN.filter((c) => c !== target && stats[c]);
  const band = (lo, hi, used, sameCont) => {
    const ok = pool.filter((c) => !used.includes(c) && km(c, target) >= lo && km(c, target) < hi && (!sameCont || contOf(stats[c]) === contOf(stats[target])));
    return ok.length ? pick(ok) : null;
  };
  const used = [];
  const bands = SHORT ? [[3500, 9000, false], [0, 1500, false]] : [[7000, 20000, false], [3500, 7000, false], [1200, 3500, true], [0, 1500, false]];
  for (const [lo, hi, same] of bands) {
    const c = band(lo, hi, used, same) ?? band(lo * 0.6, hi * 1.4, used, false);
    if (!c) return null;
    used.push(c);
  }
  return [...used, target];
}

// ───────────────────────────── Frontières ─────────────────────────────
// Mêmes durées que src/concepts/FrontieresConcept.tsx.
const FR = { INTRO: 1.8, THINK: 5.2, HOLD: 3.2, step: (len) => (len > 7 ? 0.6 : 0.9) };
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
  if (!(to in prev)) return null;
  const path = [];
  for (let c = to; c; c = prev[c]) path.unshift(c);
  return path;
}
// Correspondance cca3 → identifiant world-atlas (par le nom anglais).
const atlas = JSON.parse(readFileSync(join(HERE, 'node_modules', 'world-atlas', 'countries-50m.json'), 'utf8'));
const atlasFeatures = feature(atlas, atlas.objects.countries).features;
const byName = Object.fromEntries(atlasFeatures.map((f) => [f.properties.name, f.id]));
const featureById = Object.fromEntries(atlasFeatures.map((f) => [f.id, f]));
const ALIAS = { USA: 'United States of America', CZE: 'Czechia', COD: 'Dem. Rep. Congo', CAF: 'Central African Rep.', SSD: 'S. Sudan', BIH: 'Bosnia and Herz.', DOM: 'Dominican Rep.', MKD: 'Macedonia', GNQ: 'Eq. Guinea', SWZ: 'eSwatini', CIV: "Côte d'Ivoire", COG: 'Congo', LAO: 'Laos', PRK: 'North Korea', KOR: 'South Korea', RUS: 'Russia', VNM: 'Vietnam', SYR: 'Syria', IRN: 'Iran', TZA: 'Tanzania', BOL: 'Bolivia', VEN: 'Venezuela', MDA: 'Moldova', BRN: 'Brunei', TLS: 'Timor-Leste' };
const atlasId = (c) => byName[ALIAS[c] ?? stats[c]?.name_en] ?? byName[stats[c]?.name_en?.replace(/^The /, '')];
// Emprise d'un pays (son plus grand morceau), bornée autour de son centre pour
// que la Russie ou le Canada n'étirent pas la carte jusqu'au bout du monde.
function extentOf(c) {
  const f = featureById[atlasId(c)];
  let main = f;
  if (f.geometry.type === 'MultiPolygon') {
    main = f.geometry.coordinates
      .map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } }))
      .reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  }
  const { lng, lat } = stats[c];
  let [[w, s], [e, n]] = geoBounds(main);
  if (w > e) [w, e] = [lng - 20, lng + 20]; // à cheval sur l'antiméridien
  return [Math.max(w, lng - 22), Math.max(s, lat - 14), Math.min(e, lng + 22), Math.min(n, lat + 14)];
}
// Cadre de carte autour du chemin : emprise des pays, marge, proportions ~ carrées.
function viewOf(path) {
  const ext = path.map(extentOf);
  let [w, s, e, n] = [Math.min(...ext.map((x) => x[0])), Math.min(...ext.map((x) => x[1])), Math.max(...ext.map((x) => x[2])), Math.max(...ext.map((x) => x[3]))];
  const padX = Math.max(4, (e - w) * 0.08);
  const padY = Math.max(3, (n - s) * 0.08);
  [w, e, s, n] = [w - padX, e + padX, s - padY, n + padY];
  // En Mercator, ~1,3° de longitude par degré de latitude aux latitudes moyennes.
  const want = (n - s) * 1.3;
  if (e - w < want) [w, e] = [(w + e) / 2 - want / 2, (w + e) / 2 + want / 2];
  else {
    const h = (e - w) / 1.3;
    [s, n] = [(s + n) / 2 - h / 2, (s + n) / 2 + h / 2];
  }
  return [Math.max(-180, w), Math.max(-75, s), Math.min(180, e), Math.min(80, n)].map((x) => Math.round(x));
}
function frontierRound(from, to, level, view) {
  const path = shortest(from, to);
  if (!path) throw new Error(`pas de chemin ${from} → ${to}`);
  const miss = path.filter((c) => !atlasId(c));
  if (miss.length) throw new Error(`world-atlas : pas d'identifiant pour ${miss.join(', ')}`);
  const LEVEL_EN = { MOYEN: 'MEDIUM', EXPERT: 'EXPERT', FACILE: 'EASY' };
  return { level: EN ? LEVEL_EN[level] ?? level : level, view: view ?? viewOf(path), path: path.map((c) => ({ id: atlasId(c), cc: cca2[c], name: fr(c) })) };
}
function frontieres(name, rounds, hook = null) {
  const roundSeconds = (r) => FR.INTRO + FR.THINK + r.path.length * FR.step(r.path.length) + FR.HOLD;
  // Une réplique par moment fort, jamais en rafale : voice.mjs abandonne une
  // réplique qui arriverait trop tard derrière la précédente.
  // Demande de Paul (15/10) : on demande quels pays traverser, pas combien.
  const voice = [{ text: hook?.say ?? L('Quels pays faut-il traverser ?', 'Which countries do you have to cross?'), at: 0 }];
  let s0 = 0.4;
  rounds.forEach((r, ri) => {
    const a = r.path[0].name;
    const b = r.path[r.path.length - 1].name;
    const step = FR.step(r.path.length);
    const draw = s0 + FR.INTRO + FR.THINK;
    voice.push({ text: L(`Départ, ${say(a)}. Arrivée, ${say(b)}. Quels pays traverser ?`, `Start, ${say(a)}. Finish, ${say(b)}. Which countries do you cross?`), at: ri === 0 ? 2.1 : s0 + 0.3, maxLate: 1.5 });
    // Les pays traversés ne sont dits que sur les chemins courts (le rythme le permet).
    // Chemins courts : chaque pays est dit quand il se pose. Sinon, la liste
    // tombe d'un coup une fois le chemin dessiné.
    const mid = r.path.slice(1, -1).map((c) => say(c.name));
    const list = mid.length > 1 ? `${mid.slice(0, -1).join(', ')} ${L('et', 'and')} ${mid[mid.length - 1]}` : mid[0];
    if (step >= 0.9 && r.path.length <= 6) mid.forEach((n, j) => n.length <= 12 && voice.push({ text: n, at: draw + (j + 1) * step, maxLate: 0.3 }));
    else voice.push({ text: L(`Par ${list} !`, `Through ${list}!`), at: draw + r.path.length * step + 0.15, maxLate: 1.2 });
    s0 += roundSeconds(r);
  });
  voice.push({ text: L('Tu avais trouvé ? Dis-le en commentaire.', 'Did you get it? Tell me in the comments.'), at: s0 + 0.1, maxLate: 0.8 });
  voice.push({ text: END_LINE, at: s0 + 2.6 + 0.4, maxLate: 1 });
  for (const r of rounds) console.log('  ', r.path.map((p) => p.name).join(' → '));
  const first = rounds[0].path;
  write(name, {
    composition: 'FrontieresConcept',
    hook: hook?.text ?? L(['Quels pays', 'traverser ? 🧭'], ['Which countries', 'do you cross? 🧭']),
    rounds,
    ask: L('Quels pays traverser ?', 'Which countries to cross?'),
    outro: rounds.length > 1 ? L('Tu avais trouvé les deux ?', 'Did you get both?') : L('Tu avais trouvé ?', 'Did you get it?'),
    outroSub: L('Ton score en commentaire 👇', 'Your score in the comments 👇'),
    ...COMMON,
    voice,
    post: L(`${first[0].name} → ${first[first.length - 1].name} sans avion : quels pays faut-il traverser ? 🧭\n\n${POST_TAGS}`, `${first[0].name} → ${first[first.length - 1].name} without flying: which countries do you have to cross? 🧭\n\n${POST_TAGS}`),
  });
}
// Pays déjà traversés dans le lot : on évite de repasser toujours par la Russie et l'Allemagne (on tolère un pays déjà vu de plus tous les 1000 essais).
const crossed = {};
function randomFrontier(minLen, maxLen, level, avoid) {
  for (let tries = 0; tries < 5000; tries++) {
    const a = pick(KNOWN);
    const b = pick(KNOWN);
    if (a === b || avoid.has(a + b)) continue;
    const path = shortest(a, b);
    if (!path || path.length < minLen || path.length > maxLen || path.some((c) => !atlasId(c))) continue;
    // Pas d'aller-retour par la Russie d'un bout à l'autre de l'Eurasie : la carte serait illisible.
    const lngs = path.map((c) => stats[c].lng);
    if (Math.max(...lngs) - Math.min(...lngs) > 150) continue;
    const mid = path.slice(1, -1);
    if (mid.filter((c) => crossed[c]).length > Math.floor(tries / 1000)) continue;
    for (const c of mid) crossed[c] = (crossed[c] ?? 0) + 1;
    avoid.add(a + b).add(b + a);
    return frontierRound(a, b, level);
  }
  throw new Error('aucune paire Frontières trouvée');
}

// ───────────────────────────── Rankle ─────────────────────────────
// Mêmes durées que src/concepts/RankleConcept.tsx.
const RK = { FIRST: 2.2, TURN: 2.5, LAST_EXTRA: 1.6, TAP: 1.05, COUNT: 0.6 };
// Thèmes que tout le monde comprend. Dans les données du jeu, plus grand =
// mieux classé (points FIFA, pays sans visa…) : le rang 1 est la plus grande valeur.
const RANKLE_THEMES = ['population', 'area', 'passport_power', 'fifa_ranking', 'tourist_arrivals', 'life_expectancy', 'gdp', 'olympic_medals', 'world_heritage', 'coastline_length', 'forest_area', 'highest_point', 'internet_users', 'gdp_per_capita'];
const rankOf = {};
for (const t of RANKLE_THEMES) {
  const rows = game.countries.filter((c) => c.data?.[t]?.value != null).map((c) => [c.cca3, c.data[t].value]);
  rows.sort((a, b) => b[1] - a[1]);
  rankOf[t] = Object.fromEntries(rows.map(([c], i) => [c, i + 1]));
}
const rankWord = (r) => (r <= 3 ? `${ORD[r]} !` : r <= 10 ? `Top ${NUM[r]} !` : `Numéro ${r}.`);
function rankle(name, themes, play) {
  const turns = play.map(([c, t]) => ({ cc: cca2[c], name: fr(c), theme: themes.indexOf(t), rank: rankOf[t][c] }));
  const n = turns.length;
  const turnAt = (i) => RK.FIRST + i * RK.TURN + (i === n - 1 ? RK.LAST_EXTRA : 0);
  const total = turns.reduce((a, b) => a + b.rank, 0);
  const end = turnAt(n - 1) + RK.TURN + 3.4;
  const label = (t) => game.themes[t].label.fr;
  const voice = [{ text: 'Chaque pays dans sa meilleure catégorie.', at: 0 }];
  // Le pays et le thème se lisent à l'écran : la voix ne dit que le verdict.
  turns.forEach((tr, i) => {
    if (i === n - 1) {
      voice.push({ text: `Dernier pays, dernière case… ${say(tr.name)}.`, at: turnAt(n - 2) + RK.TURN + 0.1, maxLate: 0.6 });
      voice.push({ text: `Aïe. ${rankWord(tr.rank)}`, at: turnAt(i) + RK.TAP + RK.COUNT + 0.1, maxLate: 0.8 });
      return;
    }
    voice.push({ text: rankWord(tr.rank), at: turnAt(i) + RK.TAP + RK.COUNT + 0.05, maxLate: 0.6 });
  });
  voice.push({ text: `Total : ${total}. Tu fais mieux ?`, at: turnAt(n - 1) + RK.TURN + 0.5, maxLate: 1 });
  voice.push({ text: END_LINE, at: end + 0.4, maxLate: 1 });
  console.log('  ', turns.map((r) => `${r.name} #${r.rank}`).join(', '), '=', total);
  const last = turns[n - 1];
  write(name, {
    composition: 'RankleConcept',
    hook: ['Chaque pays dans', 'sa meilleure catégorie'],
    rule: 'Le plus petit total gagne',
    themes: themes.map((t) => ({ emoji: game.themes[t].emoji, label: label(t) })),
    turns,
    outro: 'Tu fais mieux ?',
    outroSub: 'Ton total en commentaire 👇',
    ...COMMON,
    voice,
    post: `Place chaque pays dans la catégorie où il est le mieux classé au monde. ${last.name} m'a eu 😭\n\n${POST_TAGS}`,
  });
}
// Six thèmes, six pays : les cinq premiers prennent leur meilleure case libre,
// le dernier tombe dans la case qui reste… et c'est raté (la chute de la vidéo).
const rankleUsed = {};
function randomRankle() {
  // Chaque pays au plus deux fois dans un lot, et jamais deux fois en chute.
  const pool = KNOWN.filter((c) => RANKLE_THEMES.every((t) => rankOf[t][c]) && (rankleUsed[c] ?? 0) < 2);
  for (let tries = 0; tries < 20000; tries++) {
    const themes = shuffle(RANKLE_THEMES).slice(0, 6);
    const countries = shuffle(pool).slice(0, 6);
    const free = new Set(themes);
    const play = [];
    for (const c of countries.slice(0, 5)) {
      const best = [...free].sort((a, b) => rankOf[a][c] - rankOf[b][c])[0];
      free.delete(best);
      play.push([c, best]);
    }
    const lastC = countries[5];
    const lastT = [...free][0];
    if (play.some(([c, t]) => rankOf[t][c] > 25) || rankOf[lastT][lastC] < 90 || rankleUsed[`last${lastC}`]) continue;
    play.push([lastC, lastT]);
    for (const c of countries) rankleUsed[c] = (rankleUsed[c] ?? 0) + 1;
    rankleUsed[`last${lastC}`] = 1;
    return { themes, play };
  }
  throw new Error('aucune partie Rankle trouvée');
}

// ───────────────────────────── Plus ou moins ─────────────────────────────
// Mêmes durées que src/concepts/PlusOuMoinsConcept.tsx (placement de la voix off).
const PMT = { START: 0.3, ROUND: 3.6, PICK: 2.0, VERDICT: 2.75, FAIL_HOLD: 1.4, OUTRO: 2.4 };
const PM_ROUNDS = 5;
const PM_THEMES = {
  population: {
    icon: '👥', category: L('Population', 'Population'), unit: L('habitants', 'people'),
    question: L('{b} : plus ou moins peuplé ?', '{b}: more or fewer people?'),
    format: (v) => (v >= 1e9 ? `${dec(v / 1e9)} ${L('Md', 'B')}` : v >= 1e6 ? `${dec(v / 1e6)} M` : `${Math.round(v / 1e3)} k`),
  },
  area: {
    icon: '📏', category: L('Superficie', 'Area'), unit: 'km²',
    question: L('{b} : plus grand ou plus petit ?', '{b}: bigger or smaller?'),
    format: (v) => `${(v >= 1e6 ? dec(v / 1e6) + ' M' : Math.round(v / 1e3) + ' k')} km²`,
  },
};
const pmUsed = {};
// Une chaîne de six pays connus, chaque pas à moins de 2× du précédent (chaque
// manche se joue) ; le joueur a juste partout sauf à la dernière.
function randomPlusOuMoins(i) {
  const themeId = Object.keys(PM_THEMES)[i % 2];
  const value = (c) => game.countries.find((x) => x.cca3 === c)?.data?.[themeId]?.value;
  const pool = KNOWN.filter((c) => value(c) > 0 && atlasId(c) && cca2[c] && (pmUsed[c] ?? 0) < 2);
  for (let tries = 0; tries < 2000; tries++) {
    const chain = [pick(pool)];
    while (chain.length < PM_ROUNDS + 1) {
      const prev = value(chain[chain.length - 1]);
      const options = pool.filter((c) => !chain.includes(c) && value(c) / prev < 2 && prev / value(c) < 2);
      if (!options.length) break;
      chain.push(pick(options));
    }
    if (chain.length < PM_ROUNDS + 1) continue;
    for (const c of chain) pmUsed[c] = (pmUsed[c] ?? 0) + 1;
    return { themeId, chain, value };
  }
  throw new Error('aucune chaîne Plus ou moins trouvée');
}
// Silhouette d'un pays (son plus grand morceau) en tracé SVG de 430 × 300,
// calculée ici : dans le navigateur de rendu, certains pays (Australie)
// sortaient en rectangle.
function silhouette(c) {
  const f = featureById[atlasId(c)];
  const main = f.geometry.type !== 'MultiPolygon' ? f : f.geometry.coordinates
    .map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } }))
    .reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  return geoPath(geoMercator().fitSize([430, 300], main))(main).replace(/\d+\.\d+/g, (x) => String(Math.round(x)));
}
function plusOuMoins(name, { themeId, chain, value }, hook = null) {
  const th = PM_THEMES[themeId];
  const cards = chain.map((c) => ({ id: atlasId(c), cc: cca2[c], name: fr(c), value: value(c), display: th.format(value(c)), shape: silhouette(c) }));
  const rounds = cards.slice(1).map((c, i) => {
    const higher = c.value > cards[i].value;
    return { higher, pick: i === PM_ROUNDS - 1 ? !higher : higher };
  });
  const at = (i) => PMT.START + i * PMT.ROUND;
  const failAt = at(PM_ROUNDS - 1) + PMT.VERDICT;
  const end = failAt + PMT.FAIL_HOLD + PMT.OUTRO;
  const voice = [{ text: hook?.say ?? L('Tiens cinq manches sans te tromper.', 'Survive five rounds without a mistake.'), at: 0 }];
  rounds.forEach((r, i) => {
    if (i > 0) voice.push({ text: `${say(cards[i + 1].name)} ?`, at: at(i) + 0.15, maxLate: 0.5 });
    voice.push({ text: r.pick ? L('Plus !', 'Higher!') : L('Moins !', 'Lower!'), at: at(i) + PMT.PICK - 0.15, maxLate: 0.4 });
  });
  voice.push({ text: L('Ah non… raté.', 'Oh no… wrong.'), at: failAt + 0.3, maxLate: 0.8 });
  voice.push({ text: L('Tu fais mieux ?', 'Can you beat it?'), at: failAt + PMT.FAIL_HOLD + 0.2, maxLate: 1 });
  voice.push({ text: END_LINE, at: end + 0.4, maxLate: 1 });
  console.log('  ', cards.map((c) => `${c.name} ${c.display}`).join(' / '));
  write(name, {
    composition: 'PlusOuMoinsConcept',
    hook: hook?.text ?? L(['Tiens 5 manches', 'sans erreur 🔥'], ['Survive 5 rounds', 'no mistakes 🔥']),
    category: th.category,
    categoryIcon: th.icon,
    unit: th.unit,
    question: th.question,
    more: L('PLUS', 'HIGHER'),
    less: L('MOINS', 'LOWER'),
    fail: L('Raté !', 'Wrong!'),
    cards,
    rounds,
    outro: L('Tu fais mieux ?', 'Can you beat it?'),
    outroSub: L('Ton score en commentaire 👇', 'Drop your score 👇'),
    ...COMMON,
    voice,
    post: L(`Plus ou moins : tu aurais tenu combien de manches ? 🔥\n\n${POST_TAGS}`, `Higher or lower: how many rounds would you survive? 🔥\n\n${POST_TAGS}`),
  });
}

// ───────────────────────────── À l'échelle ─────────────────────────────
// Mode « À l'échelle » de l'app (src/lib/scale.ts) : le pays de gauche est à la
// vraie échelle, le joueur agrandit ou rétrécit celui de droite au curseur, puis
// les pointillés verts montrent la vraie taille. Même projection que l'app
// (projectedRings : une unité ≈ un degré de latitude sur les deux axes), donc le
// vrai rapport entre deux pays est celui de leurs emprises.
// Mêmes durées que src/concepts/EchelleConcept.tsx (placement de la voix off).
const EC = { START: 0.3, PAIR: 5.6, SUBMIT: 2.75, REVEAL: 3.3, OUTRO: 2.6 };
const EC_PAIRS = 3;
const EC_MAX_POINTS = 200;
const polygons = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, 'assets', 'world_polygons.json'), 'utf8')).map((p) => [p.id, p.r]));
// Copie de drawableRings + projectedRings (src/lib/silhouette.ts).
function scaleShape(c) {
  const raw = polygons[c];
  if (!raw?.length) return null;
  const unwrap = (ring) => {
    const out = [[ring[0][0], ring[0][1]]];
    let prev = ring[0][0];
    for (let i = 1; i < ring.length; i++) {
      let lng = ring[i][0];
      while (lng - prev > 180) lng -= 360;
      while (lng - prev < -180) lng += 360;
      out.push([lng, ring[i][1]]);
      prev = lng;
    }
    return out;
  };
  const centroid = (ring) => [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
  const unwrapped = raw.map(unwrap);
  const main = unwrapped.reduce((a, b) => (b.length > a.length ? b : a), unwrapped[0]);
  if (main.length < 22) return null;
  const [mx, my] = centroid(main);
  const rings = unwrapped
    .map((ring) => {
      const shift = Math.round((mx - centroid(ring)[0]) / 360) * 360;
      return shift ? ring.map(([lng, lat]) => [lng + shift, lat]) : ring;
    })
    .filter((ring) => Math.hypot(centroid(ring)[0] - mx, centroid(ring)[1] - my) <= 25);
  const lats = rings.flat().map((p) => p[1]);
  const kx = Math.max(0.2, Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180));
  const pts = rings.map((ring) => ring.map(([lng, lat]) => [lng * kx, -lat]));
  const xs = pts.flat().map((p) => p[0]);
  const ys = pts.flat().map((p) => p[1]);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;
  // Tracé en unités de projection, origine au coin de l'emprise (le rendu le met à l'échelle).
  const d = pts.map((ring) => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${(x - minX).toFixed(2)} ${(y - minY).toFixed(2)}`).join('') + 'Z').join('');
  return { d, width, height };
}
const ecPoints = (zoom) => Math.round(EC_MAX_POINTS * Math.max(0, 1 - Math.abs(Math.log(zoom)) / Math.log(2.5)));
const ecUsed = {};
// Trois paires de pays connus (rapport d'emprise entre 1,25 et 2,5, comme
// l'app), chacune jouée par « moi » : deux bons réglages, puis la chute.
function randomEchelle() {
  const pool = KNOWN.filter((c) => scaleShape(c) && cca2[c] && stats[c]?.area && (ecUsed[c] ?? 0) < 1);
  const ext = (c) => {
    const s = scaleShape(c);
    return Math.max(s.width, s.height);
  };
  const pairs = [];
  for (let tries = 0; pairs.length < EC_PAIRS && tries < 5000; tries++) {
    const [l, r] = [pick(pool), pick(pool)];
    if (l === r || pairs.some((p) => [p.left, p.right].some((c) => c === l || c === r))) continue;
    const ratio = ext(r) / ext(l);
    const lin = ratio >= 1 ? ratio : 1 / ratio;
    if (lin < 1.25 || lin > 2.5) continue;
    pairs.push({ left: l, right: r });
  }
  if (pairs.length < EC_PAIRS) throw new Error('aucune partie À l’échelle trouvée');
  for (const p of pairs) ecUsed[p.left] = ecUsed[p.right] = 1;
  // Réglage final du joueur : à 4-12 % puis 10-22 % de la vraie taille, et la
  // dernière manche 1,9 à 2,2 fois à côté (le tampon « Raté »).
  const offs = [0.04 + rand() * 0.08, 0.1 + rand() * 0.12, Math.log(1.9 + rand() * 0.3)];
  return pairs.map((p, i) => {
    const sign = rand() < 0.5 ? 1 : -1;
    const guess = i < EC_PAIRS - 1 ? Math.exp(sign * Math.log(1 + offs[i])) : Math.exp(sign * offs[i]);
    // Départ franchement à côté, du côté opposé au réglage final quand c'est possible.
    const start = Math.exp(-Math.sign(Math.log(guess)) * Math.log(1.6 + rand() * 0.6));
    return { ...p, guess, start };
  });
}
function echelle(name, pairs, hook = null) {
  const box = { LW: 80, RW: 120, H: 140 }; // plateau de l'app (scale.ts), en unités du viewBox
  const rounds = pairs.map(({ left, right, guess, start }) => {
    const L0 = scaleShape(left);
    const R0 = scaleShape(right);
    // Overshoot du curseur (le joueur dépasse puis revient) : il doit tenir dans la colonne.
    const over = Math.exp(Math.log(guess) + (Math.log(guess) - Math.log(start)) * 0.18);
    const maxZoom = Math.max(1, start, guess, over);
    const fit = (s, w) => Math.min(w / s.width, box.H / s.height);
    const unit = Math.min(fit(L0, box.LW) * 0.9, (fit(R0, box.RW) * 0.94) / maxZoom);
    const pct = Math.round(Math.abs(guess - 1) * 100);
    return {
      left: { cc: cca2[left], name: fr(left), area: km2(stats[left].area), ...L0 },
      right: { cc: cca2[right], name: fr(right), area: km2(stats[right].area), ...R0 },
      unit, start, guess, over,
      points: ecPoints(guess),
      verdict: pct <= 2 ? L('Pile à l’échelle !', 'Spot on!') : guess > 1 ? L(`${pct} % trop grand`, `${pct}% too big`) : L(`${pct} % trop petit`, `${pct}% too small`),
    };
  });
  const at = (i) => EC.START + i * EC.PAIR;
  const n = rounds.length;
  const end = at(n - 1) + EC.PAIR + EC.OUTRO;
  const total = rounds.reduce((a, r) => a + r.points, 0);
  const voice = [{ text: hook?.say ?? L('Remets ces deux pays à la même échelle.', 'Resize these two countries to the same scale.'), at: 0 }];
  rounds.forEach((r, i) => {
    if (i > 0) voice.push({ text: `${say(r.left.name)}, ${say(r.right.name)}.`, at: at(i) + 0.1, maxLate: 0.6 });
    if (i === n - 1) voice.push({ text: L('Celui-là, je le sens bien…', 'I’ve got a good feeling about this one…'), at: at(i) + 1.2, maxLate: 0.6 });
    const big = r.guess > 1;
    const line = i < n - 1
      ? (r.points >= 170 ? L(pick(['Presque parfait !', 'Pas mal du tout !', 'Juste à côté !']), pick(['Almost perfect!', 'Not bad at all!', 'So close!']))
        : L(big ? 'Un peu trop grand.' : 'Un peu trop petit.', big ? 'A bit too big.' : 'A bit too small.'))
      : L(big ? 'Quoi ? Deux fois trop grand !' : 'Quoi ? Deux fois trop petit !', big ? 'What? Twice too big!' : 'What? Half the size!');
    voice.push({ text: line, at: at(i) + EC.REVEAL + 0.1, maxLate: 0.8 });
  });
  voice.push({ text: L(`${total} points. Tu fais mieux ?`, `${total} points. Can you beat it?`), at: at(n - 1) + EC.PAIR + 0.2, maxLate: 1 });
  voice.push({ text: END_LINE, at: end + 0.4, maxLate: 1 });
  console.log('  ', rounds.map((r) => `${r.left.name} / ${r.right.name} ${r.verdict} +${r.points}`).join(' · '), '=', total);
  const last = rounds[n - 1];
  write(name, {
    composition: 'EchelleConcept',
    hook: hook?.text ?? L(['Remets ces pays', 'à la même échelle 📏'], ['Put these countries', 'to scale 📏']),
    title: L('À l’échelle', 'To Scale'),
    pairLabel: L('PAIRE', 'PAIR'),
    hint: L('Agrandis ou rétrécis le pays de droite pour qu’il soit à la même échelle que celui de gauche.', 'Grow or shrink the right country so it matches the scale of the left one.'),
    truthHint: L('Pointillés verts : la vraie taille.', 'Green dashes: the real size.'),
    slider: L('plus petit · plus grand', 'smaller · bigger'),
    submit: L('VALIDER', 'SUBMIT'),
    fail: L('Raté !', 'Missed!'),
    rounds,
    total,
    max: EC_MAX_POINTS * n,
    outro: L('Tu fais mieux ?', 'Can you beat it?'),
    outroSub: L('Ton score en commentaire 👇', 'Drop your score 👇'),
    ...COMMON,
    voice,
    post: L(
      `${last.left.name} et ${last.right.name} à la même échelle : tu aurais réglé comment ? 📏 Nouveau mode « À l'échelle » dans GeoG.\n\n${POST_TAGS}`,
      `${last.left.name} and ${last.right.name} to scale: how would you size it? 📏 New “To Scale” mode in GeoG.\n\n${POST_TAGS}`,
    ),
  });
}

// ───────────────────────────── Partage équitable ─────────────────────────────
// Mode « Partage équitable » de l'app (src/lib/split.ts) : une carte et ses
// grandes villes, nommées sans chiffres (des repères) ; un trait (ou deux) pour
// couper toute la population de la zone en parts égales, puis la part de
// chacun en % et en habitants. split.ts est
// compilé tel quel (esbuild, déjà là pour Remotion) : mêmes cartes, mêmes
// villes, même barème que l'app.
const { build: esbuild } = await import('esbuild');
const SPLIT_JS = join(HERE, 'node_modules', '.cache', 'split.mjs');
await esbuild({
  stdin: { contents: "export * from './src/lib/split.ts'; export { fmtCount } from './src/lib/format.ts';", resolveDir: ROOT, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: SPLIT_JS, logLevel: 'error',
});
const SPLIT = await import(SPLIT_JS);
// Au-delà, le plateau rapetisse pour tenir à l'écran et les noms de villes deviennent illisibles.
const SP_MAX_H = 167;
// Pour le placement de la voix off ; les moments de chaque carte sont écrits dans la fiche.
const SP = { START: 0.3, LEAD: 1.2, DRAW: 0.8, LINE: 1.0, GAP: 0.25, ADJUST: 0.7, SUBMIT: 0.35, REVEAL: 0.45, READ: 2.4, OUTRO: 2.6 };
const spUsed = {};
const spHalves = (id) => SPLIT.bestSplitError(SPLIT.splitMap(id), 2, 1);
const spQuarters = (id) => SPLIT.bestSplitError(SPLIT.splitMap(id), 4, 2);
const spFits = (id) => SPLIT.splitMap(id).height <= SP_MAX_H && !spUsed[id];

/**
 * Traits joués par « moi » sur une carte : tirés au hasard autour du milieu des
 * villes, gardés si leurs points tombent dans [lo, hi]. `middle` : la chute,
 * des traits qui coupent la carte en son milieu (sans regarder les
 * populations), le piège du mode.
 */
function spLines(q, lo, hi, middle = false) {
  const map = SPLIT.splitMap(q.id);
  const xs = map.cities.map((c) => c.x);
  const ys = map.cities.map((c) => c.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  // Les deux bouts du trait, en retrait des bords du plateau (où le doigt se pose).
  const through = (p, angle) => {
    const seg = SPLIT.clipToBoard({ a: p, b: { x: p.x + Math.cos(angle), y: p.y + Math.sin(angle) } }, map.width, map.height);
    if (!seg) return null;
    const at = (k) => ({ x: seg[0].x + (seg[1].x - seg[0].x) * k, y: seg[0].y + (seg[1].y - seg[0].y) * k });
    return { a: at(0.07), b: at(0.93) };
  };
  const found = [];
  for (let k = 0; k < 6000 && found.length < 40; k++) {
    const spread = middle ? 0.12 : 0.4;
    const p = { x: mid.x + (rand() - 0.5) * 2 * spread * (x1 - x0), y: mid.y + (rand() - 0.5) * 2 * spread * (y1 - y0) };
    // Traits plutôt francs (vertical, horizontal, diagonale) : c'est ce qu'on trace au doigt.
    const angle = Math.PI * rand();
    const first = through(p, angle);
    if (!first) continue;
    const lines = [first];
    if (q.lines === 2) {
      const second = through(p, angle + Math.PI * (0.38 + rand() * 0.24));
      if (!second) continue;
      lines.push(second);
    }
    const shares = SPLIT.partShares(map, lines);
    // Une part à « 0 % » se lit comme un bug : chaque part garde au moins 2 %.
    if (shares.length < q.parts || shares.some((x) => x.share < 0.02)) continue;
    const { points } = SPLIT.scoreLines(q, lines);
    if (points < lo || points > hi) continue;
    found.push({ lines, points, shares, off: Math.hypot(p.x - mid.x, p.y - mid.y) });
  }
  if (!found.length) return null;
  if (middle) found.sort((u, v) => u.off - v.off);
  return middle ? found[0] : pick(found);
}

// Trois cartes : un pays en deux (bien), un continent en deux (parfait), puis
// une carte en quatre coupée en son milieu (la chute).
function randomPartage() {
  const plan = [
    { pool: KNOWN.filter((c) => SPLIT.splitCountries().includes(c) && spFits(c) && spHalves(c) <= 0.06), parts: 2, lo: 125, hi: 179 },
    { pool: SPLIT.splitGroups().filter((g) => spFits(g) && spHalves(g) <= 0.06), parts: 2, lo: 182, hi: 200 },
    { pool: [...SPLIT.splitGroups(), ...SPLIT.splitCountries()].filter((id) => spFits(id) && spQuarters(id) <= 0.06), parts: 4, lo: 5, hi: 55, middle: true },
  ];
  const picked = [];
  for (const step of plan) {
    let play = null;
    for (const id of shuffle(step.pool.filter((id) => !picked.some((p) => p.q.id === id)))) {
      const lines = step.parts === 2 ? 1 : 2;
      const q = { id, parts: step.parts, lines, best: SPLIT.bestSplitError(SPLIT.splitMap(id), step.parts, lines) };
      const got = spLines(q, step.lo, step.hi, step.middle);
      if (got) {
        play = { q, ...got };
        break;
      }
    }
    if (!play) throw new Error('aucune partie Partage équitable trouvée');
    picked.push(play);
  }
  // Les cartes servent une fois par lot : 4 vidéos ne montrent pas toutes l'Europe.
  for (const p of picked) spUsed[p.q.id] = 1;
  return picked;
}

/** Le trait avant le réglage : le second bout tourné de quelques degrés autour du premier. */
function spBefore(line) {
  const turn = (rand() < 0.5 ? -1 : 1) * (0.1 + rand() * 0.08);
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  return { a: line.a, b: { x: line.a.x + dx * Math.cos(turn) - dy * Math.sin(turn), y: line.a.y + dx * Math.sin(turn) + dy * Math.cos(turn) } };
}

function partage(name, plays, hook = null) {
  const lang = EN ? 'en' : 'fr';
  const r1 = (p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
  let clock = SP.START;
  const rounds = plays.map(({ q, lines, points, shares }, i) => {
    const map = SPLIT.splitMap(q.id);
    const names = map.cities.map((c) => SPLIT.splitCityName(c, lang));
    const labels = SPLIT.placeLabels(map, names);
    // Moments de la carte (secondes depuis le début de la vidéo).
    const t0 = clock;
    const draw = [];
    let t = t0 + (i === 0 ? SP.LEAD : 0) + SP.DRAW;
    for (let k = 0; k < lines.length; k++) {
      draw.push([t, t + SP.LINE]);
      t += SP.LINE + SP.GAP;
    }
    const adjust = [t, t + SP.ADJUST];
    const submit = adjust[1] + SP.SUBMIT;
    const reveal = submit + SP.REVEAL;
    clock = reveal + SP.READ;
    const last = lines.length - 1;
    return {
      name: SPLIT.splitMapName(q.id, lang),
      parts: q.parts,
      total: SPLIT.fmtCount(map.total, lang),
      width: map.width,
      height: map.height,
      regions: map.regions,
      cities: map.cities.map((c, k) => ({ x: r1(c).x, y: r1(c).y, name: names[k], lx: r1(labels[k]).x, ly: r1(labels[k]).y, anchor: labels[k].anchor })),
      lines: lines.map((l) => ({ a: r1(l.a), b: r1(l.b) })),
      // Le dernier trait est d'abord tracé un peu de travers, puis réglé par son rond blanc.
      before: { a: r1(lines[last].a), b: r1(spBefore(lines[last]).b) },
      shares: shares.map((s) => ({ key: s.key, pct: Math.round(s.share * 100), pop: SPLIT.fmtCount(s.pop, lang) })),
      points,
      verdict: points >= 180 ? L('Partage parfait !', 'Perfect split!') : points >= 120 ? L('Presque équitable', 'Nearly fair') : points >= 60 ? L('Un peu déséquilibré', 'A bit lopsided') : L('Très déséquilibré', 'Very lopsided'),
      t: { start: t0, draw, adjust, submit, reveal, end: clock },
    };
  });
  const n = rounds.length;
  const end = rounds[n - 1].t.end + SP.OUTRO;
  const total = rounds.reduce((a, r) => a + r.points, 0);
  const voice = [{ text: hook?.say ?? L('Coupe cette carte en deux : autant d’habitants de chaque côté.', 'Cut this map in half: same population on each side.'), at: 0 }];
  rounds.forEach((r, i) => {
    const [p0, p1] = r.shares.map((s) => s.pct);
    if (i > 0) voice.push({ text: r.parts === 2 ? L(`${say(r.name)}, en deux.`, `${say(r.name)}, in half.`) : L(`${say(r.name)}, en quatre. Facile, je coupe au milieu.`, `${say(r.name)}, in four. Easy, I cut down the middle.`), at: r.t.start + 0.1, maxLate: 0.6 });
    const line = i < n - 1
      ? (r.points >= 180 ? L(`${p0}, ${p1}. Parfait !`, `${p0}, ${p1}. Perfect!`) : L(`${p0} contre ${p1}, pas mal !`, `${p0} to ${p1}, not bad!`))
      : L(`Quoi ? ${p0} pour cent dans une seule part !`, `What? ${p0} percent in one part!`);
    voice.push({ text: line, at: r.t.reveal + 0.1, maxLate: 0.8 });
  });
  voice.push({ text: L(`${total} points. Tu fais mieux ?`, `${total} points. Can you beat it?`), at: rounds[n - 1].t.end + 0.2, maxLate: 1 });
  voice.push({ text: END_LINE, at: end + 0.4, maxLate: 1 });
  console.log('  ', rounds.map((r) => `${r.name} ${r.shares.map((s) => s.pct).join('/')} +${r.points}`).join(' · '), '=', total);
  write(name, {
    composition: 'PartageConcept',
    hook: hook?.text ?? L(['Coupe cette carte', 'en deux ✂️'], ['Cut this map', 'in half ✂️']),
    title: L('Partage équitable', 'Fair Split'),
    mapLabel: L('CARTE', 'MAP'),
    partsLabel: L(['', '', 'EN DEUX', 'EN TROIS', 'EN QUATRE'], ['', '', 'HALVES', 'THIRDS', 'QUARTERS']),
    totalLabel: L('Population de la zone : {0}', 'Population of the area: {0}'),
    hints: L(
      ['', '', 'Trace un trait qui coupe la population en deux parts égales.', '', 'Trace deux traits qui se croisent pour couper la population en 4 parts égales.'],
      ['', '', 'Draw a line that splits the population into two equal halves.', '', 'Draw two crossing lines that split the population into 4 equal parts.'],
    ),
    partsHint: L('Chaque couleur est une part.', 'Each colour is one part.'),
    target: L('Objectif : {0} % chacune', 'Target: {0}% each'),
    submit: L('VALIDER', 'SUBMIT'),
    fail: L('Raté !', 'Missed!'),
    rounds,
    total,
    max: 200 * n,
    outro: L('Tu fais mieux ?', 'Can you beat it?'),
    outroSub: L('Ton score en commentaire 👇', 'Drop your score 👇'),
    ...COMMON,
    voice,
    post: L(
      `${rounds[1].name} en deux, autant d'habitants de chaque côté : tu aurais coupé où ? ✂️ Nouveau mode « Partage équitable » dans GeoG.\n\n${POST_TAGS}`,
      `${rounds[1].name} in half, same population on each side: where would you cut? ✂️ New “Fair Split” mode in GeoG.\n\n${POST_TAGS}`,
    ),
  });
}

// ───────────────────────────── Réglages (--tuning) ─────────────────────────────
// Ordre des concepts d'un lot au prorata de tuning.mix, bien réparti (tourniquet
// pondéré : à chaque vidéo, le concept le plus en retard sur sa part).
function mixSequence(mix, count) {
  const kinds = Object.entries(mix).filter(([, w]) => w > 0);
  const total = kinds.reduce((a, [, w]) => a + w, 0);
  const done = {};
  return Array.from({ length: count }, (_, i) => {
    const [kind] = kinds.reduce((best, cur) => {
      const lag = (k, w) => (w / total) * (i + 1) - (done[k] ?? 0);
      return lag(...cur) > lag(...best) ? cur : best;
    });
    done[kind] = (done[kind] ?? 0) + 1;
    return kind;
  });
}
// Accroche de la prochaine vidéo d'un concept : même tourniquet sur les poids
// de tuning.hookWeights, variables remplies ({a}, {b}, {n}). Une accroche dont
// une ligne dépasse 20 caractères une fois remplie (noms longs) est sautée.
const hookUses = {};
function pickHook(concept, vars) {
  const list = TUNING?.hooks?.[concept]?.[LANG];
  if (!list?.length) return null;
  const weights = TUNING.hookWeights?.[concept]?.[LANG] ?? {};
  const fill = (t) => t.replace(/\{(\w+)\}/g, (_, k) => (k === 'n' ? String(vars.n) : say(String(vars[k] ?? ''))));
  // --hook-shift N : le tourniquet commence N accroches plus loin. Avec la même
  // graine dans les deux langues, chaque partie sort avec une accroche
  // différente en FR et en EN : on compare les intros sur les mêmes parties.
  const uses = (hookUses[concept] ||= Object.fromEntries(list.filter((h) => (weights[h.id] ?? 1) > 0).slice(0, Number(arg('hook-shift', 0))).map((h) => [h.id, 1])));
  const total = Object.values(uses).reduce((a, b) => a + b, 0);
  const ranked = list
    .map((h) => ({ ...h, w: weights[h.id] ?? 1 / list.length }))
    .filter((h) => h.w > 0)
    .sort((x, y) => (y.w * (total + 1) - (uses[y.id] ?? 0)) - (x.w * (total + 1) - (uses[x.id] ?? 0)));
  for (const h of ranked) {
    const text = h.text.map(fill);
    if (text.some((l) => [...l].length > 20)) continue;
    uses[h.id] = (uses[h.id] ?? 0) + 1;
    return { id: h.id, text, say: fill(h.say) };
  }
  return null;
}

// ───────────────────────────── Vitrine ou lot ─────────────────────────────
// --redo fichier : refaire des Frontières déjà en file, une ligne
// « nom|Départ|Arrivée » (noms français), en une manche. Une ligne
// « nom|devine|Pays » refait un Devine sur ce pays (essais tirés au hasard,
// --short pour trois essais). Avec --lang en, mêmes vidéos en anglais.
const REDO = arg('redo');
if (REDO) {
  const byFr = Object.fromEntries(Object.values(stats).map((c) => [c.name, c.cca3]));
  for (const line of readFileSync(REDO, 'utf8').split('\n').filter(Boolean)) {
    const [name, a, b] = line.split('|');
    if (a === 'devine') {
      if (!byFr[b]) throw new Error(`pays inconnu : ${b}`);
      let g = null;
      for (let k = 0; !g && k < 50; k++) g = devineGuesses(byFr[b]);
      if (!g) throw new Error(`pas d'essais pour ${b}`);
      console.log('  ', g.map(fr).join(' → '));
      devine(name, byFr[b], g);
      continue;
    }
    if (!byFr[a] || !byFr[b]) throw new Error(`pays inconnu : ${a} / ${b}`);
    frontieres(name, [frontierRound(byFr[a], byFr[b], 'MOYEN')]);
  }
} else if (!BATCH) {
  trailer();
  devine('concept-devine', 'MNG', ['FRA', 'IND', 'KAZ', 'RUS', 'MNG']);
  frontieres('concept-frontieres', [frontierRound('FRA', 'CHN', 'MOYEN', [-12, 12, 138, 72]), frontierRound('CAN', 'ARG', 'EXPERT', [-135, -56, -30, 62])]);
  rankle('concept-rankle', ['population', 'area', 'passport_power', 'fifa_ranking', 'tourist_arrivals', 'life_expectancy'], [
    ['BRA', 'fifa_ranking'],
    ['CHN', 'population'],
    ['JPN', 'life_expectancy'],
    ['RUS', 'area'],
    ['FRA', 'tourist_arrivals'],
    ['NGA', 'passport_power'],
  ]);
} else {
  // Un lot remplace le précédent dans out/episodes (les vitrines restent).
  const prefix = SHORT ? 'court' : 'lot';
  for (const f of readdirSync(EPISODES)) if (f.startsWith(`${prefix}-`)) rmSync(join(EPISODES, f));
  const targets = shuffle(KNOWN.filter((c) => c !== 'MNG'));
  const usedPairs = new Set(['FRACHN', 'CANARG']);
  let ti = 0;
  // --mix « echelle:4,plus-ou-moins:3,… » : mélange imposé (prioritaire sur --tuning).
  const MIX = arg('mix') ? Object.fromEntries(arg('mix').split(',').map((x) => [x.split(':')[0], Number(x.split(':')[1] ?? 1)])) : TUNING?.mix;
  const kinds = MIX ? mixSequence(MIX, BATCH) : null;
  for (let i = 0; i < BATCH; i++) {
    const num = String(i + 1).padStart(2, '0');
    const kind = kinds ? kinds[i] : (SHORT ? ['frontieres', 'devine', 'frontieres'] : ['devine', 'frontieres', 'rankle'])[i % 3];
    if (kind === 'devine') {
      let g = null;
      while (!g) g = devineGuesses(targets[ti++ % targets.length]);
      console.log('  ', g.map(fr).join(' → '));
      const hook = pickHook('devine', { n: g.length });
      devine(`${prefix}-${num}-devine-${slug(fr(g[g.length - 1]))}${hook ? `-${hook.id}` : ''}`, g[g.length - 1], g, hook);
    } else if (kind === 'frontieres') {
      const r1 = randomFrontier(4, 6, 'MOYEN', usedPairs);
      const r2 = SHORT ? null : randomFrontier(7, 10, 'EXPERT', usedPairs);
      const hook = pickHook('frontieres', { a: r1.path[0].name, b: r1.path[r1.path.length - 1].name });
      frontieres(`${prefix}-${num}-frontieres-${slug(r1.path[0].name)}${hook ? `-${hook.id}` : ''}`, r2 ? [r1, r2] : [r1], hook);
    } else if (kind === 'echelle') {
      const pairs = randomEchelle();
      const hook = pickHook('echelle', {});
      echelle(`${prefix}-${num}-echelle-${slug(fr(pairs[0].left))}${hook ? `-${hook.id}` : ''}`, pairs, hook);
    } else if (kind === 'partage') {
      const plays = randomPartage();
      const hook = pickHook('partage', {});
      partage(`${prefix}-${num}-partage-${slug(SPLIT.splitMapName(plays[1].q.id, 'fr'))}${hook ? `-${hook.id}` : ''}`, plays, hook);
    } else if (kind === 'plus-ou-moins') {
      const pm = randomPlusOuMoins(i);
      const hook = pickHook('plus-ou-moins', { a: fr(pm.chain[0]), b: fr(pm.chain[1]) });
      plusOuMoins(`${prefix}-${num}-plusmoins-${slug(fr(pm.chain[0]))}${hook ? `-${hook.id}` : ''}`, pm, hook);
    } else {
      const { themes, play } = randomRankle();
      rankle(`${prefix}-${num}-rankle-${slug(fr(play[5][0]))}`, themes, play);
    }
  }
}

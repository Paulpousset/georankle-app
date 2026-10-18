// Fiches des concepts « atlas » (dossier src/concepts), sans tournage : tout est
// dessiné dans le style de l'app (parchemin, Playfair, Space Mono) à partir des
// données du jeu, avec les répliques de voix off (voice.mjs les synthétise).
//
//   node concepts.mjs                     # les 4 vidéos vitrine → ../out/episodes/concept-*.json
//   node concepts.mjs --batch 24 --seed 7 # un lot : Devine, Frontières, Rankle en alternance
//   node voice.mjs && node render.mjs
//   node concepts.mjs --assets            # seulement public/ (captures, bruitages)
//
// - bande-annonce : présentation de l'app, un mode par plan (captures de l'app actuelle) ;
// - devine        : « Devine le pays » joué, indices qui se retournent ;
// - frontieres    : relier deux pays par le moins de frontières ;
// - rankle        : chaque pays dans sa meilleure catégorie, rang mondial.
import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { geoArea, geoBounds } from 'd3-geo';
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
// --short : lot de vidéos d'environ 20 s (stats du 15/10 : on décroche avant la
// moitié des vidéos de 26 à 42 s). Frontières en une manche, Devine en trois
// essais, deux Frontières pour un Devine (Frontières est le plus regardé).
const SHORT = process.argv.includes('--short');
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
function devine(name, target, guesses) {
  const n = guesses.length;
  const guessAt = (i) => DV.FIRST + i * DV.GUESS + (i === n - 1 ? DV.PAUSE : 0);
  const pauseStart = guessAt(n - 2) + DV.GUESS;
  const revealAt = guessAt(n - 1) + DV.TYPE + 6 * DV.FLIP + 0.4;
  const end = guessAt(n - 1) + 1.8 + DV.REVEAL;
  const voice = [{ text: L('Trouve ce pays avant moi.', 'Find this country before I do.'), at: 0 }];
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
    hook: L(['Trouve ce pays', 'avant moi 🕵️'], ['Find this country', 'before I do 🕵️']),
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
function frontieres(name, rounds) {
  const roundSeconds = (r) => FR.INTRO + FR.THINK + r.path.length * FR.step(r.path.length) + FR.HOLD;
  // Une réplique par moment fort, jamais en rafale : voice.mjs abandonne une
  // réplique qui arriverait trop tard derrière la précédente.
  // Demande de Paul (15/10) : on demande quels pays traverser, pas combien.
  const voice = [{ text: L('Quels pays faut-il traverser ?', 'Which countries do you have to cross?'), at: 0 }];
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
    hook: L(['Quels pays', 'traverser ? 🧭'], ['Which countries', 'do you cross? 🧭']),
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
  for (let i = 0; i < BATCH; i++) {
    const num = String(i + 1).padStart(2, '0');
    const kind = (SHORT ? ['frontieres', 'devine', 'frontieres'] : ['devine', 'frontieres', 'rankle'])[i % 3];
    if (kind === 'devine') {
      let g = null;
      while (!g) g = devineGuesses(targets[ti++ % targets.length]);
      console.log('  ', g.map(fr).join(' → '));
      devine(`${prefix}-${num}-devine-${slug(fr(g[g.length - 1]))}`, g[g.length - 1], g);
    } else if (kind === 'frontieres') {
      const r1 = randomFrontier(4, 6, 'MOYEN', usedPairs);
      const r2 = SHORT ? null : randomFrontier(7, 10, 'EXPERT', usedPairs);
      frontieres(`${prefix}-${num}-frontieres-${slug(r1.path[0].name)}`, r2 ? [r1, r2] : [r1]);
    } else {
      const { themes, play } = randomRankle();
      rankle(`${prefix}-${num}-rankle-${slug(fr(play[5][0]))}`, themes, play);
    }
  }
}

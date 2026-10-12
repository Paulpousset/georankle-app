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
let seed = Number(arg('seed', Date.now() % 100000));

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
// --assets : seulement préparer public/ (rendu d'un lot déjà écrit, voix comprises).
if (process.argv.includes('--assets')) process.exit(0);

const write = (name, ep) => {
  writeFileSync(join(EPISODES, `${name}.json`), JSON.stringify(ep, null, 2));
  console.log('•', name);
};
const POST_TAGS = '#geographie #quiz #culturegenerale #geog #jeu';
const COMMON = { cta: 'Gratuit sur iOS et Android', icon: 'icon.png', lang: 'fr' };
const END_LINE = 'GeoG, gratuit sur iOS et Android.';

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
const CONT = { Africa: 'Afrique', Asia: 'Asie', Europe: 'Europe', Oceania: 'Océanie', Americas: 'Amériques' };
const contOf = (s) => (s.region === 'Americas' ? (s.subregion === 'South America' ? 'Am. du Sud' : 'Am. du Nord') : CONT[s.region] ?? s.region);
const short = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(1).replace('.', ',')} Md` : v >= 1e6 ? `${Math.round(v / 1e6)} M` : `${Math.round(v / 1e3)} k`);
const km2 = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.', ',')} M km²` : `${Math.round(v / 1e3)}k km²`);
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
      { label: 'Distance', value: same ? '0 km' : `${Math.round(distance(a, b)).toLocaleString('fr-FR').replace(/\s/g, ' ')} km`, state: same ? 'ok' : distance(a, b) < 1500 ? 'near' : 'info' },
      { label: 'Population', value: short(a.population), dir: same ? 0 : b.population > a.population ? 1 : -1, state: same ? 'ok' : 'ko' },
      { label: 'Superficie', value: km2(a.area), dir: same ? 0 : b.area > a.area ? 1 : -1, state: same ? 'ok' : 'ko' },
      { label: 'Côtes', value: a.coastline ? 'Côtier' : 'Enclavé', state: a.coastline === b.coastline ? 'ok' : 'ko' },
    ],
  };
}
function reaction(g, t) {
  const d = km(g, t);
  const sameCont = contOf(stats[g]) === contOf(stats[t]);
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
  const voice = [{ text: 'Trouve ce pays avant moi.', at: 0 }];
  guesses.forEach((g, i) => {
    if (i === n - 1) return;
    voice.push({ text: `${fr(g)} ?`, at: guessAt(i) + 0.1, maxLate: 0.7 });
    voice.push({ text: reaction(g, target), at: guessAt(i) + DV.TYPE + 6 * DV.FLIP + 0.1, maxLate: 0.8 });
  });
  voice.push({ text: 'Tu l’as ? Trois, deux, un…', at: pauseStart + 0.1, maxLate: 0.5 });
  voice.push({ text: `Réponse : ${fr(target)} !`, at: revealAt, maxLate: 0.6 });
  voice.push({ text: 'Trouvé en combien d’essais ? Dis-le en commentaire.', at: revealAt + 1.8, maxLate: 1 });
  voice.push({ text: END_LINE, at: end + 0.4, maxLate: 1 });
  write(name, {
    composition: 'DevineConcept',
    hook: ['Trouve ce pays', 'avant moi 🕵️'],
    intro: 'Six indices par essai',
    rows: guesses.map((g) => guessRow(g, target)),
    pause: 'Tu l’as ?',
    answer: { cc: cca2[target], name: fr(target) },
    outro: 'Trouvé en combien d’essais ?',
    outroSub: 'Dis-le en commentaire 👇',
    ...COMMON,
    voice,
    post: `Un pays mystère, six indices par essai. Tu le trouves en combien ? 🕵️\n\n${POST_TAGS}`,
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
  for (const [lo, hi, same] of [[7000, 20000, false], [3500, 7000, false], [1200, 3500, true], [0, 1500, false]]) {
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
  return { level, view: view ?? viewOf(path), path: path.map((c) => ({ id: atlasId(c), cc: cca2[c], name: fr(c) })) };
}
function frontieres(name, rounds) {
  const roundSeconds = (r) => FR.INTRO + FR.THINK + r.path.length * FR.step(r.path.length) + FR.HOLD;
  const voice = [{ text: 'Combien de frontières, minimum ?', at: 0 }];
  let s0 = 0.4;
  for (const r of rounds) {
    const a = r.path[0].name;
    const b = r.path[r.path.length - 1].name;
    const step = FR.step(r.path.length);
    const draw = s0 + FR.INTRO + FR.THINK;
    voice.push({ text: `Départ : ${a}. Arrivée : ${b}.`, at: s0 + 0.3, maxLate: 1.4 });
    voice.push({ text: 'Combien de pays entre les deux ? Cinq secondes.', at: s0 + FR.INTRO + 0.3, maxLate: 1 });
    if (step >= 0.9) r.path.slice(1, -1).forEach((c, j) => voice.push({ text: c.name, at: draw + (j + 1) * step, maxLate: 0.35 }));
    const k = r.path.length - 2;
    voice.push({ text: `${cap(NUM[k] ?? String(k))} pays !`, at: draw + r.path.length * step + 0.15, maxLate: 0.6 });
    s0 += roundSeconds(r);
  }
  voice.push({ text: 'Tu avais trouvé ? Dis-le en commentaire.', at: s0 + 0.1, maxLate: 0.8 });
  voice.push({ text: END_LINE, at: s0 + 2.6 + 0.4, maxLate: 1 });
  for (const r of rounds) console.log('  ', r.path.map((p) => p.name).join(' → '));
  const first = rounds[0].path;
  write(name, {
    composition: 'FrontieresConcept',
    hook: ['Combien de frontières', 'minimum ? 🧭'],
    rounds,
    ask: 'Combien de pays à traverser ?',
    outro: rounds.length > 1 ? 'Tu avais trouvé les deux ?' : 'Tu avais trouvé ?',
    outroSub: 'Ton score en commentaire 👇',
    ...COMMON,
    voice,
    post: `${first[0].name} → ${first[first.length - 1].name} sans avion : combien de pays minimum ? 🧭\n\n${POST_TAGS}`,
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
  play.forEach(([, t], i) => {
    const tr = turns[i];
    if (i === n - 1) {
      voice.push({ text: 'Dernier pays, dernière case…', at: turnAt(n - 2) + RK.TURN + 0.1, maxLate: 0.6 });
      voice.push({ text: `${tr.name}… ${label(t)}.`, at: turnAt(i) + 0.15, maxLate: 0.5 });
      voice.push({ text: `Aïe. ${rankWord(tr.rank)}`, at: turnAt(i) + RK.TAP + RK.COUNT + 0.1, maxLate: 0.6 });
      return;
    }
    voice.push({ text: `${tr.name} : ${label(t)}.`, at: turnAt(i) + 0.15, maxLate: 0.5 });
    voice.push({ text: rankWord(tr.rank), at: turnAt(i) + RK.TAP + RK.COUNT + 0.05, maxLate: 0.5 });
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
if (!BATCH) {
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
  for (const f of readdirSync(EPISODES)) if (f.startsWith('lot-')) rmSync(join(EPISODES, f));
  const targets = shuffle(KNOWN.filter((c) => c !== 'MNG'));
  const usedPairs = new Set(['FRACHN', 'CANARG']);
  let ti = 0;
  for (let i = 0; i < BATCH; i++) {
    const num = String(i + 1).padStart(2, '0');
    const kind = ['devine', 'frontieres', 'rankle'][i % 3];
    if (kind === 'devine') {
      let g = null;
      while (!g) g = devineGuesses(targets[ti++ % targets.length]);
      console.log('  ', g.map(fr).join(' → '));
      devine(`lot-${num}-devine-${slug(fr(g[g.length - 1]))}`, g[g.length - 1], g);
    } else if (kind === 'frontieres') {
      const r1 = randomFrontier(4, 6, 'MOYEN', usedPairs);
      const r2 = randomFrontier(7, 10, 'EXPERT', usedPairs);
      frontieres(`lot-${num}-frontieres-${slug(r1.path[0].name)}`, [r1, r2]);
    } else {
      const { themes, play } = randomRankle();
      rankle(`lot-${num}-rankle-${slug(fr(play[5][0]))}`, themes, play);
    }
  }
}

// Fiches des quiz animés « plateau TV » (composition QuizTV) dans
// ../out/episodes : un mode de jeu de l'app par fiche (capitales, drapeaux,
// silhouettes), 6 questions à 4 choix de plus en plus dures. Le joueur
// enchaîne… et se trompe à la dernière. La voix lit la question, puis la
// bonne réponse.
//
//   node quiz.mjs [--lang fr] [--mode capitals|flags|silhouette]
//
// Sans --mode, une fiche par mode (quiz-capitals-fr-v1.json…) : post.mjs fait
// tourner les modes d'un soir à l'autre. Les pays changent chaque jour.
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const EPISODES = join(HERE, '..', 'out', 'episodes');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const LANG = arg('lang', 'fr');
const ROUNDS = 6;
// Mêmes durées que src/QuizTV.tsx (placement de la voix off).
const ROUND_S = 6.4;
const PICK_S = 4.0;
const REVEAL_S = 4.6;

const stats = JSON.parse(readFileSync(join(ROOT, 'assets', 'countries_stats.json'), 'utf8'));
const notoriety = JSON.parse(readFileSync(join(ROOT, 'assets', 'notoriety.json'), 'utf8')).ranks;
const world = JSON.parse(readFileSync(join(ROOT, 'assets', 'world_polygons.json'), 'utf8'));
const cca2 = Object.fromEntries(
  [...readFileSync(join(ROOT, 'src', 'data', 'countryCodes.ts'), 'utf8').matchAll(/([A-Z]{3}): '([A-Z]{2})'/g)].map((m) => [m[1], m[2]]),
);
const shapes = Object.fromEntries(world.map((c) => [c.id, c.r]));

// Silhouette d'un pays : chemin SVG centré dans une boîte 600×600.
function shapePath(cca3, size = 600) {
  const rings = shapes[cca3];
  // Les petites îles lointaines écrasent la forme : on garde les anneaux
  // proches du plus grand.
  const area = (ring) => Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const main = rings.reduce((a, b) => (area(b) > area(a) ? b : a));
  const cx = main.reduce((s, p) => s + p[0], 0) / main.length;
  const cy = main.reduce((s, p) => s + p[1], 0) / main.length;
  const kept = rings.filter((ring) => ring === main || ring.some((p) => Math.abs(p[0] - cx) < 12 && Math.abs(p[1] - cy) < 12));
  const pts = kept.flat();
  const lat0 = (cy * Math.PI) / 180;
  const xy = (p) => [p[0] * Math.cos(lat0), -p[1]];
  const all = pts.map(xy);
  const [x0, x1] = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
  const k = (size * 0.92) / Math.max(x1 - x0, y1 - y0);
  const ox = (size - (x1 - x0) * k) / 2;
  const oy = (size - (y1 - y0) * k) / 2;
  return kept
    .map((ring) => 'M' + ring.map((p) => { const [x, y] = xy(p); return `${(ox + (x - x0) * k).toFixed(1)},${(oy + (y - y0) * k).toFixed(1)}`; }).join('L') + 'Z')
    .join('');
}

const countries = stats.filter((c) => cca2[c.cca3] && notoriety[c.cca3] && shapes[c.cca3]);
const nameOf = (c) => (LANG === 'fr' ? c.name : c.name_en);
const capitalOf = (c) => (LANG === 'fr' ? c.capital_fr || c.capital : c.capital);
// Bandes de notoriété, de la plus connue à la plus obscure, une par question.
const BANDS = [[1, 35], [20, 60], [40, 90], [60, 120], [90, 150], [120, 195]];

const MODES = {
  capitals: {
    fr: {
      category: 'Capitales', icon: '🏛️', ask: (c) => `Quelle est la capitale ${de(nameOf(c))} ?`,
      hook: ['6 capitales, 4 secondes chacune', 'Tu vas plus loin que moi ? 🔥'],
      say: '6 capitales. Si tu fais 6 sur 6, t\'es un génie.',
      tags: '#geographie #capitales #quiz #geog #culturegenerale',
    },
    en: {
      category: 'Capitals', icon: '🏛️', ask: (c) => `What is the capital of ${nameOf(c)}?`,
      hook: ['6 capitals, 4 seconds each', 'Can you beat me? 🔥'],
      say: 'Six capitals. Get six out of six and you\'re a genius.',
      tags: '#geography #capitals #quiz #geog #trivia',
    },
    answer: capitalOf,
    valid: (c) => Boolean(capitalOf(c)),
  },
  flags: {
    fr: {
      category: 'Drapeaux', icon: '🚩', ask: () => 'À quel pays est ce drapeau ?',
      hook: ['6 drapeaux, 4 secondes chacun', 'Tu en trouves combien ? 🔥'],
      say: '6 drapeaux. Tu en trouves combien ?',
      tags: '#geographie #drapeaux #quiz #geog #culturegenerale',
    },
    en: {
      category: 'Flags', icon: '🚩', ask: () => 'Which country is this flag?',
      hook: ['6 flags, 4 seconds each', 'How many can you get? 🔥'],
      say: 'Six flags. How many can you get?',
      tags: '#geography #flags #quiz #geog #trivia',
    },
    answer: nameOf,
    valid: () => true,
  },
  silhouette: {
    fr: {
      category: 'Silhouettes', icon: '🗺️', ask: () => 'Quel est ce pays ?',
      hook: ['Reconnais ces pays à leur forme', '6 silhouettes, 4 secondes 🔥'],
      say: 'Reconnais ces pays rien qu\'à leur forme.',
      tags: '#geographie #carte #quiz #geog #culturegenerale',
    },
    en: {
      category: 'Silhouettes', icon: '🗺️', ask: () => 'Which country is this?',
      hook: ['Name these countries by shape', '6 shapes, 4 seconds 🔥'],
      say: 'Name these countries just from their shape.',
      tags: '#geography #maps #quiz #geog #trivia',
    },
    answer: nameOf,
    valid: (c) => c.area > 20000,
  },
};
const COPY = {
  fr: {
    categoryTitle: 'MODE', streakTitle: 'SÉRIE', question: 'QUESTION', fail: 'Raté !', failWas: (a) => `Raté ! C'était ${a}.`,
    outro: 'Tu fais mieux ?', outroSub: 'Ton score en commentaire 👇', outroSay: 'Tu fais mieux ? GeoG, c\'est gratuit.',
    cta: 'GeoG · gratuit', post: 'Tu en as eu combien ? 👇',
  },
  en: {
    categoryTitle: 'MODE', streakTitle: 'STREAK', question: 'QUESTION', fail: 'Wrong!', failWas: (a) => `Wrong! It was ${a}.`,
    outro: 'Can you beat it?', outroSub: 'Drop your score 👇', outroSay: 'Can you beat it? GeoG is free.',
    cta: 'GeoG · free', post: 'How many did you get? 👇',
  },
};
// « du Kenya », « de la France », « des Philippines », « d'Italie »…
function de(name) {
  if (LANG !== 'fr') return name;
  if (/^(Îles|Émirats|États|Pays-Bas|Philippines|Comores|Maldives|Seychelles|Bahamas|Fidji)/.test(name)) return `des ${name}`;
  if (/^[AEIOUÉÈÎYH]/i.test(name)) return `d'${name}`;
  if (/s$/.test(name) && !/^(Laos|Belize|Mozambique)$/.test(name)) return `des ${name}`;
  if (/e$/.test(name) && !/^(Mexique|Cambodge|Mozambique|Zimbabwe)$/.test(name)) return `de la ${name}`;
  return `du ${name}`;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// Tirage par tournage (numéro du run GitHub), pas par jour : deux tournages
// le même jour donnaient la même partie, publiée deux fois (12/10).
const day = Number(process.env.GITHUB_RUN_NUMBER) || Math.floor(Date.now() / 86400000);
const modeIds = arg('mode') ? [arg('mode')] : Object.keys(MODES);
mkdirSync(EPISODES, { recursive: true });
for (const modeId of modeIds) {
  const slot = day * 7 + Object.keys(MODES).indexOf(modeId);
  const mode = MODES[modeId];
  const text = mode[LANG] ?? mode.en;
  const copy = COPY[LANG] ?? COPY.en;
  const rand = rng(slot * 104729 + 7);
  const pool = countries.filter(mode.valid);
  const used = new Set();
  const rounds = BANDS.map(([lo, hi], i) => {
    const band = pool.filter((c) => !used.has(c.cca3) && notoriety[c.cca3].rank >= lo && notoriety[c.cca3].rank <= hi);
    const c = band[Math.floor(rand() * band.length)];
    used.add(c.cca3);
    // Trois leurres du même continent (sinon n'importe où), réponses distinctes.
    const near = pool.filter((o) => o.cca3 !== c.cca3 && o.region === c.region && mode.answer(o) !== mode.answer(c));
    const far = pool.filter((o) => o.cca3 !== c.cca3 && mode.answer(o) !== mode.answer(c));
    const decoys = [];
    for (const src of [near, far]) {
      while (decoys.length < 3 && src.some((o) => !decoys.includes(o))) {
        const o = src[Math.floor(rand() * src.length)];
        if (!decoys.includes(o) && !decoys.some((d) => mode.answer(d) === mode.answer(o))) decoys.push(o);
      }
    }
    const options = [c, ...decoys].sort(() => rand() - 0.5);
    const answer = options.indexOf(c);
    const last = i === ROUNDS - 1;
    // À la dernière question, le joueur choisit un leurre.
    const pick = last ? options.findIndex((o) => o !== c) : answer;
    return {
      country: nameOf(c),
      cc: cca2[c.cca3].toLowerCase(),
      shape: modeId === 'silhouette' ? shapePath(c.cca3) : undefined,
      prompt: text.ask(c),
      options: options.map(mode.answer),
      answer,
      pick,
    };
  });
  const roundAt = (i) => i * ROUND_S;
  const total = ROUNDS * ROUND_S;
  const episode = {
    composition: 'QuizTV',
    lang: LANG,
    mode: modeId,
    hook: text.hook,
    category: text.category,
    categoryIcon: text.icon,
    categoryTitle: copy.categoryTitle,
    streakTitle: copy.streakTitle,
    questionTitle: copy.question,
    fail: copy.fail,
    rounds,
    outro: copy.outro,
    outroSub: copy.outroSub,
    cta: copy.cta,
    icon: 'icon.png',
    // Pour voice.mjs : toute la vidéo compte comme « partie ».
    clipSeconds: total + 3.5,
    trimStart: 0,
    speed: 1,
    voice: [
      { at: 0.1, text: text.say },
      ...rounds.flatMap((r, i) => [
        // La première question est sous l'accroche : on ne la lit pas.
        ...(i === 0 || modeId !== 'capitals' ? [] : [{ at: roundAt(i) + 0.5, text: r.prompt }]),
        {
          at: roundAt(i) + REVEAL_S - 0.1,
          text: i === ROUNDS - 1 ? copy.failWas(r.options[r.answer]) : `${r.options[r.answer]} !`,
          maxLate: 0.8,
        },
      ]),
      { at: total + 0.2, text: copy.outroSay },
    ],
    post: `${copy.post}\n\n${text.tags}`,
  };
  const file = `quiz-${modeId}-${LANG}-v1`;
  writeFileSync(join(EPISODES, `${file}.json`), JSON.stringify(episode, null, 2) + '\n');
  console.log('•', file, `(${modeId}) →`, rounds.map((r) => `${r.country} = ${r.options[r.answer]}`).join(' / '));
}

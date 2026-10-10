// Génère des fiches « plus ou moins » (composition PlusOuMoins) dans
// ../out/episodes, sans capture de l'app : deux pays, une statistique, le
// joueur parie PLUS ou MOINS, la valeur défile, la série monte… et casse sur
// la dernière manche, pour donner envie de faire mieux.
//
//   node plusmoins.mjs [--count 1] [--lang fr] [--theme population|area]
//
// Les chiffres viennent des données du jeu (assets/game_data.json). Les
// paires sont serrées (écart de moins de 2×) pour que chaque manche se joue.
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
const COUNT = Number(arg('count', 1));
const LANG = arg('lang', 'fr');
const ROUNDS = 6;
// Mêmes durées que src/PlusOuMoins.tsx (placement de la voix off).
const HOOK_S = 0;
const ROUND_S = 6.2;
const PICK_S = 4.0;

const data = JSON.parse(readFileSync(join(ROOT, 'assets', 'game_data.json'), 'utf8'));
const cca2 = Object.fromEntries(
  [...readFileSync(join(ROOT, 'src', 'data', 'countryCodes.ts'), 'utf8').matchAll(/([A-Z]{3}): '([A-Z]{2})'/g)].map((m) => [m[1], m[2]]),
);
const flag = (cc) => String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

// Pays que tout le monde situe : le défi est le chiffre, pas le nom.
const POOL = 'FRA DEU ITA ESP GBR PRT BEL NLD CHE AUT POL SWE NOR GRC TUR EGY MAR DZA NGA ZAF KEN ETH USA CAN MEX BRA ARG COL PER CHL RUS CHN JPN KOR IND PAK BGD IDN THA PHL VNM AUS NZL IRN IRQ SAU ISR UKR CUB VEN MDG'.split(' ');

const THEMES = {
  population: {
    fr: {
      hook: ['Plus ou moins peuplé ?', 'Tiens 6 manches sans erreur 🔥'],
      say: 'Plus ou moins peuplé ? Tiens six manches sans te tromper.',
      label: 'habitants',
      category: '👥 POPULATION',
      ask: (a, b) => `${b}, plus ou moins d'habitants que ${a} ?`,
      format: (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(2).replace('.', ',')} Md` : v >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.', ',')} M` : `${Math.round(v / 1e3)} k`),
    },
    en: {
      hook: ['More or less people?', 'Survive 6 rounds 🔥'],
      say: 'More or less people? Survive six rounds.',
      label: 'people',
      category: '👥 POPULATION',
      ask: (a, b) => `${b}: more or fewer people than ${a}?`,
      format: (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1e3)}k`),
    },
  },
  area: {
    fr: {
      hook: ['Plus grand ou plus petit ?', 'Tiens 6 manches sans erreur 🔥'],
      say: 'Plus grand ou plus petit ? Tiens six manches sans te tromper.',
      label: 'km²',
      category: '📏 SUPERFICIE',
      ask: (a, b) => `${b}, plus grand ou plus petit que ${a} ?`,
      format: (v) => Math.round(v).toLocaleString('fr-FR').replace(/ /g, ' '),
    },
    en: {
      hook: ['Bigger or smaller?', 'Survive 6 rounds 🔥'],
      say: 'Bigger or smaller? Survive six rounds.',
      label: 'km²',
      category: '📏 AREA',
      ask: (a, b) => `${b}: bigger or smaller than ${a}?`,
      format: (v) => Math.round(v).toLocaleString('en-US'),
    },
  },
};
const COPY = {
  fr: {
    more: 'PLUS', less: 'MOINS', streak: 'Série', fail: 'Raté !', failSay: 'Ah non… raté.',
    outro: 'Tu fais mieux ?', outroSub: 'Ton score en commentaire 👇', outroSay: 'Tu fais mieux ? GeoG, c\'est gratuit.',
    cta: 'GeoG · gratuit', post: 'Tu aurais tenu combien de manches ? 👇', tags: '#geographie #quiz #plusoumoins #geog #culturegenerale',
  },
  en: {
    more: 'MORE', less: 'LESS', streak: 'Streak', fail: 'Wrong!', failSay: 'Oh no… wrong.',
    outro: 'Can you beat it?', outroSub: 'Drop your score 👇', outroSay: 'Can you beat it? GeoG is free.',
    cta: 'GeoG · free', post: 'How many rounds would you survive? 👇', tags: '#geography #quiz #higherlower #geog #trivia',
  },
};

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const day = Math.floor(Date.now() / 86400000);
const themeIds = arg('theme') ? [arg('theme')] : Object.keys(THEMES);
mkdirSync(EPISODES, { recursive: true });
for (let n = 0; n < COUNT; n++) {
  const slot = day * COUNT + n;
  const themeId = themeIds[slot % themeIds.length];
  const theme = THEMES[themeId][LANG] ?? THEMES[themeId].en;
  const copy = COPY[LANG] ?? COPY.en;
  const value = (c) => c.data[themeId]?.value;
  const countries = data.countries.filter((c) => POOL.includes(c.cca3) && value(c) > 0 && cca2[c.cca3]);
  // Chaîne de ROUNDS + 1 pays, chaque pas à moins de 2× du précédent.
  const rand = rng(slot * 7919 + 17);
  let chain = null;
  for (let attempt = 0; attempt < 500 && !chain; attempt++) {
    const out = [countries[Math.floor(rand() * countries.length)]];
    while (out.length < ROUNDS + 1) {
      const prev = value(out[out.length - 1]);
      const options = countries.filter((c) => !out.includes(c) && value(c) / prev < 2 && prev / value(c) < 2);
      if (!options.length) break;
      out.push(options[Math.floor(rand() * options.length)]);
    }
    if (out.length === ROUNDS + 1) chain = out;
  }
  if (!chain) throw new Error('aucune chaîne de pays trouvée');
  const name = (c) => (LANG === 'fr' ? c.name : c.name_en);
  const cards = chain.map((c) => ({ name: name(c), flag: flag(cca2[c.cca3]), value: value(c), display: theme.format(value(c)) }));
  // Le joueur a juste partout sauf à la dernière manche.
  const rounds = cards.slice(1).map((c, i) => {
    const higher = c.value > cards[i].value;
    const last = i === ROUNDS - 1;
    return { higher, pick: last ? !higher : higher };
  });
  const total = HOOK_S + ROUNDS * ROUND_S;
  const episode = {
    composition: 'PlusOuMoins',
    lang: LANG,
    hook: theme.hook,
    label: theme.label,
    category: theme.category,
    more: copy.more,
    less: copy.less,
    streak: copy.streak,
    fail: copy.fail,
    cards,
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
      { at: 0.1, text: theme.say },
      // La manche 1 démarre sous l'accroche : pas de question lue.
      ...rounds.flatMap((r, i) => [...(i === 0 ? [] : [{
        at: HOOK_S + i * ROUND_S + 0.6,
        text: theme.ask(cards[i].name, cards[i + 1].name),
      }]), {
        at: HOOK_S + i * ROUND_S + PICK_S - 0.5,
        text: `${r.pick ? copy.more : copy.less} !`,
      }]),
      { at: HOOK_S + (ROUNDS - 1) * ROUND_S + PICK_S + 1.1, text: copy.failSay },
      { at: total + 0.2, text: copy.outroSay },
    ],
    post: `${copy.post}\n\n${copy.tags}`,
  };
  const file = `plusmoins${n + 1}-${LANG}-v1`;
  writeFileSync(join(EPISODES, `${file}.json`), JSON.stringify(episode, null, 2) + '\n');
  console.log('•', file, `(${themeId}) →`, cards.map((c) => `${c.name} ${c.display}`).join(' / '));
}

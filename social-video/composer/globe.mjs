// Fiches du format « globe » (src/GlobeQuiz.tsx) dans ../out/episodes : un
// quiz de 5 pays, du moyen à l'impossible (l'accroche montre le dernier), tiré au sort selon la date pour
// qu'aucun pays ne revienne avant plusieurs semaines. Pas de tournage : tout
// est généré, voix off comprise (voice.mjs).
//
//   node globe.mjs [--count 1] [--lang fr]
//
// Sortie : globe1-fr-v1.json, globe2-fr-v1.json… (un quiz différent par fiche).
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EPISODES = join(HERE, '..', 'out', 'episodes');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const COUNT = Number(arg('count', 1));
const LANG = arg('lang', 'fr');

// Mêmes durées que GlobeQuiz.tsx (HOOK_S, ROUND_S, TURN_S, COUNT_S).
const HOOK_S = 2.8;
const ROUND_S = 3.6;
const REVEAL_S = 0.8 + 2.0;

// [ISO alpha-2, ISO numérique (ids de world-atlas)] par niveau.
const TIERS = {
  FACILE: 'FR250 IT380 ES724 JP392 BR076 US840 AU036 IN356 CN156 RU643 CA124 MX484 EG818 GB826 DE276 AR032 GR300 TR792',
  MOYEN: 'PE604 NO578 SE752 PT620 ZA710 MA504 TH764 VN704 CL152 CO170 IR364 SA682 NG566 PH608 ID360 NZ554 PL616 UA804 KR410 IE372 MG450',
  EXPERT: 'KZ398 MN496 BO068 PY600 ET231 TZ834 LA418 KH116 MM104 AF004 PK586 DZ012 LY434 SD729 VE862 EC218 FI246 RO642 HU348 CU192 IS352 NP524',
  IMPOSSIBLE: 'BT064 RW646 BI108 MW454 LS426 SZ748 KG417 TJ762 TM795 UY858 SR740 GY328 BJ204 TG768 ER232 DJ262 MD498 MK807 AM051 GE268 AZ031 BN096 TL626 BZ084 SV222',
};
const PLAN = ['MOYEN', 'MOYEN', 'EXPERT', 'EXPERT', 'IMPOSSIBLE'];

const COPY = {
  fr: {
    level: { FACILE: 'FACILE', MOYEN: 'MOYEN', EXPERT: 'EXPERT', IMPOSSIBLE: 'IMPOSSIBLE' },
    hooks: [
      ['97 % ne trouvent pas ce pays.', 'Et toi ? 5 pays, 3 secondes 🌍'],
      ['Personne ne trouve ce pays.', 'Tu tiens jusqu’au 5e ? 😈'],
      ['Seuls 3 % le trouvent.', '5 pays, 3 secondes chacun 🌍'],
      ['Ce pays, personne ne le connaît.', 'Tu fais combien sur 5 ? 🌍'],
    ],
    say: ['Quatre-vingt-dix-sept pour cent ne trouvent pas ce pays. Et toi ?', 'Personne ne trouve ce pays. Tu tiens jusqu’au cinquième ?', 'Seuls trois pour cent le trouvent. Cinq pays, trois secondes chacun.', 'Ce pays, personne ne le connaît. Tu fais combien sur cinq ?'],
    question: 'Quel est ce pays ?',
    outro: 'Ton score sur 5 ?',
    outroSub: 'Dis-le en commentaire 👇',
    outroSay: 'Alors, ton score ? Dis-le en commentaire.',
    cta: 'GeoG · gratuit',
    post: 'Combien sur 5 ? Sois honnête 👇',
    tags: '#geographie #quiz #culturegenerale #geog #jeu #pays',
  },
  en: {
    level: { FACILE: 'EASY', MOYEN: 'MEDIUM', EXPERT: 'HARD', IMPOSSIBLE: 'IMPOSSIBLE' },
    hooks: [
      ['97% can’t find this country.', 'Can you? 5 countries, 3 seconds 🌍'],
      ['Nobody finds this country.', 'Can you make it to #5? 😈'],
    ],
    say: ['Ninety-seven percent can’t find this country. Can you?', 'Nobody finds this country. Can you make it to number five?'],
    question: 'Which country is this?',
    outro: 'Your score out of 5?',
    outroSub: 'Drop it in the comments 👇',
    outroSay: 'So, what was your score? Tell me in the comments.',
    cta: 'GeoG · free',
    post: 'How many out of 5? Be honest 👇',
    tags: '#geography #quiz #trivia #geog #countries',
  },
};
const copy = COPY[LANG] ?? COPY.en;
const names = new Intl.DisplayNames([LANG], { type: 'region' });
const flag = (cc) => String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

// Mélange déterministe (graine fixe) : l'ordre ne change pas d'un jour à
// l'autre, on avance simplement dedans avec la date.
function shuffled(list, seed) {
  const out = [...list];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const tiers = Object.fromEntries(
  Object.entries(TIERS).map(([k, v], i) => [k, shuffled(v.split(' ').map((c) => ({ cc: c.slice(0, 2), id: c.slice(2) })), 97 + i)]),
);

const day = Math.floor(Date.now() / 86400000);
mkdirSync(EPISODES, { recursive: true });
for (let n = 0; n < COUNT; n++) {
  const slot = day * COUNT + n;
  const used = {};
  const rounds = PLAN.map((level) => {
    const list = tiers[level];
    const perQuiz = PLAN.filter((l) => l === level).length;
    const k = used[level] = (used[level] ?? -1) + 1;
    const { cc, id } = list[(slot * perQuiz + k) % list.length];
    return { id, name: names.of(cc), flag: flag(cc), level: copy.level[level] };
  });
  const h = slot % copy.hooks.length;
  const total = HOOK_S + rounds.length * ROUND_S;
  const name = `globe${n + 1}-${LANG}-v1`;
  const episode = {
    composition: 'GlobeQuiz',
    lang: LANG,
    hook: copy.hooks[h],
    question: copy.question,
    rounds,
    outro: copy.outro,
    outroSub: copy.outroSub,
    cta: copy.cta,
    icon: 'icon.png',
    // Pour voice.mjs : toute la vidéo compte comme « partie ».
    clipSeconds: total + 3,
    trimStart: 0,
    speed: 1,
    voice: [
      { at: 0.1, text: copy.say[h % copy.say.length] },
      ...rounds.map((r, i) => ({ at: HOOK_S + i * ROUND_S + REVEAL_S + 0.05, text: `${r.name} !` })),
      { at: total + 0.2, text: copy.outroSay },
    ],
    post: `${copy.post}\n\n${copy.tags}`,
  };
  writeFileSync(join(EPISODES, `${name}.json`), JSON.stringify(episode, null, 2) + '\n');
  console.log('•', name, '→', rounds.map((r) => r.name).join(', '));
}

import { Composition } from 'remotion';

import { GLOBE_FPS, GlobeQuiz, globeQuizSeconds, type GlobeQuizProps } from './GlobeQuiz';
import { PLUS_FPS, PlusOuMoins, plusOuMoinsSeconds, type PlusOuMoinsProps } from './PlusOuMoins';
import { QUIZ_FPS, QuizTV, quizTVSeconds, type QuizTVProps } from './QuizTV';
import { FPS, Short, endCardSeconds, type ShortProps } from './Short';
import { AppTrailer, appTrailerSeconds, type AppTrailerProps } from './concepts/AppTrailer';
import { DevineConcept, devineSeconds, type DevineProps } from './concepts/DevineConcept';
import { EchelleConcept, echelleSeconds, type EchelleProps } from './concepts/EchelleConcept';
import { FrontieresConcept, frontieresSeconds, type FrontieresProps } from './concepts/FrontieresConcept';
import { FPS as CONCEPT_FPS } from './concepts/kit';
import { PartageConcept, partageSeconds, type PartageProps } from './concepts/PartageConcept';
import { PlusOuMoinsConcept, plusOuMoinsConceptSeconds, type PlusOuMoinsConceptProps } from './concepts/PlusOuMoinsConcept';
import { RankleConcept, rankleSeconds, type RankleProps } from './concepts/RankleConcept';

const defaultProps: ShortProps = {
  clip: 'sample.mp4',
  clipSeconds: 12,
  trimStart: 0,
  speed: 1,
  hook: 'Quel pays est le plus peuplé ? 🤔',
  subhook: 'Je tiens combien de manches ?',
  captions: [{ at: 4, text: 'Facile…' }, { at: 9, text: 'Ah. 😬' }],
  cta: 'Gratuit sur iOS et Android',
  ctaSub: 'Lien dans la bio',
  icon: 'icon.png',
};

const globeDefaults: GlobeQuizProps = {
  hook: ['97 % ne trouvent pas ce pays.', 'Et toi ? 5 pays, 3 secondes 🌍'],
  question: 'Quel est ce pays ?',
  rounds: [
    { id: '604', name: 'Pérou', flag: '🇵🇪', level: 'MOYEN' },
    { id: '764', name: 'Thaïlande', flag: '🇹🇭', level: 'MOYEN' },
    { id: '398', name: 'Kazakhstan', flag: '🇰🇿', level: 'EXPERT' },
    { id: '068', name: 'Bolivie', flag: '🇧🇴', level: 'EXPERT' },
    { id: '646', name: 'Rwanda', flag: '🇷🇼', level: 'IMPOSSIBLE' },
  ],
  outro: 'Ton score sur 5 ?',
  outroSub: 'Dis-le en commentaire 👇',
  cta: 'GeoG · gratuit',
  icon: 'icon.png',
};

const plusDefaults: PlusOuMoinsProps = {
  hook: ['Plus ou moins peuplé ?', 'Tiens 6 manches sans erreur 🔥'],
  label: 'habitants',
  category: 'Population',
  categoryIcon: '👥',
  categoryTitle: 'CATÉGORIE',
  streakTitle: 'SÉRIE',
  has: 'compte',
  hasQ: 'en compte',
  more: 'PLUS',
  less: 'MOINS',
  streak: 'Série',
  fail: 'Raté !',
  cards: [
    { name: 'France', flag: '🇫🇷', cc: 'fr', value: 68551653, display: '68,6 M' },
    { name: 'Thaïlande', flag: '🇹🇭', cc: 'th', value: 71668011, display: '71,7 M' },
  ],
  rounds: [{ higher: true, pick: true }],
  outro: 'Tu fais mieux ?',
  outroSub: 'Ton score en commentaire 👇',
  cta: 'GeoG · gratuit',
  icon: 'icon.png',
};

const quizDefaults: QuizTVProps = {
  mode: 'capitals',
  hook: ['6 capitales, 4 secondes chacune', 'Tu vas plus loin que moi ? 🔥'],
  category: 'Capitales',
  categoryIcon: '🏛️',
  categoryTitle: 'MODE',
  streakTitle: 'SÉRIE',
  fail: 'Raté !',
  rounds: [
    { country: 'Kenya', cc: 'ke', prompt: 'Quelle est la capitale du Kenya ?', options: ['Mombasa', 'Nairobi', 'Kampala', 'Dodoma'], answer: 1, pick: 1 },
  ],
  outro: 'Tu fais mieux ?',
  outroSub: 'Ton score en commentaire 👇',
  cta: 'GeoG · gratuit',
  icon: 'icon.png',
};

// Concepts « atlas » (concepts.mjs fait les vraies fiches) : petits exemples pour le studio.
const trailerDefaults: AppTrailerProps = {
  hook: ['12 jeux de géo.', 'Une seule app.'],
  shots: [{ file: 'shots/02-modes.png', title: '12 modes de jeu', sub: 'Choisis ton terrain' }],
  outro: 'GeoG',
  cta: 'Gratuit sur iOS et Android',
  ctaSub: 'Lien dans la bio',
  icon: 'icon.png',
};
const devineDefaults: DevineProps = {
  hook: ['Trouve ce pays', 'avant moi 🕵️'],
  intro: 'Six indices par essai',
  rows: [{ cc: 'mn', name: 'Mongolie', tiles: [{ label: 'Continent', value: 'Asie', state: 'ok' }] }, { cc: 'mn', name: 'Mongolie', tiles: [{ label: 'Continent', value: 'Asie', state: 'ok' }] }],
  pause: 'Tu l’as ?',
  answer: { cc: 'mn', name: 'Mongolie' },
  outro: 'Trouvé en combien d’essais ?',
  outroSub: 'Dis-le en commentaire 👇',
  cta: 'Gratuit sur iOS et Android',
  icon: 'icon.png',
};
const frontieresDefaults: FrontieresProps = {
  hook: ['Combien de frontières', 'minimum ? 🧭'],
  rounds: [{ level: 'FACILE', view: [-12, 35, 30, 60], path: [{ id: '250', cc: 'fr', name: 'France' }, { id: '276', cc: 'de', name: 'Allemagne' }, { id: '616', cc: 'pl', name: 'Pologne' }] }],
  ask: 'Combien de pays à traverser ?',
  outro: 'Tu avais trouvé ?',
  outroSub: 'Ton score en commentaire 👇',
  cta: 'Gratuit sur iOS et Android',
  icon: 'icon.png',
};
const rankleDefaults: RankleProps = {
  hook: ['Chaque pays dans', 'sa meilleure catégorie'],
  rule: 'Le plus petit total gagne',
  themes: [{ emoji: '👥', label: 'Population' }, { emoji: '📏', label: 'Superficie' }],
  turns: [{ cc: 'cn', name: 'Chine', theme: 0, rank: 2 }, { cc: 'ru', name: 'Russie', theme: 1, rank: 1 }],
  outro: 'Tu fais mieux ?',
  outroSub: 'Ton total en commentaire 👇',
  cta: 'Gratuit sur iOS et Android',
  icon: 'icon.png',
};
const plusOuMoinsDefaults: PlusOuMoinsConceptProps = {
  hook: ['Tiens 5 manches', 'sans erreur 🔥'],
  category: 'Population',
  categoryIcon: '👥',
  unit: 'habitants',
  question: '{b} : plus ou moins peuplé ?',
  more: 'PLUS',
  less: 'MOINS',
  fail: 'Raté !',
  outro: 'Tu fais mieux ?',
  outroSub: 'Ton score en commentaire 👇',
  cta: 'Gratuit sur iOS et Android',
  icon: 'icon.png',
  cards: [
    { id: '250', cc: 'fr', name: 'France', value: 68e6, display: '68,2 M' },
    { id: '276', cc: 'de', name: 'Allemagne', value: 84e6, display: '84,1 M' },
    { id: '764', cc: 'th', name: 'Thaïlande', value: 71e6, display: '71,7 M' },
  ],
  rounds: [{ higher: true, pick: true }, { higher: false, pick: true }],
};

const echelleDefaults: EchelleProps = {
  hook: ['Remets ces pays', 'à la même échelle 📏'],
  title: 'À l’échelle',
  pairLabel: 'PAIRE',
  hint: 'Agrandis ou rétrécis le pays de droite pour qu’il soit à la même échelle que celui de gauche.',
  truthHint: 'Pointillés verts : la vraie taille.',
  slider: 'plus petit · plus grand',
  submit: 'VALIDER',
  fail: 'Raté !',
  rounds: [],
  total: 0,
  max: 600,
  outro: 'Tu fais mieux ?',
  outroSub: 'Ton score en commentaire 👇',
  cta: 'Gratuit sur iOS et Android',
  icon: 'icon.png',
};

const partageDefaults: PartageProps = {
  hook: ['Coupe cette carte', 'en deux ✂️'],
  title: 'Partage équitable',
  mapLabel: 'CARTE',
  partsLabel: ['', '', 'EN DEUX', 'EN TROIS', 'EN QUATRE'],
  totalLabel: 'Population des villes : {0}',
  hints: ['', '', 'Trace un trait qui coupe la population des villes en deux parts égales.', '', ''],
  partsHint: 'Chaque couleur est une part.',
  target: 'Objectif : {0} % chacune',
  submit: 'VALIDER',
  fail: 'Raté !',
  rounds: [],
  total: 0,
  max: 600,
  outro: 'Tu fais mieux ?',
  outroSub: 'Ton score en commentaire 👇',
  cta: 'Gratuit sur iOS et Android',
  icon: 'icon.png',
};

const concepts = [
  { id: 'AppTrailer', component: AppTrailer, seconds: appTrailerSeconds, defaults: trailerDefaults },
  { id: 'DevineConcept', component: DevineConcept, seconds: devineSeconds, defaults: devineDefaults },
  { id: 'FrontieresConcept', component: FrontieresConcept, seconds: frontieresSeconds, defaults: frontieresDefaults },
  { id: 'RankleConcept', component: RankleConcept, seconds: rankleSeconds, defaults: rankleDefaults },
  { id: 'PlusOuMoinsConcept', component: PlusOuMoinsConcept, seconds: plusOuMoinsConceptSeconds, defaults: plusOuMoinsDefaults },
  { id: 'EchelleConcept', component: EchelleConcept, seconds: echelleSeconds, defaults: echelleDefaults },
  { id: 'PartageConcept', component: PartageConcept, seconds: partageSeconds, defaults: partageDefaults },
] as const;

export const Root = () => (
  <>
  {concepts.map((c) => (
    <Composition
      key={c.id}
      id={c.id}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      component={c.component as any}
      width={1080}
      height={1920}
      fps={CONCEPT_FPS}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      durationInFrames={Math.ceil(CONCEPT_FPS * (c.seconds as any)(c.defaults))}
      defaultProps={c.defaults}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil(CONCEPT_FPS * (c.seconds as any)(props)) })}
    />
  ))}
  <Composition
    id="PlusOuMoins"
    component={PlusOuMoins}
    width={1080}
    height={1920}
    fps={PLUS_FPS}
    durationInFrames={Math.ceil(PLUS_FPS * plusOuMoinsSeconds(plusDefaults))}
    defaultProps={plusDefaults}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil(PLUS_FPS * plusOuMoinsSeconds(props)) })}
  />
  <Composition
    id="QuizTV"
    component={QuizTV}
    width={1080}
    height={1920}
    fps={QUIZ_FPS}
    durationInFrames={Math.ceil(QUIZ_FPS * quizTVSeconds(quizDefaults))}
    defaultProps={quizDefaults}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil(QUIZ_FPS * quizTVSeconds(props)) })}
  />
  <Composition
    id="GlobeQuiz"
    component={GlobeQuiz}
    width={1080}
    height={1920}
    fps={GLOBE_FPS}
    durationInFrames={Math.ceil(GLOBE_FPS * globeQuizSeconds(globeDefaults))}
    defaultProps={globeDefaults}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil(GLOBE_FPS * globeQuizSeconds(props)) })}
  />
  <Composition
    id="Short"
    component={Short}
    width={1080}
    height={1920}
    fps={FPS}
    durationInFrames={FPS * 15}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.ceil(
        FPS * ((props.clipSeconds - props.trimStart) / props.speed + endCardSeconds(props)),
      ),
    })}
  />
  </>
);

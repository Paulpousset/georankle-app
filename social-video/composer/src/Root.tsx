import { Composition } from 'remotion';

import { GLOBE_FPS, GlobeQuiz, globeQuizSeconds, type GlobeQuizProps } from './GlobeQuiz';
import { PLUS_FPS, PlusOuMoins, plusOuMoinsSeconds, type PlusOuMoinsProps } from './PlusOuMoins';
import { FPS, Short, endCardSeconds, type ShortProps } from './Short';

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
  category: 'POPULATION',
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

export const Root = () => (
  <>
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

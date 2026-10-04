import { Composition } from 'remotion';

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

export const Root = () => (
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
);

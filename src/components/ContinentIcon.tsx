/**
 * The zone icon: a continent's silhouette, or the Atlas globe for "Monde".
 *
 * The shapes come from the game's own borders (see
 * scripts/build_continent_shapes.mjs), so an icon shows exactly the countries
 * you'll be quizzed on in that zone.
 *
 * Drawn with a `fill` *and* a same-colour hairline `stroke` on purpose: the
 * generated rings are per country, so without the stroke a continent renders as
 * a mosaic of disjoint countries instead of one landmass.
 */
import Svg, { Circle, Path } from 'react-native-svg';

import { CONTINENT_SHAPES } from '../data/continentShapes.gen';
import type { ContinentId } from '../data/continents';

interface ContinentIconProps {
  /** null renders the world globe. */
  continent: ContinentId | null;
  color?: string;
  size?: number;
}

/** Hairline that welds the per-country rings into one continent. */
const WELD = 1;

export function ContinentIcon({ continent, color = '#000', size = 22 }: ContinentIconProps) {
  if (!continent) {
    // "Monde" reuses the Atlas globe so the zone picker stays in the icon set.
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle
          cx={12}
          cy={12}
          r={9}
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={CONTINENT_SHAPES[continent]}
        fill={color}
        stroke={color}
        strokeWidth={WELD}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

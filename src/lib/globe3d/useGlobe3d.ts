/**
 * Renderer choice for the gameplay globes. Resolves BEFORE the WebView mounts
 * so the page never hot-swaps from 2D to 3D mid-game (that would reload the
 * frame and lose the round state):
 *   pending → hold the WebView (flag fetch is cached 5 min, so ~instant after
 *             the first screen this session)
 *   on      → three.js WebGL builder, with the vendored three source lazy-
 *             imported so it never lands in the initial web chunk
 *   off     → legacy Canvas-2D builder (flag off, reduce-motion, or any error —
 *             fail closed onto the proven renderer)
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { isFeatureEnabled } from '../featureFlags';

export type Globe3dState =
  | { status: 'pending' }
  | { status: 'off' }
  | { status: 'on'; threeSrc: string };

export function useGlobe3d(): Globe3dState {
  const [state, setState] = useState<Globe3dState>({ status: 'pending' });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [on, reduceMotion] = await Promise.all([
          isFeatureEnabled('globe_3d'),
          AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
        ]);
        if (!on || reduceMotion) {
          if (alive) setState({ status: 'off' });
          return;
        }
        const { THREE_SRC } = await import('../../vendor/threeSource');
        if (alive) setState({ status: 'on', threeSrc: THREE_SRC });
      } catch {
        if (alive) setState({ status: 'off' });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

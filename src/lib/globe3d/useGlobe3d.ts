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

/**
 * Longest the caller may sit on `pending` (= an empty globe box). The flag
 * fetch has no timeout of its own, so on a dead/flaky network it could hang for
 * the whole TCP timeout and the player would stare at a blank panel.
 */
const RESOLVE_TIMEOUT_MS = 2500;

export function useGlobe3d(): Globe3dState {
  const [state, setState] = useState<Globe3dState>({ status: 'pending' });

  useEffect(() => {
    let alive = true;
    // First answer wins: a late flag fetch must never swap the renderer under a
    // game already running on the 2D fallback.
    let settled = false;
    const settle = (next: Globe3dState) => {
      if (settled || !alive) return;
      settled = true;
      setState(next);
    };
    const timer = setTimeout(() => settle({ status: 'off' }), RESOLVE_TIMEOUT_MS);
    (async () => {
      try {
        const [on, reduceMotion] = await Promise.all([
          isFeatureEnabled('globe_3d'),
          AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
        ]);
        if (!on || reduceMotion) {
          settle({ status: 'off' });
          return;
        }
        const { THREE_SRC } = await import('../../vendor/threeSource');
        settle({ status: 'on', threeSrc: THREE_SRC });
      } catch {
        settle({ status: 'off' });
      }
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return state;
}

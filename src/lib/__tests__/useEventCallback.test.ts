/**
 * Garde de non-régression pour les minuteries d'écran multijoueur.
 *
 * Le bug d'origine : `WaitingOpponent`, `RoundSummary`, `PreGameLobby` et
 * `BotMatch` mettaient la callback du parent dans les dépendances d'un
 * `useEffect` à `setTimeout`. Comme `useMatchEngine` recrée ses neuf fonctions
 * à chaque rendu, l'effet se relançait sans cesse : le bouton « Quitter » des
 * 30 s pouvait n'apparaître jamais, et le décompte inter-manches ne jamais
 * atteindre zéro.
 *
 * Ce que ce test verrouille : l'identité est stable ET la dernière version de
 * la callback est bien celle qui s'exécute.
 */
import { renderHook } from '@testing-library/react-native';

import { useEventCallback } from '../useEventCallback';

describe('useEventCallback', () => {
  it('garde la MÊME identité quand la callback est recréée à chaque rendu', () => {
    const { result, rerender } = renderHook<
      (...a: []) => string | undefined,
      { fn: () => string }
    >(({ fn }) => useEventCallback(fn), { initialProps: { fn: () => 'a' } });
    const first = result.current;
    // Le parent re-rend avec une fonction toute neuve — le cas exact de
    // useMatchEngine, qui recrée ses fonctions à chaque rendu.
    rerender({ fn: () => 'b' });
    rerender({ fn: () => 'c' });
    expect(result.current).toBe(first);
  });

  it('appelle toujours la DERNIÈRE version, jamais une closure figée', () => {
    const { result, rerender } = renderHook<
      (...a: []) => string | undefined,
      { fn: () => string }
    >(({ fn }) => useEventCallback(fn), { initialProps: { fn: () => 'a' } });
    const stable = result.current;
    rerender({ fn: () => 'b' });
    expect(stable()).toBe('b');
  });

  it('transmet les arguments', () => {
    const spy = jest.fn((x: number, y: number) => x + y);
    const { result } = renderHook(() => useEventCallback(spy));
    expect(result.current(2, 3)).toBe(5);
    expect(spy).toHaveBeenCalledWith(2, 3);
  });

  it('tolère une callback absente (props optionnelles)', () => {
    const { result } = renderHook(() => useEventCallback<[], void>(undefined));
    expect(() => result.current()).not.toThrow();
    expect(result.current()).toBeUndefined();
  });

  it('une minuterie armée une seule fois survit aux re-rendus du parent', () => {
    jest.useFakeTimers();
    try {
      const fired = jest.fn();
      const { result, rerender } = renderHook<
        (...a: []) => void,
        { fn: () => void }
      >(({ fn }) => useEventCallback(fn), { initialProps: { fn: fired } });
      // Le consommateur arme sa minuterie avec l'identité stable…
      const t = setTimeout(() => result.current(), 30_000);
      // …et le parent re-rend 50 fois entre-temps (realtime, heartbeat, poll).
      for (let i = 0; i < 50; i++) rerender({ fn: fired });
      jest.advanceTimersByTime(30_000);
      expect(fired).toHaveBeenCalledTimes(1);
      clearTimeout(t);
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * L'intro de lancement : elle affiche le titre, rend la main après sa
 * partition, tout de suite sur un tap, plus vite en « réduire les
 * animations », et ne se rejoue pas si l'arbre est remonté.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../contexts/ThemeContext';
import { __setReducedMotionForTests } from '../../lib/motion';
import { INTRO_CHOREO, LaunchIntro, __resetLaunchIntroForTests, whenLaunchIntroDone } from '../LaunchIntro';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../lib/analytics', () => ({ track: jest.fn() }));

function mount(onDone: () => void) {
  return render(
    <ThemeProvider>
      <LaunchIntro onDone={onDone} />
    </ThemeProvider>,
  );
}

describe('LaunchIntro', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __setReducedMotionForTests(false);
    __resetLaunchIntroForTests();
  });
  afterEach(() => {
    jest.useRealTimers();
    __setReducedMotionForTests(null);
    __resetLaunchIntroForTests();
  });

  it('affiche le titre puis rend la main à la fin de la partition', () => {
    const onDone = jest.fn();
    mount(onDone);
    expect(screen.getByText('GeoGames')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(INTRO_CHOREO.exit + INTRO_CHOREO.fade - 1);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('un tap saute l’intro (fondu court)', () => {
    const onDone = jest.fn();
    mount(onDone);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.press(screen.getByTestId('launch-intro').children[0] as any);
    act(() => {
      jest.advanceTimersByTime(INTRO_CHOREO.quickFade);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    // La fin de partition ne rappelle pas une seconde fois.
    act(() => {
      jest.advanceTimersByTime(INTRO_CHOREO.exit + INTRO_CHOREO.fade);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('« réduire les animations » : part après la courte tenue', () => {
    __setReducedMotionForTests(true);
    const onDone = jest.fn();
    mount(onDone);
    act(() => {
      jest.advanceTimersByTime(INTRO_CHOREO.reducedHold + INTRO_CHOREO.quickFade);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('la barrière se lève à la fin de l’intro (et par sécurité sinon)', async () => {
    const onDone = jest.fn();
    let lifted = false;
    const gate = whenLaunchIntroDone().then(() => {
      lifted = true;
    });
    mount(onDone);
    await act(async () => {
      jest.advanceTimersByTime(INTRO_CHOREO.exit + INTRO_CHOREO.fade);
    });
    await gate;
    expect(lifted).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);

    __resetLaunchIntroForTests();
    let safety = false;
    const p = whenLaunchIntroDone().then(() => {
      safety = true;
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await p;
    expect(safety).toBe(true);
  });

  it('ne se rejoue pas pendant le même lancement', () => {
    const first = jest.fn();
    const r = mount(first);
    r.unmount();
    const second = jest.fn();
    mount(second);
    expect(screen.queryByText('GeoGames')).toBeNull();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

/**
 * Le socle des fins de partie : un bloc n'apparaît qu'à son heure, le
 * compteur atteint sa cible, et « réduire les animations » montre tout de
 * suite l'état final. Les minuteries sont simulées.
 */
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { __setReducedMotionForTests } from '../../lib/motion';
import { Reveal } from '../end/Reveal';
import { CountUp } from '../end/CountUp';
import { EndStamp } from '../end/EndStamp';

describe('Reveal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Cache renseigné = pas de sonde asynchrone qui mettrait l'état à jour
    // après la fin du test.
    __setReducedMotionForTests(false);
  });
  afterEach(() => {
    jest.useRealTimers();
    __setReducedMotionForTests(null);
  });

  it('ne monte ses enfants qu’après `at` millisecondes', () => {
    render(
      <Reveal at={700}>
        <Text>verdict</Text>
      </Reveal>,
    );
    expect(screen.queryByText('verdict')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(699);
    });
    expect(screen.queryByText('verdict')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByText('verdict')).toBeTruthy();
  });

  it('monte tout de suite à `at` 0', () => {
    render(
      <Reveal at={0}>
        <Text>tout de suite</Text>
      </Reveal>,
    );
    expect(screen.getByText('tout de suite')).toBeTruthy();
  });

  it('« réduire les animations » : visible immédiatement, quel que soit le délai', () => {
    __setReducedMotionForTests(true);
    render(
      <Reveal at={2600}>
        <Text>actions</Text>
      </Reveal>,
    );
    expect(screen.getByText('actions')).toBeTruthy();
  });

  it('prévient quand le bloc devient visible', () => {
    const onShown = jest.fn();
    render(
      <Reveal at={300} onShown={onShown}>
        <Text>x</Text>
      </Reveal>,
    );
    expect(onShown).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onShown).toHaveBeenCalledTimes(1);
  });
});

describe('CountUp', () => {
  beforeEach(() => __setReducedMotionForTests(false));
  afterEach(() => __setReducedMotionForTests(null));

  it('affiche la cible directement avec « réduire les animations »', () => {
    __setReducedMotionForTests(true);
    render(<CountUp to={820} format={(n) => `${n} pts`} />);
    expect(screen.getByText('820 pts')).toBeTruthy();
  });

  it('part de `from` avant de compter', () => {
    render(<CountUp from={1184} to={1212} at={5000} />);
    expect(screen.getByText('1184')).toBeTruthy();
  });
});

describe('EndStamp', () => {
  afterEach(() => __setReducedMotionForTests(null));

  it('rend son texte (accessible comme un texte)', () => {
    __setReducedMotionForTests(true);
    render(<EndStamp text="RÉUSSI · NIV. 42" />);
    expect(screen.getByText('RÉUSSI · NIV. 42')).toBeTruthy();
    expect(screen.getByLabelText('RÉUSSI · NIV. 42')).toBeTruthy();
  });
});

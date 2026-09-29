/**
 * L'entrée web par URL.
 *
 * `?mode=` est la cible des douze pages de mode du site : si elle casse, chaque
 * bouton « Jouer » de ces pages retombe silencieusement sur le défi du jour et
 * la page perd tout le trafic qu'elle amène. D'où ces tests.
 */
import { Platform } from 'react-native';

import { getInitialWebIntent } from '../webEntry';

/** Simule l'URL d'ouverture du navigateur. */
function atUrl(pathname: string, search = '') {
  Object.defineProperty(window, 'location', {
    value: { pathname, search },
    writable: true,
    configurable: true,
  });
}

describe('getInitialWebIntent', () => {
  const originalOS = Platform.OS;

  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  it('opens the menu on a bare /play (all modes + language button)', () => {
    atUrl('/play');
    expect(getInitialWebIntent()).toBeNull();
  });

  it('boots the daily challenge from a shared daily grid (?s=daily)', () => {
    atUrl('/play', '?s=daily');
    expect(getInitialWebIntent()).toEqual({ screen: 'daily' });
    atUrl('/play', '?code=A3F8C13E&s=daily');
    expect(getInitialWebIntent()).toEqual({ screen: 'daily' });
  });

  it('boots the daily challenge on /daily and on a trailing slash', () => {
    atUrl('/daily/');
    expect(getInitialWebIntent()).toEqual({ screen: 'daily' });
  });

  it('opens the menu on the English /en/play', () => {
    atUrl('/en/play');
    expect(getInitialWebIntent()).toBeNull();
  });

  it('honours ?mode= on every localised play path, not just /play and /en/play', () => {
    atUrl('/es/play', '?mode=quiz-flag');
    expect(getInitialWebIntent()).toEqual({ screen: 'mode', mode: 'quiz-flag' });
    atUrl('/de/play/');
    expect(getInitialWebIntent()).toBeNull();
  });

  it('boots a solo mode from ?mode=', () => {
    atUrl('/play', '?mode=quiz-flag');
    expect(getInitialWebIntent()).toEqual({ screen: 'mode', mode: 'quiz-flag' });
  });

  it('keeps working when ?mode= travels with a referral code', () => {
    atUrl('/play', '?code=A3F8C13E&mode=globe');
    expect(getInitialWebIntent()).toEqual({ screen: 'mode', mode: 'globe' });
  });

  it('falls back to the menu for a mode that cannot boot alone', () => {
    // `versus` needs a live match around it: booting into it from a URL would
    // land on an empty screen.
    atUrl('/play', '?mode=versus');
    expect(getInitialWebIntent()).toBeNull();
  });

  it('ignores junk in ?mode=', () => {
    atUrl('/play', '?mode=%3Cscript%3E');
    expect(getInitialWebIntent()).toBeNull();
  });

  it('ignores ?mode= outside the play paths', () => {
    atUrl('/guides/', '?mode=quiz-flag');
    expect(getInitialWebIntent()).toBeNull();
  });

  it('returns null on an unrelated page', () => {
    atUrl('/guides/drapeaux-du-monde/');
    expect(getInitialWebIntent()).toBeNull();
  });
});

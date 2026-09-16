/**
 * Web-only deep entry. The app's navigation is custom (a page stack, not URL
 * routes), so on web a shared link like `/play` would otherwise just load the
 * menu. This reads the opening URL once and returns the screen to boot into —
 * the zero-friction path: shared link → straight into today's daily challenge.
 *
 * It also honours `?mode=`, which the site's per-mode landing pages point at
 * (`/jeu-drapeaux/` → `/play?mode=quiz-flag`). A visitor who read a page about
 * the flag game and pressed "play" should land in the flag game, not in the
 * menu — otherwise the page's call to action quietly loses everyone it brought.
 */
import { Platform } from 'react-native';

import type { GameMode } from '../types';

export type WebIntent = { screen: 'daily' } | { screen: 'mode'; mode: GameMode } | null;

/**
 * The solo modes a URL may boot into.
 *
 * Deliberately a whitelist, not a cast: `?mode=` is attacker-controlled text,
 * and the online/ranked/story modes need a match or a campaign around them —
 * dropping straight into one from a URL would land on a broken screen.
 */
const BOOTABLE: ReadonlySet<string> = new Set<GameMode>([
  'classic',
  'streak',
  'guess',
  'globe',
  'quiz-capital',
  'quiz-flag',
  'higherlower',
  'silhouette',
  'borders',
]);

/** The screen the current web URL asks for, or null (native, or no match). */
export function getInitialWebIntent(): WebIntent {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined' || !window.location) return null;
  try {
    const path = window.location.pathname.replace(/\/+$/, '');
    const params = new URLSearchParams(window.location.search);
    // `/play`, `/daily`, and every localised shell (`/en/play`, `/es/play`…):
    // the fourteen generated languages point their mode pages at `/xx/play?mode=`
    // too, and until 16/09/2026 those landed in the daily challenge instead.
    const onPlayPath = path === '/daily' || /^(\/[a-z]{2})?\/play$/.test(path);

    const mode = params.get('mode');
    if (onPlayPath && mode && BOOTABLE.has(mode)) {
      return { screen: 'mode', mode: mode as GameMode };
    }

    if (onPlayPath || params.get('play') === 'daily') {
      return { screen: 'daily' };
    }
  } catch {
    /* ignore malformed URLs */
  }
  return null;
}

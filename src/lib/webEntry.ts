/**
 * Web-only deep entry. The app's navigation is custom (a page stack, not URL
 * routes), so on web a shared link like `/play` would otherwise just load the
 * menu. This reads the opening URL once and returns the screen to boot into —
 * the zero-friction path: shared link → straight into today's daily challenge.
 */
import { Platform } from 'react-native';

export type WebIntent = { screen: 'daily' } | null;

/** The screen the current web URL asks for, or null (native, or no match). */
export function getInitialWebIntent(): WebIntent {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined' || !window.location) return null;
  try {
    const path = window.location.pathname.replace(/\/+$/, '');
    const params = new URLSearchParams(window.location.search);
    if (path === '/play' || path === '/daily' || params.get('play') === 'daily') {
      return { screen: 'daily' };
    }
  } catch {
    /* ignore malformed URLs */
  }
  return null;
}

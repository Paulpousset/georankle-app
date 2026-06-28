import { AccessibilityInfo, type AccessibilityRole, type AccessibilityState } from 'react-native';

/**
 * Accessibility helpers shared across the app.
 *
 * The goal of these utilities is to make screen-reader support cheap to add to
 * the ~400 raw `TouchableOpacity` call sites without restructuring them: spread
 * `a11yButton(label)` onto an existing touchable, call `announce()` on key game
 * events, and reuse the touch-target constants for small icon buttons.
 *
 * Labels are expected to be already localized — pass `tr(language, fr, en)` or
 * the `t(fr, en)` shorthand from `useLanguage()` so VoiceOver/TalkBack read the
 * UI in the player's language.
 */

/** Minimum touch-target size (pt) per Apple HIG / WCAG 2.5.5. */
export const MIN_TOUCH = 44;

/**
 * `hitSlop` that expands a small icon button's touch area to ~44pt without
 * changing its visual layout. Apply to icon-only buttons (back arrows, close
 * `×`, refresh, etc.) that render smaller than {@link MIN_TOUCH}.
 */
export const ICON_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/**
 * Announce a message to the screen reader (VoiceOver / TalkBack). No-op-safe on
 * web and when the API is unavailable. Use for transient events that have no
 * persistent focusable element — round results, the active player's turn, match
 * outcomes, streak changes.
 *
 * Note: announcing the instant a screen mounts can be swallowed by the OS's own
 * screen-change announcement. Prefer announcing from the effect that fires when
 * the *outcome* is computed, or delay slightly with `setTimeout`.
 */
export function announce(message: string): void {
  if (!message) return;
  AccessibilityInfo.announceForAccessibility?.(message);
}

export interface A11yButtonOpts {
  /** Extra context read after the label, e.g. "Double tap to start the match". */
  hint?: string;
  /** Reflected as `accessibilityState.disabled`. */
  disabled?: boolean;
  /** Reflected as `accessibilityState.selected` — for toggles / chosen options. */
  selected?: boolean;
  /** Reflected as `accessibilityState.busy` — for loading buttons. */
  busy?: boolean;
  /** Reflected as `accessibilityState.expanded` — for accordions / disclosure. */
  expanded?: boolean;
  /** Override the role (defaults to `button`); e.g. `link`, `tab`, `switch`. */
  role?: AccessibilityRole;
}

interface A11yButtonProps {
  accessibilityRole: AccessibilityRole;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
}

/**
 * Returns the accessibility props for an interactive element. Spread onto a
 * `TouchableOpacity` / `Pressable` / `View` to make it a labelled, role-typed,
 * state-aware control:
 *
 * ```tsx
 * <TouchableOpacity
 *   onPress={onPlay}
 *   {...a11yButton(t('Rejouer', 'Play again'))}
 * >
 * ```
 *
 * Pass `{ selected }` for the chosen item in a group, `{ disabled }` to mirror a
 * disabled visual state, and `{ role: 'link' }` for navigation-style controls.
 */
export function a11yButton(label: string, opts: A11yButtonOpts = {}): A11yButtonProps {
  const state: AccessibilityState = {};
  if (opts.disabled != null) state.disabled = opts.disabled;
  if (opts.selected != null) state.selected = opts.selected;
  if (opts.busy != null) state.busy = opts.busy;
  if (opts.expanded != null) state.expanded = opts.expanded;

  return {
    accessibilityRole: opts.role ?? 'button',
    accessibilityLabel: label,
    ...(opts.hint ? { accessibilityHint: opts.hint } : {}),
    ...(Object.keys(state).length ? { accessibilityState: state } : {}),
  };
}

/**
 * Returns props that label a decorative/emoji element for the screen reader
 * (so 😔🏆🔥 are read as words, not skipped or read as raw glyphs). Spread onto
 * the `<Text>`/`<View>` carrying the emoji:
 *
 * ```tsx
 * <Text {...a11yImage(t('Trophée', 'Trophy'))}>🏆</Text>
 * ```
 */
export function a11yImage(label: string): { accessibilityRole: AccessibilityRole; accessibilityLabel: string; accessible: true } {
  return { accessibilityRole: 'image', accessibilityLabel: label, accessible: true };
}

/**
 * Returns props that hide a purely decorative element from the screen reader
 * (redundant icons sitting next to a labelled control, ASCII flourishes, etc.).
 */
export const a11yHidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
};

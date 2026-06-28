/**
 * A small unread indicator overlaid on the top-right of its parent — a plain
 * dot, or a count badge when `count > 0`. The app had no reusable badge before
 * (only the bespoke daily-streak flame), so friend-request and game-invite
 * indicators share this one.
 *
 * Render it as the last child of a relatively-positioned container (a
 * `TouchableOpacity`/`View` icon button or a mode card). It is purely
 * decorative — `pointerEvents="none"` so it never eats taps, and the meaning is
 * carried by the parent button's accessibility label instead.
 */
import { StyleSheet, Text, View } from 'react-native';

import { FONTS } from '../theme/typography';

/** Notification red, kept consistent with the toast error accent. */
const BADGE_RED = '#c0392b';

interface NotificationDotProps {
  /** Numeric badge; when > 0 the count is shown (capped at "9+"). */
  count?: number;
  /** Force a plain dot regardless of `count` (e.g. "something is here"). */
  show?: boolean;
  color?: string;
  /** Inset from the parent's top/right edges (negative bleaks past the edge). */
  offset?: number;
}

export function NotificationDot({ count = 0, show = false, color = BADGE_RED, offset = -3 }: NotificationDotProps) {
  const hasCount = count > 0;
  if (!hasCount && !show) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.dot,
        hasCount && styles.badge,
        { backgroundColor: color, top: offset, right: offset },
      ]}
    >
      {hasCount && <Text style={styles.text}>{count > 9 ? '9+' : count}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    minWidth: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badge: {
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 9,
    fontFamily: FONTS.monoBold,
    lineHeight: 12,
  },
});

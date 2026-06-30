import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

import { getColors } from '../theme/colors';
import { RADII } from '../theme/spacing';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Lightweight placeholder blocks for loading states. A single shared opacity
 * pulse animates all skeletons so a list previews its shape (rows of avatar +
 * text + score) instead of a bare spinner. No extra dependencies — just
 * `Animated`.
 */
export function SkeletonBlock({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const { isDarkMode } = useTheme();
  const c = getColors(isDarkMode);
  const [pulse] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <Animated.View style={[{ backgroundColor: c.border, opacity: pulse }, style]} />;
}

/** A list of placeholder rows shaped like a leaderboard entry. */
export function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonBlock style={styles.rank} />
          <SkeletonBlock style={styles.name} />
          <SkeletonBlock style={styles.score} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: RADII.lg,
    marginBottom: 8,
    gap: 12,
  },
  rank: { width: 24, height: 24, borderRadius: RADII.pill },
  name: { flex: 1, height: 16, borderRadius: RADII.sm },
  score: { width: 48, height: 16, borderRadius: RADII.sm },
});

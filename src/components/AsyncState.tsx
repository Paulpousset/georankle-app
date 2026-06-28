/**
 * Shared loading / empty / error state for async screens.
 *
 * The app had good-but-bespoke versions of this on the leaderboards and
 * matchmaking, and nothing on others. This consolidates the pattern so every
 * screen renders a consistent spinner, empty message, and error+retry.
 *
 * Usage — render it instead of your content, passing the flags from your data
 * hook; when none are set it renders `children`:
 *
 *   <AsyncState loading={loading} error={error} empty={!data?.length} onRetry={refetch}>
 *     <List ... />
 *   </AsyncState>
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

interface AsyncStateProps {
  loading?: boolean;
  error?: boolean;
  empty?: boolean;
  onRetry?: () => void;
  /** Override the default localized copy when a screen needs specific wording. */
  emptyLabel?: string;
  errorLabel?: string;
  children?: ReactNode;
  /** Fills its parent and centres the placeholder (default true). */
  fill?: boolean;
}

export function AsyncState({
  loading,
  error,
  empty,
  onRetry,
  emptyLabel,
  errorLabel,
  children,
  fill = true,
}: AsyncStateProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  if (!loading && !error && !empty) return <>{children}</>;

  const wrap = [styles.center, fill && styles.fill];

  if (loading) {
    return (
      <View style={wrap}>
        <ActivityIndicator size="large" color={c.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={wrap}>
        <Text style={[styles.message, { color: c.textMuted }]}>
          {errorLabel ?? tr(language, 'Une erreur est survenue.', 'Something went wrong.')}
        </Text>
        {onRetry && (
          <TouchableOpacity
            onPress={onRetry}
            accessibilityRole="button"
            style={[styles.retryBtn, { borderColor: c.border, backgroundColor: c.card }]}
          >
            <Text style={[styles.retryText, { color: c.accent }]}>
              {tr(language, 'Réessayer', 'Retry')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // empty
  return (
    <View style={wrap}>
      <Text style={[styles.message, { color: c.textMuted }]}>
        {emptyLabel ?? tr(language, 'Rien à afficher pour le moment.', 'Nothing to show yet.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  message: { fontSize: 13, fontFamily: FONTS.mono, textAlign: 'center' },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  retryText: { fontSize: 12, fontFamily: FONTS.monoBold },
});

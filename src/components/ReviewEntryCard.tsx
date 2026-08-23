/**
 * "Réviser mes erreurs" — the way back into the countries you got wrong.
 *
 * Shown at the top of the solo tab only when something is actually pending, so
 * a player who never misses anything never sees it. Tapping it opens a small
 * sheet listing the modes with pending countries and how many; picking one
 * starts a normal run of that mode, its questions drawn from the due list
 * first.
 *
 * The counts are read on mount and whenever `refreshKey` changes — the menu
 * bumps that after every run so the badge stays honest.
 */
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GraduationCap } from 'lucide-react-native';

import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { REVIEW_MODES, reviewCountries, reviewCounts } from '../lib/reviewPool';
import { a11yButton } from '../lib/a11y';
import { hoverLift } from '../lib/webHover';
import { tr } from '../i18n';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import type { GameMode } from '../types';

const MODE_LABELS: Partial<Record<GameMode, { fr: string; en: string }>> = {
  globe: { fr: 'Globe Géo', en: 'Geo Globe' },
  guess: { fr: 'Devinez le Pays', en: 'Guess the Country' },
  silhouette: { fr: 'Silhouette', en: 'Silhouette' },
  'quiz-capital': { fr: 'Capitales', en: 'Capitals' },
  'quiz-flag': { fr: 'Drapeaux', en: 'Flags' },
};

interface ReviewEntryCardProps {
  /** Starts a review run of `mode` over the given countries. */
  onPlayReview: (mode: GameMode, ids: string[]) => void;
  /** Bumped by the parent to force a re-read of the pending counts. */
  refreshKey?: number;
  maxWidth?: number;
}

export function ReviewEntryCard({ onPlayReview, refreshKey = 0, maxWidth }: ReviewEntryCardProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [counts, setCounts] = useState<Partial<Record<GameMode, number>>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    reviewCounts(REVIEW_MODES).then((next) => {
      if (alive) setCounts(next);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const modes = Object.keys(counts) as GameMode[];
  const total = modes.reduce((sum, m) => sum + (counts[m] ?? 0), 0);
  if (!total) return null;

  const start = async (mode: GameMode) => {
    const ids = await reviewCountries(mode);
    setOpen(false);
    if (ids.length) onPlayReview(mode, ids);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.card, { backgroundColor: c.card, borderColor: PALETTE.vermilion, maxWidth }]}
        {...a11yButton(
          tr(
            language,
            `Réviser mes erreurs, ${total} pays en attente`,
            `Review my mistakes, ${total} countries pending`,
          ),
          { hint: tr(language, 'Choisir un mode à réviser', 'Pick a mode to revise') },
        )}
        {...hoverLift}
      >
        <View style={styles.iconBox}>
          <GraduationCap color={PALETTE.vermilion} size={19} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]}>
            {tr(language, 'Réviser mes erreurs', 'Review my mistakes')}
          </Text>
          <Text style={[styles.sub, { color: c.textFaint }]}>
            {tr(
              language,
              `${total} pays à revoir · ${modes.length} mode${modes.length > 1 ? 's' : ''}`,
              `${total} countries to revisit · ${modes.length} mode${modes.length > 1 ? 's' : ''}`,
            )}
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{total}</Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <TouchableOpacity activeOpacity={1} onPress={() => setOpen(false)} style={styles.backdrop}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.sheet, { backgroundColor: c.card, borderColor: c.border }]}
          >
            <Text style={[styles.kicker, { color: c.textFaint }]}>
              {tr(language, 'RÉVISION', 'REVIEW')}
            </Text>
            <Text style={[styles.sheetTitle, { color: c.text }]}>
              {tr(language, 'Que veux-tu revoir ?', 'What do you want to revisit?')}
            </Text>
            <Text style={[styles.blurb, { color: c.textMuted }]}>
              {tr(
                language,
                'Un pays sort de la liste après deux bonnes réponses d’affilée. Ces parties rapportent des pièces mais restent hors classement.',
                'A country leaves the list after two correct answers in a row. These runs earn coins but stay off the leaderboard.',
              )}
            </Text>
            {modes.map((mode) => (
              <TouchableOpacity
                key={mode}
                onPress={() => void start(mode)}
                style={[styles.row, { borderColor: c.border }]}
                {...a11yButton(
                  tr(
                    language,
                    `${MODE_LABELS[mode]?.fr ?? mode}, ${counts[mode]} pays`,
                    `${MODE_LABELS[mode]?.en ?? mode}, ${counts[mode]} countries`,
                  ),
                )}
                {...hoverLift}
              >
                <Text style={[styles.rowLabel, { color: c.text }]}>
                  {language === 'fr' ? MODE_LABELS[mode]?.fr ?? mode : MODE_LABELS[mode]?.en ?? mode}
                </Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{counts[mode]}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    alignSelf: 'stretch',
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  iconBox: { backgroundColor: 'rgba(192,74,26,0.12)', padding: 8, borderRadius: 10 },
  title: { fontFamily: FONTS.monoBold, fontSize: 13, marginBottom: 2 },
  sub: { fontFamily: FONTS.mono, fontSize: 9 },
  badge: {
    backgroundColor: PALETTE.vermilion,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 26,
    alignItems: 'center',
  },
  badgeText: { fontFamily: FONTS.monoBold, color: '#fff', fontSize: 11 },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
  },
  sheet: { width: '100%', maxWidth: 360, borderRadius: 22, borderWidth: 1, padding: 20 },
  kicker: { fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.2, marginBottom: 3 },
  sheetTitle: { fontFamily: FONTS.headingBlack, fontSize: 18, marginBottom: 8 },
  blurb: { fontFamily: FONTS.mono, fontSize: 11, lineHeight: 16, marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginBottom: 8,
  },
  rowLabel: { fontFamily: FONTS.monoBold, fontSize: 13 },
});

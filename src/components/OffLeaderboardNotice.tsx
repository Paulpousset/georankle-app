/**
 * The "this run doesn't count" line on a solo results screen.
 *
 * Shown whenever the pool was biased — a continent scope, Entraînement, or
 * Révision. Being explicit matters: a player who just scored 5/5 over Oceania
 * should understand why the leaderboard didn't move, rather than think the
 * save failed. Renders nothing for a normal worldwide run, so screens can mount
 * it unconditionally.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Info } from 'lucide-react-native';

import { useLanguage } from '../contexts/LanguageContext';
import { offLeaderboardNotice, type SoloRunContext } from '../lib/soloResult';
import { a11yImage } from '../lib/a11y';
import { FONTS } from '../theme/typography';
import { PALETTE } from '../theme/colors';

interface OffLeaderboardNoticeProps {
  run: SoloRunContext;
  /** Muted text colour of the host screen. */
  color?: string;
}

export function OffLeaderboardNotice({ run, color = PALETTE.sand }: OffLeaderboardNoticeProps) {
  const { language } = useLanguage();
  const label = offLeaderboardNotice(run, language);
  if (!label) return null;

  return (
    <View style={styles.row} {...a11yImage(label)}>
      <Info color={color} size={13} />
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 10,
  },
  text: { fontFamily: FONTS.mono, fontSize: 11, textAlign: 'center' },
});

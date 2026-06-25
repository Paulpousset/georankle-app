import { useEffect, useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { Share2, X } from 'lucide-react-native';

import type { Language } from '../types';
import type { DailyResult } from '../lib/daily';
import { dailyModeLabel, getPuzzleNumber, msUntilNextPuzzle } from '../lib/daily';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';

interface DailyResultCardProps {
  /** The completed daily result to show, or null to hide the card. */
  result: DailyResult | null;
  streak: number;
  todayCount: number;
  isDarkMode: boolean;
  language: Language;
  onShare: () => void;
  onClose: () => void;
}

/** Formats a milliseconds countdown as `HHh MMm`. */
function formatCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** One-line score summary, matching the share message wording. */
function scoreText(result: DailyResult, language: Language): string {
  switch (result.mode) {
    case 'classic':
      return `${result.score}%`;
    case 'streak':
      return tr(language, `Série de ${result.score}`, `Streak of ${result.score}`);
    default:
      return `${result.score}`;
  }
}

/**
 * Shareable daily result card. Shown after completing a daily (via the mode's
 * own win screen this is complementary to) and from the hub when re-viewing a
 * mode already played today.
 */
export function DailyResultCard({
  result,
  streak,
  todayCount,
  isDarkMode,
  language,
  onShare,
  onClose,
}: DailyResultCardProps) {
  const c = getColors(isDarkMode);
  const [countdown, setCountdown] = useState(() => msUntilNextPuzzle());

  useEffect(() => {
    if (!result) return;
    const id = setInterval(() => setCountdown(msUntilNextPuzzle()), 60000);
    return () => clearInterval(id);
  }, [result]);

  if (!result) return null;

  const puzzle = getPuzzleNumber(new Date(result.date + 'T00:00:00Z'));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            backgroundColor: c.card,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: c.border,
            padding: 24,
            alignItems: 'center',
          }}
        >
          <TouchableOpacity
            onPress={onClose}
            style={{ position: 'absolute', top: 14, right: 14, padding: 6 }}
            accessibilityLabel={tr(language, 'Fermer', 'Close')}
          >
            <X color={c.textMuted} size={22} />
          </TouchableOpacity>

          <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 11, letterSpacing: 1 }}>
            {dailyModeLabel(result.mode, language).toUpperCase()} #{puzzle}
          </Text>

          <Text
            style={{
              fontFamily: FONTS.headingBlack,
              color: c.text,
              fontSize: 40,
              marginTop: 6,
            }}
          >
            {scoreText(result, language)}
          </Text>

          {result.grid ? (
            <Text style={{ fontSize: 24, marginTop: 12, letterSpacing: 2 }}>{result.grid}</Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 24, marginTop: 18 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: FONTS.headingBlack, color: PALETTE_FLAME, fontSize: 22 }}>
                🔥 {streak}
              </Text>
              <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 9 }}>
                {tr(language, 'SÉRIE', 'STREAK')}
              </Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: FONTS.headingBlack, color: c.accent, fontSize: 22 }}>
                {todayCount}/8
              </Text>
              <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 9 }}>
                {tr(language, "AUJOURD'HUI", 'TODAY')}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={onShare}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: c.accent,
              borderRadius: 14,
              paddingVertical: 14,
              paddingHorizontal: 28,
              marginTop: 22,
              alignSelf: 'stretch',
            }}
          >
            <Share2 color="#fff" size={20} />
            <Text style={{ fontFamily: FONTS.monoBold, color: '#fff', fontSize: 15 }}>
              {tr(language, 'PARTAGER', 'SHARE')}
            </Text>
          </TouchableOpacity>

          <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10, marginTop: 14 }}>
            {tr(language, 'Prochain défi dans ', 'Next puzzle in ')}
            {formatCountdown(countdown)}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

/** Flame accent for the streak (consistent across light/dark). */
const PALETTE_FLAME = '#e8772e';

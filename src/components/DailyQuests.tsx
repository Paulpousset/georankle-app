/**
 * DailyQuests — the day's 3 rotating missions with authoritative progress and a
 * claim button, shown on the DailyHub for signed-in players. All validation is
 * server-side (src/lib/quests.ts → quests.sql); this component only renders and
 * relays claims.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Coins } from 'lucide-react-native';

import { claimQuest, fetchDailyQuests, questLabel, type DailyQuest } from '../lib/quests';
import { track } from '../lib/analytics';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { tr } from '../i18n';
import { a11yButton, announce } from '../lib/a11y';
import { useToast } from './ToastProvider';
import { ScoreText } from './ScoreText';
import { RewardedAdButton } from './RewardedAdButton';

export function DailyQuests() {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);

  const [quests, setQuests] = useState<DailyQuest[] | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchDailyQuests().then(setQuests).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onClaim = async (quest: DailyQuest) => {
    if (claiming) return;
    setClaiming(quest.id);
    try {
      const result = await claimQuest(quest.id);
      if (result.claimed) {
        const coins = result.coins_awarded ?? quest.reward;
        toast.success(tr(language, `+${coins} pièces !`, `+${coins} coins!`));
        announce(tr(language, `${coins} pièces récupérées`, `${coins} coins claimed`));
        track('quest_claimed', { quest: quest.id, coins });
      } else if (result.reason === 'already_claimed') {
        toast.info(tr(language, 'Déjà récupérée.', 'Already claimed.'));
      } else {
        toast.info(tr(language, 'Quête pas encore terminée.', 'Quest not finished yet.'));
      }
    } catch {
      toast.error(tr(language, 'Impossible de récupérer — réessaie.', 'Could not claim — try again.'));
    } finally {
      setClaiming(null);
      refresh();
    }
  };

  // Nothing to show until the first fetch lands (avoids a layout jump).
  if (!quests || quests.length === 0) return null;

  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.border,
        padding: 14,
        marginTop: 12,
        gap: 10,
      }}
    >
      <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 9, letterSpacing: 1 }}>
        {tr(language, 'QUÊTES DU JOUR', "TODAY'S QUESTS")}
      </Text>

      {quests.map((q) => {
        const claimable = q.done && !q.claimed;
        return (
          <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                style={{
                  fontFamily: FONTS.heading,
                  color: q.claimed ? c.textFaint : c.text,
                  fontSize: 13,
                  textDecorationLine: q.claimed ? 'line-through' : 'none',
                }}
              >
                {questLabel(q.id, language)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: c.border, overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${Math.round((q.current / q.target) * 100)}%`,
                      height: '100%',
                      backgroundColor: q.done ? PALETTE.forestGreen : c.accent,
                    }}
                  />
                </View>
                <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 10 }}>
                  {q.current}/{q.target}
                </Text>
              </View>
            </View>

            {claimable ? (
              <TouchableOpacity
                onPress={() => onClaim(q)}
                disabled={claiming === q.id}
                {...a11yButton(
                  tr(language, `Récupérer ${q.reward} pièces`, `Claim ${q.reward} coins`),
                  { disabled: claiming === q.id },
                )}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: PALETTE.forestGreen,
                  borderRadius: 10,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  opacity: claiming === q.id ? 0.6 : 1,
                }}
              >
                {claiming === q.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Coins color="#ffd700" size={14} />
                )}
                <ScoreText style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 13 }}>
                  +{q.reward}
                </ScoreText>
              </TouchableOpacity>
            ) : (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 }}
                accessible
                accessibilityLabel={
                  q.claimed
                    ? tr(language, 'Récompense récupérée', 'Reward claimed')
                    : tr(language, `Récompense : ${q.reward} pièces`, `Reward: ${q.reward} coins`)
                }
              >
                <Coins color={q.claimed ? c.textFaint : '#ffd700'} size={13} />
                <ScoreText
                  style={{
                    color: q.claimed ? c.textFaint : c.textMuted,
                    fontFamily: FONTS.monoBold,
                    fontSize: 12,
                  }}
                >
                  {q.claimed ? '✓' : `+${q.reward}`}
                </ScoreText>
              </View>
            )}
          </View>
        );
      })}

      {/* Bonus ad slot (invisible while the rewarded_ads flag is off). */}
      <RewardedAdButton context="quests" />
    </View>
  );
}

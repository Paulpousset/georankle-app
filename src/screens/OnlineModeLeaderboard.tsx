import { useCallback } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Award } from 'lucide-react-native';

import { supabase } from '../lib/supabase';
import { useCachedData } from '../lib/cache';
import { log } from '../lib/log';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, a11yImage } from '../lib/a11y';
import { AsyncState } from '../components/AsyncState';
import { SkeletonRows } from '../components/Skeleton';
import { TruncatedText } from '../components/TruncatedText';
import type { MatchMode } from '../types';

interface WinEntry {
  user_id: string;
  username: string;
  wins: number;
  total: number;
  winRate: number;
}

interface Props {
  mode: MatchMode;
  accent: string;
  onOpenPlayer?: (userId: string, username?: string | null) => void;
}

const MEDAL_COLORS = ['#c4872a', '#7aa0c4', '#a08060'];

export function OnlineModeLeaderboard({ mode, accent, onOpenPlayer }: Props) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  const fetchLeaderboard = useCallback(async (): Promise<WinEntry[]> => {
    const { data: matches, error } = await supabase
      .from('matches')
      .select('player1_id, player2_id, p1_rounds_won, p2_rounds_won')
      .eq('game_mode', mode)
      .eq('status', 'completed');

    if (error) {
      log.error('Online leaderboard fetch error:', error);
      throw error;
    }

    if (!matches || matches.length === 0) {
      return [];
    }

    const stats: Record<string, { wins: number; total: number }> = {};
    const userIds = new Set<string>();

    for (const m of matches) {
      if (!m.player1_id || !m.player2_id) continue;
      userIds.add(m.player1_id);
      userIds.add(m.player2_id);

      if (!stats[m.player1_id]) stats[m.player1_id] = { wins: 0, total: 0 };
      if (!stats[m.player2_id]) stats[m.player2_id] = { wins: 0, total: 0 };

      stats[m.player1_id].total++;
      stats[m.player2_id].total++;

      if ((m.p1_rounds_won ?? 0) > (m.p2_rounds_won ?? 0)) {
        stats[m.player1_id].wins++;
      } else if ((m.p2_rounds_won ?? 0) > (m.p1_rounds_won ?? 0)) {
        stats[m.player2_id].wins++;
      }
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', Array.from(userIds));

    const usernameMap: Record<string, string> = {};
    for (const p of profiles ?? []) {
      usernameMap[p.id] = p.username ?? (language === 'fr' ? 'Anonyme' : 'Anonymous');
    }

    return Object.entries(stats)
      .filter(([, s]) => s.total >= 1)
      .map(([user_id, s]) => ({
        user_id,
        username: usernameMap[user_id] ?? 'Anonyme',
        wins: s.wins,
        total: s.total,
        winRate: Math.round((s.wins / s.total) * 100),
      }))
      .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)
      .slice(0, 50);
  }, [mode, language]);

  const {
    data: cachedData,
    loading,
    error,
    refetch,
  } = useCachedData<WinEntry[]>(`online-leaderboard:${mode}`, fetchLeaderboard);
  const data = cachedData ?? [];

  const renderItem = useCallback(
    ({ item, index }: { item: WinEntry; index: number }) => {
      const isTop3 = index < 3;
      const rankLabel = tr(language, `Rang ${index + 1}`, `Rank ${index + 1}`);
      return (
        <TouchableOpacity
          activeOpacity={onOpenPlayer ? 0.6 : 1}
          disabled={!onOpenPlayer}
          onPress={() => onOpenPlayer?.(item.user_id, item.username)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 15,
            borderRadius: 14,
            marginBottom: 8,
            borderWidth: 1,
            backgroundColor: c.card,
            borderColor: c.border,
          }}
          {...a11yButton(`${rankLabel}, ${item.username}`, {
            disabled: !onOpenPlayer,
            hint: onOpenPlayer ? tr(language, 'Voir le profil', 'View profile') : undefined,
          })}
        >
          <View style={{ width: 40, alignItems: 'center' }}>
            {isTop3 ? (
              <Award size={24} color={MEDAL_COLORS[index]} {...a11yImage(rankLabel)} />
            ) : (
              <Text style={{ fontFamily: FONTS.monoBold, color: c.textMuted }}>{index + 1}</Text>
            )}
          </View>
          <View style={{ flex: 1, paddingLeft: 10 }}>
            <TruncatedText style={{ fontFamily: FONTS.heading, color: c.text }}>
              {item.username}
            </TruncatedText>
            <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10 }}>
              {item.wins}V / {item.total - item.wins}D
            </Text>
          </View>
          <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 16, color: accent, marginLeft: 8 }}>
            {item.winRate}%
          </Text>
        </TouchableOpacity>
      );
    },
    [c, accent, onOpenPlayer],
  );

  return (
    <AsyncState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingContent={<SkeletonRows />}
      errorLabel={
        language === 'fr'
          ? 'Impossible de charger le classement.'
          : 'Could not load the leaderboard.'
      }
    >
      <FlatList
        data={data}
        keyExtractor={(item) => item.user_id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 10, paddingBottom: 20 }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 40, fontFamily: FONTS.mono, color: c.textMuted }}>
            {language === 'fr' ? 'Aucune partie enregistrée' : 'No games recorded yet'}
          </Text>
        }
      />
    </AsyncState>
  );
}

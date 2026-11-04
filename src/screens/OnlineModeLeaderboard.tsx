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

  // Aggregated in SQL (online_mode_leaderboard): reading every completed match
  // was capped at 1000 rows and grew with each game played.
  const fetchLeaderboard = useCallback(async (): Promise<WinEntry[]> => {
    const { data, error } = await supabase.rpc('online_mode_leaderboard', {
      p_mode: mode,
      p_limit: 50,
    });

    if (error) {
      log.error('Online leaderboard fetch error:', error);
      throw error;
    }

    return (data ?? []).map((row) => ({
      user_id: row.user_id,
      username: row.username ?? tr(language, 'Anonyme', 'Anonymous'),
      wins: row.wins,
      total: row.total,
      winRate: Math.round((row.wins / row.total) * 100),
    }));
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
      const rankLabel = tr(language, 'Rang {0}', 'Rank {0}', [index + 1]);
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
        tr(language, 'Impossible de charger le classement.', 'Could not load the leaderboard.')
      }
    >
      <FlatList
        data={data}
        keyExtractor={(item) => item.user_id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 10, paddingBottom: 20 }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 40, fontFamily: FONTS.mono, color: c.textMuted }}>
            {tr(language, 'Aucune partie enregistrée', 'No games recorded yet')}
          </Text>
        }
      />
    </AsyncState>
  );
}

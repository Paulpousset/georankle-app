import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Award } from 'lucide-react-native';

import { supabase } from '../lib/supabase';
import { useCachedData } from '../lib/cache';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { getTodayUTC } from '../lib/daily';
import { Avatar } from '../components/Avatar';
import type { AvatarConfig, GameMode, Language } from '../types';

interface DailyEntry {
  user_id: string;
  username: string;
  avatarConfig: AvatarConfig | null;
  avatarUrl: string | null;
  score: number;
}

interface Props {
  mode: GameMode;
  language: Language;
  isDarkMode: boolean;
  accent: string;
  currentUserId?: string | null;
  onOpenPlayer?: (userId: string, username?: string | null) => void;
}

const MEDAL_COLORS = ['#c4872a', '#7aa0c4', '#a08060'];

/** Format a daily score for display, matching each mode's natural unit. */
function formatScore(mode: GameMode, score: number, language: Language): string {
  if (mode === 'classic') return `${score}%`;
  if (mode === 'streak') return `${score}`;
  return `${score} ${language === 'fr' ? 'pts' : 'pts'}`;
}

/** Per-mode daily leaderboard: today's best score for the given mode. */
export function DailyLeaderboard({ mode, language, isDarkMode, accent, currentUserId, onOpenPlayer }: Props) {
  const c = getColors(isDarkMode);
  const today = getTodayUTC();

  const fetchLeaderboard = useCallback(async (): Promise<DailyEntry[]> => {
    const { data, error } = await supabase
      .from('daily_results')
      .select('score, user_id, profiles!daily_results_user_id_fkey(username, avatar_config, avatar_url)')
      .eq('puzzle_date', today)
      .eq('game_mode', mode)
      .order('score', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Daily leaderboard fetch error:', error);
      throw error;
    }

    return (data ?? []).map((row: any) => ({
      user_id: row.user_id,
      username: row.profiles?.username ?? (language === 'fr' ? 'Anonyme' : 'Anonymous'),
      avatarConfig: (row.profiles?.avatar_config as AvatarConfig | null) ?? null,
      avatarUrl: row.profiles?.avatar_url ?? null,
      score: row.score,
    }));
  }, [mode, today, language]);

  // ttl: 0 → always revalidate on open. A leaderboard changes constantly (and
  // right after you play), so never trust a cached snapshot beyond first paint.
  const { data: cachedData, loading, refreshing, error, refetch } = useCachedData<DailyEntry[]>(
    `daily-leaderboard:${mode}:${today}`,
    fetchLeaderboard,
    { ttl: 0 },
  );
  const data = cachedData ?? [];

  const renderItem = useCallback(
    ({ item, index }: { item: DailyEntry; index: number }) => {
      const isTop3 = index < 3;
      const isMe = !!currentUserId && item.user_id === currentUserId;
      return (
        <TouchableOpacity
          activeOpacity={onOpenPlayer ? 0.6 : 1}
          disabled={!onOpenPlayer}
          onPress={() => onOpenPlayer?.(item.user_id, item.username)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            borderRadius: 14,
            marginBottom: 8,
            borderWidth: isMe ? 2 : 1,
            backgroundColor: c.card,
            borderColor: isMe ? accent : c.border,
          }}
        >
          <View style={{ width: 34, alignItems: 'center' }}>
            {isTop3 ? (
              <Award size={24} color={MEDAL_COLORS[index]} />
            ) : (
              <Text style={{ fontFamily: FONTS.monoBold, color: c.textMuted }}>{index + 1}</Text>
            )}
          </View>
          <Avatar
            config={item.avatarConfig}
            photoUrl={item.avatarUrl}
            username={item.username}
            size={34}
          />
          <View style={{ flex: 1, paddingLeft: 10 }}>
            <Text style={{ fontFamily: FONTS.heading, color: c.text }} numberOfLines={1}>
              {item.username}
              {isMe ? (language === 'fr' ? ' (toi)' : ' (you)') : ''}
            </Text>
          </View>
          <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 16, color: accent }}>
            {formatScore(mode, item.score, language)}
          </Text>
        </TouchableOpacity>
      );
    },
    [c, accent, onOpenPlayer, currentUserId, mode, language],
  );

  // Show the spinner while loading, or while revalidating a (possibly stale)
  // empty cache — avoids briefly flashing "nobody played" right after you play.
  if (loading || (refreshing && data.length === 0)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
        <Text style={{ textAlign: 'center', fontFamily: FONTS.mono, color: c.textMuted }}>
          {language === 'fr' ? 'Impossible de charger le classement.' : 'Could not load the leaderboard.'}
        </Text>
        <TouchableOpacity
          onPress={refetch}
          accessibilityRole="button"
          style={{
            marginTop: 16,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
          }}
        >
          <Text style={{ fontFamily: FONTS.monoBold, fontSize: 12, color: accent }}>
            {language === 'fr' ? 'Réessayer' : 'Retry'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.user_id}
      renderItem={renderItem}
      contentContainerStyle={{ padding: 10, paddingBottom: 20 }}
      ListEmptyComponent={
        <Text style={{ textAlign: 'center', marginTop: 40, fontFamily: FONTS.mono, color: c.textMuted }}>
          {language === 'fr'
            ? "Personne n'a encore joué ce défi aujourd'hui.\nSois le premier !"
            : 'Nobody has played this challenge today yet.\nBe the first!'}
        </Text>
      }
    />
  );
}

import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Award } from 'lucide-react-native';

import { supabase } from '../lib/supabase';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import type { Language, MatchMode } from '../types';

interface WinEntry {
  user_id: string;
  username: string;
  wins: number;
  total: number;
  winRate: number;
}

interface Props {
  mode: MatchMode;
  language: Language;
  isDarkMode: boolean;
  accent: string;
}

const MEDAL_COLORS = ['#c4872a', '#7aa0c4', '#a08060'];

export function OnlineModeLeaderboard({ mode, language, isDarkMode, accent }: Props) {
  const c = getColors(isDarkMode);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WinEntry[]>([]);

  useEffect(() => {
    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const fetch = async () => {
    setLoading(true);

    const { data: matches, error } = await supabase
      .from('matches')
      .select('player1_id, player2_id, p1_rounds_won, p2_rounds_won')
      .eq('game_mode', mode)
      .eq('status', 'completed');

    if (error || !matches || matches.length === 0) {
      setData([]);
      setLoading(false);
      return;
    }

    const stats: Record<string, { wins: number; total: number }> = {};
    const userIds = new Set<string>();

    for (const m of matches) {
      if (!m.player2_id) continue;
      userIds.add(m.player1_id);
      userIds.add(m.player2_id);

      if (!stats[m.player1_id]) stats[m.player1_id] = { wins: 0, total: 0 };
      if (!stats[m.player2_id]) stats[m.player2_id] = { wins: 0, total: 0 };

      stats[m.player1_id].total++;
      stats[m.player2_id].total++;

      if (m.p1_rounds_won > m.p2_rounds_won) {
        stats[m.player1_id].wins++;
      } else if (m.p2_rounds_won > m.p1_rounds_won) {
        stats[m.player2_id].wins++;
      }
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, username')
      .in('user_id', Array.from(userIds));

    const usernameMap: Record<string, string> = {};
    for (const p of profiles ?? []) {
      usernameMap[p.user_id] = p.username ?? 'Anonyme';
    }

    const result: WinEntry[] = Object.entries(stats)
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

    setData(result);
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={accent} />
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(_, i) => i.toString()}
      renderItem={({ item, index }) => {
        const isTop3 = index < 3;
        return (
          <View
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
          >
            <View style={{ width: 40, alignItems: 'center' }}>
              {isTop3 ? (
                <Award size={24} color={MEDAL_COLORS[index]} />
              ) : (
                <Text style={{ fontFamily: FONTS.monoBold, color: c.textMuted }}>{index + 1}</Text>
              )}
            </View>
            <View style={{ flex: 1, paddingLeft: 10 }}>
              <Text style={{ fontFamily: FONTS.heading, color: c.text }}>{item.username}</Text>
              <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10 }}>
                {item.wins}V / {item.total - item.wins}D
              </Text>
            </View>
            <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 16, color: accent }}>
              {item.winRate}%
            </Text>
          </View>
        );
      }}
      contentContainerStyle={{ padding: 10, paddingBottom: 20 }}
      ListEmptyComponent={
        <Text style={{ textAlign: 'center', marginTop: 40, fontFamily: FONTS.mono, color: c.textMuted }}>
          {language === 'fr' ? 'Aucune partie enregistrée' : 'No games recorded yet'}
        </Text>
      }
    />
  );
}

import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Award, LayoutGrid, Zap } from 'lucide-react-native';

import { supabase } from '../lib/supabase';
import { useCachedData } from '../lib/cache';
import { log } from '../lib/log';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, a11yImage, ICON_HIT_SLOP } from '../lib/a11y';
import { AsyncState } from '../components/AsyncState';
import { SkeletonRows } from '../components/Skeleton';
import { TruncatedText } from '../components/TruncatedText';

type Tab = 'classic' | 'streak';

interface LeaderboardEntry {
  score: number;
  user_id: string;
  profiles?: { username?: string | null } | null;
}

interface LeaderboardProps {
  onOpenPlayer?: (userId: string, username?: string | null) => void;
}

const MEDAL_COLORS = ['#c4872a', '#7aa0c4', '#a08060']; // Gold → sand, Silver → nightMuted, Bronze → brownLight

const Leaderboard = ({ onOpenPlayer }: LeaderboardProps) => {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [activeTab, setActiveTab] = useState<Tab>('classic');

  const fetchLeaderboard = useCallback(async (): Promise<LeaderboardEntry[]> => {
    const { data: scores, error } = await supabase
      .from('scores')
      .select(
        `
        score,
        user_id,
        profiles!scores_user_id_fkey (
          username
        )
      `,
      )
      .eq('game_mode', activeTab)
      .order('score', { ascending: false })
      .limit(50);

    if (error) {
      log.error('Leaderboard fetch error:', error);
      throw error;
    }

    const seenUsers: Record<string, boolean> = {};
    const isClassic = activeTab === 'classic';
    return (scores as unknown as LeaderboardEntry[]).filter((item) => {
      if (isClassic && item.score > 100) return false;
      if (!seenUsers[item.user_id]) {
        seenUsers[item.user_id] = true;
        return true;
      }
      return false;
    });
  }, [activeTab]);

  const {
    data: cachedData,
    loading,
    error,
    refetch,
  } = useCachedData<LeaderboardEntry[]>(`leaderboard:${activeTab}`, fetchLeaderboard);
  const data = cachedData ?? [];

  const renderItem = useCallback(({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isTop3 = index < 3;
    const name = item.profiles?.username || (language === 'fr' ? 'Joueur Anonyme' : 'Anonymous Player');
    const rankLabel = tr(language, `Rang ${index + 1}`, `Rank ${index + 1}`);

    return (
      <TouchableOpacity
        activeOpacity={onOpenPlayer ? 0.6 : 1}
        disabled={!onOpenPlayer}
        onPress={() => onOpenPlayer?.(item.user_id, item.profiles?.username ?? null)}
        style={[
          styles.itemRow,
          { backgroundColor: c.card, borderColor: c.border },
        ]}
        {...a11yButton(`${rankLabel}, ${name}`, {
          disabled: !onOpenPlayer,
          hint: onOpenPlayer ? tr(language, 'Voir le profil', 'View profile') : undefined,
        })}
      >
        <View style={styles.rankContainer}>
          {isTop3 ? (
            <Award size={24} color={MEDAL_COLORS[index]} {...a11yImage(rankLabel)} />
          ) : (
            <Text style={[styles.rankText, { color: c.textMuted }]}>{index + 1}</Text>
          )}
        </View>

        <View style={styles.userInfo}>
          <TruncatedText style={[styles.username, { color: c.text }]}>{name}</TruncatedText>
        </View>

        <View style={styles.scoreContainer}>
          <Text
            style={[
              styles.scoreValue,
              { color: activeTab === 'classic' ? '#2a6e3f' : '#c4872a' },
            ]}
          >
            {activeTab === 'classic' ? `${item.score}%` : `${item.score} pts`}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [c, language, activeTab, onOpenPlayer]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={[styles.title, { color: c.text }]}>
        {language === 'fr' ? 'Classement Mondial' : 'Global Leaderboard'}
      </Text>

      <View style={[styles.tabs, { backgroundColor: c.card, borderColor: c.border }]}>
        <TouchableOpacity
          onPress={() => setActiveTab('classic')}
          style={[styles.tab, activeTab === 'classic' && { backgroundColor: '#2a6e3f' }]}
          {...a11yButton(tr(language, 'Rankle', 'Rankle'), { role: 'tab', selected: activeTab === 'classic' })}
        >
          <LayoutGrid size={18} color={activeTab === 'classic' ? 'white' : c.textMuted} />
          <Text style={[styles.tabText, { color: activeTab === 'classic' ? 'white' : c.textMuted }]}>
            RANKLE
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('streak')}
          style={[styles.tab, activeTab === 'streak' && { backgroundColor: '#c4872a' }]}
          {...a11yButton(tr(language, 'Streak', 'Streak'), { role: 'tab', selected: activeTab === 'streak' })}
        >
          <Zap size={18} color={activeTab === 'streak' ? 'white' : c.textMuted} />
          <Text style={[styles.tabText, { color: activeTab === 'streak' ? 'white' : c.textMuted }]}>
            STREAK
          </Text>
        </TouchableOpacity>
      </View>

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
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: c.textMuted }]}>
              {language === 'fr' ? 'Aucun score enregistré' : 'No scores recorded yet'}
            </Text>
          }
        />
      </AsyncState>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 10 },
  title: {
    fontSize: 24,
    fontFamily: FONTS.headingBlack,
    textAlign: 'center',
    marginBottom: 20,
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 20,
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 10,
    gap: 8,
  },
  tabText: { fontFamily: FONTS.monoBold, fontSize: 12 },
  listContent: { paddingBottom: 20 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
  },
  rankContainer: { width: 40, alignItems: 'center' },
  rankText: { fontFamily: FONTS.monoBold },
  userInfo: { flex: 1, paddingLeft: 10 },
  username: { fontFamily: FONTS.heading },
  scoreContainer: { alignItems: 'flex-end' },
  scoreValue: { fontFamily: FONTS.headingBlack, fontSize: 16 },
  emptyText: { textAlign: 'center', marginTop: 40, fontFamily: FONTS.mono },
});

export default Leaderboard;

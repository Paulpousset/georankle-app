import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Award, LayoutGrid, Zap } from 'lucide-react-native';

import { supabase } from '../lib/supabase';
import type { Language } from '../types';

type Tab = 'classic' | 'streak';

interface LeaderboardEntry {
  score: number;
  user_id: string;
  profiles?: { username?: string | null } | null;
}

interface LeaderboardProps {
  language: Language;
  isDarkMode: boolean;
}

const MEDAL_COLORS = ['#fbbf24', '#94a3b8', '#b45309']; // Gold, Silver, Bronze

const Leaderboard = ({ language, isDarkMode }: LeaderboardProps) => {
  const [activeTab, setActiveTab] = useState<Tab>('classic');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    fetchLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchLeaderboard = async () => {
    setLoading(true);

    // Classic now stores efficiency (%), so highest is best — same as streak.
    const isClassic = activeTab === 'classic';

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
      console.error('Leaderboard fetch error:', error);
    } else {
      // Keep only each user's single best score.
      const seenUsers: Record<string, boolean> = {};
      const filteredData = (scores as unknown as LeaderboardEntry[]).filter((item) => {
        // Ignore legacy classic scores (> 100), which were total ranks.
        if (isClassic && item.score > 100) return false;
        if (!seenUsers[item.user_id]) {
          seenUsers[item.user_id] = true;
          return true;
        }
        return false;
      });
      setData(filteredData);
    }
    setLoading(false);
  };

  const renderItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isTop3 = index < 3;

    return (
      <View style={[styles.itemRow, isDarkMode && styles.itemRowDark]}>
        <View style={styles.rankContainer}>
          {isTop3 ? (
            <Award size={24} color={MEDAL_COLORS[index]} />
          ) : (
            <Text style={[styles.rankText, isDarkMode && styles.textDark]}>{index + 1}</Text>
          )}
        </View>

        <View style={styles.userInfo}>
          <Text style={[styles.username, isDarkMode && styles.textDark]}>
            {item.profiles?.username || 'Joueur Anonyme'}
          </Text>
        </View>

        <View style={styles.scoreContainer}>
          <Text
            style={[
              styles.scoreValue,
              activeTab === 'classic' ? styles.classicColor : styles.streakColor,
            ]}
          >
            {activeTab === 'classic' ? `${item.score}%` : `${item.score} pts`}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, isDarkMode && styles.textDark]}>
        {language === 'fr' ? 'Classement Mondial' : 'Global Leaderboard'}
      </Text>

      <View style={styles.tabs}>
        <TouchableOpacity
          onPress={() => setActiveTab('classic')}
          style={[styles.tab, activeTab === 'classic' && styles.activeTabClassic]}
        >
          <LayoutGrid size={18} color={activeTab === 'classic' ? 'white' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'classic' && styles.activeTabText]}>
            CLASSIC
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('streak')}
          style={[styles.tab, activeTab === 'streak' && styles.activeTabStreak]}
        >
          <Zap size={18} color={activeTab === 'streak' ? 'white' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'streak' && styles.activeTabText]}>
            STREAK
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(_item, index) => index.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {language === 'fr' ? 'Aucun score enregistré' : 'No scores recorded yet'}
            </Text>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 10 },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#1e293b',
  },
  tabs: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    gap: 8,
  },
  activeTabClassic: { backgroundColor: '#10b981' },
  activeTabStreak: { backgroundColor: '#fbbf24' },
  tabText: { fontWeight: 'bold', color: '#64748b', fontSize: 13 },
  activeTabText: { color: 'white' },
  listContent: { paddingBottom: 20 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  itemRowDark: { backgroundColor: '#1e293b', borderColor: '#334155' },
  rankContainer: { width: 40, alignItems: 'center' },
  rankText: { fontWeight: 'bold', color: '#64748b' },
  userInfo: { flex: 1, paddingLeft: 10 },
  username: { fontWeight: 'bold', color: '#1e293b' },
  scoreContainer: { alignItems: 'flex-end' },
  scoreValue: { fontWeight: '900', fontSize: 16 },
  classicColor: { color: '#10b981' },
  streakColor: { color: '#fbbf24' },
  textDark: { color: '#f8fafc' },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { textAlign: 'center', color: '#64748b', marginTop: 40 },
});

export default Leaderboard;

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { supabase } from './supabase';
import { Trophy, Zap, LayoutGrid, Award } from 'lucide-react-native';

const Leaderboard = ({ language, isDarkMode }) => {
  const [activeTab, setActiveTab] = useState('classic'); // 'classic' or 'streak'
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);

  useEffect(() => {
    fetchLeaderboard();
  }, [activeTab]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    
    // Pour le mode Classic : on veut le plus petit score (rang total minimum)
    // Pour le mode Streak : on veut le plus grand score (streak maximum)
    const isClassic = activeTab === 'classic';
    
    // On récupère les meilleurs scores par utilisateur
    // Pour le mode Classic : score stocke désormais l'efficacité (%), donc on veut le MAX
    // Pour le mode Streak : on veut toujours le MAX
    let query = supabase
      .from('scores')
      .select(`
        score,
        user_id,
        profiles!scores_user_id_fkey (
          username
        )
      `)
      .eq('game_mode', activeTab);

    query = query.order('score', { ascending: false });

    const { data: scores, error } = await query.limit(50);

    if (error) {
      console.error('Leaderboard fetch error:', error);
    } else {
      // Filtrer pour ne garder que le meilleur score unique par utilisateur
      const uniqueUsers = {};
      const filteredData = scores.filter(item => {
        // En mode classic, on ignore les scores aberrants (> 100) qui correspondent aux anciens scores
        if (isClassic && item.score > 100) return false;
        
        if (!uniqueUsers[item.user_id]) {
          uniqueUsers[item.user_id] = true;
          return true;
        }
        return false;
      });
      setData(filteredData);
    }
    setLoading(false);
  };

  const renderItem = ({ item, index }) => {
    const isTop3 = index < 3;
    const colors = ['#fbbf24', '#94a3b8', '#b45309']; // Gold, Silver, Bronze

    return (
      <View style={[styles.itemRow, isDarkMode && styles.itemRowDark]}>
        <View style={styles.rankContainer}>
          {isTop3 ? (
            <Award size={24} color={colors[index]} />
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
          <Text style={[styles.scoreValue, activeTab === 'classic' ? styles.classicColor : styles.streakColor]}>
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

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity 
          onPress={() => setActiveTab('classic')}
          style={[styles.tab, activeTab === 'classic' && styles.activeTabClassic]}
        >
          <LayoutGrid size={18} color={activeTab === 'classic' ? 'white' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'classic' && styles.activeTabText]}>CLASSIC</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={() => setActiveTab('streak')}
          style={[styles.tab, activeTab === 'streak' && styles.activeTabStreak]}
        >
          <Zap size={18} color={activeTab === 'streak' ? 'white' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'streak' && styles.activeTabText]}>STREAK</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, index) => index.toString()}
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
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#1e293b' },
  tabs: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tab: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 12, 
    borderRadius: 12, 
    backgroundColor: '#f1f5f9',
    gap: 8
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
    borderColor: '#e2e8f0'
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
  emptyText: { textAlign: 'center', color: '#64748b', marginTop: 40 }
});

export default Leaderboard;

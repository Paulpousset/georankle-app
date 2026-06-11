import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Home } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';
import type { MatchMode, Language, Match } from '../types';

interface MatchmakingProps {
  session: { user: User | null };
  gameMode: MatchMode;
  onBack: () => void;
  onStartMatch: (match: Match) => void;
  isDarkMode: boolean;
  language: Language;
}

// Dummy static generator since we won't import the full game_data generation logic here
// Ideally, the game_data is generated here and pushed to supabase.
const generateMockGameData = (mode: MatchMode, bestOf: number): any => {
  return { seed: Math.random(), rounds: bestOf, timestamp: Date.now() };
};

export default function Matchmaking({
  session,
  gameMode,
  onBack,
  onStartMatch,
  isDarkMode,
  language,
}: MatchmakingProps) {
  const [bestOf, setBestOf] = useState<number>(1);
  const [matchType, setMatchType] = useState<'public' | 'friend' | null>(null); // 'public' | 'friend'
  const [loading, setLoading] = useState<boolean>(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [matchState, setMatchState] = useState<any>(null); // The match object once created/joined

  useEffect(() => {
    if (matchType === 'friend') {
      loadFriends();
    }
  }, [matchType]);

  // Listen to match updates
  useEffect(() => {
    if (!matchState) return;

    const channel = supabase
      .channel(`match_${matchState.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchState.id}`,
        },
        (payload: any) => {
          const newMatch = payload.new;
          setMatchState(newMatch);
          if (newMatch.status === 'in_progress') {
            onStartMatch(newMatch);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchState]);

  const loadFriends = async () => {
    const userId = session.user!.id;
    const { data } = await supabase
      .from('friends')
      .select('*, user1:profiles!user_id1(id, username), user2:profiles!user_id2(id, username)')
      .or(`user_id1.eq.${userId},user_id2.eq.${userId}`)
      .eq('status', 'accepted');
    setFriends(data || []);
  };

  const startPublicSearch = async () => {
    setLoading(true);
    setMatchType('public');

    // 1. Try to find a waiting public match for the exact same game mode & bestOf
    const { data: waitingMatches, error: searchError } = await supabase
      .from('matches')
      .select('*')
      .eq('game_mode', gameMode)
      .eq('is_public', true)
      .eq('status', 'waiting')
      .eq('best_of', bestOf)
      .neq('player1_id', session.user!.id)
      .limit(1);

    if (waitingMatches && waitingMatches.length > 0) {
      // Join match
      const matchToJoin = waitingMatches[0];
      const { data: updatedMatch, error: updateError } = await supabase
        .from('matches')
        .update({
          player2_id: session.user!.id,
          status: 'in_progress',
        })
        .eq('id', matchToJoin.id)
        .select()
        .single();

      if (!updateError) {
        setMatchState(updatedMatch);
        onStartMatch(updatedMatch);
      }
    } else {
      // Create new public match
      const gameData = generateMockGameData(gameMode, bestOf);
      const { data: newMatch, error: createError } = await supabase
        .from('matches')
        .insert([
          {
            player1_id: session.user!.id,
            game_mode: gameMode,
            is_public: true,
            status: 'waiting',
            best_of: bestOf,
            game_data: gameData,
          },
        ])
        .select()
        .single();

      if (!createError) {
        setMatchState(newMatch);
      } else {
        console.error(createError);
        Alert.alert('Erreur', 'Impossible de créer la partie');
      }
    }
  };

  const inviteFriend = async (friendId: string) => {
    setLoading(true);
    const gameData = generateMockGameData(gameMode, bestOf);
    const { data: newMatch, error } = await supabase
      .from('matches')
      .insert([
        {
          player1_id: session.user!.id,
          player2_id: friendId, // Direct invite
          game_mode: gameMode,
          is_public: false,
          status: 'waiting',
          best_of: bestOf,
          game_data: gameData,
        },
      ])
      .select()
      .single();

    if (!error) {
      setMatchState(newMatch);
    } else {
      Alert.alert('Erreur', "Impossible d'inviter cet ami");
    }
  };

  const cancelMatch = async () => {
    if (matchState) {
      await supabase.from('matches').update({ status: 'cancelled' }).eq('id', matchState.id);
    }
    setMatchState(null);
    setLoading(false);
    setMatchType(null);
  };

  if (matchState && matchState.status === 'waiting') {
    return (
      <SafeAreaProvider>
        <SafeAreaView
          style={[styles.container, isDarkMode ? styles.containerDark : styles.containerLight]}
        >
          <StatusBar style={isDarkMode ? 'light' : 'dark'} />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text
              style={[styles.waitingText, isDarkMode ? { color: '#f8fafc' } : { color: '#1e293b' }]}
            >
              {matchState.is_public
                ? language === 'fr'
                  ? "Recherche d'un adversaire..."
                  : 'Searching for an opponent...'
                : language === 'fr'
                  ? "En attente de l'ami..."
                  : 'Waiting for friend...'}
            </Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelMatch}>
              <Text style={styles.cancelBtnText}>{language === 'fr' ? 'Annuler' : 'Cancel'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const renderFriend = ({ item }: { item: any }) => {
    const isUser1 = item.user_id1 === session.user!.id;
    const friendData = isUser1 ? item.user2 : item.user1;
    if (!friendData) return null;

    return (
      <View style={[styles.friendCard, isDarkMode ? styles.cardDark : styles.cardLight]}>
        <Text style={[styles.friendName, isDarkMode ? { color: '#f8fafc' } : { color: '#1e293b' }]}>
          {friendData.username}
        </Text>
        <TouchableOpacity style={styles.inviteBtn} onPress={() => inviteFriend(friendData.id)}>
          <Text style={styles.inviteBtnText}>{language === 'fr' ? 'Inviter' : 'Invite'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[styles.container, isDarkMode ? styles.containerDark : styles.containerLight]}
      >
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />

        <View style={[styles.header, isDarkMode ? styles.headerDark : styles.headerLight]}>
          <TouchableOpacity
            onPress={onBack}
            style={[styles.backButton, isDarkMode ? styles.backButtonDark : styles.backButtonLight]}
          >
            <Home color="#10b981" size={20} />
          </TouchableOpacity>
          <Text style={[styles.title, isDarkMode ? styles.titleDark : styles.titleLight]}>
            {language === 'fr' ? 'Multijoueur - ' : 'Multiplayer - '}
            {gameMode === 'classic'
              ? language === 'fr'
                ? 'Classique'
                : 'Classic'
              : gameMode === 'streak'
                ? 'Streak'
                : 'Versus'}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.content}>
          <View style={styles.innerContent}>
            <Text
              style={[
                styles.sectionTitle,
                isDarkMode ? { color: '#cbd5e1' } : { color: '#475569' },
              ]}
            >
              {language === 'fr' ? 'Taille du Match (Best Of)' : 'Match Length (Best Of)'}
            </Text>

            <View style={styles.boSelectRow}>
              {[1, 3, 5].map((bo) => (
                <TouchableOpacity
                  key={bo}
                  style={[
                    styles.boBtn,
                    isDarkMode ? styles.cardDark : styles.cardLight,
                    bestOf === bo &&
                      (isDarkMode ? styles.boBtnActiveDark : styles.boBtnActiveLight),
                  ]}
                  onPress={() => setBestOf(bo)}
                >
                  <Text
                    style={[
                      styles.boBtnText,
                      isDarkMode ? { color: '#cbd5e1' } : { color: '#64748B' },
                      bestOf === bo && (isDarkMode ? { color: '#34d399' } : { color: '#10b981' }),
                    ]}
                  >
                    BO {bo}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {!matchType && (
              <View style={styles.modeSelectContainer}>
                <TouchableOpacity style={styles.mainActionBtn} onPress={startPublicSearch}>
                  <Ionicons name="earth" size={24} color="#fff" />
                  <Text style={styles.mainActionText}>
                    {language === 'fr' ? 'Partie Publique' : 'Public Match'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.mainActionBtn, { backgroundColor: '#3b82f6', marginTop: 15 }]}
                  onPress={() => setMatchType('friend')}
                >
                  <Ionicons name="people" size={24} color="#fff" />
                  <Text style={styles.mainActionText}>
                    {language === 'fr' ? 'Défier un ami' : 'Challenge a friend'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {matchType === 'friend' && (
              <View style={styles.friendsListContainer}>
                <Text
                  style={[
                    styles.sectionTitle,
                    isDarkMode ? { color: '#cbd5e1' } : { color: '#475569' },
                  ]}
                >
                  {language === 'fr' ? 'Choisissez un ami' : 'Choose a friend'}
                </Text>
                <FlatList
                  data={friends}
                  keyExtractor={(item) => item.id}
                  renderItem={renderFriend}
                  ListEmptyComponent={
                    <Text
                      style={[
                        styles.emptyText,
                        isDarkMode ? { color: '#94a3b8' } : { color: '#64748B' },
                      ]}
                    >
                      {language === 'fr' ? 'Aucun ami trouvé.' : 'No friends found.'}
                    </Text>
                  }
                />
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  containerLight: { backgroundColor: '#f8fafc' },
  containerDark: { backgroundColor: '#0f172a' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  headerLight: { backgroundColor: '#f8fafc', borderBottomColor: '#e2e8f0' },
  headerDark: { backgroundColor: '#0f172a', borderBottomColor: '#1e293b' },

  backButton: {
    padding: 8,
    borderRadius: 8,
    marginRight: 10,
  },
  backButtonLight: { backgroundColor: 'rgba(16, 185, 129, 0.05)' },
  backButtonDark: { backgroundColor: 'rgba(16, 185, 129, 0.1)' },

  title: { fontSize: 22, fontWeight: 'bold' },
  titleLight: { color: '#1e293b' },
  titleDark: { color: '#f8fafc' },

  content: { padding: 20, flex: 1 },
  innerContent: { width: '100%', maxWidth: 600, alignSelf: 'center', flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15, marginTop: 10 },

  boSelectRow: { flexDirection: 'row', gap: 10, marginBottom: 30 },
  boBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },

  cardLight: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardDark: { backgroundColor: '#1e293b' },

  boBtnActiveLight: { borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  boBtnActiveDark: { borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)' },

  boBtnText: { fontSize: 16, fontWeight: 'bold' },

  modeSelectContainer: { marginTop: 20 },
  mainActionBtn: {
    backgroundColor: '#10b981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 4,
  },
  mainActionText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  waitingText: { textAlign: 'center', marginTop: 25, fontSize: 18, fontWeight: '500' },
  cancelBtn: {
    marginTop: 30,
    alignSelf: 'center',
    padding: 16,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    width: 200,
  },
  cancelBtnText: { color: '#fff', textAlign: 'center', fontWeight: 'bold', fontSize: 16 },

  friendsListContainer: { flex: 1, marginTop: 10 },
  friendCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  friendName: { fontSize: 16, fontWeight: '600' },
  inviteBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  inviteBtnText: { color: '#fff', fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 20, fontSize: 16 },
});

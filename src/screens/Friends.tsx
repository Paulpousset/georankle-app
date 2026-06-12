import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { Home } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';
import type { Language } from '../types';

interface FriendsProps {
  session: { user: User | null };
  onBack: () => void;
  isDarkMode: boolean;
  language: Language;
}

export default function Friends({ session, onBack, isDarkMode, language }: FriendsProps) {
  const c = getColors(isDarkMode);
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);

  useEffect(() => {
    if (session?.user?.id) {
      loadFriendsAndRequests();
    }
  }, [session]);

  const loadFriendsAndRequests = async () => {
    setLoading(true);
    const userId = session.user!.id;

    // Load accepted friends
    const { data: friendsData, error: friendsError } = await supabase
      .from('friends')
      .select('*, user1:profiles!user_id1(id, username), user2:profiles!user_id2(id, username)')
      .or(`user_id1.eq.${userId},user_id2.eq.${userId}`)
      .eq('status', 'accepted');

    if (friendsError) console.error('Error loading friends:', friendsError);

    // Load pending requests where current user is the receiver
    const { data: pendingData, error: pendingError } = await supabase
      .from('friends')
      .select('*, user1:profiles!user_id1(id, username)')
      .eq('user_id2', userId)
      .eq('status', 'pending');

    if (pendingError) console.error('Error loading pending:', pendingError);

    setFriends(friendsData || []);
    setPendingRequests(pendingData || []);
    setLoading(false);
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const userId = session.user!.id;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', `%${searchQuery}%`)
      .neq('id', userId)
      .limit(10);

    if (error) {
      console.error('Search error:', error);
      Alert.alert('Erreur', 'Impossible de chercher des utilisateurs');
    } else {
      setSearchResults(data || []);
    }
    setSearchLoading(false);
  };

  const sendFriendRequest = async (targetUserId: string) => {
    const userId = session.user!.id;

    // Check if a relationship already exists
    const { data: existing, error: checkError } = await supabase
      .from('friends')
      .select('id')
      .or(
        `and(user_id1.eq.${userId},user_id2.eq.${targetUserId}),and(user_id1.eq.${targetUserId},user_id2.eq.${userId})`,
      )
      .single();

    if (existing) {
      Alert.alert('Info', 'Une relation ou demande existe déjà avec cet utilisateur.');
      return;
    }

    const { error } = await supabase
      .from('friends')
      .insert([{ user_id1: userId, user_id2: targetUserId, status: 'pending' }]);

    if (error) {
      console.error('Send request error:', error);
      Alert.alert('Erreur', "Impossible d'envoyer la demande");
    } else {
      Alert.alert('Succès', "Demande d'ami envoyée !");
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  const acceptRequest = async (requestId: string) => {
    const { error } = await supabase
      .from('friends')
      .update({ status: 'accepted' })
      .eq('id', requestId);

    if (error) {
      console.error('Accept error:', error);
    } else {
      loadFriendsAndRequests();
    }
  };

  const rejectRequest = async (requestId: string) => {
    const { error } = await supabase.from('friends').delete().eq('id', requestId);

    if (error) {
      console.error('Reject error:', error);
    } else {
      loadFriendsAndRequests();
    }
  };

  const removeFriend = async (requestId: string) => {
    Alert.alert('Supprimer', 'Voulez-vous vraiment supprimer cet ami ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('friends').delete().eq('id', requestId);
          if (!error) loadFriendsAndRequests();
        },
      },
    ]);
  };

  const renderFriend = ({ item }: { item: any }) => {
    const isUser1 = item.user_id1 === session.user!.id;
    const friendData = isUser1 ? item.user2 : item.user1;

    if (!friendData) return null;

    return (
      <View style={[styles.userCard, isDarkMode ? styles.cardDark : styles.cardLight]}>
        <Text
          style={[styles.usernameText, { color: c.text }]}
        >
          {friendData.username}
        </Text>
        <TouchableOpacity style={styles.removeBtn} onPress={() => removeFriend(item.id)}>
          <Ionicons name="person-remove" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderPending = ({ item }: { item: any }) => {
    return (
      <View style={[styles.userCard, isDarkMode ? styles.cardDark : styles.cardLight]}>
        <Text
          style={[styles.usernameText, { color: c.text }]}
        >
          {item.user1?.username} {language === 'fr' ? 'veut être votre ami' : 'wants to be friends'}
        </Text>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptRequest(item.id)}>
            <Ionicons name="checkmark" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectRequest(item.id)}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSearchResult = ({ item }: { item: any }) => (
    <View style={[styles.userCard, isDarkMode ? styles.cardDark : styles.cardLight]}>
      <Text style={[styles.usernameText, { color: c.text }]}>
        {item.username}
      </Text>
      <TouchableOpacity style={styles.addBtn} onPress={() => sendFriendRequest(item.id)}>
        <Ionicons name="person-add" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, isDarkMode ? styles.containerDark : styles.containerLight]}
    >
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />

        <View style={[styles.header, isDarkMode ? styles.headerDark : styles.headerLight]}>
          <TouchableOpacity
            onPress={onBack}
            style={[styles.backButton, isDarkMode ? styles.backButtonDark : styles.backButtonLight]}
          >
            <Home color={c.accent} size={20} />
          </TouchableOpacity>
          <Text style={[styles.title, isDarkMode ? styles.titleDark : styles.titleLight]}>
            {language === 'fr' ? 'Amis' : 'Friends'}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.searchSection}>
          <TextInput
            style={[
              styles.searchInput,
              { backgroundColor: c.card, borderColor: c.border, color: c.text },
            ]}
            placeholder={language === 'fr' ? 'Rechercher un pseudo...' : 'Search a username...'}
            placeholderTextColor={c.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={searchUsers}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchButton} onPress={searchUsers}>
            <Ionicons name="search" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {searchLoading && <ActivityIndicator style={{ margin: 20 }} color={c.accent} />}

        {searchQuery.length > 0 && searchResults.length > 0 && (
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionTitle,
                { color: c.textMuted },
              ]}
            >
              {language === 'fr' ? 'Résultats' : 'Results'}
            </Text>
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              renderItem={renderSearchResult}
            />
          </View>
        )}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 50 }} size="large" color={c.accent} />
        ) : (
          <FlatList
            data={[
              ...(pendingRequests.length > 0
                ? [
                    {
                      type: 'header',
                      title: language === 'fr' ? 'Demandes en attente' : 'Pending requests',
                    },
                    ...pendingRequests.map((r) => ({ ...r, type: 'pending' })),
                  ]
                : []),
              ...(friends.length > 0
                ? [
                    { type: 'header', title: language === 'fr' ? 'Mes amis' : 'My friends' },
                    ...friends.map((f) => ({ ...f, type: 'friend' })),
                  ]
                : []),
            ]}
            keyExtractor={(item) => item.type + '-' + (item.id || item.title)}
            renderItem={({ item }) => {
              if (item.type === 'header')
                return (
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: c.textMuted },
                    ]}
                  >
                    {item.title}
                  </Text>
                );
              if (item.type === 'pending') return renderPending({ item });
              if (item.type === 'friend') return renderFriend({ item });
              return null;
            }}
            ListEmptyComponent={() =>
              !searchQuery ? (
                <Text
                  style={[
                    styles.emptyText,
                    { color: c.textFaint },
                  ]}
                >
                  {language === 'fr'
                    ? "Vous n'avez pas encore d'amis."
                    : 'You have no friends yet.'}
                </Text>
              ) : null
            }
          />
        )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  containerLight: { backgroundColor: '#f2e8d0' },
  containerDark: { backgroundColor: '#0a1628' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  headerLight: { backgroundColor: '#f2e8d0', borderBottomColor: '#c4a87a' },
  headerDark: { backgroundColor: '#0a1628', borderBottomColor: '#2d4a70' },

  backButton: {
    padding: 8,
    borderRadius: 8,
    marginRight: 10,
  },
  backButtonLight: { backgroundColor: 'rgba(192, 74, 26, 0.06)' },
  backButtonDark: { backgroundColor: 'rgba(74, 158, 255, 0.10)' },

  title: { fontSize: 22, fontFamily: FONTS.headingBlack },
  titleLight: { color: '#2c1810' },
  titleDark: { color: '#d8e8f4' },

  searchSection: { flexDirection: 'row', padding: 20, gap: 10 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: FONTS.mono,
  },
  searchButton: {
    backgroundColor: '#2a6e3f',
    justifyContent: 'center',
    alignItems: 'center',
    width: 48,
    borderRadius: 12,
  },

  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONTS.monoBold,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
  },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardLight: {
    backgroundColor: '#e8d9b8',
    borderColor: '#c4a87a',
  },
  cardDark: { backgroundColor: '#132040', borderColor: '#2d4a70' },

  usernameText: { fontSize: 16, fontFamily: FONTS.heading },

  addBtn: { backgroundColor: '#2a6e3f', padding: 8, borderRadius: 8 },
  removeBtn: { padding: 8 },
  actionRow: { flexDirection: 'row', gap: 8 },
  acceptBtn: { backgroundColor: '#2a6e3f', padding: 8, borderRadius: 8 },
  rejectBtn: { backgroundColor: '#8b1a1a', padding: 8, borderRadius: 8 },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 16, fontFamily: FONTS.mono },
});

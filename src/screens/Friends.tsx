import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import {
  sendFriendRequest as sendFriendRequestApi,
  acceptFriendRequest,
  removeFriendRow,
} from '../lib/friends';
import { track } from '../lib/analytics';
import { log } from '../lib/log';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { ArrowLeft } from 'lucide-react-native';
import { tr } from '../i18n';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

interface FriendsProps {
  onBack: () => void;
  onOpenPlayer?: (userId: string, username?: string | null) => void;
  /** Notify the parent (header badge) whenever the pending-request set changes. */
  onRequestsChanged?: () => void;
}

// Stable keyExtractors so the lists don't get a fresh function on every render.
const searchKeyExtractor = (item: any) => item.id;
const combinedKeyExtractor = (item: any) => item.type + '-' + (item.id || item.title);

export default function Friends({ onBack, onOpenPlayer, onRequestsChanged }: FriendsProps) {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);

  const loadFriendsAndRequests = useCallback(async () => {
    setLoading(true);
    const userId = user!.id;

    // Load accepted friends
    const { data: friendsData, error: friendsError } = await supabase
      .from('friends')
      .select('*, user1:profiles!user_id1(id, username), user2:profiles!user_id2(id, username)')
      .or(`user_id1.eq.${userId},user_id2.eq.${userId}`)
      .eq('status', 'accepted');

    if (friendsError) {
      log.error('Error loading friends:', friendsError);
      Alert.alert(tr(language, 'Erreur', 'Error'), tr(language, 'Impossible de charger vos amis.', 'Could not load your friends.'));
    }

    // Load pending requests where current user is the receiver
    const { data: pendingData, error: pendingError } = await supabase
      .from('friends')
      .select('*, user1:profiles!user_id1(id, username)')
      .eq('user_id2', userId)
      .eq('status', 'pending');

    if (pendingError) log.error('Error loading pending:', pendingError);

    setFriends(friendsData || []);
    setPendingRequests(pendingData || []);
    setLoading(false);
    // Keep the menu's friend-request badge in sync (entering the screen, and
    // after every accept/reject which re-runs this loader).
    onRequestsChanged?.();
  }, [user, language, onRequestsChanged]);

  useEffect(() => {
    if (user?.id) {
      loadFriendsAndRequests();
    }
    // Reload only when the session changes (not on every language toggle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const userId = user!.id;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', `%${searchQuery}%`)
      .neq('id', userId)
      .limit(10);

    if (error) {
      log.error('Search error:', error);
      Alert.alert(tr(language, 'Erreur', 'Error'), tr(language, 'Impossible de chercher des utilisateurs.', 'Could not search users.'));
    } else {
      track('user_searched', { query_length: searchQuery.trim().length });
      setSearchResults(data || []);
    }
    setSearchLoading(false);
  };

  const sendFriendRequest = useCallback(async (targetUserId: string) => {
    const result = await sendFriendRequestApi(user!.id, targetUserId);

    if (result.alreadyExists) {
      Alert.alert(tr(language, 'Info', 'Info'), tr(language, 'Une relation ou demande existe déjà avec cet utilisateur.', 'A relationship or request already exists with this user.'));
      return;
    }
    if (!result.ok) {
      log.error('Send request error:', result.error);
      Alert.alert(tr(language, 'Erreur', 'Error'), tr(language, "Impossible d'envoyer la demande.", 'Could not send the request.'));
      return;
    }
    track('friend_request_sent', { target_user_id: targetUserId });
    Alert.alert(tr(language, 'Succès', 'Success'), tr(language, "Demande d'ami envoyée !", 'Friend request sent!'));
    setSearchQuery('');
    setSearchResults([]);
  }, [user, language]);

  const acceptRequest = useCallback(async (requestId: string) => {
    const result = await acceptFriendRequest(requestId);

    if (!result.ok) {
      log.error('Accept error:', result.error);
      Alert.alert(tr(language, 'Erreur', 'Error'), tr(language, "Impossible d'accepter la demande.", 'Could not accept the request.'));
      return;
    }
    track('friend_request_accepted');
    loadFriendsAndRequests();
  }, [language, loadFriendsAndRequests]);

  const rejectRequest = useCallback(async (requestId: string) => {
    const result = await removeFriendRow(requestId);

    if (!result.ok) {
      log.error('Reject error:', result.error);
      Alert.alert(tr(language, 'Erreur', 'Error'), tr(language, "Impossible de refuser la demande.", 'Could not reject the request.'));
      return;
    }
    loadFriendsAndRequests();
  }, [language, loadFriendsAndRequests]);

  const removeFriend = useCallback(async (requestId: string) => {
    Alert.alert(tr(language, 'Supprimer', 'Remove'), tr(language, 'Voulez-vous vraiment supprimer cet ami ?', 'Do you really want to remove this friend?'), [
      { text: tr(language, 'Annuler', 'Cancel'), style: 'cancel' },
      {
        text: tr(language, 'Supprimer', 'Remove'),
        style: 'destructive',
        onPress: async () => {
          const result = await removeFriendRow(requestId);
          if (result.ok) {
            track('friend_removed');
            loadFriendsAndRequests();
          }
        },
      },
    ]);
  }, [language, loadFriendsAndRequests]);

  const renderFriend = useCallback(({ item }: { item: any }) => {
    const isUser1 = item.user_id1 === user!.id;
    const friendData = isUser1 ? item.user2 : item.user1;

    if (!friendData) return null;

    return (
      <View style={[styles.userCard, isDarkMode ? styles.cardDark : styles.cardLight]}>
        <TouchableOpacity
          style={styles.nameTap}
          activeOpacity={onOpenPlayer ? 0.6 : 1}
          disabled={!onOpenPlayer}
          onPress={() => onOpenPlayer?.(friendData.id, friendData.username)}
          accessibilityRole="button"
          accessibilityLabel={tr(language, 'Voir le profil', 'View profile')}
        >
          <Text style={[styles.usernameText, { color: c.text }]}>{friendData.username}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => removeFriend(item.id)}
          hitSlop={ICON_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={tr(language, 'Supprimer cet ami', 'Remove this friend')}
        >
          <Ionicons name="person-remove" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>
    );
  }, [user, onOpenPlayer, c, isDarkMode, language, removeFriend]);

  const renderPending = useCallback(({ item }: { item: any }) => {
    return (
      <View style={[styles.userCard, isDarkMode ? styles.cardDark : styles.cardLight]}>
        <TouchableOpacity
          style={styles.nameTap}
          activeOpacity={onOpenPlayer ? 0.6 : 1}
          disabled={!onOpenPlayer}
          onPress={() => item.user1 && onOpenPlayer?.(item.user1.id, item.user1.username)}
          accessibilityRole="button"
          accessibilityLabel={tr(language, 'Voir le profil', 'View profile')}
        >
          <Text style={[styles.usernameText, { color: c.text }]}>
            {item.user1?.username} {language === 'fr' ? 'veut être votre ami' : 'wants to be friends'}
          </Text>
        </TouchableOpacity>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={() => acceptRequest(item.id)}
            hitSlop={ICON_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={tr(language, 'Accepter la demande', 'Accept request')}
          >
            <Ionicons name="checkmark" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectBtn}
            onPress={() => rejectRequest(item.id)}
            hitSlop={ICON_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={tr(language, 'Refuser la demande', 'Reject request')}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [onOpenPlayer, c, isDarkMode, language, acceptRequest, rejectRequest]);

  const renderSearchResult = useCallback(({ item }: { item: any }) => (
    <View style={[styles.userCard, isDarkMode ? styles.cardDark : styles.cardLight]}>
      <TouchableOpacity
        style={styles.nameTap}
        activeOpacity={onOpenPlayer ? 0.6 : 1}
        disabled={!onOpenPlayer}
        onPress={() => onOpenPlayer?.(item.id, item.username)}
        accessibilityRole="button"
        accessibilityLabel={tr(language, 'Voir le profil', 'View profile')}
      >
        <Text style={[styles.usernameText, { color: c.text }]}>{item.username}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => sendFriendRequest(item.id)}
        hitSlop={ICON_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={tr(language, 'Ajouter en ami', 'Add friend')}
      >
        <Ionicons name="person-add" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  ), [onOpenPlayer, c, isDarkMode, language, sendFriendRequest]);

  // Build the flat list of section headers + rows once per data change, so typing in
  // the search box doesn't rebuild it (and re-render every friend row) on each keystroke.
  const combinedData = useMemo(
    () => [
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
    ],
    [pendingRequests, friends, language],
  );

  const renderCombinedItem = useCallback(
    ({ item }: { item: any }) => {
      if (item.type === 'header')
        return <Text style={[styles.sectionTitle, { color: c.textMuted }]}>{item.title}</Text>;
      if (item.type === 'pending') return renderPending({ item });
      if (item.type === 'friend') return renderFriend({ item });
      return null;
    },
    [c, renderPending, renderFriend],
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
            hitSlop={ICON_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={tr(language, 'Retour au menu', 'Back to menu')}
          >
            <ArrowLeft color={c.accent} size={20} />
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
          <TouchableOpacity
            style={styles.searchButton}
            onPress={searchUsers}
            {...a11yButton(tr(language, 'Rechercher', 'Search'))}
          >
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
              keyExtractor={searchKeyExtractor}
              renderItem={renderSearchResult}
            />
          </View>
        )}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 50 }} size="large" color={c.accent} />
        ) : (
          <FlatList
            data={combinedData}
            keyExtractor={combinedKeyExtractor}
            renderItem={renderCombinedItem}
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
  nameTap: { flex: 1, paddingVertical: 4, paddingRight: 8 },

  addBtn: { backgroundColor: '#2a6e3f', padding: 8, borderRadius: 8 },
  removeBtn: { padding: 8 },
  actionRow: { flexDirection: 'row', gap: 8 },
  acceptBtn: { backgroundColor: '#2a6e3f', padding: 8, borderRadius: 8 },
  rejectBtn: { backgroundColor: '#8b1a1a', padding: 8, borderRadius: 8 },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 16, fontFamily: FONTS.mono },
});

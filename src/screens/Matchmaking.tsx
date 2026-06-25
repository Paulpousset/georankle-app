import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { FONTS } from '../theme/typography';
import { ArrowLeft, Plus, RefreshCw, Users, Globe, Trophy, ChevronRight } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';
import type { MatchMode, Language, Match, AvatarConfig } from '../types';
import { gameData as gd } from '../data/gameData';
import { Avatar } from '../components/Avatar';

const SESSION_SIZE = 8;

function mkRng(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildClassicSessions(seed: number, numRounds: number) {
  const sessions: Record<number, { themeIds: string[]; countryCca3s: string[] }> = {};
  for (let r = 1; r <= numRounds; r++) {
    const rand = mkRng(seed + (r - 1) * 997);
    const allThemeIds = Object.keys(gd.themes).filter(
      (id) => gd.countries.filter((c) => c.ranks?.[id] !== undefined).length > 10,
    );
    const themeIds = seededShuffle(allThemeIds, rand).slice(0, SESSION_SIZE);
    let countries = gd.countries.filter((c) =>
      themeIds.every((id) => c.ranks?.[id] !== undefined && c.data?.[id] !== undefined),
    );
    if (countries.length < SESSION_SIZE) {
      countries = [...gd.countries].sort(
        (a, b) => Object.keys(b.ranks).length - Object.keys(a.ranks).length,
      );
    }
    const countryCca3s = seededShuffle(countries, rand).slice(0, SESSION_SIZE).map((c) => c.cca3);
    sessions[r] = { themeIds, countryCca3s };
  }
  return sessions;
}

type MatchmakingView = 'lobby' | 'create' | 'waiting' | 'friends';

interface PublicMatchItem {
  id: string;
  player1_id: string;
  game_mode: MatchMode;
  best_of: number;
  game_data: any;
  created_at: string;
  creator_username: string | null;
  creator_avatar_url: string | null;
  creator_avatar_config: AvatarConfig | null;
}

interface PlayerStats {
  username: string | null;
  avatar_url: string | null;
  avatar_config: AvatarConfig | null;
  wins: number;
  total: number;
}

interface MatchmakingProps {
  session: { user: User | null };
  gameMode: MatchMode;
  onBack: () => void;
  onStartMatch: (match: Match) => void;
  isDarkMode: boolean;
  language: Language;
}

const QUESTION_TYPES = [
  { id: 'CAPITAL', labelFr: 'Capitales', labelEn: 'Capitals', emoji: '🏛️' },
  { id: 'FLAG', labelFr: 'Drapeaux', labelEn: 'Flags', emoji: '🚩' },
  { id: 'MIX', labelFr: 'Mixte', labelEn: 'Mixed', emoji: '🎲' },
];

function modeName(mode: MatchMode, lang: Language): string {
  if (mode === 'classic') return 'Rankle';
  if (mode === 'streak') return 'Streak';
  if (mode === 'globe') return lang === 'fr' ? 'Globe Géo' : 'Geo Globe';
  return 'Versus';
}

function formatBestOf(bo: number, lang: Language): string {
  return lang === 'fr' ? `BO${bo}` : `BO${bo}`;
}

export default function Matchmaking({
  session,
  gameMode,
  onBack,
  onStartMatch,
  isDarkMode,
  language,
}: MatchmakingProps) {
  const userId = session.user?.id ?? '';

  const [view, setView] = useState<MatchmakingView>('lobby');
  const [playerStats, setPlayerStats] = useState<PlayerStats>({ username: null, avatar_url: null, avatar_config: null, wins: 0, total: 0 });
  const [publicMatches, setPublicMatches] = useState<PublicMatchItem[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchState, setMatchState] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);

  // Create-form state
  const [bestOf, setBestOf] = useState(1);
  const [questionType, setQuestionType] = useState('MIX');
  const [roundsPerSet, setRoundsPerSet] = useState(5);
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);

  // ─── Data fetching ───────────────────────────────────────────────────────────

  const fetchPlayerStats = useCallback(async () => {
    if (!userId) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, avatar_url, avatar_config')
      .eq('id', userId)
      .single();

    const { data: allMatches } = await supabase
      .from('matches')
      .select('player1_id, player2_id, p1_rounds_won, p2_rounds_won')
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .eq('status', 'completed');

    const total = allMatches?.length ?? 0;
    const wins =
      allMatches?.filter((m) => {
        if (m.player1_id === userId) {
          return (m.p1_rounds_won ?? 0) > (m.p2_rounds_won ?? 0);
        }
        return (m.p2_rounds_won ?? 0) > (m.p1_rounds_won ?? 0);
      }).length ?? 0;

    setPlayerStats({
      username: profile?.username ?? null,
      avatar_url: profile?.avatar_url ?? null,
      avatar_config: (profile?.avatar_config as AvatarConfig) ?? null,
      wins,
      total,
    });
  }, [userId]);

  const fetchPublicMatches = useCallback(async () => {
    if (!userId) return;
    setLoadingMatches(true);
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .eq('game_mode', gameMode)
      .eq('is_public', true)
      .eq('status', 'waiting')
      .neq('player1_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!matches || matches.length === 0) {
      setPublicMatches([]);
      setLoadingMatches(false);
      return;
    }

    const creatorIds = [...new Set(matches.map((m) => m.player1_id as string))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, avatar_config')
      .in('id', creatorIds);
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    setPublicMatches(
      matches.map((m: any) => {
        const p = profileMap.get(m.player1_id);
        return {
          ...m,
          creator_username: p?.username ?? null,
          creator_avatar_url: p?.avatar_url ?? null,
          creator_avatar_config: p?.avatar_config ?? null,
        };
      }),
    );
    setLoadingMatches(false);
  }, [userId, gameMode]);

  const loadFriends = useCallback(async () => {
    const { data } = await supabase
      .from('friends')
      .select('*, user1:profiles!user_id1(id, username, avatar_url, avatar_config), user2:profiles!user_id2(id, username, avatar_url, avatar_config)')
      .or(`user_id1.eq.${userId},user_id2.eq.${userId}`)
      .eq('status', 'accepted');
    setFriends(data ?? []);
  }, [userId]);

  useEffect(() => {
    fetchPlayerStats();
    fetchPublicMatches();
  }, []);

  // Realtime: watch for match to go in_progress
  useEffect(() => {
    if (!matchState) return;
    const channel = supabase
      .channel(`match_${matchState.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchState.id}` },
        async (payload: any) => {
          const newMatch = payload.new;
          setMatchState(newMatch);
          if (newMatch.status === 'in_progress') {
            const { data: fullMatch } = await supabase
              .from('matches').select('*').eq('id', newMatch.id).single();
            onStartMatch((fullMatch ?? newMatch) as Match);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchState?.id]);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const joinMatch = async (match: PublicMatchItem) => {
    const { data: updated, error } = await supabase
      .from('matches')
      .update({ player2_id: userId, status: 'in_progress' })
      .eq('id', match.id)
      .select()
      .single();
    if (!error && updated) {
      track('matchmaking_started', { mode: gameMode, kind: 'public' });
      setMatchState(updated);
      onStartMatch(updated as Match);
    } else {
      Alert.alert(language === 'fr' ? 'Erreur' : 'Error',
        language === 'fr' ? 'Impossible de rejoindre la partie' : 'Could not join match');
    }
  };

  const createMatch = async (friendId?: string) => {
    setCreating(true);
    const seed = Math.floor(Math.random() * 2147483647);
    const gameData: any = { seed, rounds: bestOf };
    if (gameMode === 'versus') {
      gameData.questionType = questionType;
      gameData.roundsPerSet = roundsPerSet;
    }
    if (gameMode === 'classic') {
      gameData.sessions = buildClassicSessions(seed, bestOf);
    }
    const { data: newMatch, error } = await supabase
      .from('matches')
      .insert([{
        player1_id: userId,
        player2_id: friendId ?? null,
        game_mode: gameMode,
        is_public: !friendId && isPublic,
        status: 'waiting',
        best_of: bestOf,
        game_data: gameData,
      }])
      .select()
      .single();

    setCreating(false);
    if (!error && newMatch) {
      if (friendId) {
        track('match_invite_sent', { mode: gameMode });
      } else {
        track('matchmaking_started', { mode: gameMode, kind: isPublic ? 'public' : 'private' });
      }
      setMatchState(newMatch);
      setView('waiting');
      // Notify the invited friend via push (fire-and-forget; works when their app is closed).
      if (friendId) {
        supabase.functions
          .invoke('notify-invite', { body: { match_id: newMatch.id } })
          .catch(() => {});
      }
    } else {
      Alert.alert(language === 'fr' ? 'Erreur' : 'Error',
        language === 'fr' ? 'Impossible de créer la partie' : 'Could not create match');
    }
  };

  const doCancelMatch = async () => {
    if (matchState) {
      await supabase.from('matches').update({ status: 'cancelled' }).eq('id', matchState.id);
    }
    setMatchState(null);
    setView('lobby');
  };

  const cancelMatch = () => {
    Alert.alert(
      language === 'fr' ? 'Annuler la partie ?' : 'Cancel match?',
      language === 'fr' ? 'La partie en attente sera annulée.' : 'The pending match will be cancelled.',
      [
        { text: language === 'fr' ? 'Continuer' : 'Keep waiting', style: 'cancel' },
        { text: language === 'fr' ? 'Annuler' : 'Cancel', style: 'destructive', onPress: doCancelMatch },
      ],
    );
  };

  // ─── Theme helpers ────────────────────────────────────────────────────────────

  const bg = isDarkMode ? '#0a1628' : '#f2e8d0';
  const cardBg = isDarkMode ? '#132040' : '#e8d9b8';
  const cardBorder = isDarkMode ? '#2d4a70' : '#c4a87a';
  const textPrimary = isDarkMode ? '#d8e8f4' : '#2c1810';
  const textSecondary = isDarkMode ? '#7aa0c4' : '#7a5c38';

  // ─── Subviews ─────────────────────────────────────────────────────────────────

  const winRate =
    playerStats.total > 0
      ? Math.round((playerStats.wins / playerStats.total) * 100)
      : null;

  const renderPlayerCard = () => (
    <View style={[styles.playerCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      <Avatar
        config={playerStats.avatar_config}
        photoUrl={playerStats.avatar_url}
        username={playerStats.username}
        size={48}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.playerName, { color: textPrimary }]}>
          {playerStats.username ?? (language === 'fr' ? 'Joueur' : 'Player')}
        </Text>
        <Text style={[styles.playerSub, { color: textSecondary }]}>
          {gameMode === 'streak' ? 'GeoStreak' : gameMode === 'versus' ? 'Versus' : gameMode === 'globe' ? 'Globe Géo' : 'GeoG'}
        </Text>
      </View>
      <View style={styles.winBadge}>
        <Trophy size={14} color="#fbbf24" />
        <Text style={styles.winRate}>
          {winRate !== null ? `${winRate}%` : '--'}
        </Text>
        <Text style={[styles.winLabel, { color: textSecondary }]}>
          {language === 'fr' ? 'victoires' : 'win rate'}
        </Text>
      </View>
    </View>
  );

  const renderPublicMatch = ({ item }: { item: PublicMatchItem }) => {
    const gd = item.game_data ?? {};
    return (
      <View style={[styles.matchRow, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <Avatar
          config={item.creator_avatar_config}
          photoUrl={item.creator_avatar_url}
          username={item.creator_username}
          size={40}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.matchCreator, { color: textPrimary }]}>
            {item.creator_username ?? (language === 'fr' ? 'Joueur' : 'Player')}
          </Text>
          <Text style={[styles.matchSub, { color: textSecondary }]}>
            {formatBestOf(item.best_of, language)}
            {gameMode === 'versus' && gd.questionType ? ` · ${gd.questionType}` : ''}
            {gameMode === 'versus' && gd.roundsPerSet ? ` · ${gd.roundsPerSet} rounds` : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.joinBtn} onPress={() => joinMatch(item)}>
          <Text style={styles.joinBtnText}>{language === 'fr' ? 'Rejoindre' : 'Join'}</Text>
          <ChevronRight size={14} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  // ─── LOBBY ────────────────────────────────────────────────────────────────────

  const renderLobby = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={loadingMatches}
          onRefresh={fetchPublicMatches}
          tintColor="#2a6e3f"
        />
      }
    >
      {renderPlayerCard()}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: textSecondary }]}>
          {language === 'fr' ? 'PARTIES EN ATTENTE' : 'OPEN MATCHES'}
          {publicMatches.length > 0 ? ` (${publicMatches.length})` : ''}
        </Text>
        <TouchableOpacity
          onPress={fetchPublicMatches}
          style={styles.refreshBtn}
          accessibilityRole="button"
          accessibilityLabel={language === 'fr' ? 'Rafraîchir la liste' : 'Refresh list'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <RefreshCw size={16} color="#2a6e3f" />
        </TouchableOpacity>
      </View>

      {loadingMatches ? (
        <ActivityIndicator color="#2a6e3f" style={{ marginVertical: 20 }} />
      ) : publicMatches.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.emptyText, { color: textSecondary }]}>
            {language === 'fr' ? 'Aucune partie ouverte pour ce mode.' : 'No open matches for this mode.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={publicMatches}
          keyExtractor={(item) => item.id}
          renderItem={renderPublicMatch}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}

      <TouchableOpacity
        style={styles.createBtn}
        onPress={() => setView('create')}
      >
        <Plus size={20} color="#fff" />
        <Text style={styles.createBtnText}>
          {language === 'fr' ? 'Créer une partie' : 'Create a match'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ─── CREATE ───────────────────────────────────────────────────────────────────

  const renderCreate = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.formTitle, { color: textPrimary }]}>
        {language === 'fr' ? 'Format du match' : 'Match format'}
      </Text>
      <View style={styles.optRow}>
        {[1, 3, 5].map((bo) => (
          <TouchableOpacity
            key={bo}
            style={[
              styles.optBtn,
              { backgroundColor: cardBg, borderColor: cardBorder },
              bestOf === bo && styles.optBtnActive,
            ]}
            onPress={() => setBestOf(bo)}
          >
            <Text style={[styles.optBtnText, { color: bestOf === bo ? '#2a6e3f' : textSecondary }]}>
              BO{bo}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {gameMode === 'versus' && (
        <>
          <Text style={[styles.formTitle, { color: textPrimary }]}>
            {language === 'fr' ? 'Type de questions' : 'Question type'}
          </Text>
          <View style={styles.optRow}>
            {QUESTION_TYPES.map((qt) => (
              <TouchableOpacity
                key={qt.id}
                style={[
                  styles.optBtn,
                  { backgroundColor: cardBg, borderColor: cardBorder },
                  questionType === qt.id && styles.optBtnActive,
                ]}
                onPress={() => setQuestionType(qt.id)}
              >
                <Text style={{ fontSize: 18 }}>{qt.emoji}</Text>
                <Text style={[styles.optBtnText, { color: questionType === qt.id ? '#2a6e3f' : textSecondary, fontSize: 12 }]}>
                  {language === 'fr' ? qt.labelFr : qt.labelEn}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.formTitle, { color: textPrimary }]}>
            {language === 'fr' ? 'Rounds par manche' : 'Rounds per set'}
          </Text>
          <View style={styles.optRow}>
            {[3, 5, 10].map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.optBtn,
                  { backgroundColor: cardBg, borderColor: cardBorder },
                  roundsPerSet === r && styles.optBtnActive,
                ]}
                onPress={() => setRoundsPerSet(r)}
              >
                <Text style={[styles.optBtnText, { color: roundsPerSet === r ? '#2a6e3f' : textSecondary }]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <Text style={[styles.formTitle, { color: textPrimary }]}>
        {language === 'fr' ? 'Visibilité' : 'Visibility'}
      </Text>
      <View style={styles.optRow}>
        <TouchableOpacity
          style={[
            styles.visBtn,
            { backgroundColor: cardBg, borderColor: cardBorder },
            isPublic && styles.optBtnActive,
          ]}
          onPress={() => setIsPublic(true)}
        >
          <Globe size={18} color={isPublic ? '#2a6e3f' : textSecondary} />
          <Text style={[styles.visBtnText, { color: isPublic ? '#2a6e3f' : textSecondary }]}>
            {language === 'fr' ? 'Publique' : 'Public'}
          </Text>
          <Text style={[styles.visDesc, { color: textSecondary }]}>
            {language === 'fr' ? 'Visible par tous' : 'Open to everyone'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.visBtn,
            { backgroundColor: cardBg, borderColor: cardBorder },
            !isPublic && styles.optBtnActive,
          ]}
          onPress={() => { setIsPublic(false); loadFriends(); setView('friends'); }}
        >
          <Users size={18} color={!isPublic ? '#2a6e3f' : textSecondary} />
          <Text style={[styles.visBtnText, { color: !isPublic ? '#2a6e3f' : textSecondary }]}>
            {language === 'fr' ? 'Privée' : 'Private'}
          </Text>
          <Text style={[styles.visDesc, { color: textSecondary }]}>
            {language === 'fr' ? 'Inviter un ami' : 'Invite a friend'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.createBtn, creating && { opacity: 0.6 }]}
        onPress={() => createMatch()}
        disabled={creating}
      >
        {creating ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Plus size={20} color="#fff" />
            <Text style={styles.createBtnText}>
              {language === 'fr' ? 'Créer la partie' : 'Create match'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  // ─── FRIEND SELECT ────────────────────────────────────────────────────────────

  const renderFriends = () => (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={styles.scrollContent}
      data={friends}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.emptyText, { color: textSecondary }]}>
            {language === 'fr' ? 'Aucun ami trouvé.' : 'No friends found.'}
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const isUser1 = item.user_id1 === userId;
        const friend = isUser1 ? item.user2 : item.user1;
        if (!friend) return null;
        return (
          <View style={[styles.matchRow, { backgroundColor: cardBg, borderColor: cardBorder, marginBottom: 8 }]}>
            <Avatar
              config={friend.avatar_config ?? null}
              photoUrl={friend.avatar_url ?? null}
              username={friend.username}
              size={40}
            />
            <Text style={[styles.matchCreator, { color: textPrimary, flex: 1 }]}>{friend.username}</Text>
            <TouchableOpacity style={styles.joinBtn} onPress={() => createMatch(friend.id)}>
              <Text style={styles.joinBtnText}>{language === 'fr' ? 'Inviter' : 'Invite'}</Text>
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );

  // ─── WAITING ──────────────────────────────────────────────────────────────────

  const renderWaiting = () => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <ActivityIndicator size="large" color="#2a6e3f" />
      <Text style={[styles.waitingTitle, { color: textPrimary }]}>
        {matchState?.is_public
          ? (language === 'fr' ? "Recherche d'un adversaire..." : 'Finding an opponent...')
          : (language === 'fr' ? "En attente de l'ami..." : 'Waiting for your friend...')}
      </Text>
      {renderPlayerCard()}
      <TouchableOpacity style={styles.cancelBtn} onPress={cancelMatch}>
        <Text style={styles.cancelBtnText}>{language === 'fr' ? 'Annuler' : 'Cancel'}</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── Header ───────────────────────────────────────────────────────────────────

  const handleBack = () => {
    if (view === 'lobby') onBack();
    else if (view === 'friends') setView('create');
    else setView('lobby');
  };

  const headerTitle = () => {
    if (view === 'create') return language === 'fr' ? 'Créer une partie' : 'Create a match';
    if (view === 'friends') return language === 'fr' ? 'Choisir un ami' : 'Choose a friend';
    if (view === 'waiting') return language === 'fr' ? 'En attente...' : 'Waiting...';
    return `${language === 'fr' ? 'Multi · ' : 'Online · '}${modeName(gameMode, language)}`;
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />

        <View style={[styles.header, { backgroundColor: bg, borderBottomColor: cardBorder }]}>
          <TouchableOpacity
            onPress={handleBack}
            style={[styles.backBtn, { backgroundColor: isDarkMode ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.05)' }]}
          >
            <ArrowLeft color="#2a6e3f" size={20} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textPrimary }]}>{headerTitle()}</Text>
          <View style={{ width: 44 }} />
        </View>

        {view === 'lobby' && renderLobby()}
        {view === 'create' && renderCreate()}
        {view === 'friends' && renderFriends()}
        {view === 'waiting' && renderWaiting()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontFamily: FONTS.headingBlack, flex: 1, textAlign: 'center' },
  backBtn: { padding: 8, borderRadius: 10, width: 44, alignItems: 'center' },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },

  // Player card
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontFamily: FONTS.headingBlack },
  playerName: { fontSize: 18, fontFamily: FONTS.heading },
  playerSub: { fontSize: 13, fontFamily: FONTS.mono, marginTop: 2 },
  winBadge: { alignItems: 'center', gap: 2 },
  winRate: { color: '#c4872a', fontSize: 20, fontFamily: FONTS.headingBlack },
  winLabel: { fontSize: 11, fontFamily: FONTS.mono },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 12, fontFamily: FONTS.monoBold, letterSpacing: 0.8 },
  refreshBtn: { padding: 6 },

  // Match row
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  matchAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchAvatarText: { color: '#fff', fontSize: 13, fontFamily: FONTS.monoBold },
  matchCreator: { fontSize: 15, fontFamily: FONTS.heading },
  matchSub: { fontSize: 12, fontFamily: FONTS.mono, marginTop: 2 },
  joinBtn: {
    backgroundColor: '#2a6e3f',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  joinBtnText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 13 },

  emptyCard: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: { fontSize: 14, textAlign: 'center', fontFamily: FONTS.mono },

  createBtn: {
    backgroundColor: '#c04a1a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 20,
    gap: 10,
  },
  createBtnText: { color: '#fff', fontSize: 17, fontFamily: FONTS.monoBold },

  // Form
  formTitle: { fontSize: 14, fontFamily: FONTS.monoBold, marginBottom: 10, marginTop: 20 },
  optRow: { flexDirection: 'row', gap: 10 },
  optBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  optBtnActive: { borderColor: '#2a6e3f', backgroundColor: 'rgba(42,110,63,0.10)' },
  optBtnText: { fontSize: 15, fontFamily: FONTS.monoBold },
  visBtn: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    gap: 6,
  },
  visBtnText: { fontSize: 14, fontFamily: FONTS.monoBold },
  visDesc: { fontSize: 11, textAlign: 'center', fontFamily: FONTS.mono },

  // Waiting
  waitingTitle: { fontSize: 18, fontFamily: FONTS.heading, marginTop: 24, marginBottom: 24, textAlign: 'center' },
  cancelBtn: {
    marginTop: 24,
    backgroundColor: '#8b1a1a',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
  },
  cancelBtnText: { color: '#fff', fontWeight: '700', fontSize: 16, textAlign: 'center' },
});

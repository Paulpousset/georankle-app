/**
 * ChallengeMatchmaking — the online sibling of a solo "Défis Pays" quiz
 * (src/screens/ChallengeQuiz.tsx). A 1v1 best-of series where every round is the
 * SAME country quiz (game_data.challengeId), both players answering the same
 * seeded question set and racing on points. Reached from the country picker's
 * quiz card ("En ligne").
 *
 * It reuses the generic match engine: the match is a normal `matches` row with
 * `game_mode = 'challenge'` and `game_data = { seed, is_challenge, challengeId,
 * numQuestions }`; the engine drives waiting-opponent / round-summary exactly as
 * for every other mode.
 */

import { showAlert } from '../lib/alert';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ChevronRight, Globe, Plus, RefreshCw, Users } from 'lucide-react-native';

import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { log } from '../lib/log';
import { FONTS } from '../theme/typography';
import { getColors, PALETTE, type ThemeColors } from '../theme/colors';
import { tr } from '../i18n';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { a11yButton, announce, ICON_HIT_SLOP } from '../lib/a11y';
import { Avatar } from '../components/Avatar';
import { getChallenge } from '../data/challenges';
import type { AvatarConfig, Language, Match } from '../types';
import type { Json } from '../types/database';

type MmView = 'lobby' | 'create' | 'friends' | 'waiting';

const QUESTION_OPTIONS = [5, 10, 15];
const BEST_OF_OPTIONS = [1, 3, 5];

interface PublicChallengeItem {
  id: string;
  player1_id: string;
  best_of: number;
  game_data: any;
  creator_username: string | null;
  creator_avatar_url: string | null;
  creator_avatar_config: AvatarConfig | null;
}

interface ChallengeMatchmakingProps {
  challengeId: string;
  onBack: () => void;
  onStartMatch: (match: Match) => void;
}

const keyExtractor = (item: { id: string }) => item.id;
const RowSeparator = () => <View style={{ height: 8 }} />;

const PublicRow = React.memo(function PublicRow({
  item,
  colors,
  language,
  onJoin,
}: {
  item: PublicChallengeItem;
  colors: ThemeColors;
  language: Language;
  onJoin: (item: PublicChallengeItem) => void;
}) {
  const n = item.game_data?.numQuestions ?? 10;
  return (
    <View style={[styles.matchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Avatar
        config={item.creator_avatar_config}
        photoUrl={item.creator_avatar_url}
        username={item.creator_username}
        size={40}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.matchCreator, { color: colors.text }]} numberOfLines={1}>
          {item.creator_username ?? tr(language, 'Joueur', 'Player')}
        </Text>
        <Text style={[styles.matchSub, { color: colors.textMuted }]} numberOfLines={1}>
          {`BO${item.best_of} · ${n} ${tr(language, 'questions', 'questions')}`}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.joinBtn}
        onPress={() => onJoin(item)}
        {...a11yButton(tr(language, `Rejoindre la partie de ${item.creator_username ?? 'Joueur'}`, `Join ${item.creator_username ?? 'Player'}'s match`))}
      >
        <Text style={styles.joinBtnText}>{tr(language, 'Rejoindre', 'Join')}</Text>
        <ChevronRight size={14} color="#fff" />
      </TouchableOpacity>
    </View>
  );
});

export default function ChallengeMatchmaking({ challengeId, onBack, onStartMatch }: ChallengeMatchmakingProps) {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const userId = user?.id ?? '';
  const c = getColors(isDarkMode);
  const accent = PALETTE.forestGreen;

  const challenge = getChallenge(challengeId);
  const maxQuestions = challenge?.entities.length ?? 10;

  const [view, setView] = useState<MmView>('lobby');
  const [bestOf, setBestOf] = useState(1);
  const [numQuestions, setNumQuestions] = useState(10);
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [publicMatches, setPublicMatches] = useState<PublicChallengeItem[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchState, setMatchState] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);

  const title = challenge ? (language === 'fr' ? challenge.titleFr : challenge.titleEn) : '';

  // ─── Data ──────────────────────────────────────────────────────────────────

  const fetchPublicMatches = useCallback(async () => {
    if (!userId) return;
    setLoadingMatches(true);
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .eq('game_mode', 'challenge')
      .eq('is_public', true)
      .eq('status', 'waiting')
      .neq('player1_id', userId)
      .order('created_at', { ascending: false })
      .limit(40);

    const mine = (matches ?? []).filter((m: any) => m.game_data?.challengeId === challengeId).slice(0, 20);
    if (mine.length === 0) {
      setPublicMatches([]);
      setLoadingMatches(false);
      return;
    }

    const creatorIds = [...new Set(mine.map((m: any) => m.player1_id as string))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, avatar_config')
      .in('id', creatorIds);
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    setPublicMatches(
      mine.map((m: any) => {
        const p = profileMap.get(m.player1_id);
        return {
          id: m.id,
          player1_id: m.player1_id,
          best_of: m.best_of,
          game_data: m.game_data,
          creator_username: p?.username ?? null,
          creator_avatar_url: p?.avatar_url ?? null,
          creator_avatar_config: p?.avatar_config ?? null,
        };
      }),
    );
    setLoadingMatches(false);
  }, [userId, challengeId]);

  const loadFriends = useCallback(async () => {
    const { data } = await supabase
      .from('friends')
      .select('*, user1:profiles!user_id1(id, username, avatar_url, avatar_config), user2:profiles!user_id2(id, username, avatar_url, avatar_config)')
      .or(`user_id1.eq.${userId},user_id2.eq.${userId}`)
      .eq('status', 'accepted');
    setFriends(data ?? []);
  }, [userId]);

  useEffect(() => {
    fetchPublicMatches();
  }, [fetchPublicMatches]);

  // Realtime: our pending match goes in_progress when an opponent joins.
  useEffect(() => {
    if (!matchState) return;
    const channel = supabase
      .channel(`challenge_${matchState.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchState.id}` },
        async (payload: any) => {
          const newMatch = payload.new;
          setMatchState(newMatch);
          if (newMatch.status === 'in_progress') {
            announce(tr(language, 'Adversaire trouvé, la partie commence', 'Opponent found, match starting'));
            const { data: full } = await supabase.from('matches').select('*').eq('id', newMatch.id).single();
            onStartMatch((full ?? newMatch) as Match);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchState?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ───────────────────────────────────────────────────────────────

  const joinMatch = useCallback(async (match: PublicChallengeItem) => {
    const { data: updated, error } = await supabase
      .from('matches')
      .update({ player2_id: userId, status: 'in_progress' })
      .eq('id', match.id)
      .select()
      .single();
    if (!error && updated) {
      track('matchmaking_started', { mode: 'challenge', kind: 'public' });
      setMatchState(updated);
      onStartMatch(updated as Match);
    } else {
      showAlert(
        tr(language, 'Erreur', 'Error'),
        tr(language, 'Impossible de rejoindre la partie', 'Could not join match'),
      );
    }
  }, [userId, language, onStartMatch]);

  const createMatch = useCallback(async (friendId?: string) => {
    setCreating(true);
    const seed = Math.floor(Math.random() * 2147483647);
    const gameData = {
      seed,
      is_challenge: true,
      challengeId,
      numQuestions: Math.min(numQuestions, maxQuestions),
    };
    const { data: newMatch, error } = await supabase
      .from('matches')
      .insert([{
        player1_id: userId,
        player2_id: friendId ?? null,
        game_mode: 'challenge',
        is_public: !friendId && isPublic,
        is_ranked: false,
        status: 'waiting',
        best_of: bestOf,
        game_data: gameData as unknown as Json,
      }])
      .select()
      .single();

    setCreating(false);
    if (!error && newMatch) {
      if (friendId) {
        track('match_invite_sent', { mode: 'challenge' });
        supabase.functions.invoke('notify-invite', { body: { match_id: newMatch.id } }).catch(() => {});
      } else {
        track('matchmaking_started', { mode: 'challenge', kind: isPublic ? 'public' : 'private' });
      }
      setMatchState(newMatch);
      setView('waiting');
    } else {
      log.error('challenge match create error:', error);
      showAlert(
        tr(language, 'Erreur', 'Error'),
        tr(language, 'Impossible de créer la partie', 'Could not create match'),
      );
    }
  }, [userId, challengeId, numQuestions, maxQuestions, isPublic, bestOf, language]);

  const doCancelMatch = async () => {
    if (matchState) await supabase.from('matches').update({ status: 'cancelled' }).eq('id', matchState.id);
    setMatchState(null);
    setView('lobby');
  };

  const cancelMatch = () => {
    showAlert(
      tr(language, 'Annuler la partie ?', 'Cancel match?'),
      tr(language, 'La partie en attente sera annulée.', 'The pending match will be cancelled.'),
      [
        { text: tr(language, 'Continuer', 'Keep waiting'), style: 'cancel' },
        { text: tr(language, 'Annuler', 'Cancel'), style: 'destructive', onPress: doCancelMatch },
      ],
    );
  };

  // ─── Subviews ──────────────────────────────────────────────────────────────

  const renderLobby = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={loadingMatches} onRefresh={fetchPublicMatches} tintColor={accent} />}
    >
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: c.textMuted }]}>
          {tr(language, 'PARTIES EN ATTENTE', 'OPEN MATCHES')}
          {publicMatches.length > 0 ? ` (${publicMatches.length})` : ''}
        </Text>
        <TouchableOpacity onPress={fetchPublicMatches} style={{ padding: 6 }} hitSlop={ICON_HIT_SLOP} {...a11yButton(tr(language, 'Rafraîchir la liste', 'Refresh list'))}>
          <RefreshCw size={16} color={accent} />
        </TouchableOpacity>
      </View>

      {loadingMatches ? (
        <ActivityIndicator color={accent} style={{ marginVertical: 20 }} />
      ) : publicMatches.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.emptyText, { color: c.textMuted }]}>
            {tr(language, 'Aucune partie ouverte pour ce quiz. Crée la tienne !', 'No open matches for this quiz. Create yours!')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={publicMatches}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => <PublicRow item={item} colors={c} language={language} onJoin={joinMatch} />}
          scrollEnabled={false}
          ItemSeparatorComponent={RowSeparator}
        />
      )}

      <TouchableOpacity style={styles.createBtn} onPress={() => setView('create')} {...a11yButton(tr(language, 'Créer une partie', 'Create a match'))}>
        <Plus size={20} color="#fff" />
        <Text style={styles.createBtnText}>{tr(language, 'Créer une partie', 'Create a match')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderOptionRow = (
    label: string,
    options: number[],
    value: number,
    onPick: (v: number) => void,
  ) => (
    <>
      <Text style={[styles.formTitle, { color: c.text }]}>{label}</Text>
      <View style={styles.optRow}>
        {options.map((o) => (
          <TouchableOpacity
            key={o}
            style={[styles.optBtn, { backgroundColor: c.card, borderColor: c.border }, value === o && styles.optBtnActive]}
            onPress={() => onPick(o)}
            {...a11yButton(`${label} ${o}`, { selected: value === o })}
          >
            <Text style={[styles.optBtnText, { color: value === o ? accent : c.textMuted }]}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  const renderCreate = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
      {renderOptionRow(tr(language, 'Format (manches)', 'Format (rounds)'), BEST_OF_OPTIONS, bestOf, setBestOf)}
      {renderOptionRow(
        tr(language, 'Questions par manche', 'Questions per round'),
        QUESTION_OPTIONS.filter((q) => q <= maxQuestions),
        numQuestions,
        setNumQuestions,
      )}

      <Text style={[styles.formTitle, { color: c.text }]}>{tr(language, 'Visibilité', 'Visibility')}</Text>
      <View style={styles.optRow}>
        <TouchableOpacity
          style={[styles.visBtn, { backgroundColor: c.card, borderColor: c.border }, isPublic && styles.optBtnActive]}
          onPress={() => setIsPublic(true)}
          {...a11yButton(tr(language, 'Publique, visible par tous', 'Public, open to everyone'), { selected: isPublic })}
        >
          <Globe size={18} color={isPublic ? accent : c.textMuted} />
          <Text style={[styles.visBtnText, { color: isPublic ? accent : c.textMuted }]}>{tr(language, 'Publique', 'Public')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.visBtn, { backgroundColor: c.card, borderColor: c.border }, !isPublic && styles.optBtnActive]}
          onPress={() => { setIsPublic(false); loadFriends(); setView('friends'); }}
          {...a11yButton(tr(language, 'Privée, inviter un ami', 'Private, invite a friend'), { selected: !isPublic })}
        >
          <Users size={18} color={!isPublic ? accent : c.textMuted} />
          <Text style={[styles.visBtnText, { color: !isPublic ? accent : c.textMuted }]}>{tr(language, 'Privée', 'Private')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.createBtn, creating && { opacity: 0.6 }]}
        onPress={() => createMatch()}
        disabled={creating}
        {...a11yButton(tr(language, 'Créer la partie', 'Create match'), { disabled: creating, busy: creating })}
      >
        {creating ? <ActivityIndicator color="#fff" size="small" /> : (
          <>
            <Plus size={20} color="#fff" />
            <Text style={styles.createBtnText}>{tr(language, 'Créer la partie', 'Create match')}</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  const renderFriends = () => (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={styles.scrollContent}
      data={friends}
      keyExtractor={keyExtractor}
      ListEmptyComponent={
        <View style={[styles.emptyCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.emptyText, { color: c.textMuted }]}>{tr(language, 'Aucun ami trouvé.', 'No friends found.')}</Text>
        </View>
      }
      renderItem={({ item }: { item: any }) => {
        const friend = item.user_id1 === userId ? item.user2 : item.user1;
        if (!friend) return null;
        return (
          <View style={[styles.matchRow, { backgroundColor: c.card, borderColor: c.border, marginBottom: 8 }]}>
            <Avatar config={friend.avatar_config ?? null} photoUrl={friend.avatar_url ?? null} username={friend.username} size={40} />
            <Text style={[styles.matchCreator, { color: c.text, flex: 1 }]} numberOfLines={1}>{friend.username}</Text>
            <TouchableOpacity
              style={styles.joinBtn}
              onPress={() => createMatch(friend.id)}
              disabled={creating}
              {...a11yButton(tr(language, `Inviter ${friend.username}`, `Invite ${friend.username}`), { disabled: creating })}
            >
              <Text style={styles.joinBtnText}>{tr(language, 'Inviter', 'Invite')}</Text>
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );

  const renderWaiting = () => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <ActivityIndicator size="large" color={accent} />
      <Text style={[styles.waitingTitle, { color: c.text }]}>
        {matchState?.is_public
          ? tr(language, "Recherche d'un adversaire...", 'Finding an opponent...')
          : tr(language, "En attente de l'ami...", 'Waiting for your friend...')}
      </Text>
      <TouchableOpacity style={styles.cancelBtn} onPress={cancelMatch} {...a11yButton(tr(language, 'Annuler la partie', 'Cancel match'))}>
        <Text style={styles.cancelBtnText}>{tr(language, 'Annuler', 'Cancel')}</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── Header / back ─────────────────────────────────────────────────────────

  const handleBack = () => {
    if (view === 'lobby') onBack();
    else if (view === 'friends') setView('create');
    else setView('lobby');
  };

  const headerTitle = () => {
    if (view === 'create') return tr(language, 'Créer une partie', 'Create a match');
    if (view === 'friends') return tr(language, 'Choisir un ami', 'Choose a friend');
    if (view === 'waiting') return tr(language, 'En attente...', 'Waiting...');
    return `${tr(language, 'En ligne · ', 'Online · ')}${title}`;
  };

  if (!challenge) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: c.textMuted, fontFamily: FONTS.mono }}>{tr(language, 'Quiz introuvable.', 'Quiz not found.')}</Text>
          <TouchableOpacity style={[styles.cancelBtn, { marginTop: 16, backgroundColor: accent }]} onPress={onBack} {...a11yButton(tr(language, 'Retour', 'Back'))}>
            <Text style={styles.cancelBtnText}>{tr(language, 'Retour', 'Back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={handleBack}
          style={[styles.backBtn, { backgroundColor: isDarkMode ? 'rgba(42,110,63,0.1)' : 'rgba(42,110,63,0.05)' }]}
          hitSlop={ICON_HIT_SLOP}
          {...a11yButton(tr(language, 'Retour', 'Back'))}
        >
          <ArrowLeft color={accent} size={20} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>{headerTitle()}</Text>
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

  scrollContent: { padding: 16, paddingBottom: 40, maxWidth: 600, width: '100%', alignSelf: 'center' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontFamily: FONTS.monoBold, letterSpacing: 0.8 },

  matchRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, gap: 12 },
  matchCreator: { fontSize: 15, fontFamily: FONTS.heading },
  matchSub: { fontSize: 12, fontFamily: FONTS.mono, marginTop: 2 },
  joinBtn: { backgroundColor: PALETTE.forestGreen, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  joinBtnText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 13 },

  emptyCard: { padding: 20, borderRadius: 14, borderWidth: 1, alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 14, textAlign: 'center', fontFamily: FONTS.mono },

  createBtn: { backgroundColor: PALETTE.vermilion, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, marginTop: 20, gap: 10 },
  createBtnText: { color: '#fff', fontSize: 17, fontFamily: FONTS.monoBold },

  formTitle: { fontSize: 14, fontFamily: FONTS.monoBold, marginBottom: 10, marginTop: 20 },
  optRow: { flexDirection: 'row', gap: 10 },
  optBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  optBtnActive: { borderColor: PALETTE.forestGreen, backgroundColor: 'rgba(42,110,63,0.10)' },
  optBtnText: { fontSize: 15, fontFamily: FONTS.monoBold },
  visBtn: { flex: 1, paddingVertical: 16, paddingHorizontal: 12, borderRadius: 12, borderWidth: 2, alignItems: 'center', gap: 6, flexDirection: 'row', justifyContent: 'center' },
  visBtnText: { fontSize: 14, fontFamily: FONTS.monoBold },

  waitingTitle: { fontSize: 18, fontFamily: FONTS.heading, marginTop: 24, marginBottom: 24, textAlign: 'center' },
  cancelBtn: { marginTop: 8, backgroundColor: PALETTE.dangerRed, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 14 },
  cancelBtnText: { color: '#fff', fontWeight: '700', fontSize: 16, textAlign: 'center' },
});

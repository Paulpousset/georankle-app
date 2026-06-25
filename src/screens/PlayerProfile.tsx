import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Check, Clock, EyeOff, LayoutGrid, Swords, UserPlus, Users, Zap } from 'lucide-react-native';

import { supabase } from '../lib/supabase';
import { useCachedData } from '../lib/cache';
import { track } from '../lib/analytics';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { getRankFromElo } from '../lib/ranked';
import { RankGlobe } from '../components/RankGlobe';
import { Avatar } from '../components/Avatar';
import { WorldAvatar } from '../components/WorldAvatar';
import { deriveDefaultConfigFromSeed, normalizeConfig } from '../data/cosmetics';
import { tr } from '../i18n';
import type { AvatarConfig, Language } from '../types';

interface PlayerProfileProps {
  userId: string;
  /** Username already known by the caller — shown instantly while the snapshot loads. */
  initialUsername?: string | null;
  currentUserId: string;
  isDarkMode: boolean;
  language: Language;
  onBack: () => void;
}

/** A public snapshot of another player — never includes private data (coins, email). */
interface PublicSnapshot {
  username: string;
  avatarUrl: string | null;
  avatarConfig: AvatarConfig | null;
  showRank: boolean;
  elo: number;
  wins: number;
  losses: number;
  bestClassic: number | null;
  bestStreak: number | null;
  /** Head-to-head against the viewer, from matches both players can see. */
  h2hMine: number;
  h2hTheirs: number;
  h2hPlayed: number;
}

type FriendState = 'none' | 'sent' | 'incoming' | 'friends' | 'loading';

export default function PlayerProfile({
  userId,
  initialUsername,
  currentUserId,
  isDarkMode,
  language,
  onBack,
}: PlayerProfileProps) {
  const c = getColors(isDarkMode);

  const fetchPublic = useCallback(async (): Promise<PublicSnapshot> => {
    // Only reads that RLS exposes to any signed-in player: profiles + ratings +
    // scores are world-readable; matches are limited to public/shared rows, so
    // the head-to-head below only counts games the viewer was part of.
    const [profileRes, ratingRes, scoresRes, h2hRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('username, avatar_url, show_rank, avatar_config')
        .eq('id', userId)
        .single(),
      supabase.from('player_ratings').select('elo, wins, losses').eq('user_id', userId).maybeSingle(),
      supabase.from('scores').select('game_mode, score').eq('user_id', userId),
      supabase
        .from('matches')
        .select('player1_id, player2_id, p1_rounds_won, p2_rounds_won')
        .or(
          `and(player1_id.eq.${currentUserId},player2_id.eq.${userId}),and(player1_id.eq.${userId},player2_id.eq.${currentUserId})`,
        )
        .eq('status', 'completed'),
    ]);

    const profile = profileRes.data;
    const rating = ratingRes.data;

    const scores = scoresRes.data ?? [];
    const classic = scores.filter((s) => s.game_mode === 'classic').map((s) => s.score);
    const streak = scores.filter((s) => s.game_mode === 'streak').map((s) => s.score);

    let h2hMine = 0;
    let h2hTheirs = 0;
    for (const m of h2hRes.data ?? []) {
      const iAmP1 = m.player1_id === currentUserId;
      const myRounds = iAmP1 ? (m.p1_rounds_won ?? 0) : (m.p2_rounds_won ?? 0);
      const oppRounds = iAmP1 ? (m.p2_rounds_won ?? 0) : (m.p1_rounds_won ?? 0);
      if (myRounds > oppRounds) h2hMine += 1;
      else if (oppRounds > myRounds) h2hTheirs += 1;
    }

    return {
      username: profile?.username ?? '',
      avatarUrl: profile?.avatar_url ?? null,
      avatarConfig: profile?.avatar_config ? normalizeConfig(profile.avatar_config as AvatarConfig) : null,
      showRank: profile?.show_rank ?? true,
      elo: rating?.elo ?? 1000,
      wins: rating?.wins ?? 0,
      losses: rating?.losses ?? 0,
      bestClassic: classic.length ? Math.min(...classic) : null,
      bestStreak: streak.length ? Math.max(...streak) : null,
      h2hMine,
      h2hTheirs,
      h2hPlayed: h2hRes.data?.length ?? 0,
    };
  }, [userId, currentUserId]);

  const { data: snapshot, loading } = useCachedData<PublicSnapshot>(
    `player:${userId}:${currentUserId}`,
    fetchPublic,
    { enabled: !!userId && !!currentUserId },
  );

  useEffect(() => {
    track('player_profile_viewed', { user_id: userId });
  }, [userId]);

  const username = snapshot?.username || initialUsername || (language === 'fr' ? 'Joueur' : 'Player');
  const elo = snapshot?.elo ?? 1000;
  const wins = snapshot?.wins ?? 0;
  const losses = snapshot?.losses ?? 0;
  const showRank = snapshot?.showRank ?? true;
  const rank = getRankFromElo(elo);
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
  const ringColor = showRank ? rank.color : c.border;

  // Same avatar resolution as the own-profile screen.
  const cfg = snapshot?.avatarConfig ?? null;
  const avatar3DConfig = cfg?.useCustom
    ? cfg
    : cfg == null
      ? deriveDefaultConfigFromSeed(username || userId)
      : null;

  // ── Friend relationship ─────────────────────────────────────────────────────
  const [friend, setFriend] = useState<FriendState>('loading');
  const [friendRowId, setFriendRowId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const loadFriendState = useCallback(async () => {
    const { data } = await supabase
      .from('friends')
      .select('id, user_id1, user_id2, status')
      .or(
        `and(user_id1.eq.${currentUserId},user_id2.eq.${userId}),and(user_id1.eq.${userId},user_id2.eq.${currentUserId})`,
      )
      .maybeSingle();
    if (!data) {
      setFriend('none');
      setFriendRowId(null);
      return;
    }
    setFriendRowId(data.id);
    if (data.status === 'accepted') setFriend('friends');
    else if (data.user_id1 === currentUserId) setFriend('sent');
    else setFriend('incoming');
  }, [userId, currentUserId]);

  useEffect(() => {
    loadFriendState();
  }, [loadFriendState]);

  const addFriend = async () => {
    setActing(true);
    const { error } = await supabase
      .from('friends')
      .insert([{ user_id1: currentUserId, user_id2: userId, status: 'pending' }]);
    setActing(false);
    if (error) {
      Alert.alert(tr(language, 'Erreur', 'Error'), tr(language, "Impossible d'envoyer la demande.", 'Could not send the request.'));
      return;
    }
    track('friend_request_sent', { target_user_id: userId });
    setFriend('sent');
  };

  const acceptFriend = async () => {
    if (!friendRowId) return;
    setActing(true);
    const { error } = await supabase.from('friends').update({ status: 'accepted' }).eq('id', friendRowId);
    setActing(false);
    if (error) {
      Alert.alert(tr(language, 'Erreur', 'Error'), tr(language, "Impossible d'accepter la demande.", 'Could not accept the request.'));
      return;
    }
    track('friend_request_accepted');
    setFriend('friends');
  };

  const removeFriend = () => {
    if (!friendRowId) return;
    Alert.alert(
      tr(language, 'Supprimer', 'Remove'),
      tr(language, 'Voulez-vous vraiment supprimer cet ami ?', 'Do you really want to remove this friend?'),
      [
        { text: tr(language, 'Annuler', 'Cancel'), style: 'cancel' },
        {
          text: tr(language, 'Supprimer', 'Remove'),
          style: 'destructive',
          onPress: async () => {
            setActing(true);
            const { error } = await supabase.from('friends').delete().eq('id', friendRowId);
            setActing(false);
            if (!error) {
              track('friend_removed');
              setFriend('none');
              setFriendRowId(null);
            }
          },
        },
      ],
    );
  };

  const renderFriendButton = () => {
    if (friend === 'loading') {
      return (
        <View style={[styles.friendBtn, { backgroundColor: c.card, borderColor: c.border }]}>
          <ActivityIndicator size="small" color={c.accent} />
        </View>
      );
    }
    if (friend === 'friends') {
      return (
        <TouchableOpacity
          onPress={removeFriend}
          disabled={acting}
          style={[styles.friendBtn, { backgroundColor: c.card, borderColor: '#2a6e3f' }]}
        >
          <Users color="#2a6e3f" size={18} />
          <Text style={[styles.friendBtnText, { color: '#2a6e3f' }]}>{tr(language, 'Amis', 'Friends')}</Text>
        </TouchableOpacity>
      );
    }
    if (friend === 'sent') {
      return (
        <View style={[styles.friendBtn, { backgroundColor: c.card, borderColor: c.border }]}>
          <Clock color={c.textMuted} size={18} />
          <Text style={[styles.friendBtnText, { color: c.textMuted }]}>{tr(language, 'En attente', 'Pending')}</Text>
        </View>
      );
    }
    if (friend === 'incoming') {
      return (
        <TouchableOpacity
          onPress={acceptFriend}
          disabled={acting}
          style={[styles.friendBtn, { backgroundColor: '#2a6e3f', borderColor: '#2a6e3f' }]}
        >
          {acting ? <ActivityIndicator size="small" color="#fff" /> : <Check color="#fff" size={18} />}
          <Text style={[styles.friendBtnText, { color: '#fff' }]}>{tr(language, 'Accepter', 'Accept')}</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        onPress={addFriend}
        disabled={acting}
        style={[styles.friendBtn, { backgroundColor: c.accent, borderColor: c.accent }]}
      >
        {acting ? <ActivityIndicator size="small" color="#fff" /> : <UserPlus color="#fff" size={18} />}
        <Text style={[styles.friendBtnText, { color: '#fff' }]}>{tr(language, 'Ajouter', 'Add friend')}</Text>
      </TouchableOpacity>
    );
  };

  const h2hPlayed = snapshot?.h2hPlayed ?? 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={onBack} style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}>
          <ArrowLeft color={c.text} size={20} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>
          {tr(language, 'Profil', 'Profile')}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {loading && !snapshot ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Avatar + identity */}
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, alignItems: 'center' }]}>
            <View style={styles.avatarWrap}>
              {avatar3DConfig ? (
                <View style={{ width: 168, height: 168, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: ringColor }}>
                  <WorldAvatar config={avatar3DConfig} size={168} animate />
                </View>
              ) : (
                <Avatar
                  config={cfg}
                  photoUrl={snapshot?.avatarUrl ?? null}
                  username={username}
                  size={104}
                  ringColor={ringColor}
                  ringWidth={3}
                />
              )}
            </View>

            <Text style={[styles.username, { color: c.text }]} numberOfLines={1}>{username}</Text>

            {renderFriendButton()}
          </View>

          {/* Ranked rank (respecting the player's show_rank preference) */}
          {showRank ? (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: rank.color }]}>
              <Text style={[styles.sectionTitle, { color: c.textMuted, marginBottom: 14 }]}>
                {tr(language, 'RANG CLASSÉ', 'RANKED RANK')}
              </Text>
              <View style={styles.rankRow}>
                <RankGlobe rank={rank} size={72} showName={false} language={language} spin />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.rankName, { color: rank.color }]}>
                    {language === 'fr' ? rank.nameFr : rank.name}
                  </Text>
                  <Text style={[styles.eloText, { color: c.text }]}>
                    {elo} <Text style={{ color: c.textFaint, fontSize: 12 }}>ELO</Text>
                  </Text>
                  <View style={styles.wlRow}>
                    <Text style={[styles.wlStat, { color: '#2a6e3f' }]}>{wins}V</Text>
                    <Text style={{ color: c.textFaint }}> · </Text>
                    <Text style={[styles.wlStat, { color: '#8b1a1a' }]}>{losses}D</Text>
                    <Text style={{ color: c.textFaint }}> · </Text>
                    <Text style={[styles.wlStat, { color: c.textMuted }]}>
                      {winRate}% {tr(language, 'victoires', 'win rate')}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <EyeOff color={c.textFaint} size={20} />
              <Text style={[styles.hint, { color: c.textFaint, flex: 1, marginTop: 0, textAlign: 'left' }]}>
                {tr(language, 'Ce joueur a masqué son rang.', 'This player hides their rank.')}
              </Text>
            </View>
          )}

          {/* Head-to-head vs the viewer */}
          <Text style={[styles.outerSectionTitle, { color: c.textMuted }]}>
            {tr(language, 'FACE À FACE', 'HEAD TO HEAD')}
          </Text>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            {h2hPlayed > 0 ? (
              <View style={styles.h2hRow}>
                <View style={styles.h2hCol}>
                  <Text style={[styles.h2hValue, { color: '#2a6e3f' }]}>{snapshot?.h2hMine ?? 0}</Text>
                  <Text style={[styles.h2hLabel, { color: c.textFaint }]}>{tr(language, 'Vous', 'You')}</Text>
                </View>
                <View style={styles.h2hCenter}>
                  <Swords color={c.textMuted} size={20} />
                  <Text style={[styles.h2hSub, { color: c.textFaint }]}>
                    {h2hPlayed} {tr(language, 'parties', 'matches')}
                  </Text>
                </View>
                <View style={styles.h2hCol}>
                  <Text style={[styles.h2hValue, { color: '#8b1a1a' }]}>{snapshot?.h2hTheirs ?? 0}</Text>
                  <Text style={[styles.h2hLabel, { color: c.textFaint }]} numberOfLines={1}>{username}</Text>
                </View>
              </View>
            ) : (
              <Text style={[styles.hint, { color: c.textFaint, marginTop: 0 }]}>
                {tr(language, "Vous n'avez encore jamais joué l'un contre l'autre.", "You haven't played against each other yet.")}
              </Text>
            )}
          </View>

          {/* Solo records */}
          <Text style={[styles.outerSectionTitle, { color: c.textMuted }]}>
            {tr(language, 'RECORDS SOLO', 'SOLO RECORDS')}
          </Text>
          <View style={styles.recordsRow}>
            <View style={[styles.recordCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <LayoutGrid size={20} color="#2a6e3f" />
              <Text style={[styles.recordLabel, { color: c.textFaint }]}>RANKLE</Text>
              <Text style={[styles.recordValue, { color: '#2a6e3f' }]}>{snapshot?.bestClassic ?? '—'}</Text>
            </View>
            <View style={[styles.recordCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Zap size={20} color="#c4872a" />
              <Text style={[styles.recordLabel, { color: c.textFaint }]}>STREAK</Text>
              <Text style={[styles.recordValue, { color: '#c4872a' }]}>{snapshot?.bestStreak ?? '—'}</Text>
            </View>
          </View>
        </ScrollView>
      )}
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
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  iconBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: FONTS.headingBlack },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  card: { borderRadius: 18, borderWidth: 1, padding: 18 },
  avatarWrap: { marginBottom: 12 },
  username: { fontSize: 22, fontFamily: FONTS.headingBlack, marginBottom: 14 },
  friendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 44, minWidth: 160, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1,
  },
  friendBtnText: { fontSize: 14, fontFamily: FONTS.monoBold },
  sectionTitle: { fontSize: 11, fontFamily: FONTS.monoBold, letterSpacing: 1 },
  outerSectionTitle: { fontSize: 11, fontFamily: FONTS.monoBold, letterSpacing: 1, marginBottom: -6, marginLeft: 4 },
  rankRow: { flexDirection: 'row', alignItems: 'center' },
  rankName: { fontSize: 20, fontFamily: FONTS.headingBlack },
  eloText: { fontSize: 24, fontFamily: FONTS.headingBlack, marginTop: 2 },
  wlRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  wlStat: { fontSize: 13, fontFamily: FONTS.monoBold },
  hint: { fontSize: 12, fontFamily: FONTS.mono, marginTop: 14, textAlign: 'center' },
  h2hRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h2hCol: { flex: 1, alignItems: 'center', gap: 4 },
  h2hCenter: { alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  h2hValue: { fontSize: 32, fontFamily: FONTS.headingBlack },
  h2hLabel: { fontSize: 12, fontFamily: FONTS.mono },
  h2hSub: { fontSize: 10, fontFamily: FONTS.mono },
  recordsRow: { flexDirection: 'row', gap: 12 },
  recordCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center', gap: 6 },
  recordLabel: { fontSize: 10, fontFamily: FONTS.mono, letterSpacing: 1 },
  recordValue: { fontSize: 24, fontFamily: FONTS.headingBlack },
});

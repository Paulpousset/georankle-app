import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Flag,
  Globe,
  Info,
  LayoutGrid,
  Map as MapIcon,
  Minus,
  Plus,
  Puzzle,
  RefreshCw,
  Route,
  Swords,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react-native';

import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { log } from '../lib/log';
import { FONTS } from '../theme/typography';
import { getColors, PALETTE, type ThemeColors } from '../theme/colors';
import { tr } from '../i18n';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { a11yButton, a11yHidden, announce, ICON_HIT_SLOP } from '../lib/a11y';
import { Avatar } from '../components/Avatar';
import FfaMatch from './FfaMatch';
import RegionCountryPicker, { type RegionPick } from './RegionCountryPicker';
import { MIN_FFA_PLAYERS, MAX_FFA_PLAYERS } from '../lib/ffa';
import {
  ONLINE_MODES,
  ONLINE_MODE_ORDER,
  buildCustomGameData,
  modeKeyLabel,
  newCustomRound,
  summariseCustomModes,
  winTarget,
  type CustomRound,
  type OnlineModeKey,
} from '../lib/customMatch';
import type { AvatarConfig, Language, Match } from '../types';
import type { Json } from '../types/database';

type BuilderView = 'lobby' | 'builder' | 'friends' | 'waiting' | 'region-pick';

const MODE_ICON: Record<OnlineModeKey, any> = {
  capital: Flag,
  flag: Flag,
  guess: Info,
  classic: LayoutGrid,
  streak: Zap,
  higherlower: TrendingUp,
  silhouette: Puzzle,
  borders: Route,
  globe: Globe,
  regions: MapIcon,
};

const MODE_ACCENT: Record<OnlineModeKey, string> = {
  capital: PALETTE.sand,
  flag: PALETTE.vermilion,
  guess: PALETTE.vermilion,
  classic: PALETTE.forestGreen,
  streak: PALETTE.sand,
  higherlower: PALETTE.chartBlue,
  silhouette: PALETTE.forestGreen,
  borders: PALETTE.sand,
  globe: PALETTE.oceanBlue,
  regions: PALETTE.oceanBlue,
};

interface PublicCustomItem {
  id: string;
  player1_id: string;
  best_of: number;
  max_players: number;
  game_data: any;
  creator_username: string | null;
  creator_avatar_url: string | null;
  creator_avatar_config: AvatarConfig | null;
}

interface CustomMatchmakingProps {
  onBack: () => void;
  onStartMatch: (match: Match) => void;
}

const keyExtractor = (item: { id: string }) => item.id;
const RowSeparator = () => <View style={{ height: 8 }} />;

const PublicCustomRow = React.memo(function PublicCustomRow({
  item,
  colors,
  language,
  onJoin,
}: {
  item: PublicCustomItem;
  colors: ThemeColors;
  language: Language;
  onJoin: (item: PublicCustomItem) => void;
}) {
  const summary = summariseCustomModes(item.game_data, language);
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
          {item.max_players > 2
            ? `${tr(language, 'Chacun pour soi', 'Free-for-all')} · ${item.max_players}👤`
            : `${item.best_of} ${tr(language, 'manches', 'rounds')}`}
          {summary ? ` · ${summary}` : ''}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.joinBtn}
        onPress={() => onJoin(item)}
        {...a11yButton(
          tr(language, `Rejoindre la partie de ${item.creator_username ?? 'Joueur'}`, `Join ${item.creator_username ?? 'Player'}'s match`),
        )}
      >
        <Text style={styles.joinBtnText}>{tr(language, 'Rejoindre', 'Join')}</Text>
        <ChevronRight size={14} color="#fff" />
      </TouchableOpacity>
    </View>
  );
});

export default function CustomMatchmaking({ onBack, onStartMatch }: CustomMatchmakingProps) {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const userId = user?.id ?? '';
  const c = getColors(isDarkMode);
  const accent = PALETTE.forestGreen;

  const [view, setView] = useState<BuilderView>('lobby');
  const [rounds, setRounds] = useState<CustomRound[]>([newCustomRound('capital')]);
  const [publicMatches, setPublicMatches] = useState<PublicCustomItem[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [matchState, setMatchState] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  // Free-for-all: 2 = classic 1v1; 3–8 seats an FFA match via match_players.
  const [playerCount, setPlayerCount] = useState(2);
  const [ffaMatch, setFfaMatch] = useState<Match | null>(null);

  // ─── Builder mutators ───────────────────────────────────────────────────────

  const addRound = (key: OnlineModeKey) =>
    setRounds((prev) => (prev.length >= 9 ? prev : [...prev, newCustomRound(key)]));

  // A `regions` round needs a country + level first: the chip opens the picker,
  // and the first pick becomes the round's map (one country per round).
  const addRegionRound = (picks: RegionPick[]) => {
    const p = picks[0];
    if (p) {
      setRounds((prev) =>
        prev.length >= 9
          ? prev
          : [...prev, newCustomRound('regions', { cca3: p.cca3, name: p.name, name_en: p.name_en, unit: p.unit, level: p.level })],
      );
    }
    setView('builder');
  };

  const removeRound = (idx: number) =>
    setRounds((prev) => prev.filter((_, i) => i !== idx));

  const moveRound = (idx: number, dir: -1 | 1) =>
    setRounds((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const changeCount = (idx: number, delta: number) =>
    setRounds((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, count: Math.max(1, Math.min(20, r.count + delta)) } : r,
      ),
    );

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const fetchPublicMatches = useCallback(async () => {
    if (!userId) return;
    setLoadingMatches(true);
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .eq('is_public', true)
      .eq('is_ranked', false)
      .eq('status', 'waiting')
      .neq('player1_id', userId)
      .order('created_at', { ascending: false })
      .limit(40);

    const custom = (matches ?? []).filter((m: any) => m.game_data?.is_custom).slice(0, 20);
    if (custom.length === 0) {
      setPublicMatches([]);
      setLoadingMatches(false);
      return;
    }

    const creatorIds = [...new Set(custom.map((m: any) => m.player1_id as string))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, avatar_config')
      .in('id', creatorIds);
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    setPublicMatches(
      custom.map((m: any) => {
        const p = profileMap.get(m.player1_id);
        return {
          id: m.id,
          player1_id: m.player1_id,
          best_of: m.best_of,
          max_players: m.max_players ?? 2,
          game_data: m.game_data,
          creator_username: p?.username ?? null,
          creator_avatar_url: p?.avatar_url ?? null,
          creator_avatar_config: p?.avatar_config ?? null,
        };
      }),
    );
    setLoadingMatches(false);
  }, [userId]);

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

  // Realtime: watch our pending match for an opponent joining.
  useEffect(() => {
    if (!matchState) return;
    const channel = supabase
      .channel(`custom_${matchState.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchState.id}` },
        async (payload: any) => {
          const newMatch = payload.new;
          setMatchState(newMatch);
          if (newMatch.status === 'in_progress') {
            announce(tr(language, 'Adversaire trouvé, la partie commence', 'Opponent found, match starting'));
            const { data: fullMatch } = await supabase
              .from('matches').select('*').eq('id', newMatch.id).single();
            onStartMatch((fullMatch ?? newMatch) as Match);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchState?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ────────────────────────────────────────────────────────────────

  const joinMatch = useCallback(async (match: PublicCustomItem) => {
    // Free-for-all match → claim a seat via the RPC and open the FFA screen.
    if ((match.max_players ?? 2) > 2) {
      const { data, error } = await supabase.rpc('join_ffa_match', { p_match_id: match.id });
      if (error) {
        Alert.alert(
          tr(language, 'Erreur', 'Error'),
          tr(language, 'Impossible de rejoindre la partie', 'Could not join match'),
        );
        return;
      }
      void data;
      track('matchmaking_started', { mode: 'ffa', kind: 'public' });
      const { data: full } = await supabase.from('matches').select('*').eq('id', match.id).single();
      if (full) setFfaMatch(full as Match);
      return;
    }
    const { data: updated, error } = await supabase
      .from('matches')
      .update({ player2_id: userId, status: 'in_progress' })
      .eq('id', match.id)
      .select()
      .single();
    if (!error && updated) {
      track('matchmaking_started', { mode: 'custom', kind: 'public' });
      setMatchState(updated);
      onStartMatch(updated as Match);
    } else {
      Alert.alert(
        tr(language, 'Erreur', 'Error'),
        tr(language, 'Impossible de rejoindre la partie', 'Could not join match'),
      );
    }
  }, [userId, language, onStartMatch]);

  const createMatch = useCallback(async (friendId?: string) => {
    if (rounds.length === 0) return;
    setCreating(true);
    const seed = Math.floor(Math.random() * 2147483647);
    const gameData = buildCustomGameData(rounds, seed);
    const bestOf = gameData.modes.length;
    const isFfa = playerCount > 2;

    const { data: newMatch, error } = await supabase
      .from('matches')
      .insert([{
        player1_id: userId,
        player2_id: friendId ?? null,
        game_mode: gameData.modes[0],
        is_public: !friendId,
        is_ranked: false,
        status: 'waiting',
        best_of: bestOf,
        max_players: isFfa ? playerCount : 2,
        game_data: gameData as unknown as Json,
      }])
      .select()
      .single();

    setCreating(false);
    if (!error && newMatch) {
      // Free-for-all: seat the host (slot 0) and open the FFA lobby screen.
      if (isFfa) {
        await supabase.rpc('host_ffa_match', { p_match_id: newMatch.id });
        track('matchmaking_started', { mode: 'ffa', kind: 'public' });
        setFfaMatch(newMatch as Match);
        return;
      }
      if (friendId) {
        track('match_invite_sent', { mode: 'custom' });
        supabase.functions
          .invoke('notify-invite', { body: { match_id: newMatch.id } })
          .catch(() => {});
      } else {
        track('matchmaking_started', { mode: 'custom', kind: 'public' });
      }
      setMatchState(newMatch);
      setView('waiting');
    } else {
      log.error('custom match create error:', error);
      Alert.alert(
        tr(language, 'Erreur', 'Error'),
        tr(language, 'Impossible de créer la partie', 'Could not create match'),
      );
    }
  }, [rounds, userId, language, playerCount]);

  const inviteFriend = (friendId: string) => createMatch(friendId);

  const doCancelMatch = async () => {
    if (matchState) {
      await supabase.from('matches').update({ status: 'cancelled' }).eq('id', matchState.id);
    }
    setMatchState(null);
    setView('lobby');
  };

  const cancelMatch = () => {
    Alert.alert(
      tr(language, 'Annuler la partie ?', 'Cancel match?'),
      tr(language, 'La partie en attente sera annulée.', 'The pending match will be cancelled.'),
      [
        { text: tr(language, 'Continuer', 'Keep waiting'), style: 'cancel' },
        { text: tr(language, 'Annuler', 'Cancel'), style: 'destructive', onPress: doCancelMatch },
      ],
    );
  };

  // ─── Subviews ─────────────────────────────────────────────────────────────────

  const renderLobby = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={loadingMatches} onRefresh={fetchPublicMatches} tintColor={accent} />
      }
    >
      <View style={[styles.heroCard, { backgroundColor: c.card, borderColor: accent }]}>
        <View style={{ backgroundColor: isDarkMode ? 'rgba(42,110,63,0.2)' : 'rgba(42,110,63,0.12)', padding: 12, borderRadius: 12 }}>
          <Swords color={accent} size={26} {...a11yHidden} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heroTitle, { color: c.text }]}>
            {tr(language, 'Partie personnalisée', 'Custom game')}
          </Text>
          <Text style={[styles.heroSub, { color: c.textMuted }]}>
            {tr(language, 'Enchaîne les modes de ton choix contre un joueur', 'Chain the modes you pick against one player')}
          </Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: c.textMuted }]}>
          {tr(language, 'PARTIES OUVERTES', 'OPEN MATCHES')}
          {publicMatches.length > 0 ? ` (${publicMatches.length})` : ''}
        </Text>
        <TouchableOpacity
          onPress={fetchPublicMatches}
          style={{ padding: 6 }}
          {...a11yButton(tr(language, 'Rafraîchir la liste', 'Refresh list'))}
          hitSlop={ICON_HIT_SLOP}
        >
          <RefreshCw size={16} color={accent} />
        </TouchableOpacity>
      </View>

      {loadingMatches ? (
        <ActivityIndicator color={accent} style={{ marginVertical: 20 }} />
      ) : publicMatches.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.emptyText, { color: c.textMuted }]}>
            {tr(language, 'Aucune partie perso ouverte. Crée la tienne !', 'No open custom games. Create yours!')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={publicMatches}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => (
            <PublicCustomRow item={item} colors={c} language={language} onJoin={joinMatch} />
          )}
          scrollEnabled={false}
          ItemSeparatorComponent={RowSeparator}
        />
      )}

      <TouchableOpacity
        style={styles.createBtn}
        onPress={() => setView('builder')}
        {...a11yButton(tr(language, 'Construire une partie', 'Build a game'))}
      >
        <Plus size={20} color="#fff" />
        <Text style={styles.createBtnText}>{tr(language, 'Construire une partie', 'Build a game')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderBuilder = () => {
    const bestOf = rounds.length;
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 200 }]}>
          {/* Format summary */}
          <View style={[styles.infoBanner, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 13 }}>
              {tr(language, `BO${bestOf} · Premier à ${winTarget(bestOf)} manche(s)`, `BO${bestOf} · First to ${winTarget(bestOf)} round(s)`)}
            </Text>
            <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 11, marginTop: 2 }}>
              {playerCount > 2
                ? tr(language, `Chacun pour soi · ${playerCount} joueurs`, `Free-for-all · ${playerCount} players`)
                : tr(language, 'Chaque manche est un mode joué à 2', 'Each round is one mode played head-to-head')}
            </Text>
          </View>

          {/* Player count (free-for-all up to 8) */}
          <View style={[styles.infoBanner, { backgroundColor: c.card, borderColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Users size={16} color={accent} {...a11yHidden} />
              <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 13 }}>
                {tr(language, 'Joueurs', 'Players')}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Stepper
                onPress={() => setPlayerCount((n) => Math.max(MIN_FFA_PLAYERS, n - 1))}
                disabled={playerCount <= MIN_FFA_PLAYERS}
                icon={Minus}
                c={c}
                label={tr(language, 'Moins de joueurs', 'Fewer players')}
              />
              <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 16, minWidth: 20, textAlign: 'center' }}>
                {playerCount}
              </Text>
              <Stepper
                onPress={() => setPlayerCount((n) => Math.min(MAX_FFA_PLAYERS, n + 1))}
                disabled={playerCount >= MAX_FFA_PLAYERS}
                icon={Plus}
                c={c}
                label={tr(language, 'Plus de joueurs', 'More players')}
              />
            </View>
          </View>

          {/* Round list */}
          <Text style={[styles.sectionTitle, { color: c.textMuted, marginBottom: 10 }]}>
            {tr(language, 'MANCHES', 'ROUNDS')} ({rounds.length})
          </Text>
          <View style={{ gap: 10, marginBottom: 20 }}>
            {rounds.map((r, i) => {
              const meta = ONLINE_MODES[r.key];
              const Icon = MODE_ICON[r.key];
              const acc = MODE_ACCENT[r.key];
              return (
                <View key={r.id} style={{ backgroundColor: c.card, borderRadius: 14, padding: 12, borderLeftWidth: 4, borderLeftColor: acc }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontFamily: FONTS.monoBold, color: c.textFaint, fontSize: 12, width: 20 }}>{i + 1}</Text>
                    <Icon color={acc} size={20} {...a11yHidden} />
                    <Text style={{ flex: 1, fontFamily: FONTS.monoBold, color: c.text, fontSize: 14 }} numberOfLines={1}>
                      {modeKeyLabel(r.key, language)}
                      {r.region ? ` · ${language === 'fr' ? r.region.name : (r.region.name_en ?? r.region.name)}` : ''}
                    </Text>
                    <TouchableOpacity
                      onPress={() => moveRound(i, -1)}
                      disabled={i === 0}
                      hitSlop={ICON_HIT_SLOP}
                      {...a11yButton(tr(language, 'Monter la manche', 'Move round up'), { disabled: i === 0 })}
                      style={{ padding: 4, opacity: i === 0 ? 0.3 : 1 }}
                    >
                      <ChevronUp color={c.text} size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveRound(i, 1)}
                      disabled={i === rounds.length - 1}
                      hitSlop={ICON_HIT_SLOP}
                      {...a11yButton(tr(language, 'Descendre la manche', 'Move round down'), { disabled: i === rounds.length - 1 })}
                      style={{ padding: 4, opacity: i === rounds.length - 1 ? 0.3 : 1 }}
                    >
                      <ChevronDown color={c.text} size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeRound(i)}
                      disabled={rounds.length <= 1}
                      hitSlop={ICON_HIT_SLOP}
                      {...a11yButton(tr(language, 'Supprimer la manche', 'Remove round'), { disabled: rounds.length <= 1 })}
                      style={{ padding: 4, opacity: rounds.length <= 1 ? 0.3 : 1 }}
                    >
                      <X color={PALETTE.vermilion} size={18} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 30 }}>
                    {meta.configurable ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Stepper onPress={() => changeCount(i, -1)} disabled={r.count <= 1} icon={Minus} c={c} label={tr(language, 'Réduire le nombre', 'Decrease count')} />
                        <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 14, minWidth: 64 }}>
                          {r.count} {tr(language, meta.unitFr, meta.unitEn)}
                        </Text>
                        <Stepper onPress={() => changeCount(i, 1)} disabled={r.count >= 20} icon={Plus} c={c} label={tr(language, 'Augmenter le nombre', 'Increase count')} />
                      </View>
                    ) : (
                      <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 12 }}>
                        {tr(language, meta.unitFr, meta.unitEn)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Add a round */}
          <Text style={[styles.sectionTitle, { color: c.textMuted, marginBottom: 10 }]}>
            {tr(language, 'AJOUTER UNE MANCHE', 'ADD A ROUND')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ONLINE_MODE_ORDER.map((key) => {
              const Icon = MODE_ICON[key];
              const acc = MODE_ACCENT[key];
              const disabled = rounds.length >= 9;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => (ONLINE_MODES[key].needsRegion ? setView('region-pick') : addRound(key))}
                  disabled={disabled}
                  {...a11yButton(modeKeyLabel(key, language), {
                    hint: ONLINE_MODES[key].needsRegion
                      ? tr(language, 'Choisir un pays pour cette manche', 'Pick a country for this round')
                      : tr(language, 'Ajouter cette manche', 'Add this round'),
                    disabled,
                  })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: c.border, opacity: disabled ? 0.4 : 1 }}
                >
                  <Icon color={acc} size={15} {...a11yHidden} />
                  <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 12 }}>{modeKeyLabel(key, language)}</Text>
                  <Plus color={c.textFaint} size={13} {...a11yHidden} />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Launch options */}
        <View style={[styles.footer, { backgroundColor: c.background, borderTopColor: c.border }]}>
          <TouchableOpacity
            style={[styles.publicBtn, creating && { opacity: 0.6 }]}
            onPress={() => createMatch()}
            disabled={creating || rounds.length === 0}
            {...a11yButton(tr(language, 'Créer une partie publique', 'Create a public match'), { disabled: creating, busy: creating })}
          >
            {creating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Globe size={18} color="#fff" {...a11yHidden} />
                <Text style={styles.publicBtnText}>{tr(language, 'Partie publique', 'Public match')}</Text>
              </>
            )}
          </TouchableOpacity>
          {playerCount === 2 && (
            <TouchableOpacity
              style={[styles.inviteBtn, { borderColor: accent }, creating && { opacity: 0.6 }]}
              onPress={() => { loadFriends(); setView('friends'); }}
              disabled={creating || rounds.length === 0}
              {...a11yButton(tr(language, 'Inviter un ami', 'Invite a friend'), { disabled: creating })}
            >
              <Users size={18} color={accent} {...a11yHidden} />
              <Text style={[styles.inviteBtnText, { color: accent }]}>{tr(language, 'Inviter un ami', 'Invite a friend')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderFriends = () => (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={styles.scrollContent}
      data={friends}
      keyExtractor={keyExtractor}
      ListEmptyComponent={
        <View style={[styles.emptyCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.emptyText, { color: c.textMuted }]}>
            {tr(language, 'Aucun ami trouvé.', 'No friends found.')}
          </Text>
        </View>
      }
      renderItem={({ item }: { item: any }) => {
        const isUser1 = item.user_id1 === userId;
        const friend = isUser1 ? item.user2 : item.user1;
        if (!friend) return null;
        return (
          <View style={[styles.matchRow, { backgroundColor: c.card, borderColor: c.border, marginBottom: 8 }]}>
            <Avatar config={friend.avatar_config ?? null} photoUrl={friend.avatar_url ?? null} username={friend.username} size={40} />
            <Text style={[styles.matchCreator, { color: c.text, flex: 1 }]} numberOfLines={1}>{friend.username}</Text>
            <TouchableOpacity
              style={styles.joinBtn}
              onPress={() => inviteFriend(friend.id)}
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
      <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
        {summariseCustomModes(matchState?.game_data, language)}
      </Text>
      <TouchableOpacity
        style={styles.cancelBtn}
        onPress={cancelMatch}
        {...a11yButton(tr(language, 'Annuler la partie', 'Cancel match'))}
      >
        <Text style={styles.cancelBtnText}>{tr(language, 'Annuler', 'Cancel')}</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── Header / back ──────────────────────────────────────────────────────────

  const handleBack = () => {
    if (view === 'lobby') onBack();
    else if (view === 'friends') setView('builder');
    else if (view === 'builder') setView('lobby');
    else setView('lobby');
  };

  const headerTitle = () => {
    if (view === 'builder') return tr(language, 'Construire', 'Build');
    if (view === 'friends') return tr(language, 'Choisir un ami', 'Choose a friend');
    if (view === 'waiting') return tr(language, 'En attente...', 'Waiting...');
    return tr(language, 'Partie perso', 'Custom game');
  };

  // Free-for-all match in progress (or its lobby) — fully isolated screen.
  if (ffaMatch && user) {
    return (
      <FfaMatch
        match={ffaMatch}
        user={user}
        onExit={() => { setFfaMatch(null); setView('lobby'); fetchPublicMatches(); }}
      />
    );
  }

  // Country/level chooser for a "Défis Pays" round — its own full-screen flow.
  if (view === 'region-pick') {
    return (
      <RegionCountryPicker
        title={tr(language, 'Pays de la manche', 'Round country')}
        onPick={addRegionRound}
        onBack={() => setView('builder')}
      />
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
        <Text style={[styles.headerTitle, { color: c.text }]}>{headerTitle()}</Text>
        <View style={{ width: 44 }} />
      </View>

      {view === 'lobby' && renderLobby()}
      {view === 'builder' && renderBuilder()}
      {view === 'friends' && renderFriends()}
      {view === 'waiting' && renderWaiting()}
    </SafeAreaView>
  );
}

function Stepper({ onPress, disabled, icon: Icon, c, label }: { onPress: () => void; disabled?: boolean; icon: any; c: ThemeColors; label?: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={ICON_HIT_SLOP}
      {...(label ? a11yButton(label, { disabled }) : {})}
      style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}
    >
      <Icon color={c.text} size={15} {...a11yHidden} />
    </TouchableOpacity>
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

  heroCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 2, marginBottom: 22 },
  heroTitle: { fontSize: 17, fontFamily: FONTS.heading },
  heroSub: { fontSize: 11, fontFamily: FONTS.mono, marginTop: 3 },

  infoBanner: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 22 },

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

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 24, borderTopWidth: 1, gap: 10, flexDirection: 'row' },
  publicBtn: { flex: 1, backgroundColor: PALETTE.forestGreen, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 14, gap: 8 },
  publicBtnText: { color: '#fff', fontSize: 14, fontFamily: FONTS.monoBold },
  inviteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 14, gap: 8, borderWidth: 2 },
  inviteBtnText: { fontSize: 14, fontFamily: FONTS.monoBold },

  waitingTitle: { fontSize: 18, fontFamily: FONTS.heading, marginTop: 24, marginBottom: 12, textAlign: 'center' },
  cancelBtn: { marginTop: 8, backgroundColor: PALETTE.dangerRed, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 14 },
  cancelBtnText: { color: '#fff', fontWeight: '700', fontSize: 16, textAlign: 'center' },
});

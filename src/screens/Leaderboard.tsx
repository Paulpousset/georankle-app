import { useCallback, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Crown,
  Flag,
  Globe,
  Info,
  Landmark,
  LayoutGrid,
  Map,
  Puzzle,
  Route,
  Trophy,
  TrendingUp,
  User as UserIcon,
  Users,
  Wifi,
  Zap,
} from 'lucide-react-native';

import { supabase } from '../lib/supabase';
import { useCachedData } from '../lib/cache';
import { log } from '../lib/log';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, a11yImage } from '../lib/a11y';
import { AsyncState } from '../components/AsyncState';
import { SkeletonRows } from '../components/Skeleton';
import { TruncatedText } from '../components/TruncatedText';
import { WorldAvatar } from '../components/WorldAvatar';
import { normalizeConfig } from '../data/cosmetics';
import type { AvatarConfig } from '../types';

type Scope = 'solo' | 'online';

interface ModeDef {
  key: string;
  fr: string;
  en: string;
  icon: ComponentType<{ color: string; size: number }>;
  accent: (dark: boolean) => string;
  /** Suffix shown after the score ('%', 'pts', or a translated word). */
  unit: (lang: string) => string;
}

const pts = () => 'pts';
const pct = () => '%';
const serie = (lang: string) => (lang === 'fr' ? 'série' : 'streak');

/** Solo modes ranked by personal best in the `scores` table. */
const SOLO_MODES: ModeDef[] = [
  { key: 'classic', fr: 'Rankle', en: 'Rankle', icon: LayoutGrid, accent: () => PALETTE.forestGreen, unit: pct },
  { key: 'streak', fr: 'Streak', en: 'Streak', icon: Zap, accent: () => PALETTE.sand, unit: serie },
  { key: 'higherlower', fr: 'Plus ou Moins', en: 'Higher/Lower', icon: TrendingUp, accent: (d) => (d ? PALETTE.chartBlue : PALETTE.oceanBlue), unit: serie },
  { key: 'silhouette', fr: 'Silhouette', en: 'Silhouette', icon: Puzzle, accent: () => PALETTE.forestGreen, unit: pts },
  { key: 'borders', fr: 'Frontières', en: 'Borders', icon: Route, accent: () => PALETTE.sand, unit: pts },
  { key: 'guess', fr: 'Devine le Pays', en: 'Guess Country', icon: Info, accent: (d) => (d ? PALETTE.chartBlue : PALETTE.vermilion), unit: pts },
  { key: 'globe', fr: 'Globe Géo', en: 'Geo Globe', icon: Globe, accent: (d) => (d ? PALETTE.sand : PALETTE.vermilion), unit: pts },
  { key: 'quiz-capital', fr: 'Capitales', en: 'Capitals', icon: Landmark, accent: () => PALETTE.sand, unit: pts },
  { key: 'quiz-flag', fr: 'Drapeaux', en: 'Flags', icon: Flag, accent: (d) => (d ? PALETTE.chartBlue : PALETTE.vermilion), unit: pts },
];

/** Online modes ranked by win rate over completed matches. */
const ONLINE_MODES: ModeDef[] = [
  { key: 'classic', fr: 'Rankle', en: 'Rankle', icon: LayoutGrid, accent: () => PALETTE.forestGreen, unit: pct },
  { key: 'streak', fr: 'Streak', en: 'Streak', icon: Zap, accent: () => PALETTE.sand, unit: pct },
  { key: 'versus', fr: 'Versus', en: 'Versus', icon: Users, accent: (d) => (d ? PALETTE.chartBlue : PALETTE.vermilion), unit: pct },
  { key: 'globe', fr: 'Globe Géo', en: 'Geo Globe', icon: Globe, accent: (d) => (d ? PALETTE.sand : PALETTE.vermilion), unit: pct },
  { key: 'guess', fr: 'Devine le Pays', en: 'Guess Country', icon: Info, accent: (d) => (d ? PALETTE.chartBlue : PALETTE.vermilion), unit: pct },
  { key: 'regions', fr: 'Défis Pays', en: 'Challenges', icon: Map, accent: (d) => (d ? PALETTE.sand : PALETTE.vermilion), unit: pct },
  { key: 'higherlower', fr: 'Plus ou Moins', en: 'Higher/Lower', icon: TrendingUp, accent: (d) => (d ? PALETTE.chartBlue : PALETTE.oceanBlue), unit: pct },
  { key: 'silhouette', fr: 'Silhouette', en: 'Silhouette', icon: Puzzle, accent: () => PALETTE.forestGreen, unit: pct },
  { key: 'borders', fr: 'Frontières', en: 'Borders', icon: Route, accent: () => PALETTE.sand, unit: pct },
];

interface Entry {
  user_id: string;
  username: string | null;
  avatar: AvatarConfig | null;
  value: number;
  /** Online only: "12V · 3D" match record. */
  sub?: string;
}

interface LeaderboardProps {
  onOpenPlayer?: (userId: string, username?: string | null) => void;
}

const MEDAL_COLORS = ['#c4872a', '#7aa0c4', '#a08060']; // gold, silver, bronze
const MEDAL_TINTS = ['rgba(196,135,42,0.16)', 'rgba(122,160,196,0.16)', 'rgba(160,128,96,0.16)'];
const PODIUM_HEIGHTS = [88, 60, 44];

function parseAvatar(raw: unknown): AvatarConfig | null {
  return raw ? normalizeConfig(raw as AvatarConfig) : null;
}

const Leaderboard = ({ onOpenPlayer }: LeaderboardProps) => {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const { user } = useAuth();
  const c = getColors(isDarkMode);
  const [scope, setScope] = useState<Scope>('solo');
  const [modeKey, setModeKey] = useState<string>('classic');

  const modes = scope === 'solo' ? SOLO_MODES : ONLINE_MODES;
  const mode = modes.find((m) => m.key === modeKey) ?? modes[0];
  const accent = mode.accent(isDarkMode);
  const unit = mode.unit(language);

  const fetchSolo = useCallback(async (gameMode: string): Promise<Entry[]> => {
    const { data, error } = await supabase
      .from('scores')
      .select('score, user_id, profiles!scores_user_id_fkey (username, avatar_config)')
      .eq('game_mode', gameMode)
      .order('score', { ascending: false })
      .limit(1000);

    if (error) {
      log.error('Leaderboard fetch error:', error);
      throw error;
    }

    const rows = (data ?? []) as unknown as {
      score: number;
      user_id: string;
      profiles?: { username?: string | null; avatar_config?: unknown } | null;
    }[];

    const seen: Record<string, boolean> = {};
    const entries: Entry[] = [];
    for (const row of rows) {
      // Legacy classic rows stored raw points (>100) before the efficiency-% rescale.
      if (gameMode === 'classic' && row.score > 100) continue;
      if (seen[row.user_id]) continue;
      seen[row.user_id] = true;
      entries.push({
        user_id: row.user_id,
        username: row.profiles?.username ?? null,
        avatar: parseAvatar(row.profiles?.avatar_config),
        value: row.score,
      });
    }
    return entries;
  }, []);

  const fetchOnline = useCallback(
    async (gameMode: string): Promise<Entry[]> => {
      const { data: matches, error } = await supabase
        .from('matches')
        .select('player1_id, player2_id, p1_rounds_won, p2_rounds_won')
        .eq('game_mode', gameMode)
        .eq('status', 'completed');

      if (error) {
        log.error('Online leaderboard fetch error:', error);
        throw error;
      }

      const stats: Record<string, { wins: number; total: number }> = {};
      for (const m of matches ?? []) {
        if (!m.player1_id || !m.player2_id) continue;
        for (const id of [m.player1_id, m.player2_id]) {
          if (!stats[id]) stats[id] = { wins: 0, total: 0 };
          stats[id].total++;
        }
        if ((m.p1_rounds_won ?? 0) > (m.p2_rounds_won ?? 0)) stats[m.player1_id].wins++;
        else if ((m.p2_rounds_won ?? 0) > (m.p1_rounds_won ?? 0)) stats[m.player2_id].wins++;
      }

      const userIds = Object.keys(stats);
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_config')
        .in('id', userIds);

      const profileMap: Record<string, { username: string | null; avatar: AvatarConfig | null }> = {};
      for (const p of profiles ?? []) {
        profileMap[p.id] = { username: p.username ?? null, avatar: parseAvatar(p.avatar_config) };
      }

      return userIds
        .map((id) => {
          const s = stats[id];
          const wins = s.wins;
          const losses = s.total - s.wins;
          return {
            user_id: id,
            username: profileMap[id]?.username ?? null,
            avatar: profileMap[id]?.avatar ?? null,
            value: Math.round((wins / s.total) * 100),
            sub: language === 'fr' ? `${wins}V · ${losses}D` : `${wins}W · ${losses}L`,
            wins,
          };
        })
        .sort((a, b) => b.value - a.value || b.wins - a.wins)
        .slice(0, 100);
    },
    [language],
  );

  const fetchLeaderboard = useCallback(
    () => (scope === 'solo' ? fetchSolo(mode.key) : fetchOnline(mode.key)),
    [scope, mode.key, fetchSolo, fetchOnline],
  );

  const {
    data: cachedData,
    loading,
    error,
    refetch,
  } = useCachedData<Entry[]>(`leaderboard2:${scope}:${mode.key}`, fetchLeaderboard);
  const entries = useMemo(() => cachedData ?? [], [cachedData]);

  const myRank = useMemo(
    () => (user ? entries.findIndex((e) => e.user_id === user.id) : -1),
    [entries, user],
  );

  const anonymous = language === 'fr' ? 'Joueur Anonyme' : 'Anonymous Player';
  const youLabel = language === 'fr' ? 'TOI' : 'YOU';

  const formatScore = (value: number) => (unit === '%' ? `${value}%` : `${value}`);

  const openPlayer = (e: Entry) => onOpenPlayer?.(e.user_id, e.username);

  const switchScope = (next: Scope) => {
    if (next === scope) return;
    setScope(next);
    // Every mode key exists in both lists except the quiz/versus pairs — snap back to a valid one.
    const nextModes = next === 'solo' ? SOLO_MODES : ONLINE_MODES;
    if (!nextModes.some((m) => m.key === modeKey)) setModeKey(nextModes[0].key);
  };

  // ── Podium (top 3) ─────────────────────────────────────────────────────────
  const renderPodiumSpot = (entry: Entry | undefined, place: number) => {
    if (!entry) return <View key={`empty-${place}`} style={styles.podiumCol} />;
    const isMe = user?.id === entry.user_id;
    const name = entry.username || anonymous;
    const rankLabel = tr(language, `Rang ${place + 1}`, `Rank ${place + 1}`);
    const avatarSize = place === 0 ? 64 : 52;

    return (
      <TouchableOpacity
        key={entry.user_id}
        style={styles.podiumCol}
        activeOpacity={onOpenPlayer ? 0.6 : 1}
        disabled={!onOpenPlayer}
        onPress={() => openPlayer(entry)}
        {...a11yButton(`${rankLabel}, ${name}, ${formatScore(entry.value)} ${unit !== '%' ? unit : ''}`, {
          disabled: !onOpenPlayer,
          hint: onOpenPlayer ? tr(language, 'Voir le profil', 'View profile') : undefined,
        })}
      >
        {place === 0 && (
          <Crown size={22} color={MEDAL_COLORS[0]} style={styles.crown} {...a11yImage(rankLabel)} />
        )}
        <View
          style={[
            styles.podiumAvatar,
            {
              width: avatarSize + 10,
              height: avatarSize + 10,
              borderRadius: (avatarSize + 10) / 2,
              borderColor: MEDAL_COLORS[place],
              backgroundColor: c.surface,
            },
          ]}
        >
          <WorldAvatar config={entry.avatar} size={avatarSize} />
        </View>
        <TruncatedText style={[styles.podiumName, { color: c.text }]}>{name}</TruncatedText>
        {isMe && (
          <Text style={[styles.youBadge, { color: accent, borderColor: accent }]}>{youLabel}</Text>
        )}
        <Text style={[styles.podiumScore, { color: accent }]}>
          {formatScore(entry.value)}
          {unit !== '%' && <Text style={[styles.podiumUnit, { color: c.textFaint }]}> {unit}</Text>}
        </Text>
        {entry.sub && (
          <Text style={[styles.podiumSub, { color: c.textFaint }]}>{entry.sub}</Text>
        )}
        <View
          style={[
            styles.pedestal,
            {
              height: PODIUM_HEIGHTS[place],
              backgroundColor: MEDAL_TINTS[place],
              borderColor: MEDAL_COLORS[place],
            },
          ]}
        >
          <Text style={[styles.pedestalRank, { color: MEDAL_COLORS[place] }]}>{place + 1}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const podium = entries.length > 0 && (
    <View style={styles.podiumRow}>
      {renderPodiumSpot(entries[1], 1)}
      {renderPodiumSpot(entries[0], 0)}
      {renderPodiumSpot(entries[2], 2)}
    </View>
  );

  // ── List rows (rank 4+) ────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item, index }: { item: Entry; index: number }) => {
      const rank = index + 4;
      const isMe = user?.id === item.user_id;
      const name = item.username || anonymous;
      const rankLabel = tr(language, `Rang ${rank}`, `Rank ${rank}`);

      return (
        <TouchableOpacity
          activeOpacity={onOpenPlayer ? 0.6 : 1}
          disabled={!onOpenPlayer}
          onPress={() => openPlayer(item)}
          style={[
            styles.itemRow,
            { backgroundColor: c.card, borderColor: c.border },
            isMe && { borderColor: accent, borderWidth: 1.5, backgroundColor: c.surface },
          ]}
          {...a11yButton(`${rankLabel}, ${name}`, {
            disabled: !onOpenPlayer,
            hint: onOpenPlayer ? tr(language, 'Voir le profil', 'View profile') : undefined,
          })}
        >
          <Text style={[styles.rankText, { color: isMe ? accent : c.textFaint }]}>{rank}</Text>
          <View style={[styles.rowAvatar, { backgroundColor: c.surface, borderColor: c.border }]}>
            <WorldAvatar config={item.avatar} size={30} />
          </View>
          <View style={styles.userInfo}>
            <View style={styles.nameRow}>
              <TruncatedText style={[styles.username, { color: c.text }]}>{name}</TruncatedText>
              {isMe && (
                <Text style={[styles.youBadge, { color: accent, borderColor: accent }]}>
                  {youLabel}
                </Text>
              )}
            </View>
            {item.sub && <Text style={[styles.subText, { color: c.textFaint }]}>{item.sub}</Text>}
          </View>
          <Text style={[styles.scoreValue, { color: accent }]}>
            {formatScore(item.value)}
            {unit !== '%' && <Text style={[styles.unitText, { color: c.textFaint }]}> {unit}</Text>}
          </Text>
        </TouchableOpacity>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c, language, accent, unit, user?.id, onOpenPlayer],
  );

  // ── Pinned "your rank" bar (only when off the podium) ──────────────────────
  const me = myRank >= 3 ? entries[myRank] : null;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={[styles.title, { color: c.text }]}>
        {language === 'fr' ? 'Classement Mondial' : 'Global Leaderboard'}
      </Text>

      {/* Solo / Online scope switch */}
      <View style={[styles.scopeTabs, { backgroundColor: c.card, borderColor: c.border }]}>
        {(
          [
            { key: 'solo' as Scope, label: 'SOLO', icon: UserIcon },
            { key: 'online' as Scope, label: tr(language, 'EN LIGNE', 'ONLINE'), icon: Wifi },
          ]
        ).map(({ key, label, icon: Icon }) => {
          const active = scope === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => switchScope(key)}
              style={[styles.scopeTab, active && { backgroundColor: accent }]}
              {...a11yButton(label, { role: 'tab', selected: active })}
            >
              <Icon size={16} color={active ? 'white' : c.textMuted} />
              <Text style={[styles.scopeTabText, { color: active ? 'white' : c.textMuted }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Mode chips */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {modes.map((m) => {
            const active = m.key === mode.key;
            const chipAccent = m.accent(isDarkMode);
            const label = language === 'fr' ? m.fr : m.en;
            const Icon = m.icon;
            return (
              <TouchableOpacity
                key={m.key}
                onPress={() => setModeKey(m.key)}
                style={[
                  styles.chip,
                  { backgroundColor: c.card, borderColor: c.border },
                  active && { backgroundColor: chipAccent, borderColor: chipAccent },
                ]}
                {...a11yButton(label, { role: 'tab', selected: active })}
              >
                <Icon size={14} color={active ? 'white' : chipAccent} />
                <Text style={[styles.chipText, { color: active ? 'white' : c.textMuted }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
          style={styles.list}
          data={entries.slice(3, 50)}
          keyExtractor={(item) => item.user_id}
          renderItem={renderItem}
          ListHeaderComponent={podium || null}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            entries.length === 0 ? (
              <View style={styles.emptyBox}>
                <Trophy size={36} color={c.textFaint} {...a11yImage(tr(language, 'Trophée', 'Trophy'))} />
                <Text style={[styles.emptyText, { color: c.textMuted }]}>
                  {language === 'fr'
                    ? 'Aucun score pour ce mode.\nSois le premier au classement !'
                    : 'No scores for this mode yet.\nBe the first on the board!'}
                </Text>
              </View>
            ) : null
          }
        />
        {me && (
          <View
            style={[
              styles.myRankBar,
              { backgroundColor: c.surface, borderColor: accent },
            ]}
          >
            <Text style={[styles.rankText, { color: accent }]}>{myRank + 1}</Text>
            <View style={[styles.rowAvatar, { backgroundColor: c.card, borderColor: c.border }]}>
              <WorldAvatar config={me.avatar} size={30} />
            </View>
            <View style={styles.userInfo}>
              <View style={styles.nameRow}>
                <TruncatedText style={[styles.username, { color: c.text }]}>
                  {me.username || anonymous}
                </TruncatedText>
                <Text style={[styles.youBadge, { color: accent, borderColor: accent }]}>
                  {youLabel}
                </Text>
              </View>
              {me.sub && <Text style={[styles.subText, { color: c.textFaint }]}>{me.sub}</Text>}
            </View>
            <Text style={[styles.scoreValue, { color: accent }]}>
              {formatScore(me.value)}
              {unit !== '%' && <Text style={[styles.unitText, { color: c.textFaint }]}> {unit}</Text>}
            </Text>
          </View>
        )}
      </AsyncState>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 14, paddingTop: 10 },
  title: {
    fontSize: 24,
    fontFamily: FONTS.headingBlack,
    textAlign: 'center',
    marginBottom: 14,
  },
  scopeTabs: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
  },
  scopeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 9,
    borderRadius: 10,
    gap: 8,
  },
  scopeTabText: { fontFamily: FONTS.monoBold, fontSize: 12 },
  chipsRow: { gap: 8, paddingBottom: 12, paddingHorizontal: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontFamily: FONTS.monoBold, fontSize: 11 },
  // Podium
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
    marginBottom: 18,
  },
  podiumCol: { flex: 1, maxWidth: 110, alignItems: 'center' },
  crown: { marginBottom: 2 },
  podiumAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    marginBottom: 6,
    overflow: 'hidden',
  },
  podiumName: { fontFamily: FONTS.heading, fontSize: 13, maxWidth: 104, textAlign: 'center' },
  podiumScore: { fontFamily: FONTS.headingBlack, fontSize: 17, marginTop: 2, marginBottom: 8 },
  podiumUnit: { fontFamily: FONTS.mono, fontSize: 10 },
  podiumSub: { fontFamily: FONTS.mono, fontSize: 10, marginTop: -6, marginBottom: 8 },
  pedestal: {
    alignSelf: 'stretch',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pedestalRank: { fontFamily: FONTS.headingBlack, fontSize: 26 },
  // List
  list: { flex: 1 },
  listContent: { paddingBottom: 16 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    gap: 10,
  },
  rankText: { fontFamily: FONTS.monoBold, fontSize: 13, width: 28, textAlign: 'center' },
  rowAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  userInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  username: { fontFamily: FONTS.heading, flexShrink: 1 },
  youBadge: {
    fontFamily: FONTS.monoBold,
    fontSize: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  subText: { fontFamily: FONTS.mono, fontSize: 10, marginTop: 1 },
  scoreValue: { fontFamily: FONTS.headingBlack, fontSize: 16 },
  unitText: { fontFamily: FONTS.mono, fontSize: 10 },
  myRankBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
    gap: 10,
  },
  emptyBox: { alignItems: 'center', marginTop: 48, gap: 12 },
  emptyText: { textAlign: 'center', fontFamily: FONTS.mono, fontSize: 12, lineHeight: 18 },
});

export default Leaderboard;

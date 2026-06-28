import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Swords, Shield } from 'lucide-react-native';

import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { log } from '../lib/log';
import { FONTS } from '../theme/typography';
import { getColors } from '../theme/colors';
import { tr } from '../i18n';
import {
  getRankFromElo,
  getRankProgress,
  getBestOfForRank,
  generateRankedModes,
  modeLabel,
  RANKS,
} from '../lib/ranked';
import { RankGlobe } from '../components/RankGlobe';
import { gameData as gd } from '../data/gameData';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { a11yButton, announce, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import type { Match, MatchMode } from '../types';
import type { Json } from '../types/database';

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
    const countryCca3s = seededShuffle(countries, rand)
      .slice(0, SESSION_SIZE)
      .map((c) => c.cca3);
    sessions[r] = { themeIds, countryCca3s };
  }
  return sessions;
}

interface RankedMatchmakingProps {
  onBack: () => void;
  onStartMatch: (match: Match) => void;
}

export default function RankedMatchmaking({
  onBack,
  onStartMatch,
}: RankedMatchmakingProps) {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const userId = user?.id ?? '';
  const c = getColors(isDarkMode);

  const [elo, setElo] = useState(1000);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [username, setUsername] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [matchState, setMatchState] = useState<any>(null);

  const rank = getRankFromElo(elo);
  const progress = getRankProgress(elo);
  const bestOf = getBestOfForRank(rank);
  const nextRank = RANKS.find((r) => r.minElo > rank.minElo) ?? null;

  const fetchRating = useCallback(async () => {
    if (!userId) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();
    setUsername(profile?.username ?? null);

    const { data: rating } = await supabase
      .from('player_ratings')
      .select('elo, wins, losses')
      .eq('user_id', userId)
      .single();

    if (rating) {
      setElo(rating.elo);
      setWins(rating.wins);
      setLosses(rating.losses);
    }
  }, [userId]);

  useEffect(() => {
    fetchRating();
  }, [fetchRating]);

  // Watch for opponent joining
  useEffect(() => {
    if (!matchState) return;
    const channel = supabase
      .channel(`ranked_${matchState.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchState.id}` },
        async (payload: any) => {
          const newMatch = payload.new;
          setMatchState(newMatch);
          if (newMatch.status === 'in_progress') {
            announce(tr(language, 'Adversaire trouvé, la partie classée commence', 'Opponent found, ranked match starting'));
            const { data: fullMatch } = await supabase
              .from('matches')
              .select('*')
              .eq('id', newMatch.id)
              .single();
            onStartMatch((fullMatch ?? newMatch) as Match);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchState?.id]);

  const doCancelSearch = async () => {
    if (matchState) {
      await supabase
        .from('matches')
        .update({ status: 'cancelled' })
        .eq('id', matchState.id);
    }
    setMatchState(null);
    setSearching(false);
  };

  const cancelSearch = () => {
    Alert.alert(
      tr(language, 'Annuler la recherche ?', 'Cancel search?'),
      tr(language, 'Tu quitteras la file d’attente classée.', 'You will leave the ranked queue.'),
      [
        { text: tr(language, 'Continuer', 'Keep searching'), style: 'cancel' },
        { text: tr(language, 'Annuler', 'Cancel'), style: 'destructive', onPress: doCancelSearch },
      ],
    );
  };

  const findOrCreateMatch = async () => {
    setSearching(true);
    track('matchmaking_started', { mode: 'ranked' });

    // Try to join an existing ranked match
    const { data: openMatches } = await supabase
      .from('matches')
      .select('*')
      .eq('is_ranked', true)
      .eq('is_public', true)
      .eq('status', 'waiting')
      .neq('player1_id', userId)
      .is('player2_id', null)
      .order('created_at', { ascending: true })
      .limit(5);

    // Pick the first compatible match (same best_of)
    const compatible = (openMatches ?? []).find(
      (m: any) => m.best_of === bestOf,
    );

    if (compatible) {
      const { data: updated, error } = await supabase
        .from('matches')
        .update({ player2_id: userId, status: 'in_progress' })
        .eq('id', compatible.id)
        .select()
        .single();

      if (!error && updated) {
        onStartMatch(updated as Match);
        return;
      }
    }

    // Create a new ranked match
    const seed = Math.floor(Math.random() * 2147483647);
    const rankedModes = generateRankedModes(bestOf, seed);
    const firstMode: MatchMode = rankedModes[0];

    const gameData: Record<string, unknown> = {
      seed,
      is_ranked: true,
      ranked_modes: rankedModes,
      sessions: buildClassicSessions(seed, bestOf),
      questionType: 'MIX',
      roundsPerSet: 5,
    };

    const { data: newMatch, error: createError } = await supabase
      .from('matches')
      .insert([{
        player1_id: userId,
        game_mode: firstMode,
        is_public: true,
        is_ranked: true,
        status: 'waiting',
        best_of: bestOf,
        game_data: gameData as Json,
      }])
      .select()
      .single();

    if (!createError && newMatch) {
      setMatchState(newMatch);
    } else {
      log.error('Ranked matchmaking error:', createError);
      setSearching(false);
      Alert.alert(
        tr(language, 'Erreur', 'Error'),
        tr(language, 'Impossible de lancer la recherche. Réessaie.', 'Could not start matchmaking. Try again.'),
      );
    }
  };

  const cardBg = isDarkMode ? '#132040' : '#e8d9b8';
  const cardBorder = isDarkMode ? '#2d4a70' : '#c4a87a';
  const textPrimary = c.text;
  const textSecondary = c.textMuted;

  const eloToNextRank = nextRank ? nextRank.minElo - elo : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: cardBorder }]}>
        <TouchableOpacity
          onPress={searching ? cancelSearch : onBack}
          style={[styles.backBtn, { backgroundColor: isDarkMode ? 'rgba(42,110,63,0.1)' : 'rgba(42,110,63,0.05)' }]}
          hitSlop={ICON_HIT_SLOP}
          {...a11yButton(searching ? tr(language, 'Annuler la recherche', 'Cancel search') : tr(language, 'Retour', 'Back'))}
        >
          <ArrowLeft color="#2a6e3f" size={20} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>
          {tr(language, 'Mode Classé', 'Ranked Mode')}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Rank card */}
        <View style={[styles.rankCard, { backgroundColor: cardBg, borderColor: rank.color }]}>
          <RankGlobe rank={rank} size={90} showName language={language} spin />

          <View style={styles.rankInfo}>
            <Text style={[styles.username, { color: textPrimary }]}>
              {username ?? tr(language, 'Joueur', 'Player')}
            </Text>
            <ScoreText style={[styles.eloText, { color: rank.color }]}>
              {elo} <Text style={{ color: textSecondary, fontSize: 13 }}>ELO</Text>
            </ScoreText>

            {/* Progress bar */}
            <View style={[styles.progressTrack, { backgroundColor: cardBorder }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(progress * 100)}%`, backgroundColor: rank.color },
                ]}
              />
            </View>

            {nextRank ? (
              <Text style={[styles.progressLabel, { color: textSecondary }]}>
                {`+${eloToNextRank} → `}
                <Text style={{ color: nextRank.color }}>
                  {language === 'fr' ? nextRank.nameFr : nextRank.name}
                </Text>
              </Text>
            ) : (
              <Text style={[styles.progressLabel, { color: rank.color }]}>
                {tr(language, 'Rang maximum', 'Maximum rank')}
              </Text>
            )}

            <View style={styles.statsRow}>
              <Text style={[styles.stat, { color: '#2a6e3f' }]}>{wins}W</Text>
              <Text style={[styles.statSep, { color: textSecondary }]}> / </Text>
              <Text style={[styles.stat, { color: '#8b1a1a' }]}>{losses}L</Text>
            </View>
          </View>
        </View>

        {/* Match info */}
        <View style={[styles.infoCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.infoRow}>
            <Shield size={16} color={textSecondary} />
            <Text style={[styles.infoLabel, { color: textSecondary }]}>
              {tr(language, 'Format', 'Format')}
            </Text>
            <Text style={[styles.infoValue, { color: textPrimary }]}>BO{bestOf}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: cardBorder }]} />
          <View style={styles.infoRow}>
            <Swords size={16} color={textSecondary} />
            <Text style={[styles.infoLabel, { color: textSecondary }]}>
              {tr(language, 'Modes', 'Modes')}
            </Text>
            <Text style={[styles.infoValue, { color: textPrimary }]}>
              {tr(language, 'Aléatoires & variés', 'Random & mixed')}
            </Text>
          </View>
          <View style={[styles.modePillsRow]}>
            {['classic', 'streak', 'versus', 'globe', 'guess'].map((m) => (
              <View key={m} style={[styles.modePill, { borderColor: cardBorder, backgroundColor: c.background }]}>
                <Text style={[styles.modePillText, { color: textSecondary }]}>
                  {modeLabel(m as MatchMode, language)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Search button or searching state */}
        {searching && matchState ? (
          <View style={styles.searchingCard}>
            <ActivityIndicator size="large" color={rank.color} />
            <Text style={[styles.searchingText, { color: textPrimary }]}>
              {tr(language, 'Recherche d\'un adversaire...', 'Finding an opponent...')}
            </Text>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={cancelSearch}
              {...a11yButton(tr(language, 'Annuler la recherche', 'Cancel search'))}
            >
              <Text style={styles.cancelBtnText}>
                {tr(language, 'Annuler', 'Cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.searchBtn, { backgroundColor: rank.color, opacity: searching ? 0.6 : 1 }]}
            onPress={findOrCreateMatch}
            disabled={searching}
            accessibilityRole="button"
            accessibilityLabel={tr(language, 'Trouver une partie classée', 'Find a ranked match')}
          >
            <Swords size={22} color="#fff" />
            <Text style={styles.searchBtnText}>
              {tr(language, 'Trouver une partie', 'Find a match')}
            </Text>
          </TouchableOpacity>
        )}

        {/* All ranks overview */}
        <Text style={[styles.sectionTitle, { color: textSecondary }]}>
          {tr(language, 'RANGS', 'RANKS')}
        </Text>
        <View style={[styles.ranksCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {RANKS.map((r, i) => {
            const isCurrentRank = r.tier === rank.tier;
            return (
              <View key={r.tier}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: cardBorder }]} />}
                <View style={[styles.rankRow, isCurrentRank && { backgroundColor: `${r.color}18` }]}>
                  <RankGlobe rank={r} size={36} showName={false} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rankRowName, { color: isCurrentRank ? r.color : textPrimary }]}>
                      {language === 'fr' ? r.nameFr : r.name}
                      {isCurrentRank && (
                        <Text style={{ color: r.color, fontSize: 11 }}>
                          {tr(language, '  ← vous êtes ici', '  ← you are here')}
                        </Text>
                      )}
                    </Text>
                    <Text style={[styles.rankRowElo, { color: textSecondary }]}>
                      {r.maxElo !== null
                        ? `${r.minElo} – ${r.maxElo} ELO`
                        : `${r.minElo}+ ELO`}
                    </Text>
                  </View>
                  <Text style={[styles.rankRowBo, { color: textSecondary }]}>
                    {getBestOfForRank(r) === 3 ? 'BO3' : 'BO5'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
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
  headerTitle: {
    fontSize: 18,
    fontFamily: FONTS.headingBlack,
    flex: 1,
    textAlign: 'center',
  },
  backBtn: {
    padding: 8,
    borderRadius: 10,
    width: 44,
    alignItems: 'center',
  },

  content: {
    padding: 16,
    paddingBottom: 48,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    gap: 14,
  },

  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 20,
    borderWidth: 2,
    gap: 18,
  },
  rankInfo: { flex: 1, gap: 4 },
  username: { fontSize: 17, fontFamily: FONTS.heading },
  eloText: { fontSize: 28, fontFamily: FONTS.headingBlack, lineHeight: 34 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabel: { fontSize: 12, fontFamily: FONTS.mono, marginTop: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  stat: { fontSize: 14, fontFamily: FONTS.monoBold },
  statSep: { fontSize: 14, fontFamily: FONTS.mono },

  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  infoLabel: { fontSize: 13, fontFamily: FONTS.mono, flex: 1 },
  infoValue: { fontSize: 13, fontFamily: FONTS.monoBold },
  divider: { height: 1 },
  modePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  modePillText: { fontSize: 11, fontFamily: FONTS.mono },

  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 18,
    gap: 12,
    marginTop: 6,
  },
  searchBtnText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: FONTS.monoBold,
  },

  searchingCard: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 24,
    marginTop: 6,
  },
  searchingText: {
    fontSize: 16,
    fontFamily: FONTS.heading,
    textAlign: 'center',
  },
  cancelBtn: {
    backgroundColor: '#8b1a1a',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 4,
  },
  cancelBtnText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 14 },

  sectionTitle: {
    fontSize: 11,
    fontFamily: FONTS.monoBold,
    letterSpacing: 1,
    marginTop: 8,
    marginLeft: 4,
  },
  ranksCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  rankRowName: { fontSize: 14, fontFamily: FONTS.monoBold },
  rankRowElo: { fontSize: 11, fontFamily: FONTS.mono, marginTop: 2 },
  rankRowBo: { fontSize: 12, fontFamily: FONTS.monoBold },
});

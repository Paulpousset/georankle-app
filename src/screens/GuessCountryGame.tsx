import React, { useEffect, useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Home, Search, XCircle, RefreshCcw, Wifi, Flag, Share2 } from 'lucide-react-native';
import {
  AtlasWin,
  AtlasLose,
  AtlasCheck,
  AtlasCross,
  AtlasGlobe,
  AtlasCompass,
  AtlasDistance,
  AtlasPopulation,
  AtlasArea,
  AtlasCoin,
  AtlasCoastline,
  AtlasLifeExp,
  AtlasBorders,
  AtlasTarget,
  type AtlasIconProps,
} from '../components/AtlasIcons';
import { TopInsetBar } from '../components/TopInsetBar';
import type { ComponentType } from 'react';
import Fuse from 'fuse.js';
import type { User } from '@supabase/supabase-js';

import gameData from '../../assets/game_data.json';
import countriesStats from '../../assets/countries_stats.json';
import { getFlagUrl } from '../lib/flags';
import { COUNTRY_ALIASES } from '../lib/answerMatch';
import { normalizeRoundScore } from '../lib/score';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { log } from '../lib/log';
import { createSeededRng } from '../lib/rng';
import {
  CATEGORIES,
  buildComparison,
  calcScore,
  type CatId,
  type CellResult,
} from '../lib/gameLogic';
import type { Match } from '../types';
import { FONTS } from '../theme/typography';
import { PALETTE } from '../theme/colors';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { tr } from '../i18n';
import { a11yButton, announce, a11yImage, a11yHidden, ICON_HIT_SLOP } from '../lib/a11y';

/** Atlas line-icon per comparison category (rendered white on the colored tile). */
const CAT_ICONS: Record<CatId, ComponentType<AtlasIconProps>> = {
  continent: AtlasGlobe,
  direction: AtlasCompass,
  distance: AtlasDistance,
  population: AtlasPopulation,
  area: AtlasArea,
  gdp: AtlasCoin,
  coastline: AtlasCoastline,
  life_exp: AtlasLifeExp,
  borders: AtlasBorders,
};

/** Renders a comparison hint: ✓/✗ as Atlas icons, ▲/▼ glyphs and words as text. */
function TileHint({ hint }: { hint: string }) {
  if (hint === '✓') return <AtlasCheck color="#fff" size={13} />;
  if (hint.startsWith('✗')) {
    const rest = hint.slice(1).trim();
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <AtlasCross color="#fff" size={12} />
        {rest ? <Text style={styles.tileHint}>{rest}</Text> : null}
      </View>
    );
  }
  return (
    <Text style={styles.tileHint} numberOfLines={1}>
      {hint}
    </Text>
  );
}

interface Props {
  onBackToMenu: () => void;
  user?: User | null;
  matchData?: Match | null;
  onRoundComplete?: (score: number) => void;
  /** Daily challenge: deterministic seed for today's puzzle (overrides random). */
  dailySeed?: number;
  /** Daily challenge: fired once on win with the score + emoji share grid. */
  onDailyComplete?: (score: number, grid?: string) => void;
  /** Daily challenge: replaces "Play again" with "Share" and skips score saving. */
  isDaily?: boolean;
  /** Daily challenge: invoked by the "Share" button on the win card. */
  onShare?: () => void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GuessEntry {
  country: any;
  comparison: Record<CatId, CellResult>;
  isCorrect: boolean;
}

function pickRandom(): { country: any; stats: any } {
  const countries = (gameData as any).countries as any[];
  const country = countries[Math.floor(Math.random() * countries.length)];
  const stats = (countriesStats as any[]).find((c) => c.cca3 === country.cca3) ?? {};
  return { country, stats };
}

function pickSeeded(seed: number): { country: any; stats: any } {
  const countries = (gameData as any).countries as any[];
  const rng = createSeededRng(seed);
  const idx = Math.floor(rng() * countries.length);
  const country = countries[idx];
  const stats = (countriesStats as any[]).find((c: any) => c.cca3 === country.cca3) ?? {};
  return { country, stats };
}

/** Resolves a specific country by cca3 (the match's precomputed assignment). */
function pickByCca3(cca3: string): { country: any; stats: any } | null {
  const countries = (gameData as any).countries as any[];
  const country = countries.find((c) => c.cca3 === cca3);
  if (!country) return null;
  const stats = (countriesStats as any[]).find((c: any) => c.cca3 === country.cca3) ?? {};
  return { country, stats };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GuessCountryGame({
  onBackToMenu,
  user,
  matchData,
  onRoundComplete,
  dailySeed,
  onDailyComplete,
  isDaily,
  onShare,
}: Props) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const isOnline = !!matchData;
  const isPlayer1 = matchData?.player1_id === user?.id;
  const { width } = useWindowDimensions();

  const [target, setTarget] = useState<{ country: any; stats: any }>(() => {
    if (dailySeed != null) {
      return pickSeeded(dailySeed);
    }
    if (matchData?.game_data?.seed != null) {
      // Prefer the match's deduplicated per-round assignment (no country repeats
      // across modes); fall back to the legacy seeded pick for older matches.
      const round = matchData.current_round ?? 1;
      const assignedCca3 = matchData.game_data.roundCountries?.[round]?.[0];
      const assigned = assignedCca3 ? pickByCca3(assignedCca3) : null;
      if (assigned) return assigned;
      const seed = (matchData.game_data.seed as number) + (matchData.current_round ?? 0) * 997;
      return pickSeeded(seed);
    }
    return pickRandom();
  });

  const [guesses, setGuesses] = useState<GuessEntry[]>([]);
  const [won, setWon] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);

  useEffect(() => {
    if (!matchData) track('game_started', { mode: 'guess' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!matchData || !user) return;
    const channel = supabase
      .channel(`guess_match_${matchData.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchData.id}` },
        (payload: any) => {
          const u = payload.new;
          setOpponentScore(isPlayer1 ? (u.p2_current_score ?? 0) : (u.p1_current_score ?? 0));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchData?.id, user?.id]);

  const fuse = useMemo(
    () =>
      new Fuse(
        (gameData as any).countries.map((c: any) => ({
          ...c,
          _aliases: (COUNTRY_ALIASES[c.cca3] ?? []).join(' '),
        })),
        { keys: ['name', 'name_en', '_aliases'], threshold: 0.3 },
      ),
    [],
  );

  const handleSearch = (text: string) => {
    setSearch(text);
    if (text.length > 1) {
      setSuggestions(fuse.search(text).slice(0, 6).map((r: any) => r.item));
    } else {
      setSuggestions([]);
    }
  };

  const handleGuess = (guessedCountry: any) => {
    if (won || submitted) return;
    if (guesses.some((g) => g.country.cca3 === guessedCountry.cca3)) {
      setSearch('');
      setSuggestions([]);
      return;
    }
    const guessedStats = (countriesStats as any[]).find((c) => c.cca3 === guessedCountry.cca3) ?? {};
    const comparison = buildComparison(guessedCountry, target.country, guessedStats, target.stats, language);
    const isCorrect = guessedCountry.cca3 === target.country.cca3;
    const newGuessCount = guesses.length + 1;
    setGuesses((prev) => [{ country: guessedCountry, comparison, isCorrect }, ...prev]);
    if (isCorrect) {
      const score = calcScore(newGuessCount);
      setMyScore(score);
      setWon(true);
      setSubmitted(true);
      announce(
        tr(
          language,
          `Bravo ! C'était ${countryName(target.country)}, en ${newGuessCount} ${newGuessCount === 1 ? 'essai' : 'essais'}, ${score} points`,
          `Well done! It was ${countryName(target.country)}, in ${newGuessCount} ${newGuessCount === 1 ? 'try' : 'tries'}, ${score} points`,
        ),
      );
      if (isDaily) {
        // Wordle-style: one square per attempt — wrong tries then the find.
        const grid = '🟥'.repeat(newGuessCount - 1) + '🟩';
        onDailyComplete?.(score, grid);
      } else {
        if (!matchData) track('game_completed', { mode: 'guess', score });
        if (onRoundComplete) {
          onRoundComplete(normalizeRoundScore('guess', score));
        } else if (!matchData && user) {
          supabase
            .from('scores')
            .insert({ user_id: user.id, game_mode: 'guess', score })
            .then(({ error }) => {
              if (error) log.error('Error saving guess score:', error);
            });
        }
      }
    } else {
      announce(
        tr(
          language,
          `Faux. ${countryName(guessedCountry)}. Essai numéro ${newGuessCount}`,
          `Wrong. ${countryName(guessedCountry)}. Guess number ${newGuessCount}`,
        ),
      );
    }
    setSearch('');
    setSuggestions([]);
  };

  const handleGiveUp = () => {
    if (submitted) return;
    setSubmitted(true);
    setMyScore(0);
    announce(
      tr(
        language,
        `Abandonné. C'était ${countryName(target.country)}`,
        `Given up. It was ${countryName(target.country)}`,
      ),
    );
    if (onRoundComplete) onRoundComplete(normalizeRoundScore('guess', 0));
  };

  const reset = () => {
    setTarget(pickRandom());
    setGuesses([]);
    setWon(false);
    setSubmitted(false);
    setMyScore(0);
    setSearch('');
    setSuggestions([]);
  };

  // ─── Theme ─────────────────────────────────────────────────────────────────

  const dark = isDarkMode;
  const bg       = dark ? '#0a1628' : '#f2e8d0';
  const cardBg   = dark ? '#132040' : '#e8d9b8';
  const border   = dark ? '#2d4a70' : '#c4a87a';
  const textPri  = dark ? '#d8e8f4' : '#2c1810';
  const textSec  = dark ? '#7aa0c4' : '#7a5c38';
  const inputBg  = dark ? '#132040' : '#e8d9b8';
  const accentColor = dark ? '#4a9eff' : '#c04a1a';

  const countryName = (c: any) => (language === 'fr' ? c.name : c.name_en) ?? c.name;

  // 3 colonnes exactes. On retranche : scroll padding (14×2) + bordures carte (1.5×2)
  // + tileGrid padding (8×2) + 2 gaps (8×2) + une marge de sécurité de 2px pour
  // éviter que la 3e tuile ne passe à la ligne (sinon colonnes déséquilibrées).
  const SCROLL_PAD = 14;
  const TILE_GRID_PAD = 8;
  const TILE_GAP = 8;
  const CARD_BORDER = 1.5;
  const available = width - SCROLL_PAD * 2 - CARD_BORDER * 2 - TILE_GRID_PAD * 2 - TILE_GAP * 2 - 2;
  const tileW = Math.floor(available / 3);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bg }]} edges={['left', 'right', 'bottom']}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <TopInsetBar color={cardBg} />

      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: cardBg, borderBottomColor: border }]}>
        <TouchableOpacity
          onPress={onBackToMenu}
          style={[styles.iconBtn, { backgroundColor: dark ? '#1a2d50' : '#f8f2e3', borderWidth: 1, borderColor: border }]}
          hitSlop={ICON_HIT_SLOP}
          {...a11yButton(tr(language, 'Menu', 'Menu'))}
        >
          <Home color={textPri} size={22} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPri }]}>
          {language === 'fr' ? 'Devine le Pays' : 'Guess the Country'}
        </Text>
        {isOnline ? (
          <View style={styles.onlineScoreRow}>
            <Wifi size={12} color="#2a6e3f" />
            <Text style={[styles.onlineMyScore, { color: accentColor }]}>{myScore}</Text>
            <Text style={[styles.onlineVs, { color: textSec }]}>vs</Text>
            <Text style={[styles.onlineOppScore, { color: textSec }]}>{opponentScore}</Text>
          </View>
        ) : (
          <View style={[styles.countBadge, { backgroundColor: `${accentColor}18`, borderColor: border }]}>
            <Text style={[styles.countText, { color: accentColor }]}>
              {guesses.length}{' '}
              {language === 'fr'
                ? 'essai' + (guesses.length !== 1 ? 's' : '')
                : guesses.length !== 1 ? 'tries' : 'try'}
            </Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { padding: SCROLL_PAD }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Search ── */}
          {!won && !submitted && (
            <View style={styles.searchWrapper}>
              <View style={[styles.searchBox, { backgroundColor: inputBg, borderColor: border }]}>
                <Search color={textSec} size={20} style={{ marginLeft: 14 }} />
                <TextInput
                  style={[styles.searchInput, { color: textPri }]}
                  placeholder={language === 'fr' ? 'Tapez un pays…' : 'Type a country…'}
                  placeholderTextColor={textSec}
                  value={search}
                  onChangeText={handleSearch}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {search.length > 0 && (
                  <TouchableOpacity
                    onPress={() => handleSearch('')}
                    style={{ padding: 14 }}
                    hitSlop={ICON_HIT_SLOP}
                    {...a11yButton(tr(language, 'Effacer la recherche', 'Clear search'))}
                  >
                    <XCircle color={textSec} size={20} />
                  </TouchableOpacity>
                )}
              </View>

              {suggestions.length > 0 && (
                <View style={[styles.suggestions, { backgroundColor: inputBg, borderColor: border }]}>
                  {suggestions.map((c, i) => (
                    <TouchableOpacity
                      key={c.cca3}
                      style={[
                        styles.suggItem,
                        i < suggestions.length - 1 && { borderBottomWidth: 1, borderBottomColor: border },
                      ]}
                      onPress={() => handleGuess(c)}
                      {...a11yButton(countryName(c), {
                        hint: tr(language, 'Proposer ce pays', 'Guess this country'),
                      })}
                    >
                      <Image source={{ uri: getFlagUrl(c.cca3) }} style={styles.suggFlag} />
                      <Text style={[styles.suggName, { color: textPri }]}>{countryName(c)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* No-match feedback so the field doesn't just sit there silently. */}
              {search.trim().length > 0 && suggestions.length === 0 && (
                <View style={[styles.suggestions, { backgroundColor: inputBg, borderColor: border }]}>
                  <Text style={[styles.suggName, { color: textSec, padding: 14 }]}>
                    {tr(language, 'Aucun pays trouvé', 'No country found')}
                  </Text>
                </View>
              )}

              {isOnline && guesses.length > 0 && (
                <TouchableOpacity
                  style={[styles.giveUpBtn, { borderColor: border }]}
                  onPress={handleGiveUp}
                  {...a11yButton(tr(language, 'Abandonner, 0 point', 'Give up, 0 points'))}
                >
                  <Flag size={14} color="#8b1a1a" />
                  <Text style={styles.giveUpText}>
                    {language === 'fr' ? 'Abandonner (0 pt)' : 'Give up (0 pt)'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Waiting / give-up card ── */}
          {submitted && !won && (
            <View style={[styles.winCard, { backgroundColor: cardBg, borderColor: '#8b1a1a' }]}>
              <View style={styles.winEmoji} {...a11yImage(tr(language, 'Déçu', 'Disappointed'))}>
                <AtlasLose color={PALETTE.dangerRed} size={44} />
              </View>
              <Text style={[styles.winTitle, { color: textPri }]}>
                {language === 'fr' ? 'Abandonné' : 'Given up'}
              </Text>
              <Image source={{ uri: getFlagUrl(target.country.cca3) }} style={styles.winFlag} />
              <Text style={[styles.winCountry, { color: textPri }]}>{countryName(target.country)}</Text>
              <Text style={[styles.winSub, { color: textSec }]}>
                {language === 'fr' ? "En attente de l'adversaire…" : 'Waiting for opponent…'}
              </Text>
            </View>
          )}

          {/* ── Win card ── */}
          {won && (
            <View style={[styles.winCard, { backgroundColor: cardBg, borderColor: PALETTE.success }]}>
              <View style={styles.winEmoji} {...a11yImage(tr(language, 'Gagné', 'Won'))}>
                <AtlasWin color={PALETTE.success} size={44} />
              </View>
              <Text style={[styles.winTitle, { color: textPri }]}>
                {language === 'fr' ? 'Bravo !' : 'Well done!'}
              </Text>
              <Image source={{ uri: getFlagUrl(target.country.cca3) }} style={styles.winFlag} />
              <Text style={[styles.winCountry, { color: textPri }]}>{countryName(target.country)}</Text>
              <Text style={[styles.winSub, { color: textSec }]}>
                {guesses.length}{' '}
                {language === 'fr'
                  ? guesses.length === 1 ? 'essai' : 'essais'
                  : guesses.length === 1 ? 'try' : 'tries'}
                {isOnline && (
                  <Text style={{ color: accentColor, fontWeight: '700' }}>
                    {' '}· {myScore} pts
                  </Text>
                )}
              </Text>
              {isOnline ? (
                <Text style={[styles.winSub, { color: textSec }]}>
                  {language === 'fr' ? "En attente de l'adversaire…" : 'Waiting for opponent…'}
                </Text>
              ) : isDaily ? (
                <TouchableOpacity
                  style={styles.replayBtn}
                  onPress={onShare}
                  {...a11yButton(tr(language, 'Partager', 'Share'))}
                >
                  <Share2 color="#fff" size={18} />
                  <Text style={styles.replayText}>{language === 'fr' ? 'Partager' : 'Share'}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.replayBtn}
                  onPress={reset}
                  {...a11yButton(tr(language, 'Rejouer', 'Play again'))}
                >
                  <RefreshCcw color="#fff" size={18} />
                  <Text style={styles.replayText}>{language === 'fr' ? 'Rejouer' : 'Play Again'}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Intro hint + category preview ── */}
          {guesses.length === 0 && !won && !submitted && (
            <>
              <Text style={[styles.hint, { color: textSec }]}>
                {language === 'fr'
                  ? isOnline
                    ? 'Même pays pour les deux joueurs — moins d\'essais = plus de points (max 1000).'
                    : 'Tentatives illimitées — chaque réponse compare vos stats avec celles du pays mystère.'
                  : isOnline
                    ? 'Same country for both players — fewer guesses = more points (max 1000).'
                    : 'Unlimited tries — each guess compares its stats to the mystery country.'}
              </Text>

              <Text style={[styles.previewTitle, { color: textSec }]}>
                {language === 'fr' ? 'Ce que vous allez comparer' : "What you'll compare"}
              </Text>
              <View style={[styles.previewCard, { backgroundColor: cardBg, borderColor: border }]}>
                <View style={styles.tileGrid}>
                  {CATEGORIES.map((cat) => {
                    const Icon = CAT_ICONS[cat.id];
                    return (
                      <View
                        key={cat.id}
                        style={[styles.tile, styles.tilePreview, { width: tileW }]}
                      >
                        <View style={styles.tileEmoji} {...a11yHidden}>
                          <Icon color="#fff" size={24} />
                        </View>
                        <Text
                          style={styles.tileLabel}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.7}
                        >
                          {language === 'fr' ? cat.fr : cat.en}
                        </Text>
                        <Text style={styles.tileValue}>?</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {/* ── Guess cards ── */}
          {guesses.map((g, i) => {
            const guessNum = guesses.length - i;
            return (
              <View
                key={i}
                style={[
                  styles.guessCard,
                  {
                    backgroundColor: cardBg,
                    borderColor: g.isCorrect ? PALETTE.success : border,
                    marginBottom: 12,
                  },
                ]}
              >
                {/* Country header */}
                <View style={[styles.guessCardHeader, { borderBottomColor: border }]}>
                  <View style={[styles.guessBadge, { backgroundColor: `${accentColor}25` }]}>
                    <Text style={[styles.guessBadgeText, { color: accentColor }]}>#{guessNum}</Text>
                  </View>
                  <Image source={{ uri: getFlagUrl(g.country.cca3) }} style={styles.guessFlag} />
                  <Text style={[styles.guessName, { color: textPri }]} numberOfLines={1}>
                    {countryName(g.country)}
                  </Text>
                  {g.isCorrect && (
                    <View style={styles.correctBadge} {...a11yImage(tr(language, 'Correct', 'Correct'))}>
                      <AtlasCheck color="#fff" size={16} />
                    </View>
                  )}
                </View>

                {/* 3×3 category grid */}
                <View style={styles.tileGrid}>
                  {CATEGORIES.map((cat) => {
                    const cell = g.comparison[cat.id];
                    const Icon = CAT_ICONS[cat.id];
                    return (
                      <View
                        key={cat.id}
                        style={[
                          styles.tile,
                          {
                            width: tileW,
                            backgroundColor: cell?.color ?? '#64748B',
                          },
                        ]}
                      >
                        <View style={styles.tileEmoji} {...a11yHidden}>
                          <Icon color="#fff" size={24} />
                        </View>
                        <Text
                          style={styles.tileLabel}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.7}
                        >
                          {language === 'fr' ? cat.fr : cat.en}
                        </Text>
                        {cell?.value === '🎯' ? (
                          <AtlasTarget color="#fff" size={16} />
                        ) : (
                          <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
                            {cell?.value ?? '?'}
                          </Text>
                        )}
                        {cell?.hint && <TileHint hint={cell.hint} />}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iconBtn: { padding: 10, borderRadius: 12 },
  headerTitle: { fontSize: 18, fontFamily: FONTS.headingBlack },
  countBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  countText: { fontFamily: FONTS.monoBold, fontSize: 12, letterSpacing: 0.5 },

  onlineScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineMyScore: { fontFamily: FONTS.monoBold, fontSize: 16 },
  onlineVs: { fontFamily: FONTS.mono, fontSize: 11 },
  onlineOppScore: { fontFamily: FONTS.mono, fontSize: 16 },

  scroll: { flexGrow: 1 },

  searchWrapper: { marginBottom: 16, zIndex: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
  },
  searchInput: { flex: 1, padding: 16, fontSize: 17 },
  suggestions: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  suggItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  suggFlag: { width: 36, height: 24, borderRadius: 3 },
  suggName: { fontFamily: FONTS.heading, fontSize: 15 },

  giveUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  giveUpText: { color: '#8b1a1a', fontFamily: FONTS.mono, fontSize: 13 },

  winCard: {
    alignItems: 'center',
    padding: 28,
    borderRadius: 20,
    borderWidth: 2,
    marginBottom: 20,
    gap: 10,
  },
  winEmoji: { alignItems: 'center', justifyContent: 'center' },
  winTitle: { fontSize: 26, fontFamily: FONTS.headingBlack },
  winFlag: { width: 130, height: 87, borderRadius: 8, marginVertical: 6 },
  winCountry: { fontSize: 20, fontFamily: FONTS.heading },
  winSub: { fontFamily: FONTS.mono, fontSize: 13 },
  replayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#c04a1a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#a03a10',
    marginTop: 8,
  },
  replayText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 14, letterSpacing: 1 },

  hint: { textAlign: 'center', fontFamily: FONTS.mono, fontSize: 12, marginBottom: 16, lineHeight: 20 },

  // ── Intro category preview ──
  previewTitle: {
    textAlign: 'center',
    fontFamily: FONTS.monoBold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    opacity: 0.8,
  },
  previewCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  tilePreview: {
    backgroundColor: '#94A3B8',
    minHeight: 78,
  },

  // ── Guess card ──
  guessCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  guessCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
  },
  guessBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  guessBadgeText: { fontFamily: FONTS.monoBold, fontSize: 12 },
  guessFlag: { width: 40, height: 27, borderRadius: 4 },
  guessName: { flex: 1, fontFamily: FONTS.heading, fontSize: 15 },
  correctBadge: {
    backgroundColor: PALETTE.success,
    borderRadius: 20,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── 3×3 tile grid ──
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 8,
  },
  tile: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 92,
  },
  tileEmoji: { height: 26, alignItems: 'center', justifyContent: 'center' },
  tileLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: FONTS.mono,
    fontSize: 9,
    textAlign: 'center',
    marginBottom: 1,
  },
  tileValue: {
    color: '#ffffff',
    fontFamily: FONTS.monoBold,
    fontSize: 13,
    textAlign: 'center',
  },
  tileHint: {
    color: 'rgba(255,255,255,0.95)',
    fontFamily: FONTS.monoBold,
    fontSize: 11,
    textAlign: 'center',
  },
});

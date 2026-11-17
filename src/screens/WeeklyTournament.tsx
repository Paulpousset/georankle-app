/**
 * « Tournoi de la semaine » : le mode de la semaine, le temps restant, les
 * lots et le classement (meilleur score de la semaine dans ce mode). À
 * l'ouverture, verse le lot de la semaine passée s'il est dû.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Play, Trophy } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import type { GameMode } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { commonStyles as styles } from '../theme/commonStyles';
import { tr } from '../i18n';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import { useCachedData } from '../lib/cache';
import { MENU_MODES } from '../data/menuModes';
import { MODE_ICONS } from '../components/menu/ModeTiles';
import { LanguageButton } from '../components/LanguageButton';
import { AtlasCoin } from '../components/AtlasIcons';
import {
  TOURNAMENT_PRIZES,
  claimTournamentPrize,
  fetchTournamentLeaderboard,
  msUntilTournamentEnd,
  tournamentMode,
  weekStart,
  type TournamentPrize,
} from '../lib/tournament';
import { track } from '../lib/analytics';

export const TOURNAMENT_BLUE = '#1a4a7a';
const TOURNAMENT_BLUE_NIGHT = '#6fb1ff';

function countdown(ms: number, language: 'fr' | 'en' | string): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return language === 'fr' ? `${d} j ${h} h` : `${d}d ${h}h`;
  return language === 'fr' ? `${h} h ${m} min` : `${h}h ${m}m`;
}

interface Props {
  user: User | null;
  onBack: () => void;
  onPlay: (mode: GameMode) => void;
  onOpenAuth: () => void;
}

export default function WeeklyTournament({ user, onBack, onPlay, onOpenAuth }: Props) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const ink = isDarkMode ? TOURNAMENT_BLUE_NIGHT : TOURNAMENT_BLUE;
  const week = weekStart();
  const mode = tournamentMode(week);
  const def = MENU_MODES.find((m) => m.mode === mode);
  const Icon = MODE_ICONS[mode] ?? Trophy;

  const [left, setLeft] = useState(msUntilTournamentEnd);
  useEffect(() => {
    const id = setInterval(() => setLeft(msUntilTournamentEnd()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [prize, setPrize] = useState<TournamentPrize | null>(null);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    claimTournamentPrize().then((p) => {
      if (!alive || !p) return;
      setPrize(p);
      if (p.coins > 0) track('tournament_prize', { rank: p.rank ?? 0, coins: p.coins });
    });
    return () => {
      alive = false;
    };
  }, [user]);

  const fetcher = useCallback(() => fetchTournamentLeaderboard(week), [week]);
  const { data, loading, error } = useCachedData(`tournament:${week}`, fetcher, { ttl: 0 });
  const rows = data ?? [];
  const myIndex = user ? rows.findIndex((r) => r.user_id === user.id) : -1;

  return (
    <SafeAreaView style={[styles.container, !isDarkMode && styles.containerLight, { flex: 1 }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          gap: 10,
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
          hitSlop={ICON_HIT_SLOP}
          {...a11yButton(tr(language, 'Retour', 'Back'))}
        >
          <ArrowLeft color={c.text} size={22} />
        </TouchableOpacity>
        <Text
          style={{ fontFamily: FONTS.headingBlack, fontSize: 22, color: c.text, flex: 1 }}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {tr(language, 'Tournoi de la semaine', 'Weekly tournament')}
        </Text>
        <LanguageButton />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: 560, gap: 14 }}>
          {prize && prize.coins > 0 && (
            <View
              style={{
                borderRadius: 16,
                padding: 14,
                backgroundColor: PALETTE.sand,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Trophy color="#fff" size={24} />
              <Text style={{ flex: 1, fontFamily: FONTS.monoBold, fontSize: 13, color: '#fff' }}>
                {tr(
                  language,
                  'Semaine dernière : {0}e place ! +{1} pièces versées.',
                  'Last week: #{0}! +{1} coins added.',
                  [prize.rank ?? '?', prize.coins],
                )}
              </Text>
            </View>
          )}

          {/* Le mode de la semaine */}
          <View
            style={{ borderRadius: 20, backgroundColor: TOURNAMENT_BLUE, padding: 18, gap: 10 }}
          >
            <Text
              style={{
                fontFamily: FONTS.monoBold,
                color: 'rgba(255,255,255,0.8)',
                fontSize: 10.5,
                letterSpacing: 1.2,
              }}
            >
              {tr(language, 'CETTE SEMAINE · FIN DANS {0}', 'THIS WEEK · ENDS IN {0}', [
                countdown(left, language).toUpperCase(),
              ])}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  backgroundColor: 'rgba(255,255,255,0.16)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon color="#fff" size={28} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.headingBlack, color: '#fff', fontSize: 26 }}>
                  {def ? tr(language, def.titleFr, def.titleEn) : mode}
                </Text>
                <Text
                  style={{
                    fontFamily: FONTS.mono,
                    color: 'rgba(255,255,255,0.85)',
                    fontSize: 11.5,
                  }}
                >
                  {tr(
                    language,
                    'Ton meilleur score de la semaine compte. Rejoue autant que tu veux.',
                    'Your best score this week counts. Replay as much as you like.',
                  )}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => onPlay(mode)}
              style={{
                marginTop: 4,
                height: 46,
                borderRadius: 23,
                backgroundColor: '#fff',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
              {...a11yButton(tr(language, 'Jouer', 'Play'))}
            >
              <Play color={TOURNAMENT_BLUE} fill={TOURNAMENT_BLUE} size={14} />
              <Text style={{ fontFamily: FONTS.monoBold, fontSize: 14, color: TOURNAMENT_BLUE }}>
                {tr(language, 'Jouer', 'Play')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Lots */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { label: tr(language, '1er', '1st'), coins: TOURNAMENT_PRIZES[0], color: '#d4a017' },
              { label: tr(language, '2e', '2nd'), coins: TOURNAMENT_PRIZES[1], color: '#9aa4ad' },
              { label: tr(language, '3e', '3rd'), coins: TOURNAMENT_PRIZES[2], color: '#b87333' },
              {
                label: tr(language, '4e–10e', '4th–10th'),
                coins: TOURNAMENT_PRIZES[3],
                color: c.textMuted,
              },
            ].map((p) => (
              <View
                key={p.label}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.card,
                  paddingVertical: 10,
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <Text style={{ fontFamily: FONTS.monoBold, fontSize: 11, color: p.color }}>
                  {p.label}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AtlasCoin color={PALETTE.sand} size={14} />
                  <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 16, color: c.text }}>
                    {p.coins}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Classement */}
          <Text
            style={{ fontFamily: FONTS.headingBlack, fontSize: 19, color: c.text, marginTop: 4 }}
          >
            {tr(language, 'Classement', 'Leaderboard')}
            {myIndex >= 0 ? tr(language, ' · tu es {0}e', ' · you’re #{0}', [myIndex + 1]) : ''}
          </Text>
          {!user && (
            <TouchableOpacity
              onPress={onOpenAuth}
              style={{
                padding: 14,
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: ink,
                borderStyle: 'dashed',
              }}
              {...a11yButton(tr(language, 'Se connecter pour participer', 'Sign in to compete'))}
            >
              <Text
                style={{
                  fontFamily: FONTS.monoBold,
                  fontSize: 12.5,
                  color: ink,
                  textAlign: 'center',
                }}
              >
                {tr(
                  language,
                  'Connecte-toi pour participer et gagner des lots',
                  'Sign in to compete and win prizes',
                )}
              </Text>
            </TouchableOpacity>
          )}
          {loading && rows.length === 0 && (
            <Text
              style={{
                fontFamily: FONTS.mono,
                fontSize: 12,
                color: c.textMuted,
                textAlign: 'center',
                padding: 20,
              }}
            >
              {tr(language, 'Chargement…', 'Loading…')}
            </Text>
          )}
          {!loading && rows.length === 0 && (
            <Text
              style={{
                fontFamily: FONTS.mono,
                fontSize: 12,
                color: c.textMuted,
                textAlign: 'center',
                padding: 20,
              }}
            >
              {error
                ? tr(
                    language,
                    'Classement indisponible pour le moment.',
                    'Leaderboard unavailable right now.',
                  )
                : tr(
                    language,
                    'Personne n’a encore joué cette semaine. Prends la tête !',
                    'Nobody has played yet this week. Take the lead!',
                  )}
            </Text>
          )}
          {rows.map((r, i) => {
            const me = user?.id === r.user_id;
            const medal = ['#d4a017', '#9aa4ad', '#b87333'][i];
            return (
              <View
                key={r.user_id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: c.card,
                  borderWidth: me ? 2 : 1,
                  borderColor: me ? ink : c.border,
                }}
              >
                <Text
                  style={{
                    width: 30,
                    textAlign: 'center',
                    fontFamily: FONTS.headingBlack,
                    fontSize: 17,
                    color: medal ?? c.textMuted,
                  }}
                >
                  {i + 1}
                </Text>
                <Text
                  style={{ flex: 1, fontFamily: FONTS.monoBold, fontSize: 13.5, color: c.text }}
                  numberOfLines={1}
                >
                  {r.username ?? tr(language, 'Anonyme', 'Anonymous')}
                  {me ? tr(language, ' (toi)', ' (you)') : ''}
                </Text>
                <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 17, color: ink }}>
                  {r.best}
                </Text>
                <Text
                  style={{
                    width: 78,
                    textAlign: 'right',
                    fontFamily: FONTS.mono,
                    fontSize: 10.5,
                    color: c.textMuted,
                  }}
                >
                  {tr(language, '{0} parties', '{0} games', [r.games])}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

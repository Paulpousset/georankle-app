import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft,
  BarChart3,
  Check,
  Flag,
  Globe,
  Info,
  LayoutGrid,
  Map,
  Play,
  Share2,
  Zap,
} from 'lucide-react-native';
import { AtlasFlame } from '../components/AtlasIcons';
import type { ComponentType } from 'react';
import type { User } from '@supabase/supabase-js';

import type { GameMode } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  DAILY_MODES,
  dailyModeLabel,
  getLocalState,
  getPuzzleNumber,
  msUntilNextPuzzle,
  type DailyResult,
  type DailyState,
} from '../lib/daily';
import { buildShareMessage } from '../lib/share';
import { track } from '../lib/analytics';
import { commonStyles as styles } from '../theme/commonStyles';
import { PALETTE, getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, a11yImage, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { DailyResultCard } from '../components/DailyResultCard';
import { DailyLeaderboardModal } from '../components/DailyLeaderboardModal';

const FLAME = '#e8772e';

/** Per-mode card icon + accent, mirroring the MainMenu solo list. */
const MODE_META: Record<string, { icon: ComponentType<{ color: string; size: number }>; accent: string }> = {
  classic: { icon: LayoutGrid, accent: PALETTE.forestGreen },
  streak: { icon: Zap, accent: PALETTE.sand },
  guess: { icon: Info, accent: PALETTE.vermilion },
  globe: { icon: Globe, accent: PALETTE.oceanBlue },
  regions: { icon: Map, accent: PALETTE.oceanBlue },
  'quiz-capital': { icon: Flag, accent: PALETTE.sand },
  'quiz-flag': { icon: Flag, accent: PALETTE.vermilion },
};

interface DailyHubProps {
  user: User | null;
  onPlayDaily: (mode: GameMode) => void;
  onBack: () => void;
  onOpenPlayer?: (userId: string, username?: string | null) => void;
}

function formatCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function shortScore(result: DailyResult): string {
  if (result.mode === 'classic') return `${result.score}%`;
  return `${result.score}`;
}

/**
 * Daily Challenge hub: every solo mode has one seeded puzzle per UTC day. Shows
 * today's status per mode (play / done + score), the global streak, X/8 done,
 * and a countdown to the next puzzle.
 */
export default function DailyHub({ user, onPlayDaily, onBack, onOpenPlayer }: DailyHubProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [state, setState] = useState<DailyState | null>(null);
  const [countdown, setCountdown] = useState(() => msUntilNextPuzzle());
  const [viewing, setViewing] = useState<DailyResult | null>(null);
  const [leaderboardMode, setLeaderboardMode] = useState<GameMode | null>(null);

  const reload = useCallback(() => {
    getLocalState().then(setState);
  }, []);

  useEffect(() => {
    track('daily_opened');
    reload();
    const id = setInterval(() => setCountdown(msUntilNextPuzzle()), 60000);
    return () => clearInterval(id);
  }, [reload]);

  const puzzle = getPuzzleNumber();
  const streak = state?.streak ?? 0;
  const todayCount = state?.todayCount ?? 0;

  const shareResult = (result: DailyResult) => {
    Share.share({ message: buildShareMessage(result, streak, language) }).catch(() => {});
  };

  return (
    <SafeAreaView style={[styles.container, !isDarkMode && styles.containerLight, { flex: 1 }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 20,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
          hitSlop={ICON_HIT_SLOP}
          {...a11yButton(tr(language, 'Retour', 'Back'))}
        >
          <ArrowLeft color={c.text} size={18} />
        </TouchableOpacity>
        <Text style={{ fontFamily: FONTS.heading, color: c.text, fontSize: 20, flex: 1 }}>
          {tr(language, 'Défi du Jour', 'Daily Challenge')}
        </Text>
        <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 11 }}>#{puzzle}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50 }} showsVerticalScrollIndicator={false}>
        {/* Streak + progress banner */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-around',
            alignItems: 'center',
            backgroundColor: c.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: c.border,
            paddingVertical: 16,
            marginBottom: 8,
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
              {...a11yImage(tr(language, `Série de ${streak} jours`, `${streak}-day streak`))}
            >
              <AtlasFlame color={FLAME} size={24} />
              <ScoreText style={{ fontFamily: FONTS.headingBlack, color: FLAME, fontSize: 28 }}>
                {streak}
              </ScoreText>
            </View>
            <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 9 }}>
              {tr(language, 'SÉRIE', 'STREAK')}
            </Text>
          </View>
          <View style={{ width: 1, height: '70%', backgroundColor: c.border }} />
          <View style={{ alignItems: 'center' }}>
            <ScoreText style={{ fontFamily: FONTS.headingBlack, color: c.accent, fontSize: 28 }}>
              {todayCount}/8
            </ScoreText>
            <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 9 }}>
              {tr(language, "AUJOURD'HUI", 'TODAY')}
            </Text>
          </View>
          <View style={{ width: 1, height: '70%', backgroundColor: c.border }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: FONTS.heading, color: c.text, fontSize: 18 }}>
              {formatCountdown(countdown)}
            </Text>
            <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 9 }}>
              {tr(language, 'PROCHAIN', 'NEXT')}
            </Text>
          </View>
        </View>

        <Text
          style={{
            fontFamily: FONTS.mono,
            color: c.textMuted,
            fontSize: 11,
            textAlign: 'center',
            marginVertical: 16,
          }}
        >
          {tr(language, 'Un puzzle par mode, chaque jour.', 'One puzzle per mode, every day.')}
        </Text>

        <View style={{ gap: 12 }}>
          {DAILY_MODES.map((mode) => {
            const meta = MODE_META[mode];
            const Icon = meta.icon;
            const result = state?.results[mode];
            const done = !!result;
            return (
              <TouchableOpacity
                key={mode}
                onPress={() => (done ? setViewing(result) : onPlayDaily(mode))}
                {...a11yButton(dailyModeLabel(mode, language), {
                  hint: done
                    ? tr(language, 'Voir votre résultat', 'View your result')
                    : tr(language, 'Démarrer ce mode', 'Start this mode'),
                })}
                style={[
                  styles.countryCard,
                  !isDarkMode && styles.countryCardLight,
                  {
                    padding: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    borderLeftWidth: 4,
                    borderLeftColor: meta.accent,
                    opacity: done ? 0.92 : 1,
                  },
                ]}
              >
                <View
                  style={{
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    padding: 11,
                    borderRadius: 12,
                  }}
                >
                  <Icon color={meta.accent} size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.countryName,
                      !isDarkMode && styles.countryNameLight,
                      { fontSize: 16, textAlign: 'left' },
                    ]}
                  >
                    {dailyModeLabel(mode, language)}
                  </Text>
                  {done ? (
                    <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 11 }}>
                      {tr(language, 'Fait', 'Done')} · {shortScore(result)}
                    </Text>
                  ) : (
                    <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 11 }}>
                      {tr(language, 'À jouer', 'To play')}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <TouchableOpacity
                    onPress={() => setLeaderboardMode(mode)}
                    style={{ padding: 8 }}
                    hitSlop={ICON_HIT_SLOP}
                    {...a11yButton(tr(language, 'Classement', 'Leaderboard'))}
                  >
                    <BarChart3 color={c.textMuted} size={18} />
                  </TouchableOpacity>
                  {done ? (
                    <>
                      <TouchableOpacity
                        onPress={() => shareResult(result)}
                        style={{ padding: 8 }}
                        hitSlop={ICON_HIT_SLOP}
                        {...a11yButton(tr(language, 'Partager', 'Share'))}
                      >
                        <Share2 color={c.textMuted} size={18} />
                      </TouchableOpacity>
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          backgroundColor: PALETTE.forestGreen,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check color="#fff" size={16} />
                      </View>
                    </>
                  ) : (
                    <Play color={meta.accent} size={20} style={{ marginLeft: 4 }} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <DailyResultCard
        result={viewing}
        streak={streak}
        todayCount={todayCount}
        onShare={() => viewing && shareResult(viewing)}
        onClose={() => setViewing(null)}
      />
      <DailyLeaderboardModal
        mode={leaderboardMode}
        accent={leaderboardMode ? MODE_META[leaderboardMode].accent : c.accent}
        currentUserId={user?.id ?? null}
        onClose={() => setLeaderboardMode(null)}
        onOpenPlayer={onOpenPlayer}
      />
      {!user ? (
        <Text
          style={{
            fontFamily: FONTS.mono,
            color: c.textFaint,
            fontSize: 9,
            textAlign: 'center',
            paddingBottom: 8,
          }}
        >
          {tr(
            language,
            'Connecte-toi pour sauvegarder ta série',
            'Sign in to save your streak',
          )}
        </Text>
      ) : null}
    </SafeAreaView>
  );
}

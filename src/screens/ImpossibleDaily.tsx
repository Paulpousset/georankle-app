/**
 * « L'Impossible du jour » : six questions très dures (une par mode), une
 * seule chance chacune, 20 secondes, et le classement de la journée.
 *
 * Trois vues dans un même écran : la liste des questions (avec le taux de
 * réussite mondial de chacune), la question en cours, et le classement.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Flag,
  Landmark,
  LayoutGrid,
  Lock,
  Puzzle,
  Route,
  Skull,
  Timer,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react-native';
import type { ComponentType } from 'react';
import type { User } from '@supabase/supabase-js';

import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { commonStyles as styles } from '../theme/commonStyles';
import { tr } from '../i18n';
import { a11yButton, a11yImage, ICON_HIT_SLOP } from '../lib/a11y';
import { getFlagUrl } from '../lib/flags';
import { silhouettePath } from '../lib/silhouette';
import { getTodayUTC, msUntilNextPuzzle, getPuzzleNumber } from '../lib/daily';
import { useCachedData } from '../lib/cache';
import { LanguageButton } from '../components/LanguageButton';
import { AtlasCoin } from '../components/AtlasIcons';
import {
  IMPOSSIBLE_MODES,
  IMPOSSIBLE_SECONDS,
  answerImpossible,
  buildImpossibleQuestion,
  countryLabel,
  fetchImpossibleLeaderboard,
  fetchImpossibleStats,
  impossibleModeLabel,
  impossibleOptionLabel,
  impossiblePrompt,
  impossibleReveal,
  impossibleSummary,
  openImpossible,
  settleAbandoned,
  themeLabel,
  type ImpossibleMode,
  type ImpossibleQuestion,
  type ImpossibleState,
  type ImpossibleSubmitResult,
} from '../lib/impossible';

/** Couleur de l'Impossible : un cramoisi profond, distinct de la flamme du défi. */
export const IMPOSSIBLE_RED = '#9d1238';
/** Le même cramoisi éclairci, pour le texte et les traits sur fond nuit. */
const IMPOSSIBLE_RED_NIGHT = '#ff6f8e';
function useImpossibleInk(): { ink: string; miss: string } {
  const { isDarkMode } = useTheme();
  return isDarkMode
    ? { ink: IMPOSSIBLE_RED_NIGHT, miss: '#ff8a7a' }
    : { ink: IMPOSSIBLE_RED, miss: PALETTE.dangerRed };
}
const GREEN = PALETTE.success;

export const IMPOSSIBLE_ICONS: Record<
  ImpossibleMode,
  ComponentType<{ color: string; size: number }>
> = {
  'quiz-flag': Flag,
  'quiz-capital': Landmark,
  silhouette: Puzzle,
  higherlower: TrendingUp,
  borders: Route,
  classic: LayoutGrid,
};

interface Props {
  user: User | null;
  onBack: () => void;
  onOpenAuth?: () => void;
}

type View_ =
  | { name: 'list' }
  | { name: 'ready'; mode: ImpossibleMode }
  | { name: 'question'; mode: ImpossibleMode };

function pct(winners: number, players: number): number {
  return players > 0 ? Math.round((winners / players) * 100) : 0;
}

function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export default function ImpossibleDaily({ user, onBack, onOpenAuth }: Props) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const { ink, miss } = useImpossibleInk();
  const today = getTodayUTC();

  const [state, setState] = useState<ImpossibleState | null>(null);
  const [view, setView] = useState<View_>({ name: 'list' });
  const [tab, setTab] = useState<'questions' | 'board'>('questions');

  const reload = useCallback(() => settleAbandoned(!!user, today).then(setState), [user, today]);
  useEffect(() => {
    let alive = true;
    settleAbandoned(!!user, today).then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [user, today]);

  const fetchStats = useCallback(() => fetchImpossibleStats(today), [today]);
  const { data: stats, refetch: refetchStats } = useCachedData(
    `impossible-stats:${today}`,
    fetchStats,
    { ttl: 0 },
  );

  const [left, setLeft] = useState(msUntilNextPuzzle);
  useEffect(() => {
    const id = setInterval(() => setLeft(msUntilNextPuzzle()), 1000);
    return () => clearInterval(id);
  }, []);

  const summary = state ? impossibleSummary(state) : { answered: 0, correct: 0 };

  if (view.name === 'question') {
    return (
      <QuestionView
        mode={view.mode}
        date={today}
        signedIn={!!user}
        dayStats={stats?.[view.mode] ?? null}
        onDone={() => {
          setView({ name: 'list' });
          void reload();
          void refetchStats();
        }}
        onNext={(next) => {
          void reload();
          void refetchStats();
          setView(next ? { name: 'ready', mode: next } : { name: 'list' });
        }}
        nextMode={IMPOSSIBLE_MODES.find((m) => m !== view.mode && !state?.answers[m]) ?? null}
      />
    );
  }

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
          onPress={view.name === 'ready' ? () => setView({ name: 'list' }) : onBack}
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
          {tr(language, 'L’Impossible du jour', 'Today’s Impossible')}
        </Text>
        <LanguageButton />
      </View>

      {view.name === 'ready' ? (
        <ReadyView
          mode={view.mode}
          onStart={async () => {
            await openImpossible(view.mode, today);
            setView({ name: 'question', mode: view.mode });
          }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14, alignItems: 'center' }}
        >
          <View style={{ width: '100%', maxWidth: 560, gap: 14 }}>
            {/* En-tête : la promesse et le score du jour. */}
            <View
              style={{
                borderRadius: 20,
                backgroundColor: IMPOSSIBLE_RED,
                padding: 18,
                overflow: 'hidden',
              }}
            >
              <View style={{ position: 'absolute', right: -18, top: -14, opacity: 0.14 }}>
                <Skull color="#fff" size={130} />
              </View>
              <Text
                style={{
                  fontFamily: FONTS.monoBold,
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: 10.5,
                  letterSpacing: 1.2,
                }}
              >
                {tr(
                  language,
                  'IMPOSSIBLE #{0} · NOUVEAU DANS {1}',
                  'IMPOSSIBLE #{0} · NEW IN {1}',
                  [getPuzzleNumber(), formatClock(left)],
                )}
              </Text>
              <Text
                style={{
                  fontFamily: FONTS.headingBlack,
                  color: '#fff',
                  fontSize: 26,
                  marginTop: 6,
                }}
              >
                {summary.answered === 0
                  ? tr(language, '6 questions. Une seule chance.', '6 questions. One shot each.')
                  : tr(language, '{0} sur 6 réussies', '{0} of 6 cracked', [summary.correct])}
              </Text>
              <Text
                style={{
                  fontFamily: FONTS.mono,
                  color: 'rgba(255,255,255,0.88)',
                  fontSize: 12,
                  marginTop: 6,
                  lineHeight: 17,
                }}
              >
                {tr(
                  language,
                  'Une question très dure par mode, la même pour tout le monde. {0} secondes, pas de seconde chance. +10 pièces par bonne réponse, +50 pour un sans-faute.',
                  'One very hard question per mode, the same for everyone. {0} seconds, no second chance. +10 coins per right answer, +50 for a perfect day.',
                  [IMPOSSIBLE_SECONDS],
                )}
              </Text>
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 14 }}>
                {IMPOSSIBLE_MODES.map((m) => {
                  const a = state?.answers[m];
                  return (
                    <View
                      key={m}
                      style={{
                        flex: 1,
                        height: 7,
                        borderRadius: 4,
                        backgroundColor: !a
                          ? 'rgba(255,255,255,0.25)'
                          : a.correct
                            ? '#7ef0c0'
                            : 'rgba(0,0,0,0.35)',
                      }}
                    />
                  );
                })}
              </View>
            </View>

            {/* Onglets : questions / classement. */}
            <View
              style={{
                flexDirection: 'row',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: c.border,
                padding: 3,
                backgroundColor: c.card,
              }}
            >
              {(['questions', 'board'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                    backgroundColor: tab === t ? IMPOSSIBLE_RED : 'transparent',
                  }}
                  {...a11yButton(
                    t === 'questions'
                      ? tr(language, 'Questions', 'Questions')
                      : tr(language, 'Classement du jour', 'Today’s leaderboard'),
                    { selected: tab === t },
                  )}
                >
                  {t === 'board' && <Trophy color={tab === t ? '#fff' : c.textMuted} size={15} />}
                  <Text
                    style={{
                      fontFamily: FONTS.monoBold,
                      fontSize: 12.5,
                      color: tab === t ? '#fff' : c.textMuted,
                    }}
                  >
                    {t === 'questions'
                      ? tr(language, 'Questions', 'Questions')
                      : tr(language, 'Classement du jour', 'Today’s leaderboard')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {tab === 'questions' ? (
              IMPOSSIBLE_MODES.map((m) => {
                const a = state?.answers[m];
                const Icon = IMPOSSIBLE_ICONS[m];
                const s = stats?.[m];
                const rate =
                  s && s.players > 0
                    ? tr(language, '{0} % ont trouvé · {1} joueurs', '{0}% got it · {1} players', [
                        pct(s.winners, s.players),
                        s.players,
                      ])
                    : tr(language, 'Personne n’a encore tenté', 'Nobody has tried yet');
                return (
                  <TouchableOpacity
                    key={m}
                    disabled={!!a}
                    onPress={() => setView({ name: 'ready', mode: m })}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: 14,
                      borderRadius: 16,
                      borderWidth: a ? 1 : 2,
                      borderColor: a ? c.border : ink,
                      backgroundColor: c.card,
                    }}
                    {...a11yButton(impossibleModeLabel(m, language), { disabled: !!a })}
                  >
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: a
                          ? a.correct
                            ? 'rgba(16,185,129,0.16)'
                            : 'rgba(139,26,26,0.16)'
                          : 'rgba(157,18,56,0.14)',
                      }}
                    >
                      <Icon color={a ? (a.correct ? GREEN : miss) : ink} size={22} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 17, color: c.text }}>
                        {impossibleModeLabel(m, language)}
                      </Text>
                      <Text
                        style={{
                          fontFamily: FONTS.mono,
                          fontSize: 10.5,
                          color: c.textMuted,
                          marginTop: 2,
                        }}
                      >
                        {rate}
                      </Text>
                    </View>
                    {!a ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Text
                          style={{
                            fontFamily: FONTS.monoBold,
                            fontSize: 12,
                            color: ink,
                          }}
                        >
                          {tr(language, 'Tenter', 'Try')}
                        </Text>
                        <ChevronRight color={ink} size={18} />
                      </View>
                    ) : a.correct ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Check color={GREEN} size={20} />
                        <Text style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.textMuted }}>
                          {(a.ms / 1000).toFixed(1)} s
                        </Text>
                      </View>
                    ) : (
                      <X color={miss} size={20} />
                    )}
                  </TouchableOpacity>
                );
              })
            ) : (
              <Leaderboard user={user} date={today} onOpenAuth={onOpenAuth} />
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** L'écran « tu n'as qu'une chance » avant de révéler la question. */
function ReadyView({ mode, onStart }: { mode: ImpossibleMode; onStart: () => void }) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const { ink } = useImpossibleInk();
  const Icon = IMPOSSIBLE_ICONS[mode];
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <View
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: IMPOSSIBLE_RED,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon color="#fff" size={44} />
      </View>
      <Text
        style={{ fontFamily: FONTS.headingBlack, fontSize: 28, color: c.text, textAlign: 'center' }}
      >
        {impossibleModeLabel(mode, language)}
      </Text>
      <View style={{ gap: 8, maxWidth: 340 }}>
        {[
          {
            icon: Lock,
            text: tr(
              language,
              'Une seule tentative. Quitter compte comme raté.',
              'One attempt. Leaving counts as a miss.',
            ),
          },
          {
            icon: Timer,
            text: tr(language, '{0} secondes pour répondre.', '{0} seconds to answer.', [
              IMPOSSIBLE_SECONDS,
            ]),
          },
          {
            icon: Skull,
            text: tr(language, 'La plupart des joueurs se trompent.', 'Most players get it wrong.'),
          },
        ].map(({ icon: I, text }) => (
          <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <I color={ink} size={18} />
            <Text style={{ fontFamily: FONTS.mono, fontSize: 13, color: c.textMuted, flex: 1 }}>
              {text}
            </Text>
          </View>
        ))}
      </View>
      <TouchableOpacity
        onPress={onStart}
        style={{
          marginTop: 10,
          height: 52,
          paddingHorizontal: 30,
          borderRadius: 26,
          backgroundColor: IMPOSSIBLE_RED,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        {...a11yButton(tr(language, 'Révéler la question', 'Reveal the question'))}
      >
        <Text style={{ fontFamily: FONTS.monoBold, fontSize: 15, color: '#fff' }}>
          {tr(language, 'Révéler la question', 'Reveal the question')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/** Le visuel de la question : drapeau, silhouette, ou le pays concerné. */
function QuestionVisual({ q }: { q: ImpossibleQuestion }) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const { ink } = useImpossibleInk();
  if (q.kind === 'flag') {
    return (
      <Image
        source={{ uri: getFlagUrl(q.answer) }}
        style={{ width: 200, height: 133, borderRadius: 8, borderWidth: 1, borderColor: c.border }}
        resizeMode="contain"
        {...a11yImage(tr(language, 'Drapeau mystère', 'Mystery flag'))}
      />
    );
  }
  if (q.kind === 'silhouette') {
    const d = silhouettePath(q.answer, 100);
    return (
      <View
        style={{ width: 170, height: 170 }}
        {...a11yImage(tr(language, 'Silhouette mystère', 'Mystery silhouette'))}
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          {d && <Path d={d} fill={isDarkMode ? PALETTE.nightText : PALETTE.sepia} />}
        </Svg>
      </View>
    );
  }
  if (q.kind === 'higher') {
    return (
      <Text
        style={{
          fontFamily: FONTS.headingBlack,
          fontSize: 30,
          color: ink,
          textAlign: 'center',
        }}
      >
        {themeLabel(q.themeId!, language)}
      </Text>
    );
  }
  // Capitale, frontière, rang : le pays sujet avec son drapeau.
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Image
        source={{ uri: getFlagUrl(q.subject!) }}
        style={{ width: 96, height: 64, borderRadius: 6, borderWidth: 1, borderColor: c.border }}
        resizeMode="contain"
      />
      <Text
        style={{ fontFamily: FONTS.headingBlack, fontSize: 28, color: c.text, textAlign: 'center' }}
      >
        {countryLabel(q.subject!, language)}
      </Text>
    </View>
  );
}

function QuestionView({
  mode,
  date,
  signedIn,
  onDone,
  onNext,
  nextMode,
  dayStats,
}: {
  mode: ImpossibleMode;
  date: string;
  signedIn: boolean;
  onDone: () => void;
  onNext: (next: ImpossibleMode | null) => void;
  nextMode: ImpossibleMode | null;
  /** Taux du jour déjà chargé (montré aux joueurs non connectés). */
  dayStats: { players: number; winners: number } | null;
}) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const { ink, miss } = useImpossibleInk();
  const q = useMemo(() => buildImpossibleQuestion(date, mode), [date, mode]);

  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [choice, setChoice] = useState<string | null | undefined>(undefined); // undefined = pas encore répondu, null = temps écoulé
  const [result, setResult] = useState<ImpossibleSubmitResult | null>(null);
  const answered = choice !== undefined;

  const submit = useCallback(
    (picked: string | null) => {
      if (answered) return;
      const ms = Math.min(Date.now() - startedAt, IMPOSSIBLE_SECONDS * 1000);
      setChoice(picked);
      void answerImpossible(mode, picked, picked === q.answer, ms, signedIn, date).then(setResult);
    },
    [answered, mode, q.answer, signedIn, date, startedAt],
  );

  useEffect(() => {
    if (answered) return;
    const id = setInterval(() => {
      const e = Date.now() - startedAt;
      setElapsed(e);
      if (e >= IMPOSSIBLE_SECONDS * 1000) submit(null);
    }, 100);
    return () => clearInterval(id);
  }, [answered, submit, startedAt]);

  const remaining = Math.max(0, IMPOSSIBLE_SECONDS * 1000 - elapsed);
  const correct = answered && choice === q.answer;

  return (
    <SafeAreaView style={[styles.container, !isDarkMode && styles.containerLight, { flex: 1 }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: 560, gap: 16, alignItems: 'center' }}>
          {/* Minuteur */}
          <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Skull color={ink} size={18} />
            <Text
              style={{
                fontFamily: FONTS.monoBold,
                fontSize: 11,
                color: ink,
                letterSpacing: 1.2,
                flex: 1,
              }}
            >
              {tr(language, 'IMPOSSIBLE · {0}', 'IMPOSSIBLE · {0}', [
                impossibleModeLabel(mode, language).toUpperCase(),
              ])}
            </Text>
            <Text
              style={{
                fontFamily: FONTS.monoBold,
                fontSize: 14,
                color: remaining < 5000 ? miss : c.text,
              }}
            >
              {answered ? '' : `${Math.ceil(remaining / 1000)} s`}
            </Text>
          </View>
          <View
            style={{
              width: '100%',
              height: 6,
              borderRadius: 3,
              backgroundColor: c.card,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${(remaining / (IMPOSSIBLE_SECONDS * 1000)) * 100}%`,
                backgroundColor: remaining < 5000 ? PALETTE.dangerRed : IMPOSSIBLE_RED,
              }}
            />
          </View>

          <View style={{ marginTop: 10 }}>
            <QuestionVisual q={q} />
          </View>
          <Text
            style={{
              fontFamily: FONTS.heading,
              fontSize: 19,
              color: c.text,
              textAlign: 'center',
              lineHeight: 26,
            }}
          >
            {impossiblePrompt(q, language)}
          </Text>

          {/* Options */}
          <View
            style={{
              width: '100%',
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              rowGap: 10,
            }}
          >
            {q.options.map((o) => {
              const isAnswer = o === q.answer;
              const isPicked = o === choice;
              const bg = !answered
                ? c.card
                : isAnswer
                  ? GREEN
                  : isPicked
                    ? PALETTE.dangerRed
                    : c.card;
              return (
                <TouchableOpacity
                  key={o}
                  disabled={answered}
                  onPress={() => submit(o)}
                  style={{
                    width: '48.5%',
                    minHeight: 54,
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: answered && (isAnswer || isPicked) ? bg : c.border,
                    backgroundColor: bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 8,
                    opacity: answered && !isAnswer && !isPicked ? 0.55 : 1,
                  }}
                  {...a11yButton(impossibleOptionLabel(q, o, language), { disabled: answered })}
                >
                  <Text
                    style={{
                      fontFamily: FONTS.monoBold,
                      fontSize: 13.5,
                      textAlign: 'center',
                      color: answered && (isAnswer || isPicked) ? '#fff' : c.text,
                    }}
                  >
                    {impossibleOptionLabel(q, o, language)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {answered && (
            <View
              style={{
                width: '100%',
                borderRadius: 16,
                padding: 16,
                backgroundColor: correct ? 'rgba(16,185,129,0.14)' : 'rgba(139,26,26,0.12)',
                borderWidth: 1.5,
                borderColor: correct ? GREEN : miss,
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: FONTS.headingBlack,
                  fontSize: 22,
                  color: correct ? GREEN : miss,
                }}
              >
                {correct
                  ? tr(language, 'Impossible… et pourtant !', 'Impossible… and yet!')
                  : choice === null
                    ? tr(language, 'Temps écoulé', 'Time’s up')
                    : tr(language, 'Raté', 'Missed')}
              </Text>
              <Text
                style={{ fontFamily: FONTS.mono, fontSize: 12.5, color: c.text, lineHeight: 19 }}
              >
                {impossibleReveal(q, language)}
              </Text>
              {(result ?? dayStats) && (result ?? dayStats)!.players > 0 && (
                <Text style={{ fontFamily: FONTS.monoBold, fontSize: 12, color: c.textMuted }}>
                  {tr(
                    language,
                    'Seulement {0} % des {1} joueurs ont trouvé aujourd’hui.',
                    'Only {0}% of today’s {1} players got it.',
                    [
                      pct((result ?? dayStats)!.winners, (result ?? dayStats)!.players),
                      (result ?? dayStats)!.players,
                    ],
                  )}
                </Text>
              )}
              {result && result.coins > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AtlasCoin color={PALETTE.sand} size={16} />
                  <Text style={{ fontFamily: FONTS.monoBold, fontSize: 12.5, color: PALETTE.sand }}>
                    +{result.coins}
                  </Text>
                </View>
              )}
              {!signedIn && (
                <Text style={{ fontFamily: FONTS.mono, fontSize: 11, color: c.textMuted }}>
                  {tr(
                    language,
                    'Connecte-toi pour entrer au classement du jour et gagner des pièces.',
                    'Sign in to enter today’s leaderboard and earn coins.',
                  )}
                </Text>
              )}
            </View>
          )}

          {answered && (
            <View style={{ width: '100%', flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={onDone}
                style={{
                  flex: 1,
                  height: 50,
                  borderRadius: 25,
                  borderWidth: 1.5,
                  borderColor: c.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                {...a11yButton(tr(language, 'Retour', 'Back'))}
              >
                <Text style={{ fontFamily: FONTS.monoBold, fontSize: 14, color: c.text }}>
                  {tr(language, 'Retour', 'Back')}
                </Text>
              </TouchableOpacity>
              {nextMode && (
                <TouchableOpacity
                  onPress={() => onNext(nextMode)}
                  style={{
                    flex: 1.4,
                    height: 50,
                    borderRadius: 25,
                    backgroundColor: IMPOSSIBLE_RED,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 4,
                  }}
                  {...a11yButton(tr(language, 'Question suivante', 'Next question'))}
                >
                  <Text style={{ fontFamily: FONTS.monoBold, fontSize: 14, color: '#fff' }}>
                    {impossibleModeLabel(nextMode, language)}
                  </Text>
                  <ChevronRight color="#fff" size={18} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Leaderboard({
  user,
  date,
  onOpenAuth,
}: {
  user: User | null;
  date: string;
  onOpenAuth?: () => void;
}) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const { ink } = useImpossibleInk();
  const fetcher = useCallback(() => fetchImpossibleLeaderboard(date), [date]);
  const { data, loading, error } = useCachedData(`impossible-board:${date}`, fetcher, { ttl: 0 });
  const rows = data ?? [];

  return (
    <View style={{ gap: 8 }}>
      {!user && (
        <TouchableOpacity
          disabled={!onOpenAuth}
          onPress={onOpenAuth}
          style={{
            padding: 14,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: ink,
            borderStyle: 'dashed',
          }}
          {...a11yButton(tr(language, 'Se connecter pour être classé', 'Sign in to get ranked'))}
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
              'Connecte-toi pour apparaître au classement',
              'Sign in to appear on the leaderboard',
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
                'Personne n’est encore classé aujourd’hui. Sois le premier !',
                'Nobody is ranked yet today. Be the first!',
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
              {r.correct}/6
            </Text>
            <Text
              style={{
                width: 54,
                textAlign: 'right',
                fontFamily: FONTS.mono,
                fontSize: 11,
                color: c.textMuted,
              }}
            >
              {(r.total_ms / 1000).toFixed(1)} s
            </Text>
          </View>
        );
      })}
    </View>
  );
}

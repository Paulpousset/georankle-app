/**
 * DailyEnd — « L'orbite des défis » : la fin d'un défi du jour.
 *
 * Ton globe au centre, les défis du jour en orbite comme des satellites (le
 * langage des cosmétiques). Celui que tu viens de finir s'échappe du globe et
 * rejoint sa place sur l'anneau, où il s'allume (0,6 – 1,3 s). Le score se
 * compte (0,5 s), le compteur du jour avance (1,3 s), la flamme de série
 * grossit si elle vient de gagner un jour (1,9 s), puis « Défi suivant »
 * pointe vers le prochain défi non fait (2,2 s). Les 12 faits : l'anneau
 * devient or.
 *
 * Posé PAR-DESSUS l'écran de fin du mode, qui garde le récap et les pièces :
 * « Récap & pièces » le découvre.
 */
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Ellipse } from 'react-native-svg';
import { ChevronRight, ListChecks, Share2, X } from 'lucide-react-native';

import type { GameMode, Language } from '../types';
import { DAILY_MODES, dailyModeLabel, getLocalState, getPuzzleNumber, msUntilNextPuzzle, type DailyResult } from '../lib/daily';
import { useMyGameGlobe } from '../lib/myGlobe';
import { END_CHOREO, NATIVE_ANIM, useReducedMotion } from '../lib/motion';
import { a11yButton, a11yHidden, ICON_HIT_SLOP, announce } from '../lib/a11y';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { AtlasFlame } from '../components/AtlasIcons';
import { EndGlobe } from '../components/end/EndGlobe';
import { Reveal } from '../components/end/Reveal';
import { Burst, Confetti, WaveRings } from '../components/end/Confetti';
import { CountUp } from '../components/end/CountUp';
import { ScoreText } from '../components/ScoreText';
import { MODE_META } from './DailyHub';

const GOLD = '#f5b301';
const GOLD_DEEP = '#8a5a00';
const FLAME = '#e8772e';
const RX = 150;
const RY = 54;
const TILT = (-14 * Math.PI) / 180;
const SLOT = 34;
const STAGE_H = 300;
const FLY_AT = 600;
const FLY_MS = 700;

interface DailyEndProps {
  result: DailyResult;
  streak: number;
  /** La série vient de gagner un jour (premier défi du jour). */
  streakIncreased: boolean;
  onNext: (mode: GameMode) => void;
  onShare: () => void;
  /** Découvre l'écran de fin du mode (récap, pièces, doubleur). */
  onDetail: () => void;
  onHub: () => void;
}

function formatCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, '0')}m`;
}

/** Même formulation que la carte de résultat et le message de partage. */
function formatScore(result: DailyResult, language: Language, n: number): string {
  switch (result.mode) {
    case 'classic':
      return `${n}%`;
    case 'streak':
      return tr(language, 'Série de {0}', 'Streak of {0}', [n]);
    default:
      return `${n}`;
  }
}

/** Position d'un emplacement sur l'anneau incliné (repère centré sur le globe). */
function slotPos(i: number) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / DAILY_MODES.length;
  const x = Math.cos(a) * RX;
  const y = Math.sin(a) * RY;
  return {
    x: x * Math.cos(TILT) - y * Math.sin(TILT),
    y: x * Math.sin(TILT) + y * Math.cos(TILT),
    back: Math.sin(a) < 0,
  };
}

export default function DailyEnd({ result, streak, streakIncreased, onNext, onShare, onDetail, onHub }: DailyEndProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const rm = useReducedMotion();
  const { config: myGlobe } = useMyGameGlobe();
  const [done, setDone] = useState<Record<string, DailyResult>>({ [result.mode]: result });
  const [countdown, setCountdown] = useState(() => msUntilNextPuzzle());

  useEffect(() => {
    let alive = true;
    getLocalState().then((s) => {
      if (alive) setDone({ ...s.results, [result.mode]: result });
    }).catch(() => {});
    const id = setInterval(() => setCountdown(msUntilNextPuzzle()), 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [result]);

  const doneCount = Object.keys(done).filter((m) => DAILY_MODES.includes(m as GameMode)).length;
  const allDone = doneCount >= DAILY_MODES.length;
  const nextMode = useMemo(() => {
    const idx = DAILY_MODES.indexOf(result.mode);
    for (let k = 1; k <= DAILY_MODES.length; k++) {
      const m = DAILY_MODES[(idx + k) % DAILY_MODES.length];
      if (!done[m]) return m;
    }
    return null;
  }, [done, result.mode]);

  useEffect(() => {
    announce(
      tr(language, 'Défi terminé : {0}. {1} défis sur {2} aujourd’hui.', 'Challenge done: {0}. {1} of {2} challenges today.', [
        formatScore(result, language, result.score),
        doneCount,
        DAILY_MODES.length,
      ]),
    );
    // Une seule annonce, à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Le défi qui vient d'être fini quitte le globe pour sa place sur l'anneau.
  const fly = useState(() => new Animated.Value(rm ? 1 : 0))[0];
  const [flown, setFlown] = useState(rm);
  useEffect(() => {
    if (rm) return;
    const t = setTimeout(() => {
      Animated.timing(fly, { toValue: 1, duration: FLY_MS, easing: Easing.out(Easing.back(1.2)), useNativeDriver: NATIVE_ANIM }).start(() => setFlown(true));
    }, FLY_AT);
    return () => clearTimeout(t);
  }, [fly, rm]);

  // La flamme grossit d'un cran quand la série gagne un jour.
  const flame = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    if (rm || !streakIncreased) return;
    const t = setTimeout(() => {
      Animated.sequence([
        Animated.timing(flame, { toValue: 1.5, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_ANIM }),
        Animated.spring(flame, { toValue: 1.15, friction: 4, useNativeDriver: NATIVE_ANIM }),
      ]).start();
    }, 1900);
    return () => clearTimeout(t);
  }, [flame, rm, streakIncreased]);

  const puzzle = getPuzzleNumber(new Date(result.date + 'T00:00:00Z'));
  const ringColor = allDone ? GOLD : c.border;

  const renderSlot = (mode: GameMode, i: number) => {
    const meta = MODE_META[mode];
    const Icon = meta?.icon;
    const pos = slotPos(i);
    const isCurrent = mode === result.mode;
    const lit = isCurrent ? flown : !!done[mode];
    const style = {
      position: 'absolute' as const,
      left: -SLOT / 2,
      top: -SLOT / 2,
      width: SLOT,
      height: SLOT,
      borderRadius: SLOT / 2,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: lit ? GOLD : c.card,
      borderWidth: 2,
      borderColor: lit ? GOLD_DEEP : c.border,
      opacity: pos.back && !isCurrent ? 0.7 : 1,
    };
    const inner = Icon ? <Icon color={lit ? GOLD_DEEP : c.textFaint} size={16} /> : null;
    if (!isCurrent) {
      return (
        <View key={mode} style={style} {...a11yHidden}>
          {inner}
        </View>
      );
    }
    return (
      <Animated.View
        key={mode}
        style={[
          style,
          {
            backgroundColor: GOLD,
            borderColor: GOLD_DEEP,
            opacity: 1,
            transform: [
              { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [-pos.x, 0] }) },
              { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [-pos.y, 0] }) },
              { scale: fly.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
            ],
          },
        ]}
        {...a11yHidden}
      >
        {inner}
        {flown ? <WaveRings at={0} radius={SLOT / 2 + 2} color={GOLD} rings={2} gap={250} /> : null}
        {flown ? <Burst at={0} count={14} color={GOLD} radius={44} size={4} /> : null}
      </Animated.View>
    );
  };

  const slots = DAILY_MODES.map((mode, i) => ({ mode, i, pos: slotPos(i) }));
  const backSlots = slots.filter((s) => s.pos.back);
  const frontSlots = slots.filter((s) => !s.pos.back);

  const btn = (label: string, Icon: typeof Share2, onPress: () => void, kind: 'primary' | 'secondary') => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      {...a11yButton(label)}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingVertical: 14,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: kind === 'primary' ? c.accentStrong : c.card,
        borderWidth: 1,
        borderColor: kind === 'primary' ? 'transparent' : c.border,
      }}
    >
      <Icon color={kind === 'primary' ? '#fff' : c.text} size={17} {...a11yHidden} />
      <ScoreText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ flexShrink: 1, color: kind === 'primary' ? '#fff' : c.text, fontFamily: FONTS.monoBold, fontSize: 13.5 }}>
        {label}
      </ScoreText>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={{ color: c.textMuted, fontFamily: FONTS.monoBold, fontSize: 10, letterSpacing: 2 }}>
          {`${tr(language, 'DÉFI DU JOUR', 'DAILY CHALLENGE')} · #${puzzle}`}
        </Text>
        <TouchableOpacity
          onPress={onHub}
          hitSlop={ICON_HIT_SLOP}
          {...a11yButton(tr(language, 'Retour aux défis du jour', 'Back to the daily hub'))}
          style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}
        >
          <X color={c.text} size={18} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* La scène : anneau, emplacements, globe. */}
        <View
          style={{ width: '100%', height: STAGE_H, alignItems: 'center', justifyContent: 'center' }}
          accessible
          accessibilityRole="image"
          accessibilityLabel={tr(language, 'Ton globe et les {0} défis du jour en orbite, {1} allumés', 'Your globe and the {0} daily challenges in orbit, {1} lit', [DAILY_MODES.length, doneCount])}
        >
          {allDone ? <Confetti at={1400} width={340} height={STAGE_H + 80} top={-40} /> : null}
          <View style={{ width: 0, height: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Svg
              width={RX * 2 + 40}
              height={RX * 2 + 40}
              style={{ position: 'absolute', left: -RX - 20, top: -RX - 20 }}
              pointerEvents="none"
            >
              <Ellipse
                cx={RX + 20}
                cy={RX + 20}
                rx={RX}
                ry={RY}
                transform={`rotate(-14 ${RX + 20} ${RX + 20})`}
                stroke={ringColor}
                strokeWidth={allDone ? 3 : 2}
                strokeDasharray={allDone ? undefined : '4 7'}
                fill="none"
              />
            </Svg>
            {backSlots.map(({ mode, i, pos }) => (
              <View key={mode} style={{ position: 'absolute', left: pos.x, top: pos.y }} pointerEvents="none">
                {renderSlot(mode, i)}
              </View>
            ))}
            <View style={{ position: 'absolute', left: -66, top: -66 }}>
              <EndGlobe config={myGlobe} size={120} accent={GOLD} animate showGlobeName={false} celebrate={allDone} celebrateAt={1400} />
            </View>
            {frontSlots.map(({ mode, i, pos }) => (
              <View key={mode} style={{ position: 'absolute', left: pos.x, top: pos.y }} pointerEvents="none">
                {renderSlot(mode, i)}
              </View>
            ))}
          </View>
        </View>

        <View style={{ width: '100%', maxWidth: 420, paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 18 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <Text style={{ color: c.textFaint, fontFamily: FONTS.monoBold, fontSize: 10, letterSpacing: 1.5 }}>
                  {dailyModeLabel(result.mode, language).toUpperCase()}
                </Text>
                <CountUp
                  to={result.score}
                  at={500}
                  duration={900}
                  format={(n) => formatScore(result, language, n)}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ color: c.text, fontFamily: FONTS.headingBlack, fontSize: 40, marginTop: 2 }}
                />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: c.textFaint, fontFamily: FONTS.monoBold, fontSize: 10, letterSpacing: 1.5 }}>
                  {tr(language, "AUJOURD'HUI", 'TODAY')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                  <CountUp
                    from={Math.max(0, doneCount - 1)}
                    to={doneCount}
                    at={FLY_AT + FLY_MS}
                    duration={200}
                    style={{ color: allDone ? GOLD_DEEP : c.accent, fontFamily: FONTS.headingBlack, fontSize: 30 }}
                  />
                  <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 13 }}>{` / ${DAILY_MODES.length}`}</Text>
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
              <Animated.View style={{ transform: [{ scale: flame }] }} {...a11yHidden}>
                <AtlasFlame color={FLAME} size={22} />
              </Animated.View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }} accessible accessibilityLabel={tr(language, 'Série : {0} jours', 'Streak: {0} days', [streak])}>
                <CountUp
                  from={streakIncreased ? Math.max(0, streak - 1) : streak}
                  to={streak}
                  at={1950}
                  duration={220}
                  style={{ color: FLAME, fontFamily: FONTS.headingBlack, fontSize: 20 }}
                />
                <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
                  {tr(language, 'jours de série', 'day streak')}
                </Text>
              </View>
              {streakIncreased ? (
                <Reveal at={1950} kind="pop" style={{ alignSelf: 'auto' }}>
                  <Text style={{ color: '#2a6e3f', fontFamily: FONTS.monoBold, fontSize: 12 }}>+1</Text>
                </Reveal>
              ) : null}
            </View>

            <Reveal at={END_CHOREO.reward} kind="rise" style={{ marginTop: 16 }}>
              <View style={{ alignSelf: 'stretch', gap: 10 }}>
                {nextMode ? (
                  <View style={{ flexDirection: 'row' }}>
                    {btn(tr(language, 'Défi suivant · {0}', 'Next challenge · {0}', [dailyModeLabel(nextMode, language)]), ChevronRight, () => onNext(nextMode), 'primary')}
                  </View>
                ) : (
                  <Text style={{ color: GOLD_DEEP, fontFamily: FONTS.monoBold, fontSize: 13, textAlign: 'center' }}>
                    {tr(language, 'Journée complète : les {0} défis sont faits !', 'Full day: all {0} challenges done!', [DAILY_MODES.length])}
                  </Text>
                )}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {btn(tr(language, 'Partager', 'Share'), Share2, onShare, nextMode ? 'secondary' : 'primary')}
                  {btn(tr(language, 'Récap & pièces', 'Recap & coins'), ListChecks, onDetail, 'secondary')}
                </View>
                <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 10, textAlign: 'center' }}>
                  {tr(language, 'Prochain défi dans ', 'Next puzzle in ')}
                  {formatCountdown(countdown)}
                </Text>
              </View>
            </Reveal>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

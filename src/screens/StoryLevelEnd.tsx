/**
 * StoryLevelEnd — « Le carnet d'explorateur » : la fin d'un niveau d'Histoire.
 *
 * Jusqu'ici le niveau se démontait avant même que le score existe, et tout
 * tenait dans un toast. Ici, une page de passeport : le globe du joueur tombe
 * et se pose (0 – 0,7 s), le tampon « RÉUSSI · NIV. 42 » claque avec un
 * tremblement de la page (0,7 s), les étoiles se tamponnent une à une
 * (1,1 / 1,4 / 1,7 s), les lignes se tapent à la machine (score, seuil), puis
 * les pièces (2,2 s), la Collection de l'Explorateur (2,6 s) et les actions
 * (2,9 s). Raté : tampon rouge, étoiles vides, « il manque N points ».
 *
 * L'enregistrement serveur (`recordLevel`) arrive en parallèle : les pièces et
 * la pièce débloquée s'affichent quand il répond, sans bloquer la page.
 */
import { useEffect, useState } from 'react';
import { Animated, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { playSfx } from '../lib/sfx';
import { ChevronRight, Heart, Map as MapIcon, RotateCcw, Star } from 'lucide-react-native';

import type { StoryLevel } from '../data/story';
import { STAR_THRESHOLDS, STORY_LEVEL_COUNT } from '../data/story';
import { biomeForTier } from '../data/biomes';
import { RARITY_META, STORY_COSMETIC_UNLOCKS, getPartById } from '../data/cosmetics';
import type { RecordLevelResult } from '../lib/story';
import { useMyGameGlobe } from '../lib/myGlobe';
import { END_CHOREO, NATIVE_ANIM, useReducedMotion } from '../lib/motion';
import { a11yButton, a11yHidden, announce } from '../lib/a11y';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { EndGlobe } from '../components/end/EndGlobe';
import { EndStamp } from '../components/end/EndStamp';
import { Reveal } from '../components/end/Reveal';
import { Burst } from '../components/end/Confetti';
import { CountUp } from '../components/end/CountUp';
import { SoloCoinReward } from '../components/SoloCoinReward';
import { ScoreText } from '../components/ScoreText';

const GOLD = '#f5b301';
const GOLD_DEEP = '#8a5a00';
const STAMP_AT = END_CHOREO.verdict;
const STAR_AT = [1100, 1400, 1700];
const LINES_AT = 1950;
const COINS_AT = END_CHOREO.reward;
const COLLECTION_AT = 2600;
const ACTIONS_AT = 2900;

interface StoryLevelEndProps {
  level: StoryLevel;
  score: number;
  stars: number;
  /** Réponse de l'enregistrement (pièces, pièce débloquée) — null tant qu'elle arrive. */
  record: RecordLevelResult | null;
  /** Plus haut niveau réussi AVANT cette partie. */
  maxLevelBefore: number;
  lives: number;
  /** Déconnecté : pas de pièces (le serveur ne crédite rien), on le dit plutôt que « aucune pièce ». */
  signedIn: boolean;
  onNext: () => void;
  onReplay: () => void;
  onMap: () => void;
}

/** Une ligne du carnet : libellé, pointillés, valeur tapée à la machine. */
function TypedLine({ label, value, at, color, muted }: { label: string; value: string; at: number; color: string; muted: string }) {
  const rm = useReducedMotion();
  const [n, setN] = useState(rm ? value.length : 0);
  useEffect(() => {
    if (rm) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const timer = setTimeout(() => {
      let i = 0;
      interval = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= value.length && interval) clearInterval(interval);
      }, Math.max(18, 420 / Math.max(1, value.length)));
    }, at);
    return () => {
      clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }, [at, rm, value]);
  const typed = value.slice(0, n);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingVertical: 4 }} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={{ color: muted, fontFamily: FONTS.mono, fontSize: 12 }}>{label}</Text>
      <View style={{ flex: 1, borderBottomWidth: 1, borderStyle: 'dotted', borderColor: muted, marginBottom: 4 }} {...a11yHidden} />
      <Text style={{ color, fontFamily: FONTS.monoBold, fontSize: 13 }} {...a11yHidden}>
        {typed}
        {n < value.length ? '▍' : ''}
      </Text>
    </View>
  );
}

export default function StoryLevelEnd({
  level,
  score,
  stars,
  record,
  maxLevelBefore,
  lives,
  signedIn,
  onNext,
  onReplay,
  onMap,
}: StoryLevelEndProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const rm = useReducedMotion();
  const { config: myGlobe } = useMyGameGlobe();
  const passed = stars >= 1;
  const biome = biomeForTier(level.tier);
  const stampColor = passed ? PALETTE.vermilion : PALETTE.dangerRed;

  // Le tremblement de la page quand le tampon claque.
  const shake = useState(() => new Animated.Value(0))[0];
  const onStamp = () => {
    Haptics.notificationAsync(
      passed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
    playSfx('stamp');
    playSfx(passed ? 'win' : 'lose');
    if (rm) return;
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: NATIVE_ANIM }),
      Animated.timing(shake, { toValue: -1, duration: 70, useNativeDriver: NATIVE_ANIM }),
      Animated.timing(shake, { toValue: 0.5, duration: 70, useNativeDriver: NATIVE_ANIM }),
      Animated.timing(shake, { toValue: 0, duration: 80, useNativeDriver: NATIVE_ANIM }),
    ]).start();
  };

  useEffect(() => {
    announce(
      passed
        ? tr(language, 'Niveau {0} réussi, {1} points, {2} étoiles', 'Level {0} cleared, {1} points, {2} stars', [level.level, score, stars])
        : tr(language, 'Niveau {0} raté, {1} points', 'Level {0} failed, {1} points', [level.level, score]),
    );
  }, [language, level.level, passed, score, stars]);

  // Le prochain seuil d'étoile (ou rien à 3 étoiles).
  const nextThreshold = STAR_THRESHOLDS.find((t) => score < t) ?? null;
  const maxLevel = Math.max(maxLevelBefore, passed ? level.level : 0);
  const unlockedCount = STORY_COSMETIC_UNLOCKS.filter((u) => u.level <= maxLevel).length;
  const nextUnlock = STORY_COSMETIC_UNLOCKS.find((u) => u.level > maxLevel) ?? null;
  const nextPart = nextUnlock ? getPartById(nextUnlock.itemId) : undefined;
  const justUnlocked = record?.unlockedItemId ? getPartById(record.unlockedItemId) : undefined;
  const hasNext = passed && level.level < STORY_LEVEL_COUNT;
  const canReplay = lives > 0;

  const btn = (
    key: string,
    label: string,
    Icon: typeof Star,
    onPress: () => void,
    kind: 'primary' | 'secondary',
    disabled = false,
  ) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      {...a11yButton(label, { disabled })}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingVertical: 14,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: kind === 'primary' ? (passed ? PALETTE.forestGreen : c.accentStrong) : c.card,
        borderWidth: 1,
        borderColor: kind === 'primary' ? 'transparent' : c.border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon color={kind === 'primary' ? '#fff' : c.text} size={17} {...a11yHidden} />
      <ScoreText
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{ flexShrink: 1, color: kind === 'primary' ? '#fff' : c.text, fontFamily: FONTS.monoBold, fontSize: 13.5 }}
      >
        {label}
      </ScoreText>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: c.card,
            borderRadius: 18,
            borderWidth: 2,
            borderColor: c.border,
            padding: 18,
            transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }],
          }}
        >
          <Text style={{ color: c.textMuted, fontFamily: FONTS.monoBold, fontSize: 10, letterSpacing: 2, textAlign: 'center' }}>
            {tr(language, "CARNET D'EXPLORATEUR · PAGE {0}", "EXPLORER'S LOGBOOK · PAGE {0}", [level.level])}
          </Text>
          <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 11, textAlign: 'center', marginTop: 2 }}>
            {`${tr(language, biome.nameFr, biome.nameEn)} · ${tr(language, 'Chapitre {0}', 'Chapter {0}', [level.tier])}`}
          </Text>

          <EndGlobe
            config={myGlobe}
            size={120}
            accent={passed ? GOLD : undefined}
            animate
            style={{ marginTop: 14 }}
          />

          <View style={{ alignItems: 'center', minHeight: 56, marginTop: -8 }}>
            <EndStamp
              at={STAMP_AT}
              text={
                passed
                  ? tr(language, 'RÉUSSI · NIV. {0}', 'CLEARED · LVL {0}', [level.level])
                  : tr(language, 'RATÉ · NIV. {0}', 'FAILED · LVL {0}', [level.level])
              }
              color={stampColor}
              size={22}
              onShown={onStamp}
            />
          </View>

          {/* Les trois étoiles : les gagnées se tamponnent, les autres restent vides. */}
          <View
            style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8, height: 48 }}
            accessible
            accessibilityRole="image"
            accessibilityLabel={tr(language, '{0} étoiles sur 3', '{0} of 3 stars', [stars])}
          >
            {[0, 1, 2].map((i) =>
              i < stars ? (
                <View key={i} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Burst at={STAR_AT[i] + 120} count={i === 2 ? 22 : 12} color={GOLD} radius={i === 2 ? 60 : 40} seed={20 + i} />
                  <Reveal at={STAR_AT[i]} kind="stamp" style={{ alignSelf: 'auto' }}>
                    <Star color={GOLD_DEEP} fill={GOLD} size={40} strokeWidth={1.5} {...a11yHidden} />
                  </Reveal>
                </View>
              ) : (
                <View key={i} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Star color={c.textFaint} size={40} strokeWidth={1.4} {...a11yHidden} />
                </View>
              ),
            )}
          </View>

          <CountUp
            to={score}
            at={STAMP_AT + 200}
            duration={900}
            style={{ color: passed ? c.text : PALETTE.dangerRed, fontFamily: FONTS.headingBlack, fontSize: 46, textAlign: 'center', marginTop: 4 }}
          />
          <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 11, textAlign: 'center', letterSpacing: 1 }}>
            {tr(language, 'points sur 1000', 'points out of 1000')}
          </Text>

          <View style={{ marginTop: 12, borderTopWidth: 1, borderBottomWidth: 1, borderStyle: 'dashed', borderColor: c.border, paddingVertical: 6 }}>
            <TypedLine
              label={tr(language, 'Seuils', 'Thresholds')}
              value={STAR_THRESHOLDS.join(' · ')}
              at={LINES_AT}
              color={c.text}
              muted={c.textMuted}
            />
            <TypedLine
              label={passed ? tr(language, 'Prochaine étoile', 'Next star') : tr(language, 'Il manque', 'Short by')}
              value={
                nextThreshold == null
                  ? tr(language, 'toutes gagnées', 'all earned')
                  : passed
                    ? tr(language, 'à {0}', 'at {0}', [nextThreshold])
                    : tr(language, '{0} points', '{0} points', [nextThreshold - score])
              }
              at={LINES_AT + 450}
              color={passed ? c.text : PALETTE.dangerRed}
              muted={c.textMuted}
            />
          </View>

          <Reveal at={COINS_AT} kind="pop" style={{ marginTop: 12 }}>
            {signedIn ? (
              <SoloCoinReward
                coinsEarned={record ? record.coins : null}
                coinsCapped={record ? record.coins === 0 && passed && !record.firstClear : false}
                coinsSyncFailed={record ? !record.synced : false}
                containerStyle={{ alignSelf: 'stretch' }}
              />
            ) : (
              <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 12, textAlign: 'center' }}>
                {tr(language, 'Connecte-toi pour gagner des pièces et sauvegarder ta progression.', 'Sign in to earn coins and save your progress.')}
              </Text>
            )}
          </Reveal>

          <Reveal at={COLLECTION_AT} kind="rise" style={{ marginTop: 14 }}>
            <View style={{ alignSelf: 'stretch' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: c.textMuted, fontFamily: FONTS.monoBold, fontSize: 10, letterSpacing: 1.2 }}>
                  {tr(language, "COLLECTION DE L'EXPLORATEUR", "EXPLORER'S COLLECTION")}
                </Text>
                <Text style={{ color: c.textMuted, fontFamily: FONTS.monoBold, fontSize: 10 }}>
                  {`${unlockedCount} / ${STORY_COSMETIC_UNLOCKS.length}`}
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, marginTop: 6, overflow: 'hidden' }}>
                <View style={{ width: `${(unlockedCount / STORY_COSMETIC_UNLOCKS.length) * 100}%`, height: '100%', backgroundColor: GOLD }} />
              </View>
              {justUnlocked ? (
                <View style={{ alignItems: 'center', marginTop: 10 }}>
                  <Burst at={COLLECTION_AT + 400} count={26} color={RARITY_META[justUnlocked.rarity].color} radius={90} />
                  <Reveal at={COLLECTION_AT + 300} kind="pop" style={{ alignSelf: 'auto' }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        borderWidth: 1.5,
                        borderColor: RARITY_META[justUnlocked.rarity].color,
                        backgroundColor: RARITY_META[justUnlocked.rarity].color + '22',
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: RARITY_META[justUnlocked.rarity].color, fontFamily: FONTS.monoBold, fontSize: 10, letterSpacing: 1.4 }}>
                        {tr(language, 'NOUVEAU', 'NEW')}
                      </Text>
                      <Text style={{ color: c.text, fontFamily: FONTS.heading, fontSize: 14 }}>
                        {tr(language, justUnlocked.nameFr, justUnlocked.nameEn)}
                      </Text>
                    </View>
                  </Reveal>
                </View>
              ) : nextPart && nextUnlock ? (
                <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 10, marginTop: 8 }}>
                  {tr(language, 'Prochaine pièce · niveau {0} · {1}', 'Next piece · level {0} · {1}', [
                    nextUnlock.level,
                    tr(language, nextPart.nameFr, nextPart.nameEn),
                  ])}
                </Text>
              ) : null}
              {record && !record.synced ? (
                <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 10, marginTop: 8, textAlign: 'center' }}>
                  {tr(language, 'Progression enregistrée hors-ligne — synchronisation à la reconnexion.', 'Progress saved offline — will sync when you reconnect.')}
                </Text>
              ) : null}
            </View>
          </Reveal>

          <Reveal at={ACTIONS_AT} kind="rise" style={{ marginTop: 16 }}>
            <View style={{ alignSelf: 'stretch', gap: 10 }}>
              {hasNext ? (
                <View style={{ flexDirection: 'row' }}>
                  {btn('next', tr(language, 'Niveau {0}', 'Level {0}', [level.level + 1]), ChevronRight, onNext, 'primary', !canReplay)}
                </View>
              ) : !passed ? (
                <View style={{ flexDirection: 'row' }}>
                  {btn(
                    'retry',
                    canReplay
                      ? tr(language, 'Réessayer · {0} vies', 'Try again · {0} lives', [lives])
                      : tr(language, 'Plus de vies', 'Out of lives'),
                    Heart,
                    onReplay,
                    'primary',
                    !canReplay,
                  )}
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {passed ? btn('replay', tr(language, 'Rejouer', 'Replay'), RotateCcw, onReplay, 'secondary', !canReplay) : null}
                {btn('map', tr(language, 'Carte', 'Map'), MapIcon, onMap, 'secondary')}
              </View>
              {!canReplay ? (
                <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 10, textAlign: 'center' }}>
                  {tr(language, 'Les vies reviennent avec le temps — ou depuis la carte, avec une pub.', 'Lives come back over time — or from the map, with an ad.')}
                </Text>
              ) : null}
            </View>
          </Reveal>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

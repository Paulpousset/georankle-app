/**
 * <RankLadder> — « L'ascension » : le bloc classé de la fin de match.
 *
 * L'échelle des rangs (Bronze → Maître) se déroule (0 – 0,5 s), l'ELO se
 * compte (0,7 s), puis le globe du joueur grimpe — ou descend — d'un barreau
 * avec un rebond (0,8 – 1,6 s), des éclats à l'arrivée, et le tampon
 * « PROMOTION » claque (1,7 s). Sans changement de rang, seul le compteur
 * bouge ; rien ne claque.
 *
 * `at` décale toute la séquence (MatchResult l'enchaîne après le duel).
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import type { AvatarConfig } from '../../types';
import { RANKS, getRankFromElo } from '../../lib/ranked';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getColors } from '../../theme/colors';
import { FONTS } from '../../theme/typography';
import { NATIVE_ANIM, useReducedMotion } from '../../lib/motion';
import { tr } from '../../i18n';
import { a11yHidden } from '../../lib/a11y';
import { Avatar } from '../Avatar';
import { Burst } from './Confetti';
import { CountUp } from './CountUp';
import { EndStamp } from './EndStamp';
import { Reveal } from './Reveal';

interface RankLadderProps {
  oldElo: number;
  newElo: number;
  eloChange: number;
  config: AvatarConfig | null;
  photoUrl?: string | null;
  username?: string | null;
  /** Décalage (ms) de toute la séquence. */
  at?: number;
}

const STEP = 46;
const BADGE = 30;

export function RankLadder({ oldElo, newElo, eloChange, config, photoUrl, username, at = 0 }: RankLadderProps) {
  const rm = useReducedMotion();
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  const oldRank = getRankFromElo(oldElo);
  const newRank = getRankFromElo(newElo);
  const oldIdx = RANKS.findIndex((r) => r.tier === oldRank.tier);
  const newIdx = RANKS.findIndex((r) => r.tier === newRank.tier);
  const promoted = newIdx > oldIdx;
  const demoted = newIdx < oldIdx;
  const climb = useState(() => new Animated.Value(rm ? 1 : 0))[0];

  useEffect(() => {
    if (rm || oldIdx === newIdx) {
      climb.setValue(1);
      return;
    }
    const timer = setTimeout(() => {
      Animated.timing(climb, {
        toValue: 1,
        duration: promoted ? 800 : 1000,
        easing: promoted ? Easing.out(Easing.back(1.5)) : Easing.inOut(Easing.quad),
        useNativeDriver: NATIVE_ANIM,
      }).start();
    }, at + 800);
    return () => clearTimeout(timer);
  }, [at, climb, newIdx, oldIdx, promoted, rm]);

  const height = STEP * (RANKS.length - 1) + BADGE + 16;
  const yFor = (idx: number) => height - 8 - BADGE / 2 - idx * STEP;
  const globeY = climb.interpolate({ inputRange: [0, 1], outputRange: [yFor(oldIdx), yFor(newIdx)] });
  const arc = climb.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 22, 0] });
  const deltaColor = eloChange >= 0 ? '#2a6e3f' : '#8b1a1a';
  const rankName = (r: typeof newRank) => tr(language, r.nameFr, r.name);

  return (
    <View
      style={{
        width: '100%',
        maxWidth: 400,
        backgroundColor: c.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: newRank.color,
        padding: 18,
        gap: 12,
      }}
    >
      <Reveal at={at} kind="fade">
        <View
          style={{ flexDirection: 'row', width: '100%', height, alignItems: 'flex-start' }}
          accessible
          accessibilityRole="image"
          accessibilityLabel={
            promoted
              ? tr(language, 'Promotion en {0}', 'Promoted to {0}', [rankName(newRank)])
              : demoted
                ? tr(language, 'Rétrogradé en {0}', 'Demoted to {0}', [rankName(newRank)])
                : tr(language, 'Rang {0} conservé', 'Still {0}', [rankName(newRank)])
          }
        >
          {/* Échelle */}
          <View style={{ width: 150, height }} {...a11yHidden}>
            <View style={{ position: 'absolute', left: BADGE / 2 - 1.5, top: yFor(RANKS.length - 1), width: 3, height: STEP * (RANKS.length - 1), backgroundColor: c.border }} />
            {RANKS.map((r, i) => {
              const reached = i <= newIdx;
              return (
                <View key={r.tier} style={{ position: 'absolute', left: 0, top: yFor(i) - BADGE / 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: BADGE,
                      height: BADGE,
                      borderRadius: BADGE / 2,
                      backgroundColor: reached ? r.color : c.surface,
                      borderWidth: 2,
                      borderColor: reached ? r.darkColor : c.border,
                    }}
                  />
                  <Text style={{ color: reached ? c.text : c.textFaint, fontFamily: i === newIdx ? FONTS.monoBold : FONTS.mono, fontSize: 12 }}>
                    {rankName(r)}
                  </Text>
                </View>
              );
            })}
          </View>
          {/* Le globe, à droite, à la hauteur de son rang */}
          <View style={{ flex: 1, height }} {...a11yHidden}>
            <Animated.View
              style={{
                position: 'absolute',
                right: 10,
                top: 0,
                alignItems: 'center',
                transform: [{ translateY: Animated.subtract(globeY, 34) }, { translateX: Animated.multiply(arc, -1) }],
              }}
            >
              <View style={{ width: 68, height: 68, alignItems: 'center', justifyContent: 'center' }}>
                {promoted ? <Burst at={at + 1550} count={22} color={newRank.color} radius={60} /> : null}
                <Avatar config={config} photoUrl={photoUrl} username={username} size={56} ringColor={newRank.color} ringWidth={3} />
              </View>
            </Animated.View>
          </View>
        </View>
      </Reveal>

      {(promoted || demoted) && (
        <View style={{ alignItems: 'center', minHeight: 44 }}>
          <EndStamp
            at={at + 1700}
            text={
              promoted
                ? tr(language, 'PROMOTION · {0}', 'PROMOTED · {0}', [rankName(newRank).toUpperCase()])
                : tr(language, 'RELÉGATION · {0}', 'RELEGATED · {0}', [rankName(newRank).toUpperCase()])
            }
            color={promoted ? '#2a6e3f' : '#8b1a1a'}
            size={18}
            tilt={promoted ? -5 : 4}
          />
        </View>
      )}

      <Reveal at={at + 600} kind="rise">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 10 }}>
          <View style={{ alignItems: 'flex-start', gap: 2 }}>
            <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 11 }}>{tr(language, 'AVANT', 'BEFORE')}</Text>
            <Text style={{ color: c.textMuted, fontFamily: FONTS.headingBlack, fontSize: 20 }}>{oldElo}</Text>
          </View>
          <Text style={{ color: deltaColor, fontFamily: FONTS.headingBlack, fontSize: 28 }}>
            {`${eloChange >= 0 ? '+' : ''}${eloChange}`}
          </Text>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 11 }}>{tr(language, 'APRÈS', 'AFTER')}</Text>
            <CountUp
              from={oldElo}
              to={newElo}
              at={100}
              duration={900}
              style={{ color: newRank.color, fontFamily: FONTS.headingBlack, fontSize: 20 }}
            />
          </View>
        </View>
      </Reveal>
    </View>
  );
}

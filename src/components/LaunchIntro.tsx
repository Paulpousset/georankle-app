/**
 * L'écran de lancement animé — la seconde et demie qui ouvre l'app.
 *
 * Après l'écran natif (le PNG figé d'Expo), on enchaîne sur une petite mise en
 * scène dans la charte « atlas » : la rose des vents de l'icône tourne et se
 * pose (avec un léger dépassement), le titre GeoGames monte derrière, les
 * coordonnées et le filet se dessinent, puis tout se fond dans le menu.
 *
 *   0 – 0,7 s   la rose des vents entre (rotation + zoom, rebond)
 *   0,45 s      le titre monte
 *   0,7 s       le filet se trace, l'aiguille oscille doucement
 *   0,85 s      les coordonnées apparaissent
 *   1,9 s       fondu vers le menu (0,38 s)
 *
 * Un tap saute l'intro. « Réduire les animations » = composition figée, fondu
 * court. Ne se joue qu'une fois par lancement (un remontage de l'arbre, par
 * exemple quand les polices arrivent après le délai, ne la rejoue pas).
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Polygon } from 'react-native-svg';

import { useTheme } from '../contexts/ThemeContext';
import { NATIVE_ANIM, useReducedMotion } from '../lib/motion';
import { useEventCallback } from '../lib/useEventCallback';
import { CoordLabel, GridLines } from '../theme/decorative';
import { FONTS } from '../theme/typography';
import { ScoreText } from './ScoreText';

/** La partition (ms depuis le montage). */
export const INTRO_CHOREO = {
  compass: 0,
  title: 450,
  rule: 700,
  coords: 850,
  /** Début du fondu vers l'app. */
  exit: 1900,
  fade: 380,
  /** Fondu court quand on saute l'intro ou en « réduire les animations ». */
  quickFade: 220,
  /** En « réduire les animations » : tout est visible, on part après ce délai. */
  reducedHold: 900,
} as const;

let playedThisLaunch = false;

/**
 * La barrière « l'intro est finie » : ce qui veut s'afficher au démarrage
 * (le tutoriel de bienvenue) attend qu'elle se soit fondue, sinon il
 * s'ouvrirait par-dessus. Résolue aussi quand l'intro n'est pas jouée (lien
 * web direct), et de toute façon après un délai de sécurité.
 */
const INTRO_SAFETY_MS = 5000;
let introDone = false;
let resolveIntroDone: () => void = () => {};
let introDonePromise = new Promise<void>((r) => {
  resolveIntroDone = r;
});
let safetyTimer: ReturnType<typeof setTimeout> | null = null;

export function markLaunchIntroDone(): void {
  introDone = true;
  if (safetyTimer) clearTimeout(safetyTimer);
  safetyTimer = null;
  resolveIntroDone();
}

export function whenLaunchIntroDone(): Promise<void> {
  if (!introDone && !safetyTimer) safetyTimer = setTimeout(markLaunchIntroDone, INTRO_SAFETY_MS);
  return introDonePromise;
}

/** Test : rejoue l'intro au prochain montage et réarme la barrière. */
export function __resetLaunchIntroForTests(): void {
  playedThisLaunch = false;
  introDone = false;
  if (safetyTimer) clearTimeout(safetyTimer);
  safetyTimer = null;
  introDonePromise = new Promise<void>((r) => {
    resolveIntroDone = r;
  });
}

interface LaunchIntroProps {
  /** Appelé une fois le fondu terminé : le parent démonte l'intro. */
  onDone: () => void;
}

/** Les couleurs de la rose des vents, tirées de l'icône de l'app. */
function compassPalette(isDark: boolean) {
  return {
    ochre: isDark ? '#e0a64a' : '#d99a3c',
    ochreDeep: isDark ? '#b07a2a' : '#8a5316',
    navy: isDark ? '#7aa0c4' : '#2d4a70',
    navyLight: isDark ? '#a9c6e0' : '#3a5a85',
    north: isDark ? '#3fa35c' : '#2a6e3f',
    bezel: isDark ? '#c4872a' : '#c4872a',
    ink: isDark ? '#dfe8f2' : '#2c1810',
  };
}

/** Pointe intercardinale : un losange couché sur la diagonale, et sa moitié sombre. */
const INTERCARDINAL = '0,0 26,-11 78,-78 11,-26';
const INTERCARDINAL_FACET = '0,0 78,-78 11,-26';
const CARDINAL = '0,-116 16,0 -16,0';
const FACET = '0,-116 16,0 0,0';

/** La rose des vents de l'icône, en SVG vectoriel (viewBox centrée). */
function CompassRoseLarge({ size, isDark, background }: { size: number; isDark: boolean; background: string }) {
  const p = compassPalette(isDark);
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30);
  const minorTicks = Array.from({ length: 12 }, (_, i) => 15 + i * 30);
  return (
    <Svg width={size} height={size} viewBox="-160 -160 320 320">
      <Circle r={140} fill="none" stroke={p.ink} strokeWidth={1.5} opacity={0.18} />
      <Circle r={140} fill="none" stroke={p.bezel} strokeWidth={5} opacity={0.5} />
      <G stroke={p.ink} opacity={0.45}>
        {ticks.map((a) => (
          <Line key={`t${a}`} x1={0} y1={-140} x2={0} y2={-130} strokeWidth={1.2} transform={`rotate(${a})`} />
        ))}
        {minorTicks.map((a) => (
          <Line key={`m${a}`} x1={0} y1={-140} x2={0} y2={-135} strokeWidth={0.7} opacity={0.7} transform={`rotate(${a})`} />
        ))}
      </G>
      <G fill={p.ochre}>
        {[0, 90, 180, 270].map((a) => (
          <Polygon key={`i${a}`} points={INTERCARDINAL} transform={`rotate(${a})`} />
        ))}
      </G>
      <G fill={p.ochreDeep} opacity={0.55}>
        {[0, 90, 180, 270].map((a) => (
          <Polygon key={`j${a}`} points={INTERCARDINAL_FACET} transform={`rotate(${a})`} />
        ))}
      </G>
      <G fill={p.navy}>
        {[90, 180, 270].map((a) => (
          <Polygon key={`c${a}`} points={CARDINAL} transform={`rotate(${a})`} />
        ))}
      </G>
      <G fill={p.navyLight} opacity={0.6}>
        {[90, 180, 270].map((a) => (
          <Polygon key={`f${a}`} points={FACET} transform={`rotate(${a})`} />
        ))}
      </G>
      <Polygon points={CARDINAL} fill={p.north} />
      <Polygon points={FACET} fill="#3d8a55" opacity={0.7} />
      <Circle r={11} fill={background} stroke={p.ink} strokeWidth={2} opacity={0.9} />
      <Circle r={4} fill={p.ink} opacity={0.8} />
    </Svg>
  );
}

export function LaunchIntro({ onDone }: LaunchIntroProps) {
  const { colors: c, isDarkMode } = useTheme();
  const rm = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const onDoneStable = useEventCallback(() => {
    markLaunchIntroDone();
    onDone();
  });

  // Déjà jouée pendant ce lancement (remontage de l'arbre) : on s'efface.
  const [skipped] = useState(() => {
    if (playedThisLaunch) return true;
    playedThisLaunch = true;
    return false;
  });

  const compass = useState(() => new Animated.Value(rm ? 1 : 0))[0];
  const title = useState(() => new Animated.Value(rm ? 1 : 0))[0];
  const rule = useState(() => new Animated.Value(rm ? 1 : 0))[0];
  const coords = useState(() => new Animated.Value(rm ? 1 : 0))[0];
  const wobble = useState(() => new Animated.Value(0))[0];
  const fade = useState(() => new Animated.Value(1))[0];

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const leaving = useRef(false);

  const leave = useEventCallback((fadeMs: number) => {
    if (leaving.current) return;
    leaving.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    wobble.stopAnimation();
    Animated.timing(fade, { toValue: 0, duration: fadeMs, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_ANIM }).start();
    // Minuterie plutôt que le rappel de fin d'animation : déterministe, même
    // sur le web où le pilote JS peut être ralenti.
    timers.current.push(setTimeout(() => onDoneStable(), fadeMs));
  });

  useEffect(() => {
    if (skipped) {
      onDoneStable();
      return;
    }
    if (rm) {
      const t = setTimeout(() => leave(INTRO_CHOREO.quickFade), INTRO_CHOREO.reducedHold);
      timers.current.push(t);
      return () => clearTimeout(t);
    }
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    const timing = (v: Animated.Value, duration: number, easing: (n: number) => number) =>
      Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: NATIVE_ANIM });

    at(INTRO_CHOREO.compass, () => timing(compass, 720, Easing.out(Easing.back(1.3))).start());
    at(INTRO_CHOREO.title, () => timing(title, 520, Easing.out(Easing.cubic)).start());
    at(INTRO_CHOREO.rule, () => {
      timing(rule, 560, Easing.out(Easing.cubic)).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(wobble, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_ANIM }),
          Animated.timing(wobble, { toValue: -1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_ANIM }),
          Animated.timing(wobble, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_ANIM }),
        ]),
      ).start();
    });
    at(INTRO_CHOREO.coords, () => timing(coords, 400, Easing.out(Easing.quad)).start());
    at(INTRO_CHOREO.exit, () => leave(INTRO_CHOREO.fade));

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      wobble.stopAnimation();
    };
    // Montage unique : la partition ne se rejoue pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (skipped) return null;

  const compassSize = Math.round(Math.min(width, height) * 0.36);
  const ruleWidth = Math.min(280, width - 80);

  return (
    <Animated.View
      style={[styles.fill, { backgroundColor: c.background, opacity: fade }]}
      accessibilityLabel="GeoGames"
      accessibilityRole="image"
      testID="launch-intro"
    >
      <Pressable style={styles.fill} onPress={() => leave(INTRO_CHOREO.quickFade)} accessible={false}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <GridLines width={width} height={height} color={isDarkMode ? 'rgba(122,160,196,0.10)' : 'rgba(196,168,122,0.18)'} />
        </View>

        <View pointerEvents="none" style={styles.center}>
          <Animated.View
            style={{
              opacity: compass.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
              transform: [
                { scale: compass.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
                { rotate: compass.interpolate({ inputRange: [0, 1], outputRange: ['-150deg', '0deg'] }) },
              ],
            }}
          >
            <Animated.View
              style={{
                transform: [{ rotate: wobble.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '4deg'] }) }],
              }}
            >
              <CompassRoseLarge size={compassSize} isDark={isDarkMode} background={c.background} />
            </Animated.View>
          </Animated.View>

          <Animated.View
            style={{
              marginTop: 22,
              alignItems: 'center',
              opacity: title,
              transform: [{ translateY: title.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) }],
            }}
          >
            <ScoreText style={{ fontFamily: FONTS.headingBlack, fontSize: 46, color: c.text, letterSpacing: -1 }}>
              GeoGames
            </ScoreText>
          </Animated.View>

          <Animated.View
            style={{
              marginTop: 10,
              height: 1,
              width: ruleWidth,
              backgroundColor: c.border,
              opacity: rule.interpolate({ inputRange: [0, 1], outputRange: [0, 0.8] }),
              transform: [{ scaleX: rule }],
            }}
          />

          <Animated.View
            style={{
              marginTop: 10,
              opacity: coords,
              transform: [{ translateY: coords.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }}
          >
            <CoordLabel lat="48°N" lng="2°E" color={c.textFaint} size={11} />
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
});

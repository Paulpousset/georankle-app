/**
 * First-launch onboarding tour — "visite guidée" / spotlight style.
 *
 * A full-screen overlay that walks a brand-new player through the app in ~1 min.
 * Each step dims the screen and spotlights a real element of the menu (the modes,
 * the daily challenge, the profile/shop/friends buttons) with a small callout
 * bubble + "Suivant". When a target isn't on screen (e.g. the Shop icon is
 * hidden for logged-out users) the step gracefully falls back to a centered card.
 *
 * Geometry comes from the host screen via `measureTarget` (measureInWindow), so
 * the overlay must cover the whole window — we render it in a <Modal> whose
 * coordinates line up 1:1 with measureInWindow's window coordinates.
 */
import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Compass, LayoutGrid, ShoppingBag, Sparkles, Trophy, User } from 'lucide-react-native';

import { tr } from '../i18n';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, announce } from '../lib/a11y';

export interface TutorialRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TutorialStep {
  id: string;
  icon: ComponentType<{ color: string; size: number }>;
  accent: string;
  titleFr: string;
  titleEn: string;
  bodyFr: string;
  bodyEn: string;
  /** Key passed to `measureTarget`; null → centered card (no spotlight). */
  targetId: string | null;
}

const DAILY_FLAME = '#e8772e';

/**
 * The 7 steps of the tour. `targetId`s map to refs registered by the host
 * screen (see MainMenu's `measureTarget`).
 */
export const ONBOARDING_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    icon: Compass,
    accent: PALETTE.vermilion,
    targetId: null,
    titleFr: 'Bienvenue sur GeoGames',
    titleEn: 'Welcome to GeoGames',
    bodyFr: 'Classez, devinez et explorez le monde. Voici un tour rapide en 1 minute — vous pouvez le passer à tout moment.',
    bodyEn: "Rank, guess and explore the world. Here's a quick one-minute tour — you can skip it anytime.",
  },
  {
    id: 'modes',
    icon: LayoutGrid,
    accent: PALETTE.forestGreen,
    targetId: 'modes',
    titleFr: 'Trois façons de jouer',
    titleEn: 'Three ways to play',
    bodyFr: 'En Solo à votre rythme, en Local entre amis sur le même appareil, ou En Ligne contre des joueurs du monde entier.',
    bodyEn: 'Solo at your own pace, Local with friends on one device, or Online against players worldwide.',
  },
  {
    id: 'daily',
    icon: CalendarDays,
    accent: DAILY_FLAME,
    targetId: 'daily',
    titleFr: 'Le Défi du Jour',
    titleEn: 'Daily Challenge',
    bodyFr: 'Un nouveau puzzle pour chaque mode, chaque jour. Jouez quotidiennement pour entretenir votre série.',
    bodyEn: 'A fresh puzzle for every mode, every day. Play daily to keep your streak alive.',
  },
  {
    id: 'profile',
    icon: User,
    accent: PALETTE.oceanBlue,
    targetId: 'profile',
    titleFr: 'Votre profil',
    titleEn: 'Your profile',
    bodyFr: 'Suivez vos statistiques, votre progression et vos succès — tout est ici, en haut à gauche.',
    bodyEn: "Track your stats, progress and achievements — it's all here, top-left.",
  },
  {
    id: 'shop',
    icon: ShoppingBag,
    accent: PALETTE.sand,
    targetId: 'shop',
    titleFr: 'La Boutique',
    titleEn: 'The Shop',
    bodyFr: 'Gagnez des pièces en jouant, puis personnalisez votre globe : skins, orbites, emblèmes et satellites.',
    bodyEn: 'Earn coins as you play, then customize your globe: skins, orbits, emblems and satellites.',
  },
  {
    id: 'friends',
    icon: Trophy,
    accent: PALETTE.sand,
    targetId: 'friends',
    titleFr: 'Amis & Classé',
    titleEn: 'Friends & Ranked',
    bodyFr: 'Ajoutez des amis et défiez-les. En mode Classé, grimpez du Bronze jusqu’au rang Maître.',
    bodyEn: 'Add friends and challenge them. In Ranked, climb from Bronze all the way to Master.',
  },
  {
    id: 'ready',
    icon: Sparkles,
    accent: PALETTE.forestGreen,
    targetId: null,
    titleFr: 'Prêt à jouer ?',
    titleEn: 'Ready to play?',
    bodyFr: 'Commencez par le Défi du Jour ou un mode Solo. Bonne exploration, géographe !',
    bodyEn: 'Start with the Daily Challenge or a Solo mode. Happy exploring!',
  },
];

interface OnboardingTutorialProps {
  visible: boolean;
  steps: TutorialStep[];
  /** Resolve the on-screen rect of a target (window coords), or null if absent. */
  measureTarget: (targetId: string) => Promise<TutorialRect | null>;
  onFinish: () => void;
}

const SPOTLIGHT_PAD = 10;
const CARD_WIDTH = 290;

export function OnboardingTutorial({ visible, steps, measureTarget, onFinish }: OnboardingTutorialProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<TutorialRect | null>(null);
  // Guards against a slow measurement landing after the user already advanced.
  const measureSeq = useRef(0);

  // Measure the current step's target (or clear it for centered steps) and
  // announce the step to screen readers. `apply` funnels every rect update so
  // it's recognised as external-system (layout) sync, not a render-time write.
  useEffect(() => {
    if (!visible) return;
    const current = steps[step];
    if (!current) return;
    const seq = ++measureSeq.current;
    const apply = (r: TutorialRect | null) => {
      if (seq === measureSeq.current) setRect(r);
    };
    if (!current.targetId) apply(null);
    else measureTarget(current.targetId).then(apply);
    announce(tr(language, current.titleFr, current.titleEn));
  }, [visible, step, steps, measureTarget, language]);

  if (!visible || steps.length === 0) return null;

  const s = steps[step];
  const isLast = step === steps.length - 1;
  const dim = isDarkMode ? 'rgba(4,9,18,0.74)' : 'rgba(40,24,8,0.55)';

  const goNext = () => {
    if (isLast) onFinish();
    else setStep((p) => p + 1);
  };

  // Spotlight rect padded out a touch from the real element.
  const ring = rect
    ? {
        x: rect.x - SPOTLIGHT_PAD,
        y: rect.y - SPOTLIGHT_PAD,
        w: rect.width + SPOTLIGHT_PAD * 2,
        h: rect.height + SPOTLIGHT_PAD * 2,
      }
    : null;

  // Place the callout below the target when it sits in the top ~45% of the
  // screen, otherwise above it.
  const placeBelow = ring ? ring.y < screenH * 0.45 : true;
  const cardLeft = ring
    ? Math.min(Math.max(ring.x + ring.w / 2 - CARD_WIDTH / 2, 12), screenW - CARD_WIDTH - 12)
    : (screenW - CARD_WIDTH) / 2;
  const arrowLeft = ring ? Math.min(Math.max(ring.x + ring.w / 2 - cardLeft - 9, 18), CARD_WIDTH - 36) : 0;

  const Icon = s.icon;
  const nextLabel = isLast ? tr(language, 'Commencer', 'Start') : tr(language, 'Suivant', 'Next');

  const cardStyle = {
    width: CARD_WIDTH,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  } as const;

  const cardInner = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: s.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon color="#fff" size={20} />
        </View>
        <Text style={{ flex: 1, fontFamily: FONTS.heading, fontSize: 17, color: c.text }}>
          {tr(language, s.titleFr, s.titleEn)}
        </Text>
      </View>
      <Text style={{ fontFamily: FONTS.mono, fontSize: 12, lineHeight: 19, color: c.textMuted, marginBottom: 16 }}>
        {tr(language, s.bodyFr, s.bodyEn)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {steps.map((stepDef, i) => (
            <View
              key={stepDef.id}
              style={{
                width: i === step ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === step ? s.accent : c.border,
              }}
            />
          ))}
        </View>
        <TouchableOpacity
          onPress={goNext}
          style={{ backgroundColor: s.accent, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 18 }}
          {...a11yButton(nextLabel)}
        >
          <Text style={{ fontFamily: FONTS.monoBold, fontSize: 12.5, color: '#fff' }}>{nextLabel}</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFinish} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        {/* ---- dimmed backdrop (with a hole when there's a spotlight) ---- */}
        {ring ? (
          <>
            <View style={{ position: 'absolute', left: 0, top: 0, right: 0, height: Math.max(ring.y, 0), backgroundColor: dim }} />
            <View style={{ position: 'absolute', left: 0, top: ring.y + ring.h, right: 0, bottom: 0, backgroundColor: dim }} />
            <View style={{ position: 'absolute', left: 0, top: ring.y, width: Math.max(ring.x, 0), height: ring.h, backgroundColor: dim }} />
            <View style={{ position: 'absolute', left: ring.x + ring.w, top: ring.y, right: 0, height: ring.h, backgroundColor: dim }} />
            {/* highlight ring around the real element */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: ring.x,
                top: ring.y,
                width: ring.w,
                height: ring.h,
                borderRadius: 14,
                borderWidth: 2.5,
                borderColor: s.accent,
              }}
            />
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: dim }]} />
        )}

        {/* ---- skip ("Passer") — always reachable, hidden on the last step ---- */}
        {!isLast && (
          <TouchableOpacity
            onPress={onFinish}
            style={{
              position: 'absolute',
              top: insets.top + 8,
              right: 14,
              backgroundColor: 'rgba(0,0,0,0.32)',
              borderRadius: 12,
              paddingVertical: 7,
              paddingHorizontal: 13,
            }}
            {...a11yButton(tr(language, 'Passer le tutoriel', 'Skip tutorial'))}
          >
            <Text style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#fff' }}>
              {tr(language, 'Passer', 'Skip')}
            </Text>
          </TouchableOpacity>
        )}

        {/* ---- callout card ---- */}
        {ring ? (
          <View
            style={[
              cardStyle,
              {
                position: 'absolute',
                left: cardLeft,
                ...(placeBelow ? { top: ring.y + ring.h + 14 } : { bottom: screenH - ring.y + 14 }),
              },
            ]}
          >
            {/* triangle pointer toward the target */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: arrowLeft,
                ...(placeBelow
                  ? {
                      top: -8,
                      borderLeftWidth: 9,
                      borderRightWidth: 9,
                      borderBottomWidth: 9,
                      borderLeftColor: 'transparent',
                      borderRightColor: 'transparent',
                      borderBottomColor: c.card,
                    }
                  : {
                      bottom: -8,
                      borderLeftWidth: 9,
                      borderRightWidth: 9,
                      borderTopWidth: 9,
                      borderLeftColor: 'transparent',
                      borderRightColor: 'transparent',
                      borderTopColor: c.card,
                    }),
                width: 0,
                height: 0,
              }}
            />
            {cardInner}
          </View>
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 12 }]}>
            <View style={cardStyle}>{cardInner}</View>
          </View>
        )}
      </View>
    </Modal>
  );
}

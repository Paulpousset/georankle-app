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
import { CalendarDays, Compass, LayoutGrid, ShoppingBag, Sparkles, Target, User, Users } from 'lucide-react-native';

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
 * The steps of the tour. `targetId`s map to refs registered by the host screen
 * (see MainMenu's `measureTarget`); a null target shows a centered card.
 *
 * The copy is written for someone who has never seen the app before: each step
 * says plainly what the thing is AND what to do with it. The `howto` step covers
 * the one question a newcomer always has — "what do I actually do in a game?".
 */
export const ONBOARDING_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    icon: Compass,
    accent: PALETTE.vermilion,
    targetId: null,
    titleFr: 'Bienvenue sur GeoGames !',
    titleEn: 'Welcome to GeoGames!',
    bodyFr:
      'GeoGames réunit des mini-jeux de géographie : classez des pays, devinez des drapeaux, trouvez des lieux sur le globe. Ce petit tour de 30 secondes vous montre l’essentiel — et vous pourrez le revoir quand vous voulez depuis votre Profil.',
    bodyEn:
      'GeoGames is a set of short geography games: rank countries, guess flags, find places on the globe. This 30-second tour shows you the essentials — and you can replay it anytime from your Profile.',
  },
  {
    id: 'howto',
    icon: Target,
    accent: PALETTE.oceanBlue,
    targetId: null,
    titleFr: 'Comment on joue',
    titleEn: 'How you play',
    bodyFr:
      'Chaque partie enchaîne quelques manches rapides. Selon le jeu, vous tapez, choisissez ou placez votre réponse. Plus vous êtes précis, plus vous marquez de points. Pas de chrono stressant : la première fois que vous ouvrez un jeu, ses règles s’affichent automatiquement.',
    bodyEn:
      'Every game is a few quick rounds. Depending on the game you tap, pick or place your answer. The more accurate you are, the more points you earn. No stressful timer — and the first time you open a game, its rules pop up automatically.',
  },
  {
    id: 'modes',
    icon: LayoutGrid,
    accent: PALETTE.forestGreen,
    targetId: 'modes',
    titleFr: 'Trois façons de jouer',
    titleEn: 'Three ways to play',
    bodyFr:
      'Commencez par Solo pour découvrir tous les jeux à votre rythme. Local se joue à plusieurs sur le même téléphone, et En Ligne vous oppose à d’autres joueurs du monde entier.',
    bodyEn:
      'Start with Solo to discover every game at your own pace. Local is for several players on one phone, and Online pits you against players from around the world.',
  },
  {
    id: 'daily',
    icon: CalendarDays,
    accent: DAILY_FLAME,
    targetId: 'daily',
    titleFr: 'Le Défi du Jour',
    titleEn: 'Daily Challenge',
    bodyFr:
      'Chaque jour, un nouveau puzzle pour chaque mode. Revenez quotidiennement pour allonger votre série : c’est le moyen le plus simple de progresser un peu chaque jour.',
    bodyEn:
      'Every day brings a fresh puzzle for each mode. Come back daily to grow your streak — the easiest way to improve a little every day.',
  },
  {
    id: 'profile',
    icon: User,
    accent: PALETTE.oceanBlue,
    targetId: 'profile',
    titleFr: 'Votre profil',
    titleEn: 'Your profile',
    bodyFr:
      'Ici, en haut à gauche : votre pseudo, votre avatar, vos statistiques et vos records. Connectez-vous pour sauvegarder votre progression et jouer en ligne.',
    bodyEn:
      'Here, top-left: your name, avatar, stats and records. Sign in to save your progress and play online.',
  },
  {
    id: 'shop',
    icon: ShoppingBag,
    accent: PALETTE.sand,
    targetId: 'shop',
    titleFr: 'La Boutique',
    titleEn: 'The Shop',
    bodyFr:
      'En jouant, vous gagnez des pièces. Dépensez-les dans la Boutique pour personnaliser votre globe : couleurs, orbites, emblèmes et satellites.',
    bodyEn:
      'As you play, you earn coins. Spend them in the Shop to customize your globe: colors, orbits, emblems and satellites.',
  },
  {
    id: 'friends',
    icon: Users,
    accent: PALETTE.vermilion,
    targetId: 'friends',
    titleFr: 'Amis & Classé',
    titleEn: 'Friends & Ranked',
    bodyFr:
      'Ajoutez des amis pour les défier directement. Et en mode Classé, vos victoires vous font gagner des points ELO et grimper les rangs, du Bronze jusqu’au Maître.',
    bodyEn:
      'Add friends to challenge them directly. And in Ranked, your wins earn ELO points and climb the ranks, from Bronze all the way to Master.',
  },
  {
    id: 'ready',
    icon: Sparkles,
    accent: PALETTE.forestGreen,
    targetId: null,
    titleFr: 'À vous de jouer !',
    titleEn: 'Your turn to play!',
    bodyFr:
      'Le plus simple pour démarrer : appuyez sur Solo, choisissez un jeu, et laissez-vous guider. Bonne exploration, géographe !',
    bodyEn:
      'The easiest way to start: tap Solo, pick a game, and follow the on-screen guide. Happy exploring!',
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

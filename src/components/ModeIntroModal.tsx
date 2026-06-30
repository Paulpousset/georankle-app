/**
 * First-play "how to play" popup for each game mode.
 *
 * `ModeIntroGate` is a self-contained controller: give it the mode the player is
 * currently in (or null on the menu / lobby screens) and, the first time that
 * mode has no "seen" flag, it pops a single explanatory card over the game. The
 * primary button marks the mode seen so it never shows again — the per-mode
 * sibling of the first-launch onboarding tour.
 *
 * Rendered once at the app root as a sibling of the Router; because it's a
 * <Modal> it floats above whichever game screen is mounted. The games score on
 * guesses/answers, not wall-clock time, so reading the card costs no points.
 */
import { useEffect, useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';

import { tr } from '../i18n';
import type { GameMode } from '../types';
import { MODE_INTROS } from '../data/modeIntros';
import { hasSeenModeIntro, setModeIntroSeen } from '../lib/modeIntro';
import { track } from '../lib/analytics';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, a11yImage, announce } from '../lib/a11y';

interface ModeIntroGateProps {
  /** The mode currently being played, or null when not in a game. */
  mode: GameMode | null;
}

export function ModeIntroGate({ mode }: ModeIntroGateProps) {
  // Which mode's intro is on screen right now (null = nothing showing).
  const [shown, setShown] = useState<GameMode | null>(null);

  // When the active mode changes, resolve what (if anything) to show: the intro
  // for an unseen mode, or null (no intro, already seen, or back on the menu —
  // which also closes any stale card). Every write goes through this async
  // callback — recognised as external-system (storage) sync, not a render-time
  // write — and a cancel flag drops a slow lookup that lands after the player
  // already moved on, so a card can't pop over the wrong screen.
  useEffect(() => {
    let cancelled = false;
    const resolve = async (): Promise<GameMode | null> => {
      if (!mode || !MODE_INTROS[mode]) return null;
      return (await hasSeenModeIntro(mode)) ? null : mode;
    };
    resolve().then((next) => {
      if (!cancelled) setShown(next);
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const dismiss = () => {
    if (shown) {
      setModeIntroSeen(shown);
      track('mode_intro_seen', { mode: shown });
    }
    setShown(null);
  };

  return <ModeIntroCard mode={shown} onDismiss={dismiss} />;
}

interface ModeIntroCardProps {
  mode: GameMode | null;
  onDismiss: () => void;
}

function ModeIntroCard({ mode, onDismiss }: ModeIntroCardProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const intro = mode ? MODE_INTROS[mode] : undefined;

  // Announce the mode to screen readers when the card opens.
  useEffect(() => {
    if (intro) announce(tr(language, intro.titleFr, intro.titleEn));
  }, [intro, language]);

  if (!intro) return null;
  const Icon = intro.icon;
  const gotIt = tr(language, 'J’ai compris', 'Got it');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 20,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 350,
            backgroundColor: c.card,
            borderRadius: 24,
            padding: 24,
            borderWidth: 1,
            borderColor: c.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          {/* ---- header: accent icon + title ---- */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <View
              {...a11yImage(tr(language, intro.titleFr, intro.titleEn))}
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: intro.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon color="#fff" size={24} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10, letterSpacing: 1, marginBottom: 2 }}>
                {tr(language, 'COMMENT JOUER', 'HOW TO PLAY')}
              </Text>
              <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 19, color: c.text }}>
                {tr(language, intro.titleFr, intro.titleEn)}
              </Text>
            </View>
          </View>

          {/* ---- blurb ---- */}
          <Text style={{ fontFamily: FONTS.mono, fontSize: 13.5, lineHeight: 21, color: c.textMuted, marginBottom: 16 }}>
            {tr(language, intro.bodyFr, intro.bodyEn)}
          </Text>

          {/* ---- the rules that matter ---- */}
          <View
            style={{
              backgroundColor: c.surface,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: c.border,
              padding: 14,
              gap: 10,
              marginBottom: 20,
            }}
          >
            {intro.tips.map((tip) => (
              <View key={tip.en} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: intro.accent, marginTop: 6 }} />
                <Text style={{ flex: 1, fontFamily: FONTS.mono, fontSize: 12, lineHeight: 18, color: c.textMuted }}>
                  {tr(language, tip.fr, tip.en)}
                </Text>
              </View>
            ))}
          </View>

          {/* ---- dismiss: marks the mode seen so this never shows again ---- */}
          <TouchableOpacity
            onPress={onDismiss}
            style={{ backgroundColor: intro.accent, paddingVertical: 14, borderRadius: 14, alignItems: 'center' }}
            {...a11yButton(gotIt, {
              hint: tr(language, 'Ne plus afficher cette explication', 'Don’t show this explanation again'),
            })}
          >
            <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 14 }}>{gotIt}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

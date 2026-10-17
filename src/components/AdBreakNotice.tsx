/**
 * Full-screen "ad break" card shown for a few seconds before an interstitial:
 * a 3-2-1 countdown and a word on why there's an ad. Mounted once at the root;
 * announceAdBreak() (src/lib/adBreak.ts) opens it and waits for the countdown.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';

import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { tr } from '../i18n';
import { AD_BREAK_COUNTDOWN_S, setAdBreakHandler } from '../lib/adBreak';

export function AdBreakNotice() {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [left, setLeft] = useState<number | null>(null);
  const done = useRef<(() => void) | null>(null);

  const open = useCallback(
    () =>
      new Promise<void>((resolve) => {
        done.current = resolve;
        setLeft(AD_BREAK_COUNTDOWN_S);
      }),
    [],
  );

  useEffect(() => {
    setAdBreakHandler(open);
    return () => setAdBreakHandler(null);
  }, [open]);

  useEffect(() => {
    if (left === null) return;
    const id = setTimeout(() => {
      if (left > 1) {
        setLeft(left - 1);
        return;
      }
      setLeft(null);
      done.current?.();
      done.current = null;
    }, 1000);
    return () => clearTimeout(id);
  }, [left]);

  if (left === null) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.background,
          paddingHorizontal: 32,
        }}
      >
        <Text
          style={{ color: c.textMuted, fontFamily: FONTS.monoBold, fontSize: 13, letterSpacing: 2 }}
        >
          {tr(language, 'PETITE PAUSE PUB', 'QUICK AD BREAK')}
        </Text>
        <Text
          style={{
            color: c.accent,
            fontFamily: FONTS.headingBlack,
            fontSize: 96,
            marginVertical: 12,
          }}
        >
          {left}
        </Text>
        <Text
          style={{
            color: c.text,
            fontFamily: FONTS.mono,
            fontSize: 15,
            textAlign: 'center',
            lineHeight: 22,
          }}
        >
          {tr(
            language,
            'Environ 5 secondes de pub pour soutenir le jeu ;)',
            'About 5 seconds of ads to support the game ;)',
          )}
        </Text>
      </View>
    </Modal>
  );
}

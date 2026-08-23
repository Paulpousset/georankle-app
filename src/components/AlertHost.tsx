/**
 * The app's own alert dialog — the web replacement for `window.confirm`.
 *
 * `showAlert` (src/lib/alert.ts) used to degrade to `window.alert` /
 * `window.confirm` on web, which draws the BROWSER's dialog: a white Chrome box
 * with blue "Cancel / OK", pasted on top of a parchment atlas and speaking the
 * browser's own language instead of the app's ("OK" for "Boutique"). This host
 * renders the same request as a themed modal, so a confirmation looks like the
 * rest of the game and says what the button actually does.
 *
 * Mounted once at the root; `showAlert` reaches it through a module-level
 * handler (src/lib/alert.ts), so any screen can raise a dialog without a
 * context or a prop. Native keeps the real OS Alert — nothing routes here.
 *
 * Requests are queued: a second alert raised while one is up waits its turn
 * rather than replacing it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type AlertButton,
} from 'react-native';

import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { tr } from '../i18n';
import { a11yButton } from '../lib/a11y';
import { setAlertHandler, type AlertRequest } from '../lib/alert';

/** A dialog with no buttons still needs a way out. */
function withFallbackButton(buttons: AlertButton[] | undefined, ok: string): AlertButton[] {
  return buttons && buttons.length > 0 ? buttons : [{ text: ok }];
}

export function AlertHost() {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [queue, setQueue] = useState<AlertRequest[]>([]);
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    setAlertHandler((req) => setQueue((prev) => [...prev, req]));
    return () => setAlertHandler(null);
  }, []);

  const current = queue[0] ?? null;
  const buttons = useMemo(
    () => withFallbackButton(current?.buttons, tr(language, 'OK', 'OK')),
    [current, language],
  );

  const run = useCallback((btn: AlertButton | undefined) => {
    setQueue((prev) => prev.slice(1));
    btn?.onPress?.();
  }, []);

  // Escape closes (the cancel button, or the only button), Enter confirms —
  // what the browser dialog gave for free and a custom one has to earn back.
  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const primaryBtn = buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];
  const dismissBtn = cancelBtn ?? (buttons.length === 1 ? buttons[0] : undefined);
  useEffect(() => {
    if (!current || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissBtn) {
        e.preventDefault();
        run(dismissBtn);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        run(primaryBtn);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current, dismissBtn, primaryBtn, run]);

  useEffect(() => {
    if (!current) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [current, anim]);

  if (!current) return null;

  // Two short buttons sit side by side; three, or a wordy one, stack — a row of
  // truncated labels is exactly the confusion a confirmation must not create.
  const stacked = buttons.length > 2 || buttons.some((b) => (b.text ?? '').length > 14);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => run(dismissBtn)}>
      <Pressable
        style={styles.backdrop}
        onPress={() => dismissBtn && run(dismissBtn)}
        {...(dismissBtn ? a11yButton(tr(language, 'Fermer', 'Close')) : {})}
      >
        <Animated.View
          style={{
            width: '100%',
            maxWidth: 420,
            opacity: anim,
            transform: [
              { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
            ],
          }}
        >
          <Pressable
            accessibilityViewIsModal
            accessibilityRole="alert"
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.card,
              // Raised above the page in BOTH themes: parchment sits above the
              // tinted cards in light, and the night surface above the deep
              // navy page in dark (where `background` would just melt into it).
              { backgroundColor: isDarkMode ? c.surface : c.background, borderColor: c.border },
            ]}
          >
            <Text style={[styles.title, { color: c.text }]}>{current.title}</Text>
            {current.message ? (
              <Text style={[styles.message, { color: c.textMuted }]}>{current.message}</Text>
            ) : null}

            <View style={[styles.actions, stacked ? styles.actionsStacked : styles.actionsRow]}>
              {buttons.map((b, i) => {
                const isCancel = b.style === 'cancel';
                const isDestructive = b.style === 'destructive';
                const label = b.text ?? tr(language, 'OK', 'OK');
                return (
                  <TouchableOpacity
                    key={`${label}-${i}`}
                    onPress={() => run(b)}
                    style={[
                      styles.btn,
                      stacked ? styles.btnStacked : styles.btnRow,
                      isCancel
                        ? { backgroundColor: c.surface, borderColor: c.border }
                        : {
                            backgroundColor: isDestructive ? PALETTE.dangerRed : c.accentStrong,
                            borderColor: isDestructive ? PALETTE.dangerRed : c.accentStrong,
                          },
                    ]}
                    {...a11yButton(label)}
                  >
                    <Text
                      style={[styles.btnText, { color: isCancel ? c.textMuted : '#fff' }]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,12,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 12,
  },
  title: { fontSize: 18, fontFamily: FONTS.headingBlack, lineHeight: 24 },
  message: { fontSize: 13, fontFamily: FONTS.mono, lineHeight: 20, marginTop: 10 },
  actions: { marginTop: 20, gap: 10 },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  actionsStacked: { flexDirection: 'column' },
  btn: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRow: { minWidth: 108 },
  btnStacked: { width: '100%' },
  btnText: { fontSize: 13, fontFamily: FONTS.monoBold },
});

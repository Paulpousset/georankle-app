import { Component, type ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { log } from '../lib/log';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import type { Language } from '../types';

interface InnerProps {
  children: ReactNode;
  /** When this value changes the boundary clears its error (e.g. on navigation). */
  resetKey: string;
  /** Called by the recovery button to return the app to a safe state. */
  onReset: () => void;
  colors: ReturnType<typeof getColors>;
  language: Language;
}

type State = { error: Error | null };

/**
 * Per-screen recovery boundary. Unlike the root {@link ErrorBoundary} (which
 * shows a raw startup-error dump), this catches a crash inside one screen and
 * offers a themed "back to menu" recovery so a single broken screen never bricks
 * the whole app. It also auto-clears when navigation changes `resetKey`, so the
 * user can simply navigate away.
 */
class ScreenErrorBoundaryInner extends Component<InnerProps, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    log.error('Screen crashed:', error);
  }

  override componentDidUpdate(prev: InnerProps) {
    // Navigating to a different screen clears a stale error automatically.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset();
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const c = this.props.colors;
    const language = this.props.language;
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
        <Text style={{ color: c.text, fontSize: 20, fontFamily: FONTS.headingBlack, textAlign: 'center' }}>
          {tr(language, 'Oups, cet écran a planté', 'Oops, this screen crashed')}
        </Text>
        <Text style={{ color: c.textMuted, fontSize: 13, fontFamily: FONTS.mono, textAlign: 'center' }}>
          {tr(
            language,
            'Tu peux revenir au menu et réessayer. Rien n’est perdu.',
            'You can go back to the menu and try again. Nothing is lost.',
          )}
        </Text>
        <TouchableOpacity
          onPress={this.handleReset}
          accessibilityRole="button"
          style={{ backgroundColor: c.accent, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 }}
        >
          <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 15 }}>
            {tr(language, 'Retour au menu', 'Back to menu')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
}

/** Theme/language-aware wrapper around the class boundary. */
export function ScreenErrorBoundary({
  children,
  resetKey,
  onReset,
}: {
  children: ReactNode;
  resetKey: string;
  onReset: () => void;
}) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  return (
    <ScreenErrorBoundaryInner
      resetKey={resetKey}
      onReset={onReset}
      colors={getColors(isDarkMode)}
      language={language}
    >
      {children}
    </ScreenErrorBoundaryInner>
  );
}

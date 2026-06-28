import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Appearance } from 'react-native';
import { getColors, type ThemeColors } from '../theme/colors';
import { track } from '../lib/analytics';

interface ThemeContextValue {
  isDarkMode: boolean;
  /** Derived palette for the current mode (memoized; replaces ad-hoc getColors calls). */
  colors: ThemeColors;
  /** Flip dark/light and report the change to analytics. */
  toggleTheme: () => void;
  /** Escape hatch for the rare caller that needs a functional/explicit set. */
  setIsDarkMode: Dispatch<SetStateAction<boolean>>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(Appearance.getColorScheme() === 'dark');
  const colors = useMemo(() => getColors(isDarkMode), [isDarkMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      isDarkMode,
      colors,
      setIsDarkMode,
      toggleTheme: () =>
        setIsDarkMode((prev) => {
          track('theme_toggled', { dark: !prev });
          return !prev;
        }),
    }),
    [isDarkMode, colors],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const STORAGE_KEY = 'theme:v1';

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Fall back to the OS preference until a stored choice is restored below.
  const [isDarkMode, setIsDarkMode] = useState(Appearance.getColorScheme() === 'dark');
  const hydrated = useRef(false);
  const colors = useMemo(() => getColors(isDarkMode), [isDarkMode]);

  // Restore the last chosen theme; before this lands the app follows the OS
  // colour scheme, exactly like the pre-persistence behaviour.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'dark' || stored === 'light') setIsDarkMode(stored === 'dark');
      })
      .catch(() => {})
      .finally(() => {
        hydrated.current = true;
      });
  }, []);

  useEffect(() => {
    // Don't persist the initial OS-derived value before hydration has had a
    // chance to restore a stored choice — the write could race ahead of the read.
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, isDarkMode ? 'dark' : 'light').catch(() => {});
  }, [isDarkMode]);

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

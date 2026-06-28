import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { Language } from '../types';
import { tr } from '../i18n';
import { track } from '../lib/analytics';

interface LanguageContextValue {
  language: Language;
  /** `t(fr, en)` — shorthand for `tr(language, fr, en)`, no need to thread `language`. */
  t: (fr: string, en: string) => string;
  /** Flip fr/en and report the change to analytics. */
  toggleLanguage: () => void;
  /** Escape hatch for the rare caller that needs a functional/explicit set. */
  setLanguage: Dispatch<SetStateAction<Language>>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('fr');

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (fr: string, en: string) => tr(language, fr, en),
      toggleLanguage: () =>
        setLanguage((prev) => {
          const next = prev === 'fr' ? 'en' : 'fr';
          track('language_toggled', { language: next });
          return next;
        }),
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

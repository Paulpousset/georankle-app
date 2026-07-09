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
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Language } from '../types';
import { tr } from '../i18n';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';

/**
 * Best-effort persist of the language onto the profile so server-built push
 * texts (notify-invite / notify-friend-request) reach the RECIPIENT in their
 * own language. No-op when logged out.
 */
function persistPushLang(lang: Language): void {
  supabase.auth
    .getUser()
    .then(({ data }) => {
      const id = data.user?.id;
      if (!id) return;
      return supabase.from('profiles').update({ push_lang: lang }).eq('id', id);
    })
    .then(undefined, () => {});
}

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

const STORAGE_KEY = 'lang:v1';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('fr');
  const hydrated = useRef(false);

  // Restore the last chosen language; before this lands the app renders in
  // French, exactly like the pre-persistence behaviour.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'fr' || stored === 'en') setLanguage(stored);
      })
      .catch(() => {})
      .finally(() => {
        hydrated.current = true;
      });
  }, []);

  useEffect(() => {
    // Don't write the initial 'fr' before hydration has had a chance to
    // restore a stored 'en' — the write could race ahead of the read.
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, language).catch(() => {});
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (fr: string, en: string) => tr(language, fr, en),
      toggleLanguage: () =>
        setLanguage((prev) => {
          const next = prev === 'fr' ? 'en' : 'fr';
          track('language_toggled', { language: next });
          persistPushLang(next);
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

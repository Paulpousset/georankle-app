import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import type { Language } from '../types';
import { tr } from '../i18n';
import { isLanguage, matchLanguage } from '../i18n/locales';
import * as Font from 'expo-font';
import { fontMapFor, sameScript } from '../lib/appFonts';
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
  t: (fr: string, en: string, args?: readonly unknown[]) => string;
  /** Choisit une langue et la mémorise (écran/modale de sélection). */
  chooseLanguage: (next: Language) => void;
  /** Escape hatch for the rare caller that needs a functional/explicit set. */
  setLanguage: Dispatch<SetStateAction<Language>>;
  /** Ouvre la modale de choix de langue (montée par le Router). */
  openLanguagePicker: () => void;
  /** Ferme la modale. */
  closeLanguagePicker: () => void;
  /** `true` tant que la modale est ouverte. */
  languagePickerOpen: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'lang:v1';

/**
 * Sur le web, la langue portée par l'URL : `/es/play` doit ouvrir le jeu en
 * espagnol, même sur un navigateur configuré en anglais.
 *
 * Le site publie une page par langue (`/es/`, `/th/`, …) et chacune envoie
 * vers son propre `/xx/play` ; sans ce raccord, un lecteur arrivé par la page
 * espagnole verrait le jeu s'ouvrir dans la langue de son navigateur. Le
 * français est à la racine et n'a donc pas de préfixe : `/play` retombe sur la
 * langue de l'appareil, ce qui est le comportement voulu.
 */
function urlLanguage(): Language | null {
  if (Platform.OS !== 'web') return null;
  try {
    const prefix = /^\/([a-z]{2})(?:\/|$)/.exec(window.location.pathname)?.[1];
    return isLanguage(prefix) ? prefix : null;
  } catch {
    return null;
  }
}

/**
 * La langue du premier lancement : celle de l'URL sur le web, sinon celle de
 * l'appareil si l'app la parle, anglais en dernier recours. Le français n'est
 * plus le défaut universel — il l'était quand l'app ne parlait que deux langues.
 */
function deviceLanguage(): Language {
  const fromUrl = urlLanguage();
  if (fromUrl) return fromUrl;
  try {
    const tags = getLocales().flatMap((locale) => [locale.languageTag, locale.languageCode]);
    return matchLanguage(tags) ?? 'en';
  } catch {
    return 'en';
  }
}

/**
 * La langue mémorisée, ou celle de l'appareil au premier lancement.
 *
 * Exportée parce que `App.tsx` en a besoin **avant** de monter les providers :
 * les polices à charger dépendent de l'écriture de la langue.
 */
export async function readStoredLanguage(): Promise<Language> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : deviceLanguage();
  } catch {
    return deviceLanguage();
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Départ sur la langue de l'appareil, pas sur le français : `getLocales()`
  // est synchrone, alors que la langue mémorisée arrive un tour plus tard — sans
  // ça un joueur thaï verrait l'app s'ouvrir en français à chaque lancement.
  const [language, setLanguage] = useState<Language>(deviceLanguage);
  const [languagePickerOpen, setPickerOpen] = useState(false);
  const hydrated = useRef(false);

  // Restore the last chosen language; before this lands the app renders in the
  // device language, exactly like the pre-persistence behaviour did in French.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (isLanguage(stored)) setLanguage(stored);
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

  const chooseLanguage = useCallback((next: Language) => {
    setLanguage((prev) => {
      if (prev === next) return prev;
      track('language_toggled', { language: next });
      persistPushLang(next);
      // Passer du latin au cyrillique (ou l'inverse) change les polices à
      // charger. Au mieux elles s'enregistrent tout de suite ; au pire le moteur
      // natif garde les précédentes jusqu'au prochain lancement — d'où le
      // `catch` muet : c'est un confort, pas une condition de fonctionnement.
      if (!sameScript(prev, next)) Font.loadAsync(fontMapFor(next)).catch(() => {});
      return next;
    });
    setPickerOpen(false);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (fr: string, en: string, args?: readonly unknown[]) => tr(language, fr, en, args),
      chooseLanguage,
      openLanguagePicker: () => setPickerOpen(true),
      closeLanguagePicker: () => setPickerOpen(false),
      languagePickerOpen,
    }),
    [language, chooseLanguage, languagePickerOpen],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

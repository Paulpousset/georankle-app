/**
 * Mise à jour obligatoire. La version minimale par plateforme vit dans
 * public.app_min_version (réglée depuis le HQ, onglet Déploiements) ; si la
 * version installée est plus ancienne, l'app affiche un écran bloquant qui
 * renvoie vers le store (voir components/ForceUpdateGate.tsx).
 *
 * Fail open : hors-ligne, table absente ou version illisible → on laisse jouer.
 * Bloquer quelqu'un à tort coûte bien plus cher qu'une vieille version de plus.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { supabase } from './supabase';
import { STORE_URL_ANDROID, STORE_URL_IOS } from './links';

/** « 5.7.0 » → [5, 7, 0]. null si ce n'est pas une version lisible. */
export function parseVersion(v: string | null | undefined): number[] | null {
  const m = /^\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v ?? '');
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

/** < 0 si a est plus ancienne que b, 0 si égales, > 0 sinon. */
export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Vrai seulement si les deux versions sont lisibles et installed < min. */
export function isBelowMinimum(installed: string | null | undefined, min: string | null | undefined): boolean {
  const a = parseVersion(installed);
  const b = parseVersion(min);
  if (!a || !b) return false;
  return compareVersions(a, b) < 0;
}

/** Version du binaire installé (celle du store), pas celle d'une mise à jour OTA. */
export function installedVersion(): string | null {
  try {
    // Chargé à la demande : un binaire sans le module natif ne doit pas planter.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const app = require('expo-application') as typeof import('expo-application');
    if (app.nativeApplicationVersion) return app.nativeApplicationVersion;
  } catch {
    // module natif absent : repli ci-dessous
  }
  // runtimeVersion suit la version de l'app (policy appVersion) : une mise à
  // jour OTA ne tourne que sur un binaire de la même version.
  return Constants.expoConfig?.version ?? null;
}

export function storeUrl(): string {
  return Platform.OS === 'ios' ? STORE_URL_IOS : STORE_URL_ANDROID;
}

/** Faut-il bloquer l'app ? Web : jamais (toujours à jour). */
export async function isUpdateRequired(): Promise<boolean> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  try {
    const { data, error } = await supabase
      .from('app_min_version')
      .select('min_version')
      .eq('platform', Platform.OS)
      .maybeSingle();
    if (error || !data) return false;
    return isBelowMinimum(installedVersion(), data.min_version);
  } catch {
    return false;
  }
}

/**
 * Mise à jour OTA obligatoire. Par défaut, expo-updates télécharge une
 * nouvelle mise à jour pendant un lancement et ne l'applique qu'au suivant :
 * un joueur peut rester une session de plus sur l'ancien bundle. Ici, au
 * lancement, on vérifie s'il y en a une ; si oui, on la télécharge et on
 * recharge l'app tout de suite (écran « mise à jour » pendant ce temps).
 *
 * Fail open : hors-ligne, serveur lent ou erreur → on joue avec le bundle actuel.
 * Ne touche que les binaires de la même version (runtimeVersion = appVersion).
 *
 * Deux limites, qui expliquent les joueurs Android « en retard » :
 * - un binaire sans expo-updates (builds d'avant EAS Update) ou d'une autre
 *   version native ne reçoit jamais rien : seul le Play Store peut le rattraper ;
 * - sur Android l'app est surtout reprise depuis l'arrière-plan, rarement
 *   relancée à froid : on revérifie donc aussi au retour au premier plan après
 *   une longue absence (FOREGROUND_RECHECK_MS).
 */
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';

const CHECK_TIMEOUT_MS = 6000;
const FETCH_TIMEOUT_MS = 45000;
/** Absence minimale en arrière-plan avant de revérifier au retour. */
export const FOREGROUND_RECHECK_MS = 30 * 60 * 1000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

/** Une mise à jour plus récente attend-elle sur le serveur ? */
export async function isOtaUpdateAvailable(): Promise<boolean> {
  if (Platform.OS === 'web' || __DEV__ || !Updates.isEnabled) return false;
  try {
    const res = await withTimeout(Updates.checkForUpdateAsync(), CHECK_TIMEOUT_MS);
    return res?.isAvailable === true;
  } catch {
    return false;
  }
}

/** Télécharge puis applique la mise à jour. false si rien n'a pu être appliqué. */
export async function applyOtaUpdate(): Promise<boolean> {
  try {
    const res = await withTimeout(Updates.fetchUpdateAsync(), FETCH_TIMEOUT_MS);
    if (!res?.isNew) return false;
    await Updates.reloadAsync();
    return true;
  } catch {
    return false;
  }
}

/**
 * Bundle réellement exécuté, pour PostHog : `$app_version` (5.7.0) est le même
 * pour tous les binaires et toutes les mises à jour OTA, il ne dit donc pas qui
 * est en retard. `ota_date` (date de publication du bundle, ou du build pour le
 * bundle embarqué) et `ota_update_id` le disent.
 */
export function otaAnalyticsProps(): Record<string, string | boolean> {
  if (Platform.OS === 'web') return {};
  try {
    const props: Record<string, string | boolean> = {
      ota_enabled: Updates.isEnabled === true,
      ota_embedded: Updates.isEmbeddedLaunch === true,
    };
    if (Updates.updateId) props.ota_update_id = Updates.updateId;
    if (Updates.createdAt) props.ota_date = Updates.createdAt.toISOString();
    if (Updates.channel) props.ota_channel = Updates.channel;
    return props;
  } catch {
    return {};
  }
}

/**
 * « Défier un ami » à la fin d'une partie solo.
 *
 * Le partage n'existait qu'après le défi du jour. Or la plupart des parties
 * sont des parties solo ordinaires : chacune se terminait sur un écran sans
 * aucune sortie vers l'extérieur. Ce module compose un message court (mode,
 * score, appel à faire mieux) et un lien qui ouvre DIRECTEMENT le même mode
 * dans le navigateur (`/play?mode=…`, cf. src/lib/webEntry.ts) — sans
 * installation — en portant le code de parrainage du joueur quand il en a un,
 * pour que l'ami qui installe ensuite crédite les deux.
 *
 * Même règle que shareDaily.ts : la feuille de partage s'ouvre dans le tick du
 * tap (activation utilisateur sur le web mobile), le presse-papiers est le
 * repli, et l'événement reflète ce qui s'est vraiment passé.
 */
import { Platform, Share } from 'react-native';

import type { GameMode, Language } from '../types';
import { dailyModeLabel } from './daily';
import { SITE_URL } from './links';
import { getCachedReferralCode } from './shareDaily';
import { isBootableMode } from './webEntry';
import { track } from './analytics';
import { tr } from '../i18n';

export interface SoloShareInput {
  mode: GameMode;
  /** Résumé déjà formaté par l'écran : « 12/15 », « 87 % », « Série de 9 »… */
  summary: string;
  language: Language;
  /** Code de parrainage du joueur, null quand déconnecté. */
  refCode?: string | null;
}

/**
 * Lien d'entrée : le mode lui-même quand une URL sait y entrer, sinon le
 * défi du jour. `s=solo` marque l'origine quand il n'y a pas de code, pour que
 * les ouvertures restent mesurables (`campaign_link_opened` côté site).
 */
export function soloShareLink(mode: GameMode, refCode?: string | null): string {
  const params = new URLSearchParams();
  if (isBootableMode(mode)) params.set('mode', mode);
  if (refCode) params.set('code', refCode);
  else params.set('s', 'solo');
  return `${SITE_URL}/play?${params.toString()}`;
}

/**
 * Texte partagé, par ex. :
 *   🌍 GeoG — Drapeaux
 *   Score : 12/15
 *   Tu fais mieux ? 👇
 *   https://playgeog.com/play?mode=quiz-flag&code=A3F8C13E
 */
export function buildSoloShareMessage({ mode, summary, language, refCode }: SoloShareInput): string {
  const lines = [
    `🌍 GeoG — ${dailyModeLabel(mode, language)}`,
    tr(language, 'Score : {0}', 'Score: {0}', [summary]),
    tr(language, 'Tu fais mieux ? 👇', 'Can you beat it? 👇'),
    soloShareLink(mode, refCode),
  ];
  return lines.join('\n');
}

export type SoloShareOutcome = 'shared' | 'copied' | 'failed';

/**
 * Ouvre la feuille de partage. À appeler directement depuis le gestionnaire du
 * tap (aucun `await` avant), sinon le web mobile refuse la feuille.
 */
export function shareSoloResult(
  mode: GameMode,
  summary: string,
  language: Language,
  onCopied?: () => void,
): Promise<SoloShareOutcome> {
  const refCode = getCachedReferralCode();
  const message = buildSoloShareMessage({ mode, summary, language, refCode });
  const props = { mode, with_code: Boolean(refCode) };
  return Share.share({ message })
    .then((r) => {
      if (r && (r as { action?: string }).action === 'dismissedAction') {
        track('solo_share_failed', { ...props, reason: 'dismissed' });
        return 'failed' as const;
      }
      track('solo_shared', props);
      return 'shared' as const;
    })
    .catch(async () => {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(message);
          track('solo_shared', { ...props, via: 'clipboard' });
          onCopied?.();
          return 'copied' as const;
        } catch {
          /* fall through */
        }
      }
      track('solo_share_failed', { ...props, reason: 'unsupported' });
      return 'failed' as const;
    });
}

/**
 * Le bloc « pièces de fin de partie », en une ligne par mode.
 *
 * Six modes créditaient déjà des pièces en recopiant chacun le même bloc de 20
 * lignes (award + cap + file d'attente + toast) ; les six autres n'en
 * créditaient aucune — on pouvait finir un Globe Géo parfait et repartir les
 * mains vides. Ce hook porte le motif une fois pour toutes, pour que brancher
 * un mode sur l'économie tienne en un `award(...)`.
 *
 * Ne décide de rien : l'appelant garde la responsabilité de n'appeler `award`
 * que pour une vraie partie solo (pas de match, pas de quotidien, joueur
 * connecté) — c'est mode par mode que ça se joue.
 */
import { useCallback, useState } from 'react';

import { awardSoloCoins } from './coins';
import { earnsCoins, type SoloRunContext } from './soloResult';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../components/ToastProvider';
import { tr } from '../i18n';

export interface SoloCoinsState {
  /** Pièces créditées (null = pas encore attribuées / non concerné). */
  coinsEarned: number | null;
  coinsCapped: boolean;
  coinsSyncFailed: boolean;
  /**
   * Crédite la partie. `score` est le score normalisé 0–1000 du mode.
   * Sans effet en Entraînement (le contexte le dit), et jamais bloquant.
   */
  award: (gameMode: string, score: number, ctx?: SoloRunContext) => void;
}

export function useSoloCoins(): SoloCoinsState {
  const { language } = useLanguage();
  const toast = useToast();
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  const [coinsCapped, setCoinsCapped] = useState(false);
  const [coinsSyncFailed, setCoinsSyncFailed] = useState(false);

  const award = useCallback(
    (gameMode: string, score: number, ctx: SoloRunContext = {}) => {
      if (!earnsCoins(ctx)) return;
      void awardSoloCoins(gameMode, score).then((res) => {
        setCoinsEarned(res.coinsAwarded);
        setCoinsCapped(res.capped);
        setCoinsSyncFailed(!res.synced);
        if (!res.synced) {
          toast.info(
            tr(
              language,
              'Pièces non synchronisées — réessai à la reconnexion.',
              'Coins not synced — will retry when you reconnect.',
            ),
          );
        }
      });
    },
    [language, toast],
  );

  return { coinsEarned, coinsCapped, coinsSyncFailed, award };
}

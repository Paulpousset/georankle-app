/**
 * « Mon globe », sans réseau.
 *
 * Les écrans de début/fin de partie mettent le globe du joueur en vedette, et
 * doivent pouvoir le faire instantanément — attendre un aller-retour Supabase
 * afficherait un trou puis un pop. La préférence globe (globeSkin) garde déjà en
 * cache local l'`AvatarConfig` équipée ET le choix « globe en jeu » qui peut la
 * surcharger ; c'est exactement ce qu'il faut montrer.
 *
 * Renvoie la config à afficher : celle du joueur, avec la couche `globe`
 * remplacée par l'éventuel choix in-game, pour que le globe de la vitrine soit
 * bien celui avec lequel on vient de jouer.
 */
import { useEffect, useState } from 'react';

import { GLOBE_PARTS, loadGameGlobePref, partStyleKey } from './globeSkin';
import type { AvatarConfig } from '../types';

/** Applique le choix « globe en jeu » sur une config équipée. */
export function withGameGlobe(
  config: AvatarConfig | null,
  override: string | null,
): AvatarConfig | null {
  if (!config || !override) return config;
  const part = GLOBE_PARTS.find((p) => partStyleKey(p) === override);
  if (!part) return config;
  return {
    ...config,
    layers: { ...config.layers, globe: { id: part.id, tint: part.defaultTint ?? null } },
  };
}

export interface MyGameGlobe {
  /** La config à afficher, ou null tant que rien n'est connu (jamais bloquant). */
  config: AvatarConfig | null;
  ready: boolean;
}

export function useMyGameGlobe(): MyGameGlobe {
  const [state, setState] = useState<MyGameGlobe>({ config: null, ready: false });

  useEffect(() => {
    let alive = true;
    loadGameGlobePref()
      .then((pref) => {
        if (!alive) return;
        setState({
          config: withGameGlobe(pref.config, pref.override),
          ready: true,
        });
      })
      .catch(() => {
        if (alive) setState({ config: null, ready: true });
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

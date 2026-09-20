/**
 * Effets sonores du jeu.
 *
 * Un seul point d'entrée, `playSfx('correct')`, appelé à côté des vibreurs
 * (expo-haptics) aux moments qui comptent : réponse, décompte, verdict,
 * pièces, tampons, chocs de globes, achats. Tout le reste du jeu reste muet :
 * un son par toucher rendrait l'app bavarde.
 *
 * Choix :
 *  - Les fichiers sont EMBARQUÉS (assets/sounds, provenance et licences dans
 *    assets/sounds/README.md) : un effet doit partir à l'instant, sans réseau
 *    ni disque, contrairement aux phrases du mode Langues (languageAudio.ts).
 *  - Un lecteur par son, créé à la première lecture et gardé pour la vie de
 *    l'app : `seekTo(0)` + `play()` évite de reconstruire un lecteur natif à
 *    chaque bonne réponse.
 *  - Sur le web, expo-audio passe par un `HTMLAudioElement` sans attraper la
 *    promesse de `play()` : un lecteur lancé hors geste (décompte, verdict)
 *    provoquerait un rejet non géré à chaque autoplay refusé. On pilote donc
 *    l'élément audio directement, la promesse avalée.
 *  - iOS : `playsInSilentMode` (comme PhrasePlayer, sinon un iPhone en mode
 *    silencieux « n'a pas de son ») et `mixWithOthers` : le joueur qui écoute
 *    Spotify ne doit pas voir sa musique coupée par un « ding ».
 *  - Le réglage vit dans AsyncStorage, lu une fois au démarrage et gardé en
 *    mémoire : `playSfx` est synchrone et ne doit jamais attendre le disque.
 *
 * Jamais d'exception : un son qui échoue est un son qui manque, pas un écran
 * rouge. Chaque appel natif est enveloppé.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { log } from './log';

/** Les sons, un fichier chacun dans assets/sounds (sfx.test.ts le vérifie). */
export const SFX_NAMES = [
  'tap',
  'correct',
  'wrong',
  'tick',
  'go',
  'win',
  'lose',
  'draw',
  'coin',
  'star',
  'stamp',
  'impact',
  'shatter',
  'levelup',
  'leveldown',
  'found',
  'purchase',
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

/* eslint-disable @typescript-eslint/no-require-imports */
const SOURCES: Record<SfxName, number> = {
  tap: require('../../assets/sounds/tap.mp3'),
  correct: require('../../assets/sounds/correct.mp3'),
  wrong: require('../../assets/sounds/wrong.mp3'),
  tick: require('../../assets/sounds/tick.mp3'),
  go: require('../../assets/sounds/go.mp3'),
  win: require('../../assets/sounds/win.mp3'),
  lose: require('../../assets/sounds/lose.mp3'),
  draw: require('../../assets/sounds/draw.mp3'),
  coin: require('../../assets/sounds/coin.mp3'),
  star: require('../../assets/sounds/star.mp3'),
  stamp: require('../../assets/sounds/stamp.mp3'),
  impact: require('../../assets/sounds/impact.mp3'),
  shatter: require('../../assets/sounds/shatter.mp3'),
  levelup: require('../../assets/sounds/levelup.mp3'),
  leveldown: require('../../assets/sounds/leveldown.mp3'),
  found: require('../../assets/sounds/found.mp3'),
  purchase: require('../../assets/sounds/purchase.mp3'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Niveau de chaque son (0..1). Les fichiers sont tous normalisés à -16 LUFS ;
 * c'est ici que se règle la hiérarchie : les touchers et le décompte en
 * retrait, les verdicts devant.
 */
const VOLUME: Record<SfxName, number> = {
  tap: 0.35,
  correct: 0.8,
  wrong: 0.7,
  tick: 0.5,
  go: 0.8,
  win: 0.9,
  lose: 0.8,
  draw: 0.7,
  coin: 0.7,
  star: 0.75,
  stamp: 0.9,
  impact: 1,
  shatter: 0.85,
  levelup: 0.85,
  leveldown: 0.8,
  found: 0.8,
  purchase: 0.8,
};

const STORAGE_KEY = 'sfx:v1';

/** Un lecteur minimal, natif (expo-audio) ou web (HTMLAudioElement). */
interface Player {
  play(): void;
}

let enabled = true;
let ready: Promise<void> | null = null;
const players = new Map<SfxName, Player>();
const listeners = new Set<(on: boolean) => void>();

function makeNativePlayer(name: SfxName): Player {
  const player: AudioPlayer = createAudioPlayer(SOURCES[name]);
  player.volume = VOLUME[name];
  return {
    play() {
      // Un son relancé pendant qu'il joue repart du début (deux « tick » à une
      // seconde d'écart ne se chevauchent pas, un « coin » rapide non plus).
      player.seekTo(0).catch(() => {});
      player.play();
    },
  };
}

function makeWebPlayer(name: SfxName): Player | null {
  if (typeof Audio === 'undefined') return null;
  const uri = Asset.fromModule(SOURCES[name]).uri;
  const media = new Audio(uri);
  media.preload = 'auto';
  media.volume = VOLUME[name];
  return {
    play() {
      media.currentTime = 0;
      const p = media.play();
      // Autoplay refusé (aucun geste encore) : silence, pas de rejet non géré.
      if (p && typeof p.catch === 'function') p.catch(() => {});
    },
  };
}

function playerFor(name: SfxName): Player | null {
  const hit = players.get(name);
  if (hit) return hit;
  try {
    const made = Platform.OS === 'web' ? makeWebPlayer(name) : makeNativePlayer(name);
    if (made) players.set(name, made);
    return made;
  } catch (e) {
    log.warn('sfx: lecteur impossible', name, e);
    return null;
  }
}

/**
 * Lit le réglage et prépare la session audio. Appelé une fois au démarrage
 * (App.tsx) ; `playSfx` fonctionne même sans (réglage par défaut : activé).
 */
export function initSfx(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'off') enabled = false;
      } catch {
        // Stockage indisponible : on garde le défaut.
      }
      if (Platform.OS !== 'web') {
        await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(
          () => {},
        );
      }
    })();
  }
  return ready;
}

/** Crée les lecteurs des sons les plus fréquents pour que le premier parte sans latence. */
export function preloadSfx(names: readonly SfxName[] = ['tap', 'correct', 'wrong', 'tick']): void {
  if (!enabled) return;
  for (const n of names) playerFor(n);
}

/** Joue un son, tout de suite, sans jamais lever. Muet si le joueur a coupé les effets. */
export function playSfx(name: SfxName): void {
  if (!enabled) return;
  try {
    playerFor(name)?.play();
  } catch (e) {
    log.warn('sfx: lecture impossible', name, e);
  }
}

export function isSfxEnabled(): boolean {
  return enabled;
}

/** Change le réglage, le persiste, et prévient les écrans montés. */
export async function setSfxEnabled(on: boolean): Promise<void> {
  enabled = on;
  for (const l of listeners) l(on);
  // Un petit retour immédiat quand on rallume : le joueur entend ce qu'il vient d'activer.
  if (on) playSfx('tap');
  try {
    await AsyncStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Pas persisté : le réglage tient pour la session, c'est déjà ça.
  }
}

/** Le réglage sous forme de hook, pour l'interrupteur du profil. */
export function useSfxEnabled(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    // Le stockage peut ne pas avoir été lu au moment du premier rendu.
    initSfx().then(() => setOn(enabled));
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return [on, (v: boolean) => void setSfxEnabled(v)];
}

/** Remet le module à zéro entre deux tests. */
export function __resetSfxForTests(): void {
  enabled = true;
  ready = null;
  players.clear();
  listeners.clear();
}
